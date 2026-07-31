// 생활습관 행동과 그 효과크기 — RN 의존성이 없어 vitest로 테스트한다.
//
// 원래 NextCheckupGoal.tsx 안에 있었다. 화면 파일에 있는 동안에는 순서를 매기는
// 계산을 검증할 방법이 없어서(react-native를 import하는 파일은 vitest가 못 읽는다)
// 데이터와 계산만 여기로 뗐다. JSX는 그대로 NextCheckupGoal.tsx에 남는다.
import type { MetricKey, Report } from './data';
import type { SimulateChanges } from './health';

/** 한국 지침 원문 기준 1잔 순알코올 g(소주·맥주). 잔 수 환산에만 쓴다. */
export const GRAMS_PER_DRINK = 7;

export const round1 = (n: number) => Math.round(n * 10) / 10;

/** 한 행동이 한 수치에 주는 변화 — 항상 범위다(점추정은 개인차를 감춘다). 음수 = 감소. */
export type Effect = {
  /** 현재 값을 읽어올 리포트 키. 표시용 식별자도 겸한다. */
  from: keyof Report['values'];
  /** 판정 재계산(POST /analyze/simulate)에 넣을 키. **없으면 표시만 하고 계산엔 안 들어간다.**
   *  간 수치(ALT·AST)가 그렇다 — 대사증후군 5기준·LDL 목표 어느 판정식에도 들어가지 않는다.
   *  조용히 빼면 "재계산에 반영된 줄" 알게 되므로 화면에서 그 사실을 밝힌다. */
  sim?: keyof SimulateChanges;
  label: string;
  unit: string;
  lo: number;
  hi: number;
  /** 그 효과만 근거 등급이 다를 때. (행동 전체 등급과 섞이지 않게 따로 적는다) */
  note?: string;
};

export type Ctx = {
  values: Report['values'];
  gender: 1 | 2;
  weightKg: number | null;
  smoking?: 'never' | 'former' | 'current' | null;
  alcoholWeeklyG: number;
  /** 저염·절주 효과크기는 고혈압군 기준이라, 정상혈압이면 그대로 쓰면 과대평가가 된다. */
  hypertensive: boolean;
};

export type ActionDef = {
  id: string;
  /** 행동 그 자체. "혈당을 낮추기"가 아니라 "체중 3.5kg 줄이기"처럼 사람이 할 수 있는 것. */
  title: (c: Ctx) => string;
  detail: (c: Ctx) => string;
  applies: (c: Ctx) => boolean;
  effects: (c: Ctx) => Effect[];
  /** "이건 안 움직입니다"도 정보다(근거문서 §6-9). */
  noEffect?: string[];
  /** 이 행동에 반드시 따라붙어야 하는 경고. 빠뜨리면 화면이 위험한 조언이 된다. */
  caution?: string;
  source: string;
  grade: 'A' | 'B';
};

export const ACTIONS: ActionDef[] = [
  {
    id: 'weight',
    // 체중 감량은 8개 수치를 동시에 움직이는 가장 넓은 지렛대다(근거문서 §3-1).
    title: (c) => `체중 ${round1(c.weightKg! * 0.05)}kg 줄이기 (5%)`,
    detail: (c) => `지금 ${c.weightKg}kg에서 ${round1(c.weightKg! * 0.95)}kg으로. 대한고혈압학회는 최소 4~5kg를 1차 목표로 제시해요.`,
    applies: (c) => c.weightKg != null && c.weightKg > 40,
    effects: (c) => {
      const kg = c.weightKg! * 0.05;
      const e: Effect[] = [];
      // KSH 2026 표14: 1kg당 수축기 −1.1 / 이완기 −0.9. 다만 5kg 미만 감량은 효과가
      // 작아(−2.70 vs −6.63) 그대로 곱하면 과대평가라, 범위의 아래쪽을 넉넉히 잡는다.
      if (c.values.sbp != null) e.push({ from: 'sbp', sim: 'sbp', label: '수축기 혈압', unit: '', lo: -kg * 1.1, hi: -kg * 0.7 });
      if (c.values.dbp != null) e.push({ from: 'dbp', sim: 'dbp', label: '이완기 혈압', unit: '', lo: -kg * 0.9, hi: -kg * 0.6 });
      // 일본인 코호트(n=2,635) — A등급 중 유일한 동아시아인 표본. 성별로 계수가 다르다.
      if (c.values.waist != null) {
        const per = c.gender === 2 ? 0.94 : 1.15;
        e.push({ from: 'waist', sim: 'waist', label: '허리둘레', unit: 'cm', lo: -kg * per, hi: -kg * per * 0.7 });
      }
      // 한국지질·동맥경화학회 2022: 1kg당 중성지방 −1.5mg/dL(또는 −1.9%).
      if (c.values.triglyceride != null) e.push({ from: 'triglyceride', sim: 'tg', label: '중성지방', unit: '', lo: -kg * 1.9, hi: -kg * 1.1 });
      // 같은 지침: 3~5% 감량에 HDL +2~3(총량이며 kg당이 아니다).
      if (c.values.hdl != null) e.push({ from: 'hdl', sim: 'hdl', label: 'HDL 콜레스테롤', unit: '', lo: 2, hi: 3 });
      // 간 수치 — NAFLD 메타분석(Clin Nutr 2020) 1kg당 ALT −0.83 / AST −0.56. 등급 B(서구 표본)라
      // 행동 전체 등급(A)과 섞이지 않게 항목마다 따로 밝힌다. sim이 없어 판정 재계산엔 안 들어간다.
      if (c.values.alt != null) e.push({ from: 'alt', label: 'ALT', unit: 'IU/L', lo: -kg * 0.83, hi: -kg * 0.5, note: '등급 B · 서구 NAFLD 메타분석' });
      if (c.values.ast != null) e.push({ from: 'ast', label: 'AST', unit: 'IU/L', lo: -kg * 0.56, hi: -kg * 0.35, note: '등급 B · 서구 NAFLD 메타분석' });
      return e;
    },
    noEffect: [
      'LDL 콜레스테롤은 체중을 줄여도 거의 안 움직여요. 5% 감량에 −5mg/dL 수준입니다 — LDL은 체중보다 포화지방 비중이 좌우해요.',
      '공복혈당은 한국 지침에 감량 1kg당 계수가 없어 여기에 넣지 않았어요.',
    ],
    caution: '주 1kg 넘게 빼지 마세요. 급격한 감량은 간 염증·섬유화를 악화시킬 수 있고 급성 간부전 사례도 보고됐어요(대한간학회 2021).',
    source: '대한고혈압학회 2026 표14 · 한국지질·동맥경화학회 2022 · 일본인 코호트 n=2,635',
    grade: 'A',
  },
  {
    id: 'aerobic',
    title: () => '유산소 운동 주 150분 이상',
    detail: () => '빠르게 걷기·자전거 같은 유산소를 회차당 30분 넘게, 주 5일 이상.',
    applies: () => true,
    effects: (c) => {
      const e: Effect[] = [];
      // KSH 2018 지침 Table 10 — 30~50분 · 주 5일 이상 기준.
      if (c.values.sbp != null) e.push({ from: 'sbp', sim: 'sbp', label: '수축기 혈압', unit: '', lo: -4.9, hi: -3.0 });
      if (c.values.dbp != null) e.push({ from: 'dbp', sim: 'dbp', label: '이완기 혈압', unit: '', lo: -3.7, hi: -2.0 });
      // Kodama 메타분석 — 주 120분 이상 & 회당 30분 초과일 때만 나온 값이라 조건을 detail에 적었다.
      if (c.values.hdl != null) e.push({ from: 'hdl', sim: 'hdl', label: 'HDL 콜레스테롤', unit: '', lo: 1.5, hi: 2.5 });
      if (c.values.triglyceride != null) {
        const tg = c.values.triglyceride;
        e.push({ from: 'triglyceride', sim: 'tg', label: '중성지방', unit: '', lo: -tg * 0.05, hi: -tg * 0.02 });
      }
      return e;
    },
    noEffect: [
      '공복혈당은 유산소 단독으로는 유의한 변화가 없었어요. 저항운동이나 유산소+저항 병행이 필요합니다.',
      '간 수치(ALT·AST)도 운동만으로는 안 내려가요. 식이를 함께 바꿔야 합니다(식이 단독 −4.5 / 운동 병행 −13.3 U/L).',
    ],
    source: '대한고혈압학회 2018 Table 10 · Kodama 메타분석(HDL)',
    grade: 'A',
  },
  {
    // 간 수치를 겨냥한 유일한 행동. 운동만으로는 ALT·AST가 안 내려간다는 것이
    // A등급으로 확인돼 있어서(운동 단독 유의하지 않음), 식이를 반드시 함께 건다.
    id: 'diet_liver',
    title: () => '식단 바꾸고 운동 병행하기',
    detail: () => '정제 곡물·당·술을 줄인 식단에 유산소를 함께. 식이 없이 운동만 하면 간 수치는 안 내려가요.',
    // 간 수치가 하나라도 기준을 벗어났을 때만 제시한다 — 정상인 사람에게 간 목표를 만들지 않는다.
    applies: (c) => (c.values.alt != null || c.values.ast != null),
    effects: (c) => {
      const e: Effect[] = [];
      // 병행 ALT −13.27(CI −21.39~−5.16) / 식이 단독 −4.48. 병행의 점추정과 식이 단독을
      // 범위의 양 끝으로 잡아, 병행이 덜 지켜졌을 때까지 포함한다.
      if (c.values.alt != null) e.push({ from: 'alt', label: 'ALT', unit: 'IU/L', lo: -13.3, hi: -4.5 });
      // 같은 메타분석의 병행 AST −7.02(CI −11.26~−2.78).
      if (c.values.ast != null) e.push({ from: 'ast', label: 'AST', unit: 'IU/L', lo: -7.0, hi: -2.8 });
      return e;
    },
    noEffect: [
      '운동만 해서는 ALT·AST가 유의하게 내려가지 않았어요(간 내 지방량은 −1.95%로 줄었지만 효소 수치는 그대로). 식이 병행이 조건이에요.',
      '혈압·지질 변화는 위 「유산소 운동」 항목에서 따로 보세요. 두 항목의 효과를 더하면 과대평가가 됩니다.',
    ],
    source: 'NAFLD 체계적 문헌고찰·메타분석 (병행 ALT −13.27 / 식이 단독 −4.48)',
    grade: 'A',
  },
  {
    id: 'sodium',
    title: () => '소금 하루 3g 줄이기',
    detail: () => '한국인 평균 8g에서 지침 목표 5g(나트륨 2,000mg)까지. 국·찌개 국물과 김치가 절반을 차지해요.',
    // 정상혈압에서는 효과가 훨씬 작아 이 계수를 쓸 수 없다 — 고혈압군에만 제시한다.
    applies: (c) => c.hypertensive,
    effects: (c) => {
      const e: Effect[] = [];
      if (c.values.sbp != null) e.push({ from: 'sbp', sim: 'sbp', label: '수축기 혈압', unit: '', lo: -6, hi: -4 });
      if (c.values.dbp != null) e.push({ from: 'dbp', sim: 'dbp', label: '이완기 혈압', unit: '', lo: -3, hi: -2 });
      return e;
    },
    source: '대한고혈압학회 2026 제6판 (고혈압군 기준)',
    grade: 'A',
  },
  {
    id: 'alcohol',
    title: (c) => `술 끊거나 주 ${Math.max(1, Math.round(c.alcoholWeeklyG / GRAMS_PER_DRINK / 2))}잔 이하로 줄이기`,
    detail: (c) => `지금 주 ${Math.round(c.alcoholWeeklyG / GRAMS_PER_DRINK)}잔(순알코올 ${c.alcoholWeeklyG}g) 수준이에요.`,
    // ⚠️ 근거문서 §6-4: 하루 2잔 이하 음주자에게 "절주하면 혈압이 내려간다"고 말하면 안 된다.
    //    메타분석에서 ≤2잔 군은 효과가 없었다. 여기서 걸러야 없는 효과를 약속하지 않는다.
    applies: (c) => c.alcoholWeeklyG / 7 / GRAMS_PER_DRINK > 2,
    effects: (c) => {
      const perDay = c.alcoholWeeklyG / 7 / GRAMS_PER_DRINK;
      // 하루 잔수 층별 효과(메타분석). 층을 뭉개면 소량 음주자를 과대평가한다.
      const [sLo, sHi] = perDay >= 6 ? [-5.5, -3.0] : perDay >= 4 ? [-3.0, -1.5] : [-1.2, -0.6];
      const [dLo, dHi] = perDay >= 6 ? [-3.97, -2.0] : perDay >= 4 ? [-1.88, -1.0] : [-1.09, -0.5];
      const e: Effect[] = [];
      if (c.values.sbp != null) e.push({ from: 'sbp', sim: 'sbp', label: '수축기 혈압', unit: '', lo: sLo, hi: sHi });
      if (c.values.dbp != null) e.push({ from: 'dbp', sim: 'dbp', label: '이완기 혈압', unit: '', lo: dLo, hi: dHi });
      // 1일 알코올 1g당 중성지방 −0.2mg/dL.
      if (c.values.triglyceride != null) {
        const g = c.alcoholWeeklyG / 7;
        e.push({ from: 'triglyceride', sim: 'tg', label: '중성지방', unit: '', lo: -g * 0.2, hi: -g * 0.1 });
      }
      return e;
    },
    // 감마-GTP는 변화량 계수가 없어 수치로 못 쓴다. 대신 시간축이 다르다는 사실이 더 유용하다 —
    // 반감기 26일이라 '다음 검진'이 아니라 1~2개월 뒤 재검에서 확인된다.
    noEffect: [
      '감마-GTP는 변화량 계수가 없어 수치로 적지 않았어요. 다만 반감기가 약 26일이라 술을 끊으면 4~8주에 정상화되는 것으로 알려져 있습니다 — 다음 검진까지 기다리지 않고 1~2개월 뒤 재검으로 확인할 수 있는 항목이에요.',
    ],
    source: '음주-혈압 메타분석(잔수 층별) · 한국지질·동맥경화학회 2022',
    grade: 'A',
  },
  {
    id: 'quit_smoking',
    // ⚠️ "담배를 줄이기"는 절대 제시하지 않는다 — 한국지질 2022: 흡연량을 줄이는 것은
    //    향후 금연 가능성을 높이지 못하고 오히려 금연을 어렵게 하여 권장되지 않는다.
    title: () => '담배 끊기',
    detail: () => '줄이는 것 말고 끊는 것이에요. 흡연량을 줄이는 방식은 금연을 오히려 어렵게 해 권장되지 않아요.',
    applies: (c) => c.smoking === 'current',
    effects: (c) => {
      const e: Effect[] = [];
      // 금연 3~6주에 최대, 이후 감쇠.
      if (c.values.hdl != null) e.push({ from: 'hdl', sim: 'hdl', label: 'HDL 콜레스테롤', unit: '', lo: 2.3, hi: 4.1 });
      return e;
    },
    noEffect: [
      '금연의 가장 큰 이득은 검진 수치가 아니라 심혈관 사건·사망 위험 감소예요. 이 표에 안 나온다고 효과가 작은 게 아닙니다.',
    ],
    // 한국 지침 3종이 금연 후 체중 증가를 명시한다. 이 경고 없이 수치만 보여주면
    // 금연이 "살 찌는 행동"으로 읽힌다.
    caution: '금연 후 12개월에 평균 4.7kg 늘어납니다. 체중 관리를 함께 하지 않으면 허리둘레·혈당·중성지방이 오히려 나빠질 수 있어요.',
    source: 'Forey 메타분석(HDL) · 한국 진료지침 3종(체중 증가)',
    grade: 'B',
  },
];


// ============================================================
// 우선순위 — "기준까지 얼마나 좁히나" (A-2)
// ============================================================
//
// 지금까지 화면은 행동을 배열 선언 순서대로 나열하기만 했다. 어느 것부터 하면 되는지는
// 말하지 않았는데, 효과크기와 개인 값이 둘 다 있으니 계산할 수 있는 판단이었다.
//
// ⚠️ 지표 선택이 결과를 가른다. "대사증후군 기준 몇 개를 해제하나"로 재면 데모 페르소나는
//    기준을 너무 많이 벗어나 있어 네 행동이 전부 1개 또는 0개로 나와 변별이 안 된다.
//    그래서 **기준까지의 거리**를 재고, 그 거리가 몇 % 줄어드는지로 순서를 매긴다.
//
// 규범적 판단(무엇을 먼저 해야 하나)이라 계산이 근거를 대야 한다. 그래서 화면에는
// 순위만이 아니라 감소폭과 움직이는 기준 이름을 함께 내보낸다.

/** 대사증후군 5기준의 컷오프. 백엔드 evaluate_metabolic_syndrome·simulateDemo와 같은 값이어야
 *  한 화면 안에서 "몇 개 충족"과 "얼마나 좁히나"가 어긋나지 않는다. */
const MS_CRITERIA: {
  key: MetricKey;
  /** 화면에 쓰는 기준 이름. 수축기·이완기는 둘 다 '혈압' 하나로 센다. */
  factor: string;
  cut: (gender: 1 | 2) => number;
  /** 'over' = 값이 컷오프를 넘으면 이탈 / 'under' = 밑돌면 이탈(HDL) */
  dir: 'over' | 'under';
}[] = [
  { key: 'waist', factor: '허리둘레', cut: (g) => (g === 2 ? 85 : 90), dir: 'over' },
  { key: 'sbp', factor: '혈압', cut: () => 130, dir: 'over' },
  { key: 'dbp', factor: '혈압', cut: () => 85, dir: 'over' },
  { key: 'glucose', factor: '공복혈당', cut: () => 100, dir: 'over' },
  { key: 'triglyceride', factor: '중성지방', cut: () => 150, dir: 'over' },
  { key: 'hdl', factor: 'HDL', cut: (g) => (g === 2 ? 50 : 40), dir: 'under' },
];

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** 한 기준에서 얼마나 벗어났는지 — 컷오프 대비 비율. 기준 안이면 0.
 *  절대값이 아니라 비율로 재는 이유: 단위가 다른 여섯 기준(cm·mmHg·mg/dL)을 더하려면
 *  같은 자로 재야 한다. 컷오프로 나누면 "기준의 몇 %만큼 벗어났나"가 되어 더할 수 있다. */
function excess(value: number, cut: number, dir: 'over' | 'under'): number {
  return dir === 'over' ? Math.max(0, value - cut) / cut : Math.max(0, cut - value) / cut;
}

/** 대사증후군 5기준에서 벗어난 정도의 합. 측정되지 않은 항목은 세지 않는다. */
export function deviationTotal(values: Report['values'], gender: 1 | 2): number {
  let total = 0;
  for (const c of MS_CRITERIA) {
    const v = values[c.key];
    if (!isNum(v)) continue;
    total += excess(v, c.cut(gender), c.dir);
  }
  return total;
}

export type ActionRank = {
  id: string;
  /** 기준 이탈도가 몇 배 줄어드는지 (0~1). 0.279 = 27.9% 감소. */
  reductionRatio: number;
  /** 실제로 이탈도가 줄어든 기준 이름. 안 줄어든 것은 담지 않는다 —
   *  "이 행동이 움직입니다"라고 이름만 나열하면 0만큼 움직이는 것도 섞인다. */
  movedFactors: string[];
};

/** 행동을 이탈도 감소폭이 큰 순으로 매긴다. 해당하지 않는 행동은 빠진다.
 *
 *  ⚠️ 효과 범위의 **hi**(변화가 작은 쪽)를 쓴다. 같은 모달의 「이 수치가 되면 판정은?」이
 *     같은 끝으로 재계산하기 때문이다 — 순서는 낙관적으로 매기고 판정은 보수적으로 내면
 *     한 화면이 두 기준을 쓰게 된다. */
export function rankActions(actions: ActionDef[], ctx: Ctx): ActionRank[] {
  const before = deviationTotal(ctx.values, ctx.gender);

  const ranked = actions
    .filter((a) => a.applies(ctx) && a.effects(ctx).length > 0)
    .map((a, order) => {
      const after = { ...ctx.values };
      for (const e of a.effects(ctx)) {
        const base = ctx.values[e.from];
        if (!isNum(base)) continue;
        after[e.from] = round1(base + e.hi);
      }

      const movedFactors: string[] = [];
      for (const c of MS_CRITERIA) {
        const v0 = ctx.values[c.key];
        const v1 = after[c.key];
        if (!isNum(v0) || !isNum(v1)) continue;
        const cut = c.cut(ctx.gender);
        if (excess(v1, cut, c.dir) < excess(v0, cut, c.dir) && !movedFactors.includes(c.factor)) {
          movedFactors.push(c.factor);
        }
      }

      const afterTotal = deviationTotal(after, ctx.gender);
      return {
        id: a.id,
        reductionRatio: before > 0 ? (before - afterTotal) / before : 0,
        movedFactors,
        _order: order,
        _grade: a.grade,
      };
    });

  // 감소폭이 같으면 근거 등급이 높은 쪽을 앞에, 그래도 같으면 원래 순서를 지킨다.
  ranked.sort((a, b) =>
    (b.reductionRatio - a.reductionRatio)
    || (a._grade === b._grade ? 0 : a._grade === 'A' ? -1 : 1)
    || (a._order - b._order));

  return ranked.map(({ id, reductionRatio, movedFactors }) => ({ id, reductionRatio, movedFactors }));
}
