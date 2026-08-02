/**
 * 실제 백엔드 연동 레이어.
 *
 * data.ts의 더미 데이터와 "같은 모양"으로 변환(adapt)해서 내려주는 것이 목표다.
 * → 화면(컴포넌트) 코드는 그대로 두고, 데이터 출처만 더미 → 실제 API로 바꿀 수 있다.
 *
 * 백엔드 응답 구조 (api_reference, backend 코드 검토 결과):
 *   GET /reports/{user_id}            -> { years: number[] }
 *   GET /reports/{user_id}/{year}     -> { checkup, basic_report, comprehensive, recommendations, analyzed_at }
 *   GET /reports/{user_id}/comprehensive/latest -> 위와 동일하되 최신 연도
 *   GET /timeseries/{user_id}         -> { metrics: { [한글항목명]: { values, years, trend, ... } }, highlights: [...] }
 *
 *   comprehensive.summary = { risk_score, overall_status, total_metrics, risk_count, warning_count, normal_count }
 *   comprehensive.all_evaluations[] = {
 *     metric, value, status, label, icon, color, meaning, direction, unit,
 *     percentile, peer_mean, on_medication, is_elderly_warning
 *   }
 *   - status: 'normal' | 'low' | 'high' | 'very_low' | 'very_high' | 'extremely_low' | 'extremely_high' | 'info'
 *   - direction: 'high_bad' | 'low_bad' | 'both' | 'u_shape' | 'info_only' | 'categorical'
 */
import { apiFetch, getAccessToken } from './api';
import type { MetricDefinition, MetricKey, Report, Status, MetricDirection, OcrField, MedicationItem } from './data';
import { metricDefinitions as dummyMetricDefinitions, ocrTemplate, SCORE_PENALTY } from './data';

const API_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://127.0.0.1:8000';

// ---- 백엔드 한글 항목명 ↔ 프론트 MetricKey 매핑 -----------------------------
// comprehensive.all_evaluations[].metric 은 DB 컬럼명을 그대로 한글로 내려준다.
// (정확한 명칭은 실제 응답을 보며 보강해야 하지만, 더미 데이터의 name과 1:1로 맞춰둔다)
const METRIC_NAME_TO_KEY: Record<string, MetricKey> = {
  '수축기혈압': 'sbp', '수축기 혈압': 'sbp',
  '이완기혈압': 'dbp', '이완기 혈압': 'dbp',
  // ⚠️ 백엔드가 실제로 내려주는 명칭을 반드시 포함해야 한다. 아래 4개(식전혈당(공복혈당)·
  // 트리글리세라이드·혈청지오티(AST)·혈청지피티(ALT))가 빠져 있어서 실계정에서는 이 항목들이
  // 화면에 아예 안 뜨고 있었다(더미는 data.ts 키를 직접 써서 문제가 가려졌다).
  '공복혈당': 'glucose', '식전혈당(공복혈당)': 'glucose',
  '체질량지수': 'bmi', 'BMI': 'bmi',
  '허리둘레': 'waist',
  'LDL콜레스테롤': 'ldl', 'LDL-C': 'ldl', 'LDL 콜레스테롤': 'ldl',
  'HDL콜레스테롤': 'hdl', 'HDL-C': 'hdl', 'HDL 콜레스테롤': 'hdl',
  '중성지방': 'triglyceride', '트리글리세라이드': 'triglyceride',
  'AST': 'ast', 'AST(SGOT)': 'ast', '혈청지오티(AST)': 'ast',
  'ALT': 'alt', 'ALT(SGPT)': 'alt', '혈청지피티(ALT)': 'alt',
  '감마지티피': 'ggt', '감마-GTP': 'ggt',
  '혈색소': 'hemoglobin',
  '혈청크레아티닌': 'creatinine', '혈청 크레아티닌': 'creatinine',
  '총콜레스테롤': 'totalCholesterol',
  '요단백': 'urineProtein',
  '신장': 'height', '키': 'height',
  '체중': 'weight', '몸무게': 'weight',
};

// ---- 백엔드 status/direction → 프론트 표시값 매핑 ---------------------------
// 백엔드(thresholds.py STATUS_LABELS, 최신 버전 기준)는 status 코드를
// extremely_low/very_low/low/caution/normal/normal_good/high/very_high/extremely_high/info 로 내려주고,
// 각각을 "위험 (낮음)"/"주의 (낮음)"/"주의"/"정상"/"정상 (좋음)"/"주의 (높음)"/"위험 (높음)"/
// "극도 위험 (...)"/"정보" 같은 한글 라벨에 매핑해 둔다.
// 우리는 그 라벨을 그대로 쓰는 대신, 점수·뱃지 묶음 표시를 위해 핵심 단어(정상/주의/위험) 3단계로
// 묶어서 쓴다 — 단, 이 세 단어는 모두 백엔드 라벨에 실제로 등장하는 단어를 그대로 가져온 것이며,
// "정상 기준 안"/"관리 참고"/"추적 확인"처럼 우리가 새로 만들어낸 표현이 아니다.
function statusFromBackend(status: string): Status {
  if (status === 'normal' || status === 'normal_good' || status === 'info') return '정상';
  if (status === 'caution' || status === 'high' || status === 'low') return '주의';
  return '위험'; // extremely_low/very_low/very_high/extremely_high
}

function directionFromBackend(direction: string): MetricDirection {
  if (direction === 'high_bad') return 'high';
  if (direction === 'low_bad') return 'low';
  return 'range'; // both/u_shape/info_only/categorical
}

export type RealEvaluation = {
  metric: string;
  value: number;
  status: string;
  label: string;
  icon: string;
  color: string;
  meaning: string;
  direction: string;
  unit: string;
  percentile?: number | null;
  peer_mean?: number | null;
  on_medication?: boolean;
  is_elderly_warning?: boolean;
};

export type RealComprehensive = {
  summary: {
    total_metrics: number;
    risk_count: number;
    warning_count: number;
    normal_count: number;
    elderly_warning_count: number;
    risk_score: number;
    overall_status: string;
  };
  all_evaluations: RealEvaluation[];
};

// ---- 개인화 권장사항 (POST/GET 결과의 recommendations 필드 구조) ------------
// app/analyzer/_internal/recommendation_generator.py · pipeline.run_recommendations() 실응답 구조 그대로.
export type RealRecommendations = {
  user_id?: string;
  user_name?: string;
  age?: number;
  priority_messages?: string[];
  recommendations?: {
    common?: { category: string; items: string[] }[];
    /** 조건에 안 맞아 뺀 권장과 그 이유. 없으면 화면에 아무것도 안 나온다.
     *  ⚠️ 조건 필터(A-1) 이전에 저장된 분석에는 이 필드가 없다 → 항상 옵셔널로 다룰 것. */
    omitted?: { category: string; reason: string }[];
    /** gap_note = "지금 178mg/dL — 목표 150mg/dL 미만까지 28mg/dL 남았어요."
     *  ⚠️ #30 이전에 저장된 분석에는 없다 → 항상 옵셔널로 다룰 것. */
    metabolic_factors?: { factor: string; title: string; target?: string; details: string[]; by_medication?: boolean; reason?: string; gap_note?: string | null }[];
    group_specific?: { group_id: string; title: string; details: string[]; gap_note?: string | null }[];
    medication_notes?: { medication: string; note: string }[];
    elderly_notes?: string[];
  };
  _meta?: { generated_at?: string; version?: string; disclaimer?: string };
};

// ---- 조합 그룹(복합 질환군) — analyzer/_internal/combo_group_analysis.py 응답 구조 ----
// 발표에 쓰는 모집단 수치(예: 메타볼릭 트라이어드 O/E=2.93)를 사용자 결과와 연결한다.
// ⚠️ 07 마이그레이션 이전에 저장된 분석에는 이 필드가 없다 → 항상 null 처리할 것.
export type RealComboGroup = {
  combo_name: string;
  category: string;
  meaning: string;
  components: string[];
  /** 조합의 «관계 유형» — same_cause / one_worsens / different_axis / shared_criterion.
   *  relation_label은 그 유형을 사람 말로 푼 것이고, action은 거기서 나오는 «순서»다.
   *  ⚠️ 조합이 개별 판정에 더해 주는 것이 바로 이 관계다. 같은 원인이면 하나만 잡아도
   *  둘이 움직이고, 다른 축이면 따로 잡아야 한다 — 개별 그룹 권장은 이 말을 못 한다.
   *  구버전 분석에는 없다 → 항상 옵셔널로 다룰 것. */
  relation?: string | null;
  relation_label?: string | null;
  action?: string | null;
  is_ascvd_risk: boolean;
  population: {
    n_in_combo: number;
    pct_of_total: number;
    expected_n_if_independent: number;
    observed_to_expected: number;
    top_metrics: { metric: string; combo_mean: number; non_combo_mean: number; diff: number; cohens_d: number }[];
  } | null;
};

// FLI/HSI 지방간 보조지표 — clinical_targets.fatty_liver_indices 결과.
// 값·구간(level)·해석 문구를 백엔드가 만들어 내려준다(프론트에서 새 해석을 만들지 않는다).
export type RealFattyLiverIndex = {
  value: number;
  level: 'low' | 'intermediate' | 'high';
  interpretation: string;
  /** 1뎁스 결론용 해요체 한 문장. interpretation은 학회 원문 라벨이라
   *  2뎁스 배지에는 맞지만 1뎁스 결론 문장으로는 §7(해요체·진단 단정 금지)에
   *  걸린다 — 지우지 않고 한 벌 더 만든다. 없으면 1뎁스 결론을 그리지 않는다. */
  plain?: string;
  cutoffs?: string;
  formula?: string;
} | null;

/**
 * 집단군 요약 — user_group_analysis.calculate_group_rarity() 결과.
 * ⚠️ 필드명은 rarity지만 '희귀도'를 계산하지 않는다. 속한 집단군을 나열하고
 *    개수로 해석 문구를 붙일 뿐이다(gender·age·year를 인자로 받지만 쓰지 않고,
 *    모집단 빈도 계산도 없다). 그래서 화면에도 희귀함이 아니라 개수·해석으로 쓴다.
 * ⚠️ 백엔드 combo_analysis 주입(2026-07-28) 이후 저장분에만 있다 → 구버전은 null.
 */
export type RealRarity = {
  clinical_groups: string[];
  lifestyle_groups: string[];
  clinical_count: number;
  lifestyle_count: number;
  interpretation: string;
} | null;

// 단일 집단군 판정(13개) — user_group_analysis.GROUP_INFO 순서. applies가 null이면 판정 불가(입력값 없음).
export type RealSingleGroup = {
  key: string;
  name: string;
  category: string;
  desc?: string | null;
  applies: boolean | null;
};

// ASCVD 10년 위험도 — 참고용 시뮬레이션(한국인 미검증, 진단 아님). ascvd.run_ascvd_simulation 결과.
export type RealAscvdSimulation = {
  available: boolean;
  is_simulation: boolean;
  reason?: string;
  risk_percent?: number;
  risk_level?: string;
  risk_label?: string;
  scenarios?: { name: string; risk_percent: number; delta: number }[];
  method?: string;
  limitations?: string[];
  how_to_read?: string;
};

// 추가 수치 계산기 — 값·구간·해석·기준 전부 백엔드가 내려준다.
// category: lipid / insulin / adiposity / liver / bp / cardiovascular
export type RealCalcItem = {
  key: string;
  title: string;
  category: 'lipid' | 'insulin' | 'adiposity' | 'liver' | 'bp' | 'cardiovascular';
  value: number;
  unit?: string;
  level: 'low' | 'intermediate' | 'borderline' | 'high' | 'very_high' | 'info';
  interpretation: string;
  /** 1뎁스 결론용 해요체 한 문장 — RealFattyLiverIndex.plain과 같은 규칙.
   *  지금은 BARD에만 있다(1뎁스 결론에 오르는 계산기가 그것뿐이라). */
  plain?: string;
  /** «어느 입력이 이 값을 끌어올렸나» 한 문장. 여러 수치를 묶어 만든 값은 결과만 봐서는
   *  무엇 때문에 높은지 알 수 없다 — TyG 9.13이 같아도 중성지방이 끌어올린 사람과
   *  공복혈당이 끌어올린 사람은 할 일이 다르다. 각 입력을 또래 중앙값으로 바꿔 보아
   *  기여도를 재고, 끌어올린 것이 없으면 내려오지 않는다(지어내지 않는다).
   *  지금은 2뎁스에 펼치는 대표 4종(TyG·Non-HDL·AIP·MAP)에만 있다. */
  driver?: string | null;
  cutoffs?: string;
  formula?: string;
  note?: string;
  value_30yr?: number;
  components?: string[];
  // 컷오프 미확립 5종(TyG·METS-IR·AIP·LAP·VAI)에만: 한국인 또래 백분위 (2017 국가검진 기준)
  peer_label?: string;
  percentile?: number;
  peer_n?: number;
  peer_year?: number;
};

export type RealCalculators = {
  items: RealCalcItem[];
  unavailable: string[];
  disclaimer: string;
  error?: string;
} | null;

/** 16년(2009~2024, 1,596만 건) 모집단 통계 — backend population16.py.
 *  ⚠️ 최신 분석부터 담겨 온다. 구버전 저장분에는 없다 → 항상 null 처리. */
export type RealPopulation16 = {
  source: { years: string; total_rows: number; label: string };
  /** 해당한 조합의 16년 O/E — 한 해 값 하나보다 "16년간 2.2~3.1배"가 강하다 */
  combo_oe?: Record<string, {
    median: number; min: number; max: number;
    n_years: number; year_from: number; year_to: number;
    /** 지질검사가 전원에게 실시된 2009~2017년만 집계한 조합 — 2018년부터 측정율이 34%로
     *  떨어지고 검사받는 사람이 관리 중인 쪽으로 쏠려 O/E가 눌리기 때문. 화면에서 기준을 밝힌다. */
    lipid_era_only?: boolean;
    by_year?: { year: number; oe: number }[];
  }>;
  /** 같은 성별·연령대의 집단군 유병률(수치 기준) */
  peer_prevalence?: Record<string, { name: string; pct: number; n_eval: number }>;
  /** ⭐ 같은 나이대의 2009 vs 2024 — 고령화가 아니라 세대 자체가 나빠졌다는 근거 */
  age_fixed_trend?: {
    age_band: string; sex: string;
    items: { group: string; name: string; y2009: number; y2024: number; diff: number; ratio: number }[];
  };
  /** 관리 참고군별 '벗어난 항목 수' 모집단 분포 */
  care_distribution?: Record<string, {
    total: number;
    dist: { hits: number; n: number; pct: number }[];
  }>;
  disclaimer: string;
};

export type RealComboAnalysis = {
  combo_groups?: {
    matched: RealComboGroup[];
    not_evaluable: { combo_name: string; category: string; met: string[]; missing: string[]; reason: string }[];
    matched_count: number;
    ascvd_risk_combos: string[];
    highest_synergy: RealComboGroup | null;
    population: { year: number | null; total_n: number | null; source: string };
    caveats: string[];
  } | null;
  fatty_liver?: {
    applicable: boolean;
    type: string | null;
    provisional: boolean;
    basis: string;
    cardiometabolic_factors: string[];
    note?: string;
    // FLI/HSI 보조지표 — applicable 여부와 무관하게 계산 가능하면 항상 담겨 온다.
    indices?: {
      fli: RealFattyLiverIndex;
      hsi: RealFattyLiverIndex;
      unavailable: string[];
      disclaimer: string;
      error?: string;
    } | null;
  } | null;
  // ⚠️ 아래 필드들은 최신 분석부터 저장된다 — 구버전 분석에는 없다 → null 처리.
  rarity?: RealRarity;
  /** 대사증후군 5인자 세부 — 어느 인자가, 수치 때문인지 약 때문인지까지.
   *  "대사증후군 해당"이라는 판정의 근거를 그대로 보여주기 위한 값. */
  metabolic_syndrome_detail?: {
    factors: Record<string, {
      met: boolean; value?: number; threshold?: number;
      reason: string; by_medication: boolean;
    }>;
    count: number;
    evaluable: number;
    is_metabolic_syndrome: boolean;
  } | null;
  /** 16년 모집단 통계 — 최신 분석부터. 구버전 저장분에는 없다. */
  population_16yr?: RealPopulation16 | null;
  single_groups?: RealSingleGroup[] | null;
  ascvd_simulation?: RealAscvdSimulation | null;
  calculators?: RealCalculators;
  // LDL 위험도별 개인 목표치(초고위험<55 … 저위험<160). clinical_targets.classify_ldl_risk 결과.
  ldl_target?: {
    risk_level: string;
    label: string;
    target_ldl: number;
    target_text: string;
    current_ldl: number | null;
    achieved: boolean | null;
    gap: number | null;
    // TG≥400이면 Friedewald 계산식 LDL의 신뢰도가 떨어져 achieved가 null로 온다(판정 보류).
    ldl_reliable?: boolean;
    reliability_note?: string | null;
    tg_value?: number | null;
    risk_factors: string[];
    basis: string;
    on_medication: boolean;
    limitations: string[];
    reference: string;
    error?: string;
  } | null;
  disclaimer?: string;
  error?: string;
};

export type RealReportPayload = {
  user_id: string;
  year: number;
  checkup: Record<string, any>;
  basic_report?: { summary?: string };
  comprehensive: RealComprehensive;
  recommendations?: RealRecommendations | null;
  combo_analysis?: RealComboAnalysis | null;
  analyzed_at?: string;
};

/** 실제 응답 한 건을 화면이 기대하는 Report 모양으로 변환한다. */
export function adaptReport(payload: RealReportPayload): Report {
  const c = payload.comprehensive;
  const values = {} as Record<MetricKey, number>;
  // 항목별 실제 상태 — 점수·상세 화면·참고군이 전부 이 값 하나에서 파생되도록 한다(단일 소스).
  const statusByKey = {} as Record<MetricKey, Status>;
  for (const ev of c.all_evaluations) {
    const key = METRIC_NAME_TO_KEY[ev.metric];
    if (key) {
      values[key] = ev.value;
      statusByKey[key] = statusFromBackend(ev.status);
    }
  }
  // 개수는 statusFromBackend를 거쳐서 센다 — 상태 문자열 분류 규칙이 두 곳에 갈라지면
  // statusByKey('caution'→주의)와 개수(caution 미포함)가 어긋나 점수가 화면 배지와 안 맞는다.
  let manageCount = 0;
  let trackCount = 0;
  for (const ev of c.all_evaluations) {
    const s = statusFromBackend(ev.status);
    if (s === '주의') manageCount++;
    else if (s === '위험') trackCount++;
  }
  const badCount = manageCount + trackCount;
  const status: Status = badCount === 0 ? '정상' : badCount <= 3 ? '주의' : '위험';
  // ⚠️ 백엔드 summary.risk_score를 그대로 쓰면 안 된다 — 그건 '나쁨 점수'(0=건강, 클수록 나쁨,
  // 5×extremely + 3×very + 1×high/low + 0.5×caution)인데, 화면은 이 필드를 100점 만점의
  // '좋음 점수'로 그린다(AnalysisScreen 색 임계값 70/40, reportExport "/ 100점").
  // 그대로 넣으면 실계정에서 극성이 뒤집혀, 건강한 사람일수록 점수가 낮게 나온다.
  // 더미(data.makeReport)와 홈(data.computeScore)이 쓰는 같은 감점식으로 통일한다.
  const score = Math.max(0, 100 - SCORE_PENALTY.manage * manageCount - SCORE_PENALTY.track * trackCount);
  return {
    year: payload.year,
    date: String(payload.checkup?.exam_date ?? payload.checkup?.['검진일'] ?? `${payload.year}-01-01`),
    hospital: String(payload.checkup?.hospital ?? payload.checkup?.['검진기관'] ?? ''),
    status,
    summary: payload.basic_report?.summary ?? c.summary.overall_status,
    score,
    manageCount,
    trackCount,
    values,
    statusByKey,
  };
}

/** 실제 평가 1건을 화면이 기대하는 MetricDefinition 모양으로 변환한다(추가 필드 포함). */
export function adaptEvaluation(ev: RealEvaluation): MetricDefinition & {
  realLabel: string; realIcon: string; realColor: string; realMeaning: string;
  percentile?: number | null; onMedication?: boolean; isElderlyWarning?: boolean;
} {
  const key = METRIC_NAME_TO_KEY[ev.metric];
  const fallback = key ? dummyMetricDefinitions.find((m) => m.key === key) : undefined;
  return {
    key: (key ?? (ev.metric as MetricKey)),
    category: fallback?.category ?? '기타',
    name: ev.metric,
    shortName: fallback?.shortName ?? ev.metric,
    unit: ev.unit || fallback?.unit || '',
    normalText: fallback?.normalText ?? '',
    normalValue: fallback?.normalValue ?? ev.value,
    // 성별 기준이 다른 항목은 여성 기준도 같이 넘겨야 applyGender()가 치환할 수 있다.
    female: fallback?.female,
    peerMean: ev.peer_mean ?? fallback?.peerMean,
    status: statusFromBackend(ev.status),
    description: ev.meaning || fallback?.description || '',
    note: fallback?.note ?? '',
    realLabel: ev.label,
    realIcon: ev.icon,
    realColor: ev.color,
    realMeaning: ev.meaning,
    percentile: ev.percentile,
    onMedication: ev.on_medication,
    isElderlyWarning: ev.is_elderly_warning,
  };
}

// ---- 실제 API 호출 함수들 ---------------------------------------------------

export async function fetchReportYears(userId: string): Promise<number[]> {
  const res = await apiFetch(`/reports/${userId}`);
  return res.years ?? [];
}

export async function fetchReportByYear(userId: string, year: number): Promise<RealReportPayload> {
  return apiFetch(`/reports/${userId}/${year}`);
}

export async function fetchLatestComprehensive(userId: string): Promise<RealReportPayload> {
  return apiFetch(`/reports/${userId}/comprehensive/latest`);
}

export type RealTimeseries = {
  user_id: string;
  years: number[];
  metrics: Record<string, {
    values: number[];
    years: number[];
    trend?: string;
    user_change?: number;
    annual_change?: number;
    population_change?: number;
    comparison?: string;
  }>;
  highlights?: { metric: string; type: string; severity: string; message: string }[];
  // 또래 대비 악화 '속도' 상위 항목. ratio는 또래 변화가 ±0.5 이상일 때만 계산된다
  // (0에 가까운 값으로 나누면 배수가 발산하므로, 그때는 text로만 서술한다).
  change_pace?: {
    metric: string;
    pace: { ratio: number | null; direction: string; text: string };
    user_change?: number;
    population_change?: number | null;
    span_years?: number;
  }[] | null;
  // 자연어 종합 인사이트 — insight_generator.generate_insight 결과(요약 + 주요 우려 Top 3).
  insight?: {
    summary: string;
    top_concerns: { title: string; metric: string; level: string; current_value: string; details: string }[];
    next_exam_year?: number | null;
  } | null;
};

export async function fetchTimeseries(userId: string): Promise<RealTimeseries | null> {
  try {
    const row = await apiFetch(`/timeseries/${userId}`);
    if (!row) return null;
    // GET /timeseries/{id}는 timeseries_analyses의 DB 행을 그대로 반환한다.
    // 분석 본문은 timeseries_data 컬럼 안에 있고 insight는 insights 컬럼에도 중복 저장된다.
    // 언랩하지 않으면 highlights·insight·change_pace가 전부 undefined가 된다.
    // (POST /timeseries/refresh는 분석 결과를 바로 주므로 두 형태를 모두 받아들인다.)
    const body = row.timeseries_data ?? row;
    return { ...body, insight: body.insight ?? row.insights ?? null };
  } catch (e) {
    // 분석 이력이 2년 미만이면 404가 날 수 있다 — 화면에서는 "데이터 부족"으로 처리.
    return null;
  }
}

/**
 * 시계열 분석을 강제로 다시 생성한다(POST /timeseries/refresh).
 * 연도 기록을 삭제하면 백엔드가 시계열 캐시를 무효화만 하므로, 이후 GET이 404가 난다.
 * 이 함수로 남은 회차 기준으로 재생성한 뒤 다시 GET하면 하이라이트가 복구된다.
 * (회차가 2년 미만이면 백엔드가 available=false로 응답 — 조용히 무시한다.)
 */
export async function refreshTimeseries(userId: string): Promise<void> {
  try {
    await apiFetch('/timeseries/refresh', { method: 'POST' });
  } catch {
    // 재생성할 회차가 부족하거나 일시적 실패 — 화면은 "데이터 부족"으로 자연스럽게 처리된다.
  }
}

// ---- 검진지 OCR 업로드 → 분석 (POST /uploads → POST /analyze) ----------------
// app/routers/uploads.py · app/routers/analysis.py 실제 응답 구조 기준.
// OCR 응답: { ocr: { meta: { exam_date, hospital, ... }, measurements: { [key]: { value, unit } }, lifestyle?: {...} }, warnings: [...] }
// measurements의 키(sbp/dbp/glucose 대신 fbs 등)는 ocrTemplate의 OcrField.id와 1:1로 대응한다.
export type RealOcrResult = {
  ocr: {
    meta?: Record<string, any>;
    measurements?: Record<string, { value: any; unit?: string } | null>;
    lifestyle?: Record<string, any>;
    // 항목별 OCR 확신도. 백엔드 page_merger.to_final_json이 항상 함께 내려준다
    // (LLM self-report + 휴리스틱 결합). flags: out_of_range_suspect / low_llm_confidence.
    measurements_confidence?: Record<string, { confidence?: number; flags?: string[] }>;
    lifestyle_confidence?: Record<string, { confidence?: number; flags?: string[] }>;
    [key: string]: any;
  };
  warnings: string[];
};

export type RealAnalyzeResult = {
  basic_report: Record<string, any>;
  comprehensive: Record<string, any>;
  recommendations: Record<string, any>;
  medications_known: boolean;
  saved: boolean;
  saved_paths?: string[] | null;
  warnings: string[];
};

/** 검진지 사진(로컬 URI)을 백엔드로 보내 OCR 결과를 받아온다. 이미지는 서버에 보관되지 않는다. */
export async function uploadCheckupImage(uri: string, fileName?: string, mimeType?: string): Promise<RealOcrResult> {
  const token = await getAccessToken();
  const form = new FormData();
  form.append('file', {
    uri,
    name: fileName || 'checkup.jpg',
    type: mimeType || 'image/jpeg',
  } as any);
  const res = await fetch(`${API_BASE_URL}/uploads`, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${detail ? ` - ${detail}` : ''}`);
  }
  return res.json();
}

/** OCR JSON(검수 화면용) → 화면이 쓰는 OcrField[] 모양으로 변환한다. ocrTemplate의 라벨/구분/필수 여부 틀을 그대로 쓰고, 값만 OCR 결과로 채운다. */
export function ocrResultToFields(ocr: RealOcrResult['ocr']): OcrField[] {
  const meta = ocr.meta ?? {};
  const measurements = ocr.measurements ?? {};
  const conf = ocr.measurements_confidence ?? {};
  return ocrTemplate.map((tmpl) => {
    // 검진일·검진기관은 meta에 있고 항목별 확신도가 따로 없다 → confidence 없음으로 둔다.
    if (tmpl.id === 'exam_date') return { ...tmpl, value: meta.exam_date != null ? String(meta.exam_date) : '' };
    if (tmpl.id === 'hospital') return { ...tmpl, value: meta.hospital != null ? String(meta.hospital) : '' };
    const m = measurements[tmpl.id];
    const v = m && typeof m === 'object' ? m.value : m;
    const c = conf[tmpl.id];
    return {
      ...tmpl,
      value: v != null ? String(v) : '',
      confidence: typeof c?.confidence === 'number' ? c.confidence : undefined,
      flags: c?.flags?.length ? c.flags : undefined,
    };
  });
}

/** 검수 하이라이트 기준 — 이 값 미만이면 "값을 꼭 확인하라"고 표시한다(표시 임계값, 의학 기준 아님). */
export const OCR_LOW_CONFIDENCE = 0.7;

/** confidence flag를 사용자가 읽을 수 있는 이유로 바꾼다. 모르는 flag는 그대로 노출하지 않는다. */
export function ocrFlagText(flags?: string[]): string | null {
  if (!flags?.length) return null;
  const parts: string[] = [];
  if (flags.includes('out_of_range_suspect')) parts.push('일반적인 범위를 벗어난 값이에요');
  if (flags.includes('low_llm_confidence')) parts.push('글자가 흐릿해 판독이 불확실했어요');
  return parts.length ? parts.join(' · ') : null;
}

/** 사용자가 검수·수정한 OcrField[] → 다시 백엔드 ocr JSON 모양으로 변환한다(원본 ocr의 lifestyle 등 다른 필드는 그대로 보존). */
export function fieldsToOcrResult(fields: OcrField[], original: RealOcrResult['ocr']): RealOcrResult['ocr'] {
  const meta = { ...(original.meta ?? {}) };
  const measurements: Record<string, { value: any; unit?: string } | null> = { ...(original.measurements ?? {}) };
  for (const f of fields) {
    const raw = f.value.trim();
    if (f.id === 'exam_date') { meta.exam_date = raw || null; continue; }
    if (f.id === 'hospital') { meta.hospital = raw || null; continue; }
    const num = raw === '' ? null : (Number.isFinite(Number(raw)) ? Number(raw) : raw);
    measurements[f.id] = { ...(measurements[f.id] ?? {}), value: num, unit: f.unit ?? measurements[f.id]?.unit };
  }
  return { ...original, meta, measurements };
}

// ---- What-if 재계산 (POST /analyze/simulate) --------------------------------
// ⚠️ 생활습관 변화의 효과를 예측하는 게 아니다. 검진값을 직접 바꿔 넣었을 때
//    공식(계산기·대사증후군 5기준·집단군·LDL 목표)이 산출하는 값을 다시 계산한 결과다.
export type SimulateChanges = {
  weight?: number; waist?: number; sbp?: number; dbp?: number;
  fbs?: number; tg?: number; hdl?: number; ldl?: number;
};

export type RealSimulation = {
  changes_applied: { key: string; label: string; before: number | null; after: number }[];
  metabolic_syndrome: {
    before: { count: number | null; evaluable: number | null; is_metabolic_syndrome: boolean | null; met_factors: string[] };
    after: { count: number | null; evaluable: number | null; is_metabolic_syndrome: boolean | null; met_factors: string[] };
  };
  calculators: {
    key: string; title: string; category: string;
    before: number | null; after: number | null; delta: number | null; changed: boolean;
    before_level?: string; after_level?: string; after_interpretation?: string;
    before_percentile?: number | null; after_percentile?: number | null; after_peer_label?: string | null;
  }[];
  groups: { resolved: string[]; added: string[] };
  ldl_target: {
    target_ldl: number | null; label: string | null;
    before_ldl: number | null; after_ldl: number | null;
    before_achieved: boolean | null; after_achieved: boolean | null;
  };
  unchanged: string[];
  limitations: string[];
  baseline_year?: number | null;
  error?: string;
};

export async function simulateCheckup(changes: SimulateChanges): Promise<RealSimulation> {
  return apiFetch('/analyze/simulate', { method: 'POST', body: JSON.stringify(changes) });
}

/** 검수 완료된 OCR JSON을 분석 + (옵션) 저장 요청한다. */
export async function analyzeCheckup(ocr: RealOcrResult['ocr'], save: boolean): Promise<RealAnalyzeResult> {
  return apiFetch('/analyze', { method: 'POST', body: JSON.stringify({ ocr, save }) });
}

// ---- 처방전·복약자료 업로드 (POST /medication/upload) ------------------------
export type RealMedicationUploadResult = {
  count: number;
  persisted: boolean;
  inserted: number;
  unique_ingredients: string[];
  items: Array<Record<string, any>>;
};

/** HIRA 복약이력 엑셀(xls/xlsx) 파일(로컬 URI)을 업로드해 파싱 결과를 받아온다. */
export async function uploadMedicationFile(uri: string, fileName: string, manualBirthday?: string): Promise<RealMedicationUploadResult> {
  const token = await getAccessToken();
  const form = new FormData();
  form.append('file', { uri, name: fileName, type: 'application/vnd.ms-excel' } as any);
  if (manualBirthday) form.append('manual_birthday', manualBirthday);
  form.append('persist', 'true');
  const res = await fetch(`${API_BASE_URL}/medication/upload`, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${detail ? ` - ${detail}` : ''}`);
  }
  return res.json();
}

/** 저장된 투약이력을 조회한다 (GET /medication/{userId}). 없으면 빈 배열. */
export async function fetchMedications(userId: string): Promise<MedicationItem[]> {
  return apiFetch(`/medication/${userId}`);
}

// ---- 신장 기능(eGFR) ---------------------------------------------------------
// app/renal/schemas.py — 실제로 존재하는 백엔드 계산 기능. 혈청 크레아티닌 + 나이 + 성별로 계산한다.
export type RealEgfr = {
  egfr: number;
  unit: string;
  stage: string;
  label: string;
  description: string;
  severity: string;
  method: string;
  // 체중을 함께 보낸 경우에만 계산된다(약물 용량 참고용, Cockcroft-Gault). 없으면 null.
  crcl?: number | null;
  crcl_label?: string | null;
  crcl_note?: string | null;
  crcl_method?: string;
};

/** 혈청 크레아티닌 값이 그 해에 실제로 측정된 경우에만 호출한다 — 없는 값으로 추정해서 보여주지 않는다.
 *  체중(weightKg)을 주면 약물 용량 참고용 CrCl도 함께 내려온다. */
export async function fetchEgfr(serumCr: number, age: number, sex: 1 | 2, weightKg?: number | null): Promise<RealEgfr | null> {
  try {
    return await apiFetch('/renal/egfr', {
      method: 'POST',
      body: JSON.stringify({
        // 백엔드 app/renal/gfr.py의 Sex enum은 'M'/'F'만 받는다.
        // 'male'/'female'을 보내면 Pydantic 검증에서 422가 나고, 아래 catch가
        // 그걸 삼켜서 화면에는 아무 에러 없이 신장 기능이 통째로 안 보였다.
        serum_cr: serumCr, age, sex: sex === 2 ? 'F' : 'M',
        ...(typeof weightKg === 'number' && weightKg > 0 ? { weight_kg: weightKg } : {}),
      }),
    });
  } catch {
    return null;
  }
}

/** 연도별 개인화 권장사항 — 백엔드가 실제로 생성해 보내준 내용만 그대로 보여준다.
 *  분석은 연도마다 그 해 수치로 따로 계산돼 그 해 record에 저장된다(analysis_results ⟷ checkup_records).
 *  ⚠️ 예전엔 최신 연도 것 하나만 뽑아 썼다 — 분석 화면 위쪽 연도 칩을 눌러도 아래 카드는
 *  그대로여서, 2018년 점수 옆에 2024년 권장사항이 아무 표시 없이 나란히 놓였다. */
export function recommendationsByYear(raw: RealReportPayload[]): Record<number, RealRecommendations> {
  const out: Record<number, RealRecommendations> = {};
  for (const p of raw) if (p.recommendations) out[p.year] = p.recommendations;
  return out;
}

/** 연도별 조합 그룹 분석 — 07 마이그레이션 이전에 저장된 연도에는 없으므로 비어 있는 게 정상이다. */
export function comboAnalysisByYear(raw: RealReportPayload[]): Record<number, RealComboAnalysis> {
  const out: Record<number, RealComboAnalysis> = {};
  for (const p of raw) if (p.combo_analysis) out[p.year] = p.combo_analysis;
  return out;
}

/** 연도별 eGFR — /renal/egfr은 저장 없는 순수 계산기라 각 해 크레아티닌·그 해 나이로 그냥 다시 부르면 된다.
 *  "그 해에 실제로 측정된 경우에만 계산한다"는 원칙은 그대로 두고, 대상만 최신 연도에서 전 연도로 넓힌다. */
export async function egfrByYear(
  raw: RealReportPayload[],
  birthYear: number,
  gender: number,
): Promise<Record<number, RealEgfr>> {
  const sex: 1 | 2 = gender === 2 ? 2 : 1;
  const targets = raw.flatMap((p) => {
    const cr = p.comprehensive?.all_evaluations?.find((e) => e.metric === '혈청크레아티닌' || e.metric === '혈청 크레아티닌')?.value;
    if (typeof cr !== 'number') return [];
    // 체중이 그 해 검진에 기록돼 있으면 함께 보내 약물 용량 참고용 CrCl도 받아온다.
    const weight = p.checkup?.weight_kg;
    return [{ year: p.year, cr, weight: typeof weight === 'number' ? weight : null }];
  });
  const results = await Promise.all(targets.map((t) => fetchEgfr(t.cr, t.year - birthYear, sex, t.weight)));
  const out: Record<number, RealEgfr> = {};
  targets.forEach((t, i) => { const r = results[i]; if (r) out[t.year] = r; });
  return out;
}

/**
 * 여러 연도의 보고서를 한 번에 받아 Report[] 모양으로 합쳐준다.
 * (대시보드/기록/히스토리/분석 화면에서 reports[] 대신 이 결과를 사용하면 된다)
 */
export async function fetchAllReports(userId: string): Promise<{ reports: Report[]; raw: RealReportPayload[] }> {
  const years = await fetchReportYears(userId);
  const raw = await Promise.all(years.map((y) => fetchReportByYear(userId, y)));
  raw.sort((a, b) => a.year - b.year);
  return { reports: raw.map(adaptReport), raw };
}

/** 특정 연도의 검진 기록을 서버에서 삭제한다. */
export async function deleteReport(userId: string, year: number): Promise<void> {
  await apiFetch(`/reports/${userId}/${year}`, { method: 'DELETE' });
}

/**
 * 회원탈퇴 — 계정(auth.users)과 모든 연관 데이터(검진·분석·복약·시계열)를 CASCADE로 영구 삭제한다.
 * ⚠️ 되돌릴 수 없다. 백엔드는 204 No Content를 반환한다.
 */
export async function deleteAccount(userId: string): Promise<void> {
  await apiFetch(`/users/${userId}`, { method: 'DELETE' });
}

/** 가장 최근 연도의 평가 항목들을 MetricDefinition[] 모양으로 변환한다. */
export function latestEvaluationsAsMetricDefinitions(raw: RealReportPayload[]) {
  if (raw.length === 0) return [];
  const latest = raw[raw.length - 1];
  return latest.comprehensive.all_evaluations.map(adaptEvaluation);
}
