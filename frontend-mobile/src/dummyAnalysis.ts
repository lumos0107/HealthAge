// 자동 생성(백엔드 실산출) — root 데모 계정용 연도별 풀 분석 더미.
// 홍길동(1968년생 남, 2010년 42세 → 2024년 56세)의 8개 검진 회차를 각각 백엔드
// run_full_pipeline() + _inject_group_extras() 에 넣어 나온 combo_analysis·recommendations,
// 그리고 app/renal/gfr.analyze_renal() 이 그 해 크레아티닌·나이로 산출한 eGFR을 그대로 담았다.
// 지어낸 값이 하나도 없다 — 재현: tools/gen_demo_analysis.py → tools/gen_dummy_analysis_ts.py.
//
// ⚠️ 연도별로 따로 담는 이유: 한 벌을 전 연도에 복사하면 "연도를 바꿔도 아래가 안 바뀌는"
//    상태가 되어, 2f39f72에서 고친 바로 그 버그를 데모에서 재현하게 된다.
//
// 회차별 흐름(전부 실산출) — 만 40세부터 9회차. 2020년에 바닥을 찍고 돌아선다:
//   연도  나이  점수  대사증후군  조합  ASCVD 10년     eGFR      지방간 유형
//   2008   40    94     0/5        0    2.9% 낮은 편  114.7 G1
//   2010   42    88     0/5        0    3.8% 낮은 편  112.5 G1
//   2012   44    82     0/5        0    4.8% 낮은 편  110.7 G1
//   2014   46    64     1/5        0    6.6% 경계     108.5 G1
//   2016   48    52     3/5        1    9.0% 중간     106.1 G1
//   2018   50    40     4/5        4   11.0% 중간     100.0 G1
//   2020   52   *22*    5/5        7   15.9% 중간      85.4 G2   MetALD 의심  ← 바닥
//   2022   54    34     5/5        4   15.3% 중간      87.3 G2
//   2024   56    40     4/5        4   15.7% 중간      89.4 G2
//
// 만 40세부터 국가 일반검진 대상이라 2008년이 첫 회차다. 그 해가 100점이 아닌 것은
// 일부러다 — 40세에 감점이 하나도 없는 검진표는 드물다. 총콜레스테롤 201처럼
// 하나씩 걸치는 쪽이 실제에 가깝다.
//
// ⚠️ ASCVD는 회복 구간에서도 15%대에 머문다(15.9 → 15.3 → 15.7). 수치는 좋아졌지만
//    나이가 네 살 늘어 그만큼을 상쇄했기 때문이다. 이걸 억지로 낮추지 않는다 —
//    나이는 되돌릴 수 없다는 사실을 화면이 그대로 말하는 편이 맞다.
//    반대로 eGFR은 85.4 → 89.4로, FLI는 78 → 55로 뚜렷하게 돌아온다.
// 2020년에만 뜨던 「지방간 유형(MetALD 의심)」 카드는 2022년부터 사라진다 —
// 판정이 사라진 것이지 카드를 지운 것이 아니다.
import type { RealComboAnalysis, RealEgfr, RealRecommendations, RealSimulation, RealTimeseries, SimulateChanges } from './health';
import type { Report } from './data';

/** 신장 기능 — 연도별. 그 해 혈청 크레아티닌과 그 해 나이로 CKD-EPI 2021을 다시 돌린 값이다.
 *  나이가 들며 같은 크레아티닌이어도 eGFR이 내려가고, 2024년에 G1 → G2로 넘어간다. */
export const dummyEgfrByYear: Record<number, RealEgfr> = {
  2008: ({
 "egfr": 114.7,
 "stage": "G1",
 "label": "정상 또는 높음",
 "description": "사구체여과율 정상 범위",
 "severity": "normal",
 "crcl": 106.1,
 "crcl_label": "정상 범위",
 "crcl_note": "일반적으로 용량 조절이 필요하지 않은 범위입니다.",
 "unit": "mL/min/1.73㎡",
 "method": "CKD-EPI 2021 (크레아티닌, 인종 항 제거)",
 "crcl_method": "Cockcroft-Gault"
}) as unknown as RealEgfr,
  2010: ({
 "egfr": 112.5,
 "stage": "G1",
 "label": "정상 또는 높음",
 "description": "사구체여과율 정상 범위",
 "severity": "normal",
 "crcl": 103.2,
 "crcl_label": "정상 범위",
 "crcl_note": "일반적으로 용량 조절이 필요하지 않은 범위입니다.",
 "unit": "mL/min/1.73㎡",
 "method": "CKD-EPI 2021 (크레아티닌, 인종 항 제거)",
 "crcl_method": "Cockcroft-Gault"
}) as unknown as RealEgfr,
  2012: ({
 "egfr": 110.7,
 "stage": "G1",
 "label": "정상 또는 높음",
 "description": "사구체여과율 정상 범위",
 "severity": "normal",
 "crcl": 101.2,
 "crcl_label": "정상 범위",
 "crcl_note": "일반적으로 용량 조절이 필요하지 않은 범위입니다.",
 "unit": "mL/min/1.73㎡",
 "method": "CKD-EPI 2021 (크레아티닌, 인종 항 제거)",
 "crcl_method": "Cockcroft-Gault"
}) as unknown as RealEgfr,
  2014: ({
 "egfr": 108.5,
 "stage": "G1",
 "label": "정상 또는 높음",
 "description": "사구체여과율 정상 범위",
 "severity": "normal",
 "crcl": 99.8,
 "crcl_label": "정상 범위",
 "crcl_note": "일반적으로 용량 조절이 필요하지 않은 범위입니다.",
 "unit": "mL/min/1.73㎡",
 "method": "CKD-EPI 2021 (크레아티닌, 인종 항 제거)",
 "crcl_method": "Cockcroft-Gault"
}) as unknown as RealEgfr,
  2016: ({
 "egfr": 106.1,
 "stage": "G1",
 "label": "정상 또는 높음",
 "description": "사구체여과율 정상 범위",
 "severity": "normal",
 "crcl": 97.6,
 "crcl_label": "정상 범위",
 "crcl_note": "일반적으로 용량 조절이 필요하지 않은 범위입니다.",
 "unit": "mL/min/1.73㎡",
 "method": "CKD-EPI 2021 (크레아티닌, 인종 항 제거)",
 "crcl_method": "Cockcroft-Gault"
}) as unknown as RealEgfr,
  2018: ({
 "egfr": 100.0,
 "stage": "G1",
 "label": "정상 또는 높음",
 "description": "사구체여과율 정상 범위",
 "severity": "normal",
 "crcl": 94.0,
 "crcl_label": "정상 범위",
 "crcl_note": "일반적으로 용량 조절이 필요하지 않은 범위입니다.",
 "unit": "mL/min/1.73㎡",
 "method": "CKD-EPI 2021 (크레아티닌, 인종 항 제거)",
 "crcl_method": "Cockcroft-Gault"
}) as unknown as RealEgfr,
  2020: ({
 "egfr": 85.4,
 "stage": "G2",
 "label": "경도 감소",
 "description": "경미한 신기능 저하 (단독으로는 정상 범주)",
 "severity": "caution",
 "crcl": 86.5,
 "crcl_label": "정상 범위",
 "crcl_note": "일반적으로 용량 조절이 필요하지 않은 범위입니다.",
 "unit": "mL/min/1.73㎡",
 "method": "CKD-EPI 2021 (크레아티닌, 인종 항 제거)",
 "crcl_method": "Cockcroft-Gault"
}) as unknown as RealEgfr,
  2022: ({
 "egfr": 87.3,
 "stage": "G2",
 "label": "경도 감소",
 "description": "경미한 신기능 저하 (단독으로는 정상 범주)",
 "severity": "caution",
 "crcl": 83.5,
 "crcl_label": "정상 범위",
 "crcl_note": "일반적으로 용량 조절이 필요하지 않은 범위입니다.",
 "unit": "mL/min/1.73㎡",
 "method": "CKD-EPI 2021 (크레아티닌, 인종 항 제거)",
 "crcl_method": "Cockcroft-Gault"
}) as unknown as RealEgfr,
  2024: ({
 "egfr": 89.4,
 "stage": "G2",
 "label": "경도 감소",
 "description": "경미한 신기능 저하 (단독으로는 정상 범주)",
 "severity": "caution",
 "crcl": 81.8,
 "crcl_label": "정상 범위",
 "crcl_note": "일반적으로 용량 조절이 필요하지 않은 범위입니다.",
 "unit": "mL/min/1.73㎡",
 "method": "CKD-EPI 2021 (크레아티닌, 인종 항 제거)",
 "crcl_method": "Cockcroft-Gault"
}) as unknown as RealEgfr,
};


/** 연도별 조합·집단군·계산기·모집단 통계. 그 해 수치로 백엔드가 실제 판정한 결과다. */
export const dummyComboAnalysisByYear: Record<number, RealComboAnalysis> = {
  2008: ({
 "combo_groups": {
  "matched": [],
  "not_evaluable": [],
  "matched_count": 0,
  "ascvd_risk_combos": [],
  "highest_synergy": null,
  "population": {
   "year": 2024,
   "total_n": 994018,
   "source": "국민건강보험공단 표본 (최신 연도)"
  },
  "caveats": [
   "모집단 통계는 공단 원자료 기준이라 약물 복용 정보가 없습니다. 서비스 판정은 '수치 또는 해당 약물 복용'을 함께 보므로, 약을 드시는 분은 모집단 기준보다 넓게 잡힐 수 있습니다.",
   "모집단의 지방간 의심 기준은 GGT>60이고 서비스 기준은 GGT>75입니다 (약대 자문 반영). 두 기준이 달라 비교 시 참고가 필요합니다.",
   "O/E비는 '함께 나타나는 경향'을 뜻하며 인과관계나 개인의 위험도 예측이 아닙니다."
  ]
 },
 "fatty_liver": {
  "applicable": false,
  "type": null,
  "provisional": false,
  "basis": "지방간 의심에 해당하지 않아 유형 구분 대상이 아닙니다.",
  "cardiometabolic_factors": [],
  "indices": {
   "fli": {
    "value": 20.3,
    "level": "low",
    "interpretation": "지방간 가능성 낮음",

    "plain": "지방간일 가능성은 낮아요",
    "cutoffs": "<30 낮음 / 30~59 중간 / ≥60 높음",
    "formula": "Fatty Liver Index (Bedogni 2006)"
   },
   "hsi": {
    "value": 30.9,
    "level": "intermediate",
    "interpretation": "판단 보류 구간 (중간)",

    "plain": "지방간인지 아닌지 가리기 어려운 중간이에요",
    "cutoffs": "<30 낮음 / 30~36 중간 / >36 시사",
    "formula": "Hepatic Steatosis Index (Lee 2010, 한국인 기반)"
   },
   "unavailable": [],
   "disclaimer": "FLI·HSI는 검진 수치로 지방간 가능성을 가늠하는 선별용 참고 지표입니다. 초음파 등 영상 검사에 의한 진단을 대체하지 않습니다."
  }
 },
 "disclaimer": "조합 그룹 결과는 국민건강보험공단 표본과의 통계 비교이며, 진단이 아닙니다. 판단은 의료진과 상담하세요.",
 "single_groups": [
  {
   "key": "g_hypertension",
   "name": "고혈압",
   "category": "임상",
   "desc": "수축기 ≥140 또는 이완기 ≥90 또는 고혈압약 복용",
   "applies": false
  },
  {
   "key": "g_pre_hypertension",
   "name": "고혈압 전단계",
   "category": "임상",
   "desc": "수축기 130-139 또는 이완기 80-89",
   "applies": false
  },
  {
   "key": "g_diabetes",
   "name": "당뇨",
   "category": "임상",
   "desc": "공복혈당 ≥126 또는 당뇨약 복용",
   "applies": false
  },
  {
   "key": "g_pre_diabetes",
   "name": "당뇨 전단계",
   "category": "임상",
   "desc": "공복혈당 100-125",
   "applies": false
  },
  {
   "key": "g_metabolic_syndrome",
   "name": "대사증후군",
   "category": "임상",
   "desc": "5개 기준 중 3개 이상 (약물 복용 포함)",
   "applies": false
  },
  {
   "key": "g_obesity",
   "name": "비만",
   "category": "임상",
   "desc": "BMI ≥25",
   "applies": false
  },
  {
   "key": "g_dyslipidemia",
   "name": "이상지질혈증",
   "category": "임상",
   "desc": "LDL≥160 또는 HDL미달 또는 TG≥200 또는 이상지질혈증약 복용",
   "applies": false
  },
  {
   "key": "g_fatty_liver_suspect",
   "name": "지방간 의심",
   "category": "임상",
   "desc": "ALT>40 또는 GGT>75",
   "applies": false
  },
  {
   "key": "g_smoker_current",
   "name": "현재 흡연자",
   "category": "생활습관",
   "desc": null,
   "applies": true
  },
  {
   "key": "g_smoker_former",
   "name": "과거 흡연자",
   "category": "생활습관",
   "desc": null,
   "applies": false
  },
  {
   "key": "g_non_smoker",
   "name": "비흡연자",
   "category": "생활습관",
   "desc": null,
   "applies": false
  },
  {
   "key": "g_drinker",
   "name": "음주자",
   "category": "생활습관",
   "desc": null,
   "applies": true
  },
  {
   "key": "g_non_drinker",
   "name": "비음주자",
   "category": "생활습관",
   "desc": null,
   "applies": false
  }
 ],
 "ascvd_simulation": {
  "available": true,
  "is_simulation": true,
  "risk_percent": 2.9,
  "risk_level": "low",
  "risk_label": "낮은 편",
  "inputs": {
   "age": 40,
   "gender": "남",
   "total_cholesterol": 201.0,
   "hdl": 54.0,
   "sbp": 117.0,
   "smoker": true,
   "diabetes": false,
   "on_bp_medication": false
  },
  "scenarios": [
   {
    "name": "금연했다면",
    "risk_percent": 0.9,
    "delta": -2.0
   },
   {
    "name": "HDL이 60이라면",
    "risk_percent": 2.5,
    "delta": -0.4
   }
  ],
  "method": "Pooled Cohort Equations (2013 ACC/AHA)",
  "limitations": [
   "이 식은 미국 코호트에서 만들어졌으며 한국인에서는 위험도를 실제보다 높게 추정하는 경향이 보고되었습니다.",
   "국내 진료지침은 이 식을 한국인에게 그대로 적용하도록 권고하지 않습니다.",
   "따라서 표시된 %는 진단이나 예측이 아니라, 수치가 달라질 때 위험이 어느 방향으로 얼마나 움직이는지 보기 위한 참고 시뮬레이션입니다.",
   "가족력·병력이 반영되지 않아 실제 위험과 다를 수 있습니다."
  ],
  "how_to_read": "절대적인 % 값보다, 아래 '무엇을 바꾸면' 항목의 변화 폭을 참고하세요."
 },
 "calculators": {
  "items": [
   {
    "key": "non_hdl_c",
    "title": "Non-HDL 콜레스테롤",
    "category": "lipid",
    "value": 147.0,
    "level": "intermediate",
    "interpretation": "적정 상회",
    "inputs": {
     "total_cholesterol": 201.0,
     "hdl": 54.0
    },
    "cutoffs": "<130 적정 / 130~159 적정상회 / 160~189 경계 / 190~219 높음 / ≥220 매우높음 (NCEP ATP III)",
    "note": "개인 목표치는 위험군에 따라 다릅니다(비-HDL 목표 = LDL 목표 + 30).",
    "formula": "Non-HDL-C = 총콜레스테롤 − HDL",
    "peer_label": "한국인 40세 남성 중 하위 47%",
    "percentile": 46.9,
    "peer_n": 70805,
    "peer_year": 2017
   },
   {
    "key": "castelli_1",
    "title": "Castelli 지수 I",
    "category": "lipid",
    "value": 3.72,
    "level": "low",
    "interpretation": "적정",
    "cutoffs": "<4.0 적정 / 4.0~5.0 경계 / >5.0 높음 (참고, 성별·문헌별 상이)",
    "formula": "Castelli-I = 총콜레스테롤 / HDL",
    "peer_label": "한국인 40세 남성 중 하위 41%",
    "percentile": 41,
    "peer_n": 70806,
    "peer_year": 2017
   },
   {
    "key": "castelli_2",
    "title": "Castelli 지수 II",
    "category": "lipid",
    "value": 2.28,
    "level": "low",
    "interpretation": "적정",
    "cutoffs": "<3.0 적정 / 3.0~3.5 경계 / >3.5 높음 (참고)",
    "formula": "Castelli-II = LDL / HDL",
    "peer_label": "한국인 40세 남성 중 하위 47%",
    "percentile": 47.4,
    "peer_n": 70461,
    "peer_year": 2017
   },
   {
    "key": "aip",
    "title": "AIP 죽상형성지수",
    "category": "lipid",
    "value": 0.008,
    "level": "low",
    "interpretation": "저위험",
    "cutoffs": "<0.11 저위험 / 0.11~0.21 중간 / >0.21 고위험 (Dobiásová)",
    "formula": "AIP = log10(TG/HDL), mmol/L 변환 적용",
    "percentile": 41.7,
    "peer_label": "한국인 40세 남성 중 하위 42%",
    "peer_n": 70759,
    "peer_year": 2017
   },
   {
    "key": "tyg",
    "title": "TyG 지수",
    "category": "insulin",
    "value": 8.64,
    "level": "intermediate",
    "interpretation": "경계 (참고 구간)",
    "inputs": {
     "tg": 126.0,
     "fbs": 90.0
    },
    "cutoffs": "<8.5 낮음 / 8.5~8.9 경계 / ≥9.0 높음 (연구별 상이, 참고용)",
    "note": "국제 단일 진단 컷오프는 미확립이나, 한국 성인 대사증후군 스크리닝용으로 ~8.8이 반복 검증됨(Shin 2019 등). 한국인 국가검진 55세 남성 중앙값도 8.80.",
    "formula": "TyG = ln(TG × 공복혈당 / 2)  [Simental-Mendía 2008]",
    "percentile": 38.9,
    "peer_label": "한국인 40세 남성 중 하위 39%",
    "peer_n": 70769,
    "peer_year": 2017
   },
   {
    "key": "mets_ir",
    "title": "METS-IR",
    "category": "insulin",
    "value": 31.85,
    "level": "low",
    "interpretation": "참고: 인슐린저항성 낮은 편",
    "cutoffs": "참고선 ~50 (검증된 단일 컷오프 없음, 연구별 상이)",
    "formula": "METS-IR = ln(2·FPG+TG)·BMI / ln(HDL)",
    "note": "인슐린저항성 대리지표. 진단 컷오프 미확립 — 추이·참고용.",
    "percentile": 22.1,
    "peer_label": "한국인 40세 남성 중 하위 22%",
    "peer_n": 70759,
    "peer_year": 2017
   },
   {
    "key": "lap",
    "title": "LAP 지질축적산물",
    "category": "adiposity",
    "value": 21.3,
    "level": "info",
    "interpretation": "지질축적 정도(참고)",
    "cutoffs": "단일 컷오프 없음 — 집단 내 사분위로 해석",
    "formula": "LAP = (허리−65)×TG(mmol/L)",
    "note": "내장지방·대사위험 대리지표. 진단 컷오프 미확립.",
    "percentile": 32.1,
    "peer_label": "한국인 40세 남성 중 하위 32%",
    "peer_n": 70448,
    "peer_year": 2017
   },
   {
    "key": "vai",
    "title": "VAI 내장지방지수",
    "category": "adiposity",
    "value": 1.27,
    "level": "info",
    "interpretation": "내장지방 기능이상 정도(참고)",
    "cutoffs": "정상체중 건강군 ≈1.0 기준 (연령별 컷오프 필요)",
    "formula": "VAI = 성별식(WC·BMI·TG·HDL), mmol/L 변환 적용",
    "note": "내장지방 기능이상 대리지표. 연령의존 컷오프 — 참고용.",
    "percentile": 40.2,
    "peer_label": "한국인 40세 남성 중 하위 40%",
    "peer_n": 70757,
    "peer_year": 2017
   },
   {
    "key": "de_ritis",
    "title": "De Ritis 비 (AST/ALT)",
    "category": "liver",
    "value": 0.92,
    "level": "low",
    "interpretation": "비알코올성/급성 간질환 시사 (<1)",
    "cutoffs": "<1 비알코올/급성 / 1~2 중간 / >2 알코올성·진행 시사",
    "formula": "De Ritis = AST / ALT",
    "peer_label": "한국인 40세 남성 중 하위 31%",
    "percentile": 30.9,
    "peer_n": 39007,
    "peer_year": 2009
   },
   {
    "key": "alt_ggt",
    "title": "ALT/GGT 비",
    "category": "liver",
    "value": 0.8,
    "level": "info",
    "interpretation": "알코올성 간질환 쪽 시사 (<1)",
    "cutoffs": "<1 알코올성 쪽 / ≥1 비알코올성 쪽 (유형 감별 보조, 중증도 아님)",
    "formula": "ALT / GGT",
    "note": "유형을 가늠하는 보조 지표로, 진단이 아닙니다. 음주량(주당 순알코올)을 함께 보면 정확도가 올라갑니다."
   },
   {
    "key": "bard",
    "title": "BARD 점수",
    "category": "liver",
    "value": 2,
    "level": "high",
    "interpretation": "진행 간섬유화 배제 불가 (추가 평가 권장)",

    "plain": "간이 굳고 있는지 더 확인해 볼 필요가 있어요",
    "components": [
     "AST/ALT≥0.8 (+2)"
    ],
    "inputs": {
     "bmi": 22.2,
     "ast": 22.0,
     "alt": 24.0,
     "ast_alt_ratio": 0.92,
     "diabetes": false
    },
    "cutoffs": "0~1 배제 쪽 / 2~4 배제 불가",
    "formula": "BARD = BMI≥28(1) + AST/ALT≥0.8(2) + 당뇨(1)  [Harrison 2008]"
   },
   {
    "key": "map",
    "title": "평균동맥압 (MAP)",
    "category": "bp",
    "value": 88.3,
    "level": "low",
    "interpretation": "정상 범위",
    "cutoffs": "70~100 정상 / <70 낮음 / >110 높음 (mmHg)",
    "formula": "MAP = (SBP + 2×DBP) / 3",
    "peer_label": "한국인 40세 남성 중 하위 26%",
    "percentile": 26,
    "peer_n": 39007,
    "peer_year": 2009
   },
   {
    "key": "prevent",
    "title": "AHA PREVENT (10·30년)",
    "category": "cardiovascular",
    "value": 1.9,
    "unit": "%",
    "level": "low",
    "interpretation": "10년 심혈관(CVD) 위험 낮음",
    "value_30yr": 11.9,
    "cutoffs": "<5 낮음 / 5~7.5 경계 / 7.5~20 중간 / ≥20 높음",
    "formula": "AHA PREVENT Total CVD (Khan 2024, race-free·eGFR 반영)",
    "note": "30년 위험 11.9%. PCE 후속 모델(30~79세). 참고용, 진단 아님."
   },
   {
    "key": "framingham",
    "title": "Framingham Hard CHD (10년)",
    "category": "cardiovascular",
    "value": 5.4,
    "unit": "%",
    "level": "intermediate",
    "interpretation": "10년 관상동맥질환 위험 경계",
    "cutoffs": "<5 낮음 / 5~7.5 경계 / 7.5~20 중간 / ≥20 높음",
    "formula": "Framingham Hard CHD 10년 (Wilson 1998, MDCalc calc/38)",
    "note": "당뇨 미반영·서구 코호트 기반 참고용. 진단 아님."
   },
   {
    "key": "score2",
    "title": "SCORE2 / OP (10년)",
    "category": "cardiovascular",
    "value": 2.8,
    "unit": "%",
    "level": "low",
    "interpretation": "10년 심혈관(CVD) 위험 낮음",
    "cutoffs": "<5 낮음 / 5~7.5 경계 / 7.5~20 중간 / ≥20 높음",
    "formula": "SCORE2 (ESC 2021, High-risk 지역 보정)",
    "note": "유럽 모델을 한국에 High-risk 지역으로 근사한 참고값. 진단 아님."
   }
  ],
  "unavailable": [],
  "disclaimer": "검진 수치로 산출하는 선별용 참고 지표입니다. 진단을 대체하지 않으며, 컷오프는 연구·위험군에 따라 달라질 수 있습니다. 위험엔진(PREVENT·Framingham)은 서구 코호트 기반 참고용 시뮬레이션입니다."
 },
 "ldl_target": {
  "risk_level": "low",
  "label": "저위험군",
  "target_ldl": 160,
  "target_text": "LDL 160mg/dL 미만",
  "current_ldl": 123.0,
  "achieved": true,
  "gap": -37.0,
  "ldl_reliable": true,
  "reliability_note": null,
  "tg_value": 126.0,
  "risk_factors": [
   "현재 흡연"
  ],
  "basis": "주요 위험인자 1개: 현재 흡연",
  "on_medication": false,
  "limitations": [
   "검진 결과만으로는 심혈관 질환 병력·가족력을 알 수 없어, 실제 위험도는 여기 표시된 등급보다 높을 수 있습니다.",
   "고위험군·초고위험군 판정에는 관상동맥질환 등 병력 확인이 필요합니다."
  ],
  "reference": "2022 한국지질·동맥경화학회 이상지질혈증 진료지침"
 },
 "rarity": {
  "clinical_groups": [],
  "lifestyle_groups": [
   "현재 흡연자",
   "음주자"
  ],
  "clinical_count": 0,
  "lifestyle_count": 2,
  "interpretation": "임상 위험 요인 없음 (건강 상태)"
 },
 "metabolic_syndrome_detail": {
  "factors": {
   "복부비만": {
    "met": false,
    "value": 80.0,
    "threshold": 90,
    "reason": "정상 범위",
    "by_medication": false
   },
   "고혈압": {
    "met": false,
    "value": "117.0/74.0",
    "threshold": "130/85",
    "reason": "정상 범위",
    "by_medication": false
   },
   "고혈당": {
    "met": false,
    "value": 90.0,
    "threshold": 100,
    "reason": "정상 범위",
    "by_medication": false
   },
   "낮은 HDL": {
    "met": false,
    "value": 54.0,
    "threshold": "<40",
    "reason": "정상 범위",
    "by_medication": false
   },
   "고중성지방": {
    "met": false,
    "value": 126.0,
    "threshold": 150,
    "reason": "정상 범위",
    "by_medication": false
   }
  },
  "count": 0,
  "evaluable": 5,
  "is_metabolic_syndrome": false
 },
 "population_16yr": {
  "source": {
   "years": "2009~2024",
   "total_rows": 15957665,
   "label": "국민건강보험공단 표본 1,596만 건"
  },
  "combo_oe": {},
  "disclaimer": "국민건강보험공단 표본 2009~2024년 15,957,665건을 재분석한 모집단 통계입니다. 원자료에 약 복용 정보가 없어 모집단 유병률은 '검진 수치 기준'이며, 서비스 판정('수치 또는 해당 약 복용')보다 좁게 잡힙니다. 개인식별자가 없어 연도별 독립 단면이므로 개인의 경과가 아니라 집단 비교입니다. 지질검사가 들어간 조합은 검사가 전원에게 실시된 2009~2017년만 집계했습니다.",
  "peer_prevalence": {
    "g_pre_hypertension": {
     "name": "고혈압 전단계",
     "pct": 37.4,
     "n_eval": 62567
    },
   "g_hypertension": {
    "name": "고혈압",
    "pct": 15.1,
    "n_eval": 62567
   },
   "g_diabetes": {
    "name": "당뇨",
    "pct": 6.6,
    "n_eval": 62567
   },
   "g_pre_diabetes": {
    "name": "당뇨 전단계",
    "pct": 35.9,
    "n_eval": 62567
   },
   "g_metabolic_syndrome": {
    "name": "대사증후군",
    "pct": 29.4,
    "n_eval": 30631
   },
   "g_obesity": {
    "name": "비만",
    "pct": 53.7,
    "n_eval": 62567
   },
   "g_dyslipidemia": {
    "name": "이상지질혈증",
    "pct": 44.3,
    "n_eval": 30622
   },
   "g_fatty_liver_suspect": {
    "name": "지방간 의심",
    "pct": 32.7,
    "n_eval": 62566
   }
  },
  "age_fixed_trend": {
   "age_band": "40~44세",
   "sex": "남성",
   "items": [
    {
     "group": "g_obesity",
     "name": "비만",
     "y2009": 35.8,
     "y2024": 53.7,
     "diff": 18.0,
     "ratio": 1.5
    },
    {
     "group": "g_fatty_liver_suspect",
     "name": "지방간 의심",
     "y2009": 22.0,
     "y2024": 32.7,
     "diff": 10.7,
     "ratio": 1.49
    },
    {
     "group": "g_dyslipidemia",
     "name": "이상지질혈증",
     "y2009": 35.7,
     "y2024": 44.3,
     "diff": 8.5,
     "ratio": 1.24
    },
    {
     "group": "g_metabolic_syndrome",
     "name": "대사증후군",
     "y2009": 27.7,
     "y2024": 29.4,
     "diff": 1.7,
     "ratio": 1.06
    },
    {
     "group": "g_pre_diabetes",
     "name": "당뇨 전단계",
     "y2009": 34.3,
     "y2024": 35.9,
     "diff": 1.6,
     "ratio": 1.05
    },
    {
     "group": "g_diabetes",
     "name": "당뇨",
     "y2009": 12.9,
     "y2024": 6.6,
     "diff": -6.3,
     "ratio": 0.51
    },
    {
     "group": "g_hypertension",
     "name": "고혈압",
     "y2009": 24.3,
     "y2024": 15.1,
     "diff": -9.2,
     "ratio": 0.62
    }
   ]
  },
  "care_distribution": {
   "대사 관리 참고군": {
    "total": 30593,
    "dist": [
     {
      "hits": 0,
      "n": 6832,
      "pct": 22.3
     },
     {
      "hits": 1,
      "n": 7964,
      "pct": 26.0
     },
     {
      "hits": 2,
      "n": 7328,
      "pct": 24.0
     },
     {
      "hits": 3,
      "n": 5235,
      "pct": 17.1
     },
     {
      "hits": 4,
      "n": 2691,
      "pct": 8.8
     },
     {
      "hits": 5,
      "n": 543,
      "pct": 1.8
     }
    ]
   },
   "지질 관리 참고군": {
    "total": 29230,
    "dist": [
     {
      "hits": 0,
      "n": 7405,
      "pct": 25.3
     },
     {
      "hits": 1,
      "n": 5061,
      "pct": 17.3
     },
     {
      "hits": 2,
      "n": 10777,
      "pct": 36.9
     },
     {
      "hits": 3,
      "n": 5088,
      "pct": 17.4
     },
     {
      "hits": 4,
      "n": 899,
      "pct": 3.1
     }
    ]
   },
   "신장 기능 관찰군": {
    "total": 62461,
    "dist": [
     {
      "hits": 0,
      "n": 59980,
      "pct": 96.0
     },
     {
      "hits": 1,
      "n": 2407,
      "pct": 3.9
     },
     {
      "hits": 2,
      "n": 74,
      "pct": 0.1
     }
    ]
   },
   "혈압 관리 참고군": {
    "total": 62567,
    "dist": [
     {
      "hits": 0,
      "n": 37528,
      "pct": 60.0
     },
     {
      "hits": 1,
      "n": 12081,
      "pct": 19.3
     },
     {
      "hits": 2,
      "n": 12958,
      "pct": 20.7
     }
    ]
   },
   "간 기능 관찰군": {
    "total": 62563,
    "dist": [
     {
      "hits": 0,
      "n": 41331,
      "pct": 66.1
     },
     {
      "hits": 1,
      "n": 11567,
      "pct": 18.5
     },
     {
      "hits": 2,
      "n": 6392,
      "pct": 10.2
     },
     {
      "hits": 3,
      "n": 3273,
      "pct": 5.2
     }
    ]
   }
  }
 }
}) as unknown as RealComboAnalysis,
  2010: ({
 "combo_groups": {
  "matched": [],
  "not_evaluable": [],
  "matched_count": 0,
  "ascvd_risk_combos": [],
  "highest_synergy": null,
  "population": {
   "year": 2024,
   "total_n": 994018,
   "source": "국민건강보험공단 표본 (최신 연도)"
  },
  "caveats": [
   "모집단 통계는 공단 원자료 기준이라 약물 복용 정보가 없습니다. 서비스 판정은 '수치 또는 해당 약물 복용'을 함께 보므로, 약을 드시는 분은 모집단 기준보다 넓게 잡힐 수 있습니다.",
   "모집단의 지방간 의심 기준은 GGT>60이고 서비스 기준은 GGT>75입니다 (약대 자문 반영). 두 기준이 달라 비교 시 참고가 필요합니다.",
   "O/E비는 '함께 나타나는 경향'을 뜻하며 인과관계나 개인의 위험도 예측이 아닙니다."
  ]
 },
 "fatty_liver": {
  "applicable": false,
  "type": null,
  "provisional": false,
  "basis": "지방간 의심에 해당하지 않아 유형 구분 대상이 아닙니다.",
  "cardiometabolic_factors": [],
  "indices": {
   "fli": {
    "value": 25.5,
    "level": "low",
    "interpretation": "지방간 가능성 낮음",

    "plain": "지방간일 가능성은 낮아요",
    "cutoffs": "<30 낮음 / 30~59 중간 / ≥60 높음",
    "formula": "Fatty Liver Index (Bedogni 2006)"
   },
   "hsi": {
    "value": 31.3,
    "level": "intermediate",
    "interpretation": "판단 보류 구간 (중간)",

    "plain": "지방간인지 아닌지 가리기 어려운 중간이에요",
    "cutoffs": "<30 낮음 / 30~36 중간 / >36 시사",
    "formula": "Hepatic Steatosis Index (Lee 2010, 한국인 기반)"
   },
   "unavailable": [],
   "disclaimer": "FLI·HSI는 검진 수치로 지방간 가능성을 가늠하는 선별용 참고 지표입니다. 초음파 등 영상 검사에 의한 진단을 대체하지 않습니다."
  }
 },
 "disclaimer": "조합 그룹 결과는 국민건강보험공단 표본과의 통계 비교이며, 진단이 아닙니다. 판단은 의료진과 상담하세요.",
 "single_groups": [
  {
   "key": "g_hypertension",
   "name": "고혈압",
   "category": "임상",
   "desc": "수축기 ≥140 또는 이완기 ≥90 또는 고혈압약 복용",
   "applies": false
  },
  {
   "key": "g_pre_hypertension",
   "name": "고혈압 전단계",
   "category": "임상",
   "desc": "수축기 130-139 또는 이완기 80-89",
   "applies": false
  },
  {
   "key": "g_diabetes",
   "name": "당뇨",
   "category": "임상",
   "desc": "공복혈당 ≥126 또는 당뇨약 복용",
   "applies": false
  },
  {
   "key": "g_pre_diabetes",
   "name": "당뇨 전단계",
   "category": "임상",
   "desc": "공복혈당 100-125",
   "applies": false
  },
  {
   "key": "g_metabolic_syndrome",
   "name": "대사증후군",
   "category": "임상",
   "desc": "5개 기준 중 3개 이상 (약물 복용 포함)",
   "applies": false
  },
  {
   "key": "g_obesity",
   "name": "비만",
   "category": "임상",
   "desc": "BMI ≥25",
   "applies": false
  },
  {
   "key": "g_dyslipidemia",
   "name": "이상지질혈증",
   "category": "임상",
   "desc": "LDL≥160 또는 HDL미달 또는 TG≥200 또는 이상지질혈증약 복용",
   "applies": false
  },
  {
   "key": "g_fatty_liver_suspect",
   "name": "지방간 의심",
   "category": "임상",
   "desc": "ALT>40 또는 GGT>75",
   "applies": false
  },
  {
   "key": "g_smoker_current",
   "name": "현재 흡연자",
   "category": "생활습관",
   "desc": null,
   "applies": true
  },
  {
   "key": "g_smoker_former",
   "name": "과거 흡연자",
   "category": "생활습관",
   "desc": null,
   "applies": false
  },
  {
   "key": "g_non_smoker",
   "name": "비흡연자",
   "category": "생활습관",
   "desc": null,
   "applies": false
  },
  {
   "key": "g_drinker",
   "name": "음주자",
   "category": "생활습관",
   "desc": null,
   "applies": true
  },
  {
   "key": "g_non_drinker",
   "name": "비음주자",
   "category": "생활습관",
   "desc": null,
   "applies": false
  }
 ],
 "ascvd_simulation": {
  "available": true,
  "is_simulation": true,
  "risk_percent": 3.8,
  "risk_level": "low",
  "risk_label": "낮은 편",
  "inputs": {
   "age": 42,
   "gender": "남",
   "total_cholesterol": 202.0,
   "hdl": 52.0,
   "sbp": 120.0,
   "smoker": true,
   "diabetes": false,
   "on_bp_medication": false
  },
  "scenarios": [
   {
    "name": "금연했다면",
    "risk_percent": 1.2,
    "delta": -2.6
   },
   {
    "name": "HDL이 60이라면",
    "risk_percent": 3.1,
    "delta": -0.7
   }
  ],
  "method": "Pooled Cohort Equations (2013 ACC/AHA)",
  "limitations": [
   "이 식은 미국 코호트에서 만들어졌으며 한국인에서는 위험도를 실제보다 높게 추정하는 경향이 보고되었습니다.",
   "국내 진료지침은 이 식을 한국인에게 그대로 적용하도록 권고하지 않습니다.",
   "따라서 표시된 %는 진단이나 예측이 아니라, 수치가 달라질 때 위험이 어느 방향으로 얼마나 움직이는지 보기 위한 참고 시뮬레이션입니다.",
   "가족력·병력이 반영되지 않아 실제 위험과 다를 수 있습니다."
  ],
  "how_to_read": "절대적인 % 값보다, 아래 '무엇을 바꾸면' 항목의 변화 폭을 참고하세요."
 },
 "calculators": {
  "items": [
   {
    "key": "non_hdl_c",
    "title": "Non-HDL 콜레스테롤",
    "category": "lipid",
    "value": 150.0,
    "level": "intermediate",
    "interpretation": "적정 상회",
    "inputs": {
     "total_cholesterol": 202.0,
     "hdl": 52.0
    },
    "cutoffs": "<130 적정 / 130~159 적정상회 / 160~189 경계 / 190~219 높음 / ≥220 매우높음 (NCEP ATP III)",
    "note": "개인 목표치는 위험군에 따라 다릅니다(비-HDL 목표 = LDL 목표 + 30).",
    "formula": "Non-HDL-C = 총콜레스테롤 − HDL",
    "peer_label": "한국인 42세 남성 중 상위 50%",
    "percentile": 50,
    "peer_n": 70805,
    "peer_year": 2017
   },
   {
    "key": "castelli_1",
    "title": "Castelli 지수 I",
    "category": "lipid",
    "value": 3.88,
    "level": "low",
    "interpretation": "적정",
    "cutoffs": "<4.0 적정 / 4.0~5.0 경계 / >5.0 높음 (참고, 성별·문헌별 상이)",
    "formula": "Castelli-I = 총콜레스테롤 / HDL",
    "peer_label": "한국인 42세 남성 중 하위 47%",
    "percentile": 46.6,
    "peer_n": 70806,
    "peer_year": 2017
   },
   {
    "key": "castelli_2",
    "title": "Castelli 지수 II",
    "category": "lipid",
    "value": 2.44,
    "level": "low",
    "interpretation": "적정",
    "cutoffs": "<3.0 적정 / 3.0~3.5 경계 / >3.5 높음 (참고)",
    "formula": "Castelli-II = LDL / HDL",
    "peer_label": "한국인 42세 남성 중 상위 46%",
    "percentile": 54.1,
    "peer_n": 70461,
    "peer_year": 2017
   },
   {
    "key": "aip",
    "title": "AIP 죽상형성지수",
    "category": "lipid",
    "value": 0.045,
    "level": "low",
    "interpretation": "저위험",
    "cutoffs": "<0.11 저위험 / 0.11~0.21 중간 / >0.21 고위험 (Dobiásová)",
    "formula": "AIP = log10(TG/HDL), mmol/L 변환 적용",
    "percentile": 46,
    "peer_label": "한국인 42세 남성 중 하위 46%",
    "peer_n": 70759,
    "peer_year": 2017
   },
   {
    "key": "tyg",
    "title": "TyG 지수",
    "category": "insulin",
    "value": 8.72,
    "level": "intermediate",
    "interpretation": "경계 (참고 구간)",
    "inputs": {
     "tg": 132.0,
     "fbs": 93.0
    },
    "cutoffs": "<8.5 낮음 / 8.5~8.9 경계 / ≥9.0 높음 (연구별 상이, 참고용)",
    "note": "국제 단일 진단 컷오프는 미확립이나, 한국 성인 대사증후군 스크리닝용으로 ~8.8이 반복 검증됨(Shin 2019 등). 한국인 국가검진 55세 남성 중앙값도 8.80.",
    "formula": "TyG = ln(TG × 공복혈당 / 2)  [Simental-Mendía 2008]",
    "percentile": 43.7,
    "peer_label": "한국인 42세 남성 중 하위 44%",
    "peer_n": 70769,
    "peer_year": 2017
   },
   {
    "key": "mets_ir",
    "title": "METS-IR",
    "category": "insulin",
    "value": 32.96,
    "level": "low",
    "interpretation": "참고: 인슐린저항성 낮은 편",
    "cutoffs": "참고선 ~50 (검증된 단일 컷오프 없음, 연구별 상이)",
    "formula": "METS-IR = ln(2·FPG+TG)·BMI / ln(HDL)",
    "note": "인슐린저항성 대리지표. 진단 컷오프 미확립 — 추이·참고용.",
    "percentile": 27.2,
    "peer_label": "한국인 42세 남성 중 하위 27%",
    "peer_n": 70759,
    "peer_year": 2017
   },
   {
    "key": "lap",
    "title": "LAP 지질축적산물",
    "category": "adiposity",
    "value": 25.3,
    "level": "info",
    "interpretation": "지질축적 정도(참고)",
    "cutoffs": "단일 컷오프 없음 — 집단 내 사분위로 해석",
    "formula": "LAP = (허리−65)×TG(mmol/L)",
    "note": "내장지방·대사위험 대리지표. 진단 컷오프 미확립.",
    "percentile": 39.4,
    "peer_label": "한국인 42세 남성 중 하위 39%",
    "peer_n": 70448,
    "peer_year": 2017
   },
   {
    "key": "vai",
    "title": "VAI 내장지방지수",
    "category": "adiposity",
    "value": 1.41,
    "level": "info",
    "interpretation": "내장지방 기능이상 정도(참고)",
    "cutoffs": "정상체중 건강군 ≈1.0 기준 (연령별 컷오프 필요)",
    "formula": "VAI = 성별식(WC·BMI·TG·HDL), mmol/L 변환 적용",
    "note": "내장지방 기능이상 대리지표. 연령의존 컷오프 — 참고용.",
    "percentile": 46.1,
    "peer_label": "한국인 42세 남성 중 하위 46%",
    "peer_n": 70757,
    "peer_year": 2017
   },
   {
    "key": "de_ritis",
    "title": "De Ritis 비 (AST/ALT)",
    "category": "liver",
    "value": 0.92,
    "level": "low",
    "interpretation": "비알코올성/급성 간질환 시사 (<1)",
    "cutoffs": "<1 비알코올/급성 / 1~2 중간 / >2 알코올성·진행 시사",
    "formula": "De Ritis = AST / ALT",
    "peer_label": "한국인 42세 남성 중 하위 31%",
    "percentile": 30.6,
    "peer_n": 39160,
    "peer_year": 2010
   },
   {
    "key": "alt_ggt",
    "title": "ALT/GGT 비",
    "category": "liver",
    "value": 0.74,
    "level": "info",
    "interpretation": "알코올성 간질환 쪽 시사 (<1)",
    "cutoffs": "<1 알코올성 쪽 / ≥1 비알코올성 쪽 (유형 감별 보조, 중증도 아님)",
    "formula": "ALT / GGT",
    "note": "유형을 가늠하는 보조 지표로, 진단이 아닙니다. 음주량(주당 순알코올)을 함께 보면 정확도가 올라갑니다."
   },
   {
    "key": "bard",
    "title": "BARD 점수",
    "category": "liver",
    "value": 2,
    "level": "high",
    "interpretation": "진행 간섬유화 배제 불가 (추가 평가 권장)",

    "plain": "간이 굳고 있는지 더 확인해 볼 필요가 있어요",
    "components": [
     "AST/ALT≥0.8 (+2)"
    ],
    "inputs": {
     "bmi": 22.6,
     "ast": 23.0,
     "alt": 25.0,
     "ast_alt_ratio": 0.92,
     "diabetes": false
    },
    "cutoffs": "0~1 배제 쪽 / 2~4 배제 불가",
    "formula": "BARD = BMI≥28(1) + AST/ALT≥0.8(2) + 당뇨(1)  [Harrison 2008]"
   },
   {
    "key": "map",
    "title": "평균동맥압 (MAP)",
    "category": "bp",
    "value": 90.7,
    "level": "low",
    "interpretation": "정상 범위",
    "cutoffs": "70~100 정상 / <70 낮음 / >110 높음 (mmHg)",
    "formula": "MAP = (SBP + 2×DBP) / 3",
    "peer_label": "한국인 42세 남성 중 하위 34%",
    "percentile": 33.9,
    "peer_n": 39160,
    "peer_year": 2010
   },
   {
    "key": "prevent",
    "title": "AHA PREVENT (10·30년)",
    "category": "cardiovascular",
    "value": 2.4,
    "unit": "%",
    "level": "low",
    "interpretation": "10년 심혈관(CVD) 위험 낮음",
    "value_30yr": 14.6,
    "cutoffs": "<5 낮음 / 5~7.5 경계 / 7.5~20 중간 / ≥20 높음",
    "formula": "AHA PREVENT Total CVD (Khan 2024, race-free·eGFR 반영)",
    "note": "30년 위험 14.6%. PCE 후속 모델(30~79세). 참고용, 진단 아님."
   },
   {
    "key": "framingham",
    "title": "Framingham Hard CHD (10년)",
    "category": "cardiovascular",
    "value": 6.8,
    "unit": "%",
    "level": "intermediate",
    "interpretation": "10년 관상동맥질환 위험 경계",
    "cutoffs": "<5 낮음 / 5~7.5 경계 / 7.5~20 중간 / ≥20 높음",
    "formula": "Framingham Hard CHD 10년 (Wilson 1998, MDCalc calc/38)",
    "note": "당뇨 미반영·서구 코호트 기반 참고용. 진단 아님."
   },
   {
    "key": "score2",
    "title": "SCORE2 / OP (10년)",
    "category": "cardiovascular",
    "value": 3.5,
    "unit": "%",
    "level": "low",
    "interpretation": "10년 심혈관(CVD) 위험 낮음",
    "cutoffs": "<5 낮음 / 5~7.5 경계 / 7.5~20 중간 / ≥20 높음",
    "formula": "SCORE2 (ESC 2021, High-risk 지역 보정)",
    "note": "유럽 모델을 한국에 High-risk 지역으로 근사한 참고값. 진단 아님."
   }
  ],
  "unavailable": [],
  "disclaimer": "검진 수치로 산출하는 선별용 참고 지표입니다. 진단을 대체하지 않으며, 컷오프는 연구·위험군에 따라 달라질 수 있습니다. 위험엔진(PREVENT·Framingham)은 서구 코호트 기반 참고용 시뮬레이션입니다."
 },
 "ldl_target": {
  "risk_level": "low",
  "label": "저위험군",
  "target_ldl": 160,
  "target_text": "LDL 160mg/dL 미만",
  "current_ldl": 127.0,
  "achieved": true,
  "gap": -33.0,
  "ldl_reliable": true,
  "reliability_note": null,
  "tg_value": 132.0,
  "risk_factors": [
   "현재 흡연"
  ],
  "basis": "주요 위험인자 1개: 현재 흡연",
  "on_medication": false,
  "limitations": [
   "검진 결과만으로는 심혈관 질환 병력·가족력을 알 수 없어, 실제 위험도는 여기 표시된 등급보다 높을 수 있습니다.",
   "고위험군·초고위험군 판정에는 관상동맥질환 등 병력 확인이 필요합니다."
  ],
  "reference": "2022 한국지질·동맥경화학회 이상지질혈증 진료지침"
 },
 "rarity": {
  "clinical_groups": [],
  "lifestyle_groups": [
   "현재 흡연자",
   "음주자"
  ],
  "clinical_count": 0,
  "lifestyle_count": 2,
  "interpretation": "임상 위험 요인 없음 (건강 상태)"
 },
 "metabolic_syndrome_detail": {
  "factors": {
   "복부비만": {
    "met": false,
    "value": 82.0,
    "threshold": 90,
    "reason": "정상 범위",
    "by_medication": false
   },
   "고혈압": {
    "met": false,
    "value": "120.0/76.0",
    "threshold": "130/85",
    "reason": "정상 범위",
    "by_medication": false
   },
   "고혈당": {
    "met": false,
    "value": 93.0,
    "threshold": 100,
    "reason": "정상 범위",
    "by_medication": false
   },
   "낮은 HDL": {
    "met": false,
    "value": 52.0,
    "threshold": "<40",
    "reason": "정상 범위",
    "by_medication": false
   },
   "고중성지방": {
    "met": false,
    "value": 132.0,
    "threshold": 150,
    "reason": "정상 범위",
    "by_medication": false
   }
  },
  "count": 0,
  "evaluable": 5,
  "is_metabolic_syndrome": false
 },
 "population_16yr": {
  "source": {
   "years": "2009~2024",
   "total_rows": 15957665,
   "label": "국민건강보험공단 표본 1,596만 건"
  },
  "combo_oe": {},
  "disclaimer": "국민건강보험공단 표본 2009~2024년 15,957,665건을 재분석한 모집단 통계입니다. 원자료에 약 복용 정보가 없어 모집단 유병률은 '검진 수치 기준'이며, 서비스 판정('수치 또는 해당 약 복용')보다 좁게 잡힙니다. 개인식별자가 없어 연도별 독립 단면이므로 개인의 경과가 아니라 집단 비교입니다. 지질검사가 들어간 조합은 검사가 전원에게 실시된 2009~2017년만 집계했습니다.",
  "peer_prevalence": {
    "g_pre_hypertension": {
     "name": "고혈압 전단계",
     "pct": 37.4,
     "n_eval": 62567
    },
   "g_hypertension": {
    "name": "고혈압",
    "pct": 15.1,
    "n_eval": 62567
   },
   "g_diabetes": {
    "name": "당뇨",
    "pct": 6.6,
    "n_eval": 62567
   },
   "g_pre_diabetes": {
    "name": "당뇨 전단계",
    "pct": 35.9,
    "n_eval": 62567
   },
   "g_metabolic_syndrome": {
    "name": "대사증후군",
    "pct": 29.4,
    "n_eval": 30631
   },
   "g_obesity": {
    "name": "비만",
    "pct": 53.7,
    "n_eval": 62567
   },
   "g_dyslipidemia": {
    "name": "이상지질혈증",
    "pct": 44.3,
    "n_eval": 30622
   },
   "g_fatty_liver_suspect": {
    "name": "지방간 의심",
    "pct": 32.7,
    "n_eval": 62566
   }
  },
  "age_fixed_trend": {
   "age_band": "40~44세",
   "sex": "남성",
   "items": [
    {
     "group": "g_obesity",
     "name": "비만",
     "y2009": 35.8,
     "y2024": 53.7,
     "diff": 18.0,
     "ratio": 1.5
    },
    {
     "group": "g_fatty_liver_suspect",
     "name": "지방간 의심",
     "y2009": 22.0,
     "y2024": 32.7,
     "diff": 10.7,
     "ratio": 1.49
    },
    {
     "group": "g_dyslipidemia",
     "name": "이상지질혈증",
     "y2009": 35.7,
     "y2024": 44.3,
     "diff": 8.5,
     "ratio": 1.24
    },
    {
     "group": "g_metabolic_syndrome",
     "name": "대사증후군",
     "y2009": 27.7,
     "y2024": 29.4,
     "diff": 1.7,
     "ratio": 1.06
    },
    {
     "group": "g_pre_diabetes",
     "name": "당뇨 전단계",
     "y2009": 34.3,
     "y2024": 35.9,
     "diff": 1.6,
     "ratio": 1.05
    },
    {
     "group": "g_diabetes",
     "name": "당뇨",
     "y2009": 12.9,
     "y2024": 6.6,
     "diff": -6.3,
     "ratio": 0.51
    },
    {
     "group": "g_hypertension",
     "name": "고혈압",
     "y2009": 24.3,
     "y2024": 15.1,
     "diff": -9.2,
     "ratio": 0.62
    }
   ]
  },
  "care_distribution": {
   "신장 기능 관찰군": {
    "total": 62461,
    "dist": [
     {
      "hits": 0,
      "n": 59980,
      "pct": 96.0
     },
     {
      "hits": 1,
      "n": 2407,
      "pct": 3.9
     },
     {
      "hits": 2,
      "n": 74,
      "pct": 0.1
     }
    ]
   },
   "지질 관리 참고군": {
    "total": 29230,
    "dist": [
     {
      "hits": 0,
      "n": 7405,
      "pct": 25.3
     },
     {
      "hits": 1,
      "n": 5061,
      "pct": 17.3
     },
     {
      "hits": 2,
      "n": 10777,
      "pct": 36.9
     },
     {
      "hits": 3,
      "n": 5088,
      "pct": 17.4
     },
     {
      "hits": 4,
      "n": 899,
      "pct": 3.1
     }
    ]
   },
   "간 기능 관찰군": {
    "total": 62563,
    "dist": [
     {
      "hits": 0,
      "n": 41331,
      "pct": 66.1
     },
     {
      "hits": 1,
      "n": 11567,
      "pct": 18.5
     },
     {
      "hits": 2,
      "n": 6392,
      "pct": 10.2
     },
     {
      "hits": 3,
      "n": 3273,
      "pct": 5.2
     }
    ]
   },
   "혈압 관리 참고군": {
    "total": 62567,
    "dist": [
     {
      "hits": 0,
      "n": 37528,
      "pct": 60.0
     },
     {
      "hits": 1,
      "n": 12081,
      "pct": 19.3
     },
     {
      "hits": 2,
      "n": 12958,
      "pct": 20.7
     }
    ]
   },
   "대사 관리 참고군": {
    "total": 30593,
    "dist": [
     {
      "hits": 0,
      "n": 6832,
      "pct": 22.3
     },
     {
      "hits": 1,
      "n": 7964,
      "pct": 26.0
     },
     {
      "hits": 2,
      "n": 7328,
      "pct": 24.0
     },
     {
      "hits": 3,
      "n": 5235,
      "pct": 17.1
     },
     {
      "hits": 4,
      "n": 2691,
      "pct": 8.8
     },
     {
      "hits": 5,
      "n": 543,
      "pct": 1.8
     }
    ]
   }
  }
 }
}) as unknown as RealComboAnalysis,
  2012: ({
 "combo_groups": {
  "matched": [],
  "not_evaluable": [],
  "matched_count": 0,
  "ascvd_risk_combos": [],
  "highest_synergy": null,
  "population": {
   "year": 2024,
   "total_n": 994018,
   "source": "국민건강보험공단 표본 (최신 연도)"
  },
  "caveats": [
   "모집단 통계는 공단 원자료 기준이라 약물 복용 정보가 없습니다. 서비스 판정은 '수치 또는 해당 약물 복용'을 함께 보므로, 약을 드시는 분은 모집단 기준보다 넓게 잡힐 수 있습니다.",
   "모집단의 지방간 의심 기준은 GGT>60이고 서비스 기준은 GGT>75입니다 (약대 자문 반영). 두 기준이 달라 비교 시 참고가 필요합니다.",
   "O/E비는 '함께 나타나는 경향'을 뜻하며 인과관계나 개인의 위험도 예측이 아닙니다."
  ]
 },
 "fatty_liver": {
  "applicable": false,
  "type": null,
  "provisional": false,
  "basis": "지방간 의심에 해당하지 않아 유형 구분 대상이 아닙니다.",
  "cardiometabolic_factors": [],
  "indices": {
   "fli": {
    "value": 29.8,
    "level": "low",
    "interpretation": "지방간 가능성 낮음",

    "plain": "지방간일 가능성은 낮아요",
    "cutoffs": "<30 낮음 / 30~59 중간 / ≥60 높음",
    "formula": "Fatty Liver Index (Bedogni 2006)"
   },
   "hsi": {
    "value": 31.6,
    "level": "intermediate",
    "interpretation": "판단 보류 구간 (중간)",

    "plain": "지방간인지 아닌지 가리기 어려운 중간이에요",
    "cutoffs": "<30 낮음 / 30~36 중간 / >36 시사",
    "formula": "Hepatic Steatosis Index (Lee 2010, 한국인 기반)"
   },
   "unavailable": [],
   "disclaimer": "FLI·HSI는 검진 수치로 지방간 가능성을 가늠하는 선별용 참고 지표입니다. 초음파 등 영상 검사에 의한 진단을 대체하지 않습니다."
  }
 },
 "disclaimer": "조합 그룹 결과는 국민건강보험공단 표본과의 통계 비교이며, 진단이 아닙니다. 판단은 의료진과 상담하세요.",
 "single_groups": [
  {
   "key": "g_hypertension",
   "name": "고혈압",
   "category": "임상",
   "desc": "수축기 ≥140 또는 이완기 ≥90 또는 고혈압약 복용",
   "applies": false
  },
  {
   "key": "g_pre_hypertension",
   "name": "고혈압 전단계",
   "category": "임상",
   "desc": "수축기 130-139 또는 이완기 80-89",
   "applies": false
  },
  {
   "key": "g_diabetes",
   "name": "당뇨",
   "category": "임상",
   "desc": "공복혈당 ≥126 또는 당뇨약 복용",
   "applies": false
  },
  {
   "key": "g_pre_diabetes",
   "name": "당뇨 전단계",
   "category": "임상",
   "desc": "공복혈당 100-125",
   "applies": false
  },
  {
   "key": "g_metabolic_syndrome",
   "name": "대사증후군",
   "category": "임상",
   "desc": "5개 기준 중 3개 이상 (약물 복용 포함)",
   "applies": false
  },
  {
   "key": "g_obesity",
   "name": "비만",
   "category": "임상",
   "desc": "BMI ≥25",
   "applies": false
  },
  {
   "key": "g_dyslipidemia",
   "name": "이상지질혈증",
   "category": "임상",
   "desc": "LDL≥160 또는 HDL미달 또는 TG≥200 또는 이상지질혈증약 복용",
   "applies": false
  },
  {
   "key": "g_fatty_liver_suspect",
   "name": "지방간 의심",
   "category": "임상",
   "desc": "ALT>40 또는 GGT>75",
   "applies": false
  },
  {
   "key": "g_smoker_current",
   "name": "현재 흡연자",
   "category": "생활습관",
   "desc": null,
   "applies": true
  },
  {
   "key": "g_smoker_former",
   "name": "과거 흡연자",
   "category": "생활습관",
   "desc": null,
   "applies": false
  },
  {
   "key": "g_non_smoker",
   "name": "비흡연자",
   "category": "생활습관",
   "desc": null,
   "applies": false
  },
  {
   "key": "g_drinker",
   "name": "음주자",
   "category": "생활습관",
   "desc": null,
   "applies": true
  },
  {
   "key": "g_non_drinker",
   "name": "비음주자",
   "category": "생활습관",
   "desc": null,
   "applies": false
  }
 ],
 "ascvd_simulation": {
  "available": true,
  "is_simulation": true,
  "risk_percent": 4.8,
  "risk_level": "low",
  "risk_label": "낮은 편",
  "inputs": {
   "age": 44,
   "gender": "남",
   "total_cholesterol": 204.0,
   "hdl": 50.0,
   "sbp": 122.0,
   "smoker": true,
   "diabetes": false,
   "on_bp_medication": false
  },
  "scenarios": [
   {
    "name": "금연했다면",
    "risk_percent": 1.7,
    "delta": -3.1
   },
   {
    "name": "수축기혈압이 120이라면",
    "risk_percent": 4.7,
    "delta": -0.1
   },
   {
    "name": "HDL이 60이라면",
    "risk_percent": 3.8,
    "delta": -1.0
   }
  ],
  "method": "Pooled Cohort Equations (2013 ACC/AHA)",
  "limitations": [
   "이 식은 미국 코호트에서 만들어졌으며 한국인에서는 위험도를 실제보다 높게 추정하는 경향이 보고되었습니다.",
   "국내 진료지침은 이 식을 한국인에게 그대로 적용하도록 권고하지 않습니다.",
   "따라서 표시된 %는 진단이나 예측이 아니라, 수치가 달라질 때 위험이 어느 방향으로 얼마나 움직이는지 보기 위한 참고 시뮬레이션입니다.",
   "가족력·병력이 반영되지 않아 실제 위험과 다를 수 있습니다."
  ],
  "how_to_read": "절대적인 % 값보다, 아래 '무엇을 바꾸면' 항목의 변화 폭을 참고하세요."
 },
 "calculators": {
  "items": [
   {
    "key": "non_hdl_c",
    "title": "Non-HDL 콜레스테롤",
    "category": "lipid",
    "value": 154.0,
    "level": "intermediate",
    "interpretation": "적정 상회",
    "inputs": {
     "total_cholesterol": 204.0,
     "hdl": 50.0
    },
    "cutoffs": "<130 적정 / 130~159 적정상회 / 160~189 경계 / 190~219 높음 / ≥220 매우높음 (NCEP ATP III)",
    "note": "개인 목표치는 위험군에 따라 다릅니다(비-HDL 목표 = LDL 목표 + 30).",
    "formula": "Non-HDL-C = 총콜레스테롤 − HDL",
    "peer_label": "한국인 44세 남성 중 상위 46%",
    "percentile": 54,
    "peer_n": 70805,
    "peer_year": 2017,
    "driver": "또래 중앙값과 견주면 총콜레스테롤 쪽이 이 값을 더 끌어올렸어요."
   },
   {
    "key": "castelli_1",
    "title": "Castelli 지수 I",
    "category": "lipid",
    "value": 4.08,
    "level": "intermediate",
    "interpretation": "경계",
    "cutoffs": "<4.0 적정 / 4.0~5.0 경계 / >5.0 높음 (참고, 성별·문헌별 상이)",
    "formula": "Castelli-I = 총콜레스테롤 / HDL",
    "peer_label": "한국인 44세 남성 중 상위 47%",
    "percentile": 53.1,
    "peer_n": 70806,
    "peer_year": 2017
   },
   {
    "key": "castelli_2",
    "title": "Castelli 지수 II",
    "category": "lipid",
    "value": 2.62,
    "level": "low",
    "interpretation": "적정",
    "cutoffs": "<3.0 적정 / 3.0~3.5 경계 / >3.5 높음 (참고)",
    "formula": "Castelli-II = LDL / HDL",
    "peer_label": "한국인 44세 남성 중 상위 39%",
    "percentile": 61.4,
    "peer_n": 70461,
    "peer_year": 2017
   },
   {
    "key": "aip",
    "title": "AIP 죽상형성지수",
    "category": "lipid",
    "value": 0.081,
    "level": "low",
    "interpretation": "저위험",
    "cutoffs": "<0.11 저위험 / 0.11~0.21 중간 / >0.21 고위험 (Dobiásová)",
    "formula": "AIP = log10(TG/HDL), mmol/L 변환 적용",
    "percentile": 50.2,
    "peer_label": "한국인 44세 남성 중 상위 50%",
    "peer_n": 70759,
    "peer_year": 2017,
    "driver": "또래 중앙값과 견주면 낮은 HDL 쪽이 이 값을 더 끌어올렸어요."
   },
   {
    "key": "tyg",
    "title": "TyG 지수",
    "category": "insulin",
    "value": 8.8,
    "level": "intermediate",
    "interpretation": "경계 (참고 구간)",
    "inputs": {
     "tg": 138.0,
     "fbs": 96.0
    },
    "cutoffs": "<8.5 낮음 / 8.5~8.9 경계 / ≥9.0 높음 (연구별 상이, 참고용)",
    "note": "국제 단일 진단 컷오프는 미확립이나, 한국 성인 대사증후군 스크리닝용으로 ~8.8이 반복 검증됨(Shin 2019 등). 한국인 국가검진 55세 남성 중앙값도 8.80.",
    "formula": "TyG = ln(TG × 공복혈당 / 2)  [Simental-Mendía 2008]",
    "percentile": 48.4,
    "peer_label": "한국인 44세 남성 중 하위 48%",
    "peer_n": 70769,
    "peer_year": 2017
   },
   {
    "key": "mets_ir",
    "title": "METS-IR",
    "category": "insulin",
    "value": 33.93,
    "level": "low",
    "interpretation": "참고: 인슐린저항성 낮은 편",
    "cutoffs": "참고선 ~50 (검증된 단일 컷오프 없음, 연구별 상이)",
    "formula": "METS-IR = ln(2·FPG+TG)·BMI / ln(HDL)",
    "note": "인슐린저항성 대리지표. 진단 컷오프 미확립 — 추이·참고용.",
    "percentile": 32.6,
    "peer_label": "한국인 44세 남성 중 하위 33%",
    "peer_n": 70759,
    "peer_year": 2017
   },
   {
    "key": "lap",
    "title": "LAP 지질축적산물",
    "category": "adiposity",
    "value": 28.0,
    "level": "info",
    "interpretation": "지질축적 정도(참고)",
    "cutoffs": "단일 컷오프 없음 — 집단 내 사분위로 해석",
    "formula": "LAP = (허리−65)×TG(mmol/L)",
    "note": "내장지방·대사위험 대리지표. 진단 컷오프 미확립.",
    "percentile": 44.3,
    "peer_label": "한국인 44세 남성 중 하위 44%",
    "peer_n": 70448,
    "peer_year": 2017
   },
   {
    "key": "vai",
    "title": "VAI 내장지방지수",
    "category": "adiposity",
    "value": 1.54,
    "level": "info",
    "interpretation": "내장지방 기능이상 정도(참고)",
    "cutoffs": "정상체중 건강군 ≈1.0 기준 (연령별 컷오프 필요)",
    "formula": "VAI = 성별식(WC·BMI·TG·HDL), mmol/L 변환 적용",
    "note": "내장지방 기능이상 대리지표. 연령의존 컷오프 — 참고용.",
    "percentile": 51,
    "peer_label": "한국인 44세 남성 중 상위 49%",
    "peer_n": 70757,
    "peer_year": 2017
   },
   {
    "key": "de_ritis",
    "title": "De Ritis 비 (AST/ALT)",
    "category": "liver",
    "value": 0.92,
    "level": "low",
    "interpretation": "비알코올성/급성 간질환 시사 (<1)",
    "cutoffs": "<1 비알코올/급성 / 1~2 중간 / >2 알코올성·진행 시사",
    "formula": "De Ritis = AST / ALT",
    "peer_label": "한국인 44세 남성 중 하위 29%",
    "percentile": 29.2,
    "peer_n": 42225,
    "peer_year": 2012
   },
   {
    "key": "alt_ggt",
    "title": "ALT/GGT 비",
    "category": "liver",
    "value": 0.68,
    "level": "info",
    "interpretation": "알코올성 간질환 쪽 시사 (<1)",
    "cutoffs": "<1 알코올성 쪽 / ≥1 비알코올성 쪽 (유형 감별 보조, 중증도 아님)",
    "formula": "ALT / GGT",
    "note": "유형을 가늠하는 보조 지표로, 진단이 아닙니다. 음주량(주당 순알코올)을 함께 보면 정확도가 올라갑니다."
   },
   {
    "key": "bard",
    "title": "BARD 점수",
    "category": "liver",
    "value": 2,
    "level": "high",
    "interpretation": "진행 간섬유화 배제 불가 (추가 평가 권장)",

    "plain": "간이 굳고 있는지 더 확인해 볼 필요가 있어요",
    "components": [
     "AST/ALT≥0.8 (+2)"
    ],
    "inputs": {
     "bmi": 22.9,
     "ast": 24.0,
     "alt": 26.0,
     "ast_alt_ratio": 0.92,
     "diabetes": false
    },
    "cutoffs": "0~1 배제 쪽 / 2~4 배제 불가",
    "formula": "BARD = BMI≥28(1) + AST/ALT≥0.8(2) + 당뇨(1)  [Harrison 2008]"
   },
   {
    "key": "map",
    "title": "평균동맥압 (MAP)",
    "category": "bp",
    "value": 92.7,
    "level": "low",
    "interpretation": "정상 범위",
    "cutoffs": "70~100 정상 / <70 낮음 / >110 높음 (mmHg)",
    "formula": "MAP = (SBP + 2×DBP) / 3",
    "peer_label": "한국인 44세 남성 중 하위 43%",
    "percentile": 43.3,
    "peer_n": 42225,
    "peer_year": 2012
   },
   {
    "key": "prevent",
    "title": "AHA PREVENT (10·30년)",
    "category": "cardiovascular",
    "value": 3.0,
    "unit": "%",
    "level": "low",
    "interpretation": "10년 심혈관(CVD) 위험 낮음",
    "value_30yr": 17.3,
    "cutoffs": "<5 낮음 / 5~7.5 경계 / 7.5~20 중간 / ≥20 높음",
    "formula": "AHA PREVENT Total CVD (Khan 2024, race-free·eGFR 반영)",
    "note": "30년 위험 17.3%. PCE 후속 모델(30~79세). 참고용, 진단 아님."
   },
   {
    "key": "framingham",
    "title": "Framingham Hard CHD (10년)",
    "category": "cardiovascular",
    "value": 8.3,
    "unit": "%",
    "level": "borderline",
    "interpretation": "10년 관상동맥질환 위험 중간",
    "cutoffs": "<5 낮음 / 5~7.5 경계 / 7.5~20 중간 / ≥20 높음",
    "formula": "Framingham Hard CHD 10년 (Wilson 1998, MDCalc calc/38)",
    "note": "당뇨 미반영·서구 코호트 기반 참고용. 진단 아님."
   },
   {
    "key": "score2",
    "title": "SCORE2 / OP (10년)",
    "category": "cardiovascular",
    "value": 4.2,
    "unit": "%",
    "level": "low",
    "interpretation": "10년 심혈관(CVD) 위험 낮음",
    "cutoffs": "<5 낮음 / 5~7.5 경계 / 7.5~20 중간 / ≥20 높음",
    "formula": "SCORE2 (ESC 2021, High-risk 지역 보정)",
    "note": "유럽 모델을 한국에 High-risk 지역으로 근사한 참고값. 진단 아님."
   }
  ],
  "unavailable": [],
  "disclaimer": "검진 수치로 산출하는 선별용 참고 지표입니다. 진단을 대체하지 않으며, 컷오프는 연구·위험군에 따라 달라질 수 있습니다. 위험엔진(PREVENT·Framingham)은 서구 코호트 기반 참고용 시뮬레이션입니다."
 },
 "ldl_target": {
  "risk_level": "low",
  "label": "저위험군",
  "target_ldl": 160,
  "target_text": "LDL 160mg/dL 미만",
  "current_ldl": 131.0,
  "achieved": true,
  "gap": -29.0,
  "ldl_reliable": true,
  "reliability_note": null,
  "tg_value": 138.0,
  "risk_factors": [
   "현재 흡연"
  ],
  "basis": "주요 위험인자 1개: 현재 흡연",
  "on_medication": false,
  "limitations": [
   "검진 결과만으로는 심혈관 질환 병력·가족력을 알 수 없어, 실제 위험도는 여기 표시된 등급보다 높을 수 있습니다.",
   "고위험군·초고위험군 판정에는 관상동맥질환 등 병력 확인이 필요합니다."
  ],
  "reference": "2022 한국지질·동맥경화학회 이상지질혈증 진료지침"
 },
 "rarity": {
  "clinical_groups": [],
  "lifestyle_groups": [
   "현재 흡연자",
   "음주자"
  ],
  "clinical_count": 0,
  "lifestyle_count": 2,
  "interpretation": "임상 위험 요인 없음 (건강 상태)"
 },
 "metabolic_syndrome_detail": {
  "factors": {
   "복부비만": {
    "met": false,
    "value": 83.0,
    "threshold": 90,
    "reason": "정상 범위",
    "by_medication": false
   },
   "고혈압": {
    "met": false,
    "value": "122.0/78.0",
    "threshold": "130/85",
    "reason": "정상 범위",
    "by_medication": false
   },
   "고혈당": {
    "met": false,
    "value": 96.0,
    "threshold": 100,
    "reason": "정상 범위",
    "by_medication": false
   },
   "낮은 HDL": {
    "met": false,
    "value": 50.0,
    "threshold": "<40",
    "reason": "정상 범위",
    "by_medication": false
   },
   "고중성지방": {
    "met": false,
    "value": 138.0,
    "threshold": 150,
    "reason": "정상 범위",
    "by_medication": false
   }
  },
  "count": 0,
  "evaluable": 5,
  "is_metabolic_syndrome": false
 },
 "population_16yr": {
  "source": {
   "years": "2009~2024",
   "total_rows": 15957665,
   "label": "국민건강보험공단 표본 1,596만 건"
  },
  "combo_oe": {},
  "disclaimer": "국민건강보험공단 표본 2009~2024년 15,957,665건을 재분석한 모집단 통계입니다. 원자료에 약 복용 정보가 없어 모집단 유병률은 '검진 수치 기준'이며, 서비스 판정('수치 또는 해당 약 복용')보다 좁게 잡힙니다. 개인식별자가 없어 연도별 독립 단면이므로 개인의 경과가 아니라 집단 비교입니다. 지질검사가 들어간 조합은 검사가 전원에게 실시된 2009~2017년만 집계했습니다.",
  "peer_prevalence": {
    "g_pre_hypertension": {
     "name": "고혈압 전단계",
     "pct": 37.4,
     "n_eval": 62567
    },
   "g_hypertension": {
    "name": "고혈압",
    "pct": 15.1,
    "n_eval": 62567
   },
   "g_diabetes": {
    "name": "당뇨",
    "pct": 6.6,
    "n_eval": 62567
   },
   "g_pre_diabetes": {
    "name": "당뇨 전단계",
    "pct": 35.9,
    "n_eval": 62567
   },
   "g_metabolic_syndrome": {
    "name": "대사증후군",
    "pct": 29.4,
    "n_eval": 30631
   },
   "g_obesity": {
    "name": "비만",
    "pct": 53.7,
    "n_eval": 62567
   },
   "g_dyslipidemia": {
    "name": "이상지질혈증",
    "pct": 44.3,
    "n_eval": 30622
   },
   "g_fatty_liver_suspect": {
    "name": "지방간 의심",
    "pct": 32.7,
    "n_eval": 62566
   }
  },
  "age_fixed_trend": {
   "age_band": "40~44세",
   "sex": "남성",
   "items": [
    {
     "group": "g_obesity",
     "name": "비만",
     "y2009": 35.8,
     "y2024": 53.7,
     "diff": 18.0,
     "ratio": 1.5
    },
    {
     "group": "g_fatty_liver_suspect",
     "name": "지방간 의심",
     "y2009": 22.0,
     "y2024": 32.7,
     "diff": 10.7,
     "ratio": 1.49
    },
    {
     "group": "g_dyslipidemia",
     "name": "이상지질혈증",
     "y2009": 35.7,
     "y2024": 44.3,
     "diff": 8.5,
     "ratio": 1.24
    },
    {
     "group": "g_metabolic_syndrome",
     "name": "대사증후군",
     "y2009": 27.7,
     "y2024": 29.4,
     "diff": 1.7,
     "ratio": 1.06
    },
    {
     "group": "g_pre_diabetes",
     "name": "당뇨 전단계",
     "y2009": 34.3,
     "y2024": 35.9,
     "diff": 1.6,
     "ratio": 1.05
    },
    {
     "group": "g_diabetes",
     "name": "당뇨",
     "y2009": 12.9,
     "y2024": 6.6,
     "diff": -6.3,
     "ratio": 0.51
    },
    {
     "group": "g_hypertension",
     "name": "고혈압",
     "y2009": 24.3,
     "y2024": 15.1,
     "diff": -9.2,
     "ratio": 0.62
    }
   ]
  },
  "care_distribution": {
   "혈압 관리 참고군": {
    "total": 62567,
    "dist": [
     {
      "hits": 0,
      "n": 37528,
      "pct": 60.0
     },
     {
      "hits": 1,
      "n": 12081,
      "pct": 19.3
     },
     {
      "hits": 2,
      "n": 12958,
      "pct": 20.7
     }
    ]
   },
   "신장 기능 관찰군": {
    "total": 62461,
    "dist": [
     {
      "hits": 0,
      "n": 59980,
      "pct": 96.0
     },
     {
      "hits": 1,
      "n": 2407,
      "pct": 3.9
     },
     {
      "hits": 2,
      "n": 74,
      "pct": 0.1
     }
    ]
   },
   "대사 관리 참고군": {
    "total": 30593,
    "dist": [
     {
      "hits": 0,
      "n": 6832,
      "pct": 22.3
     },
     {
      "hits": 1,
      "n": 7964,
      "pct": 26.0
     },
     {
      "hits": 2,
      "n": 7328,
      "pct": 24.0
     },
     {
      "hits": 3,
      "n": 5235,
      "pct": 17.1
     },
     {
      "hits": 4,
      "n": 2691,
      "pct": 8.8
     },
     {
      "hits": 5,
      "n": 543,
      "pct": 1.8
     }
    ]
   },
   "지질 관리 참고군": {
    "total": 29230,
    "dist": [
     {
      "hits": 0,
      "n": 7405,
      "pct": 25.3
     },
     {
      "hits": 1,
      "n": 5061,
      "pct": 17.3
     },
     {
      "hits": 2,
      "n": 10777,
      "pct": 36.9
     },
     {
      "hits": 3,
      "n": 5088,
      "pct": 17.4
     },
     {
      "hits": 4,
      "n": 899,
      "pct": 3.1
     }
    ]
   },
   "간 기능 관찰군": {
    "total": 62563,
    "dist": [
     {
      "hits": 0,
      "n": 41331,
      "pct": 66.1
     },
     {
      "hits": 1,
      "n": 11567,
      "pct": 18.5
     },
     {
      "hits": 2,
      "n": 6392,
      "pct": 10.2
     },
     {
      "hits": 3,
      "n": 3273,
      "pct": 5.2
     }
    ]
   }
  }
 }
}) as unknown as RealComboAnalysis,
  2014: ({
 "combo_groups": {
  "matched": [],
  "not_evaluable": [],
  "matched_count": 0,
  "ascvd_risk_combos": [],
  "highest_synergy": null,
  "population": {
   "year": 2024,
   "total_n": 994018,
   "source": "국민건강보험공단 표본 (최신 연도)"
  },
  "caveats": [
   "모집단 통계는 공단 원자료 기준이라 약물 복용 정보가 없습니다. 서비스 판정은 '수치 또는 해당 약물 복용'을 함께 보므로, 약을 드시는 분은 모집단 기준보다 넓게 잡힐 수 있습니다.",
   "모집단의 지방간 의심 기준은 GGT>60이고 서비스 기준은 GGT>75입니다 (약대 자문 반영). 두 기준이 달라 비교 시 참고가 필요합니다.",
   "O/E비는 '함께 나타나는 경향'을 뜻하며 인과관계나 개인의 위험도 예측이 아닙니다."
  ]
 },
 "fatty_liver": {
  "applicable": false,
  "type": null,
  "provisional": false,
  "basis": "지방간 의심에 해당하지 않아 유형 구분 대상이 아닙니다.",
  "cardiometabolic_factors": [],
  "indices": {
   "fli": {
    "value": 37.7,
    "level": "intermediate",
    "interpretation": "판단 보류 구간 (중간)",

    "plain": "지방간인지 아닌지 가리기 어려운 중간이에요",
    "cutoffs": "<30 낮음 / 30~59 중간 / ≥60 높음",
    "formula": "Fatty Liver Index (Bedogni 2006)"
   },
   "hsi": {
    "value": 32.6,
    "level": "intermediate",
    "interpretation": "판단 보류 구간 (중간)",

    "plain": "지방간인지 아닌지 가리기 어려운 중간이에요",
    "cutoffs": "<30 낮음 / 30~36 중간 / >36 시사",
    "formula": "Hepatic Steatosis Index (Lee 2010, 한국인 기반)"
   },
   "unavailable": [],
   "disclaimer": "FLI·HSI는 검진 수치로 지방간 가능성을 가늠하는 선별용 참고 지표입니다. 초음파 등 영상 검사에 의한 진단을 대체하지 않습니다."
  }
 },
 "disclaimer": "조합 그룹 결과는 국민건강보험공단 표본과의 통계 비교이며, 진단이 아닙니다. 판단은 의료진과 상담하세요.",
 "single_groups": [
  {
   "key": "g_hypertension",
   "name": "고혈압",
   "category": "임상",
   "desc": "수축기 ≥140 또는 이완기 ≥90 또는 고혈압약 복용",
   "applies": false
  },
  {
   "key": "g_pre_hypertension",
   "name": "고혈압 전단계",
   "category": "임상",
   "desc": "수축기 130-139 또는 이완기 80-89",
   "applies": true
  },
  {
   "key": "g_diabetes",
   "name": "당뇨",
   "category": "임상",
   "desc": "공복혈당 ≥126 또는 당뇨약 복용",
   "applies": false
  },
  {
   "key": "g_pre_diabetes",
   "name": "당뇨 전단계",
   "category": "임상",
   "desc": "공복혈당 100-125",
   "applies": true
  },
  {
   "key": "g_metabolic_syndrome",
   "name": "대사증후군",
   "category": "임상",
   "desc": "5개 기준 중 3개 이상 (약물 복용 포함)",
   "applies": false
  },
  {
   "key": "g_obesity",
   "name": "비만",
   "category": "임상",
   "desc": "BMI ≥25",
   "applies": false
  },
  {
   "key": "g_dyslipidemia",
   "name": "이상지질혈증",
   "category": "임상",
   "desc": "LDL≥160 또는 HDL미달 또는 TG≥200 또는 이상지질혈증약 복용",
   "applies": false
  },
  {
   "key": "g_fatty_liver_suspect",
   "name": "지방간 의심",
   "category": "임상",
   "desc": "ALT>40 또는 GGT>75",
   "applies": false
  },
  {
   "key": "g_smoker_current",
   "name": "현재 흡연자",
   "category": "생활습관",
   "desc": null,
   "applies": true
  },
  {
   "key": "g_smoker_former",
   "name": "과거 흡연자",
   "category": "생활습관",
   "desc": null,
   "applies": false
  },
  {
   "key": "g_non_smoker",
   "name": "비흡연자",
   "category": "생활습관",
   "desc": null,
   "applies": false
  },
  {
   "key": "g_drinker",
   "name": "음주자",
   "category": "생활습관",
   "desc": null,
   "applies": true
  },
  {
   "key": "g_non_drinker",
   "name": "비음주자",
   "category": "생활습관",
   "desc": null,
   "applies": false
  }
 ],
 "ascvd_simulation": {
  "available": true,
  "is_simulation": true,
  "risk_percent": 6.6,
  "risk_level": "borderline",
  "risk_label": "경계 구간",
  "inputs": {
   "age": 46,
   "gender": "남",
   "total_cholesterol": 206.0,
   "hdl": 46.0,
   "sbp": 126.0,
   "smoker": true,
   "diabetes": false,
   "on_bp_medication": false
  },
  "scenarios": [
   {
    "name": "금연했다면",
    "risk_percent": 2.6,
    "delta": -4.0
   },
   {
    "name": "수축기혈압이 120이라면",
    "risk_percent": 6.1,
    "delta": -0.5
   },
   {
    "name": "HDL이 60이라면",
    "risk_percent": 4.8,
    "delta": -1.8
   }
  ],
  "method": "Pooled Cohort Equations (2013 ACC/AHA)",
  "limitations": [
   "이 식은 미국 코호트에서 만들어졌으며 한국인에서는 위험도를 실제보다 높게 추정하는 경향이 보고되었습니다.",
   "국내 진료지침은 이 식을 한국인에게 그대로 적용하도록 권고하지 않습니다.",
   "따라서 표시된 %는 진단이나 예측이 아니라, 수치가 달라질 때 위험이 어느 방향으로 얼마나 움직이는지 보기 위한 참고 시뮬레이션입니다.",
   "가족력·병력이 반영되지 않아 실제 위험과 다를 수 있습니다."
  ],
  "how_to_read": "절대적인 % 값보다, 아래 '무엇을 바꾸면' 항목의 변화 폭을 참고하세요."
 },
 "calculators": {
  "items": [
   {
    "key": "non_hdl_c",
    "title": "Non-HDL 콜레스테롤",
    "category": "lipid",
    "value": 160.0,
    "level": "borderline",
    "interpretation": "경계 고위험",
    "inputs": {
     "total_cholesterol": 206.0,
     "hdl": 46.0
    },
    "cutoffs": "<130 적정 / 130~159 적정상회 / 160~189 경계 / 190~219 높음 / ≥220 매우높음 (NCEP ATP III)",
    "note": "개인 목표치는 위험군에 따라 다릅니다(비-HDL 목표 = LDL 목표 + 30).",
    "formula": "Non-HDL-C = 총콜레스테롤 − HDL",
    "peer_label": "한국인 46세 남성 중 상위 38%",
    "percentile": 61.5,
    "peer_n": 64143,
    "peer_year": 2017,
    "driver": "또래 중앙값과 견주면 총콜레스테롤과 낮은 HDL가 비슷하게 끌어올렸어요."
   },
   {
    "key": "castelli_1",
    "title": "Castelli 지수 I",
    "category": "lipid",
    "value": 4.48,
    "level": "intermediate",
    "interpretation": "경계",
    "cutoffs": "<4.0 적정 / 4.0~5.0 경계 / >5.0 높음 (참고, 성별·문헌별 상이)",
    "formula": "Castelli-I = 총콜레스테롤 / HDL",
    "peer_label": "한국인 46세 남성 중 상위 33%",
    "percentile": 66.8,
    "peer_n": 64144,
    "peer_year": 2017
   },
   {
    "key": "castelli_2",
    "title": "Castelli 지수 II",
    "category": "lipid",
    "value": 2.91,
    "level": "low",
    "interpretation": "적정",
    "cutoffs": "<3.0 적정 / 3.0~3.5 경계 / >3.5 높음 (참고)",
    "formula": "Castelli-II = LDL / HDL",
    "peer_label": "한국인 46세 남성 중 상위 25%",
    "percentile": 75,
    "peer_n": 63820,
    "peer_year": 2017
   },
   {
    "key": "aip",
    "title": "AIP 죽상형성지수",
    "category": "lipid",
    "value": 0.136,
    "level": "intermediate",
    "interpretation": "중간 위험",
    "cutoffs": "<0.11 저위험 / 0.11~0.21 중간 / >0.21 고위험 (Dobiásová)",
    "formula": "AIP = log10(TG/HDL), mmol/L 변환 적용",
    "percentile": 57,
    "peer_label": "한국인 46세 남성 중 상위 43%",
    "peer_n": 64098,
    "peer_year": 2017,
    "driver": "또래 중앙값과 견주면 낮은 HDL 쪽이 이 값을 더 끌어올렸어요."
   },
   {
    "key": "tyg",
    "title": "TyG 지수",
    "category": "insulin",
    "value": 8.89,
    "level": "intermediate",
    "interpretation": "경계 (참고 구간)",
    "inputs": {
     "tg": 144.0,
     "fbs": 101.0
    },
    "cutoffs": "<8.5 낮음 / 8.5~8.9 경계 / ≥9.0 높음 (연구별 상이, 참고용)",
    "note": "국제 단일 진단 컷오프는 미확립이나, 한국 성인 대사증후군 스크리닝용으로 ~8.8이 반복 검증됨(Shin 2019 등). 한국인 국가검진 55세 남성 중앙값도 8.80.",
    "formula": "TyG = ln(TG × 공복혈당 / 2)  [Simental-Mendía 2008]",
    "percentile": 52.4,
    "peer_label": "한국인 46세 남성 중 상위 48%",
    "peer_n": 64108,
    "peer_year": 2017,
    "driver": "또래 중앙값과 견주면 중성지방과 공복혈당이 비슷하게 끌어올렸어요."
   },
   {
    "key": "mets_ir",
    "title": "METS-IR",
    "category": "insulin",
    "value": 36.06,
    "level": "low",
    "interpretation": "참고: 인슐린저항성 낮은 편",
    "cutoffs": "참고선 ~50 (검증된 단일 컷오프 없음, 연구별 상이)",
    "formula": "METS-IR = ln(2·FPG+TG)·BMI / ln(HDL)",
    "note": "인슐린저항성 대리지표. 진단 컷오프 미확립 — 추이·참고용.",
    "percentile": 44.7,
    "peer_label": "한국인 46세 남성 중 하위 45%",
    "peer_n": 64098,
    "peer_year": 2017
   },
   {
    "key": "lap",
    "title": "LAP 지질축적산물",
    "category": "adiposity",
    "value": 32.5,
    "level": "info",
    "interpretation": "지질축적 정도(참고)",
    "cutoffs": "단일 컷오프 없음 — 집단 내 사분위로 해석",
    "formula": "LAP = (허리−65)×TG(mmol/L)",
    "note": "내장지방·대사위험 대리지표. 진단 컷오프 미확립.",
    "percentile": 51.8,
    "peer_label": "한국인 46세 남성 중 상위 48%",
    "peer_n": 63864,
    "peer_year": 2017
   },
   {
    "key": "vai",
    "title": "VAI 내장지방지수",
    "category": "adiposity",
    "value": 1.76,
    "level": "info",
    "interpretation": "내장지방 기능이상 정도(참고)",
    "cutoffs": "정상체중 건강군 ≈1.0 기준 (연령별 컷오프 필요)",
    "formula": "VAI = 성별식(WC·BMI·TG·HDL), mmol/L 변환 적용",
    "note": "내장지방 기능이상 대리지표. 연령의존 컷오프 — 참고용.",
    "percentile": 56.8,
    "peer_label": "한국인 46세 남성 중 상위 43%",
    "peer_n": 64095,
    "peer_year": 2017
   },
   {
    "key": "de_ritis",
    "title": "De Ritis 비 (AST/ALT)",
    "category": "liver",
    "value": 0.89,
    "level": "low",
    "interpretation": "비알코올성/급성 간질환 시사 (<1)",
    "cutoffs": "<1 비알코올/급성 / 1~2 중간 / >2 알코올성·진행 시사",
    "formula": "De Ritis = AST / ALT",
    "peer_label": "한국인 46세 남성 중 하위 40%",
    "percentile": 40.1,
    "peer_n": 62357,
    "peer_year": 2014
   },
   {
    "key": "alt_ggt",
    "title": "ALT/GGT 비",
    "category": "liver",
    "value": 0.64,
    "level": "info",
    "interpretation": "알코올성 간질환 쪽 시사 (<1)",
    "cutoffs": "<1 알코올성 쪽 / ≥1 비알코올성 쪽 (유형 감별 보조, 중증도 아님)",
    "formula": "ALT / GGT",
    "note": "유형을 가늠하는 보조 지표로, 진단이 아닙니다. 음주량(주당 순알코올)을 함께 보면 정확도가 올라갑니다."
   },
   {
    "key": "bard",
    "title": "BARD 점수",
    "category": "liver",
    "value": 2,
    "level": "high",
    "interpretation": "진행 간섬유화 배제 불가 (추가 평가 권장)",

    "plain": "간이 굳고 있는지 더 확인해 볼 필요가 있어요",
    "components": [
     "AST/ALT≥0.8 (+2)"
    ],
    "inputs": {
     "bmi": 23.6,
     "ast": 25.0,
     "alt": 28.0,
     "ast_alt_ratio": 0.89,
     "diabetes": false
    },
    "cutoffs": "0~1 배제 쪽 / 2~4 배제 불가",
    "formula": "BARD = BMI≥28(1) + AST/ALT≥0.8(2) + 당뇨(1)  [Harrison 2008]"
   },
   {
    "key": "map",
    "title": "평균동맥압 (MAP)",
    "category": "bp",
    "value": 96.0,
    "level": "low",
    "interpretation": "정상 범위",
    "cutoffs": "70~100 정상 / <70 낮음 / >110 높음 (mmHg)",
    "formula": "MAP = (SBP + 2×DBP) / 3",
    "peer_label": "한국인 46세 남성 중 상위 39%",
    "percentile": 60.5,
    "peer_n": 62357,
    "peer_year": 2014,
    "driver": "또래 중앙값과 견주면 수축기혈압 쪽이 이 값을 더 끌어올렸어요."
   },
   {
    "key": "prevent",
    "title": "AHA PREVENT (10·30년)",
    "category": "cardiovascular",
    "value": 3.9,
    "unit": "%",
    "level": "low",
    "interpretation": "10년 심혈관(CVD) 위험 낮음",
    "value_30yr": 21.2,
    "cutoffs": "<5 낮음 / 5~7.5 경계 / 7.5~20 중간 / ≥20 높음",
    "formula": "AHA PREVENT Total CVD (Khan 2024, race-free·eGFR 반영)",
    "note": "30년 위험 21.2%. PCE 후속 모델(30~79세). 참고용, 진단 아님."
   },
   {
    "key": "framingham",
    "title": "Framingham Hard CHD (10년)",
    "category": "cardiovascular",
    "value": 10.4,
    "unit": "%",
    "level": "borderline",
    "interpretation": "10년 관상동맥질환 위험 중간",
    "cutoffs": "<5 낮음 / 5~7.5 경계 / 7.5~20 중간 / ≥20 높음",
    "formula": "Framingham Hard CHD 10년 (Wilson 1998, MDCalc calc/38)",
    "note": "당뇨 미반영·서구 코호트 기반 참고용. 진단 아님."
   },
   {
    "key": "score2",
    "title": "SCORE2 / OP (10년)",
    "category": "cardiovascular",
    "value": 5.5,
    "unit": "%",
    "level": "intermediate",
    "interpretation": "10년 심혈관(CVD) 위험 경계",
    "cutoffs": "<5 낮음 / 5~7.5 경계 / 7.5~20 중간 / ≥20 높음",
    "formula": "SCORE2 (ESC 2021, High-risk 지역 보정)",
    "note": "유럽 모델을 한국에 High-risk 지역으로 근사한 참고값. 진단 아님."
   }
  ],
  "unavailable": [],
  "disclaimer": "검진 수치로 산출하는 선별용 참고 지표입니다. 진단을 대체하지 않으며, 컷오프는 연구·위험군에 따라 달라질 수 있습니다. 위험엔진(PREVENT·Framingham)은 서구 코호트 기반 참고용 시뮬레이션입니다."
 },
 "ldl_target": {
  "risk_level": "moderate",
  "label": "중등도위험군",
  "target_ldl": 130,
  "target_text": "LDL 130mg/dL 미만",
  "current_ldl": 134.0,
  "achieved": false,
  "gap": 4.0,
  "ldl_reliable": true,
  "reliability_note": null,
  "tg_value": 144.0,
  "risk_factors": [
   "현재 흡연",
   "연령(남 45세 이상)"
  ],
  "basis": "주요 위험인자 2개: 현재 흡연, 연령(남 45세 이상)",
  "on_medication": false,
  "limitations": [
   "검진 결과만으로는 심혈관 질환 병력·가족력을 알 수 없어, 실제 위험도는 여기 표시된 등급보다 높을 수 있습니다.",
   "고위험군·초고위험군 판정에는 관상동맥질환 등 병력 확인이 필요합니다."
  ],
  "reference": "2022 한국지질·동맥경화학회 이상지질혈증 진료지침"
 },
 "rarity": {
  "clinical_groups": [
   "고혈압 전단계",
   "당뇨 전단계"
  ],
  "lifestyle_groups": [
   "현재 흡연자",
   "음주자"
  ],
  "clinical_count": 2,
  "lifestyle_count": 2,
  "interpretation": "복합 위험 요인 (적극 관리 필요)"
 },
 "metabolic_syndrome_detail": {
  "factors": {
   "복부비만": {
    "met": false,
    "value": 85.0,
    "threshold": 90,
    "reason": "정상 범위",
    "by_medication": false
   },
   "고혈압": {
    "met": false,
    "value": "126.0/81.0",
    "threshold": "130/85",
    "reason": "정상 범위",
    "by_medication": false
   },
   "고혈당": {
    "met": true,
    "value": 101.0,
    "threshold": 100,
    "reason": "공복혈당 101.0 (기준 ≥100)",
    "by_medication": false
   },
   "낮은 HDL": {
    "met": false,
    "value": 46.0,
    "threshold": "<40",
    "reason": "정상 범위",
    "by_medication": false
   },
   "고중성지방": {
    "met": false,
    "value": 144.0,
    "threshold": 150,
    "reason": "정상 범위",
    "by_medication": false
   }
  },
  "count": 1,
  "evaluable": 5,
  "is_metabolic_syndrome": false
 },
 "population_16yr": {
  "source": {
   "years": "2009~2024",
   "total_rows": 15957665,
   "label": "국민건강보험공단 표본 1,596만 건"
  },
  "combo_oe": {},
  "disclaimer": "국민건강보험공단 표본 2009~2024년 15,957,665건을 재분석한 모집단 통계입니다. 원자료에 약 복용 정보가 없어 모집단 유병률은 '검진 수치 기준'이며, 서비스 판정('수치 또는 해당 약 복용')보다 좁게 잡힙니다. 개인식별자가 없어 연도별 독립 단면이므로 개인의 경과가 아니라 집단 비교입니다. 지질검사가 들어간 조합은 검사가 전원에게 실시된 2009~2017년만 집계했습니다.",
  "peer_prevalence": {
    "g_pre_hypertension": {
     "name": "고혈압 전단계",
     "pct": 38.9,
     "n_eval": 50548
    },
   "g_hypertension": {
    "name": "고혈압",
    "pct": 16.1,
    "n_eval": 50548
   },
   "g_diabetes": {
    "name": "당뇨",
    "pct": 9.3,
    "n_eval": 50548
   },
   "g_pre_diabetes": {
    "name": "당뇨 전단계",
    "pct": 39.9,
    "n_eval": 50548
   },
   "g_metabolic_syndrome": {
    "name": "대사증후군",
    "pct": 30.7,
    "n_eval": 15875
   },
   "g_obesity": {
    "name": "비만",
    "pct": 52.0,
    "n_eval": 50548
   },
   "g_dyslipidemia": {
    "name": "이상지질혈증",
    "pct": 43.4,
    "n_eval": 15870
   },
   "g_fatty_liver_suspect": {
    "name": "지방간 의심",
    "pct": 31.1,
    "n_eval": 50548
   }
  },
  "age_fixed_trend": {
   "age_band": "45~49세",
   "sex": "남성",
   "items": [
    {
     "group": "g_obesity",
     "name": "비만",
     "y2009": 32.3,
     "y2024": 52.0,
     "diff": 19.7,
     "ratio": 1.61
    },
    {
     "group": "g_fatty_liver_suspect",
     "name": "지방간 의심",
     "y2009": 18.4,
     "y2024": 31.1,
     "diff": 12.7,
     "ratio": 1.69
    },
    {
     "group": "g_dyslipidemia",
     "name": "이상지질혈증",
     "y2009": 34.1,
     "y2024": 43.4,
     "diff": 9.2,
     "ratio": 1.27
    },
    {
     "group": "g_pre_diabetes",
     "name": "당뇨 전단계",
     "y2009": 33.4,
     "y2024": 39.9,
     "diff": 6.5,
     "ratio": 1.19
    },
    {
     "group": "g_metabolic_syndrome",
     "name": "대사증후군",
     "y2009": 27.5,
     "y2024": 30.7,
     "diff": 3.3,
     "ratio": 1.12
    },
    {
     "group": "g_diabetes",
     "name": "당뇨",
     "y2009": 13.4,
     "y2024": 9.3,
     "diff": -4.0,
     "ratio": 0.7
    },
    {
     "group": "g_hypertension",
     "name": "고혈압",
     "y2009": 27.1,
     "y2024": 16.1,
     "diff": -11.0,
     "ratio": 0.59
    }
   ]
  },
  "care_distribution": {
   "혈압 관리 참고군": {
    "total": 50548,
    "dist": [
     {
      "hits": 0,
      "n": 29269,
      "pct": 57.9
     },
     {
      "hits": 1,
      "n": 10202,
      "pct": 20.2
     },
     {
      "hits": 2,
      "n": 11077,
      "pct": 21.9
     }
    ]
   },
   "지질 관리 참고군": {
    "total": 15235,
    "dist": [
     {
      "hits": 0,
      "n": 4042,
      "pct": 26.5
     },
     {
      "hits": 1,
      "n": 2898,
      "pct": 19.0
     },
     {
      "hits": 2,
      "n": 5331,
      "pct": 35.0
     },
     {
      "hits": 3,
      "n": 2530,
      "pct": 16.6
     },
     {
      "hits": 4,
      "n": 434,
      "pct": 2.8
     }
    ]
   },
   "간 기능 관찰군": {
    "total": 50544,
    "dist": [
     {
      "hits": 0,
      "n": 34154,
      "pct": 67.6
     },
     {
      "hits": 1,
      "n": 9281,
      "pct": 18.4
     },
     {
      "hits": 2,
      "n": 4781,
      "pct": 9.5
     },
     {
      "hits": 3,
      "n": 2328,
      "pct": 4.6
     }
    ]
   },
   "신장 기능 관찰군": {
    "total": 50436,
    "dist": [
     {
      "hits": 0,
      "n": 48449,
      "pct": 96.1
     },
     {
      "hits": 1,
      "n": 1900,
      "pct": 3.8
     },
     {
      "hits": 2,
      "n": 87,
      "pct": 0.2
     }
    ]
   },
   "대사 관리 참고군": {
    "total": 15863,
    "dist": [
     {
      "hits": 0,
      "n": 2999,
      "pct": 18.9
     },
     {
      "hits": 1,
      "n": 4146,
      "pct": 26.1
     },
     {
      "hits": 2,
      "n": 4166,
      "pct": 26.3
     },
     {
      "hits": 3,
      "n": 2957,
      "pct": 18.6
     },
     {
      "hits": 4,
      "n": 1356,
      "pct": 8.5
     },
     {
      "hits": 5,
      "n": 239,
      "pct": 1.5
     }
    ]
   }
  }
 }
}) as unknown as RealComboAnalysis,
  2016: ({
 "combo_groups": {
  "matched": [
   {
    "combo_name": "대사증후군+흡연",
    "category": "심혈관",
    "meaning": "심혈관 위험 매우 증가",
    "relation": "different_axis",
    "relation_label": "서로 다른 축이라 위험이 곱해집니다",
    "action": "대사 쪽과 혈관 쪽이 겹쳐 위험이 곱해져요. 금연이 단일 항목 중 가장 크게 낮춥니다.",
    "components": [
     "대사증후군",
     "현재 흡연자"
    ],
    "is_ascvd_risk": true,
    "population": {
     "n_in_combo": 30427,
     "pct_of_total": 3.06,
     "expected_n_if_independent": 23081,
     "observed_to_expected": 1.32,
     "top_metrics": [
      {
       "metric": "트리글리세라이드",
       "combo_mean": 248.08,
       "non_combo_mean": 121.65,
       "diff": 126.43,
       "cohens_d": 1.458,
       "single_means": {
        "대사증후군": 189.95,
        "현재 흡연자": 130.26
       }
      },
      {
       "metric": "허리둘레",
       "combo_mean": 94.88,
       "non_combo_mean": 81.12,
       "diff": 13.75,
       "cohens_d": 1.307,
       "single_means": {
        "대사증후군": 92.56,
        "현재 흡연자": 83.59
       }
      },
      {
       "metric": "BMI",
       "combo_mean": 28.33,
       "non_combo_mean": 24.1,
       "diff": 4.23,
       "cohens_d": 1.08,
       "single_means": {
        "대사증후군": 27.92,
        "현재 흡연자": 24.35
       }
      }
     ]
    }
   }
  ],
  "not_evaluable": [],
  "matched_count": 1,
  "ascvd_risk_combos": [
   "대사증후군+흡연"
  ],
  "highest_synergy": {
   "combo_name": "대사증후군+흡연",
   "category": "심혈관",
   "meaning": "심혈관 위험 매우 증가",
   "components": [
    "대사증후군",
    "현재 흡연자"
   ],
   "is_ascvd_risk": true,
   "population": {
    "n_in_combo": 30427,
    "pct_of_total": 3.06,
    "expected_n_if_independent": 23081,
    "observed_to_expected": 1.32,
    "top_metrics": [
     {
      "metric": "트리글리세라이드",
      "combo_mean": 248.08,
      "non_combo_mean": 121.65,
      "diff": 126.43,
      "cohens_d": 1.458,
      "single_means": {
       "대사증후군": 189.95,
       "현재 흡연자": 130.26
      }
     },
     {
      "metric": "허리둘레",
      "combo_mean": 94.88,
      "non_combo_mean": 81.12,
      "diff": 13.75,
      "cohens_d": 1.307,
      "single_means": {
       "대사증후군": 92.56,
       "현재 흡연자": 83.59
      }
     },
     {
      "metric": "BMI",
      "combo_mean": 28.33,
      "non_combo_mean": 24.1,
      "diff": 4.23,
      "cohens_d": 1.08,
      "single_means": {
       "대사증후군": 27.92,
       "현재 흡연자": 24.35
      }
     }
    ]
   }
  },
  "population": {
   "year": 2024,
   "total_n": 994018,
   "source": "국민건강보험공단 표본 (최신 연도)"
  },
  "caveats": [
   "모집단 통계는 공단 원자료 기준이라 약물 복용 정보가 없습니다. 서비스 판정은 '수치 또는 해당 약물 복용'을 함께 보므로, 약을 드시는 분은 모집단 기준보다 넓게 잡힐 수 있습니다.",
   "모집단의 지방간 의심 기준은 GGT>60이고 서비스 기준은 GGT>75입니다 (약대 자문 반영). 두 기준이 달라 비교 시 참고가 필요합니다.",
   "O/E비는 '함께 나타나는 경향'을 뜻하며 인과관계나 개인의 위험도 예측이 아닙니다."
  ]
 },
 "fatty_liver": {
  "applicable": false,
  "type": null,
  "provisional": false,
  "basis": "지방간 의심에 해당하지 않아 유형 구분 대상이 아닙니다.",
  "cardiometabolic_factors": [],
  "indices": {
   "fli": {
    "value": 53.3,
    "level": "intermediate",
    "interpretation": "판단 보류 구간 (중간)",

    "plain": "지방간인지 아닌지 가리기 어려운 중간이에요",
    "cutoffs": "<30 낮음 / 30~59 중간 / ≥60 높음",
    "formula": "Fatty Liver Index (Bedogni 2006)"
   },
   "hsi": {
    "value": 33.9,
    "level": "intermediate",
    "interpretation": "판단 보류 구간 (중간)",

    "plain": "지방간인지 아닌지 가리기 어려운 중간이에요",
    "cutoffs": "<30 낮음 / 30~36 중간 / >36 시사",
    "formula": "Hepatic Steatosis Index (Lee 2010, 한국인 기반)"
   },
   "unavailable": [],
   "disclaimer": "FLI·HSI는 검진 수치로 지방간 가능성을 가늠하는 선별용 참고 지표입니다. 초음파 등 영상 검사에 의한 진단을 대체하지 않습니다."
  }
 },
 "disclaimer": "조합 그룹 결과는 국민건강보험공단 표본과의 통계 비교이며, 진단이 아닙니다. 판단은 의료진과 상담하세요.",
 "single_groups": [
  {
   "key": "g_hypertension",
   "name": "고혈압",
   "category": "임상",
   "desc": "수축기 ≥140 또는 이완기 ≥90 또는 고혈압약 복용",
   "applies": false
  },
  {
   "key": "g_pre_hypertension",
   "name": "고혈압 전단계",
   "category": "임상",
   "desc": "수축기 130-139 또는 이완기 80-89",
   "applies": true
  },
  {
   "key": "g_diabetes",
   "name": "당뇨",
   "category": "임상",
   "desc": "공복혈당 ≥126 또는 당뇨약 복용",
   "applies": false
  },
  {
   "key": "g_pre_diabetes",
   "name": "당뇨 전단계",
   "category": "임상",
   "desc": "공복혈당 100-125",
   "applies": true
  },
  {
   "key": "g_metabolic_syndrome",
   "name": "대사증후군",
   "category": "임상",
   "desc": "5개 기준 중 3개 이상 (약물 복용 포함)",
   "applies": true
  },
  {
   "key": "g_obesity",
   "name": "비만",
   "category": "임상",
   "desc": "BMI ≥25",
   "applies": false
  },
  {
   "key": "g_dyslipidemia",
   "name": "이상지질혈증",
   "category": "임상",
   "desc": "LDL≥160 또는 HDL미달 또는 TG≥200 또는 이상지질혈증약 복용",
   "applies": false
  },
  {
   "key": "g_fatty_liver_suspect",
   "name": "지방간 의심",
   "category": "임상",
   "desc": "ALT>40 또는 GGT>75",
   "applies": false
  },
  {
   "key": "g_smoker_current",
   "name": "현재 흡연자",
   "category": "생활습관",
   "desc": null,
   "applies": true
  },
  {
   "key": "g_smoker_former",
   "name": "과거 흡연자",
   "category": "생활습관",
   "desc": null,
   "applies": false
  },
  {
   "key": "g_non_smoker",
   "name": "비흡연자",
   "category": "생활습관",
   "desc": null,
   "applies": false
  },
  {
   "key": "g_drinker",
   "name": "음주자",
   "category": "생활습관",
   "desc": null,
   "applies": true
  },
  {
   "key": "g_non_drinker",
   "name": "비음주자",
   "category": "생활습관",
   "desc": null,
   "applies": false
  }
 ],
 "ascvd_simulation": {
  "available": true,
  "is_simulation": true,
  "risk_percent": 9.0,
  "risk_level": "intermediate",
  "risk_label": "중간 구간",
  "inputs": {
   "age": 48,
   "gender": "남",
   "total_cholesterol": 210.0,
   "hdl": 42.0,
   "sbp": 130.0,
   "smoker": true,
   "diabetes": false,
   "on_bp_medication": false
  },
  "scenarios": [
   {
    "name": "금연했다면",
    "risk_percent": 3.8,
    "delta": -5.2
   },
   {
    "name": "수축기혈압이 120이라면",
    "risk_percent": 7.8,
    "delta": -1.2
   },
   {
    "name": "HDL이 60이라면",
    "risk_percent": 6.1,
    "delta": -2.9
   }
  ],
  "method": "Pooled Cohort Equations (2013 ACC/AHA)",
  "limitations": [
   "이 식은 미국 코호트에서 만들어졌으며 한국인에서는 위험도를 실제보다 높게 추정하는 경향이 보고되었습니다.",
   "국내 진료지침은 이 식을 한국인에게 그대로 적용하도록 권고하지 않습니다.",
   "따라서 표시된 %는 진단이나 예측이 아니라, 수치가 달라질 때 위험이 어느 방향으로 얼마나 움직이는지 보기 위한 참고 시뮬레이션입니다.",
   "가족력·병력이 반영되지 않아 실제 위험과 다를 수 있습니다."
  ],
  "how_to_read": "절대적인 % 값보다, 아래 '무엇을 바꾸면' 항목의 변화 폭을 참고하세요."
 },
 "calculators": {
  "items": [
   {
    "key": "non_hdl_c",
    "title": "Non-HDL 콜레스테롤",
    "category": "lipid",
    "value": 168.0,
    "level": "borderline",
    "interpretation": "경계 고위험",
    "inputs": {
     "total_cholesterol": 210.0,
     "hdl": 42.0
    },
    "cutoffs": "<130 적정 / 130~159 적정상회 / 160~189 경계 / 190~219 높음 / ≥220 매우높음 (NCEP ATP III)",
    "note": "개인 목표치는 위험군에 따라 다릅니다(비-HDL 목표 = LDL 목표 + 30).",
    "formula": "Non-HDL-C = 총콜레스테롤 − HDL",
    "peer_label": "한국인 48세 남성 중 상위 31%",
    "percentile": 69.2,
    "peer_n": 64143,
    "peer_year": 2017,
    "driver": "또래 중앙값과 견주면 총콜레스테롤과 낮은 HDL가 비슷하게 끌어올렸어요."
   },
   {
    "key": "castelli_1",
    "title": "Castelli 지수 I",
    "category": "lipid",
    "value": 5.0,
    "level": "high",
    "interpretation": "높음",
    "cutoffs": "<4.0 적정 / 4.0~5.0 경계 / >5.0 높음 (참고, 성별·문헌별 상이)",
    "formula": "Castelli-I = 총콜레스테롤 / HDL",
    "peer_label": "한국인 48세 남성 중 상위 20%",
    "percentile": 79.7,
    "peer_n": 64144,
    "peer_year": 2017
   },
   {
    "key": "castelli_2",
    "title": "Castelli 지수 II",
    "category": "lipid",
    "value": 3.33,
    "level": "intermediate",
    "interpretation": "경계",
    "cutoffs": "<3.0 적정 / 3.0~3.5 경계 / >3.5 높음 (참고)",
    "formula": "Castelli-II = LDL / HDL",
    "peer_label": "한국인 48세 남성 중 상위 15%",
    "percentile": 85.3,
    "peer_n": 63820,
    "peer_year": 2017
   },
   {
    "key": "aip",
    "title": "AIP 죽상형성지수",
    "category": "lipid",
    "value": 0.21,
    "level": "intermediate",
    "interpretation": "중간 위험",
    "cutoffs": "<0.11 저위험 / 0.11~0.21 중간 / >0.21 고위험 (Dobiásová)",
    "formula": "AIP = log10(TG/HDL), mmol/L 변환 적용",
    "percentile": 65.6,
    "peer_label": "한국인 48세 남성 중 상위 34%",
    "peer_n": 64098,
    "peer_year": 2017,
    "driver": "또래 중앙값과 견주면 낮은 HDL 쪽이 이 값을 더 끌어올렸어요."
   },
   {
    "key": "tyg",
    "title": "TyG 지수",
    "category": "insulin",
    "value": 9.0,
    "level": "high",
    "interpretation": "인슐린저항성 가능성 높음",
    "inputs": {
     "tg": 156.0,
     "fbs": 104.0
    },
    "cutoffs": "<8.5 낮음 / 8.5~8.9 경계 / ≥9.0 높음 (연구별 상이, 참고용)",
    "note": "국제 단일 진단 컷오프는 미확립이나, 한국 성인 대사증후군 스크리닝용으로 ~8.8이 반복 검증됨(Shin 2019 등). 한국인 국가검진 55세 남성 중앙값도 8.80.",
    "formula": "TyG = ln(TG × 공복혈당 / 2)  [Simental-Mendía 2008]",
    "percentile": 58.6,
    "peer_label": "한국인 48세 남성 중 상위 41%",
    "peer_n": 64108,
    "peer_year": 2017,
    "driver": "또래 중앙값과 견주면 중성지방 쪽이 이 값을 더 끌어올렸어요."
   },
   {
    "key": "mets_ir",
    "title": "METS-IR",
    "category": "insulin",
    "value": 38.52,
    "level": "low",
    "interpretation": "참고: 인슐린저항성 낮은 편",
    "cutoffs": "참고선 ~50 (검증된 단일 컷오프 없음, 연구별 상이)",
    "formula": "METS-IR = ln(2·FPG+TG)·BMI / ln(HDL)",
    "note": "인슐린저항성 대리지표. 진단 컷오프 미확립 — 추이·참고용.",
    "percentile": 58,
    "peer_label": "한국인 48세 남성 중 상위 42%",
    "peer_n": 64098,
    "peer_year": 2017
   },
   {
    "key": "lap",
    "title": "LAP 지질축적산물",
    "category": "adiposity",
    "value": 40.5,
    "level": "info",
    "interpretation": "지질축적 정도(참고)",
    "cutoffs": "단일 컷오프 없음 — 집단 내 사분위로 해석",
    "formula": "LAP = (허리−65)×TG(mmol/L)",
    "note": "내장지방·대사위험 대리지표. 진단 컷오프 미확립.",
    "percentile": 61.1,
    "peer_label": "한국인 48세 남성 중 상위 39%",
    "peer_n": 63864,
    "peer_year": 2017
   },
   {
    "key": "vai",
    "title": "VAI 내장지방지수",
    "category": "adiposity",
    "value": 2.12,
    "level": "info",
    "interpretation": "내장지방 기능이상 정도(참고)",
    "cutoffs": "정상체중 건강군 ≈1.0 기준 (연령별 컷오프 필요)",
    "formula": "VAI = 성별식(WC·BMI·TG·HDL), mmol/L 변환 적용",
    "note": "내장지방 기능이상 대리지표. 연령의존 컷오프 — 참고용.",
    "percentile": 66,
    "peer_label": "한국인 48세 남성 중 상위 34%",
    "peer_n": 64095,
    "peer_year": 2017
   },
   {
    "key": "de_ritis",
    "title": "De Ritis 비 (AST/ALT)",
    "category": "liver",
    "value": 0.84,
    "level": "low",
    "interpretation": "비알코올성/급성 간질환 시사 (<1)",
    "cutoffs": "<1 비알코올/급성 / 1~2 중간 / >2 알코올성·진행 시사",
    "formula": "De Ritis = AST / ALT",
    "peer_label": "한국인 48세 남성 중 하위 36%",
    "percentile": 36.3,
    "peer_n": 63908,
    "peer_year": 2016
   },
   {
    "key": "alt_ggt",
    "title": "ALT/GGT 비",
    "category": "liver",
    "value": 0.48,
    "level": "info",
    "interpretation": "알코올성 간질환 쪽 시사 (<1)",
    "cutoffs": "<1 알코올성 쪽 / ≥1 비알코올성 쪽 (유형 감별 보조, 중증도 아님)",
    "formula": "ALT / GGT",
    "note": "유형을 가늠하는 보조 지표로, 진단이 아닙니다. 음주량(주당 순알코올)을 함께 보면 정확도가 올라갑니다."
   },
   {
    "key": "bard",
    "title": "BARD 점수",
    "category": "liver",
    "value": 2,
    "level": "high",
    "interpretation": "진행 간섬유화 배제 불가 (추가 평가 권장)",

    "plain": "간이 굳고 있는지 더 확인해 볼 필요가 있어요",
    "components": [
     "AST/ALT≥0.8 (+2)"
    ],
    "inputs": {
     "bmi": 24.4,
     "ast": 27.0,
     "alt": 32.0,
     "ast_alt_ratio": 0.84,
     "diabetes": false
    },
    "cutoffs": "0~1 배제 쪽 / 2~4 배제 불가",
    "formula": "BARD = BMI≥28(1) + AST/ALT≥0.8(2) + 당뇨(1)  [Harrison 2008]"
   },
   {
    "key": "map",
    "title": "평균동맥압 (MAP)",
    "category": "bp",
    "value": 98.7,
    "level": "low",
    "interpretation": "정상 범위",
    "cutoffs": "70~100 정상 / <70 낮음 / >110 높음 (mmHg)",
    "formula": "MAP = (SBP + 2×DBP) / 3",
    "peer_label": "한국인 48세 남성 중 상위 30%",
    "percentile": 70.1,
    "peer_n": 63908,
    "peer_year": 2016,
    "driver": "또래 중앙값과 견주면 수축기혈압과 이완기혈압이 비슷하게 끌어올렸어요."
   },
   {
    "key": "prevent",
    "title": "AHA PREVENT (10·30년)",
    "category": "cardiovascular",
    "value": 5.1,
    "unit": "%",
    "level": "intermediate",
    "interpretation": "10년 심혈관(CVD) 위험 경계",
    "value_30yr": 25.4,
    "cutoffs": "<5 낮음 / 5~7.5 경계 / 7.5~20 중간 / ≥20 높음",
    "formula": "AHA PREVENT Total CVD (Khan 2024, race-free·eGFR 반영)",
    "note": "30년 위험 25.4%. PCE 후속 모델(30~79세). 참고용, 진단 아님."
   },
   {
    "key": "framingham",
    "title": "Framingham Hard CHD (10년)",
    "category": "cardiovascular",
    "value": 13.2,
    "unit": "%",
    "level": "borderline",
    "interpretation": "10년 관상동맥질환 위험 중간",
    "cutoffs": "<5 낮음 / 5~7.5 경계 / 7.5~20 중간 / ≥20 높음",
    "formula": "Framingham Hard CHD 10년 (Wilson 1998, MDCalc calc/38)",
    "note": "당뇨 미반영·서구 코호트 기반 참고용. 진단 아님."
   },
   {
    "key": "score2",
    "title": "SCORE2 / OP (10년)",
    "category": "cardiovascular",
    "value": 7.2,
    "unit": "%",
    "level": "intermediate",
    "interpretation": "10년 심혈관(CVD) 위험 경계",
    "cutoffs": "<5 낮음 / 5~7.5 경계 / 7.5~20 중간 / ≥20 높음",
    "formula": "SCORE2 (ESC 2021, High-risk 지역 보정)",
    "note": "유럽 모델을 한국에 High-risk 지역으로 근사한 참고값. 진단 아님."
   }
  ],
  "unavailable": [],
  "disclaimer": "검진 수치로 산출하는 선별용 참고 지표입니다. 진단을 대체하지 않으며, 컷오프는 연구·위험군에 따라 달라질 수 있습니다. 위험엔진(PREVENT·Framingham)은 서구 코호트 기반 참고용 시뮬레이션입니다."
 },
 "ldl_target": {
  "risk_level": "moderate",
  "label": "중등도위험군",
  "target_ldl": 130,
  "target_text": "LDL 130mg/dL 미만",
  "current_ldl": 140.0,
  "achieved": false,
  "gap": 10.0,
  "ldl_reliable": true,
  "reliability_note": null,
  "tg_value": 156.0,
  "risk_factors": [
   "현재 흡연",
   "연령(남 45세 이상)"
  ],
  "basis": "주요 위험인자 2개: 현재 흡연, 연령(남 45세 이상)",
  "on_medication": false,
  "limitations": [
   "검진 결과만으로는 심혈관 질환 병력·가족력을 알 수 없어, 실제 위험도는 여기 표시된 등급보다 높을 수 있습니다.",
   "고위험군·초고위험군 판정에는 관상동맥질환 등 병력 확인이 필요합니다."
  ],
  "reference": "2022 한국지질·동맥경화학회 이상지질혈증 진료지침"
 },
 "rarity": {
  "clinical_groups": [
   "고혈압 전단계",
   "당뇨 전단계",
   "대사증후군"
  ],
  "lifestyle_groups": [
   "현재 흡연자",
   "음주자"
  ],
  "clinical_count": 3,
  "lifestyle_count": 2,
  "interpretation": "다중 위험 요인 (의료 상담 권장)"
 },
 "metabolic_syndrome_detail": {
  "factors": {
   "복부비만": {
    "met": false,
    "value": 88.0,
    "threshold": 90,
    "reason": "정상 범위",
    "by_medication": false
   },
   "고혈압": {
    "met": true,
    "value": "130.0/83.0",
    "threshold": "130/85",
    "reason": "혈압 130.0/83.0 (기준 ≥130/85)",
    "by_medication": false
   },
   "고혈당": {
    "met": true,
    "value": 104.0,
    "threshold": 100,
    "reason": "공복혈당 104.0 (기준 ≥100)",
    "by_medication": false
   },
   "낮은 HDL": {
    "met": false,
    "value": 42.0,
    "threshold": "<40",
    "reason": "정상 범위",
    "by_medication": false
   },
   "고중성지방": {
    "met": true,
    "value": 156.0,
    "threshold": 150,
    "reason": "TG 156.0 (기준 ≥150)",
    "by_medication": false
   }
  },
  "count": 3,
  "evaluable": 5,
  "is_metabolic_syndrome": true
 },
 "population_16yr": {
  "source": {
   "years": "2009~2024",
   "total_rows": 15957665,
   "label": "국민건강보험공단 표본 1,596만 건"
  },
  "combo_oe": {
   "대사증후군+흡연": {
    "median": 1.17,
    "min": 1.11,
    "max": 1.26,
    "n_years": 9,
    "year_from": 2009,
    "year_to": 2017,
    "lipid_era_only": true,
    "by_year": [
     {
      "year": 2009,
      "oe": 1.108
     },
     {
      "year": 2010,
      "oe": 1.143
     },
     {
      "year": 2011,
      "oe": 1.146
     },
     {
      "year": 2012,
      "oe": 1.171
     },
     {
      "year": 2013,
      "oe": 1.173
     },
     {
      "year": 2014,
      "oe": 1.201
     },
     {
      "year": 2015,
      "oe": 1.222
     },
     {
      "year": 2016,
      "oe": 1.234
     },
     {
      "year": 2017,
      "oe": 1.263
     }
    ]
   }
  },
  "disclaimer": "국민건강보험공단 표본 2009~2024년 15,957,665건을 재분석한 모집단 통계입니다. 원자료에 약 복용 정보가 없어 모집단 유병률은 '검진 수치 기준'이며, 서비스 판정('수치 또는 해당 약 복용')보다 좁게 잡힙니다. 개인식별자가 없어 연도별 독립 단면이므로 개인의 경과가 아니라 집단 비교입니다. 지질검사가 들어간 조합은 검사가 전원에게 실시된 2009~2017년만 집계했습니다.",
  "peer_prevalence": {
    "g_pre_hypertension": {
     "name": "고혈압 전단계",
     "pct": 38.9,
     "n_eval": 50548
    },
   "g_hypertension": {
    "name": "고혈압",
    "pct": 16.1,
    "n_eval": 50548
   },
   "g_diabetes": {
    "name": "당뇨",
    "pct": 9.3,
    "n_eval": 50548
   },
   "g_pre_diabetes": {
    "name": "당뇨 전단계",
    "pct": 39.9,
    "n_eval": 50548
   },
   "g_metabolic_syndrome": {
    "name": "대사증후군",
    "pct": 30.7,
    "n_eval": 15875
   },
   "g_obesity": {
    "name": "비만",
    "pct": 52.0,
    "n_eval": 50548
   },
   "g_dyslipidemia": {
    "name": "이상지질혈증",
    "pct": 43.4,
    "n_eval": 15870
   },
   "g_fatty_liver_suspect": {
    "name": "지방간 의심",
    "pct": 31.1,
    "n_eval": 50548
   }
  },
  "age_fixed_trend": {
   "age_band": "45~49세",
   "sex": "남성",
   "items": [
    {
     "group": "g_obesity",
     "name": "비만",
     "y2009": 32.3,
     "y2024": 52.0,
     "diff": 19.7,
     "ratio": 1.61
    },
    {
     "group": "g_fatty_liver_suspect",
     "name": "지방간 의심",
     "y2009": 18.4,
     "y2024": 31.1,
     "diff": 12.7,
     "ratio": 1.69
    },
    {
     "group": "g_dyslipidemia",
     "name": "이상지질혈증",
     "y2009": 34.1,
     "y2024": 43.4,
     "diff": 9.2,
     "ratio": 1.27
    },
    {
     "group": "g_pre_diabetes",
     "name": "당뇨 전단계",
     "y2009": 33.4,
     "y2024": 39.9,
     "diff": 6.5,
     "ratio": 1.19
    },
    {
     "group": "g_metabolic_syndrome",
     "name": "대사증후군",
     "y2009": 27.5,
     "y2024": 30.7,
     "diff": 3.3,
     "ratio": 1.12
    },
    {
     "group": "g_diabetes",
     "name": "당뇨",
     "y2009": 13.4,
     "y2024": 9.3,
     "diff": -4.0,
     "ratio": 0.7
    },
    {
     "group": "g_hypertension",
     "name": "고혈압",
     "y2009": 27.1,
     "y2024": 16.1,
     "diff": -11.0,
     "ratio": 0.59
    }
   ]
  },
  "care_distribution": {
   "대사 관리 참고군": {
    "total": 15863,
    "dist": [
     {
      "hits": 0,
      "n": 2999,
      "pct": 18.9
     },
     {
      "hits": 1,
      "n": 4146,
      "pct": 26.1
     },
     {
      "hits": 2,
      "n": 4166,
      "pct": 26.3
     },
     {
      "hits": 3,
      "n": 2957,
      "pct": 18.6
     },
     {
      "hits": 4,
      "n": 1356,
      "pct": 8.5
     },
     {
      "hits": 5,
      "n": 239,
      "pct": 1.5
     }
    ]
   },
   "지질 관리 참고군": {
    "total": 15235,
    "dist": [
     {
      "hits": 0,
      "n": 4042,
      "pct": 26.5
     },
     {
      "hits": 1,
      "n": 2898,
      "pct": 19.0
     },
     {
      "hits": 2,
      "n": 5331,
      "pct": 35.0
     },
     {
      "hits": 3,
      "n": 2530,
      "pct": 16.6
     },
     {
      "hits": 4,
      "n": 434,
      "pct": 2.8
     }
    ]
   },
   "신장 기능 관찰군": {
    "total": 50436,
    "dist": [
     {
      "hits": 0,
      "n": 48449,
      "pct": 96.1
     },
     {
      "hits": 1,
      "n": 1900,
      "pct": 3.8
     },
     {
      "hits": 2,
      "n": 87,
      "pct": 0.2
     }
    ]
   },
   "혈압 관리 참고군": {
    "total": 50548,
    "dist": [
     {
      "hits": 0,
      "n": 29269,
      "pct": 57.9
     },
     {
      "hits": 1,
      "n": 10202,
      "pct": 20.2
     },
     {
      "hits": 2,
      "n": 11077,
      "pct": 21.9
     }
    ]
   },
   "간 기능 관찰군": {
    "total": 50544,
    "dist": [
     {
      "hits": 0,
      "n": 34154,
      "pct": 67.6
     },
     {
      "hits": 1,
      "n": 9281,
      "pct": 18.4
     },
     {
      "hits": 2,
      "n": 4781,
      "pct": 9.5
     },
     {
      "hits": 3,
      "n": 2328,
      "pct": 4.6
     }
    ]
   }
  }
 }
}) as unknown as RealComboAnalysis,
  2018: ({
 "combo_groups": {
  "matched": [
   {
    "combo_name": "대사증후군+비만",
    "category": "대사",
    "meaning": "대사 이상 가중",
    "relation": "shared_criterion",
    "relation_label": "판정 항목을 공유합니다",
    "action": "허리둘레가 두 판정에 모두 들어가 있어요. 허리 하나가 둘을 같이 움직입니다.",
    "components": [
     "대사증후군",
     "비만"
    ],
    "is_ascvd_risk": false,
    "population": {
     "n_in_combo": 99183,
     "pct_of_total": 9.98,
     "expected_n_if_independent": 47068,
     "observed_to_expected": 2.11,
     "top_metrics": [
      {
       "metric": "허리둘레",
       "combo_mean": 95.54,
       "non_combo_mean": 79.99,
       "diff": 15.55,
       "cohens_d": 1.598,
       "single_means": {
        "대사증후군": 84.68,
        "비만": 89.1
       }
      },
      {
       "metric": "BMI",
       "combo_mean": 29.4,
       "non_combo_mean": 23.65,
       "diff": 5.74,
       "cohens_d": 1.597,
       "single_means": {
        "대사증후군": 23.24,
        "비만": 27.9
       }
      },
      {
       "metric": "수축기혈압",
       "combo_mean": 135.94,
       "non_combo_mean": 121.23,
       "diff": 14.71,
       "cohens_d": 1.057,
       "single_means": {
        "대사증후군": 134.79,
        "비만": 124.17
       }
      }
     ]
    }
   },
   {
    "combo_name": "흡연+음주+비만",
    "category": "생활습관 트리플",
    "meaning": "생활습관 위험 가중",
    "relation": "different_axis",
    "relation_label": "서로 다른 축이라 위험이 곱해집니다",
    "action": "셋이 서로 다른 경로라 하나씩 줄여야 해요. 금연이 가장 크게 낮추는 한 걸음입니다.",
    "components": [
     "현재 흡연자",
     "음주자",
     "비만"
    ],
    "is_ascvd_risk": false,
    "population": {
     "n_in_combo": 69670,
     "pct_of_total": 7.01,
     "expected_n_if_independent": 43621,
     "observed_to_expected": 1.6,
     "top_metrics": [
      {
       "metric": "BMI",
       "combo_mean": 28.48,
       "non_combo_mean": 23.91,
       "diff": 4.58,
       "cohens_d": 1.2,
       "single_means": {
        "현재 흡연자": 21.92,
        "음주자": 21.83,
        "비만": 28.21
       }
      },
      {
       "metric": "허리둘레",
       "combo_mean": 92.79,
       "non_combo_mean": 80.7,
       "diff": 12.09,
       "cohens_d": 1.17,
       "single_means": {
        "현재 흡연자": 78.95,
        "음주자": 75.44,
        "비만": 89.83
       }
      },
      {
       "metric": "혈색소",
       "combo_mean": 15.5,
       "non_combo_mean": 14.12,
       "diff": 1.38,
       "cohens_d": 0.923,
       "single_means": {
        "현재 흡연자": 14.73,
        "음주자": 13.93,
        "비만": 14.05
       }
      }
     ]
    }
   },
   {
    "combo_name": "대사증후군+흡연",
    "category": "심혈관",
    "meaning": "심혈관 위험 매우 증가",
    "relation": "different_axis",
    "relation_label": "서로 다른 축이라 위험이 곱해집니다",
    "action": "대사 쪽과 혈관 쪽이 겹쳐 위험이 곱해져요. 금연이 단일 항목 중 가장 크게 낮춥니다.",
    "components": [
     "대사증후군",
     "현재 흡연자"
    ],
    "is_ascvd_risk": true,
    "population": {
     "n_in_combo": 30427,
     "pct_of_total": 3.06,
     "expected_n_if_independent": 23081,
     "observed_to_expected": 1.32,
     "top_metrics": [
      {
       "metric": "트리글리세라이드",
       "combo_mean": 248.08,
       "non_combo_mean": 121.65,
       "diff": 126.43,
       "cohens_d": 1.458,
       "single_means": {
        "대사증후군": 189.95,
        "현재 흡연자": 130.26
       }
      },
      {
       "metric": "허리둘레",
       "combo_mean": 94.88,
       "non_combo_mean": 81.12,
       "diff": 13.75,
       "cohens_d": 1.307,
       "single_means": {
        "대사증후군": 92.56,
        "현재 흡연자": 83.59
       }
      },
      {
       "metric": "BMI",
       "combo_mean": 28.33,
       "non_combo_mean": 24.1,
       "diff": 4.23,
       "cohens_d": 1.08,
       "single_means": {
        "대사증후군": 27.92,
        "현재 흡연자": 24.35
       }
      }
     ]
    }
   },
   {
    "combo_name": "비만+당뇨전단계",
    "category": "대사",
    "meaning": "당뇨 진행 위험군",
    "relation": "same_cause",
    "relation_label": "같은 원인에서 함께 나옵니다",
    "action": "아직 당뇨로 넘어가기 전 단계예요. 이 구간에서는 체중 감량이 진행을 되돌릴 수 있습니다.",
    "components": [
     "비만",
     "당뇨 전단계"
    ],
    "is_ascvd_risk": false,
    "population": {
     "n_in_combo": 145168,
     "pct_of_total": 14.6,
     "expected_n_if_independent": 117491,
     "observed_to_expected": 1.24,
     "top_metrics": [
      {
       "metric": "BMI",
       "combo_mean": 28.41,
       "non_combo_mean": 23.51,
       "diff": 4.9,
       "cohens_d": 1.363,
       "single_means": {
        "비만": 28.24,
        "당뇨 전단계": 22.29
       }
      },
      {
       "metric": "허리둘레",
       "combo_mean": 91.53,
       "non_combo_mean": 79.84,
       "diff": 11.69,
       "cohens_d": 1.173,
       "single_means": {
        "비만": 90.4,
        "당뇨 전단계": 78.39
       }
      },
      {
       "metric": "수축기혈압",
       "combo_mean": 128.63,
       "non_combo_mean": 121.68,
       "diff": 6.95,
       "cohens_d": 0.484,
       "single_means": {
        "비만": 126.52,
        "당뇨 전단계": 123.72
       }
      }
     ]
    }
   }
  ],
  "not_evaluable": [],
  "matched_count": 4,
  "ascvd_risk_combos": [
   "대사증후군+흡연"
  ],
  "highest_synergy": {
   "combo_name": "대사증후군+비만",
   "category": "대사",
   "meaning": "대사 이상 가중",
   "components": [
    "대사증후군",
    "비만"
   ],
   "is_ascvd_risk": false,
   "population": {
    "n_in_combo": 99183,
    "pct_of_total": 9.98,
    "expected_n_if_independent": 47068,
    "observed_to_expected": 2.11,
    "top_metrics": [
     {
      "metric": "허리둘레",
      "combo_mean": 95.54,
      "non_combo_mean": 79.99,
      "diff": 15.55,
      "cohens_d": 1.598,
      "single_means": {
       "대사증후군": 84.68,
       "비만": 89.1
      }
     },
     {
      "metric": "BMI",
      "combo_mean": 29.4,
      "non_combo_mean": 23.65,
      "diff": 5.74,
      "cohens_d": 1.597,
      "single_means": {
       "대사증후군": 23.24,
       "비만": 27.9
      }
     },
     {
      "metric": "수축기혈압",
      "combo_mean": 135.94,
      "non_combo_mean": 121.23,
      "diff": 14.71,
      "cohens_d": 1.057,
      "single_means": {
       "대사증후군": 134.79,
       "비만": 124.17
      }
     }
    ]
   }
  },
  "population": {
   "year": 2024,
   "total_n": 994018,
   "source": "국민건강보험공단 표본 (최신 연도)"
  },
  "caveats": [
   "모집단 통계는 공단 원자료 기준이라 약물 복용 정보가 없습니다. 서비스 판정은 '수치 또는 해당 약물 복용'을 함께 보므로, 약을 드시는 분은 모집단 기준보다 넓게 잡힐 수 있습니다.",
   "모집단의 지방간 의심 기준은 GGT>60이고 서비스 기준은 GGT>75입니다 (약대 자문 반영). 두 기준이 달라 비교 시 참고가 필요합니다.",
   "O/E비는 '함께 나타나는 경향'을 뜻하며 인과관계나 개인의 위험도 예측이 아닙니다."
  ]
 },
 "fatty_liver": {
  "applicable": false,
  "type": null,
  "provisional": false,
  "basis": "지방간 의심에 해당하지 않아 유형 구분 대상이 아닙니다.",
  "cardiometabolic_factors": [],
  "indices": {
   "fli": {
    "value": 64.5,
    "level": "high",
    "interpretation": "지방간 가능성 높음",

    "plain": "지방간일 가능성이 높아요",
    "cutoffs": "<30 낮음 / 30~59 중간 / ≥60 높음",
    "formula": "Fatty Liver Index (Bedogni 2006)"
   },
   "hsi": {
    "value": 35.3,
    "level": "intermediate",
    "interpretation": "판단 보류 구간 (중간)",

    "plain": "지방간인지 아닌지 가리기 어려운 중간이에요",
    "cutoffs": "<30 낮음 / 30~36 중간 / >36 시사",
    "formula": "Hepatic Steatosis Index (Lee 2010, 한국인 기반)"
   },
   "unavailable": [],
   "disclaimer": "FLI·HSI는 검진 수치로 지방간 가능성을 가늠하는 선별용 참고 지표입니다. 초음파 등 영상 검사에 의한 진단을 대체하지 않습니다."
  }
 },
 "disclaimer": "조합 그룹 결과는 국민건강보험공단 표본과의 통계 비교이며, 진단이 아닙니다. 판단은 의료진과 상담하세요.",
 "single_groups": [
  {
   "key": "g_hypertension",
   "name": "고혈압",
   "category": "임상",
   "desc": "수축기 ≥140 또는 이완기 ≥90 또는 고혈압약 복용",
   "applies": false
  },
  {
   "key": "g_pre_hypertension",
   "name": "고혈압 전단계",
   "category": "임상",
   "desc": "수축기 130-139 또는 이완기 80-89",
   "applies": true
  },
  {
   "key": "g_diabetes",
   "name": "당뇨",
   "category": "임상",
   "desc": "공복혈당 ≥126 또는 당뇨약 복용",
   "applies": false
  },
  {
   "key": "g_pre_diabetes",
   "name": "당뇨 전단계",
   "category": "임상",
   "desc": "공복혈당 100-125",
   "applies": true
  },
  {
   "key": "g_metabolic_syndrome",
   "name": "대사증후군",
   "category": "임상",
   "desc": "5개 기준 중 3개 이상 (약물 복용 포함)",
   "applies": true
  },
  {
   "key": "g_obesity",
   "name": "비만",
   "category": "임상",
   "desc": "BMI ≥25",
   "applies": true
  },
  {
   "key": "g_dyslipidemia",
   "name": "이상지질혈증",
   "category": "임상",
   "desc": "LDL≥160 또는 HDL미달 또는 TG≥200 또는 이상지질혈증약 복용",
   "applies": false
  },
  {
   "key": "g_fatty_liver_suspect",
   "name": "지방간 의심",
   "category": "임상",
   "desc": "ALT>40 또는 GGT>75",
   "applies": false
  },
  {
   "key": "g_smoker_current",
   "name": "현재 흡연자",
   "category": "생활습관",
   "desc": null,
   "applies": true
  },
  {
   "key": "g_smoker_former",
   "name": "과거 흡연자",
   "category": "생활습관",
   "desc": null,
   "applies": false
  },
  {
   "key": "g_non_smoker",
   "name": "비흡연자",
   "category": "생활습관",
   "desc": null,
   "applies": false
  },
  {
   "key": "g_drinker",
   "name": "음주자",
   "category": "생활습관",
   "desc": null,
   "applies": true
  },
  {
   "key": "g_non_drinker",
   "name": "비음주자",
   "category": "생활습관",
   "desc": null,
   "applies": false
  }
 ],
 "ascvd_simulation": {
  "available": true,
  "is_simulation": true,
  "risk_percent": 11.0,
  "risk_level": "intermediate",
  "risk_label": "중간 구간",
  "inputs": {
   "age": 50,
   "gender": "남",
   "total_cholesterol": 214.0,
   "hdl": 41.0,
   "sbp": 133.0,
   "smoker": true,
   "diabetes": false,
   "on_bp_medication": false
  },
  "scenarios": [
   {
    "name": "금연했다면",
    "risk_percent": 5.0,
    "delta": -6.0
   },
   {
    "name": "수축기혈압이 120이라면",
    "risk_percent": 9.2,
    "delta": -1.8
   },
   {
    "name": "HDL이 60이라면",
    "risk_percent": 7.4,
    "delta": -3.6
   }
  ],
  "method": "Pooled Cohort Equations (2013 ACC/AHA)",
  "limitations": [
   "이 식은 미국 코호트에서 만들어졌으며 한국인에서는 위험도를 실제보다 높게 추정하는 경향이 보고되었습니다.",
   "국내 진료지침은 이 식을 한국인에게 그대로 적용하도록 권고하지 않습니다.",
   "따라서 표시된 %는 진단이나 예측이 아니라, 수치가 달라질 때 위험이 어느 방향으로 얼마나 움직이는지 보기 위한 참고 시뮬레이션입니다.",
   "가족력·병력이 반영되지 않아 실제 위험과 다를 수 있습니다."
  ],
  "how_to_read": "절대적인 % 값보다, 아래 '무엇을 바꾸면' 항목의 변화 폭을 참고하세요."
 },
 "calculators": {
  "items": [
   {
    "key": "non_hdl_c",
    "title": "Non-HDL 콜레스테롤",
    "category": "lipid",
    "value": 173.0,
    "level": "borderline",
    "interpretation": "경계 고위험",
    "inputs": {
     "total_cholesterol": 214.0,
     "hdl": 41.0
    },
    "cutoffs": "<130 적정 / 130~159 적정상회 / 160~189 경계 / 190~219 높음 / ≥220 매우높음 (NCEP ATP III)",
    "note": "개인 목표치는 위험군에 따라 다릅니다(비-HDL 목표 = LDL 목표 + 30).",
    "formula": "Non-HDL-C = 총콜레스테롤 − HDL",
    "peer_label": "한국인 50세 남성 중 상위 24%",
    "percentile": 76.2,
    "peer_n": 65302,
    "peer_year": 2017,
    "driver": "또래 중앙값과 견주면 총콜레스테롤 쪽이 이 값을 더 끌어올렸어요."
   },
   {
    "key": "castelli_1",
    "title": "Castelli 지수 I",
    "category": "lipid",
    "value": 5.22,
    "level": "high",
    "interpretation": "높음",
    "cutoffs": "<4.0 적정 / 4.0~5.0 경계 / >5.0 높음 (참고, 성별·문헌별 상이)",
    "formula": "Castelli-I = 총콜레스테롤 / HDL",
    "peer_label": "한국인 50세 남성 중 상위 15%",
    "percentile": 85,
    "peer_n": 65303,
    "peer_year": 2017
   },
   {
    "key": "castelli_2",
    "title": "Castelli 지수 II",
    "category": "lipid",
    "value": 3.51,
    "level": "high",
    "interpretation": "높음",
    "cutoffs": "<3.0 적정 / 3.0~3.5 경계 / >3.5 높음 (참고)",
    "formula": "Castelli-II = LDL / HDL",
    "peer_label": "한국인 50세 남성 중 상위 10%",
    "percentile": 90,
    "peer_n": 65007,
    "peer_year": 2017
   },
   {
    "key": "aip",
    "title": "AIP 죽상형성지수",
    "category": "lipid",
    "value": 0.245,
    "level": "high",
    "interpretation": "고위험",
    "cutoffs": "<0.11 저위험 / 0.11~0.21 중간 / >0.21 고위험 (Dobiásová)",
    "formula": "AIP = log10(TG/HDL), mmol/L 변환 적용",
    "percentile": 71.8,
    "peer_label": "한국인 50세 남성 중 상위 28%",
    "peer_n": 65260,
    "peer_year": 2017,
    "driver": "또래 중앙값과 견주면 중성지방과 낮은 HDL가 비슷하게 끌어올렸어요."
   },
   {
    "key": "tyg",
    "title": "TyG 지수",
    "category": "insulin",
    "value": 9.09,
    "level": "high",
    "interpretation": "인슐린저항성 가능성 높음",
    "inputs": {
     "tg": 165.0,
     "fbs": 108.0
    },
    "cutoffs": "<8.5 낮음 / 8.5~8.9 경계 / ≥9.0 높음 (연구별 상이, 참고용)",
    "note": "국제 단일 진단 컷오프는 미확립이나, 한국 성인 대사증후군 스크리닝용으로 ~8.8이 반복 검증됨(Shin 2019 등). 한국인 국가검진 55세 남성 중앙값도 8.80.",
    "formula": "TyG = ln(TG × 공복혈당 / 2)  [Simental-Mendía 2008]",
    "percentile": 64.4,
    "peer_label": "한국인 50세 남성 중 상위 36%",
    "peer_n": 65272,
    "peer_year": 2017,
    "driver": "또래 중앙값과 견주면 중성지방 쪽이 이 값을 더 끌어올렸어요."
   },
   {
    "key": "mets_ir",
    "title": "METS-IR",
    "category": "insulin",
    "value": 40.64,
    "level": "low",
    "interpretation": "참고: 인슐린저항성 낮은 편",
    "cutoffs": "참고선 ~50 (검증된 단일 컷오프 없음, 연구별 상이)",
    "formula": "METS-IR = ln(2·FPG+TG)·BMI / ln(HDL)",
    "note": "인슐린저항성 대리지표. 진단 컷오프 미확립 — 추이·참고용.",
    "percentile": 71.4,
    "peer_label": "한국인 50세 남성 중 상위 29%",
    "peer_n": 65260,
    "peer_year": 2017
   },
   {
    "key": "lap",
    "title": "LAP 지질축적산물",
    "category": "adiposity",
    "value": 50.3,
    "level": "info",
    "interpretation": "지질축적 정도(참고)",
    "cutoffs": "단일 컷오프 없음 — 집단 내 사분위로 해석",
    "formula": "LAP = (허리−65)×TG(mmol/L)",
    "note": "내장지방·대사위험 대리지표. 진단 컷오프 미확립.",
    "percentile": 75.2,
    "peer_label": "한국인 50세 남성 중 상위 25%",
    "peer_n": 65021,
    "peer_year": 2017
   },
   {
    "key": "vai",
    "title": "VAI 내장지방지수",
    "category": "adiposity",
    "value": 2.35,
    "level": "info",
    "interpretation": "내장지방 기능이상 정도(참고)",
    "cutoffs": "정상체중 건강군 ≈1.0 기준 (연령별 컷오프 필요)",
    "formula": "VAI = 성별식(WC·BMI·TG·HDL), mmol/L 변환 적용",
    "note": "내장지방 기능이상 대리지표. 연령의존 컷오프 — 참고용.",
    "percentile": 74.4,
    "peer_label": "한국인 50세 남성 중 상위 26%",
    "peer_n": 65258,
    "peer_year": 2017
   },
   {
    "key": "de_ritis",
    "title": "De Ritis 비 (AST/ALT)",
    "category": "liver",
    "value": 0.81,
    "level": "low",
    "interpretation": "비알코올성/급성 간질환 시사 (<1)",
    "cutoffs": "<1 비알코올/급성 / 1~2 중간 / >2 알코올성·진행 시사",
    "formula": "De Ritis = AST / ALT",
    "peer_label": "한국인 50세 남성 중 하위 28%",
    "percentile": 27.7,
    "peer_n": 66275,
    "peer_year": 2018
   },
   {
    "key": "alt_ggt",
    "title": "ALT/GGT 비",
    "category": "liver",
    "value": 0.51,
    "level": "info",
    "interpretation": "알코올성 간질환 쪽 시사 (<1)",
    "cutoffs": "<1 알코올성 쪽 / ≥1 비알코올성 쪽 (유형 감별 보조, 중증도 아님)",
    "formula": "ALT / GGT",
    "note": "유형을 가늠하는 보조 지표로, 진단이 아닙니다. 음주량(주당 순알코올)을 함께 보면 정확도가 올라갑니다."
   },
   {
    "key": "bard",
    "title": "BARD 점수",
    "category": "liver",
    "value": 2,
    "level": "high",
    "interpretation": "진행 간섬유화 배제 불가 (추가 평가 권장)",

    "plain": "간이 굳고 있는지 더 확인해 볼 필요가 있어요",
    "components": [
     "AST/ALT≥0.8 (+2)"
    ],
    "inputs": {
     "bmi": 25.4,
     "ast": 30.0,
     "alt": 37.0,
     "ast_alt_ratio": 0.81,
     "diabetes": false
    },
    "cutoffs": "0~1 배제 쪽 / 2~4 배제 불가",
    "formula": "BARD = BMI≥28(1) + AST/ALT≥0.8(2) + 당뇨(1)  [Harrison 2008]"
   },
   {
    "key": "map",
    "title": "평균동맥압 (MAP)",
    "category": "bp",
    "value": 100.3,
    "level": "intermediate",
    "interpretation": "다소 높음",
    "cutoffs": "70~100 정상 / <70 낮음 / >110 높음 (mmHg)",
    "formula": "MAP = (SBP + 2×DBP) / 3",
    "peer_label": "한국인 50세 남성 중 상위 28%",
    "percentile": 72.5,
    "peer_n": 66276,
    "peer_year": 2018,
    "driver": "또래 중앙값과 견주면 수축기혈압과 이완기혈압이 비슷하게 끌어올렸어요."
   },
   {
    "key": "prevent",
    "title": "AHA PREVENT (10·30년)",
    "category": "cardiovascular",
    "value": 6.3,
    "unit": "%",
    "level": "intermediate",
    "interpretation": "10년 심혈관(CVD) 위험 경계",
    "value_30yr": 28.8,
    "cutoffs": "<5 낮음 / 5~7.5 경계 / 7.5~20 중간 / ≥20 높음",
    "formula": "AHA PREVENT Total CVD (Khan 2024, race-free·eGFR 반영)",
    "note": "30년 위험 28.8%. PCE 후속 모델(30~79세). 참고용, 진단 아님."
   },
   {
    "key": "framingham",
    "title": "Framingham Hard CHD (10년)",
    "category": "cardiovascular",
    "value": 15.3,
    "unit": "%",
    "level": "borderline",
    "interpretation": "10년 관상동맥질환 위험 중간",
    "cutoffs": "<5 낮음 / 5~7.5 경계 / 7.5~20 중간 / ≥20 높음",
    "formula": "Framingham Hard CHD 10년 (Wilson 1998, MDCalc calc/38)",
    "note": "당뇨 미반영·서구 코호트 기반 참고용. 진단 아님."
   },
   {
    "key": "score2",
    "title": "SCORE2 / OP (10년)",
    "category": "cardiovascular",
    "value": 8.6,
    "unit": "%",
    "level": "borderline",
    "interpretation": "10년 심혈관(CVD) 위험 중간",
    "cutoffs": "<5 낮음 / 5~7.5 경계 / 7.5~20 중간 / ≥20 높음",
    "formula": "SCORE2 (ESC 2021, High-risk 지역 보정)",
    "note": "유럽 모델을 한국에 High-risk 지역으로 근사한 참고값. 진단 아님."
   }
  ],
  "unavailable": [],
  "disclaimer": "검진 수치로 산출하는 선별용 참고 지표입니다. 진단을 대체하지 않으며, 컷오프는 연구·위험군에 따라 달라질 수 있습니다. 위험엔진(PREVENT·Framingham)은 서구 코호트 기반 참고용 시뮬레이션입니다."
 },
 "ldl_target": {
  "risk_level": "moderate",
  "label": "중등도위험군",
  "target_ldl": 130,
  "target_text": "LDL 130mg/dL 미만",
  "current_ldl": 144.0,
  "achieved": false,
  "gap": 14.0,
  "ldl_reliable": true,
  "reliability_note": null,
  "tg_value": 165.0,
  "risk_factors": [
   "현재 흡연",
   "연령(남 45세 이상)"
  ],
  "basis": "주요 위험인자 2개: 현재 흡연, 연령(남 45세 이상)",
  "on_medication": false,
  "limitations": [
   "검진 결과만으로는 심혈관 질환 병력·가족력을 알 수 없어, 실제 위험도는 여기 표시된 등급보다 높을 수 있습니다.",
   "고위험군·초고위험군 판정에는 관상동맥질환 등 병력 확인이 필요합니다."
  ],
  "reference": "2022 한국지질·동맥경화학회 이상지질혈증 진료지침"
 },
 "rarity": {
  "clinical_groups": [
   "고혈압 전단계",
   "당뇨 전단계",
   "비만",
   "대사증후군"
  ],
  "lifestyle_groups": [
   "현재 흡연자",
   "음주자"
  ],
  "clinical_count": 4,
  "lifestyle_count": 2,
  "interpretation": "고위험 패턴 (즉각 의료 진료 권장)"
 },
 "metabolic_syndrome_detail": {
  "factors": {
   "복부비만": {
    "met": true,
    "value": 92.0,
    "threshold": 90,
    "reason": "허리둘레 92.0cm (기준 ≥90)",
    "by_medication": false
   },
   "고혈압": {
    "met": true,
    "value": "133.0/84.0",
    "threshold": "130/85",
    "reason": "혈압 133.0/84.0 (기준 ≥130/85)",
    "by_medication": false
   },
   "고혈당": {
    "met": true,
    "value": 108.0,
    "threshold": 100,
    "reason": "공복혈당 108.0 (기준 ≥100)",
    "by_medication": false
   },
   "낮은 HDL": {
    "met": false,
    "value": 41.0,
    "threshold": "<40",
    "reason": "정상 범위",
    "by_medication": false
   },
   "고중성지방": {
    "met": true,
    "value": 165.0,
    "threshold": 150,
    "reason": "TG 165.0 (기준 ≥150)",
    "by_medication": false
   }
  },
  "count": 4,
  "evaluable": 5,
  "is_metabolic_syndrome": true
 },
 "population_16yr": {
  "source": {
   "years": "2009~2024",
   "total_rows": 15957665,
   "label": "국민건강보험공단 표본 1,596만 건"
  },
  "combo_oe": {
   "대사증후군+비만": {
    "median": 2.08,
    "min": 1.97,
    "max": 2.1,
    "n_years": 9,
    "year_from": 2009,
    "year_to": 2017,
    "lipid_era_only": true,
    "by_year": [
     {
      "year": 2009,
      "oe": 2.078
     },
     {
      "year": 2010,
      "oe": 2.093
     },
     {
      "year": 2011,
      "oe": 2.09
     },
     {
      "year": 2012,
      "oe": 2.096
     },
     {
      "year": 2013,
      "oe": 2.075
     },
     {
      "year": 2014,
      "oe": 2.0
     },
     {
      "year": 2015,
      "oe": 1.972
     },
     {
      "year": 2016,
      "oe": 2.016
     },
     {
      "year": 2017,
      "oe": 1.99
     }
    ]
   },
   "흡연+음주+비만": {
    "median": 1.59,
    "min": 1.58,
    "max": 1.61,
    "n_years": 5,
    "year_from": 2020,
    "year_to": 2024,
    "lipid_era_only": false,
    "by_year": [
     {
      "year": 2020,
      "oe": 1.593
     },
     {
      "year": 2021,
      "oe": 1.607
     },
     {
      "year": 2022,
      "oe": 1.591
     },
     {
      "year": 2023,
      "oe": 1.585
     },
     {
      "year": 2024,
      "oe": 1.597
     }
    ]
   },
   "대사증후군+흡연": {
    "median": 1.17,
    "min": 1.11,
    "max": 1.26,
    "n_years": 9,
    "year_from": 2009,
    "year_to": 2017,
    "lipid_era_only": true,
    "by_year": [
     {
      "year": 2009,
      "oe": 1.108
     },
     {
      "year": 2010,
      "oe": 1.143
     },
     {
      "year": 2011,
      "oe": 1.146
     },
     {
      "year": 2012,
      "oe": 1.171
     },
     {
      "year": 2013,
      "oe": 1.173
     },
     {
      "year": 2014,
      "oe": 1.201
     },
     {
      "year": 2015,
      "oe": 1.222
     },
     {
      "year": 2016,
      "oe": 1.234
     },
     {
      "year": 2017,
      "oe": 1.263
     }
    ]
   },
   "비만+당뇨전단계": {
    "median": 1.25,
    "min": 1.22,
    "max": 1.29,
    "n_years": 16,
    "year_from": 2009,
    "year_to": 2024,
    "lipid_era_only": false,
    "by_year": [
     {
      "year": 2009,
      "oe": 1.261
     },
     {
      "year": 2010,
      "oe": 1.284
     },
     {
      "year": 2011,
      "oe": 1.276
     },
     {
      "year": 2012,
      "oe": 1.291
     },
     {
      "year": 2013,
      "oe": 1.273
     },
     {
      "year": 2014,
      "oe": 1.252
     },
     {
      "year": 2015,
      "oe": 1.249
     },
     {
      "year": 2016,
      "oe": 1.254
     },
     {
      "year": 2017,
      "oe": 1.25
     },
     {
      "year": 2018,
      "oe": 1.236
     },
     {
      "year": 2019,
      "oe": 1.246
     },
     {
      "year": 2020,
      "oe": 1.223
     },
     {
      "year": 2021,
      "oe": 1.227
     },
     {
      "year": 2022,
      "oe": 1.237
     },
     {
      "year": 2023,
      "oe": 1.24
     },
     {
      "year": 2024,
      "oe": 1.236
     }
    ]
   }
  },
  "disclaimer": "국민건강보험공단 표본 2009~2024년 15,957,665건을 재분석한 모집단 통계입니다. 원자료에 약 복용 정보가 없어 모집단 유병률은 '검진 수치 기준'이며, 서비스 판정('수치 또는 해당 약 복용')보다 좁게 잡힙니다. 개인식별자가 없어 연도별 독립 단면이므로 개인의 경과가 아니라 집단 비교입니다. 지질검사가 들어간 조합은 검사가 전원에게 실시된 2009~2017년만 집계했습니다.",
  "peer_prevalence": {
    "g_pre_hypertension": {
     "name": "고혈압 전단계",
     "pct": 38.5,
     "n_eval": 63913
    },
   "g_hypertension": {
    "name": "고혈압",
    "pct": 17.0,
    "n_eval": 63913
   },
   "g_diabetes": {
    "name": "당뇨",
    "pct": 12.2,
    "n_eval": 63913
   },
   "g_pre_diabetes": {
    "name": "당뇨 전단계",
    "pct": 41.6,
    "n_eval": 63913
   },
   "g_metabolic_syndrome": {
    "name": "대사증후군",
    "pct": 30.0,
    "n_eval": 16863
   },
   "g_obesity": {
    "name": "비만",
    "pct": 49.1,
    "n_eval": 63913
   },
   "g_dyslipidemia": {
    "name": "이상지질혈증",
    "pct": 40.9,
    "n_eval": 16856
   },
   "g_fatty_liver_suspect": {
    "name": "지방간 의심",
    "pct": 29.1,
    "n_eval": 63913
   }
  },
  "age_fixed_trend": {
   "age_band": "50~54세",
   "sex": "남성",
   "items": [
    {
     "group": "g_obesity",
     "name": "비만",
     "y2009": 27.5,
     "y2024": 49.1,
     "diff": 21.6,
     "ratio": 1.78
    },
    {
     "group": "g_fatty_liver_suspect",
     "name": "지방간 의심",
     "y2009": 15.9,
     "y2024": 29.1,
     "diff": 13.2,
     "ratio": 1.83
    },
    {
     "group": "g_pre_diabetes",
     "name": "당뇨 전단계",
     "y2009": 32.9,
     "y2024": 41.6,
     "diff": 8.7,
     "ratio": 1.26
    },
    {
     "group": "g_dyslipidemia",
     "name": "이상지질혈증",
     "y2009": 32.8,
     "y2024": 40.9,
     "diff": 8.1,
     "ratio": 1.25
    },
    {
     "group": "g_metabolic_syndrome",
     "name": "대사증후군",
     "y2009": 26.4,
     "y2024": 30.0,
     "diff": 3.6,
     "ratio": 1.13
    },
    {
     "group": "g_diabetes",
     "name": "당뇨",
     "y2009": 12.3,
     "y2024": 12.2,
     "diff": -0.1,
     "ratio": 0.99
    },
    {
     "group": "g_hypertension",
     "name": "고혈압",
     "y2009": 28.0,
     "y2024": 17.0,
     "diff": -11.0,
     "ratio": 0.61
    }
   ]
  },
  "care_distribution": {
   "혈압 관리 참고군": {
    "total": 63913,
    "dist": [
     {
      "hits": 0,
      "n": 36738,
      "pct": 57.5
     },
     {
      "hits": 1,
      "n": 13058,
      "pct": 20.4
     },
     {
      "hits": 2,
      "n": 14117,
      "pct": 22.1
     }
    ]
   },
   "신장 기능 관찰군": {
    "total": 63727,
    "dist": [
     {
      "hits": 0,
      "n": 61003,
      "pct": 95.7
     },
     {
      "hits": 1,
      "n": 2573,
      "pct": 4.0
     },
     {
      "hits": 2,
      "n": 151,
      "pct": 0.2
     }
    ]
   },
   "간 기능 관찰군": {
    "total": 63909,
    "dist": [
     {
      "hits": 0,
      "n": 44304,
      "pct": 69.3
     },
     {
      "hits": 1,
      "n": 11142,
      "pct": 17.4
     },
     {
      "hits": 2,
      "n": 5669,
      "pct": 8.9
     },
     {
      "hits": 3,
      "n": 2794,
      "pct": 4.4
     }
    ]
   },
   "대사 관리 참고군": {
    "total": 16844,
    "dist": [
     {
      "hits": 0,
      "n": 2919,
      "pct": 17.3
     },
     {
      "hits": 1,
      "n": 4606,
      "pct": 27.3
     },
     {
      "hits": 2,
      "n": 4547,
      "pct": 27.0
     },
     {
      "hits": 3,
      "n": 3199,
      "pct": 19.0
     },
     {
      "hits": 4,
      "n": 1321,
      "pct": 7.8
     },
     {
      "hits": 5,
      "n": 252,
      "pct": 1.5
     }
    ]
   },
   "지질 관리 참고군": {
    "total": 16217,
    "dist": [
     {
      "hits": 0,
      "n": 4794,
      "pct": 29.6
     },
     {
      "hits": 1,
      "n": 3296,
      "pct": 20.3
     },
     {
      "hits": 2,
      "n": 5253,
      "pct": 32.4
     },
     {
      "hits": 3,
      "n": 2476,
      "pct": 15.3
     },
     {
      "hits": 4,
      "n": 398,
      "pct": 2.5
     }
    ]
   }
  }
 }
}) as unknown as RealComboAnalysis,
  2020: ({
 "combo_groups": {
  "matched": [
   {
    "combo_name": "비만+이상지질혈증+지방간의심",
    "category": "메타볼릭 트리오",
    "meaning": "대사이상 지방간 증후군 패턴",
    "relation": "same_cause",
    "relation_label": "같은 원인에서 함께 나옵니다",
    "action": "내장지방 하나가 셋을 같이 만들어요. 체중이 움직이면 셋이 함께 움직입니다.",
    "components": [
     "비만",
     "이상지질혈증",
     "지방간 의심"
    ],
    "is_ascvd_risk": false,
    "population": {
     "n_in_combo": 22444,
     "pct_of_total": 2.26,
     "expected_n_if_independent": 8394,
     "observed_to_expected": 2.67,
     "top_metrics": [
      {
       "metric": "혈청지피티(ALT)",
       "combo_mean": 59.39,
       "non_combo_mean": 23.01,
       "diff": 36.38,
       "cohens_d": 1.927,
       "single_means": {
        "비만": 22.74,
        "이상지질혈증": 20.28,
        "지방간 의심": 48.19
       }
      },
      {
       "metric": "트리글리세라이드",
       "combo_mean": 252.82,
       "non_combo_mean": 119.9,
       "diff": 132.92,
       "cohens_d": 1.559,
       "single_means": {
        "비만": 105.59,
        "이상지질혈증": 151.11,
        "지방간 의심": 107.59
       }
      },
      {
       "metric": "BMI",
       "combo_mean": 29.13,
       "non_combo_mean": 23.69,
       "diff": 5.44,
       "cohens_d": 1.489,
       "single_means": {
        "비만": 27.71,
        "이상지질혈증": 22.37,
        "지방간 의심": 22.37
       }
      }
     ]
    }
   },
   {
    "combo_name": "대사증후군+비만",
    "category": "대사",
    "meaning": "대사 이상 가중",
    "relation": "shared_criterion",
    "relation_label": "판정 항목을 공유합니다",
    "action": "허리둘레가 두 판정에 모두 들어가 있어요. 허리 하나가 둘을 같이 움직입니다.",
    "components": [
     "대사증후군",
     "비만"
    ],
    "is_ascvd_risk": false,
    "population": {
     "n_in_combo": 99183,
     "pct_of_total": 9.98,
     "expected_n_if_independent": 47068,
     "observed_to_expected": 2.11,
     "top_metrics": [
      {
       "metric": "허리둘레",
       "combo_mean": 95.54,
       "non_combo_mean": 79.99,
       "diff": 15.55,
       "cohens_d": 1.598,
       "single_means": {
        "대사증후군": 84.68,
        "비만": 89.1
       }
      },
      {
       "metric": "BMI",
       "combo_mean": 29.4,
       "non_combo_mean": 23.65,
       "diff": 5.74,
       "cohens_d": 1.597,
       "single_means": {
        "대사증후군": 23.24,
        "비만": 27.9
       }
      },
      {
       "metric": "수축기혈압",
       "combo_mean": 135.94,
       "non_combo_mean": 121.23,
       "diff": 14.71,
       "cohens_d": 1.057,
       "single_means": {
        "대사증후군": 134.79,
        "비만": 124.17
       }
      }
     ]
    }
   },
   {
    "combo_name": "비만+지방간의심",
    "category": "간 질환",
    "meaning": "대사이상 관련 지방간 (MASLD)",
    "relation": "same_cause",
    "relation_label": "같은 원인에서 함께 나옵니다",
    "action": "내장지방이 둘을 같이 만들어요. 체중을 5~10%만 줄여도 간에 낀 지방이 함께 빠집니다.",
    "components": [
     "비만",
     "지방간 의심"
    ],
    "is_ascvd_risk": false,
    "population": {
     "n_in_combo": 116214,
     "pct_of_total": 11.69,
     "expected_n_if_independent": 70551,
     "observed_to_expected": 1.65,
     "top_metrics": [
      {
       "metric": "혈청지피티(ALT)",
       "combo_mean": 58.1,
       "non_combo_mean": 22.33,
       "diff": 35.77,
       "cohens_d": 1.723,
       "single_means": {
        "비만": 22.77,
        "지방간 의심": 48.58
       }
      },
      {
       "metric": "BMI",
       "combo_mean": 29.08,
       "non_combo_mean": 23.58,
       "diff": 5.5,
       "cohens_d": 1.538,
       "single_means": {
        "비만": 27.95,
        "지방간 의심": 22.56
       }
      },
      {
       "metric": "허리둘레",
       "combo_mean": 93.99,
       "non_combo_mean": 79.9,
       "diff": 14.09,
       "cohens_d": 1.439,
       "single_means": {
        "비만": 89.38,
        "지방간 의심": 80.53
       }
      }
     ]
    }
   },
   {
    "combo_name": "흡연+음주+비만",
    "category": "생활습관 트리플",
    "meaning": "생활습관 위험 가중",
    "relation": "different_axis",
    "relation_label": "서로 다른 축이라 위험이 곱해집니다",
    "action": "셋이 서로 다른 경로라 하나씩 줄여야 해요. 금연이 가장 크게 낮추는 한 걸음입니다.",
    "components": [
     "현재 흡연자",
     "음주자",
     "비만"
    ],
    "is_ascvd_risk": false,
    "population": {
     "n_in_combo": 69670,
     "pct_of_total": 7.01,
     "expected_n_if_independent": 43621,
     "observed_to_expected": 1.6,
     "top_metrics": [
      {
       "metric": "BMI",
       "combo_mean": 28.48,
       "non_combo_mean": 23.91,
       "diff": 4.58,
       "cohens_d": 1.2,
       "single_means": {
        "현재 흡연자": 21.92,
        "음주자": 21.83,
        "비만": 28.21
       }
      },
      {
       "metric": "허리둘레",
       "combo_mean": 92.79,
       "non_combo_mean": 80.7,
       "diff": 12.09,
       "cohens_d": 1.17,
       "single_means": {
        "현재 흡연자": 78.95,
        "음주자": 75.44,
        "비만": 89.83
       }
      },
      {
       "metric": "혈색소",
       "combo_mean": 15.5,
       "non_combo_mean": 14.12,
       "diff": 1.38,
       "cohens_d": 0.923,
       "single_means": {
        "현재 흡연자": 14.73,
        "음주자": 13.93,
        "비만": 14.05
       }
      }
     ]
    }
   },
   {
    "combo_name": "대사증후군+흡연",
    "category": "심혈관",
    "meaning": "심혈관 위험 매우 증가",
    "relation": "different_axis",
    "relation_label": "서로 다른 축이라 위험이 곱해집니다",
    "action": "대사 쪽과 혈관 쪽이 겹쳐 위험이 곱해져요. 금연이 단일 항목 중 가장 크게 낮춥니다.",
    "components": [
     "대사증후군",
     "현재 흡연자"
    ],
    "is_ascvd_risk": true,
    "population": {
     "n_in_combo": 30427,
     "pct_of_total": 3.06,
     "expected_n_if_independent": 23081,
     "observed_to_expected": 1.32,
     "top_metrics": [
      {
       "metric": "트리글리세라이드",
       "combo_mean": 248.08,
       "non_combo_mean": 121.65,
       "diff": 126.43,
       "cohens_d": 1.458,
       "single_means": {
        "대사증후군": 189.95,
        "현재 흡연자": 130.26
       }
      },
      {
       "metric": "허리둘레",
       "combo_mean": 94.88,
       "non_combo_mean": 81.12,
       "diff": 13.75,
       "cohens_d": 1.307,
       "single_means": {
        "대사증후군": 92.56,
        "현재 흡연자": 83.59
       }
      },
      {
       "metric": "BMI",
       "combo_mean": 28.33,
       "non_combo_mean": 24.1,
       "diff": 4.23,
       "cohens_d": 1.08,
       "single_means": {
        "대사증후군": 27.92,
        "현재 흡연자": 24.35
       }
      }
     ]
    }
   },
   {
    "combo_name": "비만+당뇨전단계",
    "category": "대사",
    "meaning": "당뇨 진행 위험군",
    "relation": "same_cause",
    "relation_label": "같은 원인에서 함께 나옵니다",
    "action": "아직 당뇨로 넘어가기 전 단계예요. 이 구간에서는 체중 감량이 진행을 되돌릴 수 있습니다.",
    "components": [
     "비만",
     "당뇨 전단계"
    ],
    "is_ascvd_risk": false,
    "population": {
     "n_in_combo": 145168,
     "pct_of_total": 14.6,
     "expected_n_if_independent": 117491,
     "observed_to_expected": 1.24,
     "top_metrics": [
      {
       "metric": "BMI",
       "combo_mean": 28.41,
       "non_combo_mean": 23.51,
       "diff": 4.9,
       "cohens_d": 1.363,
       "single_means": {
        "비만": 28.24,
        "당뇨 전단계": 22.29
       }
      },
      {
       "metric": "허리둘레",
       "combo_mean": 91.53,
       "non_combo_mean": 79.84,
       "diff": 11.69,
       "cohens_d": 1.173,
       "single_means": {
        "비만": 90.4,
        "당뇨 전단계": 78.39
       }
      },
      {
       "metric": "수축기혈압",
       "combo_mean": 128.63,
       "non_combo_mean": 121.68,
       "diff": 6.95,
       "cohens_d": 0.484,
       "single_means": {
        "비만": 126.52,
        "당뇨 전단계": 123.72
       }
      }
     ]
    }
   },
   {
    "combo_name": "음주+지방간의심",
    "category": "간 질환",
    "meaning": "알코올성 지방간 의심",
    "relation": "one_worsens",
    "relation_label": "하나가 다른 하나를 밀어붙입니다",
    "action": "술이 지방간의 직접 원인일 수 있어요. 절주가 첫 순서입니다.",
    "components": [
     "음주자",
     "지방간 의심"
    ],
    "is_ascvd_risk": false,
    "population": {
     "n_in_combo": 145307,
     "pct_of_total": 14.62,
     "expected_n_if_independent": 126272,
     "observed_to_expected": 1.15,
     "top_metrics": [
      {
       "metric": "감마지티피",
       "combo_mean": 93.18,
       "non_combo_mean": 24.71,
       "diff": 68.48,
       "cohens_d": 1.605,
       "single_means": {
        "음주자": 23.49,
        "지방간 의심": 64.94
       }
      },
      {
       "metric": "혈청지피티(ALT)",
       "combo_mean": 53.53,
       "non_combo_mean": 21.88,
       "diff": 31.65,
       "cohens_d": 1.512,
       "single_means": {
        "음주자": 19.77,
        "지방간 의심": 56.97
       }
      },
      {
       "metric": "혈청지오티(AST)",
       "combo_mean": 42.22,
       "non_combo_mean": 24.32,
       "diff": 17.91,
       "cohens_d": 1.001,
       "single_means": {
        "음주자": 22.73,
        "지방간 의심": 44.22
       }
      }
     ]
    }
   }
  ],
  "not_evaluable": [],
  "matched_count": 7,
  "ascvd_risk_combos": [
   "대사증후군+흡연"
  ],
  "highest_synergy": {
   "combo_name": "비만+이상지질혈증+지방간의심",
   "category": "메타볼릭 트리오",
   "meaning": "대사이상 지방간 증후군 패턴",
   "components": [
    "비만",
    "이상지질혈증",
    "지방간 의심"
   ],
   "is_ascvd_risk": false,
   "population": {
    "n_in_combo": 22444,
    "pct_of_total": 2.26,
    "expected_n_if_independent": 8394,
    "observed_to_expected": 2.67,
    "top_metrics": [
     {
      "metric": "혈청지피티(ALT)",
      "combo_mean": 59.39,
      "non_combo_mean": 23.01,
      "diff": 36.38,
      "cohens_d": 1.927,
      "single_means": {
       "비만": 22.74,
       "이상지질혈증": 20.28,
       "지방간 의심": 48.19
      }
     },
     {
      "metric": "트리글리세라이드",
      "combo_mean": 252.82,
      "non_combo_mean": 119.9,
      "diff": 132.92,
      "cohens_d": 1.559,
      "single_means": {
       "비만": 105.59,
       "이상지질혈증": 151.11,
       "지방간 의심": 107.59
      }
     },
     {
      "metric": "BMI",
      "combo_mean": 29.13,
      "non_combo_mean": 23.69,
      "diff": 5.44,
      "cohens_d": 1.489,
      "single_means": {
       "비만": 27.71,
       "이상지질혈증": 22.37,
       "지방간 의심": 22.37
      }
     }
    ]
   }
  },
  "population": {
   "year": 2024,
   "total_n": 994018,
   "source": "국민건강보험공단 표본 (최신 연도)"
  },
  "caveats": [
   "모집단 통계는 공단 원자료 기준이라 약물 복용 정보가 없습니다. 서비스 판정은 '수치 또는 해당 약물 복용'을 함께 보므로, 약을 드시는 분은 모집단 기준보다 넓게 잡힐 수 있습니다.",
   "모집단의 지방간 의심 기준은 GGT>60이고 서비스 기준은 GGT>75입니다 (약대 자문 반영). 두 기준이 달라 비교 시 참고가 필요합니다.",
   "O/E비는 '함께 나타나는 경향'을 뜻하며 인과관계나 개인의 위험도 예측이 아닙니다."
  ]
 },
 "fatty_liver": {
  "applicable": true,
  "type": "MetALD 의심 (대사이상 + 유의한 음주 동반)",
  "provisional": false,
  "basis": "주당 순알코올 280.0g (남 경계 210/420g)",
  "cardiometabolic_factors": [
   "비만/복부비만",
   "혈당 이상",
   "혈압 이상",
   "고중성지방",
   "낮은 HDL"
  ],
  "indices": {
   "fli": {
    "value": 78.4,
    "level": "high",
    "interpretation": "지방간 가능성 높음",

    "plain": "지방간일 가능성이 높아요",
    "cutoffs": "<30 낮음 / 30~59 중간 / ≥60 높음",
    "formula": "Fatty Liver Index (Bedogni 2006)"
   },
   "hsi": {
    "value": 38.1,
    "level": "high",
    "interpretation": "지방간 시사",

    "plain": "지방간일 가능성이 높아요",
    "cutoffs": "<30 낮음 / 30~36 중간 / >36 시사",
    "formula": "Hepatic Steatosis Index (Lee 2010, 한국인 기반)"
   },
   "unavailable": [],
   "disclaimer": "FLI·HSI는 검진 수치로 지방간 가능성을 가늠하는 선별용 참고 지표입니다. 초음파 등 영상 검사에 의한 진단을 대체하지 않습니다."
  }
 },
 "disclaimer": "조합 그룹 결과는 국민건강보험공단 표본과의 통계 비교이며, 진단이 아닙니다. 판단은 의료진과 상담하세요.",
 "single_groups": [
  {
   "key": "g_hypertension",
   "name": "고혈압",
   "category": "임상",
   "desc": "수축기 ≥140 또는 이완기 ≥90 또는 고혈압약 복용",
   "applies": false
  },
  {
   "key": "g_pre_hypertension",
   "name": "고혈압 전단계",
   "category": "임상",
   "desc": "수축기 130-139 또는 이완기 80-89",
   "applies": true
  },
  {
   "key": "g_diabetes",
   "name": "당뇨",
   "category": "임상",
   "desc": "공복혈당 ≥126 또는 당뇨약 복용",
   "applies": false
  },
  {
   "key": "g_pre_diabetes",
   "name": "당뇨 전단계",
   "category": "임상",
   "desc": "공복혈당 100-125",
   "applies": true
  },
  {
   "key": "g_metabolic_syndrome",
   "name": "대사증후군",
   "category": "임상",
   "desc": "5개 기준 중 3개 이상 (약물 복용 포함)",
   "applies": true
  },
  {
   "key": "g_obesity",
   "name": "비만",
   "category": "임상",
   "desc": "BMI ≥25",
   "applies": true
  },
  {
   "key": "g_dyslipidemia",
   "name": "이상지질혈증",
   "category": "임상",
   "desc": "LDL≥160 또는 HDL미달 또는 TG≥200 또는 이상지질혈증약 복용",
   "applies": true
  },
  {
   "key": "g_fatty_liver_suspect",
   "name": "지방간 의심",
   "category": "임상",
   "desc": "ALT>40 또는 GGT>75",
   "applies": true
  },
  {
   "key": "g_smoker_current",
   "name": "현재 흡연자",
   "category": "생활습관",
   "desc": null,
   "applies": true
  },
  {
   "key": "g_smoker_former",
   "name": "과거 흡연자",
   "category": "생활습관",
   "desc": null,
   "applies": false
  },
  {
   "key": "g_non_smoker",
   "name": "비흡연자",
   "category": "생활습관",
   "desc": null,
   "applies": false
  },
  {
   "key": "g_drinker",
   "name": "음주자",
   "category": "생활습관",
   "desc": null,
   "applies": true
  },
  {
   "key": "g_non_drinker",
   "name": "비음주자",
   "category": "생활습관",
   "desc": null,
   "applies": false
  }
 ],
 "ascvd_simulation": {
  "available": true,
  "is_simulation": true,
  "risk_percent": 15.9,
  "risk_level": "intermediate",
  "risk_label": "중간 구간",
  "inputs": {
   "age": 52,
   "gender": "남",
   "total_cholesterol": 228.0,
   "hdl": 36.0,
   "sbp": 139.0,
   "smoker": true,
   "diabetes": false,
   "on_bp_medication": false
  },
  "scenarios": [
   {
    "name": "금연했다면",
    "risk_percent": 7.9,
    "delta": -8.0
   },
   {
    "name": "수축기혈압이 120이라면",
    "risk_percent": 12.5,
    "delta": -3.4
   },
   {
    "name": "HDL이 60이라면",
    "risk_percent": 9.9,
    "delta": -6.0
   }
  ],
  "method": "Pooled Cohort Equations (2013 ACC/AHA)",
  "limitations": [
   "이 식은 미국 코호트에서 만들어졌으며 한국인에서는 위험도를 실제보다 높게 추정하는 경향이 보고되었습니다.",
   "국내 진료지침은 이 식을 한국인에게 그대로 적용하도록 권고하지 않습니다.",
   "따라서 표시된 %는 진단이나 예측이 아니라, 수치가 달라질 때 위험이 어느 방향으로 얼마나 움직이는지 보기 위한 참고 시뮬레이션입니다.",
   "가족력·병력이 반영되지 않아 실제 위험과 다를 수 있습니다."
  ],
  "how_to_read": "절대적인 % 값보다, 아래 '무엇을 바꾸면' 항목의 변화 폭을 참고하세요."
 },
 "calculators": {
  "items": [
   {
    "key": "non_hdl_c",
    "title": "Non-HDL 콜레스테롤",
    "category": "lipid",
    "value": 192.0,
    "level": "high",
    "interpretation": "높음",
    "inputs": {
     "total_cholesterol": 228.0,
     "hdl": 36.0
    },
    "cutoffs": "<130 적정 / 130~159 적정상회 / 160~189 경계 / 190~219 높음 / ≥220 매우높음 (NCEP ATP III)",
    "note": "개인 목표치는 위험군에 따라 다릅니다(비-HDL 목표 = LDL 목표 + 30).",
    "formula": "Non-HDL-C = 총콜레스테롤 − HDL",
    "peer_label": "한국인 52세 남성 중 상위 12%",
    "percentile": 87.6,
    "peer_n": 65302,
    "peer_year": 2017,
    "driver": "또래 중앙값과 견주면 총콜레스테롤 쪽이 이 값을 더 끌어올렸어요."
   },
   {
    "key": "castelli_1",
    "title": "Castelli 지수 I",
    "category": "lipid",
    "value": 6.33,
    "level": "high",
    "interpretation": "높음",
    "cutoffs": "<4.0 적정 / 4.0~5.0 경계 / >5.0 높음 (참고, 성별·문헌별 상이)",
    "formula": "Castelli-I = 총콜레스테롤 / HDL",
    "peer_label": "한국인 52세 남성 중 상위 2%",
    "percentile": 97.8,
    "peer_n": 65303,
    "peer_year": 2017
   },
   {
    "key": "castelli_2",
    "title": "Castelli 지수 II",
    "category": "lipid",
    "value": 4.25,
    "level": "high",
    "interpretation": "높음",
    "cutoffs": "<3.0 적정 / 3.0~3.5 경계 / >3.5 높음 (참고)",
    "formula": "Castelli-II = LDL / HDL",
    "peer_label": "한국인 52세 남성 중 상위 1%",
    "percentile": 99.2,
    "peer_n": 65007,
    "peer_year": 2017
   },
   {
    "key": "aip",
    "title": "AIP 죽상형성지수",
    "category": "lipid",
    "value": 0.376,
    "level": "high",
    "interpretation": "고위험",
    "cutoffs": "<0.11 저위험 / 0.11~0.21 중간 / >0.21 고위험 (Dobiásová)",
    "formula": "AIP = log10(TG/HDL), mmol/L 변환 적용",
    "percentile": 83,
    "peer_label": "한국인 52세 남성 중 상위 17%",
    "peer_n": 65260,
    "peer_year": 2017,
    "driver": "또래 중앙값과 견주면 중성지방과 낮은 HDL가 비슷하게 끌어올렸어요."
   },
   {
    "key": "tyg",
    "title": "TyG 지수",
    "category": "insulin",
    "value": 9.37,
    "level": "high",
    "interpretation": "인슐린저항성 가능성 높음",
    "inputs": {
     "tg": 196.0,
     "fbs": 120.0
    },
    "cutoffs": "<8.5 낮음 / 8.5~8.9 경계 / ≥9.0 높음 (연구별 상이, 참고용)",
    "note": "국제 단일 진단 컷오프는 미확립이나, 한국 성인 대사증후군 스크리닝용으로 ~8.8이 반복 검증됨(Shin 2019 등). 한국인 국가검진 55세 남성 중앙값도 8.80.",
    "formula": "TyG = ln(TG × 공복혈당 / 2)  [Simental-Mendía 2008]",
    "percentile": 78.2,
    "peer_label": "한국인 52세 남성 중 상위 22%",
    "peer_n": 65272,
    "peer_year": 2017,
    "driver": "또래 중앙값과 견주면 중성지방 쪽이 이 값을 더 끌어올렸어요."
   },
   {
    "key": "mets_ir",
    "title": "METS-IR",
    "category": "insulin",
    "value": 45.78,
    "level": "low",
    "interpretation": "참고: 인슐린저항성 낮은 편",
    "cutoffs": "참고선 ~50 (검증된 단일 컷오프 없음, 연구별 상이)",
    "formula": "METS-IR = ln(2·FPG+TG)·BMI / ln(HDL)",
    "note": "인슐린저항성 대리지표. 진단 컷오프 미확립 — 추이·참고용.",
    "percentile": 90.1,
    "peer_label": "한국인 52세 남성 중 상위 10%",
    "peer_n": 65260,
    "peer_year": 2017
   },
   {
    "key": "lap",
    "title": "LAP 지질축적산물",
    "category": "adiposity",
    "value": 68.6,
    "level": "info",
    "interpretation": "지질축적 정도(참고)",
    "cutoffs": "단일 컷오프 없음 — 집단 내 사분위로 해석",
    "formula": "LAP = (허리−65)×TG(mmol/L)",
    "note": "내장지방·대사위험 대리지표. 진단 컷오프 미확립.",
    "percentile": 84.9,
    "peer_label": "한국인 52세 남성 중 상위 15%",
    "peer_n": 65021,
    "peer_year": 2017
   },
   {
    "key": "vai",
    "title": "VAI 내장지방지수",
    "category": "adiposity",
    "value": 3.21,
    "level": "info",
    "interpretation": "내장지방 기능이상 정도(참고)",
    "cutoffs": "정상체중 건강군 ≈1.0 기준 (연령별 컷오프 필요)",
    "formula": "VAI = 성별식(WC·BMI·TG·HDL), mmol/L 변환 적용",
    "note": "내장지방 기능이상 대리지표. 연령의존 컷오프 — 참고용.",
    "percentile": 84.2,
    "peer_label": "한국인 52세 남성 중 상위 16%",
    "peer_n": 65258,
    "peer_year": 2017
   },
   {
    "key": "de_ritis",
    "title": "De Ritis 비 (AST/ALT)",
    "category": "liver",
    "value": 0.72,
    "level": "low",
    "interpretation": "비알코올성/급성 간질환 시사 (<1)",
    "cutoffs": "<1 비알코올/급성 / 1~2 중간 / >2 알코올성·진행 시사",
    "formula": "De Ritis = AST / ALT",
    "peer_label": "한국인 52세 남성 중 하위 19%",
    "percentile": 19,
    "peer_n": 64379,
    "peer_year": 2020
   },
   {
    "key": "alt_ggt",
    "title": "ALT/GGT 비",
    "category": "liver",
    "value": 0.57,
    "level": "info",
    "interpretation": "알코올성 간질환 쪽 시사 (<1)",
    "cutoffs": "<1 알코올성 쪽 / ≥1 비알코올성 쪽 (유형 감별 보조, 중증도 아님)",
    "formula": "ALT / GGT",
    "note": "유형을 가늠하는 보조 지표로, 진단이 아닙니다. 음주량(주당 순알코올)을 함께 보면 정확도가 올라갑니다."
   },
   {
    "key": "bard",
    "title": "BARD 점수",
    "category": "liver",
    "value": 0,
    "level": "low",
    "interpretation": "진행 간섬유화 가능성 낮음 (배제 근거, NPV~96%)",

    "plain": "간이 굳었을 가능성은 낮아요",
    "components": [],
    "inputs": {
     "bmi": 27.0,
     "ast": 34.0,
     "alt": 47.0,
     "ast_alt_ratio": 0.72,
     "diabetes": false
    },
    "cutoffs": "0~1 배제 쪽 / 2~4 배제 불가",
    "formula": "BARD = BMI≥28(1) + AST/ALT≥0.8(2) + 당뇨(1)  [Harrison 2008]"
   },
   {
    "key": "map",
    "title": "평균동맥압 (MAP)",
    "category": "bp",
    "value": 105.7,
    "level": "intermediate",
    "interpretation": "다소 높음",
    "cutoffs": "70~100 정상 / <70 낮음 / >110 높음 (mmHg)",
    "formula": "MAP = (SBP + 2×DBP) / 3",
    "peer_label": "한국인 52세 남성 중 상위 14%",
    "percentile": 86.1,
    "peer_n": 64381,
    "peer_year": 2020,
    "driver": "또래 중앙값과 견주면 이완기혈압과 수축기혈압이 비슷하게 끌어올렸어요."
   },
   {
    "key": "prevent",
    "title": "AHA PREVENT (10·30년)",
    "category": "cardiovascular",
    "value": 8.5,
    "unit": "%",
    "level": "borderline",
    "interpretation": "10년 심혈관(CVD) 위험 중간",
    "value_30yr": 35.6,
    "cutoffs": "<5 낮음 / 5~7.5 경계 / 7.5~20 중간 / ≥20 높음",
    "formula": "AHA PREVENT Total CVD (Khan 2024, race-free·eGFR 반영)",
    "note": "30년 위험 35.6%. PCE 후속 모델(30~79세). 참고용, 진단 아님."
   },
   {
    "key": "framingham",
    "title": "Framingham Hard CHD (10년)",
    "category": "cardiovascular",
    "value": 20.9,
    "unit": "%",
    "level": "high",
    "interpretation": "10년 관상동맥질환 위험 높음",
    "cutoffs": "<5 낮음 / 5~7.5 경계 / 7.5~20 중간 / ≥20 높음",
    "formula": "Framingham Hard CHD 10년 (Wilson 1998, MDCalc calc/38)",
    "note": "당뇨 미반영·서구 코호트 기반 참고용. 진단 아님."
   },
   {
    "key": "score2",
    "title": "SCORE2 / OP (10년)",
    "category": "cardiovascular",
    "value": 11.8,
    "unit": "%",
    "level": "borderline",
    "interpretation": "10년 심혈관(CVD) 위험 중간",
    "cutoffs": "<5 낮음 / 5~7.5 경계 / 7.5~20 중간 / ≥20 높음",
    "formula": "SCORE2 (ESC 2021, High-risk 지역 보정)",
    "note": "유럽 모델을 한국에 High-risk 지역으로 근사한 참고값. 진단 아님."
   }
  ],
  "unavailable": [],
  "disclaimer": "검진 수치로 산출하는 선별용 참고 지표입니다. 진단을 대체하지 않으며, 컷오프는 연구·위험군에 따라 달라질 수 있습니다. 위험엔진(PREVENT·Framingham)은 서구 코호트 기반 참고용 시뮬레이션입니다."
 },
 "ldl_target": {
  "risk_level": "moderate",
  "label": "중등도위험군",
  "target_ldl": 130,
  "target_text": "LDL 130mg/dL 미만",
  "current_ldl": 153.0,
  "achieved": false,
  "gap": 23.0,
  "ldl_reliable": true,
  "reliability_note": null,
  "tg_value": 196.0,
  "risk_factors": [
   "현재 흡연",
   "낮은 HDL(<40)",
   "연령(남 45세 이상)"
  ],
  "basis": "주요 위험인자 3개: 현재 흡연, 낮은 HDL(<40), 연령(남 45세 이상)",
  "on_medication": false,
  "limitations": [
   "검진 결과만으로는 심혈관 질환 병력·가족력을 알 수 없어, 실제 위험도는 여기 표시된 등급보다 높을 수 있습니다.",
   "고위험군·초고위험군 판정에는 관상동맥질환 등 병력 확인이 필요합니다."
  ],
  "reference": "2022 한국지질·동맥경화학회 이상지질혈증 진료지침"
 },
 "rarity": {
  "clinical_groups": [
   "고혈압 전단계",
   "당뇨 전단계",
   "비만",
   "이상지질혈증",
   "지방간 의심",
   "대사증후군"
  ],
  "lifestyle_groups": [
   "현재 흡연자",
   "음주자"
  ],
  "clinical_count": 6,
  "lifestyle_count": 2,
  "interpretation": "고위험 패턴 (즉각 의료 진료 권장)"
 },
 "metabolic_syndrome_detail": {
  "factors": {
   "복부비만": {
    "met": true,
    "value": 96.0,
    "threshold": 90,
    "reason": "허리둘레 96.0cm (기준 ≥90)",
    "by_medication": false
   },
   "고혈압": {
    "met": true,
    "value": "139.0/89.0",
    "threshold": "130/85",
    "reason": "혈압 139.0/89.0 (기준 ≥130/85)",
    "by_medication": false
   },
   "고혈당": {
    "met": true,
    "value": 120.0,
    "threshold": 100,
    "reason": "공복혈당 120.0 (기준 ≥100)",
    "by_medication": false
   },
   "낮은 HDL": {
    "met": true,
    "value": 36.0,
    "threshold": "<40",
    "reason": "HDL 36.0 (기준 <40)",
    "by_medication": false
   },
   "고중성지방": {
    "met": true,
    "value": 196.0,
    "threshold": 150,
    "reason": "TG 196.0 (기준 ≥150)",
    "by_medication": false
   }
  },
  "count": 5,
  "evaluable": 5,
  "is_metabolic_syndrome": true
 },
 "population_16yr": {
  "source": {
   "years": "2009~2024",
   "total_rows": 15957665,
   "label": "국민건강보험공단 표본 1,596만 건"
  },
  "combo_oe": {
   "비만+이상지질혈증+지방간의심": {
    "median": 2.9,
    "min": 2.77,
    "max": 2.98,
    "n_years": 9,
    "year_from": 2009,
    "year_to": 2017,
    "lipid_era_only": true,
    "by_year": [
     {
      "year": 2009,
      "oe": 2.866
     },
     {
      "year": 2010,
      "oe": 2.973
     },
     {
      "year": 2011,
      "oe": 2.977
     },
     {
      "year": 2012,
      "oe": 2.955
     },
     {
      "year": 2013,
      "oe": 2.941
     },
     {
      "year": 2014,
      "oe": 2.794
     },
     {
      "year": 2015,
      "oe": 2.771
     },
     {
      "year": 2016,
      "oe": 2.881
     },
     {
      "year": 2017,
      "oe": 2.905
     }
    ]
   },
   "대사증후군+비만": {
    "median": 2.08,
    "min": 1.97,
    "max": 2.1,
    "n_years": 9,
    "year_from": 2009,
    "year_to": 2017,
    "lipid_era_only": true,
    "by_year": [
     {
      "year": 2009,
      "oe": 2.078
     },
     {
      "year": 2010,
      "oe": 2.093
     },
     {
      "year": 2011,
      "oe": 2.09
     },
     {
      "year": 2012,
      "oe": 2.096
     },
     {
      "year": 2013,
      "oe": 2.075
     },
     {
      "year": 2014,
      "oe": 2.0
     },
     {
      "year": 2015,
      "oe": 1.972
     },
     {
      "year": 2016,
      "oe": 2.016
     },
     {
      "year": 2017,
      "oe": 1.99
     }
    ]
   },
   "비만+지방간의심": {
    "median": 1.71,
    "min": 1.68,
    "max": 1.8,
    "n_years": 16,
    "year_from": 2009,
    "year_to": 2024,
    "lipid_era_only": false,
    "by_year": [
     {
      "year": 2009,
      "oe": 1.775
     },
     {
      "year": 2010,
      "oe": 1.797
     },
     {
      "year": 2011,
      "oe": 1.785
     },
     {
      "year": 2012,
      "oe": 1.787
     },
     {
      "year": 2013,
      "oe": 1.781
     },
     {
      "year": 2014,
      "oe": 1.694
     },
     {
      "year": 2015,
      "oe": 1.677
     },
     {
      "year": 2016,
      "oe": 1.738
     },
     {
      "year": 2017,
      "oe": 1.719
     },
     {
      "year": 2018,
      "oe": 1.708
     },
     {
      "year": 2019,
      "oe": 1.715
     },
     {
      "year": 2020,
      "oe": 1.7
     },
     {
      "year": 2021,
      "oe": 1.714
     },
     {
      "year": 2022,
      "oe": 1.699
     },
     {
      "year": 2023,
      "oe": 1.695
     },
     {
      "year": 2024,
      "oe": 1.68
     }
    ]
   },
   "흡연+음주+비만": {
    "median": 1.59,
    "min": 1.58,
    "max": 1.61,
    "n_years": 5,
    "year_from": 2020,
    "year_to": 2024,
    "lipid_era_only": false,
    "by_year": [
     {
      "year": 2020,
      "oe": 1.593
     },
     {
      "year": 2021,
      "oe": 1.607
     },
     {
      "year": 2022,
      "oe": 1.591
     },
     {
      "year": 2023,
      "oe": 1.585
     },
     {
      "year": 2024,
      "oe": 1.597
     }
    ]
   },
   "대사증후군+흡연": {
    "median": 1.17,
    "min": 1.11,
    "max": 1.26,
    "n_years": 9,
    "year_from": 2009,
    "year_to": 2017,
    "lipid_era_only": true,
    "by_year": [
     {
      "year": 2009,
      "oe": 1.108
     },
     {
      "year": 2010,
      "oe": 1.143
     },
     {
      "year": 2011,
      "oe": 1.146
     },
     {
      "year": 2012,
      "oe": 1.171
     },
     {
      "year": 2013,
      "oe": 1.173
     },
     {
      "year": 2014,
      "oe": 1.201
     },
     {
      "year": 2015,
      "oe": 1.222
     },
     {
      "year": 2016,
      "oe": 1.234
     },
     {
      "year": 2017,
      "oe": 1.263
     }
    ]
   },
   "비만+당뇨전단계": {
    "median": 1.25,
    "min": 1.22,
    "max": 1.29,
    "n_years": 16,
    "year_from": 2009,
    "year_to": 2024,
    "lipid_era_only": false,
    "by_year": [
     {
      "year": 2009,
      "oe": 1.261
     },
     {
      "year": 2010,
      "oe": 1.284
     },
     {
      "year": 2011,
      "oe": 1.276
     },
     {
      "year": 2012,
      "oe": 1.291
     },
     {
      "year": 2013,
      "oe": 1.273
     },
     {
      "year": 2014,
      "oe": 1.252
     },
     {
      "year": 2015,
      "oe": 1.249
     },
     {
      "year": 2016,
      "oe": 1.254
     },
     {
      "year": 2017,
      "oe": 1.25
     },
     {
      "year": 2018,
      "oe": 1.236
     },
     {
      "year": 2019,
      "oe": 1.246
     },
     {
      "year": 2020,
      "oe": 1.223
     },
     {
      "year": 2021,
      "oe": 1.227
     },
     {
      "year": 2022,
      "oe": 1.237
     },
     {
      "year": 2023,
      "oe": 1.24
     },
     {
      "year": 2024,
      "oe": 1.236
     }
    ]
   },
   "음주+지방간의심": {
    "median": 1.14,
    "min": 1.14,
    "max": 1.16,
    "n_years": 5,
    "year_from": 2020,
    "year_to": 2024,
    "lipid_era_only": false,
    "by_year": [
     {
      "year": 2020,
      "oe": 1.159
     },
     {
      "year": 2021,
      "oe": 1.157
     },
     {
      "year": 2022,
      "oe": 1.142
     },
     {
      "year": 2023,
      "oe": 1.14
     },
     {
      "year": 2024,
      "oe": 1.139
     }
    ]
   }
  },
  "disclaimer": "국민건강보험공단 표본 2009~2024년 15,957,665건을 재분석한 모집단 통계입니다. 원자료에 약 복용 정보가 없어 모집단 유병률은 '검진 수치 기준'이며, 서비스 판정('수치 또는 해당 약 복용')보다 좁게 잡힙니다. 개인식별자가 없어 연도별 독립 단면이므로 개인의 경과가 아니라 집단 비교입니다. 지질검사가 들어간 조합은 검사가 전원에게 실시된 2009~2017년만 집계했습니다.",
  "peer_prevalence": {
    "g_pre_hypertension": {
     "name": "고혈압 전단계",
     "pct": 38.5,
     "n_eval": 63913
    },
   "g_hypertension": {
    "name": "고혈압",
    "pct": 17.0,
    "n_eval": 63913
   },
   "g_diabetes": {
    "name": "당뇨",
    "pct": 12.2,
    "n_eval": 63913
   },
   "g_pre_diabetes": {
    "name": "당뇨 전단계",
    "pct": 41.6,
    "n_eval": 63913
   },
   "g_metabolic_syndrome": {
    "name": "대사증후군",
    "pct": 30.0,
    "n_eval": 16863
   },
   "g_obesity": {
    "name": "비만",
    "pct": 49.1,
    "n_eval": 63913
   },
   "g_dyslipidemia": {
    "name": "이상지질혈증",
    "pct": 40.9,
    "n_eval": 16856
   },
   "g_fatty_liver_suspect": {
    "name": "지방간 의심",
    "pct": 29.1,
    "n_eval": 63913
   }
  },
  "age_fixed_trend": {
   "age_band": "50~54세",
   "sex": "남성",
   "items": [
    {
     "group": "g_obesity",
     "name": "비만",
     "y2009": 27.5,
     "y2024": 49.1,
     "diff": 21.6,
     "ratio": 1.78
    },
    {
     "group": "g_fatty_liver_suspect",
     "name": "지방간 의심",
     "y2009": 15.9,
     "y2024": 29.1,
     "diff": 13.2,
     "ratio": 1.83
    },
    {
     "group": "g_pre_diabetes",
     "name": "당뇨 전단계",
     "y2009": 32.9,
     "y2024": 41.6,
     "diff": 8.7,
     "ratio": 1.26
    },
    {
     "group": "g_dyslipidemia",
     "name": "이상지질혈증",
     "y2009": 32.8,
     "y2024": 40.9,
     "diff": 8.1,
     "ratio": 1.25
    },
    {
     "group": "g_metabolic_syndrome",
     "name": "대사증후군",
     "y2009": 26.4,
     "y2024": 30.0,
     "diff": 3.6,
     "ratio": 1.13
    },
    {
     "group": "g_diabetes",
     "name": "당뇨",
     "y2009": 12.3,
     "y2024": 12.2,
     "diff": -0.1,
     "ratio": 0.99
    },
    {
     "group": "g_hypertension",
     "name": "고혈압",
     "y2009": 28.0,
     "y2024": 17.0,
     "diff": -11.0,
     "ratio": 0.61
    }
   ]
  },
  "care_distribution": {
   "혈압 관리 참고군": {
    "total": 63913,
    "dist": [
     {
      "hits": 0,
      "n": 36738,
      "pct": 57.5
     },
     {
      "hits": 1,
      "n": 13058,
      "pct": 20.4
     },
     {
      "hits": 2,
      "n": 14117,
      "pct": 22.1
     }
    ]
   },
   "간 기능 관찰군": {
    "total": 63909,
    "dist": [
     {
      "hits": 0,
      "n": 44304,
      "pct": 69.3
     },
     {
      "hits": 1,
      "n": 11142,
      "pct": 17.4
     },
     {
      "hits": 2,
      "n": 5669,
      "pct": 8.9
     },
     {
      "hits": 3,
      "n": 2794,
      "pct": 4.4
     }
    ]
   },
   "지질 관리 참고군": {
    "total": 16217,
    "dist": [
     {
      "hits": 0,
      "n": 4794,
      "pct": 29.6
     },
     {
      "hits": 1,
      "n": 3296,
      "pct": 20.3
     },
     {
      "hits": 2,
      "n": 5253,
      "pct": 32.4
     },
     {
      "hits": 3,
      "n": 2476,
      "pct": 15.3
     },
     {
      "hits": 4,
      "n": 398,
      "pct": 2.5
     }
    ]
   },
   "신장 기능 관찰군": {
    "total": 63727,
    "dist": [
     {
      "hits": 0,
      "n": 61003,
      "pct": 95.7
     },
     {
      "hits": 1,
      "n": 2573,
      "pct": 4.0
     },
     {
      "hits": 2,
      "n": 151,
      "pct": 0.2
     }
    ]
   },
   "대사 관리 참고군": {
    "total": 16844,
    "dist": [
     {
      "hits": 0,
      "n": 2919,
      "pct": 17.3
     },
     {
      "hits": 1,
      "n": 4606,
      "pct": 27.3
     },
     {
      "hits": 2,
      "n": 4547,
      "pct": 27.0
     },
     {
      "hits": 3,
      "n": 3199,
      "pct": 19.0
     },
     {
      "hits": 4,
      "n": 1321,
      "pct": 7.8
     },
     {
      "hits": 5,
      "n": 252,
      "pct": 1.5
     }
    ]
   }
  }
 }
}) as unknown as RealComboAnalysis,
  2022: ({
 "combo_groups": {
  "matched": [
   {
    "combo_name": "대사증후군+비만",
    "category": "대사",
    "meaning": "대사 이상 가중",
    "relation": "shared_criterion",
    "relation_label": "판정 항목을 공유합니다",
    "action": "허리둘레가 두 판정에 모두 들어가 있어요. 허리 하나가 둘을 같이 움직입니다.",
    "components": [
     "대사증후군",
     "비만"
    ],
    "is_ascvd_risk": false,
    "population": {
     "n_in_combo": 99183,
     "pct_of_total": 9.98,
     "expected_n_if_independent": 47068,
     "observed_to_expected": 2.11,
     "top_metrics": [
      {
       "metric": "허리둘레",
       "combo_mean": 95.54,
       "non_combo_mean": 79.99,
       "diff": 15.55,
       "cohens_d": 1.598,
       "single_means": {
        "대사증후군": 84.68,
        "비만": 89.1
       }
      },
      {
       "metric": "BMI",
       "combo_mean": 29.4,
       "non_combo_mean": 23.65,
       "diff": 5.74,
       "cohens_d": 1.597,
       "single_means": {
        "대사증후군": 23.24,
        "비만": 27.9
       }
      },
      {
       "metric": "수축기혈압",
       "combo_mean": 135.94,
       "non_combo_mean": 121.23,
       "diff": 14.71,
       "cohens_d": 1.057,
       "single_means": {
        "대사증후군": 134.79,
        "비만": 124.17
       }
      }
     ]
    }
   },
   {
    "combo_name": "흡연+음주+비만",
    "category": "생활습관 트리플",
    "meaning": "생활습관 위험 가중",
    "relation": "different_axis",
    "relation_label": "서로 다른 축이라 위험이 곱해집니다",
    "action": "셋이 서로 다른 경로라 하나씩 줄여야 해요. 금연이 가장 크게 낮추는 한 걸음입니다.",
    "components": [
     "현재 흡연자",
     "음주자",
     "비만"
    ],
    "is_ascvd_risk": false,
    "population": {
     "n_in_combo": 69670,
     "pct_of_total": 7.01,
     "expected_n_if_independent": 43621,
     "observed_to_expected": 1.6,
     "top_metrics": [
      {
       "metric": "BMI",
       "combo_mean": 28.48,
       "non_combo_mean": 23.91,
       "diff": 4.58,
       "cohens_d": 1.2,
       "single_means": {
        "현재 흡연자": 21.92,
        "음주자": 21.83,
        "비만": 28.21
       }
      },
      {
       "metric": "허리둘레",
       "combo_mean": 92.79,
       "non_combo_mean": 80.7,
       "diff": 12.09,
       "cohens_d": 1.17,
       "single_means": {
        "현재 흡연자": 78.95,
        "음주자": 75.44,
        "비만": 89.83
       }
      },
      {
       "metric": "혈색소",
       "combo_mean": 15.5,
       "non_combo_mean": 14.12,
       "diff": 1.38,
       "cohens_d": 0.923,
       "single_means": {
        "현재 흡연자": 14.73,
        "음주자": 13.93,
        "비만": 14.05
       }
      }
     ]
    }
   },
   {
    "combo_name": "대사증후군+흡연",
    "category": "심혈관",
    "meaning": "심혈관 위험 매우 증가",
    "relation": "different_axis",
    "relation_label": "서로 다른 축이라 위험이 곱해집니다",
    "action": "대사 쪽과 혈관 쪽이 겹쳐 위험이 곱해져요. 금연이 단일 항목 중 가장 크게 낮춥니다.",
    "components": [
     "대사증후군",
     "현재 흡연자"
    ],
    "is_ascvd_risk": true,
    "population": {
     "n_in_combo": 30427,
     "pct_of_total": 3.06,
     "expected_n_if_independent": 23081,
     "observed_to_expected": 1.32,
     "top_metrics": [
      {
       "metric": "트리글리세라이드",
       "combo_mean": 248.08,
       "non_combo_mean": 121.65,
       "diff": 126.43,
       "cohens_d": 1.458,
       "single_means": {
        "대사증후군": 189.95,
        "현재 흡연자": 130.26
       }
      },
      {
       "metric": "허리둘레",
       "combo_mean": 94.88,
       "non_combo_mean": 81.12,
       "diff": 13.75,
       "cohens_d": 1.307,
       "single_means": {
        "대사증후군": 92.56,
        "현재 흡연자": 83.59
       }
      },
      {
       "metric": "BMI",
       "combo_mean": 28.33,
       "non_combo_mean": 24.1,
       "diff": 4.23,
       "cohens_d": 1.08,
       "single_means": {
        "대사증후군": 27.92,
        "현재 흡연자": 24.35
       }
      }
     ]
    }
   },
   {
    "combo_name": "비만+당뇨전단계",
    "category": "대사",
    "meaning": "당뇨 진행 위험군",
    "relation": "same_cause",
    "relation_label": "같은 원인에서 함께 나옵니다",
    "action": "아직 당뇨로 넘어가기 전 단계예요. 이 구간에서는 체중 감량이 진행을 되돌릴 수 있습니다.",
    "components": [
     "비만",
     "당뇨 전단계"
    ],
    "is_ascvd_risk": false,
    "population": {
     "n_in_combo": 145168,
     "pct_of_total": 14.6,
     "expected_n_if_independent": 117491,
     "observed_to_expected": 1.24,
     "top_metrics": [
      {
       "metric": "BMI",
       "combo_mean": 28.41,
       "non_combo_mean": 23.51,
       "diff": 4.9,
       "cohens_d": 1.363,
       "single_means": {
        "비만": 28.24,
        "당뇨 전단계": 22.29
       }
      },
      {
       "metric": "허리둘레",
       "combo_mean": 91.53,
       "non_combo_mean": 79.84,
       "diff": 11.69,
       "cohens_d": 1.173,
       "single_means": {
        "비만": 90.4,
        "당뇨 전단계": 78.39
       }
      },
      {
       "metric": "수축기혈압",
       "combo_mean": 128.63,
       "non_combo_mean": 121.68,
       "diff": 6.95,
       "cohens_d": 0.484,
       "single_means": {
        "비만": 126.52,
        "당뇨 전단계": 123.72
       }
      }
     ]
    }
   }
  ],
  "not_evaluable": [],
  "matched_count": 4,
  "ascvd_risk_combos": [
   "대사증후군+흡연"
  ],
  "highest_synergy": {
   "combo_name": "대사증후군+비만",
   "category": "대사",
   "meaning": "대사 이상 가중",
   "components": [
    "대사증후군",
    "비만"
   ],
   "is_ascvd_risk": false,
   "population": {
    "n_in_combo": 99183,
    "pct_of_total": 9.98,
    "expected_n_if_independent": 47068,
    "observed_to_expected": 2.11,
    "top_metrics": [
     {
      "metric": "허리둘레",
      "combo_mean": 95.54,
      "non_combo_mean": 79.99,
      "diff": 15.55,
      "cohens_d": 1.598,
      "single_means": {
       "대사증후군": 84.68,
       "비만": 89.1
      }
     },
     {
      "metric": "BMI",
      "combo_mean": 29.4,
      "non_combo_mean": 23.65,
      "diff": 5.74,
      "cohens_d": 1.597,
      "single_means": {
       "대사증후군": 23.24,
       "비만": 27.9
      }
     },
     {
      "metric": "수축기혈압",
      "combo_mean": 135.94,
      "non_combo_mean": 121.23,
      "diff": 14.71,
      "cohens_d": 1.057,
      "single_means": {
       "대사증후군": 134.79,
       "비만": 124.17
      }
     }
    ]
   }
  },
  "population": {
   "year": 2024,
   "total_n": 994018,
   "source": "국민건강보험공단 표본 (최신 연도)"
  },
  "caveats": [
   "모집단 통계는 공단 원자료 기준이라 약물 복용 정보가 없습니다. 서비스 판정은 '수치 또는 해당 약물 복용'을 함께 보므로, 약을 드시는 분은 모집단 기준보다 넓게 잡힐 수 있습니다.",
   "모집단의 지방간 의심 기준은 GGT>60이고 서비스 기준은 GGT>75입니다 (약대 자문 반영). 두 기준이 달라 비교 시 참고가 필요합니다.",
   "O/E비는 '함께 나타나는 경향'을 뜻하며 인과관계나 개인의 위험도 예측이 아닙니다."
  ]
 },
 "fatty_liver": {
  "applicable": false,
  "type": null,
  "provisional": false,
  "basis": "지방간 의심에 해당하지 않아 유형 구분 대상이 아닙니다.",
  "cardiometabolic_factors": [],
  "indices": {
   "fli": {
    "value": 65.1,
    "level": "high",
    "interpretation": "지방간 가능성 높음",

    "plain": "지방간일 가능성이 높아요",
    "cutoffs": "<30 낮음 / 30~59 중간 / ≥60 높음",
    "formula": "Fatty Liver Index (Bedogni 2006)"
   },
   "hsi": {
    "value": 36.0,
    "level": "intermediate",
    "interpretation": "판단 보류 구간 (중간)",

    "plain": "지방간인지 아닌지 가리기 어려운 중간이에요",
    "cutoffs": "<30 낮음 / 30~36 중간 / >36 시사",
    "formula": "Hepatic Steatosis Index (Lee 2010, 한국인 기반)"
   },
   "unavailable": [],
   "disclaimer": "FLI·HSI는 검진 수치로 지방간 가능성을 가늠하는 선별용 참고 지표입니다. 초음파 등 영상 검사에 의한 진단을 대체하지 않습니다."
  }
 },
 "disclaimer": "조합 그룹 결과는 국민건강보험공단 표본과의 통계 비교이며, 진단이 아닙니다. 판단은 의료진과 상담하세요.",
 "single_groups": [
  {
   "key": "g_hypertension",
   "name": "고혈압",
   "category": "임상",
   "desc": "수축기 ≥140 또는 이완기 ≥90 또는 고혈압약 복용",
   "applies": false
  },
  {
   "key": "g_pre_hypertension",
   "name": "고혈압 전단계",
   "category": "임상",
   "desc": "수축기 130-139 또는 이완기 80-89",
   "applies": true
  },
  {
   "key": "g_diabetes",
   "name": "당뇨",
   "category": "임상",
   "desc": "공복혈당 ≥126 또는 당뇨약 복용",
   "applies": false
  },
  {
   "key": "g_pre_diabetes",
   "name": "당뇨 전단계",
   "category": "임상",
   "desc": "공복혈당 100-125",
   "applies": true
  },
  {
   "key": "g_metabolic_syndrome",
   "name": "대사증후군",
   "category": "임상",
   "desc": "5개 기준 중 3개 이상 (약물 복용 포함)",
   "applies": true
  },
  {
   "key": "g_obesity",
   "name": "비만",
   "category": "임상",
   "desc": "BMI ≥25",
   "applies": true
  },
  {
   "key": "g_dyslipidemia",
   "name": "이상지질혈증",
   "category": "임상",
   "desc": "LDL≥160 또는 HDL미달 또는 TG≥200 또는 이상지질혈증약 복용",
   "applies": true
  },
  {
   "key": "g_fatty_liver_suspect",
   "name": "지방간 의심",
   "category": "임상",
   "desc": "ALT>40 또는 GGT>75",
   "applies": false
  },
  {
   "key": "g_smoker_current",
   "name": "현재 흡연자",
   "category": "생활습관",
   "desc": null,
   "applies": true
  },
  {
   "key": "g_smoker_former",
   "name": "과거 흡연자",
   "category": "생활습관",
   "desc": null,
   "applies": false
  },
  {
   "key": "g_non_smoker",
   "name": "비흡연자",
   "category": "생활습관",
   "desc": null,
   "applies": false
  },
  {
   "key": "g_drinker",
   "name": "음주자",
   "category": "생활습관",
   "desc": null,
   "applies": true
  },
  {
   "key": "g_non_drinker",
   "name": "비음주자",
   "category": "생활습관",
   "desc": null,
   "applies": false
  }
 ],
 "ascvd_simulation": {
  "available": true,
  "is_simulation": true,
  "risk_percent": 15.3,
  "risk_level": "intermediate",
  "risk_label": "중간 구간",
  "inputs": {
   "age": 54,
   "gender": "남",
   "total_cholesterol": 219.0,
   "hdl": 38.0,
   "sbp": 136.0,
   "smoker": true,
   "diabetes": false,
   "on_bp_medication": false
  },
  "scenarios": [
   {
    "name": "금연했다면",
    "risk_percent": 8.1,
    "delta": -7.2
   },
   {
    "name": "수축기혈압이 120이라면",
    "risk_percent": 12.4,
    "delta": -2.9
   },
   {
    "name": "HDL이 60이라면",
    "risk_percent": 10.3,
    "delta": -5.0
   }
  ],
  "method": "Pooled Cohort Equations (2013 ACC/AHA)",
  "limitations": [
   "이 식은 미국 코호트에서 만들어졌으며 한국인에서는 위험도를 실제보다 높게 추정하는 경향이 보고되었습니다.",
   "국내 진료지침은 이 식을 한국인에게 그대로 적용하도록 권고하지 않습니다.",
   "따라서 표시된 %는 진단이나 예측이 아니라, 수치가 달라질 때 위험이 어느 방향으로 얼마나 움직이는지 보기 위한 참고 시뮬레이션입니다.",
   "가족력·병력이 반영되지 않아 실제 위험과 다를 수 있습니다."
  ],
  "how_to_read": "절대적인 % 값보다, 아래 '무엇을 바꾸면' 항목의 변화 폭을 참고하세요."
 },
 "calculators": {
  "items": [
   {
    "key": "non_hdl_c",
    "title": "Non-HDL 콜레스테롤",
    "category": "lipid",
    "value": 181.0,
    "level": "borderline",
    "interpretation": "경계 고위험",
    "inputs": {
     "total_cholesterol": 219.0,
     "hdl": 38.0
    },
    "cutoffs": "<130 적정 / 130~159 적정상회 / 160~189 경계 / 190~219 높음 / ≥220 매우높음 (NCEP ATP III)",
    "note": "개인 목표치는 위험군에 따라 다릅니다(비-HDL 목표 = LDL 목표 + 30).",
    "formula": "Non-HDL-C = 총콜레스테롤 − HDL",
    "peer_label": "한국인 54세 남성 중 상위 19%",
    "percentile": 81,
    "peer_n": 65302,
    "peer_year": 2017,
    "driver": "또래 중앙값과 견주면 총콜레스테롤 쪽이 이 값을 더 끌어올렸어요."
   },
   {
    "key": "castelli_1",
    "title": "Castelli 지수 I",
    "category": "lipid",
    "value": 5.76,
    "level": "high",
    "interpretation": "높음",
    "cutoffs": "<4.0 적정 / 4.0~5.0 경계 / >5.0 높음 (참고, 성별·문헌별 상이)",
    "formula": "Castelli-I = 총콜레스테롤 / HDL",
    "peer_label": "한국인 54세 남성 중 상위 7%",
    "percentile": 92.5,
    "peer_n": 65303,
    "peer_year": 2017
   },
   {
    "key": "castelli_2",
    "title": "Castelli 지수 II",
    "category": "lipid",
    "value": 3.87,
    "level": "high",
    "interpretation": "높음",
    "cutoffs": "<3.0 적정 / 3.0~3.5 경계 / >3.5 높음 (참고)",
    "formula": "Castelli-II = LDL / HDL",
    "peer_label": "한국인 54세 남성 중 상위 6%",
    "percentile": 94.5,
    "peer_n": 65007,
    "peer_year": 2017
   },
   {
    "key": "aip",
    "title": "AIP 죽상형성지수",
    "category": "lipid",
    "value": 0.301,
    "level": "high",
    "interpretation": "고위험",
    "cutoffs": "<0.11 저위험 / 0.11~0.21 중간 / >0.21 고위험 (Dobiásová)",
    "formula": "AIP = log10(TG/HDL), mmol/L 변환 적용",
    "percentile": 77.2,
    "peer_label": "한국인 54세 남성 중 상위 23%",
    "peer_n": 65260,
    "peer_year": 2017,
    "driver": "또래 중앙값과 견주면 낮은 HDL와 중성지방이 비슷하게 끌어올렸어요."
   },
   {
    "key": "tyg",
    "title": "TyG 지수",
    "category": "insulin",
    "value": 9.19,
    "level": "high",
    "interpretation": "인슐린저항성 가능성 높음",
    "inputs": {
     "tg": 174.0,
     "fbs": 113.0
    },
    "cutoffs": "<8.5 낮음 / 8.5~8.9 경계 / ≥9.0 높음 (연구별 상이, 참고용)",
    "note": "국제 단일 진단 컷오프는 미확립이나, 한국 성인 대사증후군 스크리닝용으로 ~8.8이 반복 검증됨(Shin 2019 등). 한국인 국가검진 55세 남성 중앙값도 8.80.",
    "formula": "TyG = ln(TG × 공복혈당 / 2)  [Simental-Mendía 2008]",
    "percentile": 70.1,
    "peer_label": "한국인 54세 남성 중 상위 30%",
    "peer_n": 65272,
    "peer_year": 2017,
    "driver": "또래 중앙값과 견주면 중성지방 쪽이 이 값을 더 끌어올렸어요."
   },
   {
    "key": "mets_ir",
    "title": "METS-IR",
    "category": "insulin",
    "value": 42.67,
    "level": "low",
    "interpretation": "참고: 인슐린저항성 낮은 편",
    "cutoffs": "참고선 ~50 (검증된 단일 컷오프 없음, 연구별 상이)",
    "formula": "METS-IR = ln(2·FPG+TG)·BMI / ln(HDL)",
    "note": "인슐린저항성 대리지표. 진단 컷오프 미확립 — 추이·참고용.",
    "percentile": 79.7,
    "peer_label": "한국인 54세 남성 중 상위 20%",
    "peer_n": 65260,
    "peer_year": 2017
   },
   {
    "key": "lap",
    "title": "LAP 지질축적산물",
    "category": "adiposity",
    "value": 51.1,
    "level": "info",
    "interpretation": "지질축적 정도(참고)",
    "cutoffs": "단일 컷오프 없음 — 집단 내 사분위로 해석",
    "formula": "LAP = (허리−65)×TG(mmol/L)",
    "note": "내장지방·대사위험 대리지표. 진단 컷오프 미확립.",
    "percentile": 75.6,
    "peer_label": "한국인 54세 남성 중 상위 24%",
    "peer_n": 65021,
    "peer_year": 2017
   },
   {
    "key": "vai",
    "title": "VAI 내장지방지수",
    "category": "adiposity",
    "value": 2.62,
    "level": "info",
    "interpretation": "내장지방 기능이상 정도(참고)",
    "cutoffs": "정상체중 건강군 ≈1.0 기준 (연령별 컷오프 필요)",
    "formula": "VAI = 성별식(WC·BMI·TG·HDL), mmol/L 변환 적용",
    "note": "내장지방 기능이상 대리지표. 연령의존 컷오프 — 참고용.",
    "percentile": 77.7,
    "peer_label": "한국인 54세 남성 중 상위 22%",
    "peer_n": 65258,
    "peer_year": 2017
   },
   {
    "key": "de_ritis",
    "title": "De Ritis 비 (AST/ALT)",
    "category": "liver",
    "value": 0.79,
    "level": "low",
    "interpretation": "비알코올성/급성 간질환 시사 (<1)",
    "cutoffs": "<1 비알코올/급성 / 1~2 중간 / >2 알코올성·진행 시사",
    "formula": "De Ritis = AST / ALT",
    "peer_label": "한국인 54세 남성 중 하위 27%",
    "percentile": 26.6,
    "peer_n": 65208,
    "peer_year": 2022
   },
   {
    "key": "alt_ggt",
    "title": "ALT/GGT 비",
    "category": "liver",
    "value": 0.56,
    "level": "info",
    "interpretation": "알코올성 간질환 쪽 시사 (<1)",
    "cutoffs": "<1 알코올성 쪽 / ≥1 비알코올성 쪽 (유형 감별 보조, 중증도 아님)",
    "formula": "ALT / GGT",
    "note": "유형을 가늠하는 보조 지표로, 진단이 아닙니다. 음주량(주당 순알코올)을 함께 보면 정확도가 올라갑니다."
   },
   {
    "key": "bard",
    "title": "BARD 점수",
    "category": "liver",
    "value": 0,
    "level": "low",
    "interpretation": "진행 간섬유화 가능성 낮음 (배제 근거, NPV~96%)",

    "plain": "간이 굳었을 가능성은 낮아요",
    "components": [],
    "inputs": {
     "bmi": 25.9,
     "ast": 30.0,
     "alt": 38.0,
     "ast_alt_ratio": 0.79,
     "diabetes": false
    },
    "cutoffs": "0~1 배제 쪽 / 2~4 배제 불가",
    "formula": "BARD = BMI≥28(1) + AST/ALT≥0.8(2) + 당뇨(1)  [Harrison 2008]"
   },
   {
    "key": "map",
    "title": "평균동맥압 (MAP)",
    "category": "bp",
    "value": 101.3,
    "level": "intermediate",
    "interpretation": "다소 높음",
    "cutoffs": "70~100 정상 / <70 낮음 / >110 높음 (mmHg)",
    "formula": "MAP = (SBP + 2×DBP) / 3",
    "peer_label": "한국인 54세 남성 중 상위 25%",
    "percentile": 74.9,
    "peer_n": 65209,
    "peer_year": 2022,
    "driver": "또래 중앙값과 견주면 수축기혈압 쪽이 이 값을 더 끌어올렸어요."
   },
   {
    "key": "prevent",
    "title": "AHA PREVENT (10·30년)",
    "category": "cardiovascular",
    "value": 8.6,
    "unit": "%",
    "level": "borderline",
    "interpretation": "10년 심혈관(CVD) 위험 중간",
    "value_30yr": 34.3,
    "cutoffs": "<5 낮음 / 5~7.5 경계 / 7.5~20 중간 / ≥20 높음",
    "formula": "AHA PREVENT Total CVD (Khan 2024, race-free·eGFR 반영)",
    "note": "30년 위험 34.3%. PCE 후속 모델(30~79세). 참고용, 진단 아님."
   },
   {
    "key": "framingham",
    "title": "Framingham Hard CHD (10년)",
    "category": "cardiovascular",
    "value": 19.0,
    "unit": "%",
    "level": "borderline",
    "interpretation": "10년 관상동맥질환 위험 중간",
    "cutoffs": "<5 낮음 / 5~7.5 경계 / 7.5~20 중간 / ≥20 높음",
    "formula": "Framingham Hard CHD 10년 (Wilson 1998, MDCalc calc/38)",
    "note": "당뇨 미반영·서구 코호트 기반 참고용. 진단 아님."
   },
   {
    "key": "score2",
    "title": "SCORE2 / OP (10년)",
    "category": "cardiovascular",
    "value": 11.6,
    "unit": "%",
    "level": "borderline",
    "interpretation": "10년 심혈관(CVD) 위험 중간",
    "cutoffs": "<5 낮음 / 5~7.5 경계 / 7.5~20 중간 / ≥20 높음",
    "formula": "SCORE2 (ESC 2021, High-risk 지역 보정)",
    "note": "유럽 모델을 한국에 High-risk 지역으로 근사한 참고값. 진단 아님."
   }
  ],
  "unavailable": [],
  "disclaimer": "검진 수치로 산출하는 선별용 참고 지표입니다. 진단을 대체하지 않으며, 컷오프는 연구·위험군에 따라 달라질 수 있습니다. 위험엔진(PREVENT·Framingham)은 서구 코호트 기반 참고용 시뮬레이션입니다."
 },
 "ldl_target": {
  "risk_level": "moderate",
  "label": "중등도위험군",
  "target_ldl": 130,
  "target_text": "LDL 130mg/dL 미만",
  "current_ldl": 147.0,
  "achieved": false,
  "gap": 17.0,
  "ldl_reliable": true,
  "reliability_note": null,
  "tg_value": 174.0,
  "risk_factors": [
   "현재 흡연",
   "낮은 HDL(<40)",
   "연령(남 45세 이상)"
  ],
  "basis": "주요 위험인자 3개: 현재 흡연, 낮은 HDL(<40), 연령(남 45세 이상)",
  "on_medication": false,
  "limitations": [
   "검진 결과만으로는 심혈관 질환 병력·가족력을 알 수 없어, 실제 위험도는 여기 표시된 등급보다 높을 수 있습니다.",
   "고위험군·초고위험군 판정에는 관상동맥질환 등 병력 확인이 필요합니다."
  ],
  "reference": "2022 한국지질·동맥경화학회 이상지질혈증 진료지침"
 },
 "rarity": {
  "clinical_groups": [
   "고혈압 전단계",
   "당뇨 전단계",
   "비만",
   "이상지질혈증",
   "대사증후군"
  ],
  "lifestyle_groups": [
   "현재 흡연자",
   "음주자"
  ],
  "clinical_count": 5,
  "lifestyle_count": 2,
  "interpretation": "고위험 패턴 (즉각 의료 진료 권장)"
 },
 "metabolic_syndrome_detail": {
  "factors": {
   "복부비만": {
    "met": true,
    "value": 91.0,
    "threshold": 90,
    "reason": "허리둘레 91.0cm (기준 ≥90)",
    "by_medication": false
   },
   "고혈압": {
    "met": true,
    "value": "136.0/84.0",
    "threshold": "130/85",
    "reason": "혈압 136.0/84.0 (기준 ≥130/85)",
    "by_medication": false
   },
   "고혈당": {
    "met": true,
    "value": 113.0,
    "threshold": 100,
    "reason": "공복혈당 113.0 (기준 ≥100)",
    "by_medication": false
   },
   "낮은 HDL": {
    "met": true,
    "value": 38.0,
    "threshold": "<40",
    "reason": "HDL 38.0 (기준 <40)",
    "by_medication": false
   },
   "고중성지방": {
    "met": true,
    "value": 174.0,
    "threshold": 150,
    "reason": "TG 174.0 (기준 ≥150)",
    "by_medication": false
   }
  },
  "count": 5,
  "evaluable": 5,
  "is_metabolic_syndrome": true
 },
 "population_16yr": {
  "source": {
   "years": "2009~2024",
   "total_rows": 15957665,
   "label": "국민건강보험공단 표본 1,596만 건"
  },
  "combo_oe": {
   "대사증후군+비만": {
    "median": 2.08,
    "min": 1.97,
    "max": 2.1,
    "n_years": 9,
    "year_from": 2009,
    "year_to": 2017,
    "lipid_era_only": true,
    "by_year": [
     {
      "year": 2009,
      "oe": 2.078
     },
     {
      "year": 2010,
      "oe": 2.093
     },
     {
      "year": 2011,
      "oe": 2.09
     },
     {
      "year": 2012,
      "oe": 2.096
     },
     {
      "year": 2013,
      "oe": 2.075
     },
     {
      "year": 2014,
      "oe": 2.0
     },
     {
      "year": 2015,
      "oe": 1.972
     },
     {
      "year": 2016,
      "oe": 2.016
     },
     {
      "year": 2017,
      "oe": 1.99
     }
    ]
   },
   "흡연+음주+비만": {
    "median": 1.59,
    "min": 1.58,
    "max": 1.61,
    "n_years": 5,
    "year_from": 2020,
    "year_to": 2024,
    "lipid_era_only": false,
    "by_year": [
     {
      "year": 2020,
      "oe": 1.593
     },
     {
      "year": 2021,
      "oe": 1.607
     },
     {
      "year": 2022,
      "oe": 1.591
     },
     {
      "year": 2023,
      "oe": 1.585
     },
     {
      "year": 2024,
      "oe": 1.597
     }
    ]
   },
   "대사증후군+흡연": {
    "median": 1.17,
    "min": 1.11,
    "max": 1.26,
    "n_years": 9,
    "year_from": 2009,
    "year_to": 2017,
    "lipid_era_only": true,
    "by_year": [
     {
      "year": 2009,
      "oe": 1.108
     },
     {
      "year": 2010,
      "oe": 1.143
     },
     {
      "year": 2011,
      "oe": 1.146
     },
     {
      "year": 2012,
      "oe": 1.171
     },
     {
      "year": 2013,
      "oe": 1.173
     },
     {
      "year": 2014,
      "oe": 1.201
     },
     {
      "year": 2015,
      "oe": 1.222
     },
     {
      "year": 2016,
      "oe": 1.234
     },
     {
      "year": 2017,
      "oe": 1.263
     }
    ]
   },
   "비만+당뇨전단계": {
    "median": 1.25,
    "min": 1.22,
    "max": 1.29,
    "n_years": 16,
    "year_from": 2009,
    "year_to": 2024,
    "lipid_era_only": false,
    "by_year": [
     {
      "year": 2009,
      "oe": 1.261
     },
     {
      "year": 2010,
      "oe": 1.284
     },
     {
      "year": 2011,
      "oe": 1.276
     },
     {
      "year": 2012,
      "oe": 1.291
     },
     {
      "year": 2013,
      "oe": 1.273
     },
     {
      "year": 2014,
      "oe": 1.252
     },
     {
      "year": 2015,
      "oe": 1.249
     },
     {
      "year": 2016,
      "oe": 1.254
     },
     {
      "year": 2017,
      "oe": 1.25
     },
     {
      "year": 2018,
      "oe": 1.236
     },
     {
      "year": 2019,
      "oe": 1.246
     },
     {
      "year": 2020,
      "oe": 1.223
     },
     {
      "year": 2021,
      "oe": 1.227
     },
     {
      "year": 2022,
      "oe": 1.237
     },
     {
      "year": 2023,
      "oe": 1.24
     },
     {
      "year": 2024,
      "oe": 1.236
     }
    ]
   }
  },
  "disclaimer": "국민건강보험공단 표본 2009~2024년 15,957,665건을 재분석한 모집단 통계입니다. 원자료에 약 복용 정보가 없어 모집단 유병률은 '검진 수치 기준'이며, 서비스 판정('수치 또는 해당 약 복용')보다 좁게 잡힙니다. 개인식별자가 없어 연도별 독립 단면이므로 개인의 경과가 아니라 집단 비교입니다. 지질검사가 들어간 조합은 검사가 전원에게 실시된 2009~2017년만 집계했습니다.",
  "peer_prevalence": {
    "g_pre_hypertension": {
     "name": "고혈압 전단계",
     "pct": 38.5,
     "n_eval": 63913
    },
   "g_hypertension": {
    "name": "고혈압",
    "pct": 17.0,
    "n_eval": 63913
   },
   "g_diabetes": {
    "name": "당뇨",
    "pct": 12.2,
    "n_eval": 63913
   },
   "g_pre_diabetes": {
    "name": "당뇨 전단계",
    "pct": 41.6,
    "n_eval": 63913
   },
   "g_metabolic_syndrome": {
    "name": "대사증후군",
    "pct": 30.0,
    "n_eval": 16863
   },
   "g_obesity": {
    "name": "비만",
    "pct": 49.1,
    "n_eval": 63913
   },
   "g_dyslipidemia": {
    "name": "이상지질혈증",
    "pct": 40.9,
    "n_eval": 16856
   },
   "g_fatty_liver_suspect": {
    "name": "지방간 의심",
    "pct": 29.1,
    "n_eval": 63913
   }
  },
  "age_fixed_trend": {
   "age_band": "50~54세",
   "sex": "남성",
   "items": [
    {
     "group": "g_obesity",
     "name": "비만",
     "y2009": 27.5,
     "y2024": 49.1,
     "diff": 21.6,
     "ratio": 1.78
    },
    {
     "group": "g_fatty_liver_suspect",
     "name": "지방간 의심",
     "y2009": 15.9,
     "y2024": 29.1,
     "diff": 13.2,
     "ratio": 1.83
    },
    {
     "group": "g_pre_diabetes",
     "name": "당뇨 전단계",
     "y2009": 32.9,
     "y2024": 41.6,
     "diff": 8.7,
     "ratio": 1.26
    },
    {
     "group": "g_dyslipidemia",
     "name": "이상지질혈증",
     "y2009": 32.8,
     "y2024": 40.9,
     "diff": 8.1,
     "ratio": 1.25
    },
    {
     "group": "g_metabolic_syndrome",
     "name": "대사증후군",
     "y2009": 26.4,
     "y2024": 30.0,
     "diff": 3.6,
     "ratio": 1.13
    },
    {
     "group": "g_diabetes",
     "name": "당뇨",
     "y2009": 12.3,
     "y2024": 12.2,
     "diff": -0.1,
     "ratio": 0.99
    },
    {
     "group": "g_hypertension",
     "name": "고혈압",
     "y2009": 28.0,
     "y2024": 17.0,
     "diff": -11.0,
     "ratio": 0.61
    }
   ]
  },
  "care_distribution": {
   "신장 기능 관찰군": {
    "total": 63727,
    "dist": [
     {
      "hits": 0,
      "n": 61003,
      "pct": 95.7
     },
     {
      "hits": 1,
      "n": 2573,
      "pct": 4.0
     },
     {
      "hits": 2,
      "n": 151,
      "pct": 0.2
     }
    ]
   },
   "지질 관리 참고군": {
    "total": 16217,
    "dist": [
     {
      "hits": 0,
      "n": 4794,
      "pct": 29.6
     },
     {
      "hits": 1,
      "n": 3296,
      "pct": 20.3
     },
     {
      "hits": 2,
      "n": 5253,
      "pct": 32.4
     },
     {
      "hits": 3,
      "n": 2476,
      "pct": 15.3
     },
     {
      "hits": 4,
      "n": 398,
      "pct": 2.5
     }
    ]
   },
   "대사 관리 참고군": {
    "total": 16844,
    "dist": [
     {
      "hits": 0,
      "n": 2919,
      "pct": 17.3
     },
     {
      "hits": 1,
      "n": 4606,
      "pct": 27.3
     },
     {
      "hits": 2,
      "n": 4547,
      "pct": 27.0
     },
     {
      "hits": 3,
      "n": 3199,
      "pct": 19.0
     },
     {
      "hits": 4,
      "n": 1321,
      "pct": 7.8
     },
     {
      "hits": 5,
      "n": 252,
      "pct": 1.5
     }
    ]
   },
   "혈압 관리 참고군": {
    "total": 63913,
    "dist": [
     {
      "hits": 0,
      "n": 36738,
      "pct": 57.5
     },
     {
      "hits": 1,
      "n": 13058,
      "pct": 20.4
     },
     {
      "hits": 2,
      "n": 14117,
      "pct": 22.1
     }
    ]
   },
   "간 기능 관찰군": {
    "total": 63909,
    "dist": [
     {
      "hits": 0,
      "n": 44304,
      "pct": 69.3
     },
     {
      "hits": 1,
      "n": 11142,
      "pct": 17.4
     },
     {
      "hits": 2,
      "n": 5669,
      "pct": 8.9
     },
     {
      "hits": 3,
      "n": 2794,
      "pct": 4.4
     }
    ]
   }
  }
 }
}) as unknown as RealComboAnalysis,
  2024: ({
 "combo_groups": {
  "matched": [
   {
    "combo_name": "대사증후군+비만",
    "category": "대사",
    "meaning": "대사 이상 가중",
    "relation": "shared_criterion",
    "relation_label": "판정 항목을 공유합니다",
    "action": "허리둘레가 두 판정에 모두 들어가 있어요. 허리 하나가 둘을 같이 움직입니다.",
    "components": [
     "대사증후군",
     "비만"
    ],
    "is_ascvd_risk": false,
    "population": {
     "n_in_combo": 99183,
     "pct_of_total": 9.98,
     "expected_n_if_independent": 47068,
     "observed_to_expected": 2.11,
     "top_metrics": [
      {
       "metric": "허리둘레",
       "combo_mean": 95.54,
       "non_combo_mean": 79.99,
       "diff": 15.55,
       "cohens_d": 1.598,
       "single_means": {
        "대사증후군": 84.68,
        "비만": 89.1
       }
      },
      {
       "metric": "BMI",
       "combo_mean": 29.4,
       "non_combo_mean": 23.65,
       "diff": 5.74,
       "cohens_d": 1.597,
       "single_means": {
        "대사증후군": 23.24,
        "비만": 27.9
       }
      },
      {
       "metric": "수축기혈압",
       "combo_mean": 135.94,
       "non_combo_mean": 121.23,
       "diff": 14.71,
       "cohens_d": 1.057,
       "single_means": {
        "대사증후군": 134.79,
        "비만": 124.17
       }
      }
     ]
    }
   },
   {
    "combo_name": "흡연+음주+비만",
    "category": "생활습관 트리플",
    "meaning": "생활습관 위험 가중",
    "relation": "different_axis",
    "relation_label": "서로 다른 축이라 위험이 곱해집니다",
    "action": "셋이 서로 다른 경로라 하나씩 줄여야 해요. 금연이 가장 크게 낮추는 한 걸음입니다.",
    "components": [
     "현재 흡연자",
     "음주자",
     "비만"
    ],
    "is_ascvd_risk": false,
    "population": {
     "n_in_combo": 69670,
     "pct_of_total": 7.01,
     "expected_n_if_independent": 43621,
     "observed_to_expected": 1.6,
     "top_metrics": [
      {
       "metric": "BMI",
       "combo_mean": 28.48,
       "non_combo_mean": 23.91,
       "diff": 4.58,
       "cohens_d": 1.2,
       "single_means": {
        "현재 흡연자": 21.92,
        "음주자": 21.83,
        "비만": 28.21
       }
      },
      {
       "metric": "허리둘레",
       "combo_mean": 92.79,
       "non_combo_mean": 80.7,
       "diff": 12.09,
       "cohens_d": 1.17,
       "single_means": {
        "현재 흡연자": 78.95,
        "음주자": 75.44,
        "비만": 89.83
       }
      },
      {
       "metric": "혈색소",
       "combo_mean": 15.5,
       "non_combo_mean": 14.12,
       "diff": 1.38,
       "cohens_d": 0.923,
       "single_means": {
        "현재 흡연자": 14.73,
        "음주자": 13.93,
        "비만": 14.05
       }
      }
     ]
    }
   },
   {
    "combo_name": "대사증후군+흡연",
    "category": "심혈관",
    "meaning": "심혈관 위험 매우 증가",
    "relation": "different_axis",
    "relation_label": "서로 다른 축이라 위험이 곱해집니다",
    "action": "대사 쪽과 혈관 쪽이 겹쳐 위험이 곱해져요. 금연이 단일 항목 중 가장 크게 낮춥니다.",
    "components": [
     "대사증후군",
     "현재 흡연자"
    ],
    "is_ascvd_risk": true,
    "population": {
     "n_in_combo": 30427,
     "pct_of_total": 3.06,
     "expected_n_if_independent": 23081,
     "observed_to_expected": 1.32,
     "top_metrics": [
      {
       "metric": "트리글리세라이드",
       "combo_mean": 248.08,
       "non_combo_mean": 121.65,
       "diff": 126.43,
       "cohens_d": 1.458,
       "single_means": {
        "대사증후군": 189.95,
        "현재 흡연자": 130.26
       }
      },
      {
       "metric": "허리둘레",
       "combo_mean": 94.88,
       "non_combo_mean": 81.12,
       "diff": 13.75,
       "cohens_d": 1.307,
       "single_means": {
        "대사증후군": 92.56,
        "현재 흡연자": 83.59
       }
      },
      {
       "metric": "BMI",
       "combo_mean": 28.33,
       "non_combo_mean": 24.1,
       "diff": 4.23,
       "cohens_d": 1.08,
       "single_means": {
        "대사증후군": 27.92,
        "현재 흡연자": 24.35
       }
      }
     ]
    }
   },
   {
    "combo_name": "비만+당뇨전단계",
    "category": "대사",
    "meaning": "당뇨 진행 위험군",
    "relation": "same_cause",
    "relation_label": "같은 원인에서 함께 나옵니다",
    "action": "아직 당뇨로 넘어가기 전 단계예요. 이 구간에서는 체중 감량이 진행을 되돌릴 수 있습니다.",
    "components": [
     "비만",
     "당뇨 전단계"
    ],
    "is_ascvd_risk": false,
    "population": {
     "n_in_combo": 145168,
     "pct_of_total": 14.6,
     "expected_n_if_independent": 117491,
     "observed_to_expected": 1.24,
     "top_metrics": [
      {
       "metric": "BMI",
       "combo_mean": 28.41,
       "non_combo_mean": 23.51,
       "diff": 4.9,
       "cohens_d": 1.363,
       "single_means": {
        "비만": 28.24,
        "당뇨 전단계": 22.29
       }
      },
      {
       "metric": "허리둘레",
       "combo_mean": 91.53,
       "non_combo_mean": 79.84,
       "diff": 11.69,
       "cohens_d": 1.173,
       "single_means": {
        "비만": 90.4,
        "당뇨 전단계": 78.39
       }
      },
      {
       "metric": "수축기혈압",
       "combo_mean": 128.63,
       "non_combo_mean": 121.68,
       "diff": 6.95,
       "cohens_d": 0.484,
       "single_means": {
        "비만": 126.52,
        "당뇨 전단계": 123.72
       }
      }
     ]
    }
   }
  ],
  "not_evaluable": [],
  "matched_count": 4,
  "ascvd_risk_combos": [
   "대사증후군+흡연"
  ],
  "highest_synergy": {
   "combo_name": "대사증후군+비만",
   "category": "대사",
   "meaning": "대사 이상 가중",
   "components": [
    "대사증후군",
    "비만"
   ],
   "is_ascvd_risk": false,
   "population": {
    "n_in_combo": 99183,
    "pct_of_total": 9.98,
    "expected_n_if_independent": 47068,
    "observed_to_expected": 2.11,
    "top_metrics": [
     {
      "metric": "허리둘레",
      "combo_mean": 95.54,
      "non_combo_mean": 79.99,
      "diff": 15.55,
      "cohens_d": 1.598,
      "single_means": {
       "대사증후군": 84.68,
       "비만": 89.1
      }
     },
     {
      "metric": "BMI",
      "combo_mean": 29.4,
      "non_combo_mean": 23.65,
      "diff": 5.74,
      "cohens_d": 1.597,
      "single_means": {
       "대사증후군": 23.24,
       "비만": 27.9
      }
     },
     {
      "metric": "수축기혈압",
      "combo_mean": 135.94,
      "non_combo_mean": 121.23,
      "diff": 14.71,
      "cohens_d": 1.057,
      "single_means": {
       "대사증후군": 134.79,
       "비만": 124.17
      }
     }
    ]
   }
  },
  "population": {
   "year": 2024,
   "total_n": 994018,
   "source": "국민건강보험공단 표본 (최신 연도)"
  },
  "caveats": [
   "모집단 통계는 공단 원자료 기준이라 약물 복용 정보가 없습니다. 서비스 판정은 '수치 또는 해당 약물 복용'을 함께 보므로, 약을 드시는 분은 모집단 기준보다 넓게 잡힐 수 있습니다.",
   "모집단의 지방간 의심 기준은 GGT>60이고 서비스 기준은 GGT>75입니다 (약대 자문 반영). 두 기준이 달라 비교 시 참고가 필요합니다.",
   "O/E비는 '함께 나타나는 경향'을 뜻하며 인과관계나 개인의 위험도 예측이 아닙니다."
  ]
 },
 "fatty_liver": {
  "applicable": false,
  "type": null,
  "provisional": false,
  "basis": "지방간 의심에 해당하지 않아 유형 구분 대상이 아닙니다.",
  "cardiometabolic_factors": [],
  "indices": {
   "fli": {
    "value": 57.3,
    "level": "intermediate",
    "interpretation": "판단 보류 구간 (중간)",

    "plain": "지방간인지 아닌지 가리기 어려운 중간이에요",
    "cutoffs": "<30 낮음 / 30~59 중간 / ≥60 높음",
    "formula": "Fatty Liver Index (Bedogni 2006)"
   },
   "hsi": {
    "value": 35.0,
    "level": "intermediate",
    "interpretation": "판단 보류 구간 (중간)",

    "plain": "지방간인지 아닌지 가리기 어려운 중간이에요",
    "cutoffs": "<30 낮음 / 30~36 중간 / >36 시사",
    "formula": "Hepatic Steatosis Index (Lee 2010, 한국인 기반)"
   },
   "unavailable": [],
   "disclaimer": "FLI·HSI는 검진 수치로 지방간 가능성을 가늠하는 선별용 참고 지표입니다. 초음파 등 영상 검사에 의한 진단을 대체하지 않습니다."
  }
 },
 "disclaimer": "조합 그룹 결과는 국민건강보험공단 표본과의 통계 비교이며, 진단이 아닙니다. 판단은 의료진과 상담하세요.",
 "single_groups": [
  {
   "key": "g_hypertension",
   "name": "고혈압",
   "category": "임상",
   "desc": "수축기 ≥140 또는 이완기 ≥90 또는 고혈압약 복용",
   "applies": false
  },
  {
   "key": "g_pre_hypertension",
   "name": "고혈압 전단계",
   "category": "임상",
   "desc": "수축기 130-139 또는 이완기 80-89",
   "applies": true
  },
  {
   "key": "g_diabetes",
   "name": "당뇨",
   "category": "임상",
   "desc": "공복혈당 ≥126 또는 당뇨약 복용",
   "applies": false
  },
  {
   "key": "g_pre_diabetes",
   "name": "당뇨 전단계",
   "category": "임상",
   "desc": "공복혈당 100-125",
   "applies": true
  },
  {
   "key": "g_metabolic_syndrome",
   "name": "대사증후군",
   "category": "임상",
   "desc": "5개 기준 중 3개 이상 (약물 복용 포함)",
   "applies": true
  },
  {
   "key": "g_obesity",
   "name": "비만",
   "category": "임상",
   "desc": "BMI ≥25",
   "applies": true
  },
  {
   "key": "g_dyslipidemia",
   "name": "이상지질혈증",
   "category": "임상",
   "desc": "LDL≥160 또는 HDL미달 또는 TG≥200 또는 이상지질혈증약 복용",
   "applies": true
  },
  {
   "key": "g_fatty_liver_suspect",
   "name": "지방간 의심",
   "category": "임상",
   "desc": "ALT>40 또는 GGT>75",
   "applies": false
  },
  {
   "key": "g_smoker_current",
   "name": "현재 흡연자",
   "category": "생활습관",
   "desc": null,
   "applies": true
  },
  {
   "key": "g_smoker_former",
   "name": "과거 흡연자",
   "category": "생활습관",
   "desc": null,
   "applies": false
  },
  {
   "key": "g_non_smoker",
   "name": "비흡연자",
   "category": "생활습관",
   "desc": null,
   "applies": false
  },
  {
   "key": "g_drinker",
   "name": "음주자",
   "category": "생활습관",
   "desc": null,
   "applies": true
  },
  {
   "key": "g_non_drinker",
   "name": "비음주자",
   "category": "생활습관",
   "desc": null,
   "applies": false
  }
 ],
 "ascvd_simulation": {
  "available": true,
  "is_simulation": true,
  "risk_percent": 15.7,
  "risk_level": "intermediate",
  "risk_label": "중간 구간",
  "inputs": {
   "age": 56,
   "gender": "남",
   "total_cholesterol": 216.0,
   "hdl": 39.0,
   "sbp": 134.0,
   "smoker": true,
   "diabetes": false,
   "on_bp_medication": false
  },
  "scenarios": [
   {
    "name": "금연했다면",
    "risk_percent": 8.9,
    "delta": -6.8
   },
   {
    "name": "수축기혈압이 120이라면",
    "risk_percent": 13.1,
    "delta": -2.6
   },
   {
    "name": "HDL이 60이라면",
    "risk_percent": 11.1,
    "delta": -4.6
   }
  ],
  "method": "Pooled Cohort Equations (2013 ACC/AHA)",
  "limitations": [
   "이 식은 미국 코호트에서 만들어졌으며 한국인에서는 위험도를 실제보다 높게 추정하는 경향이 보고되었습니다.",
   "국내 진료지침은 이 식을 한국인에게 그대로 적용하도록 권고하지 않습니다.",
   "따라서 표시된 %는 진단이나 예측이 아니라, 수치가 달라질 때 위험이 어느 방향으로 얼마나 움직이는지 보기 위한 참고 시뮬레이션입니다.",
   "가족력·병력이 반영되지 않아 실제 위험과 다를 수 있습니다."
  ],
  "how_to_read": "절대적인 % 값보다, 아래 '무엇을 바꾸면' 항목의 변화 폭을 참고하세요."
 },
 "calculators": {
  "items": [
   {
    "key": "non_hdl_c",
    "title": "Non-HDL 콜레스테롤",
    "category": "lipid",
    "value": 177.0,
    "level": "borderline",
    "interpretation": "경계 고위험",
    "inputs": {
     "total_cholesterol": 216.0,
     "hdl": 39.0
    },
    "cutoffs": "<130 적정 / 130~159 적정상회 / 160~189 경계 / 190~219 높음 / ≥220 매우높음 (NCEP ATP III)",
    "note": "개인 목표치는 위험군에 따라 다릅니다(비-HDL 목표 = LDL 목표 + 30).",
    "formula": "Non-HDL-C = 총콜레스테롤 − HDL",
    "peer_label": "한국인 56세 남성 중 상위 18%",
    "percentile": 81.6,
    "peer_n": 56341,
    "peer_year": 2017,
    "driver": "또래 중앙값과 견주면 총콜레스테롤 쪽이 이 값을 더 끌어올렸어요."
   },
   {
    "key": "castelli_1",
    "title": "Castelli 지수 I",
    "category": "lipid",
    "value": 5.54,
    "level": "high",
    "interpretation": "높음",
    "cutoffs": "<4.0 적정 / 4.0~5.0 경계 / >5.0 높음 (참고, 성별·문헌별 상이)",
    "formula": "Castelli-I = 총콜레스테롤 / HDL",
    "peer_label": "한국인 56세 남성 중 상위 8%",
    "percentile": 91.5,
    "peer_n": 56341,
    "peer_year": 2017
   },
   {
    "key": "castelli_2",
    "title": "Castelli 지수 II",
    "category": "lipid",
    "value": 3.72,
    "level": "high",
    "interpretation": "높음",
    "cutoffs": "<3.0 적정 / 3.0~3.5 경계 / >3.5 높음 (참고)",
    "formula": "Castelli-II = LDL / HDL",
    "peer_label": "한국인 56세 남성 중 상위 7%",
    "percentile": 93.4,
    "peer_n": 56092,
    "peer_year": 2017
   },
   {
    "key": "aip",
    "title": "AIP 죽상형성지수",
    "category": "lipid",
    "value": 0.274,
    "level": "high",
    "interpretation": "고위험",
    "cutoffs": "<0.11 저위험 / 0.11~0.21 중간 / >0.21 고위험 (Dobiásová)",
    "formula": "AIP = log10(TG/HDL), mmol/L 변환 적용",
    "percentile": 77.3,
    "peer_label": "한국인 56세 남성 중 상위 23%",
    "peer_n": 56316,
    "peer_year": 2017,
    "driver": "또래 중앙값과 견주면 중성지방과 낮은 HDL가 비슷하게 끌어올렸어요."
   },
   {
    "key": "tyg",
    "title": "TyG 지수",
    "category": "insulin",
    "value": 9.13,
    "level": "high",
    "interpretation": "인슐린저항성 가능성 높음",
    "inputs": {
     "tg": 168.0,
     "fbs": 110.0
    },
    "cutoffs": "<8.5 낮음 / 8.5~8.9 경계 / ≥9.0 높음 (연구별 상이, 참고용)",
    "note": "국제 단일 진단 컷오프는 미확립이나, 한국 성인 대사증후군 스크리닝용으로 ~8.8이 반복 검증됨(Shin 2019 등). 한국인 국가검진 55세 남성 중앙값도 8.80.",
    "formula": "TyG = ln(TG × 공복혈당 / 2)  [Simental-Mendía 2008]",
    "percentile": 69.6,
    "peer_label": "한국인 56세 남성 중 상위 30%",
    "peer_n": 56321,
    "peer_year": 2017,
    "driver": "또래 중앙값과 견주면 중성지방 쪽이 이 값을 더 끌어올렸어요."
   },
   {
    "key": "mets_ir",
    "title": "METS-IR",
    "category": "insulin",
    "value": 41.03,
    "level": "low",
    "interpretation": "참고: 인슐린저항성 낮은 편",
    "cutoffs": "참고선 ~50 (검증된 단일 컷오프 없음, 연구별 상이)",
    "formula": "METS-IR = ln(2·FPG+TG)·BMI / ln(HDL)",
    "note": "인슐린저항성 대리지표. 진단 컷오프 미확립 — 추이·참고용.",
    "percentile": 75.8,
    "peer_label": "한국인 56세 남성 중 상위 24%",
    "peer_n": 56316,
    "peer_year": 2017
   },
   {
    "key": "lap",
    "title": "LAP 지질축적산물",
    "category": "adiposity",
    "value": 43.6,
    "level": "info",
    "interpretation": "지질축적 정도(참고)",
    "cutoffs": "단일 컷오프 없음 — 집단 내 사분위로 해석",
    "formula": "LAP = (허리−65)×TG(mmol/L)",
    "note": "내장지방·대사위험 대리지표. 진단 컷오프 미확립.",
    "percentile": 70.4,
    "peer_label": "한국인 56세 남성 중 상위 30%",
    "peer_n": 56075,
    "peer_year": 2017
   },
   {
    "key": "vai",
    "title": "VAI 내장지방지수",
    "category": "adiposity",
    "value": 2.42,
    "level": "info",
    "interpretation": "내장지방 기능이상 정도(참고)",
    "cutoffs": "정상체중 건강군 ≈1.0 기준 (연령별 컷오프 필요)",
    "formula": "VAI = 성별식(WC·BMI·TG·HDL), mmol/L 변환 적용",
    "note": "내장지방 기능이상 대리지표. 연령의존 컷오프 — 참고용.",
    "percentile": 77.2,
    "peer_label": "한국인 56세 남성 중 상위 23%",
    "peer_n": 56311,
    "peer_year": 2017
   },
   {
    "key": "de_ritis",
    "title": "De Ritis 비 (AST/ALT)",
    "category": "liver",
    "value": 0.82,
    "level": "low",
    "interpretation": "비알코올성/급성 간질환 시사 (<1)",
    "cutoffs": "<1 비알코올/급성 / 1~2 중간 / >2 알코올성·진행 시사",
    "formula": "De Ritis = AST / ALT",
    "peer_label": "한국인 56세 남성 중 하위 26%",
    "percentile": 26,
    "peer_n": 50466,
    "peer_year": 2024
   },
   {
    "key": "alt_ggt",
    "title": "ALT/GGT 비",
    "category": "liver",
    "value": 0.52,
    "level": "info",
    "interpretation": "알코올성 간질환 쪽 시사 (<1)",
    "cutoffs": "<1 알코올성 쪽 / ≥1 비알코올성 쪽 (유형 감별 보조, 중증도 아님)",
    "formula": "ALT / GGT",
    "note": "유형을 가늠하는 보조 지표로, 진단이 아닙니다. 음주량(주당 순알코올)을 함께 보면 정확도가 올라갑니다."
   },
   {
    "key": "bard",
    "title": "BARD 점수",
    "category": "liver",
    "value": 2,
    "level": "high",
    "interpretation": "진행 간섬유화 배제 불가 (추가 평가 권장)",

    "plain": "간이 굳고 있는지 더 확인해 볼 필요가 있어요",
    "components": [
     "AST/ALT≥0.8 (+2)"
    ],
    "inputs": {
     "bmi": 25.2,
     "ast": 27.0,
     "alt": 33.0,
     "ast_alt_ratio": 0.82,
     "diabetes": false
    },
    "cutoffs": "0~1 배제 쪽 / 2~4 배제 불가",
    "formula": "BARD = BMI≥28(1) + AST/ALT≥0.8(2) + 당뇨(1)  [Harrison 2008]"
   },
   {
    "key": "map",
    "title": "평균동맥압 (MAP)",
    "category": "bp",
    "value": 101.3,
    "level": "intermediate",
    "interpretation": "다소 높음",
    "cutoffs": "70~100 정상 / <70 낮음 / >110 높음 (mmHg)",
    "formula": "MAP = (SBP + 2×DBP) / 3",
    "peer_label": "한국인 56세 남성 중 상위 24%",
    "percentile": 76.5,
    "peer_n": 50466,
    "peer_year": 2024,
    "driver": "또래 중앙값과 견주면 이완기혈압과 수축기혈압이 비슷하게 끌어올렸어요."
   },
   {
    "key": "prevent",
    "title": "AHA PREVENT (10·30년)",
    "category": "cardiovascular",
    "value": 9.2,
    "unit": "%",
    "level": "borderline",
    "interpretation": "10년 심혈관(CVD) 위험 중간",
    "value_30yr": 34.0,
    "cutoffs": "<5 낮음 / 5~7.5 경계 / 7.5~20 중간 / ≥20 높음",
    "formula": "AHA PREVENT Total CVD (Khan 2024, race-free·eGFR 반영)",
    "note": "30년 위험 34.0%. PCE 후속 모델(30~79세). 참고용, 진단 아님."
   },
   {
    "key": "framingham",
    "title": "Framingham Hard CHD (10년)",
    "category": "cardiovascular",
    "value": 18.4,
    "unit": "%",
    "level": "borderline",
    "interpretation": "10년 관상동맥질환 위험 중간",
    "cutoffs": "<5 낮음 / 5~7.5 경계 / 7.5~20 중간 / ≥20 높음",
    "formula": "Framingham Hard CHD 10년 (Wilson 1998, MDCalc calc/38)",
    "note": "당뇨 미반영·서구 코호트 기반 참고용. 진단 아님."
   },
   {
    "key": "score2",
    "title": "SCORE2 / OP (10년)",
    "category": "cardiovascular",
    "value": 12.1,
    "unit": "%",
    "level": "borderline",
    "interpretation": "10년 심혈관(CVD) 위험 중간",
    "cutoffs": "<5 낮음 / 5~7.5 경계 / 7.5~20 중간 / ≥20 높음",
    "formula": "SCORE2 (ESC 2021, High-risk 지역 보정)",
    "note": "유럽 모델을 한국에 High-risk 지역으로 근사한 참고값. 진단 아님."
   }
  ],
  "unavailable": [],
  "disclaimer": "검진 수치로 산출하는 선별용 참고 지표입니다. 진단을 대체하지 않으며, 컷오프는 연구·위험군에 따라 달라질 수 있습니다. 위험엔진(PREVENT·Framingham)은 서구 코호트 기반 참고용 시뮬레이션입니다."
 },
 "ldl_target": {
  "risk_level": "moderate",
  "label": "중등도위험군",
  "target_ldl": 130,
  "target_text": "LDL 130mg/dL 미만",
  "current_ldl": 145.0,
  "achieved": false,
  "gap": 15.0,
  "ldl_reliable": true,
  "reliability_note": null,
  "tg_value": 168.0,
  "risk_factors": [
   "현재 흡연",
   "낮은 HDL(<40)",
   "연령(남 45세 이상)"
  ],
  "basis": "주요 위험인자 3개: 현재 흡연, 낮은 HDL(<40), 연령(남 45세 이상)",
  "on_medication": false,
  "limitations": [
   "검진 결과만으로는 심혈관 질환 병력·가족력을 알 수 없어, 실제 위험도는 여기 표시된 등급보다 높을 수 있습니다.",
   "고위험군·초고위험군 판정에는 관상동맥질환 등 병력 확인이 필요합니다."
  ],
  "reference": "2022 한국지질·동맥경화학회 이상지질혈증 진료지침"
 },
 "rarity": {
  "clinical_groups": [
   "고혈압 전단계",
   "당뇨 전단계",
   "비만",
   "이상지질혈증",
   "대사증후군"
  ],
  "lifestyle_groups": [
   "현재 흡연자",
   "음주자"
  ],
  "clinical_count": 5,
  "lifestyle_count": 2,
  "interpretation": "고위험 패턴 (즉각 의료 진료 권장)"
 },
 "metabolic_syndrome_detail": {
  "factors": {
   "복부비만": {
    "met": false,
    "value": 88.0,
    "threshold": 90,
    "reason": "정상 범위",
    "by_medication": false
   },
   "고혈압": {
    "met": true,
    "value": "134.0/85.0",
    "threshold": "130/85",
    "reason": "혈압 134.0/85.0 (기준 ≥130/85)",
    "by_medication": false
   },
   "고혈당": {
    "met": true,
    "value": 110.0,
    "threshold": 100,
    "reason": "공복혈당 110.0 (기준 ≥100)",
    "by_medication": false
   },
   "낮은 HDL": {
    "met": true,
    "value": 39.0,
    "threshold": "<40",
    "reason": "HDL 39.0 (기준 <40)",
    "by_medication": false
   },
   "고중성지방": {
    "met": true,
    "value": 168.0,
    "threshold": 150,
    "reason": "TG 168.0 (기준 ≥150)",
    "by_medication": false
   }
  },
  "count": 4,
  "evaluable": 5,
  "is_metabolic_syndrome": true
 },
 "population_16yr": {
  "source": {
   "years": "2009~2024",
   "total_rows": 15957665,
   "label": "국민건강보험공단 표본 1,596만 건"
  },
  "combo_oe": {
   "대사증후군+비만": {
    "median": 2.08,
    "min": 1.97,
    "max": 2.1,
    "n_years": 9,
    "year_from": 2009,
    "year_to": 2017,
    "lipid_era_only": true,
    "by_year": [
     {
      "year": 2009,
      "oe": 2.078
     },
     {
      "year": 2010,
      "oe": 2.093
     },
     {
      "year": 2011,
      "oe": 2.09
     },
     {
      "year": 2012,
      "oe": 2.096
     },
     {
      "year": 2013,
      "oe": 2.075
     },
     {
      "year": 2014,
      "oe": 2.0
     },
     {
      "year": 2015,
      "oe": 1.972
     },
     {
      "year": 2016,
      "oe": 2.016
     },
     {
      "year": 2017,
      "oe": 1.99
     }
    ]
   },
   "흡연+음주+비만": {
    "median": 1.59,
    "min": 1.58,
    "max": 1.61,
    "n_years": 5,
    "year_from": 2020,
    "year_to": 2024,
    "lipid_era_only": false,
    "by_year": [
     {
      "year": 2020,
      "oe": 1.593
     },
     {
      "year": 2021,
      "oe": 1.607
     },
     {
      "year": 2022,
      "oe": 1.591
     },
     {
      "year": 2023,
      "oe": 1.585
     },
     {
      "year": 2024,
      "oe": 1.597
     }
    ]
   },
   "대사증후군+흡연": {
    "median": 1.17,
    "min": 1.11,
    "max": 1.26,
    "n_years": 9,
    "year_from": 2009,
    "year_to": 2017,
    "lipid_era_only": true,
    "by_year": [
     {
      "year": 2009,
      "oe": 1.108
     },
     {
      "year": 2010,
      "oe": 1.143
     },
     {
      "year": 2011,
      "oe": 1.146
     },
     {
      "year": 2012,
      "oe": 1.171
     },
     {
      "year": 2013,
      "oe": 1.173
     },
     {
      "year": 2014,
      "oe": 1.201
     },
     {
      "year": 2015,
      "oe": 1.222
     },
     {
      "year": 2016,
      "oe": 1.234
     },
     {
      "year": 2017,
      "oe": 1.263
     }
    ]
   },
   "비만+당뇨전단계": {
    "median": 1.25,
    "min": 1.22,
    "max": 1.29,
    "n_years": 16,
    "year_from": 2009,
    "year_to": 2024,
    "lipid_era_only": false,
    "by_year": [
     {
      "year": 2009,
      "oe": 1.261
     },
     {
      "year": 2010,
      "oe": 1.284
     },
     {
      "year": 2011,
      "oe": 1.276
     },
     {
      "year": 2012,
      "oe": 1.291
     },
     {
      "year": 2013,
      "oe": 1.273
     },
     {
      "year": 2014,
      "oe": 1.252
     },
     {
      "year": 2015,
      "oe": 1.249
     },
     {
      "year": 2016,
      "oe": 1.254
     },
     {
      "year": 2017,
      "oe": 1.25
     },
     {
      "year": 2018,
      "oe": 1.236
     },
     {
      "year": 2019,
      "oe": 1.246
     },
     {
      "year": 2020,
      "oe": 1.223
     },
     {
      "year": 2021,
      "oe": 1.227
     },
     {
      "year": 2022,
      "oe": 1.237
     },
     {
      "year": 2023,
      "oe": 1.24
     },
     {
      "year": 2024,
      "oe": 1.236
     }
    ]
   }
  },
  "disclaimer": "국민건강보험공단 표본 2009~2024년 15,957,665건을 재분석한 모집단 통계입니다. 원자료에 약 복용 정보가 없어 모집단 유병률은 '검진 수치 기준'이며, 서비스 판정('수치 또는 해당 약 복용')보다 좁게 잡힙니다. 개인식별자가 없어 연도별 독립 단면이므로 개인의 경과가 아니라 집단 비교입니다. 지질검사가 들어간 조합은 검사가 전원에게 실시된 2009~2017년만 집계했습니다.",
  "peer_prevalence": {
    "g_pre_hypertension": {
     "name": "고혈압 전단계",
     "pct": 38.5,
     "n_eval": 50466
    },
   "g_hypertension": {
    "name": "고혈압",
    "pct": 17.3,
    "n_eval": 50466
   },
   "g_diabetes": {
    "name": "당뇨",
    "pct": 14.6,
    "n_eval": 50466
   },
   "g_pre_diabetes": {
    "name": "당뇨 전단계",
    "pct": 43.1,
    "n_eval": 50466
   },
   "g_metabolic_syndrome": {
    "name": "대사증후군",
    "pct": 29.3,
    "n_eval": 16308
   },
   "g_obesity": {
    "name": "비만",
    "pct": 46.1,
    "n_eval": 50466
   },
   "g_dyslipidemia": {
    "name": "이상지질혈증",
    "pct": 37.4,
    "n_eval": 16302
   },
   "g_fatty_liver_suspect": {
    "name": "지방간 의심",
    "pct": 25.1,
    "n_eval": 50466
   }
  },
  "age_fixed_trend": {
   "age_band": "55~59세",
   "sex": "남성",
   "items": [
    {
     "group": "g_obesity",
     "name": "비만",
     "y2009": 21.0,
     "y2024": 46.1,
     "diff": 25.1,
     "ratio": 2.19
    },
    {
     "group": "g_fatty_liver_suspect",
     "name": "지방간 의심",
     "y2009": 11.9,
     "y2024": 25.1,
     "diff": 13.3,
     "ratio": 2.12
    },
    {
     "group": "g_pre_diabetes",
     "name": "당뇨 전단계",
     "y2009": 32.9,
     "y2024": 43.1,
     "diff": 10.3,
     "ratio": 1.31
    },
    {
     "group": "g_metabolic_syndrome",
     "name": "대사증후군",
     "y2009": 23.8,
     "y2024": 29.3,
     "diff": 5.5,
     "ratio": 1.23
    },
    {
     "group": "g_dyslipidemia",
     "name": "이상지질혈증",
     "y2009": 32.0,
     "y2024": 37.4,
     "diff": 5.4,
     "ratio": 1.17
    },
    {
     "group": "g_diabetes",
     "name": "당뇨",
     "y2009": 11.0,
     "y2024": 14.6,
     "diff": 3.7,
     "ratio": 1.33
    },
    {
     "group": "g_hypertension",
     "name": "고혈압",
     "y2009": 28.1,
     "y2024": 17.3,
     "diff": -10.8,
     "ratio": 0.62
    }
   ]
  },
  "care_distribution": {
   "신장 기능 관찰군": {
    "total": 50278,
    "dist": [
     {
      "hits": 0,
      "n": 48000,
      "pct": 95.5
     },
     {
      "hits": 1,
      "n": 2141,
      "pct": 4.3
     },
     {
      "hits": 2,
      "n": 137,
      "pct": 0.3
     }
    ]
   },
   "대사 관리 참고군": {
    "total": 16294,
    "dist": [
     {
      "hits": 0,
      "n": 2649,
      "pct": 16.3
     },
     {
      "hits": 1,
      "n": 4571,
      "pct": 28.1
     },
     {
      "hits": 2,
      "n": 4544,
      "pct": 27.9
     },
     {
      "hits": 3,
      "n": 3022,
      "pct": 18.5
     },
     {
      "hits": 4,
      "n": 1285,
      "pct": 7.9
     },
     {
      "hits": 5,
      "n": 223,
      "pct": 1.4
     }
    ]
   },
   "간 기능 관찰군": {
    "total": 50463,
    "dist": [
     {
      "hits": 0,
      "n": 36846,
      "pct": 73.0
     },
     {
      "hits": 1,
      "n": 7890,
      "pct": 15.6
     },
     {
      "hits": 2,
      "n": 3904,
      "pct": 7.7
     },
     {
      "hits": 3,
      "n": 1823,
      "pct": 3.6
     }
    ]
   },
   "지질 관리 참고군": {
    "total": 15791,
    "dist": [
     {
      "hits": 0,
      "n": 5404,
      "pct": 34.2
     },
     {
      "hits": 1,
      "n": 3345,
      "pct": 21.2
     },
     {
      "hits": 2,
      "n": 4839,
      "pct": 30.6
     },
     {
      "hits": 3,
      "n": 1885,
      "pct": 11.9
     },
     {
      "hits": 4,
      "n": 318,
      "pct": 2.0
     }
    ]
   },
   "혈압 관리 참고군": {
    "total": 50466,
    "dist": [
     {
      "hits": 0,
      "n": 28196,
      "pct": 55.9
     },
     {
      "hits": 1,
      "n": 11528,
      "pct": 22.8
     },
     {
      "hits": 2,
      "n": 10742,
      "pct": 21.3
     }
    ]
   }
  }
 }
}) as unknown as RealComboAnalysis,
};


/** 연도별 권장사항. 그 해 판정에서 백엔드가 생성한 문구만 담는다. */
export const dummyRecommendationsByYear: Record<number, RealRecommendations> = {
  2008: ({
 "user_id": null,
 "user_name": "홍길동",
 "age": 40,
 "priority_messages": [],
 "recommendations": {
  "common": [
   {
    "category": "체중 조절",
    "items": [
     "정상 BMI(18.5~24.9) 유지를 목표로 합니다.",
     "체중의 5~10% 감량만으로도 대사 지표가 크게 개선됩니다."
    ]
   },
   {
    "category": "금연",
    "items": [
     "흡연은 모든 대사증후군 인자를 악화시킵니다.",
     "금연 클리닉 또는 의료진 상담을 권장합니다."
    ]
   },
   {
    "category": "절주 / 음주 관리",
    "items": [
     "남성 하루 2잔, 여성 하루 1잔 이하로 제한.",
     "주 2회 이상 금주일 유지를 권장합니다."
    ]
   },
   {
    "category": "식사 요법",
    "items": [
     "포화지방, 트랜스지방, 단순당 섭취를 줄입니다.",
     "통곡물, 채소, 과일, 견과류, 생선 위주의 식단(지중해식 권장)."
    ]
   },
   {
    "category": "운동 요법",
    "items": [
     "주 5일 이상, 1회 30분 이상 중강도 유산소 운동 (빠르게 걷기 등).",
     "주 2회 이상 근력 운동 병행.",
     "앉아 있는 시간을 최소화합니다."
    ]
   }
  ],
  "omitted": [
   {
    "category": "저염 (나트륨 제한)",
    "reason": "나트륨 1일 2,000mg 제한은 고혈압군(수축기 140 또는 이완기 90 이상, 또는 고혈압약 복용) 기준 권고라 목표 수치로는 넣지 않았어요. 소금을 줄이는 것 자체는 여전히 권장됩니다."
   }
  ],
  "metabolic_factors": [],
  "group_specific": [
   {
    "group_id": "g_smoker_current",
    "title": "금연",
    "details": [
     "금연이 모든 만성 질환 위험을 줄입니다.",
     "금연 시작 후 1년이면 심혈관 위험 절반 감소.",
     "금연 클리닉, 니코틴 대체제 등 의료 도움 권장."
    ],
    "gap_note": null
   },
   {
    "group_id": "g_drinker",
    "title": "음주 관리",
    "details": [
     "주 2회 이상 금주일 유지.",
     "1회 음주량 제한.",
     "간 효소 수치가 높다면 절주 우선."
    ],
    "gap_note": null
   }
  ],
  "medication_notes": [],
  "elderly_notes": []
 },
 "_meta": {
  "generated_at": "2026-08-02T09:08:53",
  "version": "v1 (약대 자문)",
  "disclaimer": "본 권장사항은 일반 가이드라인이며, 개인별 의료 상담을 대체할 수 없습니다."
 }
}) as unknown as RealRecommendations,
  2010: ({
 "user_id": null,
 "user_name": "홍길동",
 "age": 42,
 "priority_messages": [],
 "recommendations": {
  "common": [
   {
    "category": "체중 조절",
    "items": [
     "정상 BMI(18.5~24.9) 유지를 목표로 합니다.",
     "체중의 5~10% 감량만으로도 대사 지표가 크게 개선됩니다."
    ]
   },
   {
    "category": "금연",
    "items": [
     "흡연은 모든 대사증후군 인자를 악화시킵니다.",
     "금연 클리닉 또는 의료진 상담을 권장합니다."
    ]
   },
   {
    "category": "절주 / 음주 관리",
    "items": [
     "남성 하루 2잔, 여성 하루 1잔 이하로 제한.",
     "주 2회 이상 금주일 유지를 권장합니다."
    ]
   },
   {
    "category": "식사 요법",
    "items": [
     "포화지방, 트랜스지방, 단순당 섭취를 줄입니다.",
     "통곡물, 채소, 과일, 견과류, 생선 위주의 식단(지중해식 권장)."
    ]
   },
   {
    "category": "운동 요법",
    "items": [
     "주 5일 이상, 1회 30분 이상 중강도 유산소 운동 (빠르게 걷기 등).",
     "주 2회 이상 근력 운동 병행.",
     "앉아 있는 시간을 최소화합니다."
    ]
   }
  ],
  "omitted": [
   {
    "category": "저염 (나트륨 제한)",
    "reason": "나트륨 1일 2,000mg 제한은 고혈압군(수축기 140 또는 이완기 90 이상, 또는 고혈압약 복용) 기준 권고라 목표 수치로는 넣지 않았어요. 소금을 줄이는 것 자체는 여전히 권장됩니다."
   }
  ],
  "metabolic_factors": [],
  "group_specific": [
   {
    "group_id": "g_smoker_current",
    "title": "금연",
    "details": [
     "금연이 모든 만성 질환 위험을 줄입니다.",
     "금연 시작 후 1년이면 심혈관 위험 절반 감소.",
     "금연 클리닉, 니코틴 대체제 등 의료 도움 권장."
    ],
    "gap_note": null
   },
   {
    "group_id": "g_drinker",
    "title": "음주 관리",
    "details": [
     "주 2회 이상 금주일 유지.",
     "1회 음주량 제한.",
     "간 효소 수치가 높다면 절주 우선."
    ],
    "gap_note": null
   }
  ],
  "medication_notes": [],
  "elderly_notes": []
 },
 "_meta": {
  "generated_at": "2026-08-02T09:08:53",
  "version": "v1 (약대 자문)",
  "disclaimer": "본 권장사항은 일반 가이드라인이며, 개인별 의료 상담을 대체할 수 없습니다."
 }
}) as unknown as RealRecommendations,
  2012: ({
 "user_id": null,
 "user_name": "홍길동",
 "age": 44,
 "priority_messages": [],
 "recommendations": {
  "common": [
   {
    "category": "체중 조절",
    "items": [
     "정상 BMI(18.5~24.9) 유지를 목표로 합니다.",
     "체중의 5~10% 감량만으로도 대사 지표가 크게 개선됩니다."
    ]
   },
   {
    "category": "금연",
    "items": [
     "흡연은 모든 대사증후군 인자를 악화시킵니다.",
     "금연 클리닉 또는 의료진 상담을 권장합니다."
    ]
   },
   {
    "category": "절주 / 음주 관리",
    "items": [
     "남성 하루 2잔, 여성 하루 1잔 이하로 제한.",
     "주 2회 이상 금주일 유지를 권장합니다."
    ]
   },
   {
    "category": "식사 요법",
    "items": [
     "포화지방, 트랜스지방, 단순당 섭취를 줄입니다.",
     "통곡물, 채소, 과일, 견과류, 생선 위주의 식단(지중해식 권장)."
    ]
   },
   {
    "category": "운동 요법",
    "items": [
     "주 5일 이상, 1회 30분 이상 중강도 유산소 운동 (빠르게 걷기 등).",
     "주 2회 이상 근력 운동 병행.",
     "앉아 있는 시간을 최소화합니다."
    ]
   }
  ],
  "omitted": [
   {
    "category": "저염 (나트륨 제한)",
    "reason": "나트륨 1일 2,000mg 제한은 고혈압군(수축기 140 또는 이완기 90 이상, 또는 고혈압약 복용) 기준 권고라 목표 수치로는 넣지 않았어요. 소금을 줄이는 것 자체는 여전히 권장됩니다."
   }
  ],
  "metabolic_factors": [],
  "group_specific": [
   {
    "group_id": "g_smoker_current",
    "title": "금연",
    "details": [
     "금연이 모든 만성 질환 위험을 줄입니다.",
     "금연 시작 후 1년이면 심혈관 위험 절반 감소.",
     "금연 클리닉, 니코틴 대체제 등 의료 도움 권장."
    ],
    "gap_note": null
   },
   {
    "group_id": "g_drinker",
    "title": "음주 관리",
    "details": [
     "주 2회 이상 금주일 유지.",
     "1회 음주량 제한.",
     "간 효소 수치가 높다면 절주 우선."
    ],
    "gap_note": null
   }
  ],
  "medication_notes": [],
  "elderly_notes": []
 },
 "_meta": {
  "generated_at": "2026-08-02T09:08:54",
  "version": "v1 (약대 자문)",
  "disclaimer": "본 권장사항은 일반 가이드라인이며, 개인별 의료 상담을 대체할 수 없습니다."
 }
}) as unknown as RealRecommendations,
  2014: ({
 "user_id": null,
 "user_name": "홍길동",
 "age": 46,
 "priority_messages": [],
 "recommendations": {
  "common": [
   {
    "category": "체중 조절",
    "items": [
     "정상 BMI(18.5~24.9) 유지를 목표로 합니다.",
     "체중의 5~10% 감량만으로도 대사 지표가 크게 개선됩니다."
    ]
   },
   {
    "category": "금연",
    "items": [
     "흡연은 모든 대사증후군 인자를 악화시킵니다.",
     "금연 클리닉 또는 의료진 상담을 권장합니다."
    ]
   },
   {
    "category": "절주 / 음주 관리",
    "items": [
     "남성 하루 2잔, 여성 하루 1잔 이하로 제한.",
     "주 2회 이상 금주일 유지를 권장합니다."
    ]
   },
   {
    "category": "식사 요법",
    "items": [
     "포화지방, 트랜스지방, 단순당 섭취를 줄입니다.",
     "통곡물, 채소, 과일, 견과류, 생선 위주의 식단(지중해식 권장)."
    ]
   },
   {
    "category": "운동 요법",
    "items": [
     "주 5일 이상, 1회 30분 이상 중강도 유산소 운동 (빠르게 걷기 등).",
     "주 2회 이상 근력 운동 병행.",
     "앉아 있는 시간을 최소화합니다."
    ]
   }
  ],
  "omitted": [
   {
    "category": "저염 (나트륨 제한)",
    "reason": "나트륨 1일 2,000mg 제한은 고혈압군(수축기 140 또는 이완기 90 이상, 또는 고혈압약 복용) 기준 권고라 목표 수치로는 넣지 않았어요. 소금을 줄이는 것 자체는 여전히 권장됩니다."
   }
  ],
  "metabolic_factors": [
   {
    "factor": "고혈당",
    "title": "혈당 관리",
    "target": "공복혈당 <100mg/dL",
    "details": [
     "단순당(설탕, 시럽, 청량음료) 제한.",
     "복합 탄수화물(현미, 잡곡) 위주 섭취.",
     "식후 30분 가벼운 걷기 권장.",
     "당뇨 약물 복용 중이라면 저혈당 증상(어지러움, 식은땀) 주의.",
     "HbA1c 추가 검사로 3개월 평균 혈당 확인 권장."
    ],
    "by_medication": false,
    "reason": "공복혈당 101.0 (기준 ≥100)",
    "gap_note": "지금 101mg/dL — 목표 100mg/dL 미만까지 1mg/dL 남았어요."
   }
  ],
  "group_specific": [
   {
    "group_id": "g_smoker_current",
    "title": "금연",
    "details": [
     "금연이 모든 만성 질환 위험을 줄입니다.",
     "금연 시작 후 1년이면 심혈관 위험 절반 감소.",
     "금연 클리닉, 니코틴 대체제 등 의료 도움 권장."
    ],
    "gap_note": null
   },
   {
    "group_id": "g_drinker",
    "title": "음주 관리",
    "details": [
     "주 2회 이상 금주일 유지.",
     "1회 음주량 제한.",
     "간 효소 수치가 높다면 절주 우선."
    ],
    "gap_note": null
   }
  ],
  "medication_notes": [],
  "elderly_notes": []
 },
 "_meta": {
  "generated_at": "2026-08-02T09:08:54",
  "version": "v1 (약대 자문)",
  "disclaimer": "본 권장사항은 일반 가이드라인이며, 개인별 의료 상담을 대체할 수 없습니다."
 }
}) as unknown as RealRecommendations,
  2016: ({
 "user_id": null,
 "user_name": "홍길동",
 "age": 48,
 "priority_messages": [
  "대사증후군에 해당합니다 — 5개 기준 중 3개(고혈압 · 고혈당 · 고중성지방)를 충족합니다. 심혈관 질환 위험이 매우 높으니 의료진 상담을 권장합니다."
 ],
 "recommendations": {
  "common": [
   {
    "category": "체중 조절",
    "items": [
     "정상 BMI(18.5~24.9) 유지를 목표로 합니다.",
     "체중의 5~10% 감량만으로도 대사 지표가 크게 개선됩니다."
    ]
   },
   {
    "category": "금연",
    "items": [
     "흡연은 모든 대사증후군 인자를 악화시킵니다.",
     "금연 클리닉 또는 의료진 상담을 권장합니다."
    ]
   },
   {
    "category": "절주 / 음주 관리",
    "items": [
     "남성 하루 2잔, 여성 하루 1잔 이하로 제한.",
     "주 2회 이상 금주일 유지를 권장합니다."
    ]
   },
   {
    "category": "식사 요법",
    "items": [
     "포화지방, 트랜스지방, 단순당 섭취를 줄입니다.",
     "통곡물, 채소, 과일, 견과류, 생선 위주의 식단(지중해식 권장)."
    ]
   },
   {
    "category": "운동 요법",
    "items": [
     "주 5일 이상, 1회 30분 이상 중강도 유산소 운동 (빠르게 걷기 등).",
     "주 2회 이상 근력 운동 병행.",
     "앉아 있는 시간을 최소화합니다."
    ]
   }
  ],
  "omitted": [
   {
    "category": "저염 (나트륨 제한)",
    "reason": "나트륨 1일 2,000mg 제한은 고혈압군(수축기 140 또는 이완기 90 이상, 또는 고혈압약 복용) 기준 권고라 목표 수치로는 넣지 않았어요. 소금을 줄이는 것 자체는 여전히 권장됩니다."
   }
  ],
  "metabolic_factors": [
   {
    "factor": "고혈압",
    "title": "혈압 관리",
    "target": "수축기 <130mmHg, 이완기 <85mmHg",
    "details": [
     "DASH 식단(저염, 채소/과일 중심) 권장.",
     "나트륨 섭취 제한 (1일 2,000mg 이하).",
     "가정 혈압 측정을 주 3회 이상 시행.",
     "약물 복용 중이라면 임의 중단 금지, 의료진 상담 필수."
    ],
    "by_medication": false,
    "reason": "혈압 130.0/83.0 (기준 ≥130/85)",
    "gap_note": "지금 130/83mmHg — 목표 130/85mmHg 미만까지 수축기 0 남았어요."
   },
   {
    "factor": "고혈당",
    "title": "혈당 관리",
    "target": "공복혈당 <100mg/dL",
    "details": [
     "단순당(설탕, 시럽, 청량음료) 제한.",
     "복합 탄수화물(현미, 잡곡) 위주 섭취.",
     "식후 30분 가벼운 걷기 권장.",
     "당뇨 약물 복용 중이라면 저혈당 증상(어지러움, 식은땀) 주의.",
     "HbA1c 추가 검사로 3개월 평균 혈당 확인 권장."
    ],
    "by_medication": false,
    "reason": "공복혈당 104.0 (기준 ≥100)",
    "gap_note": "지금 104mg/dL — 목표 100mg/dL 미만까지 4mg/dL 남았어요."
   },
   {
    "factor": "고중성지방",
    "title": "중성지방 관리",
    "target": "<150mg/dL",
    "details": [
     "탄수화물/단순당 섭취 제한.",
     "알코올 섭취 제한 (TG는 음주에 매우 민감).",
     "유산소 운동 (주 150분 이상).",
     "오메가-3 보충제는 의료진과 상담 후 결정."
    ],
    "by_medication": false,
    "reason": "TG 156.0 (기준 ≥150)",
    "gap_note": "지금 156mg/dL — 목표 150mg/dL 미만까지 6mg/dL 남았어요."
   }
  ],
  "group_specific": [
   {
    "group_id": "g_smoker_current",
    "title": "금연",
    "details": [
     "금연이 모든 만성 질환 위험을 줄입니다.",
     "금연 시작 후 1년이면 심혈관 위험 절반 감소.",
     "금연 클리닉, 니코틴 대체제 등 의료 도움 권장."
    ],
    "gap_note": null
   },
   {
    "group_id": "g_drinker",
    "title": "음주 관리",
    "details": [
     "주 2회 이상 금주일 유지.",
     "1회 음주량 제한.",
     "간 효소 수치가 높다면 절주 우선."
    ],
    "gap_note": null
   }
  ],
  "medication_notes": [],
  "elderly_notes": []
 },
 "_meta": {
  "generated_at": "2026-08-02T09:08:54",
  "version": "v1 (약대 자문)",
  "disclaimer": "본 권장사항은 일반 가이드라인이며, 개인별 의료 상담을 대체할 수 없습니다."
 }
}) as unknown as RealRecommendations,
  2018: ({
 "user_id": null,
 "user_name": "홍길동",
 "age": 50,
 "priority_messages": [
  "대사증후군에 해당합니다 — 5개 기준 중 4개(복부비만 · 고혈압 · 고혈당 · 고중성지방)를 충족합니다. 심혈관 질환 위험이 매우 높으니 의료진 상담을 권장합니다."
 ],
 "recommendations": {
  "common": [
   {
    "category": "체중 조절",
    "items": [
     "정상 BMI(18.5~24.9) 유지를 목표로 합니다.",
     "체중의 5~10% 감량만으로도 대사 지표가 크게 개선됩니다."
    ]
   },
   {
    "category": "금연",
    "items": [
     "흡연은 모든 대사증후군 인자를 악화시킵니다.",
     "금연 클리닉 또는 의료진 상담을 권장합니다."
    ]
   },
   {
    "category": "절주 / 음주 관리",
    "items": [
     "남성 하루 2잔, 여성 하루 1잔 이하로 제한.",
     "주 2회 이상 금주일 유지를 권장합니다."
    ]
   },
   {
    "category": "식사 요법",
    "items": [
     "포화지방, 트랜스지방, 단순당 섭취를 줄입니다.",
     "통곡물, 채소, 과일, 견과류, 생선 위주의 식단(지중해식 권장)."
    ]
   },
   {
    "category": "운동 요법",
    "items": [
     "주 5일 이상, 1회 30분 이상 중강도 유산소 운동 (빠르게 걷기 등).",
     "주 2회 이상 근력 운동 병행.",
     "앉아 있는 시간을 최소화합니다."
    ]
   }
  ],
  "omitted": [
   {
    "category": "저염 (나트륨 제한)",
    "reason": "나트륨 1일 2,000mg 제한은 고혈압군(수축기 140 또는 이완기 90 이상, 또는 고혈압약 복용) 기준 권고라 목표 수치로는 넣지 않았어요. 소금을 줄이는 것 자체는 여전히 권장됩니다."
   }
  ],
  "metabolic_factors": [
   {
    "factor": "복부비만",
    "title": "복부비만 관리",
    "target": "남 허리둘레 <90cm / 여 <85cm",
    "details": [
     "내장지방 감소를 위해 유산소 운동을 우선합니다.",
     "허리둘레 측정을 월 1회 시행하여 변화 추적.",
     "체중의 5% 감량 시 허리둘레가 평균 3~5cm 줄어듭니다."
    ],
    "by_medication": false,
    "reason": "허리둘레 92.0cm (기준 ≥90)",
    "gap_note": "지금 92cm — 목표 90cm 미만까지 2cm 남았어요."
   },
   {
    "factor": "고혈압",
    "title": "혈압 관리",
    "target": "수축기 <130mmHg, 이완기 <85mmHg",
    "details": [
     "DASH 식단(저염, 채소/과일 중심) 권장.",
     "나트륨 섭취 제한 (1일 2,000mg 이하).",
     "가정 혈압 측정을 주 3회 이상 시행.",
     "약물 복용 중이라면 임의 중단 금지, 의료진 상담 필수."
    ],
    "by_medication": false,
    "reason": "혈압 133.0/84.0 (기준 ≥130/85)",
    "gap_note": "지금 133/84mmHg — 목표 130/85mmHg 미만까지 수축기 3 남았어요."
   },
   {
    "factor": "고혈당",
    "title": "혈당 관리",
    "target": "공복혈당 <100mg/dL",
    "details": [
     "단순당(설탕, 시럽, 청량음료) 제한.",
     "복합 탄수화물(현미, 잡곡) 위주 섭취.",
     "식후 30분 가벼운 걷기 권장.",
     "당뇨 약물 복용 중이라면 저혈당 증상(어지러움, 식은땀) 주의.",
     "HbA1c 추가 검사로 3개월 평균 혈당 확인 권장."
    ],
    "by_medication": false,
    "reason": "공복혈당 108.0 (기준 ≥100)",
    "gap_note": "지금 108mg/dL — 목표 100mg/dL 미만까지 8mg/dL 남았어요."
   },
   {
    "factor": "고중성지방",
    "title": "중성지방 관리",
    "target": "<150mg/dL",
    "details": [
     "탄수화물/단순당 섭취 제한.",
     "알코올 섭취 제한 (TG는 음주에 매우 민감).",
     "유산소 운동 (주 150분 이상).",
     "오메가-3 보충제는 의료진과 상담 후 결정."
    ],
    "by_medication": false,
    "reason": "TG 165.0 (기준 ≥150)",
    "gap_note": "지금 165mg/dL — 목표 150mg/dL 미만까지 15mg/dL 남았어요."
   }
  ],
  "group_specific": [
   {
    "group_id": "g_obesity",
    "title": "비만 관리",
    "details": [
     "단계적 체중 감량 (3~6개월에 5~10%).",
     "지속 가능한 식습관 변화를 우선.",
     "BMI 25 미만 도달을 목표로 설정."
    ],
    "gap_note": "지금 BMI 25.4 — 목표 25 미만까지 0.4 남았어요."
   },
   {
    "group_id": "g_smoker_current",
    "title": "금연",
    "details": [
     "금연이 모든 만성 질환 위험을 줄입니다.",
     "금연 시작 후 1년이면 심혈관 위험 절반 감소.",
     "금연 클리닉, 니코틴 대체제 등 의료 도움 권장."
    ],
    "gap_note": null
   },
   {
    "group_id": "g_drinker",
    "title": "음주 관리",
    "details": [
     "주 2회 이상 금주일 유지.",
     "1회 음주량 제한.",
     "간 효소 수치가 높다면 절주 우선."
    ],
    "gap_note": null
   }
  ],
  "medication_notes": [],
  "elderly_notes": []
 },
 "_meta": {
  "generated_at": "2026-08-02T09:08:54",
  "version": "v1 (약대 자문)",
  "disclaimer": "본 권장사항은 일반 가이드라인이며, 개인별 의료 상담을 대체할 수 없습니다."
 }
}) as unknown as RealRecommendations,
  2020: ({
 "user_id": null,
 "user_name": "홍길동",
 "age": 52,
 "priority_messages": [
  "대사증후군에 해당합니다 — 5개 기준 중 5개(복부비만 · 고혈압 · 고혈당 · 낮은 HDL · 고중성지방)를 충족합니다. 심혈관 질환 위험이 매우 높으니 의료진 상담을 권장합니다.",
  "지방간 의심 - 간 초음파 검사 및 절주 권장."
 ],
 "recommendations": {
  "common": [
   {
    "category": "체중 조절",
    "items": [
     "정상 BMI(18.5~24.9) 유지를 목표로 합니다.",
     "체중의 5~10% 감량만으로도 대사 지표가 크게 개선됩니다."
    ]
   },
   {
    "category": "금연",
    "items": [
     "흡연은 모든 대사증후군 인자를 악화시킵니다.",
     "금연 클리닉 또는 의료진 상담을 권장합니다."
    ]
   },
   {
    "category": "절주 / 음주 관리",
    "items": [
     "남성 하루 2잔, 여성 하루 1잔 이하로 제한.",
     "주 2회 이상 금주일 유지를 권장합니다."
    ]
   },
   {
    "category": "식사 요법",
    "items": [
     "포화지방, 트랜스지방, 단순당 섭취를 줄입니다.",
     "통곡물, 채소, 과일, 견과류, 생선 위주의 식단(지중해식 권장)."
    ]
   },
   {
    "category": "운동 요법",
    "items": [
     "주 5일 이상, 1회 30분 이상 중강도 유산소 운동 (빠르게 걷기 등).",
     "주 2회 이상 근력 운동 병행.",
     "앉아 있는 시간을 최소화합니다."
    ]
   }
  ],
  "omitted": [
   {
    "category": "저염 (나트륨 제한)",
    "reason": "나트륨 1일 2,000mg 제한은 고혈압군(수축기 140 또는 이완기 90 이상, 또는 고혈압약 복용) 기준 권고라 목표 수치로는 넣지 않았어요. 소금을 줄이는 것 자체는 여전히 권장됩니다."
   }
  ],
  "metabolic_factors": [
   {
    "factor": "복부비만",
    "title": "복부비만 관리",
    "target": "남 허리둘레 <90cm / 여 <85cm",
    "details": [
     "내장지방 감소를 위해 유산소 운동을 우선합니다.",
     "허리둘레 측정을 월 1회 시행하여 변화 추적.",
     "체중의 5% 감량 시 허리둘레가 평균 3~5cm 줄어듭니다."
    ],
    "by_medication": false,
    "reason": "허리둘레 96.0cm (기준 ≥90)",
    "gap_note": "지금 96cm — 목표 90cm 미만까지 6cm 남았어요."
   },
   {
    "factor": "고혈압",
    "title": "혈압 관리",
    "target": "수축기 <130mmHg, 이완기 <85mmHg",
    "details": [
     "DASH 식단(저염, 채소/과일 중심) 권장.",
     "나트륨 섭취 제한 (1일 2,000mg 이하).",
     "가정 혈압 측정을 주 3회 이상 시행.",
     "약물 복용 중이라면 임의 중단 금지, 의료진 상담 필수."
    ],
    "by_medication": false,
    "reason": "혈압 139.0/89.0 (기준 ≥130/85)",
    "gap_note": "지금 139/89mmHg — 목표 130/85mmHg 미만까지 수축기 9 · 이완기 4 남았어요."
   },
   {
    "factor": "고혈당",
    "title": "혈당 관리",
    "target": "공복혈당 <100mg/dL",
    "details": [
     "단순당(설탕, 시럽, 청량음료) 제한.",
     "복합 탄수화물(현미, 잡곡) 위주 섭취.",
     "식후 30분 가벼운 걷기 권장.",
     "당뇨 약물 복용 중이라면 저혈당 증상(어지러움, 식은땀) 주의.",
     "HbA1c 추가 검사로 3개월 평균 혈당 확인 권장."
    ],
    "by_medication": false,
    "reason": "공복혈당 120.0 (기준 ≥100)",
    "gap_note": "지금 120mg/dL — 목표 100mg/dL 미만까지 20mg/dL 남았어요."
   },
   {
    "factor": "낮은 HDL",
    "title": "HDL 콜레스테롤 관리",
    "target": "남 ≥40mg/dL, 여 ≥50mg/dL (이상적: ≥60)",
    "details": [
     "유산소 운동이 HDL 상승에 가장 효과적.",
     "오메가-3 섭취 (등푸른 생선, 견과류).",
     "트랜스지방 섭취 제한.",
     "금연 시 HDL이 평균 5~10% 상승합니다."
    ],
    "by_medication": false,
    "reason": "HDL 36.0 (기준 <40)",
    "gap_note": "지금 36mg/dL — 목표 40mg/dL 이상까지 4mg/dL 남았어요."
   },
   {
    "factor": "고중성지방",
    "title": "중성지방 관리",
    "target": "<150mg/dL",
    "details": [
     "탄수화물/단순당 섭취 제한.",
     "알코올 섭취 제한 (TG는 음주에 매우 민감).",
     "유산소 운동 (주 150분 이상).",
     "오메가-3 보충제는 의료진과 상담 후 결정."
    ],
    "by_medication": false,
    "reason": "TG 196.0 (기준 ≥150)",
    "gap_note": "지금 196mg/dL — 목표 150mg/dL 미만까지 46mg/dL 남았어요."
   }
  ],
  "group_specific": [
   {
    "group_id": "g_obesity",
    "title": "비만 관리",
    "details": [
     "단계적 체중 감량 (3~6개월에 5~10%).",
     "지속 가능한 식습관 변화를 우선.",
     "BMI 25 미만 도달을 목표로 설정."
    ],
    "gap_note": "지금 BMI 27.0 — 목표 25 미만까지 2 남았어요."
   },
   {
    "group_id": "g_fatty_liver_suspect",
    "title": "지방간 관리",
    "details": [
     "체중 감량이 가장 효과적인 치료.",
     "알코올 섭취 중단/제한.",
     "간 초음파 등 추가 검사 권장.",
     "간 효소 수치를 3~6개월 후 재검사."
    ],
    "gap_note": "지금 ALT 47(기준 40 초과) · 감마-GTP 82(기준 75 초과) — 3~6개월 뒤 이 수치를 다시 재는 것이 목표예요."
   },
   {
    "group_id": "g_smoker_current",
    "title": "금연",
    "details": [
     "금연이 모든 만성 질환 위험을 줄입니다.",
     "금연 시작 후 1년이면 심혈관 위험 절반 감소.",
     "금연 클리닉, 니코틴 대체제 등 의료 도움 권장."
    ],
    "gap_note": null
   },
   {
    "group_id": "g_drinker",
    "title": "음주 관리",
    "details": [
     "주 2회 이상 금주일 유지.",
     "1회 음주량 제한.",
     "간 효소 수치가 높다면 절주 우선."
    ],
    "gap_note": null
   }
  ],
  "medication_notes": [],
  "elderly_notes": []
 },
 "_meta": {
  "generated_at": "2026-08-02T09:08:54",
  "version": "v1 (약대 자문)",
  "disclaimer": "본 권장사항은 일반 가이드라인이며, 개인별 의료 상담을 대체할 수 없습니다."
 }
}) as unknown as RealRecommendations,
  2022: ({
 "user_id": null,
 "user_name": "홍길동",
 "age": 54,
 "priority_messages": [
  "대사증후군에 해당합니다 — 5개 기준 중 5개(복부비만 · 고혈압 · 고혈당 · 낮은 HDL · 고중성지방)를 충족합니다. 심혈관 질환 위험이 매우 높으니 의료진 상담을 권장합니다."
 ],
 "recommendations": {
  "common": [
   {
    "category": "체중 조절",
    "items": [
     "정상 BMI(18.5~24.9) 유지를 목표로 합니다.",
     "체중의 5~10% 감량만으로도 대사 지표가 크게 개선됩니다."
    ]
   },
   {
    "category": "금연",
    "items": [
     "흡연은 모든 대사증후군 인자를 악화시킵니다.",
     "금연 클리닉 또는 의료진 상담을 권장합니다."
    ]
   },
   {
    "category": "절주 / 음주 관리",
    "items": [
     "남성 하루 2잔, 여성 하루 1잔 이하로 제한.",
     "주 2회 이상 금주일 유지를 권장합니다."
    ]
   },
   {
    "category": "식사 요법",
    "items": [
     "포화지방, 트랜스지방, 단순당 섭취를 줄입니다.",
     "통곡물, 채소, 과일, 견과류, 생선 위주의 식단(지중해식 권장)."
    ]
   },
   {
    "category": "운동 요법",
    "items": [
     "주 5일 이상, 1회 30분 이상 중강도 유산소 운동 (빠르게 걷기 등).",
     "주 2회 이상 근력 운동 병행.",
     "앉아 있는 시간을 최소화합니다."
    ]
   }
  ],
  "omitted": [
   {
    "category": "저염 (나트륨 제한)",
    "reason": "나트륨 1일 2,000mg 제한은 고혈압군(수축기 140 또는 이완기 90 이상, 또는 고혈압약 복용) 기준 권고라 목표 수치로는 넣지 않았어요. 소금을 줄이는 것 자체는 여전히 권장됩니다."
   }
  ],
  "metabolic_factors": [
   {
    "factor": "복부비만",
    "title": "복부비만 관리",
    "target": "남 허리둘레 <90cm / 여 <85cm",
    "details": [
     "내장지방 감소를 위해 유산소 운동을 우선합니다.",
     "허리둘레 측정을 월 1회 시행하여 변화 추적.",
     "체중의 5% 감량 시 허리둘레가 평균 3~5cm 줄어듭니다."
    ],
    "by_medication": false,
    "reason": "허리둘레 91.0cm (기준 ≥90)",
    "gap_note": "지금 91cm — 목표 90cm 미만까지 1cm 남았어요."
   },
   {
    "factor": "고혈압",
    "title": "혈압 관리",
    "target": "수축기 <130mmHg, 이완기 <85mmHg",
    "details": [
     "DASH 식단(저염, 채소/과일 중심) 권장.",
     "나트륨 섭취 제한 (1일 2,000mg 이하).",
     "가정 혈압 측정을 주 3회 이상 시행.",
     "약물 복용 중이라면 임의 중단 금지, 의료진 상담 필수."
    ],
    "by_medication": false,
    "reason": "혈압 136.0/84.0 (기준 ≥130/85)",
    "gap_note": "지금 136/84mmHg — 목표 130/85mmHg 미만까지 수축기 6 남았어요."
   },
   {
    "factor": "고혈당",
    "title": "혈당 관리",
    "target": "공복혈당 <100mg/dL",
    "details": [
     "단순당(설탕, 시럽, 청량음료) 제한.",
     "복합 탄수화물(현미, 잡곡) 위주 섭취.",
     "식후 30분 가벼운 걷기 권장.",
     "당뇨 약물 복용 중이라면 저혈당 증상(어지러움, 식은땀) 주의.",
     "HbA1c 추가 검사로 3개월 평균 혈당 확인 권장."
    ],
    "by_medication": false,
    "reason": "공복혈당 113.0 (기준 ≥100)",
    "gap_note": "지금 113mg/dL — 목표 100mg/dL 미만까지 13mg/dL 남았어요."
   },
   {
    "factor": "낮은 HDL",
    "title": "HDL 콜레스테롤 관리",
    "target": "남 ≥40mg/dL, 여 ≥50mg/dL (이상적: ≥60)",
    "details": [
     "유산소 운동이 HDL 상승에 가장 효과적.",
     "오메가-3 섭취 (등푸른 생선, 견과류).",
     "트랜스지방 섭취 제한.",
     "금연 시 HDL이 평균 5~10% 상승합니다."
    ],
    "by_medication": false,
    "reason": "HDL 38.0 (기준 <40)",
    "gap_note": "지금 38mg/dL — 목표 40mg/dL 이상까지 2mg/dL 남았어요."
   },
   {
    "factor": "고중성지방",
    "title": "중성지방 관리",
    "target": "<150mg/dL",
    "details": [
     "탄수화물/단순당 섭취 제한.",
     "알코올 섭취 제한 (TG는 음주에 매우 민감).",
     "유산소 운동 (주 150분 이상).",
     "오메가-3 보충제는 의료진과 상담 후 결정."
    ],
    "by_medication": false,
    "reason": "TG 174.0 (기준 ≥150)",
    "gap_note": "지금 174mg/dL — 목표 150mg/dL 미만까지 24mg/dL 남았어요."
   }
  ],
  "group_specific": [
   {
    "group_id": "g_obesity",
    "title": "비만 관리",
    "details": [
     "단계적 체중 감량 (3~6개월에 5~10%).",
     "지속 가능한 식습관 변화를 우선.",
     "BMI 25 미만 도달을 목표로 설정."
    ],
    "gap_note": "지금 BMI 25.9 — 목표 25 미만까지 0.9 남았어요."
   },
   {
    "group_id": "g_smoker_current",
    "title": "금연",
    "details": [
     "금연이 모든 만성 질환 위험을 줄입니다.",
     "금연 시작 후 1년이면 심혈관 위험 절반 감소.",
     "금연 클리닉, 니코틴 대체제 등 의료 도움 권장."
    ],
    "gap_note": null
   },
   {
    "group_id": "g_drinker",
    "title": "음주 관리",
    "details": [
     "주 2회 이상 금주일 유지.",
     "1회 음주량 제한.",
     "간 효소 수치가 높다면 절주 우선."
    ],
    "gap_note": null
   }
  ],
  "medication_notes": [],
  "elderly_notes": []
 },
 "_meta": {
  "generated_at": "2026-08-02T09:08:54",
  "version": "v1 (약대 자문)",
  "disclaimer": "본 권장사항은 일반 가이드라인이며, 개인별 의료 상담을 대체할 수 없습니다."
 }
}) as unknown as RealRecommendations,
  2024: ({
 "user_id": null,
 "user_name": "홍길동",
 "age": 56,
 "priority_messages": [
  "대사증후군에 해당합니다 — 5개 기준 중 4개(고혈압 · 고혈당 · 낮은 HDL · 고중성지방)를 충족합니다. 심혈관 질환 위험이 매우 높으니 의료진 상담을 권장합니다."
 ],
 "recommendations": {
  "common": [
   {
    "category": "체중 조절",
    "items": [
     "정상 BMI(18.5~24.9) 유지를 목표로 합니다.",
     "체중의 5~10% 감량만으로도 대사 지표가 크게 개선됩니다."
    ]
   },
   {
    "category": "금연",
    "items": [
     "흡연은 모든 대사증후군 인자를 악화시킵니다.",
     "금연 클리닉 또는 의료진 상담을 권장합니다."
    ]
   },
   {
    "category": "절주 / 음주 관리",
    "items": [
     "남성 하루 2잔, 여성 하루 1잔 이하로 제한.",
     "주 2회 이상 금주일 유지를 권장합니다."
    ]
   },
   {
    "category": "식사 요법",
    "items": [
     "포화지방, 트랜스지방, 단순당 섭취를 줄입니다.",
     "통곡물, 채소, 과일, 견과류, 생선 위주의 식단(지중해식 권장)."
    ]
   },
   {
    "category": "운동 요법",
    "items": [
     "주 5일 이상, 1회 30분 이상 중강도 유산소 운동 (빠르게 걷기 등).",
     "주 2회 이상 근력 운동 병행.",
     "앉아 있는 시간을 최소화합니다."
    ]
   }
  ],
  "omitted": [
   {
    "category": "저염 (나트륨 제한)",
    "reason": "나트륨 1일 2,000mg 제한은 고혈압군(수축기 140 또는 이완기 90 이상, 또는 고혈압약 복용) 기준 권고라 목표 수치로는 넣지 않았어요. 소금을 줄이는 것 자체는 여전히 권장됩니다."
   }
  ],
  "metabolic_factors": [
   {
    "factor": "고혈압",
    "title": "혈압 관리",
    "target": "수축기 <130mmHg, 이완기 <85mmHg",
    "details": [
     "DASH 식단(저염, 채소/과일 중심) 권장.",
     "나트륨 섭취 제한 (1일 2,000mg 이하).",
     "가정 혈압 측정을 주 3회 이상 시행.",
     "약물 복용 중이라면 임의 중단 금지, 의료진 상담 필수."
    ],
    "by_medication": false,
    "reason": "혈압 134.0/85.0 (기준 ≥130/85)",
    "gap_note": "지금 134/85mmHg — 목표 130/85mmHg 미만까지 수축기 4 · 이완기 0 남았어요."
   },
   {
    "factor": "고혈당",
    "title": "혈당 관리",
    "target": "공복혈당 <100mg/dL",
    "details": [
     "단순당(설탕, 시럽, 청량음료) 제한.",
     "복합 탄수화물(현미, 잡곡) 위주 섭취.",
     "식후 30분 가벼운 걷기 권장.",
     "당뇨 약물 복용 중이라면 저혈당 증상(어지러움, 식은땀) 주의.",
     "HbA1c 추가 검사로 3개월 평균 혈당 확인 권장."
    ],
    "by_medication": false,
    "reason": "공복혈당 110.0 (기준 ≥100)",
    "gap_note": "지금 110mg/dL — 목표 100mg/dL 미만까지 10mg/dL 남았어요."
   },
   {
    "factor": "낮은 HDL",
    "title": "HDL 콜레스테롤 관리",
    "target": "남 ≥40mg/dL, 여 ≥50mg/dL (이상적: ≥60)",
    "details": [
     "유산소 운동이 HDL 상승에 가장 효과적.",
     "오메가-3 섭취 (등푸른 생선, 견과류).",
     "트랜스지방 섭취 제한.",
     "금연 시 HDL이 평균 5~10% 상승합니다."
    ],
    "by_medication": false,
    "reason": "HDL 39.0 (기준 <40)",
    "gap_note": "지금 39mg/dL — 목표 40mg/dL 이상까지 1mg/dL 남았어요."
   },
   {
    "factor": "고중성지방",
    "title": "중성지방 관리",
    "target": "<150mg/dL",
    "details": [
     "탄수화물/단순당 섭취 제한.",
     "알코올 섭취 제한 (TG는 음주에 매우 민감).",
     "유산소 운동 (주 150분 이상).",
     "오메가-3 보충제는 의료진과 상담 후 결정."
    ],
    "by_medication": false,
    "reason": "TG 168.0 (기준 ≥150)",
    "gap_note": "지금 168mg/dL — 목표 150mg/dL 미만까지 18mg/dL 남았어요."
   }
  ],
  "group_specific": [
   {
    "group_id": "g_obesity",
    "title": "비만 관리",
    "details": [
     "단계적 체중 감량 (3~6개월에 5~10%).",
     "지속 가능한 식습관 변화를 우선.",
     "BMI 25 미만 도달을 목표로 설정."
    ],
    "gap_note": "지금 BMI 25.2 — 목표 25 미만까지 0.2 남았어요."
   },
   {
    "group_id": "g_smoker_current",
    "title": "금연",
    "details": [
     "금연이 모든 만성 질환 위험을 줄입니다.",
     "금연 시작 후 1년이면 심혈관 위험 절반 감소.",
     "금연 클리닉, 니코틴 대체제 등 의료 도움 권장."
    ],
    "gap_note": null
   },
   {
    "group_id": "g_drinker",
    "title": "음주 관리",
    "details": [
     "주 2회 이상 금주일 유지.",
     "1회 음주량 제한.",
     "간 효소 수치가 높다면 절주 우선."
    ],
    "gap_note": null
   }
  ],
  "medication_notes": [],
  "elderly_notes": []
 },
 "_meta": {
  "generated_at": "2026-08-02T09:08:54",
  "version": "v1 (약대 자문)",
  "disclaimer": "본 권장사항은 일반 가이드라인이며, 개인별 의료 상담을 대체할 수 없습니다."
 }
}) as unknown as RealRecommendations,
};


// 백엔드 analyze_timeseries()에 위 8개년(data.ts reports)을 넣어 나온 실제 결과.
// population_change는 공단 표본 change_stats.parquet 조회값이라 지어낸 수치가 아니다.
export const dummyChangePace: NonNullable<RealTimeseries['change_pace']> = [
 {
  "metric": "이완기혈압",
  "pace": {
   "ratio": 7.6,
   "direction": "악화",
   "text": "또래 평균(+1.4)의 7.6배 속도로 악화 중입니다 (본인 +11.0)"
  },
  "user_change": 11.0,
  "population_change": 1.45,
  "span_years": 16
 },
 {
  "metric": "감마지티피",
  "pace": {
   "ratio": 6.5,
   "direction": "악화",
   "text": "또래 평균(+5.2)의 6.5배 속도로 악화 중입니다 (본인 +34.0)"
  },
  "user_change": 34.0,
  "population_change": 5.21,
  "span_years": 16
 },
 {
  "metric": "허리둘레",
  "pace": {
   "ratio": 5.2,
   "direction": "악화",
   "text": "또래 평균(+1.5)의 5.2배 속도로 악화 중입니다 (본인 +8.0)"
  },
  "user_change": 8.0,
  "population_change": 1.53,
  "span_years": 16
 },
 {
  "metric": "LDL콜레스테롤",
  "pace": {
   "ratio": 1.7,
   "direction": "악화",
   "text": "또래 평균(+13.0)의 1.7배 속도로 악화 중입니다 (본인 +22.0)"
  },
  "user_change": 22.0,
  "population_change": 13.0,
  "span_years": 16
 },
 {
  "metric": "트리글리세라이드",
  "pace": {
   "ratio": 1.3,
   "direction": "악화",
   "text": "또래 평균(+32.2)의 1.3배 속도로 악화 중입니다 (본인 +42.0)"
  },
  "user_change": 42.0,
  "population_change": 32.23,
  "span_years": 16
 }
];

// ⚠️ 아래 둘은 백엔드 산출을 그대로 쓰지 않고 **사람이 다시 쓴 문장**이다.
//    백엔드 analyze_timeseries()의 문구는 "HDL콜레스테롤은(는) 14년간 변화 폭이 같은
//    연령대 평균(+1.5)보다 큽니다 (본인 -12.0)"처럼 읽기 어렵고,
//    무엇보다 **첫 해와 마지막 해만 비교**해서 2020년 이후의 반등을 담지 못한다.
//    수치는 전부 실제 회차값이다 — 문장만 사람이 쓴다.
export const dummyHighlights: NonNullable<RealTimeseries['highlights']> = [
  { metric: '허리둘레', type: '구간 회복', severity: 'warn', message: '2020년 96cm까지 늘었다가 88cm로 줄어, 복부비만 기준(90cm) 아래로 다시 내려왔어요.' },
  { metric: '체질량지수(BMI)', type: '구간 회복', severity: 'warn', message: '2020년 27.0(비만)에서 25.2로 내려왔어요. 4년간 4.9kg을 줄인 결과인데, 아직 비만 구간(25 이상)이에요.' },
  { metric: '감마-GTP', type: '구간 회복', severity: 'warn', message: '82에서 64IU/L로 내려왔어요. 간 수치 중 음주에 가장 빨리 반응하는 항목이에요.' },
  { metric: '공복혈당', type: '구간 유지', severity: 'warn', message: '2020년 120에서 110mg/dL로 내려왔지만 아직 당뇨병 전단계(100~125) 구간이에요.' },
  { metric: 'LDL 콜레스테롤', type: '변화 없음', severity: 'warn', message: '153에서 145mg/dL로 거의 그대로예요. 체중을 줄여도 LDL은 잘 움직이지 않는 항목이라 따로 봐야 해요.' },
];

export const dummyInsight: NonNullable<RealTimeseries['insight']> = {
  summary: '만 40세 첫 검진 때는 건강한 편이었는데 40대 후반부터 빠르게 무너져, 2020년에는 대사증후군 5개 기준을 모두 충족했어요. 그 뒤로 흐름이 돌아섰어요 — 4년간 체중 4.9kg, 허리 8cm가 줄면서 참고 점수가 22점에서 40점으로 올라왔고 허리둘레는 복부비만 기준 아래로 내려왔어요. 다만 아직 4개 기준이 남아 대사증후군에는 그대로 해당하고, 회복 속도도 무너질 때보다 훨씬 느려요.',
  top_concerns: [
    { title: '대사증후군 (5개 → 4개, 아직 해당)', metric: '대사증후군', level: 'high', current_value: '4/5', details: '허리둘레만 기준 아래로 내려왔고 혈압·혈당·중성지방·HDL 4개가 남았어요. 3개 이상이면 대사증후군으로 봅니다.' },
    { title: 'LDL은 혼자 안 움직였어요', metric: 'LDL 개인 목표', level: 'high', current_value: '145mg/dL (목표 130 미만)', details: '체중이 4.9kg 줄어도 153 → 145로 거의 그대로예요. LDL은 감량보다 식사 내용·약물에 반응하는 항목이라 따로 다뤄야 해요.' },
    { title: '흡연이 그대로예요', metric: '심혈관 10년 위험', level: 'high', current_value: '15.7%', details: '수치가 좋아진 만큼 나이도 네 살 늘어 위험은 15%대에 머물러 있어요. 나이는 되돌릴 수 없지만 흡연은 바꿀 수 있고, 금연하면 이 숫자가 가장 많이 내려갑니다.' },
  ],
  next_exam_year: 2026,
};

/** 데모 계정용 What-if 재계산 — 서버(`POST /analyze/simulate`)는 로그인 토큰과
 *  저장된 검진 회차를 읽어야 해서 데모 계정에서는 호출 자체가 불가능하다.
 *  그래서 화면에서 버튼이 아예 잠겨 있었다.
 *
 *  대신 여기서는 **클라이언트에서 정직하게 계산할 수 있는 것만** 다시 센다:
 *  대사증후군 5개 기준은 고정된 컷오프 비교라 백엔드 공식을 옮겨 적을 필요가 없다
 *  (같은 컷오프가 이미 metabolic_syndrome_detail의 reason 문구에 그대로 적혀 있다).
 *  ⚠️ 계산기 22종은 백엔드 공식이라 여기서 다시 만들지 않는다 — 지어낸 값을 보여주느니
 *     limitations에 "데모라서 못 한다"고 밝히고 비워 둔다.
 *  ⚠️ 컷오프는 성별로 갈린다(허리 90/85 · HDL 40/50). 예전에는 «데모 페르소나가 남성이라»
 *     분기를 두지 않았는데, 같은 화면의 `lifestyleActions.MS_CRITERIA`는 이미 성별 분기가
 *     있고 그 주석이 «simulateDemo와 같은 값이어야 한다»고 요구한다. 여성이면 한 화면
 *     안에서 «몇 개 충족»과 «얼마나 좁히나»가 서로 다른 기준으로 계산된다. */
export function simulateDemo(latest: Report, changes: SimulateChanges, gender: 1 | 2 = 1): RealSimulation {
  const v = latest.values;
  const pick = (k: keyof SimulateChanges, base: number | undefined) =>
    changes[k] != null ? changes[k]! : base;

  // (라벨, 적용 전 값, 적용 후 값, 충족 판정)
  const factors = (waist?: number, sbp?: number, dbp?: number, fbs?: number, tg?: number, hdl?: number) => {
    const met: string[] = [];
    if (waist != null && waist >= (gender === 2 ? 85 : 90)) met.push('복부비만');
    if ((sbp != null && sbp >= 130) || (dbp != null && dbp >= 85)) met.push('고혈압');
    if (fbs != null && fbs >= 100) met.push('고혈당');
    if (tg != null && tg >= 150) met.push('고중성지방');
    if (hdl != null && hdl < (gender === 2 ? 50 : 40)) met.push('낮은 HDL');
    return met;
  };

  const beforeMet = factors(v.waist, v.sbp, v.dbp, v.glucose, v.triglyceride, v.hdl);
  const afterMet = factors(
    pick('waist', v.waist), pick('sbp', v.sbp), pick('dbp', v.dbp),
    pick('fbs', v.glucose), pick('tg', v.triglyceride), pick('hdl', v.hdl),
  );
  const beforeMs = beforeMet.length >= 3;
  const afterMs = afterMet.length >= 3;

  const CONTROL_LABEL: Record<string, [string, keyof Report['values']]> = {
    waist: ['허리둘레', 'waist'], sbp: ['수축기 혈압', 'sbp'], dbp: ['이완기 혈압', 'dbp'],
    fbs: ['공복혈당', 'glucose'], tg: ['중성지방', 'triglyceride'],
    hdl: ['HDL 콜레스테롤', 'hdl'], ldl: ['LDL 콜레스테롤', 'ldl'],
  };

  const targetLdl = 130;   // dummyComboAnalysis.ldl_target 기준(중등도위험군)과 같은 값
  const afterLdl = pick('ldl', v.ldl);

  return {
    changes_applied: Object.entries(changes).map(([k, after]) => ({
      key: k,
      label: CONTROL_LABEL[k]?.[0] ?? k,
      before: CONTROL_LABEL[k] ? v[CONTROL_LABEL[k][1]] ?? null : null,
      after: after as number,
    })),
    metabolic_syndrome: {
      before: { count: beforeMet.length, evaluable: 5, is_metabolic_syndrome: beforeMs, met_factors: beforeMet },
      after: { count: afterMet.length, evaluable: 5, is_metabolic_syndrome: afterMs, met_factors: afterMet },
    },
    calculators: [],
    groups: {
      resolved: beforeMs && !afterMs ? ['대사증후군'] : [],
      added: !beforeMs && afterMs ? ['대사증후군'] : [],
    },
    ldl_target: {
      target_ldl: targetLdl,
      label: '중등도위험군',
      before_ldl: v.ldl ?? null,
      after_ldl: afterLdl ?? null,
      before_achieved: v.ldl != null ? v.ldl < targetLdl : null,
      after_achieved: afterLdl != null ? afterLdl < targetLdl : null,
    },
    unchanged: [],
    limitations: [
      '데모 계정이라 앱 안에서 다시 계산합니다. 대사증후군 5개 기준과 LDL 목표 달성 여부만 다시 셉니다.',
      '계산기 22종(TyG·AIP·PREVENT 등)은 서버 공식이라 데모에서는 다시 계산하지 않습니다. 실제 결과지를 올리면 함께 갱신돼요.',
      '생활습관 변화의 효과를 예측하는 것이 아니라, 검진값을 바꿔 넣었을 때의 판정을 다시 볼 뿐입니다.',
    ],
    baseline_year: latest.year,
  };
}
