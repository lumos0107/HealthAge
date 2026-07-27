// ─── 화면용 요약 모양 (adapt.ts가 만든다) ────────────────────────────────
export type Status = '정상' | '주의' | '위험';

export type MetricKey =
  | 'sbp' | 'dbp' | 'glucose' | 'bmi' | 'waist'
  | 'ldl' | 'hdl' | 'triglyceride'
  | 'ast' | 'alt' | 'ggt'
  | 'hemoglobin' | 'creatinine';

export type Report = {
  year: number;
  date: string;
  hospital: string;
  status: Status;
  summary: string;
  score: number;
  manageCount: number;
  trackCount: number;
  values: Partial<Record<MetricKey, number>>;
  statusByKey: Partial<Record<MetricKey, Status>>;
};

// ─── Task 1에서 백엔드가 새로 주입하는 두 필드 ─────────────────────────
// ⚠️ 기존 저장 행에는 없다 → 항상 null 가능.
export type RealRarity = {
  clinical_groups: string[];
  lifestyle_groups: string[];
  clinical_count: number;
  lifestyle_count: number;
  interpretation: string;
} | null;

export type RealMetabolicSyndromeDetail = {
  count?: number | null;
  evaluable?: number | null;
  is_metabolic_syndrome?: boolean | null;
  met_factors?: string[];
  [key: string]: any;
} | null;

// ─── 프로필 (backend/app/schemas/profile.py ProfileResponse와 1:1) ──────
export type Profile = {
  id: string;
  name: string | null;
  gender: 1 | 2 | null;
  birth_year: number | null;
  smoking: 'never' | 'former' | 'current' | null;
  drinking: 'no' | 'yes' | null;
  alcohol_weekly_g: number | null;
  created_at: string;
  updated_at: string;
};

// ─── 검사항목 참고치 (backend/app/reference/schemas.py와 1:1) ───────────
export type ReferenceItemResult = {
  item: string;
  value: number;
  unit: string;
  normal_low: number | null;
  normal_high: number | null;
  normal_status: 'normal' | 'low' | 'high';
  severity: 'normal' | 'caution' | 'warning';
  in_normal_range: boolean;
  population_mean: number | null;
  diff_from_mean: number | null;
  pct_from_mean: number | null;
  mean_position: 'above' | 'below' | 'near' | null;
};

export type ReferenceEvaluateResponse = {
  sex: 'M' | 'F';
  results: ReferenceItemResult[];
};

// ─── 이하 frontend-mobile/src/health.ts에서 이식 ─────────────────────────

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
    metabolic_factors?: { factor: string; title: string; target?: string; details: string[]; by_medication?: boolean; reason?: string }[];
    group_specific?: { group_id: string; title: string; details: string[] }[];
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
  cutoffs?: string;
  formula?: string;
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
  // Task 1에서 백엔드가 주입. 구버전 저장 행에는 없다.
  rarity?: RealRarity;
  metabolic_syndrome_detail?: RealMetabolicSyndromeDetail;
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

// ---- 검진지 OCR 항목 정의 (frontend-mobile/src/data.ts 43~56행에서 이식) ------
export type OcrField = {
  id: string;
  label: string;
  value: string;
  unit?: string;
  required?: boolean;
  // OCR이 이 값을 얼마나 확신하는지(0~1). 백엔드 measurements_confidence에서 온다.
  // 사진 인식이 아닌 경우(직접 입력·예시)는 확신도라는 게 없으므로 undefined로 둔다 —
  // 없는 숫자를 만들어 넣으면 검수 하이라이트가 거짓 근거로 뜨게 된다.
  confidence?: number;
  // 휴리스틱이 붙인 의심 표시: out_of_range_suspect(범위 밖) / low_llm_confidence.
  flags?: string[];
  section: '기본 정보' | '검사 수치';
};

// ---- 복약이력 항목 (frontend-mobile/src/data.ts 330~344행에서 이식) -----------
export type MedicationItem = {
  dispensed_date: string;
  product_name: string;
  efficacy_class: string;
  ingredient_en: string;
  total_days: number | null;
  times_per_day: number | null;
  dose_per_time: string | null;
  unit: string | null;
  drug_code: string | null;
  prescriber: string | null;
  dispenser: string | null;
  safety_alert: string | null;
  antithrombotic: string | null;
};

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

// ---- 처방전·복약자료 업로드 (POST /medication/upload) ------------------------
export type RealMedicationUploadResult = {
  count: number;
  persisted: boolean;
  inserted: number;
  unique_ingredients: string[];
  items: Array<Record<string, any>>;
};

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
