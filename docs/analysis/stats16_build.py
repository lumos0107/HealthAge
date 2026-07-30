"""16년(2009~2024, 1,596만 행) 전체 재분석 — 5개 축 한 번에.

축: ① 단일 집단군 13종 유병률  ② 조합 그룹 12종 O/E
    ③ 검사항목 17종 백분위(기존 peer_stats 검증)  ④ 계산기 파생 10종 백분위
    ⑤ 관리 참고군 5종 동반 분포

공식은 backend/app/analyzer/_internal/{user_group_analysis,calculators}.py 와
health_project/scripts/dev/A_calculator_percentiles.py 를 그대로 옮겼다.

⚠️ 원자료에는 약물 복용 정보가 없다 → 집단군 판정은 '수치 기준만'.
   (제품은 "수치 OR 약 복용"이라 제품 판정이 항상 모집단보다 넓게 잡힌다 — 결과에 명시할 것)
⚠️ 지질검사는 2018년부터 4년주기(측정율 100%→약 34%) → 지질 기반은 lipid_measured 한정 집계.
⚠️ 음주여부는 2019년 부분(64.7%)·2020년부터 전수 → 음주 관련은 2020~2024만.
"""
import polars as pl
from pathlib import Path

SRC = Path(r"C:/Users/seungjun/Documents/health_project/data/processed")
OUT = Path(__file__).parent / "stats16"
OUT.mkdir(parents=True, exist_ok=True)

C = dict(TG="트리글리세라이드", HDL="HDL콜레스테롤", LDL="LDL콜레스테롤", TC="총콜레스테롤",
         FBS="식전혈당(공복혈당)", BMI="BMI", WAIST="허리둘레", AST="혈청지오티(AST)",
         ALT="혈청지피티(ALT)", GGT="감마지티피", SBP="수축기혈압", DBP="이완기혈압",
         CR="혈청크레아티닌", HB="혈색소", UP="요단백")
KEY = ["기준년도", "성별코드", "연령대코드(5세단위)"]


def derived(df: pl.DataFrame) -> pl.DataFrame:
    """계산기 파생 10종 — A_calculator_percentiles.py 식 그대로."""
    p = pl.col
    pos = lambda c: p(C[c]).is_not_null() & (p(C[c]) > 0)
    tg, hdl, ldl, tc = p(C["TG"]), p(C["HDL"]), p(C["LDL"]), p(C["TC"])
    fbs, bmi, waist = p(C["FBS"]), p(C["BMI"]), p(C["WAIST"])
    ast, alt, sbp, dbp = p(C["AST"]), p(C["ALT"]), p(C["SBP"]), p(C["DBP"])
    male = p("성별코드") == 1
    lap_base = pl.when(male).then(65).otherwise(58)
    return df.with_columns([
        pl.when(pos("TG") & pos("FBS")).then((tg * fbs / 2).log()).alias("TyG"),
        pl.when(pos("FBS") & pos("TG") & pos("BMI") & pos("HDL") & (hdl > 1))
          .then((2 * fbs + tg).log() * bmi / hdl.log()).alias("METS_IR"),
        pl.when(pos("TG") & pos("HDL")).then(((tg / 88.57) / (hdl / 38.67)).log10()).alias("AIP"),
        pl.when(pos("TC") & pos("HDL") & (hdl < tc)).then(tc - hdl).alias("Non_HDL"),
        pl.when(pos("TC") & pos("HDL")).then(tc / hdl).alias("Castelli_I"),
        pl.when(pos("LDL") & pos("HDL")).then(ldl / hdl).alias("Castelli_II"),
        pl.when(pos("WAIST") & pos("TG") & (waist > lap_base))
          .then((waist - lap_base) * (tg / 88.57)).alias("LAP"),
        pl.when(pos("WAIST") & pos("BMI") & pos("TG") & pos("HDL") & male)
          .then((waist / (39.68 + 1.88 * bmi)) * ((tg / 88.57) / 1.03) * (1.31 / (hdl / 38.67)))
          .when(pos("WAIST") & pos("BMI") & pos("TG") & pos("HDL") & ~male)
          .then((waist / (36.58 + 1.89 * bmi)) * ((tg / 88.57) / 0.81) * (1.52 / (hdl / 38.67)))
          .alias("VAI"),
        pl.when(pos("AST") & pos("ALT")).then(ast / alt).alias("De_Ritis"),
        pl.when(pos("SBP") & pos("DBP") & (sbp >= dbp)).then((sbp + 2 * dbp) / 3).alias("MAP"),
    ])


# 단일 집단군 13종 — user_group_analysis.judge_groups()의 수치 조건만 옮김(약물 없음)
GROUPS = {
    "g_hypertension":       lambda: (pl.col(C["SBP"]) >= 140) | (pl.col(C["DBP"]) >= 90),
    "g_pre_hypertension":   lambda: (((pl.col(C["SBP"]) >= 130) & (pl.col(C["SBP"]) <= 139))
                                     | ((pl.col(C["DBP"]) >= 80) & (pl.col(C["DBP"]) <= 89)))
                                    & ~((pl.col(C["SBP"]) >= 140) | (pl.col(C["DBP"]) >= 90)),
    "g_diabetes":           lambda: pl.col(C["FBS"]) >= 126,
    "g_pre_diabetes":       lambda: (pl.col(C["FBS"]) >= 100) & (pl.col(C["FBS"]) <= 125),
    "g_metabolic_syndrome": lambda: pl.col("대사증후군"),
    "g_obesity":            lambda: pl.col(C["BMI"]) >= 25,
    # HDL 컷오프가 성별로 다르다(남<40 / 여<50) — 성별 분기 필수
    "g_dyslipidemia":       lambda: (pl.col(C["LDL"]) >= 160)
                                    | ((pl.col("성별코드") == 1) & (pl.col(C["HDL"]) < 40))
                                    | ((pl.col("성별코드") == 2) & (pl.col(C["HDL"]) < 50))
                                    | (pl.col(C["TG"]) >= 200),
    "g_fatty_liver_suspect": lambda: (pl.col(C["ALT"]) > 40) | (pl.col(C["GGT"]) > 75),
    "g_smoker_current":     lambda: pl.col("흡연상태") == 3,
    "g_smoker_former":      lambda: pl.col("흡연상태") == 2,
    "g_non_smoker":         lambda: pl.col("흡연상태") == 1,
    "g_drinker":            lambda: pl.col("음주여부") == 1,
    "g_non_drinker":        lambda: pl.col("음주여부") == 0,
}
# 지질 측정자 한정으로만 의미 있는 그룹(2018+ 미측정자는 판정 불가)
LIPID_GROUPS = {"g_dyslipidemia", "g_metabolic_syndrome"}
DRINK_GROUPS = {"g_drinker", "g_non_drinker"}

# 조합 그룹 12종 — combo_group_analysis.COMBO_DEFINITIONS 그대로
COMBOS = {
    "당뇨+고혈압": ["g_diabetes", "g_hypertension"],
    "고혈압+이상지질혈증": ["g_hypertension", "g_dyslipidemia"],
    "당뇨+이상지질혈증": ["g_diabetes", "g_dyslipidemia"],
    "대사증후군+흡연": ["g_metabolic_syndrome", "g_smoker_current"],
    "음주+지방간의심": ["g_drinker", "g_fatty_liver_suspect"],
    "비만+지방간의심": ["g_obesity", "g_fatty_liver_suspect"],
    "당뇨+지방간의심": ["g_diabetes", "g_fatty_liver_suspect"],
    "비만+당뇨전단계": ["g_obesity", "g_pre_diabetes"],
    "대사증후군+비만": ["g_metabolic_syndrome", "g_obesity"],
    "흡연+음주+비만": ["g_smoker_current", "g_drinker", "g_obesity"],
    "당뇨+고혈압+이상지질혈증": ["g_diabetes", "g_hypertension", "g_dyslipidemia"],
    "비만+이상지질혈증+지방간의심": ["g_obesity", "g_dyslipidemia", "g_fatty_liver_suspect"],
}

# 관리 참고군 5종 — frontend data.ts groupDefinitions의 keys를 원자료 컬럼 조건으로 옮김.
# "그 참고군에서 기준을 벗어난 항목이 몇 개인가"의 분포를 본다.
CARE_GROUPS = {
    "대사 관리 참고군": [
        ("허리둘레", lambda: ((pl.col("성별코드") == 1) & (pl.col(C["WAIST"]) >= 90))
                              | ((pl.col("성별코드") == 2) & (pl.col(C["WAIST"]) >= 85))),
        ("공복혈당", lambda: pl.col(C["FBS"]) >= 100),
        ("중성지방", lambda: pl.col(C["TG"]) >= 150),
        ("HDL", lambda: ((pl.col("성별코드") == 1) & (pl.col(C["HDL"]) < 40))
                         | ((pl.col("성별코드") == 2) & (pl.col(C["HDL"]) < 50))),
        ("수축기혈압", lambda: pl.col(C["SBP"]) >= 130),
    ],
    "혈압 관리 참고군": [
        ("수축기혈압", lambda: pl.col(C["SBP"]) >= 130),
        ("이완기혈압", lambda: pl.col(C["DBP"]) >= 85),
    ],
    "지질 관리 참고군": [
        ("LDL", lambda: pl.col(C["LDL"]) >= 130),
        ("HDL", lambda: ((pl.col("성별코드") == 1) & (pl.col(C["HDL"]) < 40))
                         | ((pl.col("성별코드") == 2) & (pl.col(C["HDL"]) < 50))),
        ("중성지방", lambda: pl.col(C["TG"]) >= 150),
        ("총콜레스테롤", lambda: pl.col(C["TC"]) >= 200),
    ],
    "간 기능 관찰군": [
        ("AST", lambda: pl.col(C["AST"]) > 40),
        ("ALT", lambda: pl.col(C["ALT"]) > 40),
        ("감마-GTP", lambda: pl.col(C["GGT"]) > 75),
    ],
    "신장 기능 관찰군": [
        ("크레아티닌", lambda: pl.col(C["CR"]) > 1.5),
        ("요단백", lambda: pl.col(C["UP"]) >= 3),
    ],
}
CARE_LIPID = {"대사 관리 참고군", "지질 관리 참고군"}

INDICATORS = ["TyG", "METS_IR", "AIP", "Non_HDL", "Castelli_I", "Castelli_II",
              "LAP", "VAI", "De_Ritis", "MAP"]
IND_LIPID = {"TyG", "METS_IR", "AIP", "Non_HDL", "Castelli_I", "Castelli_II", "LAP", "VAI"}
QUANTILES = [0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95]

single_rows, combo_rows, calc_rows, care_rows = [], [], [], []

for year in range(2009, 2025):
    f = SRC / f"{year}.parquet"
    df = pl.read_parquet(f)
    df = derived(df)
    lipid_ok = pl.col("지질검사_측정여부")

    # 그룹 플래그 부착. 지질/음주 제약 구간은 null로 둬서 집계에서 자동 제외된다.
    flags = []
    for g, expr in GROUPS.items():
        e = expr()
        if g in LIPID_GROUPS:
            e = pl.when(lipid_ok).then(e).otherwise(None)
        if g in DRINK_GROUPS and year < 2020:
            e = pl.lit(None, dtype=pl.Boolean)
        flags.append(e.alias(g))
    df = df.with_columns(flags)

    # ① 단일 집단군 유병률 (year × sex × age)
    agg = []
    for g in GROUPS:
        agg += [pl.col(g).sum().alias(f"{g}__n"), pl.col(g).drop_nulls().len().alias(f"{g}__d")]
    s = df.group_by(KEY).agg(agg).sort(KEY)
    for g in GROUPS:
        single_rows.append(s.select([
            pl.col("기준년도").alias("year"), pl.col("성별코드").alias("sex"),
            pl.col("연령대코드(5세단위)").alias("age_code"),
            pl.lit(g).alias("group"),
            pl.col(f"{g}__n").cast(pl.Int64).alias("n_yes"),
            pl.col(f"{g}__d").cast(pl.Int64).alias("n_eval"),
        ]))

    # ② 조합 그룹 O/E (연도 전체 — 제품이 쓰는 단위와 동일)
    for name, parts in COMBOS.items():
        sub = df.select(parts).drop_nulls()
        d = sub.height
        if d == 0:
            continue
        both = sub.select(pl.all_horizontal([pl.col(p) for p in parts]).alias("x"))["x"].sum()
        marg = [sub[p].sum() / d for p in parts]
        exp = d
        for m in marg:
            exp *= m
        combo_rows.append({
            "year": year, "combo": name, "n_eval": d, "n_in_combo": int(both),
            "pct_of_total": round(both / d * 100, 3),
            "expected_if_independent": round(exp, 1),
            "observed_to_expected": round(both / exp, 3) if exp > 0 else None,
        })

    # ④ 계산기 파생 백분위 (year × sex × age)
    for ind in INDICATORS:
        base = df.filter(lipid_ok) if ind in IND_LIPID else df
        # 원본 컬럼 dtype이 해마다 Float32/64로 갈려 연도 concat이 깨진다 → 전부 Float64로 고정.
        a = [pl.col(ind).drop_nulls().len().alias("n"),
             pl.col(ind).mean().cast(pl.Float64).alias("mean"),
             pl.col(ind).std().cast(pl.Float64).alias("std")]
        a += [pl.col(ind).quantile(q).cast(pl.Float64).alias(f"p{int(q*100)}") for q in QUANTILES]
        calc_rows.append(base.group_by(KEY).agg(a).with_columns(pl.lit(ind).alias("indicator")))

    # ⑤ 관리 참고군 — 그 참고군에서 벗어난 항목 수 분포
    for cname, items in CARE_GROUPS.items():
        base = df.filter(lipid_ok) if cname in CARE_LIPID else df
        hit = pl.sum_horizontal([e().fill_null(False).cast(pl.Int32) for _, e in items])
        evaluable = pl.all_horizontal([e().is_not_null() for _, e in items])
        sub = base.with_columns([hit.alias("hits"), evaluable.alias("ok")]).filter(pl.col("ok"))
        if sub.height == 0:
            continue
        g = sub.group_by(KEY + ["hits"]).agg(pl.len().alias("n"))
        care_rows.append(g.with_columns(pl.lit(cname).alias("care_group")))

    print(f"{year} done  rows={df.height:,}")

pl.concat(single_rows).write_parquet(OUT / "single_groups_16yr.parquet")
pl.DataFrame(combo_rows).write_parquet(OUT / "combo_groups_16yr.parquet")
pl.concat(calc_rows).write_parquet(OUT / "calculator_percentiles_16yr.parquet")
pl.concat(care_rows).write_parquet(OUT / "care_groups_16yr.parquet")
print("\nwritten to", OUT)
for p in sorted(OUT.glob("*.parquet")):
    print(" ", p.name, f"{p.stat().st_size/1024:.0f} KB")
