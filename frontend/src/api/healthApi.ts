import type { HealthRecord } from '../data/mockData';
import { getAccessToken } from './supabaseClient';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL ?? import.meta.env.VITE_API_BASE_URL ?? '/api';

export type ApiUser = {
  user_id?: string;
  id?: string;
  name?: string;
  user_name?: string;
  gender?: string | number;
  sex?: string | number;
  birth_year?: number;
  birth_md?: number;
  age?: number;
};

export type ApiEvaluation = {
  metric?: string;
  value?: number | string;
  status?: string;
  label?: string;
  meaning?: string;
  direction?: string;
  unit?: string;
  percentile?: number | null;
  peer_mean?: number | null;
  normal_range?: string | null;
  disclaimer?: string | null;
  on_medication?: boolean;
  is_elderly_warning?: boolean;
};

export type ApiComprehensiveReport = {
  user_id?: string;
  user_name?: string;
  gender?: string | number;
  age?: number;
  year?: number;
  all_evaluations?: ApiEvaluation[];
  by_status?: Record<string, ApiEvaluation[]>;
  summary?: {
    total_metrics?: number;
    risk_count?: number;
    warning_count?: number;
    normal_count?: number;
    risk_score?: number;
    overall_status?: string;
  };
};

export type ApiRecommendationCategory = {
  category?: string;
  factor?: string;
  group_id?: string;
  medication?: string;
  title?: string;
  target?: string;
  reason?: string;
  note?: string;
  items?: string[];
  details?: string[];
  by_medication?: boolean;
};

export type ApiRecommendations = {
  user_id?: string;
  user_name?: string;
  age?: number;
  priority_messages?: string[];
  recommendations?: {
    common?: ApiRecommendationCategory[];
    metabolic_factors?: ApiRecommendationCategory[];
    group_specific?: ApiRecommendationCategory[];
    medication_notes?: ApiRecommendationCategory[];
    elderly_notes?: ApiRecommendationCategory[];
  };
  _meta?: {
    generated_at?: string;
    version?: string;
    disclaimer?: string;
  };
};

export type ApiTrendItem = {
  metric?: string;
  first_year?: number;
  last_year?: number;
  n_years?: number;
  first_value?: number;
  last_value?: number;
  change?: number;
  pct_change?: number;
  direction?: 'bad' | 'good' | 'neutral' | string;
  magnitude?: 'large' | 'small' | 'stable' | string;
  current_status?: string;
  current_label?: string;
  current_meaning?: string;
};

export type ApiReferenceItem = {
  item: string;
  value: number;
  population_mean?: number;
};

export type ApiReferenceEvaluation = {
  item: string;
  value: number;
  unit?: string;
  normal_low?: number | null;
  normal_high?: number | null;
  normal_status?: 'normal' | 'low' | 'high' | string;
  severity?: 'normal' | 'caution' | 'warning' | string;
  in_normal_range?: boolean;
  population_mean?: number | null;
  diff_from_mean?: number | null;
  pct_from_mean?: number | null;
  mean_position?: 'above' | 'below' | 'near' | string;
};

export type ApiReferenceEvaluateResponse = {
  sex: 'M' | 'F' | string;
  results: ApiReferenceEvaluation[];
};

export type ApiEgfrResponse = {
  egfr: number;
  unit: string;
  stage: string;
  label: string;
  description: string;
  severity: 'normal' | 'caution' | 'warning' | 'danger' | string;
  method: string;
  // 체중(weight_kg)을 함께 보낸 경우에만 계산된다(약물 용량 참고용, Cockcroft-Gault). 없으면 null.
  crcl?: number | null;
  crcl_label?: string | null;
  crcl_note?: string | null;
  crcl_method?: string;
};

export type ApiMedicationUploadResponse = {
  count: number;
  persisted: boolean;
  inserted?: number;
  unique_ingredients?: string[];
  items?: Array<{
    dispensed_date?: string;
    product_name?: string;
    efficacy_class?: string;
    ingredient_en?: string;
    total_days?: number;
    times_per_day?: number;
    dose_per_time?: string;
    unit?: string;
    drug_code?: string;
    prescriber?: string;
    dispenser?: string;
    safety_alert?: string;
    antithrombotic?: string | null;
  }>;
};

export type ApiTimeseriesFull = {
  user_id?: string;
  user_name?: string;
  gender?: string | number;
  n_checkups?: number;
  years?: number[];
  by_direction?: {
    bad_large?: ApiTrendItem[];
    bad_small?: ApiTrendItem[];
    good_large?: ApiTrendItem[];
    good_small?: ApiTrendItem[];
    neutral_change?: ApiTrendItem[];
    stable?: ApiTrendItem[];
  };
  summary?: {
    total_metrics_tracked?: number;
    bad_changes?: number;
    good_changes?: number;
    neutral_or_stable?: number;
  };
  // GET /timeseries/{userId} 실응답에 포함 — 주목할 변화 요약 문구.
  highlights?: { metric: string; type: string; severity: string; message: string }[];
  _meta?: {
    analyzed_at?: string;
  };
};

// 저장된 복약 정보 한 건 (GET /medication/{userId}).
export type ApiMedicationItem = {
  dispensed_date?: string;
  product_name?: string;
  efficacy_class?: string;
  ingredient_en?: string;
  total_days?: number;
  [key: string]: unknown;
};

// 프로필 저장 페이로드 — 기본 정보 + 생활습관 문진(smoking/drinking/alcohol_weekly_g).
export type ApiProfilePayload = {
  name?: string;
  gender?: string | number;
  birth_year?: number;
  birth_md?: number;
  smoking?: 'never' | 'former' | 'current' | null;
  drinking?: 'no' | 'yes' | null;
  alcohol_weekly_g?: number | null;
};

export type ApiReportList = {
  user_id: string;
  years: number[];
  count: number;
};

export type UploadOcrResponse = {
  ocr: unknown;
  warnings?: string[];
};

// 조합 그룹(복합 질환군) — analyzer/_internal/combo_group_analysis.py 응답 구조.
// 공단 표본에서 이 조합이 독립 가정 대비 몇 배 자주 동반되는지(O/E비)를 함께 내려준다.
// ⚠️ sql/07 마이그레이션 이전에 저장된 분석에는 없다 → 항상 null 처리할 것.
export type ApiComboGroup = {
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

// FLI/HSI 지방간 보조지표 — 값·구간·해석·기준 문구 전부 백엔드가 만들어 내려준다.
export type ApiFattyLiverIndex = {
  value: number;
  level: 'low' | 'intermediate' | 'high';
  interpretation: string;
  cutoffs?: string;
  formula?: string;
} | null;

// 단일 집단군 판정(13개) — applies가 null이면 판정 불가(그 해 입력값 없음).
export type ApiSingleGroup = {
  key: string;
  name: string;
  category: string;
  desc?: string | null;
  applies: boolean | null;
};

// ASCVD 10년 위험도 — 참고용 시뮬레이션(한국인 미검증, 진단 아님).
export type ApiAscvdSimulation = {
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
export type ApiCalcItem = {
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

export type ApiCalculators = {
  items: ApiCalcItem[];
  unavailable: string[];
  disclaimer: string;
  error?: string;
} | null;

export type ApiComboAnalysis = {
  combo_groups?: {
    matched: ApiComboGroup[];
    not_evaluable: { combo_name: string; category: string; met: string[]; missing: string[]; reason: string }[];
    matched_count: number;
    ascvd_risk_combos: string[];
    highest_synergy: ApiComboGroup | null;
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
    indices?: {
      fli: ApiFattyLiverIndex;
      hsi: ApiFattyLiverIndex;
      unavailable: string[];
      disclaimer: string;
      error?: string;
    } | null;
  } | null;
  // ⚠️ 아래 필드들은 최신 분석부터 저장된다 — 구버전 분석에는 없다 → null 처리.
  single_groups?: ApiSingleGroup[] | null;
  ascvd_simulation?: ApiAscvdSimulation | null;
  calculators?: ApiCalculators;
  disclaimer?: string;
  error?: string;
};

export type AnalyzeResponse = {
  basic_report: unknown;
  comprehensive: ApiComprehensiveReport;
  recommendations?: ApiRecommendations | null;
  group_analysis?: unknown;
  combo_analysis?: ApiComboAnalysis | null;
  saved: boolean;
  saved_paths?: Record<string, string> | string[] | null;
  warnings?: string[];
};

export type ApiHealthState = {
  baseUrl: string;
  users: ApiUser[];
  selectedUserId: string;
  reportYears: number[];
  reports: HealthRecord[];
  rawReports: Record<number, unknown>;
  comprehensive: ApiComprehensiveReport | null;
  recommendations: ApiRecommendations | null;
  timeseriesFull: ApiTimeseriesFull | null;
  loading: boolean;
  error: string | null;
  lastLoadedAt: string | null;
};

function withBase(path: string) {
  return `${API_BASE_URL}${path}`;
}

async function authHeaders(json = true) {
  const token = await getAccessToken();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(withBase(path), {
    ...init,
    headers: {
      ...(await authHeaders(true)),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`${response.status} ${response.statusText}${detail ? ` - ${detail}` : ''}`);
  }

  return response.json() as Promise<T>;
}

type ApiUserListResponse = { total?: number; users?: ApiUser[] };
type LatestComprehensiveResponse = { comprehensive?: ApiComprehensiveReport };

export const healthApi = {
  baseUrl: API_BASE_URL,
  getUsers: async () => {
    const result = await fetchJson<ApiUser[] | ApiUserListResponse>('/users');
    return Array.isArray(result) ? result : result.users ?? [];
  },
  getReportList: (userId: string) => fetchJson<ApiReportList>(`/reports/${userId}`),
  getReport: (userId: string, year: number) => fetchJson<unknown>(`/reports/${userId}/${year}`),
  deleteReport: (userId: string, year: number) =>
    fetchJson<{ message?: string }>(`/reports/${userId}/${year}`, { method: 'DELETE' }),
  getComprehensive: async (userId: string) => {
    const result = await fetchJson<ApiComprehensiveReport | LatestComprehensiveResponse>(`/reports/${userId}/comprehensive/latest`);
    return 'comprehensive' in result && result.comprehensive ? result.comprehensive : result as ApiComprehensiveReport;
  },
  getRecommendations: (userId: string) => fetchJson<ApiRecommendations>(`/recommendations/${userId}`),
  getTimeseriesFull: async (userId: string) => {
    const result = await fetchJson<ApiTimeseriesFull | { timeseries_data?: ApiTimeseriesFull }>(`/timeseries/${userId}`);
    return 'timeseries_data' in result && result.timeseries_data ? result.timeseries_data : result as ApiTimeseriesFull;
  },
  refreshTimeseries: () => fetchJson<unknown>('/timeseries/refresh', { method: 'POST' }),
  getReferenceItems: () => fetchJson<{ items: string[] }>('/reference/items'),
  evaluateReference: (body: { sex: 'M' | 'F'; items: ApiReferenceItem[] }) =>
    fetchJson<ApiReferenceEvaluateResponse>('/reference/evaluate', { method: 'POST', body: JSON.stringify(body) }),
  calculateEgfr: (body: { serum_cr: number; age: number; sex: 'M' | 'F'; weight_kg?: number }) =>
    fetchJson<ApiEgfrResponse>('/renal/egfr', { method: 'POST', body: JSON.stringify(body) }),
  upsertProfile: (body: ApiProfilePayload) =>
    fetchJson<ApiUser>('/users', { method: 'POST', body: JSON.stringify(body) }),
  updateProfile: (userId: string, body: ApiProfilePayload) =>
    fetchJson<ApiUser>(`/users/${userId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  getMedications: (userId: string) => fetchJson<ApiMedicationItem[]>(`/medication/${userId}`),
  // 회원탈퇴 — 계정과 모든 연관 데이터를 영구 삭제한다(백엔드 204). 되돌릴 수 없다.
  deleteAccount: async (userId: string) => {
    const response = await fetch(withBase(`/users/${userId}`), { method: 'DELETE', headers: await authHeaders(true) });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`${response.status} ${response.statusText}${detail ? ` - ${detail}` : ''}`);
    }
  },
  uploadFile: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(withBase('/uploads'), {
      method: 'POST',
      headers: await authHeaders(false),
      body: formData,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`${response.status} ${response.statusText}${detail ? ` - ${detail}` : ''}`);
    }
    return response.json() as Promise<UploadOcrResponse>;
  },
  analyzeOcr: (body: unknown) =>
    fetchJson<AnalyzeResponse>('/analyze', { method: 'POST', body: JSON.stringify(body) }),
  uploadMedication: async (file: File, persist = true) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('persist', String(persist));
    const response = await fetch(withBase('/medication/upload'), {
      method: 'POST',
      headers: await authHeaders(false),
      body: formData,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`${response.status} ${response.statusText}${detail ? ` - ${detail}` : ''}`);
    }
    return response.json() as Promise<ApiMedicationUploadResponse>;
  },
};
