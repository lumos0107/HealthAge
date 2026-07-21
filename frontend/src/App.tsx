import { createContext, useContext, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Activity } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getAccessToken, supabase, supabaseConfigured } from './api/supabaseClient';
import {
  healthApi,
  type ApiComboAnalysis,
  type ApiComprehensiveReport,
  type ApiEgfrResponse,
  type ApiEvaluation,
  type ApiMedicationItem,
  type ApiProfilePayload,
  type ApiRecommendations,
} from './api/healthApi';
import { evaluationByMetric, getUserId, normalizeReport } from './api/reportMapper';
import type { HealthRecord } from './data/mockData';

type TabKey = 'dashboard' | 'records' | 'history' | 'analysis' | 'upload';
type Status = '정상 기준 안' | '관리 참고' | '추적 확인';
type MetricKey =
  | 'sbp'
  | 'dbp'
  | 'glucose'
  | 'bmi'
  | 'waist'
  | 'ldl'
  | 'hdl'
  | 'triglyceride'
  | 'ast'
  | 'alt'
  | 'ggt'
  | 'hemoglobin'
  | 'creatinine';

type Report = {
  year: number;
  date: string;
  hospital: string;
  status: Status;
  summary: string;
  score: number;
  values: Record<MetricKey, number>;
};

type MetricDefinition = {
  key: MetricKey;
  category: string;
  name: string;
  shortName: string;
  unit: string;
  normalText: string;
  normalValue: number;
  peerMean?: number;
  status: Status;
  description: string;
  note: string;
};

type UploadState = {
  loading: boolean;
  message: string;
  error: string;
  ocr: unknown;
  analysis: unknown;
  medication: unknown;
};

type OcrField = {
  id: string;
  label: string;
  value: string;
  unit?: string;
  required?: boolean;
  confidence: number;
  section: '기본 정보' | '검사 수치';
};

// 생활습관 문진 값 — 모바일 LifestyleForm과 동일 구조. 프로필(profiles)에 저장돼 분석에 자동 사용된다.
type Lifestyle = {
  smoking: 'never' | 'former' | 'current' | null;
  drinking: 'no' | 'yes' | null;
  alcohol_weekly_g: number;
};

const EMPTY_LIFESTYLE: Lifestyle = { smoking: null, drinking: null, alcohol_weekly_g: 0 };

// 술 종류별 1잔 순알코올(g) 근사 — 순알코올 g ≈ 용량(ml) × 도수 × 0.789 (모바일과 동일 상수)
const GRAMS_PER_GLASS: Record<string, number> = { 소주: 7, 맥주: 7, 막걸리: 9, 와인: 14, 양주: 13 };
const DRINK_TYPES = ['소주', '맥주', '막걸리', '와인', '양주'] as const;

type UserProfile = {
  id?: string;
  email?: string;
  name: string;
  gender: 1 | 2;
  birth_year: number;
  birth_md?: number;
  smoking?: Lifestyle['smoking'];
  drinking?: Lifestyle['drinking'];
  alcohol_weekly_g?: number | null;
};

type UserSettings = {
  checkupReminder: boolean;
  medicationReminder: boolean;
  simpleWords: boolean;
};

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL ?? import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

const initialProfile: UserProfile = {
  name: '홍길동',
  gender: 1,
  birth_year: 1974,
  birth_md: 101,
};

const initialSettings: UserSettings = {
  checkupReminder: true,
  medicationReminder: true,
  simpleWords: true,
};

// (목업 reports/latest 제거됨 — 실 데이터는 HealthContext 로 주입한다.)

// 정적 지표 메타(설명·단위·정상기준·연령평균 폴백). 실 상태·연령평균은 API로 덮어씀.
const metricMeta: MetricDefinition[] = [
  {
    key: 'sbp',
    category: '혈압',
    name: '수축기 혈압',
    shortName: '수축기',
    unit: 'mmHg',
    normalText: '<120',
    normalValue: 120,
    peerMean: 126,
    status: '관리 참고',
    description: '심장이 피를 밀어낼 때 혈관에 걸리는 압력입니다.',
    note: '한 번 높게 나왔다고 바로 판단하지 않고 반복 측정 흐름을 함께 봅니다.',
  },
  {
    key: 'dbp',
    category: '혈압',
    name: '이완기 혈압',
    shortName: '이완기',
    unit: 'mmHg',
    normalText: '<80',
    normalValue: 80,
    peerMean: 79,
    status: '관리 참고',
    description: '심장이 쉬는 순간 혈관에 남아 있는 압력입니다.',
    note: '수축기 혈압과 같이 확인해야 혈압 흐름을 이해하기 쉽습니다.',
  },
  {
    key: 'glucose',
    category: '혈당',
    name: '공복혈당',
    shortName: '혈당',
    unit: 'mg/dL',
    normalText: '70-99',
    normalValue: 99,
    peerMean: 101,
    status: '관리 참고',
    description: '식사하지 않은 상태에서 혈액 속 포도당이 어느 정도인지 보는 항목입니다.',
    note: '식사, 수면, 스트레스 영향을 받을 수 있어 여러 해의 흐름이 중요합니다.',
  },
  {
    key: 'bmi',
    category: '체중·복부',
    name: '체질량지수(BMI)',
    shortName: 'BMI',
    unit: 'kg/m²',
    normalText: '18.5-22.9',
    normalValue: 22.9,
    peerMean: 24.2,
    status: '추적 확인',
    description: '키와 체중으로 계산한 체중 상태 참고값입니다.',
    note: '근육량이 많은 사람은 실제 상태와 다를 수 있어 허리둘레와 함께 봅니다.',
  },
  {
    key: 'waist',
    category: '체중·복부',
    name: '허리둘레',
    shortName: '허리',
    unit: 'cm',
    normalText: '남 <90 / 여 <85',
    normalValue: 90,
    peerMean: 86,
    status: '추적 확인',
    description: '복부 비만 여부를 볼 때 참고하는 둘레 수치입니다.',
    note: '대사증후군 기준과 연결되므로 BMI와 함께 확인합니다.',
  },
  {
    key: 'ldl',
    category: '지질',
    name: 'LDL-C',
    shortName: 'LDL',
    unit: 'mg/dL',
    normalText: '<130',
    normalValue: 130,
    peerMean: 128,
    status: '관리 참고',
    description: '혈관 건강 관리에서 자주 확인하는 콜레스테롤 항목입니다.',
    note: '기저질환이나 복용 약에 따라 목표 기준이 달라질 수 있습니다.',
  },
  {
    key: 'hdl',
    category: '지질',
    name: 'HDL-C',
    shortName: 'HDL',
    unit: 'mg/dL',
    normalText: '남 >=40 / 여 >=50',
    normalValue: 40,
    peerMean: 47,
    status: '관리 참고',
    description: '흔히 좋은 콜레스테롤이라고 부르며 낮을 때 참고가 필요합니다.',
    note: '다른 지질 수치와 함께 봐야 전체 흐름을 이해하기 쉽습니다.',
  },
  {
    key: 'triglyceride',
    category: '지질',
    name: '중성지방',
    shortName: '중성지방',
    unit: 'mg/dL',
    normalText: '<150',
    normalValue: 150,
    peerMean: 152,
    status: '관리 참고',
    description: '혈액 속 지방 성분 중 하나로 식사와 음주의 영향을 많이 받습니다.',
    note: '공복 여부와 최근 식습관에 따라 달라질 수 있어 추적 확인이 좋습니다.',
  },
  {
    key: 'ast',
    category: '간 기능',
    name: 'AST',
    shortName: 'AST',
    unit: 'IU/L',
    normalText: '<40',
    normalValue: 40,
    peerMean: 29,
    status: '정상 기준 안',
    description: '간과 근육 세포 상태를 참고할 때 보는 효소 수치입니다.',
    note: '단독으로 질환을 판단하지 않고 ALT, 감마-GTP와 함께 봅니다.',
  },
  {
    key: 'alt',
    category: '간 기능',
    name: 'ALT',
    shortName: 'ALT',
    unit: 'IU/L',
    normalText: '<40',
    normalValue: 40,
    peerMean: 32,
    status: '관리 참고',
    description: '간세포 상태를 참고하는 대표적인 효소 수치입니다.',
    note: '피로, 음주, 약물 등 여러 요인의 영향을 받을 수 있습니다.',
  },
  {
    key: 'ggt',
    category: '간 기능',
    name: '감마-GTP',
    shortName: '감마-GTP',
    unit: 'IU/L',
    normalText: '남 11-63 / 여 8-35',
    normalValue: 63,
    peerMean: 41,
    status: '관리 참고',
    description: '간담도계 상태와 음주 영향을 참고할 때 보는 수치입니다.',
    note: '음주, 약물, 지방간 등과 함께 해석해야 합니다.',
  },
  {
    key: 'hemoglobin',
    category: '혈액',
    name: '혈색소',
    shortName: '혈색소',
    unit: 'g/dL',
    normalText: '남 13-17 / 여 12-16',
    normalValue: 17,
    peerMean: 14.8,
    status: '정상 기준 안',
    description: '혈액이 산소를 운반하는 능력을 참고하는 항목입니다.',
    note: '낮거나 높을 때는 다른 혈액검사 결과와 함께 확인합니다.',
  },
  {
    key: 'creatinine',
    category: '신장 기능',
    name: '혈청 크레아티닌',
    shortName: '크레아티닌',
    unit: 'mg/dL',
    normalText: '기관 기준 확인',
    normalValue: 1.2,
    status: '정상 기준 안',
    description: '신장 기능을 추정할 때 참고하는 혈액검사 수치입니다.',
    note: '요청사항에 따라 시계열에는 표시하고 연령대 평균 비교에서는 제외합니다.',
  },
];

// ─────────────────────────────────────────────────────────────
// 실 API 데이터 계층 (목업 대체)
// App 지표키 ↔ API HealthRecord 필드. hemoglobin 은 API 모델에 없어 있으면만 읽힘.
const apiFieldByMetric: Record<MetricKey, string> = {
  sbp: 'sbp', dbp: 'dbp', glucose: 'fbs', bmi: 'bmi', waist: 'waist',
  ldl: 'ldl', hdl: 'hdl', triglyceride: 'tg', ast: 'ast', alt: 'alt',
  ggt: 'ggt', hemoglobin: 'hemoglobin', creatinine: 'creatinine',
};

function recordToValues(record: HealthRecord): Record<MetricKey, number> {
  const raw = record as unknown as Record<string, unknown>;
  const out = {} as Record<MetricKey, number>;
  (Object.keys(apiFieldByMetric) as MetricKey[]).forEach((key) => {
    const value = Number(raw[apiFieldByMetric[key]]);
    out[key] = Number.isFinite(value) ? value : 0;
  });
  return out;
}

// 값 → App 3단계 상태. clinical 지침 임계값을 App 카테고리로 축약.
function clinicalStatus(key: MetricKey, value: number, sex: 'M' | 'F'): Status {
  if (!Number.isFinite(value) || value <= 0) return '정상 기준 안';
  const male = sex !== 'F';
  switch (key) {
    case 'sbp': return value < 120 ? '정상 기준 안' : value < 140 ? '관리 참고' : '추적 확인';
    case 'dbp': return value < 80 ? '정상 기준 안' : value < 90 ? '관리 참고' : '추적 확인';
    case 'glucose': return value < 100 ? '정상 기준 안' : value < 126 ? '관리 참고' : '추적 확인';
    case 'bmi': return value < 23 ? '정상 기준 안' : value < 25 ? '관리 참고' : '추적 확인';
    case 'waist': return value < (male ? 90 : 85) ? '정상 기준 안' : '관리 참고';
    case 'ldl': return value < 130 ? '정상 기준 안' : value < 160 ? '관리 참고' : '추적 확인';
    case 'hdl': return value >= (male ? 40 : 50) ? '정상 기준 안' : '관리 참고';
    case 'triglyceride': return value < 150 ? '정상 기준 안' : value < 200 ? '관리 참고' : '추적 확인';
    case 'ast':
    case 'alt': return value < 40 ? '정상 기준 안' : value <= 80 ? '관리 참고' : '추적 확인';
    case 'ggt': return value <= (male ? 63 : 35) ? '정상 기준 안' : value >= 75 ? '추적 확인' : '관리 참고';
    case 'hemoglobin': return value >= (male ? 13 : 12) ? '정상 기준 안' : '관리 참고';
    case 'creatinine': return value <= 1.3 ? '정상 기준 안' : '관리 참고';
    default: return '정상 기준 안';
  }
}

function reportScore(values: Record<MetricKey, number>, sex: 'M' | 'F'): number {
  let score = 100;
  (Object.keys(values) as MetricKey[]).forEach((key) => {
    const v = values[key];
    if (!Number.isFinite(v) || v <= 0) return;
    const s = clinicalStatus(key, v, sex);
    if (s === '관리 참고') score -= 6;
    else if (s === '추적 확인') score -= 12;
  });
  return Math.max(0, score);
}

function worstStatus(values: Record<MetricKey, number>, sex: 'M' | 'F'): Status {
  let hasCaution = false;
  for (const key of Object.keys(values) as MetricKey[]) {
    const v = values[key];
    if (!Number.isFinite(v) || v <= 0) continue;
    const s = clinicalStatus(key, v, sex);
    if (s === '추적 확인') return '추적 확인';
    if (s === '관리 참고') hasCaution = true;
  }
  return hasCaution ? '관리 참고' : '정상 기준 안';
}

function recordSex(record: HealthRecord): 'M' | 'F' {
  return record.sex === 'F' ? 'F' : 'M';
}

function recordToReport(record: HealthRecord): Report {
  const values = recordToValues(record);
  const sex = recordSex(record);
  return {
    year: record.year,
    date: record.examDate,
    hospital: record.hospital,
    status: worstStatus(values, sex),
    summary: record.summary || '저장된 검진 결과입니다.',
    score: reportScore(values, sex),
    values,
  };
}

// 정적 메타 + API(상태·연령평균)로 런타임 MetricDefinition 생성.
function buildMetricDefinitions(
  latest: Report | null,
  sex: 'M' | 'F',
  comprehensive: ApiComprehensiveReport | null,
): MetricDefinition[] {
  return metricMeta.map((meta) => {
    const value = latest?.values[meta.key];
    const status: Status = value != null ? clinicalStatus(meta.key, value, sex) : '정상 기준 안';
    const evalItem: ApiEvaluation | null = comprehensive
      ? evaluationByMetric(comprehensive, meta.name) ?? evaluationByMetric(comprehensive, meta.shortName)
      : null;
    const peerMean = typeof evalItem?.peer_mean === 'number' ? evalItem.peer_mean : meta.peerMean;
    return { ...meta, status, peerMean };
  });
}

export type HealthData = {
  reports: Report[];
  latest: Report | null;
  metricDefinitions: MetricDefinition[];
  combo: ApiComboAnalysis | null;
  recommendations: ApiRecommendations | null;
  egfr: ApiEgfrResponse | null;
  highlights: { metric: string; type: string; severity: string; message: string }[] | null;
  medications: ApiMedicationItem[];
  hasData: boolean;
};

const emptyHealthData: HealthData = {
  reports: [],
  latest: null,
  metricDefinitions: metricMeta.map((meta) => ({ ...meta, status: '정상 기준 안' as Status })),
  combo: null,
  recommendations: null,
  egfr: null,
  highlights: null,
  medications: [],
  hasData: false,
};

const HealthContext = createContext<HealthData>(emptyHealthData);
const useHealth = () => useContext(HealthContext);

// 로그인 사용자의 검진 데이터를 실 API 로 로드해 HealthData 로 조립.
async function loadHealthData(preferredUserId?: string): Promise<HealthData> {
  const token = await getAccessToken();
  if (!token) return emptyHealthData;
  const users = await healthApi.getUsers().catch(() => []);
  const userId = preferredUserId || (users[0] ? getUserId(users[0]) : '');
  if (!userId) return emptyHealthData;
  const me = users[0] ?? null;

  const list = await healthApi.getReportList(userId).catch(() => null);
  const years = list?.years ?? [];
  const rawReports = await Promise.all(years.map((year) => healthApi.getReport(userId, year).catch(() => null)));
  const pairs = rawReports
    .map((raw, index) => {
      const record = raw ? normalizeReport(raw, years[index], index) : null;
      return record ? { record, raw: raw as Record<string, unknown> } : null;
    })
    .filter((pair): pair is { record: HealthRecord; raw: Record<string, unknown> } => pair !== null)
    .sort((a, b) => a.record.year - b.record.year);
  const records = pairs.map((pair) => pair.record);

  const reports = records.map(recordToReport);
  const latest = reports.at(-1) ?? null;
  const latestRecord = records.at(-1) ?? null;
  const latestRaw = pairs.at(-1)?.raw ?? null;
  const sex: 'M' | 'F' = latestRecord ? recordSex(latestRecord) : 'M';
  const comprehensive = await healthApi.getComprehensive(userId).catch(() => null);
  const metricDefinitions = buildMetricDefinitions(latest, sex, comprehensive);

  // 최신 연도 분석에 저장돼 있는 조합그룹·권장사항 — 구버전 분석에는 없어 null 이 정상이다.
  const combo = (latestRaw?.combo_analysis as ApiComboAnalysis | null | undefined) ?? null;
  const recommendations = (latestRaw?.recommendations as ApiRecommendations | null | undefined) ?? null;

  // eGFR — 최신 연도에 혈청 크레아티닌이 "실제로" 측정된 경우에만 계산을 요청한다.
  // 체중이 함께 기록돼 있으면 약물 용량 참고용 CrCl 도 같이 받아온다.
  let egfr: ApiEgfrResponse | null = null;
  const checkup = (latestRaw?.checkup ?? {}) as Record<string, unknown>;
  const serumCr = Number(checkup.creatinine);
  const birthYear = Number(me?.birth_year);
  if (latest && Number.isFinite(serumCr) && serumCr > 0 && Number.isFinite(birthYear) && birthYear > 0) {
    const weight = Number(checkup.weight_kg);
    egfr = await healthApi
      .calculateEgfr({
        serum_cr: serumCr,
        age: latest.year - birthYear,
        sex: Number(me?.gender) === 2 ? 'F' : 'M',
        ...(Number.isFinite(weight) && weight > 0 ? { weight_kg: weight } : {}),
      })
      .catch(() => null);
  }

  // 시계열 하이라이트 — 기록 삭제 직후에는 캐시 무효화로 404 가 날 수 있어 재생성 후 재조회한다.
  let timeseries = await healthApi.getTimeseriesFull(userId).catch(() => null);
  if (!timeseries && reports.length >= 2) {
    await healthApi.refreshTimeseries().catch(() => undefined);
    timeseries = await healthApi.getTimeseriesFull(userId).catch(() => null);
  }
  const highlights = timeseries?.highlights ?? null;

  // 저장된 복약 정보 — 업로드한 HIRA 복약이력을 기록 화면에 표시한다.
  const medications = await healthApi.getMedications(userId).catch(() => [] as ApiMedicationItem[]);

  return { reports, latest, metricDefinitions, combo, recommendations, egfr, highlights, medications, hasData: reports.length > 0 };
}

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'dashboard', label: '대시보드' },
  { key: 'records', label: '검진결과 조회' },
  { key: 'history', label: '히스토리' },
  { key: 'analysis', label: '건강분석' },
  { key: 'upload', label: '결과지 업로드' },
];

const externalActions: Array<
  | { title: string; description: string; url: string; tab?: never }
  | { title: string; description: string; tab: TabKey; url?: never }
> = [
  {
    title: '검진기관 찾기',
    description: '국민건강보험공단에서 안내하는 검진기관/병원 찾기 메뉴로 이동합니다.',
    url: 'https://www.nhis.or.kr/nhis/index.do',
  },
  {
    title: '가까운 병원 찾기',
    description: '응급의료포털 E-Gen에서 주변 병원과 약국 정보를 확인합니다.',
    url: 'https://www.e-gen.or.kr/egen/main.do',
  },
  {
    title: '검진 전 준비 확인',
    description: '최근 검진 기록과 관리 참고 항목을 확인하고 상담 질문을 정리합니다.',
    tab: 'analysis' as TabKey,
  },
];

function currentValue(latest: Report | null, metric: MetricDefinition) {
  return latest?.values[metric.key] ?? 0;
}

function formatValue(value: number, unit: string) {
  return `${value}${unit}`;
}

function statusClass(status: Status) {
  if (status === '정상 기준 안') return 'text-[#3CB371]';
  if (status === '관리 참고') return 'text-[#FF8A3D]';
  return 'text-[#F44336]';
}

function isBadStatus(status: Status) {
  return status !== '정상 기준 안';
}

function metricAccentColor(metric: MetricDefinition) {
  if (metric.status === '추적 확인') return '#F44336';
  if (metric.status === '관리 참고') return '#F44336';
  return '#1A1A1A';
}

function StatusBadge({ status }: { status: Status }) {
  return <span className={`inline-flex w-fit items-center self-start justify-self-start whitespace-nowrap rounded-full bg-[#EFEFEF] px-3 py-1 text-[13px] font-semibold ${statusClass(status)}`}>{status}</span>;
}

function statusToLabel(status: string) {
  if (['extremely_high', 'very_high', 'extremely_low', 'very_low'].includes(status)) return '추적 확인';
  if (['high', 'low', 'caution'].includes(status)) return '관리 참고';
  return '정상 기준 안';
}

function birthDateFromProfile(profile: UserProfile) {
  const md = profile.birth_md ? String(profile.birth_md).padStart(4, '0') : '0101';
  return `${profile.birth_year}-${md.slice(0, 2)}-${md.slice(2, 4)}`;
}

function profileBirthFromDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return {
    birth_year: year || undefined,
    birth_md: month && day ? month * 100 + day : undefined,
  };
}

async function apiFetch(path: string, init?: RequestInit, json = true) {
  const token = await getAccessToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`${response.status} ${response.statusText}${detail ? ` - ${detail}` : ''}`);
  }

  return response.json();
}

function Header({
  activeTab,
  onTabChange,
  profile,
  onEditProfile,
  onOpenSettings,
  onReloadProfile,
  onLogout,
  onAuth,
  onDeleteAccount,
}: {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  profile: UserProfile;
  onEditProfile: () => void;
  onOpenSettings: () => void;
  onReloadProfile: () => void;
  onLogout: () => void;
  onAuth: () => void;
  onDeleteAccount: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('mousedown', closeOnOutside);
    return () => window.removeEventListener('mousedown', closeOnOutside);
  }, [menuOpen]);

  return (
    <header className="bg-white">
      <div className="border-b border-[#E5E5E5] bg-[#FFFFFF]">
        <div className="mx-auto flex h-9 max-w-[1280px] items-center px-6 text-[13px] text-[#5C5C5C]">
          건강검진 기록과 분석 결과를 한곳에서 확인합니다.
        </div>
      </div>

      <div className="border-b border-[#E5E5E5]">
        <div className="mx-auto flex h-[78px] max-w-[1280px] items-center justify-between px-6">
          <button type="button" className="flex items-center gap-3" onClick={() => onTabChange('dashboard')}>
            <Activity className="h-8 w-8 text-[#1A1A1A]" />
            <span className="text-left">
              <span className="block text-[11px] font-bold uppercase tracking-[0.16em] text-[#9A9A9A]">WITHUS</span>
              <span className="block text-[22px] font-extrabold leading-none tracking-[-0.03em] text-[#191919]">HealthAge</span>
            </span>
          </button>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              className="rounded-full border border-[#E5E5E5] bg-white px-4 py-2 text-[14px] font-semibold text-[#191919] hover:bg-[#F5F5F5]"
              onClick={() => setMenuOpen((current) => !current)}
            >
              {profile.name} 님
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-[46px] z-20 w-[220px] border border-[#E5E5E5] bg-white shadow-[0_10px_24px_rgba(29,43,58,0.12)]">
                <button
                  type="button"
                  className="block w-full px-4 py-3 text-left text-[15px] font-bold text-[#191919] hover:bg-[#F5F5F5]"
                  onClick={() => {
                    setMenuOpen(false);
                    onAuth();
                  }}
                >
                  로그인 / 회원가입
                </button>
                <button
                  type="button"
                  className="block w-full border-t border-[#E5E5E5] px-4 py-3 text-left text-[15px] font-bold text-[#191919] hover:bg-[#F5F5F5]"
                  onClick={() => {
                    setMenuOpen(false);
                    onEditProfile();
                  }}
                >
                  프로필 수정
                </button>
                <button
                  type="button"
                  className="block w-full border-t border-[#E5E5E5] px-4 py-3 text-left text-[15px] font-bold text-[#191919] hover:bg-[#F5F5F5]"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenSettings();
                  }}
                >
                  설정
                </button>
                <button
                  type="button"
                  className="block w-full border-t border-[#E5E5E5] px-4 py-3 text-left text-[15px] font-bold text-[#191919] hover:bg-[#F5F5F5]"
                  onClick={() => {
                    setMenuOpen(false);
                    onReloadProfile();
                  }}
                >
                  프로필 다시 불러오기
                </button>
                <button
                  type="button"
                  className="block w-full border-t border-[#E5E5E5] px-4 py-3 text-left text-[15px] font-bold text-[#F44336] hover:bg-[#EFEFEF]"
                  onClick={() => {
                    setMenuOpen(false);
                    onLogout();
                  }}
                >
                  로그아웃
                </button>
                <button
                  type="button"
                  className="block w-full border-t border-[#E5E5E5] px-4 py-3 text-left text-[15px] font-bold text-[#F44336] hover:bg-[#EFEFEF]"
                  onClick={() => {
                    setMenuOpen(false);
                    onDeleteAccount();
                  }}
                >
                  회원탈퇴
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <nav className="border-b border-[#E5E5E5]">
        <div className="mx-auto grid h-[58px] max-w-[1280px] grid-cols-5 px-6 text-center text-[17px] font-black text-[#191919]">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange(tab.key)}
              className={activeTab === tab.key ? 'border-b-4 border-[#1A1A1A] text-[#1A1A1A]' : 'hover:text-[#1A1A1A]'}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>
    </header>
  );
}

function Layout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto max-w-[920px] px-6 py-10">
      <section>{children}</section>
    </main>
  );
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#9A9A9A]">WITHUS · HEALTHAGE</p>
      <h1 className="mt-2 text-[32px] font-extrabold tracking-[-0.02em] text-[#191919]">{title}</h1>
      <p className="mt-2 text-[14px] leading-6 text-[#9A9A9A]">{subtitle}</p>
    </div>
  );
}

function DashboardView({ onTabChange }: { onTabChange: (tab: TabKey) => void }) {
  const { metricDefinitions, latest, reports, hasData } = useHealth();
  const counts = useMemo(
    () => ({
      normal: metricDefinitions.filter((metric) => metric.status === '정상 기준 안').length,
      caution: metricDefinitions.filter((metric) => metric.status === '관리 참고').length,
      follow: metricDefinitions.filter((metric) => metric.status === '추적 확인').length,
    }),
    [metricDefinitions],
  );
  const topItems = metricDefinitions.filter((metric) => metric.status !== '정상 기준 안').slice(0, 5);

  if (!hasData || !latest) {
    return (
      <>
        <PageHeader title="대시보드" subtitle="최근 검진 결과에서 먼저 확인할 항목만 요약합니다." />
        <EmptyBoard message="아직 저장된 검진 결과가 없습니다. '결과지 업로드'에서 결과지를 올리면 여기에 요약이 표시됩니다." onAction={() => onTabChange('upload')} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="대시보드" subtitle="최근 검진 결과에서 먼저 확인할 항목만 요약합니다." />
      <div className="mb-7 grid grid-cols-4 border border-[#E5E5E5] bg-white">
        <SummaryCell label="최근 검진일" value={latest.date} note={latest.hospital} />
        <SummaryCell label="검진 기록" value={`${reports.length}건`} note={`${reports[0].year}~${latest.year}`} />
        <SummaryCell label="참고 점수" value={`${latest.score}/100`} note="검진 수치 기반 참고 정보" />
        <SummaryCell label="관리·추적" value={`${counts.caution + counts.follow}건`} note={`정상 기준 안 ${counts.normal}건`} />
      </div>

      <div className="grid grid-cols-[1fr_320px] gap-7">
        <Board title="우선 확인 항목">
          <div className="divide-y divide-[#E5E5E5]">
            {topItems.map((metric) => (
              <button
                key={metric.key}
                type="button"
                onClick={() => onTabChange('analysis')}
                className="grid w-full grid-cols-[160px_1fr_110px] items-center gap-4 py-4 text-left"
              >
                <div className="font-black text-[#191919]">{metric.name}</div>
                <div className="text-[#5C5C5C]">
                  {formatValue(currentValue(latest, metric), metric.unit)} · 정상 기준 {metric.normalText}
                </div>
                <StatusBadge status={metric.status} />
              </button>
            ))}
          </div>
        </Board>
        <Board title="건강관리 바로가기">
          <div className="space-y-3">
            {externalActions.map((item) => (
              <ActionButton
                key={item.title}
                onClick={() => {
                  if (item.url) window.open(item.url, '_blank', 'noopener,noreferrer');
                  if (item.tab) onTabChange(item.tab);
                }}
              >
                <span className="block">{item.title}</span>
                <span className="mt-1 block text-sm font-normal leading-6 text-[#9A9A9A]">{item.description}</span>
              </ActionButton>
            ))}
          </div>
        </Board>
      </div>
    </>
  );
}

function RecordsView({ userId, onChanged }: { userId?: string; onChanged: () => void }) {
  const { reports, medications, hasData } = useHealth();
  const [yearFilter, setYearFilter] = useState('전체');
  const [deletingYear, setDeletingYear] = useState<number | null>(null);
  const filteredReports = yearFilter === '전체' ? reports : reports.filter((report) => String(report.year) === yearFilter);

  // 연도 기록 삭제 — 서버에서 검진·분석 결과를 지우고 화면을 다시 불러온다.
  const deleteYear = async (year: number) => {
    if (!userId) return;
    if (!window.confirm(`${year}년 검진 기록을 삭제할까요?\n삭제하면 되돌릴 수 없습니다.`)) return;
    setDeletingYear(year);
    try {
      await healthApi.deleteReport(userId, year);
      onChanged();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '삭제에 실패했습니다.');
    } finally {
      setDeletingYear(null);
    }
  };

  if (!hasData) {
    return (
      <>
        <PageHeader title="검진결과 조회" subtitle="검진기록과 결과조회 기능을 하나로 합쳐 연도별 결과와 상세 항목을 확인합니다." />
        <EmptyBoard message="아직 저장된 검진 기록이 없습니다. '결과지 업로드'에서 결과지를 올려주세요." />
        {medications.length > 0 && <MedicationBoard medications={medications} />}
      </>
    );
  }

  return (
    <>
      <PageHeader title="검진결과 조회" subtitle="검진기록과 결과조회 기능을 하나로 합쳐 연도별 결과와 상세 항목을 확인합니다." />
      <SearchBox>
        <label className="font-black text-[#191919]">검진연도</label>
        <select className="h-10 border border-[#E5E5E5] bg-white px-3" value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
          <option>전체</option>
          {reports.map((report) => (
            <option key={report.year}>{report.year}</option>
          ))}
        </select>
        <span className="text-sm text-[#9A9A9A]">선택한 연도의 기록만 아래 표에 표시됩니다.</span>
      </SearchBox>

      <Board title="검진기록 목록">
        <ResultTable data={filteredReports} deletingYear={deletingYear} onDelete={userId ? deleteYear : undefined} />
      </Board>

      <Board title="최근 검진 상세 항목">
        <MetricTable />
      </Board>

      {medications.length > 0 && <MedicationBoard medications={medications} />}
    </>
  );
}

/** 저장된 복약 정보 — 업로드한 HIRA 복약이력을 표로 보여준다(모바일 기록 화면 복약 탭과 동일 데이터). */
function MedicationBoard({ medications }: { medications: ApiMedicationItem[] }) {
  return (
    <Board title="저장된 복약 정보">
      <p className="mb-3 text-[15px] leading-7 text-[#5C5C5C]">
        '내가 먹는 약! 한눈에'에서 업로드한 복약이력입니다. 분석 시 복용 약물이 자동 반영됩니다.
      </p>
      <table className="w-full border-collapse text-left text-[15px]">
        <thead className="bg-[#F5F5F5] text-[#191919]">
          <tr>
            <Th>조제일</Th>
            <Th>약품명</Th>
            <Th>효능 분류</Th>
            <Th>투약일수</Th>
          </tr>
        </thead>
        <tbody>
          {medications.map((item, index) => (
            <tr key={index}>
              <Td>{item.dispensed_date ?? '-'}</Td>
              <Td strong>{item.product_name ?? '-'}</Td>
              <Td>{item.efficacy_class ?? '-'}</Td>
              <Td>{item.total_days != null ? `${item.total_days}일` : '-'}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </Board>
  );
}

function HistoryView() {
  const { metricDefinitions, reports, highlights, hasData } = useHealth();
  const chartGroups = [
    { title: '혈압 변화', keys: ['sbp', 'dbp'] as MetricKey[] },
    { title: '혈당·체중 변화', keys: ['glucose', 'bmi', 'waist'] as MetricKey[] },
    { title: '지질 변화', keys: ['ldl', 'hdl', 'triglyceride'] as MetricKey[] },
    { title: '간 기능 변화', keys: ['ast', 'alt', 'ggt'] as MetricKey[] },
    { title: '혈액·신장 변화', keys: ['hemoglobin', 'creatinine'] as MetricKey[] },
  ];

  if (!hasData) {
    return (
      <>
        <PageHeader title="히스토리" subtitle="검진 항목별 연도 변화와 항목 설명을 함께 확인합니다." />
        <EmptyBoard message="히스토리를 그리려면 검진 기록이 필요합니다. '결과지 업로드'에서 결과지를 올려주세요." />
      </>
    );
  }

  return (
    <>
      <PageHeader title="히스토리" subtitle="검진 항목별 연도 변화와 항목 설명을 함께 확인합니다." />
      <Notice>수치 변화는 생활습관, 복용 약, 검사 당시 상태에 따라 달라질 수 있습니다. 같은 항목이 반복해서 기준을 벗어나면 의료진과 상담해 보세요.</Notice>
      {/* 시계열 하이라이트 — 백엔드가 여러 해 기록을 비교해 실제로 생성한 주목 변화만 보여준다(2년 이상일 때) */}
      {Boolean(highlights?.length) && (
        <div className="mt-7">
          <Board title="주목할 변화">
            <div className="divide-y divide-[#E5E5E5]">
              {highlights!.map((item, index) => (
                <p key={index} className="flex items-start gap-3 py-2.5 text-[15px] leading-7">
                  <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.severity === 'high' ? 'bg-[#F44336]' : item.severity === 'medium' ? 'bg-[#FF8A3D]' : 'bg-[#3CB371]'}`} />
                  <span className="text-[#191919]"><span className="font-black">{item.metric}</span> · {item.message}</span>
                </p>
              ))}
            </div>
          </Board>
        </div>
      )}
      <div className="mt-7 grid grid-cols-2 gap-7">
        {chartGroups.map((group) => {
          const hasBadMetric = group.keys.some((key) => isBadStatus(metricByKey(metricDefinitions, key).status));
          return (
            <Board key={group.title} title={group.title} tone={hasBadMetric ? 'attention' : 'default'}>
              {hasBadMetric && <p className="mb-3 text-sm font-bold text-[#F44336]">관리 참고 항목이 포함된 그래프입니다.</p>}
              <ChartBox height={260}>
                <LineChart data={historyRows(reports, metricDefinitions, group.keys)}>
                  <CartesianGrid stroke="#E5E5E5" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="year" tick={{ fill: '#5C5C5C', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#5C5C5C', fontSize: 12 }} />
                  <Tooltip />
                  {group.keys.map((key, index) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={metricByKey(metricDefinitions, key).shortName}
                      stroke={lineColors[index % lineColors.length]}
                      strokeWidth={3}
                      dot={{ r: 3 }}
                    />
                  ))}
                </LineChart>
              </ChartBox>
              <ChartLegend keys={group.keys} />
            </Board>
          );
        })}
      </div>

      <Board title="항목별 쉬운 설명">
        <div className="grid grid-cols-2 gap-x-8 divide-y divide-[#E5E5E5]">
          {metricDefinitions.map((metric) => (
            <div key={metric.key} className="py-4">
              <p className="font-black text-[#191919]">{metric.name}</p>
              <p className="mt-1 text-[15px] leading-7 text-[#5C5C5C]">{metric.description}</p>
            </div>
          ))}
        </div>
      </Board>
    </>
  );
}

function AnalysisView() {
  const { metricDefinitions, latest, hasData } = useHealth();
  const groups = useMemo(() => computeGroups(metricDefinitions), [metricDefinitions]);
  const [selectedGroupName, setSelectedGroupName] = useState(groups[0]?.name ?? '');
  const selectedGroup = groups.find((group) => group.name === selectedGroupName) ?? groups[0];
  const selectedMetrics = selectedGroup.keys.map((key) => metricByKey(metricDefinitions, key));

  if (!hasData || !latest) {
    return (
      <>
        <PageHeader title="건강분석" subtitle="검사항목별 내 수치, 정상 기준, 연령대 평균을 한 줄에서 비교합니다." />
        <EmptyBoard message="건강분석을 하려면 검진 기록이 필요합니다. '결과지 업로드'에서 결과지를 올려주세요." />
      </>
    );
  }

  return (
    <>
      <PageHeader title="건강분석" subtitle="검사항목별 내 수치, 정상 기준, 연령대 평균을 한 줄에서 비교합니다." />
      <Notice>이 화면은 건강검진 수치를 이해하기 위한 참고 정보입니다. 질병을 진단하거나 치료 판단을 대체하지 않습니다.</Notice>

      <div className="mt-7 grid grid-cols-[1fr_320px] gap-7">
        <Board title="나의 가까운 관리 참고군">
          <div className="mb-4 border-b border-[#E5E5E5] pb-4">
            <p className="text-[25px] font-black text-[#191919]">{selectedGroup.name}</p>
            <p className="mt-2 text-[#5C5C5C]">{selectedGroup.description}</p>
            <p className="mt-2 text-[15px] leading-7 text-[#5C5C5C]">{selectedGroup.meaning}</p>
            <p className="mt-1 text-[15px] leading-7 text-[#9A9A9A]">관련해서 볼 수 있는 항목: {selectedGroup.related}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {groups.map((group) => (
              <button
                key={group.name}
                type="button"
                onClick={() => setSelectedGroupName(group.name)}
                className={`border px-4 py-3 text-left hover:bg-[#F5F5F5] ${
                  selectedGroup.name === group.name ? 'border-[#1A1A1A] bg-[#F5F5F5]' : 'border-[#E5E5E5]'
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="font-black text-[#191919]">{group.name}</span>
                  <span className="font-black text-[#1A1A1A]">{group.matches}개 해당</span>
                </div>
                <p className="mt-1 text-sm text-[#5C5C5C]">{group.meaning}</p>
                <p className="mt-1 text-sm text-[#9A9A9A]">해당 항목: {group.metrics.join(', ') || '현재 뚜렷한 해당 항목 없음'}</p>
              </button>
            ))}
          </div>
        </Board>

        <Board title="점수 기준">
          <p className="text-[48px] font-black tracking-[-0.05em] text-[#191919]">{latest.score}<span className="text-[22px] text-[#9A9A9A]">/100</span></p>
          <div className="mt-3 space-y-2 leading-7 text-[#5C5C5C]">
            <p>검진 수치가 정상 기준에서 얼마나 벗어났는지, 관리 참고 항목이 몇 개인지 함께 반영한 참고 점수입니다.</p>
            <p>질환 여부를 판단하는 점수가 아니라, 어떤 항목을 먼저 살펴볼지 정리하기 위한 값입니다.</p>
            <ul className="list-disc pl-5 text-[15px]">
              <li>정상 기준 안: 감점 없음</li>
              <li>관리 참고: 항목당 6점 감점</li>
              <li>추적 확인: 항목당 12점 감점</li>
              <li>미측정 항목: 계산에서 제외</li>
            </ul>
          </div>
        </Board>
      </div>

      <Board title={`${selectedGroup.name} 관련 검사항목 비교`}>
        <p className="mb-4 text-[15px] leading-7 text-[#5C5C5C]">
          선택한 참고군을 이해하는 데 필요한 검사 항목만 모았습니다. 같은 항목이라도 증상, 복용 약, 과거력에 따라 해석이 달라질 수 있습니다.
        </p>
        <div className="divide-y divide-[#E5E5E5]">
          {selectedMetrics.map((metric) => (
            <MetricComparisonRow key={metric.key} metric={metric} />
          ))}
        </div>
      </Board>

      <BackendAnalysisBoards />
    </>
  );
}

// 구간(level/severity) → 상태 글자색. 백엔드 해석 문구는 그대로 쓰고 색만 구간에 맞춘다.
function levelTextClass(level: string) {
  if (level === 'low' || level === 'normal') return 'text-[#3CB371]';
  if (level === 'high' || level === 'danger' || level === 'very_high') return 'text-[#F44336]';
  return 'text-[#FF8A3D]';
}

/** 도메인 섹션 헤더 — 분석 카드를 신장/간/대사·지질/심혈관 등 도메인으로 묶어 읽히게 한다.
 *  카드를 부수지 않고 헤더만 얹는 가벼운 그룹핑. 해당 도메인 카드가 없으면 헤더도 그리지 않는다. */
function DomainHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="mb-1 mt-4 flex items-center gap-2 px-1 first:mt-0">
      <span className="text-[17px]">{icon}</span>
      <h3 className="text-[15px] font-black tracking-[-0.02em] text-[#191919]">{title}</h3>
    </div>
  );
}

/** 백엔드 분석 모듈 카드 모음 — 모바일 분석 탭과 동일 항목(eGFR·CrCl, 조합그룹, 지방간 유형,
 *  FLI/HSI, 집단군 판정 13, ASCVD 참고 시뮬, 맞춤 권장사항). 데이터가 없으면 카드 자체를 그리지 않는다.
 *  도메인(신장/간/대사·지질/심혈관/통계참고)별 섹션 헤더로 묶어 배치한다. */
function BackendAnalysisBoards() {
  const { combo, egfr, recommendations } = useHealth();
  const comboGroups = combo?.combo_groups ?? null;
  const fattyLiver = combo?.fatty_liver ?? null;
  const flIndices = fattyLiver?.indices ?? null;
  const singleGroups = combo?.single_groups ?? null;
  const ascvd = combo?.ascvd_simulation ?? null;
  const calculators = combo?.calculators ?? null;
  const recs = recommendations?.recommendations;

  return (
    <>
      {/* 🩺 신장 — eGFR·CrCl */}
      {egfr && <DomainHeader icon="🩺" title="신장 기능" />}
      {/* 신장 기능(eGFR) — 그 해 혈청 크레아티닌이 실제로 측정된 경우에만 백엔드 계산 결과를 보여준다 */}
      {egfr && (
        <Board title="신장 기능 (eGFR)">
          <p className="mb-3 text-[15px] leading-7 text-[#5C5C5C]">혈청 크레아티닌 수치를 바탕으로 추정한 신장 여과 기능입니다.</p>
          <p className="flex items-baseline gap-2">
            <span className="text-[34px] font-black tracking-[-0.03em] text-[#191919]">{egfr.egfr}</span>
            <span className="text-[14px] text-[#9A9A9A]">{egfr.unit}</span>
            <span className={`rounded-full bg-[#EFEFEF] px-3 py-1 text-[13px] font-semibold ${levelTextClass(egfr.severity)}`}>{egfr.stage} · {egfr.label}</span>
          </p>
          <p className="mt-2 text-[15px] leading-7 text-[#5C5C5C]">{egfr.description}</p>
          {/* CrCl — 그 해 검진에 체중이 기록된 경우에만 함께 계산된다(약물 용량 참고용) */}
          {egfr.crcl != null && (
            <div className="mt-4 border-t border-[#E5E5E5] pt-4">
              <p className="font-black text-[#191919]">약물 용량 참고 (CrCl)</p>
              <p className="mt-1 flex items-baseline gap-2">
                <span className="text-[22px] font-black text-[#191919]">{egfr.crcl}</span>
                <span className="text-[13px] text-[#9A9A9A]">mL/min · {egfr.crcl_method ?? 'Cockcroft-Gault'}</span>
                {egfr.crcl_label && <span className="rounded-full bg-[#EFEFEF] px-3 py-1 text-[12px] font-semibold text-[#5C5C5C]">{egfr.crcl_label}</span>}
              </p>
              {egfr.crcl_note && <p className="mt-1 text-[14px] leading-6 text-[#9A9A9A]">{egfr.crcl_note}</p>}
            </div>
          )}
        </Board>
      )}

      {/* 🫁 간 — FLI/HSI 보조지표 */}
      {flIndices && (flIndices.fli || flIndices.hsi) && <DomainHeader icon="🫁" title="간" />}
      {/* 지방간 보조지표(FLI·HSI) — 값·구간·해석 문구 전부 백엔드가 만들어 보내준 것을 그대로 보여준다 */}
      {flIndices && (flIndices.fli || flIndices.hsi) && (
        <Board title="지방간 보조지표">
          <p className="mb-3 text-[15px] leading-7 text-[#5C5C5C]">검진 수치만으로 지방간 가능성을 가늠해 보는 선별용 지표입니다.</p>
          <div className="divide-y divide-[#E5E5E5]">
            {([
              { title: 'FLI', idx: flIndices.fli },
              { title: 'HSI', idx: flIndices.hsi },
            ] as const).filter((row) => row.idx).map((row) => (
              <div key={row.title} className="py-3">
                <p className="flex items-center justify-between gap-3">
                  <span className="flex items-baseline gap-2">
                    <span className="font-black text-[#191919]">{row.title}</span>
                    {row.idx!.formula && <span className="text-[12px] text-[#9A9A9A]">{row.idx!.formula}</span>}
                  </span>
                  <span className={`rounded-full bg-[#EFEFEF] px-3 py-1 text-[12px] font-semibold ${levelTextClass(row.idx!.level)}`}>{row.idx!.interpretation}</span>
                </p>
                <p className="mt-1 text-[24px] font-black text-[#191919]">{row.idx!.value}</p>
                {row.idx!.cutoffs && <p className="mt-0.5 text-[12px] text-[#9A9A9A]">기준: {row.idx!.cutoffs}</p>}
              </div>
            ))}
          </div>
          {Boolean(flIndices.unavailable?.length) && (
            <p className="mt-2 text-[12px] leading-6 text-[#9A9A9A]">· 계산 불가: {flIndices.unavailable.join(' / ')}</p>
          )}
          {flIndices.disclaimer && <p className="mt-3 text-[12px] leading-6 text-[#9A9A9A]">{flIndices.disclaimer}</p>}
        </Board>
      )}

      {/* ⚖️ 대사·지질 — 검증된 수치 계산기 */}
      {calculators && (calculators.tyg || calculators.non_hdl_c || calculators.bard) && <DomainHeader icon="⚖️" title="대사·지질" />}
      {/* 수치 계산기(TyG·Non-HDL-C·BARD) — 검진 수치로 산출하는 검증된 정량 지표. 값·구간·해석 전부 백엔드가 만들어 보내준다 */}
      {calculators && (calculators.tyg || calculators.non_hdl_c || calculators.bard) && (
        <Board title="대사·지질·간 계산기">
          <p className="mb-3 text-[15px] leading-7 text-[#5C5C5C]">검진 기본검사 수치만으로 산출하는 검증된 참고 지표입니다.</p>
          <div className="divide-y divide-[#E5E5E5]">
            {([
              { title: 'TyG 지수', sub: '인슐린저항성', idx: calculators.tyg },
              { title: 'Non-HDL 콜레스테롤', sub: '죽상형성 지단백', idx: calculators.non_hdl_c },
              { title: 'BARD 점수', sub: '간섬유화 배제', idx: calculators.bard },
            ] as const).filter((row) => row.idx).map((row) => (
              <div key={row.title} className="py-3">
                <p className="flex items-center justify-between gap-3">
                  <span className="flex items-baseline gap-2">
                    <span className="font-black text-[#191919]">{row.title}</span>
                    <span className="text-[12px] text-[#9A9A9A]">{row.sub}</span>
                  </span>
                  <span className={`rounded-full bg-[#EFEFEF] px-3 py-1 text-[12px] font-semibold ${levelTextClass(row.idx!.level)}`}>{row.idx!.interpretation}</span>
                </p>
                <p className="mt-1 text-[24px] font-black text-[#191919]">{row.idx!.value}</p>
                {row.idx!.formula && <p className="mt-0.5 text-[12px] text-[#9A9A9A]">{row.idx!.formula}</p>}
                {row.idx!.cutoffs && <p className="mt-0.5 text-[12px] text-[#9A9A9A]">기준: {row.idx!.cutoffs}</p>}
                {row.idx!.note && <p className="mt-0.5 text-[12px] text-[#9A9A9A]">{row.idx!.note}</p>}
              </div>
            ))}
          </div>
          {Boolean(calculators.unavailable?.length) && (
            <p className="mt-2 text-[12px] leading-6 text-[#9A9A9A]">· 계산 불가: {calculators.unavailable.join(' / ')}</p>
          )}
          {calculators.disclaimer && <p className="mt-3 text-[12px] leading-6 text-[#9A9A9A]">{calculators.disclaimer}</p>}
        </Board>
      )}

      {/* 📊 함께 나타나는 패턴 · 집단군 (통계 참고) — 위험 정량이 아닌 동반·판정 통계 묶음 */}
      {((comboGroups && comboGroups.matched_count > 0) || Boolean(singleGroups?.length)) && (
        <DomainHeader icon="📊" title="함께 나타나는 패턴 · 집단군 (통계 참고)" />
      )}
      {/* 함께 나타나는 조합(조합 그룹) — 공단 표본 기준 '동반 경향(기술통계)'이며 위험도가 아니다.
          위험 정량 해석은 계산기(ASCVD 등)가 담당한다 — 여기서는 얼마나 자주 동반하는지만 보여준다 */}
      {comboGroups && comboGroups.matched_count > 0 && (
        <Board title="함께 나타나는 조합 (동반 경향)">
          <p className="mb-3 text-[15px] leading-7 text-[#5C5C5C]">
            여러 요인이 함께 나타나는 조합입니다. 같은 조합인 분들이 국민건강보험공단 표본
            {comboGroups.population.total_n ? ` ${(comboGroups.population.total_n / 10000).toFixed(0)}만명` : ''} 중 얼마나 되는지 비교한 <span className="font-bold">동반 경향(통계)</span>이며, 위험도 자체는 아니에요. 위험 정량은 위 계산기(ASCVD 등)를 참고하세요.
          </p>
          <div className="divide-y divide-[#E5E5E5]">
            {comboGroups.matched.slice(0, 4).map((c) => (
              <div key={c.combo_name} className="py-3">
                <p className="flex items-center gap-2">
                  <span className="font-black text-[#191919]">{c.combo_name}</span>
                  {c.is_ascvd_risk && <span className="rounded-full bg-[#EFEFEF] px-3 py-1 text-[12px] font-semibold text-[#9A9A9A]">심혈관 지표 참고</span>}
                </p>
                <p className="mt-1 text-[14px] leading-6 text-[#5C5C5C]">{c.meaning}</p>
                {c.population && (
                  <p className="mt-1 text-[13px] leading-6 text-[#9A9A9A]">
                    같은 조합 {c.population.n_in_combo.toLocaleString()}명 (표본의 {c.population.pct_of_total}%)
                    {c.population.observed_to_expected >= 1.2 && (
                      <span className="font-black text-[#FF8A3D]"> · 따로 나타날 때보다 {c.population.observed_to_expected}배 자주 동반</span>
                    )}
                  </p>
                )}
              </div>
            ))}
          </div>
          {comboGroups.matched.length > 4 && (
            <p className="mt-2 text-[13px] text-[#9A9A9A]">외 {comboGroups.matched.length - 4}개 조합에 더 해당합니다.</p>
          )}
          {/* 지방간 유형 — 음주량이 없으면 잠정 분류임을 반드시 밝힌다 */}
          {fattyLiver?.applicable && fattyLiver.type && (
            <div className="mt-4 border-t border-[#E5E5E5] pt-4">
              <p className="font-black text-[#191919]">지방간 유형 {fattyLiver.provisional ? '(잠정)' : ''}</p>
              <p className="mt-1 text-[15px] leading-7 text-[#5C5C5C]">{fattyLiver.type}</p>
              <p className="mt-1 text-[13px] leading-6 text-[#9A9A9A]">{fattyLiver.basis}</p>
              {fattyLiver.note && <p className="mt-1 text-[13px] leading-6 text-[#9A9A9A]">{fattyLiver.note}</p>}
            </div>
          )}
          {/* 해석의 한계 — 숨기지 않고 그대로 노출한다 */}
          {Boolean(comboGroups.caveats?.length) && (
            <div className="mt-4 border-t border-[#E5E5E5] pt-3">
              {comboGroups.caveats.map((caveat, index) => (
                <p key={index} className="text-[12px] leading-6 text-[#9A9A9A]">· {caveat}</p>
              ))}
            </div>
          )}
        </Board>
      )}

      {/* 집단군 판정(13개) — 판정 불가(그 해 입력값 없음)한 그룹은 지어내지 않고 '판정 불가'로 표시한다 */}
      {Boolean(singleGroups?.length) && (
        <Board title="집단군 판정">
          <p className="mb-2 text-[15px] leading-7 text-[#5C5C5C]">검진 수치와 복용 약물을 함께 반영해 판정한 결과입니다.</p>
          {(['임상', '생활습관'] as const).map((category) => {
            const rows = singleGroups!.filter((group) => group.category === category);
            if (!rows.length) return null;
            return (
              <div key={category} className="mt-3">
                <p className="mb-1 text-[13px] font-black text-[#9A9A9A]">{category}</p>
                <div className="divide-y divide-[#E5E5E5]">
                  {rows.map((group) => (
                    <div key={group.key} className="flex items-center justify-between gap-4 py-2.5">
                      <div>
                        <p className="font-bold text-[#191919]">{group.name}</p>
                        {group.desc && <p className="mt-0.5 text-[12px] leading-5 text-[#9A9A9A]">{group.desc}</p>}
                      </div>
                      <span
                        className={`shrink-0 rounded-full bg-[#EFEFEF] px-3 py-1 text-[12px] font-semibold ${
                          group.applies == null ? 'text-[#9A9A9A]' : group.applies ? 'text-[#F44336]' : 'text-[#3CB371]'
                        }`}
                      >
                        {group.applies == null ? '판정 불가' : group.applies ? '해당' : '비해당'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </Board>
      )}

      {/* 🫀 심혈관 — ASCVD 위험 계산기 */}
      {ascvd?.available && ascvd.risk_percent != null && <DomainHeader icon="🫀" title="심혈관" />}
      {/* ASCVD 10년 위험도 — 참고용 시뮬레이션(한국인 미검증, 진단 아님). 계산 불가면 카드를 그리지 않는다 */}
      {ascvd?.available && ascvd.risk_percent != null && (
        <Board title="심혈관 위험 참고 시뮬레이션">
          <p className="mb-3 text-[15px] leading-7 text-[#5C5C5C]">10년 내 죽상경화성 심혈관질환(ASCVD) 위험을 가늠해 보는 참고용 계산입니다.</p>
          <p className="flex items-baseline gap-2">
            <span className="text-[34px] font-black tracking-[-0.03em] text-[#191919]">{ascvd.risk_percent}%</span>
            {ascvd.risk_label && (
              <span className={`rounded-full bg-[#EFEFEF] px-3 py-1 text-[13px] font-semibold ${
                ascvd.risk_level === 'low' ? 'text-[#3CB371]' : ascvd.risk_level === 'high' ? 'text-[#F44336]' : 'text-[#FF8A3D]'
              }`}>{ascvd.risk_label}</span>
            )}
          </p>
          {ascvd.how_to_read && <p className="mt-2 text-[14px] leading-6 text-[#5C5C5C]">{ascvd.how_to_read}</p>}
          {Boolean(ascvd.scenarios?.length) && (
            <div className="mt-3 divide-y divide-[#E5E5E5] border-t border-[#E5E5E5]">
              {ascvd.scenarios!.map((scenario) => (
                <p key={scenario.name} className="flex items-center justify-between py-2.5 text-[14px]">
                  <span className="text-[#191919]">{scenario.name}</span>
                  <span className="font-black text-[#191919]">
                    {scenario.risk_percent}%{' '}
                    <span className={`text-[13px] ${scenario.delta < 0 ? 'text-[#3CB371]' : 'text-[#9A9A9A]'}`}>
                      ({scenario.delta > 0 ? '+' : ''}{scenario.delta}%p)
                    </span>
                  </span>
                </p>
              ))}
            </div>
          )}
          {Boolean(ascvd.limitations?.length) && (
            <div className="mt-3 border-t border-[#E5E5E5] pt-3">
              {ascvd.limitations!.map((limitation, index) => (
                <p key={index} className="text-[12px] leading-6 text-[#9A9A9A]">· {limitation}</p>
              ))}
            </div>
          )}
        </Board>
      )}

      {/* 맞춤 권장사항 — 백엔드가 최신 분석 결과로 실제 생성해 보내준 문구만 그대로 보여준다 */}
      {recommendations && (recommendations.priority_messages?.length || recs) && (
        <Board title="맞춤 권장사항">
          <p className="mb-3 text-[15px] leading-7 text-[#5C5C5C]">내 검진 결과를 바탕으로 분석 시스템이 안내하는 참고 정보입니다.</p>
          {Boolean(recommendations.priority_messages?.length) && (
            <div className="mb-4 space-y-1">
              {recommendations.priority_messages!.map((message, index) => (
                <p key={index} className="text-[15px] font-black leading-7 text-[#191919]">{message}</p>
              ))}
            </div>
          )}
          {recs?.common?.map((item, index) => (
            <div key={`common-${index}`} className="mb-3">
              <p className="font-black text-[#191919]">{item.category}</p>
              {item.items?.map((line, lineIndex) => (
                <p key={lineIndex} className="text-[14px] leading-6 text-[#5C5C5C]">· {line}</p>
              ))}
            </div>
          ))}
          {recs?.metabolic_factors?.map((item, index) => (
            <div key={`mf-${index}`} className="mb-3 border-t border-[#E5E5E5] pt-3">
              <p className="font-black text-[#191919]">{item.title}{item.target ? ` · 목표 ${item.target}` : ''}</p>
              {item.details?.map((line, lineIndex) => (
                <p key={lineIndex} className="text-[14px] leading-6 text-[#5C5C5C]">· {line}</p>
              ))}
              {item.by_medication && item.reason && <p className="mt-1 text-[12px] text-[#9A9A9A]">※ {item.reason}</p>}
            </div>
          ))}
          {recs?.group_specific?.map((item, index) => (
            <div key={`gs-${index}`} className="mb-3 border-t border-[#E5E5E5] pt-3">
              <p className="font-black text-[#191919]">{item.title}</p>
              {item.details?.map((line, lineIndex) => (
                <p key={lineIndex} className="text-[14px] leading-6 text-[#5C5C5C]">· {line}</p>
              ))}
            </div>
          ))}
          {Boolean(recs?.medication_notes?.length) && (
            <div className="mb-3 border-t border-[#E5E5E5] pt-3">
              <p className="font-black text-[#191919]">복용 약 관련 안내</p>
              {recs!.medication_notes!.map((item, index) => (
                <p key={index} className="text-[14px] leading-6 text-[#5C5C5C]">· [{item.medication}] {item.note}</p>
              ))}
            </div>
          )}
          {Boolean(recs?.elderly_notes?.length) && (
            <div className="border-t border-[#E5E5E5] pt-3">
              <p className="font-black text-[#191919]">고령 기준 추가 안내</p>
              {recs!.elderly_notes!.map((item, index) => (
                <p key={index} className="text-[14px] leading-6 text-[#5C5C5C]">· {typeof item === 'string' ? item : item.note ?? item.title ?? ''}</p>
              ))}
            </div>
          )}
          {recommendations._meta?.disclaimer && (
            <p className="mt-3 text-[12px] leading-6 text-[#9A9A9A]">{recommendations._meta.disclaimer}</p>
          )}
        </Board>
      )}
    </>
  );
}

// 실제 OCR(POST /uploads) 응답 → 검수 필드. 백엔드 키 변형을 관대하게 읽는다.
function ocrRawToFields(raw: unknown): OcrField[] {
  const root = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const checkup = (root.checkup && typeof root.checkup === 'object' ? root.checkup : root) as Record<string, unknown>;
  const read = (...keys: string[]) => {
    for (const key of keys) {
      const value = checkup[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return String(value);
    }
    return '';
  };
  return [
    { id: 'exam_date', label: '검진일', value: read('exam_date', 'examDate', 'date'), required: true, confidence: 0.9, section: '기본 정보' },
    { id: 'hospital', label: '검진기관', value: read('hospital', 'institution', 'organization'), required: true, confidence: 0.6, section: '기본 정보' },
    { id: 'height', label: '키', value: read('height_cm', 'height'), unit: 'cm', confidence: 0.9, section: '검사 수치' },
    { id: 'weight', label: '몸무게', value: read('weight_kg', 'weight'), unit: 'kg', confidence: 0.9, section: '검사 수치' },
    { id: 'waist', label: '허리둘레', value: read('waist_cm', 'waist'), unit: 'cm', confidence: 0.9, section: '검사 수치' },
    { id: 'sbp', label: '수축기 혈압', value: read('sbp', 'systolic_bp'), unit: 'mmHg', required: true, confidence: 0.9, section: '검사 수치' },
    { id: 'dbp', label: '이완기 혈압', value: read('dbp', 'diastolic_bp'), unit: 'mmHg', required: true, confidence: 0.9, section: '검사 수치' },
    { id: 'hb', label: '혈색소', value: read('hemoglobin', 'hb'), unit: 'g/dL', confidence: 0.9, section: '검사 수치' },
    { id: 'fbs', label: '공복혈당', value: read('fbs', 'fasting_glucose'), unit: 'mg/dL', required: true, confidence: 0.9, section: '검사 수치' },
    { id: 'total_cholesterol', label: '총콜레스테롤', value: read('total_cholesterol'), unit: 'mg/dL', confidence: 0.9, section: '검사 수치' },
    { id: 'hdl', label: 'HDL 콜레스테롤', value: read('hdl'), unit: 'mg/dL', confidence: 0.9, section: '검사 수치' },
    { id: 'tg', label: '중성지방', value: read('tg', 'triglyceride'), unit: 'mg/dL', confidence: 0.9, section: '검사 수치' },
    { id: 'ldl', label: 'LDL 콜레스테롤', value: read('ldl'), unit: 'mg/dL', confidence: 0.9, section: '검사 수치' },
    { id: 'creatinine', label: '혈청 크레아티닌', value: read('creatinine', 'serum_creatinine'), unit: 'mg/dL', confidence: 0.9, section: '검사 수치' },
    { id: 'urine_protein', label: '요단백', value: read('urine_protein'), confidence: 0.9, section: '검사 수치' },
    { id: 'ast', label: 'AST(SGOT)', value: read('ast'), unit: 'IU/L', confidence: 0.9, section: '검사 수치' },
    { id: 'alt', label: 'ALT(SGPT)', value: read('alt'), unit: 'IU/L', confidence: 0.9, section: '검사 수치' },
    { id: 'ggt', label: '감마-GTP', value: read('ggt', 'gamma_gtp'), unit: 'IU/L', confidence: 0.9, section: '검사 수치' },
  ];
}

function UploadView({ profile, onTabChange, onSaved, onSaveLifestyle }: { profile: UserProfile; onTabChange: (tab: TabKey) => void; onSaved: () => void; onSaveLifestyle: (lifestyle: Lifestyle) => void }) {
  const [uploadMode, setUploadMode] = useState<'checkup' | 'medication'>('checkup');
  const [uploadState, setUploadState] = useState<UploadState>({ loading: false, message: '', error: '', ocr: null, analysis: null, medication: null });
  const [ocrFields, setOcrFields] = useState<OcrField[]>([]);
  const [ocrRaw, setOcrRaw] = useState<unknown>(null);
  const [uploadedSource, setUploadedSource] = useState('');
  const [touchedSave, setTouchedSave] = useState(false);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  // 생활습관 — 프로필 저장값을 기본으로 보여주고, 여기서 고치면 저장 시 프로필도 함께 갱신한다(모바일 업로드 탭과 동일).
  const [lifestyle, setLifestyle] = useState<Lifestyle>({
    smoking: profile.smoking ?? null,
    drinking: profile.drinking ?? null,
    alcohol_weekly_g: profile.alcohol_weekly_g ?? 0,
  });
  const lifestyleTouched = useRef(false);
  const changeLifestyle = (next: Lifestyle) => {
    lifestyleTouched.current = true;
    setLifestyle(next);
  };

  const changeUploadMode = (mode: 'checkup' | 'medication') => {
    setUploadMode(mode);
    setUploadState({ loading: false, message: '', error: '', ocr: null, analysis: null, medication: null });
  };

  const uploadCheckup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploadedSource(file.name);
    setTouchedSave(false);
    setConfirmSaveOpen(false);
    setUploadState((current) => ({ ...current, loading: true, error: '', message: '결과지를 읽고 있습니다…', ocr: null, analysis: null }));
    try {
      const result = await healthApi.uploadFile(file);
      setOcrRaw(result.ocr);
      setOcrFields(ocrRawToFields(result.ocr));
      setUploadState((current) => ({
        ...current,
        loading: false,
        error: '',
        message: '사진에서 읽은 결과가 준비되었습니다. 검진표와 다른 값이 있으면 수정한 뒤 저장하세요.',
        ocr: result.ocr,
        analysis: null,
      }));
    } catch (error) {
      setUploadState((current) => ({
        ...current,
        loading: false,
        error: `OCR 인식에 실패했습니다. 아래 '예시 결과 불러오기'로도 진행할 수 있습니다. (${error instanceof Error ? error.message : '오류'})`,
      }));
    }
  };

  const runDummyCheckupOcr = (source: string) => {
    const dummyFields: OcrField[] = [
      { id: 'exam_date', label: '검진일', value: '', required: true, confidence: 0.94, section: '기본 정보' },
      { id: 'hospital', label: '검진기관', value: '', required: true, confidence: 0.42, section: '기본 정보' },
      { id: 'height', label: '키', value: '165.9', unit: 'cm', required: false, confidence: 0.95, section: '검사 수치' },
      { id: 'weight', label: '몸무게', value: '74.0', unit: 'kg', required: false, confidence: 0.95, section: '검사 수치' },
      { id: 'waist', label: '허리둘레', value: '86.0', unit: 'cm', required: false, confidence: 0.92, section: '검사 수치' },
      { id: 'sbp', label: '수축기 혈압', value: '135', unit: 'mmHg', required: true, confidence: 0.91, section: '검사 수치' },
      { id: 'dbp', label: '이완기 혈압', value: '117', unit: 'mmHg', required: true, confidence: 0.9, section: '검사 수치' },
      { id: 'hb', label: '혈색소', value: '15.9', unit: 'g/dL', required: false, confidence: 0.91, section: '검사 수치' },
      { id: 'fbs', label: '공복혈당', value: '94', unit: 'mg/dL', required: true, confidence: 0.86, section: '검사 수치' },
      { id: 'total_cholesterol', label: '총콜레스테롤', value: '비해당', unit: 'mg/dL', required: false, confidence: 0.89, section: '검사 수치' },
      { id: 'hdl', label: 'HDL 콜레스테롤', value: '비해당', unit: 'mg/dL', required: false, confidence: 0.89, section: '검사 수치' },
      { id: 'tg', label: '중성지방', value: '비해당', unit: 'mg/dL', required: false, confidence: 0.89, section: '검사 수치' },
      { id: 'ldl', label: 'LDL 콜레스테롤', value: '비해당', unit: 'mg/dL', required: false, confidence: 0.89, section: '검사 수치' },
      { id: 'creatinine', label: '혈청 크레아티닌', value: '0.9', unit: 'mg/dL', required: false, confidence: 0.84, section: '검사 수치' },
      { id: 'urine_protein', label: '요단백', value: '정상', required: false, confidence: 0.82, section: '검사 수치' },
      { id: 'ast', label: 'AST(SGOT)', value: '26', unit: 'IU/L', required: false, confidence: 0.9, section: '검사 수치' },
      { id: 'alt', label: 'ALT(SGPT)', value: '36', unit: 'IU/L', required: false, confidence: 0.9, section: '검사 수치' },
      { id: 'ggt', label: '감마-GTP', value: '35', unit: 'IU/L', required: false, confidence: 0.9, section: '검사 수치' },
    ];
    setUploadedSource(source);
    setTouchedSave(false);
    setConfirmSaveOpen(false);
    setOcrRaw(null);
    setOcrFields(dummyFields);
    setUploadState((current) => ({
      ...current,
      loading: false,
      error: '',
      message: '사진에서 읽은 결과가 준비되었습니다. 검진표와 다른 값이 있으면 수정한 뒤 저장하세요.',
      ocr: { source, fields: dummyFields },
      analysis: null,
    }));
  };

  const updateOcrField = (id: string, value: string) => {
    setOcrFields((current) => current.map((field) => (field.id === id ? { ...field, value } : field)));
  };

  const requiredMissing = ocrFields.filter((field) => field.required && !field.value.trim());
  // (목업 buildReviewedOcr 제거됨 — saveReviewedOcr 가 실 /analyze 페이로드를 직접 구성)

  const scrollToFirstMissing = () => {
    window.setTimeout(() => {
      document.querySelector('[data-ocr-missing="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 0);
  };

  const requestSaveReviewedOcr = () => {
    setTouchedSave(true);
    if (!ocrFields.length) {
      setUploadState((current) => ({ ...current, error: '먼저 건강검진 결과지를 촬영하거나 선택해주세요.' }));
      return;
    }
    if (requiredMissing.length) {
      setUploadState((current) => ({ ...current, error: '필수 항목이 비어 있습니다. 빨간색으로 표시된 항목을 채워주세요.' }));
      scrollToFirstMissing();
      return;
    }
    setUploadState((current) => ({ ...current, error: '' }));
    setConfirmSaveOpen(true);
  };

  const saveReviewedOcr = async () => {
    setConfirmSaveOpen(false);
    setUploadState((current) => ({ ...current, loading: true, error: '', message: '분석하고 저장하는 중입니다…' }));
    const pick = (id: string) => {
      const value = (ocrFields.find((field) => field.id === id)?.value ?? '').trim();
      if (!value || ['비해당', '해당없음', '미측정', '정상'].includes(value)) return undefined;
      return value;
    };
    const measurements = {
      height: pick('height'), weight: pick('weight'), waist: pick('waist'),
      sbp: pick('sbp'), dbp: pick('dbp'), fbs: pick('fbs'), hemoglobin: pick('hb'),
      total_cholesterol: pick('total_cholesterol'), ldl: pick('ldl'), hdl: pick('hdl'), tg: pick('tg'),
      ast: pick('ast'), alt: pick('alt'), ggt: pick('ggt'), creatinine: pick('creatinine'),
    };
    // 생활습관 — 입력된 값이 있으면 분석에 반영하고, 수정했다면 프로필에도 저장한다.
    const lifestylePayload =
      lifestyle.smoking || lifestyle.drinking
        ? {
            ...(lifestyle.smoking ? { smoking: lifestyle.smoking } : {}),
            ...(lifestyle.drinking ? { drinking: lifestyle.drinking } : {}),
            ...(lifestyle.drinking === 'yes' ? { alcohol_weekly_g: lifestyle.alcohol_weekly_g } : {}),
          }
        : null;
    const payload = {
      save: true,
      ...(profile.id ? { user_id: profile.id } : {}),
      ocr: {
        ...(ocrRaw && typeof ocrRaw === 'object' ? (ocrRaw as Record<string, unknown>) : {}),
        meta: {
          patient_name: profile.name,
          exam_date: pick('exam_date'),
          hospital: pick('hospital'),
          patient_gender: profile.gender === 1 ? 'M' : 'F',
        },
        measurements,
        ...(lifestylePayload ? { lifestyle: lifestylePayload } : {}),
      },
    };
    try {
      const result = await healthApi.analyzeOcr(payload);
      if (lifestyleTouched.current && lifestylePayload) onSaveLifestyle(lifestyle);
      setUploadState((current) => ({
        ...current,
        loading: false,
        error: '',
        message: '분석 결과가 저장되었습니다. 대시보드와 검진기록에서 확인할 수 있습니다.',
        analysis: result,
      }));
      onSaved();
    } catch (error) {
      setUploadState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : '분석 저장에 실패했습니다.',
      }));
    }
  };

  const uploadMedication = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadState((current) => ({ ...current, loading: true, error: '', message: '복약자료를 업로드하고 있습니다.', medication: null }));
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await apiFetch('/medication/upload', { method: 'POST', body: formData }, false);
      setUploadState((current) => ({ ...current, loading: false, message: '복약자료가 저장되었습니다.', medication: result }));
    } catch (error) {
      setUploadState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : '복약자료 업로드에 실패했습니다.' }));
    }
  };

  return (
    <>
      <PageHeader title="결과지 업로드" subtitle="업로드할 자료 종류를 먼저 선택한 뒤 내용을 확인하고 저장합니다." />
      <div className="mb-6 grid grid-cols-2 border border-[#E5E5E5] bg-white">
        <button
          type="button"
          className={`px-5 py-4 text-left ${uploadMode === 'checkup' ? 'bg-[#F5F5F5] text-[#1A1A1A]' : 'text-[#5C5C5C] hover:bg-[#F5F5F5]'}`}
          onClick={() => changeUploadMode('checkup')}
        >
          <span className="block text-[18px] font-black">건강검진 결과지</span>
          <span className="mt-1 block text-[14px] font-bold">검진표 사진을 확인하고 수치를 저장합니다.</span>
        </button>
        <button
          type="button"
          className={`border-l border-[#E5E5E5] px-5 py-4 text-left ${uploadMode === 'medication' ? 'bg-[#F5F5F5] text-[#1A1A1A]' : 'text-[#5C5C5C] hover:bg-[#F5F5F5]'}`}
          onClick={() => changeUploadMode('medication')}
        >
          <span className="block text-[18px] font-black">처방전·복약자료</span>
          <span className="mt-1 block text-[14px] font-bold">내가 먹는 약 자료 파일을 등록합니다.</span>
        </button>
      </div>

      {uploadMode === 'checkup' && (
        <Board title="건강검진 결과지 확인">
          <div className="grid grid-cols-2 gap-4">
            <label className="block cursor-pointer border border-[#1A1A1A] bg-[#F5F5F5] px-5 py-5 hover:bg-[#EFEFEF]">
              <span className="block text-[20px] font-black text-[#1A1A1A]">카메라로 촬영</span>
              <span className="mt-2 block text-[15px] leading-7 text-[#5C5C5C]">카메라로 결과지를 촬영한 뒤 읽힌 값을 확인합니다.</span>
              <span className="mt-4 inline-flex h-10 items-center bg-[#1A1A1A] px-4 text-sm font-black text-white">촬영하기</span>
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={uploadCheckup} />
            </label>
            <label className="block cursor-pointer border border-[#E5E5E5] bg-[#F5F5F5] px-5 py-5 hover:bg-[#F5F5F5]">
              <span className="block text-[20px] font-black text-[#191919]">갤러리에서 선택</span>
              <span className="mt-2 block text-[15px] leading-7 text-[#5C5C5C]">이미 저장된 건강검진 결과지 사진을 선택하는 흐름입니다.</span>
              <span className="mt-4 inline-flex h-10 items-center bg-[#191919] px-4 text-sm font-black text-white">사진 선택</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={uploadCheckup} />
            </label>
          </div>

          <button type="button" className="mt-4 h-11 border border-[#1A1A1A] px-5 font-black text-[#1A1A1A] hover:bg-[#F5F5F5]" onClick={() => runDummyCheckupOcr('sample-checkup-photo.jpg')}>
            예시 결과 불러오기
          </button>

          {ocrFields.length > 0 && (
            <div className="mt-6">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-[15px] text-[#5C5C5C]">
                {uploadedSource && <span className="font-bold text-[#191919]">선택한 파일: {uploadedSource}</span>}
                <span>확인 필요 {requiredMissing.length}개</span>
              </div>
              <div className="mb-5 border border-[#E5E5E5] bg-[#F5F5F5] px-4 py-3 text-[15px] leading-7 text-[#5C5C5C]">
                이름과 성별은 회원정보의 {profile.name} / {profile.gender === 1 ? '남성' : '여성'} 정보가 자동으로 적용됩니다.
              </div>

              {(['기본 정보', '검사 수치'] as OcrField['section'][]).map((section) => (
                <div key={section} className="mb-5 border border-[#E5E5E5]">
                  <div className="border-b border-[#E5E5E5] bg-[#F5F5F5] px-4 py-3 text-[17px] font-black text-[#191919]">{section}</div>
                  <div className="divide-y divide-[#E5E5E5]">
                    {ocrFields
                      .filter((field) => field.section === section)
                      .map((field) => {
                        const missing = touchedSave && field.required && !field.value.trim();
                        return (
                          <div
                            key={field.id}
                            data-ocr-missing={missing ? 'true' : undefined}
                            className={`grid grid-cols-[170px_1fr] items-center gap-4 px-4 py-3 ${missing ? 'bg-[#EFEFEF]' : ''}`}
                          >
                            <div>
                              <p className="font-black text-[#191919]">
                                {field.label}
                                {field.required && <span className="ml-1 text-[#F44336]">*</span>}
                              </p>
                              {missing && <p className="mt-1 text-xs font-bold text-[#F44336]">사진이나 검진표 확인 필요</p>}
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                className={`h-11 w-full border px-3 text-[15px] outline-none focus:border-[#1A1A1A] ${
                                  missing ? 'border-[#F44336] bg-white' : 'border-[#E5E5E5]'
                                }`}
                                value={field.value}
                                onChange={(event) => updateOcrField(field.id, event.target.value)}
                                placeholder={field.required ? '필수 입력' : '미측정 또는 직접 입력'}
                              />
                              {field.unit && <span className="w-[72px] text-sm font-bold text-[#9A9A9A]">{field.unit}</span>}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))}

              {/* 생활습관 문진 — 프로필 저장값 prefill. 여기서 고치면 저장 시 프로필도 함께 갱신된다. */}
              <div className="mb-5 border border-[#E5E5E5]">
                <div className="border-b border-[#E5E5E5] bg-[#F5F5F5] px-4 py-3 text-[17px] font-black text-[#191919]">생활습관 (분석에 반영)</div>
                <div className="px-4 py-4">
                  <p className="mb-3 text-[14px] leading-6 text-[#9A9A9A]">
                    프로필에 저장된 값이 자동으로 채워집니다. 바뀐 내용이 있으면 수정하세요 — 지방간 유형(MASLD 등) 판정에 사용됩니다.
                  </p>
                  <LifestyleFormWeb value={lifestyle} onChange={changeLifestyle} gender={profile.gender} />
                </div>
              </div>

              <div className="mb-3 border border-[#E5E5E5] bg-[#F5F5F5] px-4 py-3 text-[15px] leading-7 text-[#5C5C5C]">
                저장하기 전에 측정값과 검진기관, 검진일이 실제 검진표와 같은지 다시 한 번 확인해주세요.
              </div>
              <button type="button" className="h-12 w-full bg-[#1A1A1A] px-5 font-black text-white hover:bg-[#000000]" onClick={requestSaveReviewedOcr}>
                확인한 값 저장
              </button>
              {Boolean(uploadState.analysis) && (
                <button type="button" className="mt-3 h-12 w-full border border-[#1A1A1A] bg-white px-5 font-black text-[#1A1A1A] hover:bg-[#F5F5F5]" onClick={() => onTabChange('records')}>
                  검진기록에서 확인하기
                </button>
              )}
            </div>
          )}
        </Board>
      )}

      {uploadMode === 'medication' && (
        <Board title="내가 먹는 약! 한눈에 업로드">
          <UploadBox
            title="복약자료 파일 선택"
            description="내가 먹는 약! 한눈에에서 받은 xls/xlsx 파일을 업로드합니다."
            accept=".xls,.xlsx"
            onChange={uploadMedication}
          />
          <button
            type="button"
            className="mt-4 h-11 border border-[#1A1A1A] px-5 font-black text-[#1A1A1A] hover:bg-[#F5F5F5]"
            onClick={() => window.open('/hira-medication-guide.html', '_blank', 'noopener,noreferrer')}
          >
            자료 발급 방법 안내 보기
          </button>
        </Board>
      )}

      {(uploadState.message || uploadState.error) && (
        <div className={`mt-6 border px-5 py-4 text-[15px] ${uploadState.error ? 'border-[#F44336] bg-[#EFEFEF] text-[#F44336]' : 'border-[#E5E5E5] bg-[#F5F5F5] text-[#191919]'}`}>
          {uploadState.error || uploadState.message}
        </div>
      )}
      {confirmSaveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#000000]/45 px-4">
          <div className="w-full max-w-md border border-[#E5E5E5] bg-white p-6 shadow-[0_18px_48px_rgba(16,32,51,0.25)]">
            <h3 className="text-[24px] font-black text-[#191919]">이 값으로 저장할까요?</h3>
            <p className="mt-3 text-[15px] leading-7 text-[#5C5C5C]">
              저장 후에는 검진기록에서 확인할 수 있습니다. 검진일, 검진기관, 주요 측정값이 실제 검진표와 같은지 마지막으로 확인해주세요.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button type="button" className="h-11 border border-[#E5E5E5] bg-white font-black text-[#5C5C5C] hover:bg-[#F5F5F5]" onClick={() => setConfirmSaveOpen(false)}>
                다시 확인
              </button>
              <button type="button" className="h-11 bg-[#1A1A1A] font-black text-white hover:bg-[#000000]" onClick={saveReviewedOcr}>
                저장하기
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}

function SearchBox({ children }: { children: ReactNode }) {
  return (
    <div className="mb-7 border border-[#E5E5E5] bg-[#F5F5F5] p-5">
      <div className="grid grid-cols-[110px_200px_1fr] items-center gap-3 text-[15px]">{children}</div>
    </div>
  );
}

function ResultTable({ data, deletingYear, onDelete }: { data: Report[]; deletingYear?: number | null; onDelete?: (year: number) => void }) {
  return (
    <table className="w-full border-collapse text-left text-[15px]">
      <thead className="bg-[#F5F5F5] text-[#191919]">
        <tr>
          <Th>검진연도</Th>
          <Th>검진일</Th>
          <Th>검진기관</Th>
          <Th>상태</Th>
          <Th>검진결과 요약</Th>
          {onDelete && <Th>관리</Th>}
        </tr>
      </thead>
      <tbody>
        {[...data].reverse().map((report) => (
          <tr key={report.year}>
            <Td strong>{report.year}</Td>
            <Td>{report.date}</Td>
            <Td>{report.hospital}</Td>
            <Td><StatusBadge status={report.status} /></Td>
            <Td>{report.summary}</Td>
            {onDelete && (
              <Td>
                <button
                  type="button"
                  className="border border-[#E5E5E5] px-3 py-1.5 text-[13px] font-black text-[#F44336] hover:bg-[#F5F5F5] disabled:text-[#9A9A9A]"
                  disabled={deletingYear === report.year}
                  onClick={() => onDelete(report.year)}
                >
                  {deletingYear === report.year ? '삭제 중' : '삭제'}
                </button>
              </Td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MetricTable() {
  const { metricDefinitions, latest } = useHealth();
  return (
    <table className="w-full border-collapse text-left text-[15px]">
      <thead className="bg-[#F5F5F5] text-[#191919]">
        <tr>
          <Th>구분</Th>
          <Th>항목명</Th>
          <Th>내 수치</Th>
          <Th>정상 기준</Th>
          <Th>연령대 평균</Th>
          <Th>설명</Th>
          <Th>상태</Th>
        </tr>
      </thead>
      <tbody>
        {metricDefinitions.map((metric) => (
          <tr key={metric.key}>
            <Td>{metric.category}</Td>
            <Td strong>{metric.name}</Td>
            <Td>{formatValue(currentValue(latest, metric), metric.unit)}</Td>
            <Td>{metric.normalText}</Td>
            <Td>{metric.peerMean == null ? '평균 비교 제외' : formatValue(metric.peerMean, metric.unit)}</Td>
            <Td>{metric.description}</Td>
            <Td><StatusBadge status={metric.status} /></Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MetricComparisonRow({ metric }: { metric: MetricDefinition }) {
  const { latest } = useHealth();
  const mine = currentValue(latest, metric);
  const max = Math.max(mine, metric.normalValue, metric.peerMean ?? 0, 1);
  const bars = [
    { label: '내 수치', value: mine, text: formatValue(mine, metric.unit), color: metricAccentColor(metric) },
    { label: '정상 기준', value: metric.normalValue, text: metric.normalText, color: '#3CB371' },
    ...(metric.peerMean == null
      ? [{ label: '연령대 평균', value: 0, text: '평균 비교 제외', color: '#9A9A9A' }]
      : [{ label: '연령대 평균', value: metric.peerMean, text: formatValue(metric.peerMean, metric.unit), color: '#9A9A9A' }]),
  ];

  return (
    <div className="grid grid-cols-[170px_1fr_auto] items-start gap-5 py-5">
      <div>
        <p className="font-black text-[#191919]">{metric.name}</p>
        <p className="mt-1 text-sm text-[#9A9A9A]">{metric.description}</p>
      </div>
      <div className="space-y-2">
        {bars.map((bar) => (
          <div key={bar.label} className="grid grid-cols-[90px_1fr_120px] items-center gap-3">
            <span className="text-sm font-bold text-[#5C5C5C]">{bar.label}</span>
            <span className="h-2 bg-[#E5E5E5]">
              <span className="block h-2" style={{ width: `${bar.value ? Math.max((bar.value / max) * 100, 6) : 0}%`, backgroundColor: bar.color }} />
            </span>
            <span className="text-sm font-bold text-[#191919]">{bar.text}</span>
          </div>
        ))}
      </div>
      <div className="justify-self-start">
        <StatusBadge status={metric.status} />
      </div>
    </div>
  );
}

function SummaryCell({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="border-r border-[#E5E5E5] px-5 py-5 last:border-r-0">
      <p className="text-sm font-black text-[#5C5C5C]">{label}</p>
      <p className="mt-2 text-[24px] font-black tracking-[-0.03em] text-[#191919]">{value}</p>
      <p className="mt-1 text-sm text-[#9A9A9A]">{note}</p>
    </div>
  );
}

function Board({ title, children, tone = 'default' }: { title: string; children: ReactNode; tone?: 'default' | 'attention' }) {
  return (
    <section className={`mb-4 rounded border ${tone === 'attention' ? 'border-[#F44336]' : 'border-[#E5E5E5]'} bg-white p-5`}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[17px] font-bold text-[#191919]">{title}</h2>
        {tone === 'attention' && <span className="rounded-full bg-[#EFEFEF] px-3 py-1 text-[12px] font-semibold text-[#F44336]">주의 포함</span>}
      </div>
      {children}
    </section>
  );
}

function ChartBox({ children, height = 330 }: { children: ReactNode; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

function ChartLegend({ keys }: { keys: MetricKey[] }) {
  const { metricDefinitions } = useHealth();
  return (
    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[#5C5C5C]">
      {keys.map((key, index) => {
        const metric = metricByKey(metricDefinitions, key);
        return (
          <span key={key} className={`inline-flex items-center gap-2 ${isBadStatus(metric.status) ? 'font-black text-[#F44336]' : ''}`}>
            <span className="h-2.5 w-2.5" style={{ backgroundColor: lineColors[index % lineColors.length] }} />
            <span>
              {metric.shortName}
              {isBadStatus(metric.status) ? ` (${metric.status})` : ''}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function UploadBox({ title, description, accept, onChange }: { title: string; description: string; accept: string; onChange: (event: ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className="block cursor-pointer border border-[#E5E5E5] bg-[#F5F5F5] px-5 py-5 hover:bg-[#F5F5F5]">
      <span className="block text-[18px] font-black text-[#191919]">{title}</span>
      <span className="mt-2 block text-[15px] leading-7 text-[#5C5C5C]">{description}</span>
      <span className="mt-4 inline-flex h-10 items-center bg-[#191919] px-4 text-sm font-black text-white">파일 선택</span>
      <input type="file" accept={accept} className="hidden" onChange={onChange} />
    </label>
  );
}

function ActionButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="block w-full border border-[#E5E5E5] px-4 py-3 text-left font-black text-[#191919] hover:bg-[#F5F5F5]">
      {children}
    </button>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return <div className="border border-[#E5E5E5] bg-[#F5F5F5] px-5 py-4 text-[15px] leading-7 text-[#191919]">{children}</div>;
}

function EmptyBoard({ message, onAction }: { message: string; onAction?: () => void }) {
  return (
    <div className="border border-[#E5E5E5] bg-white px-6 py-12 text-center">
      <p className="mx-auto max-w-xl text-[16px] leading-7 text-[#5C5C5C]">{message}</p>
      {onAction && (
        <button type="button" onClick={onAction} className="mt-5 h-11 bg-[#1A1A1A] px-6 font-black text-white hover:bg-[#000000]">
          결과지 업로드로 이동
        </button>
      )}
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return <th className="border border-[#E5E5E5] px-4 py-3 font-black">{children}</th>;
}

function Td({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return <td className={`border border-[#E5E5E5] px-4 py-3 align-top ${strong ? 'font-black text-[#191919]' : 'text-[#5C5C5C]'}`}>{children}</td>;
}

const lineColors = ['#1A1A1A', '#3CB371', '#FF8A3D', '#9A9A9A'];

function metricByKey(defs: MetricDefinition[], key: MetricKey) {
  return defs.find((metric) => metric.key === key)!;
}

function historyRows(reports: Report[], defs: MetricDefinition[], keys: MetricKey[]) {
  return reports.map((report) => ({
    year: report.year,
    ...Object.fromEntries(keys.map((key) => [metricByKey(defs, key).shortName, report.values[key]])),
  }));
}

function computeGroups(defs: MetricDefinition[]) {
  const find = (key: MetricKey) => defs.find((metric) => metric.key === key)!;
  const groupDefs = [
    {
      name: '대사 관리 참고군',
      keys: ['waist', 'glucose', 'triglyceride', 'hdl', 'sbp'] as MetricKey[],
      description: '허리둘레, 혈당, 지질, 혈압 항목이 함께 겹칠 때 먼저 확인하는 그룹입니다.',
      meaning: '대사증후군 기준과 가까운 항목을 묶어 보는 참고군입니다.',
      related: '복부비만, 혈당 상승, 혈압 상승, 중성지방 상승, HDL 저하와 관련해 볼 수 있습니다.',
    },
    {
      name: '혈압 관리 참고군',
      keys: ['sbp', 'dbp'] as MetricKey[],
      description: '수축기와 이완기 혈압 흐름을 우선 살펴보는 그룹입니다.',
      meaning: '혈압 수치가 반복해서 기준을 벗어나는지 확인하는 참고군입니다.',
      related: '두통, 어지럼, 혈관 부담과 관련해 상담이 필요할 수 있지만 증상 없이 나타나기도 합니다.',
    },
    {
      name: '지질 관리 참고군',
      keys: ['ldl', 'hdl', 'triglyceride'] as MetricKey[],
      description: '콜레스테롤과 중성지방 항목을 묶어서 보는 그룹입니다.',
      meaning: '혈관 건강과 관련된 지질 수치를 함께 보는 참고군입니다.',
      related: 'LDL 상승, HDL 저하, 중성지방 상승은 심혈관 위험 요인과 함께 확인합니다.',
    },
    {
      name: '간 기능 관찰군',
      keys: ['ast', 'alt', 'ggt'] as MetricKey[],
      description: '간 효소 수치가 생활습관, 약물, 음주와 함께 영향을 받을 수 있는 그룹입니다.',
      meaning: '간세포나 간담도계 상태를 참고하는 효소 수치를 묶은 그룹입니다.',
      related: '음주, 약물, 피로, 지방간 가능성 등 여러 요인과 함께 확인합니다.',
    },
    {
      name: '신장 기능 관찰군',
      keys: ['creatinine'] as MetricKey[],
      description: '혈청 크레아티닌 흐름을 따로 추적하는 그룹입니다.',
      meaning: '신장 기능 추정에 쓰이는 혈청 크레아티닌을 관찰하는 참고군입니다.',
      related: '신장 기능 변화는 eGFR 계산과 함께 확인하며 평균 비교에는 사용하지 않습니다.',
    },
  ];

  return groupDefs
    .map((group) => {
      const matched = group.keys.map(find).filter((metric) => metric.status !== '정상 기준 안');
      return { ...group, matches: matched.length, metrics: matched.map((metric) => metric.name) };
    })
    .sort((a, b) => b.matches - a.matches);
}

function ChipButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-[14px] font-bold ${
        active ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white' : 'border-[#E5E5E5] bg-white text-[#5C5C5C] hover:bg-[#F5F5F5]'
      }`}
    >
      {label}
    </button>
  );
}

function StepperInput({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix: string; onChange: (v: number) => void }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <span className="text-[14px] font-bold text-[#5C5C5C]">{label}</span>
      <div className="flex items-center gap-3">
        <button type="button" className="h-9 w-9 rounded-full border border-[#E5E5E5] font-black text-[#5C5C5C] hover:bg-[#F5F5F5]" onClick={() => onChange(Math.max(min, value - 1))}>−</button>
        <span className="min-w-[52px] text-center text-[16px] font-black text-[#191919]">{value}{suffix}</span>
        <button type="button" className="h-9 w-9 rounded-full border border-[#E5E5E5] font-black text-[#5C5C5C] hover:bg-[#F5F5F5]" onClick={() => onChange(Math.min(max, value + 1))}>＋</button>
      </div>
    </div>
  );
}

/** 흡연/음주/음주량 문진 폼 — 회원가입·프로필·업로드에서 공용(모바일 LifestyleForm과 동일 로직).
 *  최종값은 {smoking, drinking, alcohol_weekly_g} 만 프로필에 저장한다. */
function LifestyleFormWeb({ value, onChange, gender }: { value: Lifestyle; onChange: (v: Lifestyle) => void; gender: 1 | 2 }) {
  // 음주량 세부(주횟수/잔수/술종류)는 로컬. 기존 g가 있으면 대략 역산해 초기값을 잡는다.
  const [freq, setFreq] = useState(() => (value.alcohol_weekly_g > 0 ? Math.min(7, Math.max(1, Math.round(value.alcohol_weekly_g / 21))) : 2));
  const [glasses, setGlasses] = useState(3);
  const [drinkType, setDrinkType] = useState<(typeof DRINK_TYPES)[number]>('소주');
  const limit = gender === 2 ? 140 : 210;

  const emit = (patch: Partial<Lifestyle>) => onChange({ ...value, ...patch });
  const recalc = (f: number, g: number, t: string) => emit({ alcohol_weekly_g: Math.round(f * g * GRAMS_PER_GLASS[t]) });
  const grams = value.drinking === 'yes' ? value.alcohol_weekly_g : 0;

  return (
    <div>
      <p className="mb-2 text-[14px] font-black text-[#5C5C5C]">흡연</p>
      <div className="mb-5 flex flex-wrap gap-2">
        <ChipButton active={value.smoking === 'never'} label="비흡연" onClick={() => emit({ smoking: 'never' })} />
        <ChipButton active={value.smoking === 'former'} label="과거 흡연" onClick={() => emit({ smoking: 'former' })} />
        <ChipButton active={value.smoking === 'current'} label="현재 흡연" onClick={() => emit({ smoking: 'current' })} />
      </div>

      <p className="mb-2 text-[14px] font-black text-[#5C5C5C]">음주</p>
      <div className="flex flex-wrap gap-2">
        <ChipButton active={value.drinking === 'no'} label="안 마심" onClick={() => emit({ drinking: 'no', alcohol_weekly_g: 0 })} />
        <ChipButton
          active={value.drinking === 'yes'}
          label="마심"
          onClick={() => emit({ drinking: 'yes', alcohol_weekly_g: Math.round(freq * glasses * GRAMS_PER_GLASS[drinkType]) })}
        />
      </div>

      {value.drinking === 'yes' && (
        <div className="mt-4 border-t border-[#E5E5E5] pt-4">
          <StepperInput label="주 몇 회" value={freq} min={1} max={7} suffix="회" onChange={(v) => { setFreq(v); recalc(v, glasses, drinkType); }} />
          <StepperInput label="1회 몇 잔" value={glasses} min={1} max={20} suffix="잔" onChange={(v) => { setGlasses(v); recalc(freq, v, drinkType); }} />
          <p className="mb-2 mt-1 text-[14px] font-black text-[#5C5C5C]">주로 마시는 술</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {DRINK_TYPES.map((t) => (
              <ChipButton key={t} active={drinkType === t} label={t} onClick={() => { setDrinkType(t); recalc(freq, glasses, t); }} />
            ))}
          </div>
          <div className="bg-[#F5F5F5] px-4 py-3 text-[14px] leading-6 text-[#5C5C5C]">
            주당 순알코올 약 <span className={`font-black ${grams > limit ? 'text-[#F44336]' : 'text-[#191919]'}`}>{grams}g</span>
            <span className="text-[#9A9A9A]"> · 지방간 기준 {gender === 2 ? '여성' : '남성'} {limit}g</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** 회원가입 직후 1회 노출되는 생활습관 문진 모달 — 건너뛸 수 있고, 이후 프로필 수정에서 변경한다. */
function LifestyleModal({
  gender,
  loading,
  onSkip,
  onSave,
}: {
  gender: 1 | 2;
  loading: boolean;
  onSkip: () => void;
  onSave: (lifestyle: Lifestyle) => void;
}) {
  const [lifestyle, setLifestyle] = useState<Lifestyle>(EMPTY_LIFESTYLE);
  return (
    <Dialog title="생활습관 문진" onClose={onSkip}>
      <p className="mb-5 text-[15px] leading-7 text-[#5C5C5C]">
        흡연·음주 정보를 알려주시면 검진 분석(지방간 유형 등)이 더 정확해집니다. 지금 건너뛰고 나중에 프로필에서 입력할 수도 있습니다.
      </p>
      <LifestyleFormWeb value={lifestyle} onChange={setLifestyle} gender={gender} />
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="h-11 border border-[#E5E5E5] px-5 font-black text-[#5C5C5C] hover:bg-[#F5F5F5]" onClick={onSkip}>
          건너뛰기
        </button>
        <button
          type="button"
          className="h-11 bg-[#1A1A1A] px-5 font-black text-white disabled:bg-[#9A9A9A]"
          disabled={loading || (!lifestyle.smoking && !lifestyle.drinking)}
          onClick={() => onSave(lifestyle)}
        >
          {loading ? '저장 중' : '저장'}
        </button>
      </div>
    </Dialog>
  );
}

function AuthModal({
  loading,
  onClose,
  onLogin,
  onSignup,
}: {
  loading: boolean;
  onClose: () => void;
  onLogin: (email: string, password: string) => void;
  onSignup: (input: { email: string; name: string; birth_date: string; gender: 1 | 2; password: string }) => void;
}) {
  const [mode, setMode] = useState<'login' | 'signup'>('signup');
  const [form, setForm] = useState({
    email: '',
    name: '',
    birth_date: '1980-01-01',
    gender: '1',
    password: '',
  });

  return (
    <Dialog title={mode === 'signup' ? '회원가입' : '로그인'} onClose={onClose}>
      <div className="mb-5 grid grid-cols-2 border border-[#E5E5E5] text-center text-[15px] font-black">
        <button type="button" className={`py-3 ${mode === 'signup' ? 'bg-[#F5F5F5] text-[#1A1A1A]' : 'text-[#5C5C5C]'}`} onClick={() => setMode('signup')}>
          회원가입
        </button>
        <button type="button" className={`border-l border-[#E5E5E5] py-3 ${mode === 'login' ? 'bg-[#F5F5F5] text-[#1A1A1A]' : 'text-[#5C5C5C]'}`} onClick={() => setMode('login')}>
          로그인
        </button>
      </div>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (mode === 'login') {
            onLogin(form.email.trim(), form.password);
            return;
          }
          onSignup({
            email: form.email.trim(),
            name: form.name.trim(),
            birth_date: form.birth_date,
            gender: Number(form.gender) === 2 ? 2 : 1,
            password: form.password,
          });
        }}
      >
        <Field label="이메일">
          <input
            type="email"
            className="h-11 w-full border border-[#E5E5E5] px-3 text-[15px] outline-none focus:border-[#1A1A1A]"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            required
          />
        </Field>
        {mode === 'signup' && (
          <>
            <Field label="이름">
              <input
                className="h-11 w-full border border-[#E5E5E5] px-3 text-[15px] outline-none focus:border-[#1A1A1A]"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                required
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="생년월일">
                <input
                  type="date"
                  className="h-11 w-full border border-[#E5E5E5] px-3 text-[15px] outline-none focus:border-[#1A1A1A]"
                  value={form.birth_date}
                  onChange={(event) => setForm((current) => ({ ...current, birth_date: event.target.value }))}
                  required
                />
              </Field>
              <Field label="성별">
                <select
                  className="h-11 w-full border border-[#E5E5E5] bg-white px-3 text-[15px] outline-none focus:border-[#1A1A1A]"
                  value={form.gender}
                  onChange={(event) => setForm((current) => ({ ...current, gender: event.target.value }))}
                >
                  <option value="1">남성</option>
                  <option value="2">여성</option>
                </select>
              </Field>
            </div>
          </>
        )}
        <Field label="비밀번호">
          <input
            type="password"
            className="h-11 w-full border border-[#E5E5E5] px-3 text-[15px] outline-none focus:border-[#1A1A1A]"
            value={form.password}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            required
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="h-11 border border-[#E5E5E5] px-5 font-black text-[#5C5C5C]" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="h-11 bg-[#1A1A1A] px-5 font-black text-white disabled:bg-[#9A9A9A]" disabled={loading}>
            {loading ? '처리 중' : mode === 'signup' ? '회원가입' : '로그인'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function ProfileModal({
  profile,
  loading,
  onClose,
  onSave,
}: {
  profile: UserProfile;
  loading: boolean;
  onClose: () => void;
  onSave: (profile: UserProfile) => void;
}) {
  const [form, setForm] = useState({
    name: profile.name,
    email: profile.email ?? '',
    gender: String(profile.gender),
    birth_date: birthDateFromProfile(profile),
  });
  // 생활습관 문진 — 프로필에 저장된 값으로 시작해 여기서 수정한다(모바일 내정보와 동일).
  const [lifestyle, setLifestyle] = useState<Lifestyle>({
    smoking: profile.smoking ?? null,
    drinking: profile.drinking ?? null,
    alcohol_weekly_g: profile.alcohol_weekly_g ?? 0,
  });

  return (
    <Dialog title="프로필 수정" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            ...profile,
            name: form.name.trim() || profile.name,
            email: form.email.trim() || profile.email,
            gender: Number(form.gender) === 2 ? 2 : 1,
            birth_year: profileBirthFromDate(form.birth_date).birth_year || profile.birth_year,
            birth_md: profileBirthFromDate(form.birth_date).birth_md ?? profile.birth_md,
            smoking: lifestyle.smoking,
            drinking: lifestyle.drinking,
            alcohol_weekly_g: lifestyle.drinking === 'yes' ? lifestyle.alcohol_weekly_g : 0,
          });
        }}
      >
        <Field label="이메일">
          <input
            className="h-11 w-full border border-[#E5E5E5] px-3 text-[15px] outline-none focus:border-[#1A1A1A]"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            placeholder="name@example.com"
          />
        </Field>
        <Field label="이름">
          <input
            className="h-11 w-full border border-[#E5E5E5] px-3 text-[15px] outline-none focus:border-[#1A1A1A]"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="성별">
            <select
              className="h-11 w-full border border-[#E5E5E5] bg-white px-3 text-[15px] outline-none focus:border-[#1A1A1A]"
              value={form.gender}
              onChange={(event) => setForm((current) => ({ ...current, gender: event.target.value }))}
            >
              <option value="1">남성</option>
              <option value="2">여성</option>
            </select>
          </Field>
          <Field label="생년월일">
            <input
              type="date"
              className="h-11 w-full border border-[#E5E5E5] px-3 text-[15px] outline-none focus:border-[#1A1A1A]"
              value={form.birth_date}
              onChange={(event) => setForm((current) => ({ ...current, birth_date: event.target.value }))}
            />
          </Field>
        </div>
        <div className="border-t border-[#E5E5E5] pt-4">
          <p className="mb-3 text-[15px] font-black text-[#191919]">생활습관 문진</p>
          <LifestyleFormWeb value={lifestyle} onChange={setLifestyle} gender={Number(form.gender) === 2 ? 2 : 1} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="h-11 border border-[#E5E5E5] px-5 font-black text-[#5C5C5C]" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="h-11 bg-[#1A1A1A] px-5 font-black text-white disabled:bg-[#9A9A9A]" disabled={loading}>
            {loading ? '저장 중' : '저장'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function SettingsModal({
  settings,
  onClose,
  onChange,
}: {
  settings: UserSettings;
  onClose: () => void;
  onChange: (settings: UserSettings) => void;
}) {
  const items: Array<{ key: keyof UserSettings; title: string; description: string }> = [
    { key: 'checkupReminder', title: '검진 일정 알림', description: '다음 검진 시기를 놓치지 않도록 알려줍니다.' },
    { key: 'medicationReminder', title: '복약 자료 알림', description: '내가 먹는 약 자료를 정기적으로 확인하도록 안내합니다.' },
    { key: 'simpleWords', title: '쉬운 설명 우선 표시', description: '검사항목 설명을 어려운 의학 용어보다 쉬운 문장으로 먼저 보여줍니다.' },
  ];

  return (
    <Dialog title="설정" onClose={onClose}>
      <div className="divide-y divide-[#E5E5E5]">
        {items.map((item) => (
          <label key={item.key} className="flex cursor-pointer items-start justify-between gap-5 py-4">
            <span>
              <span className="block font-black text-[#191919]">{item.title}</span>
              <span className="mt-1 block text-[15px] leading-6 text-[#9A9A9A]">{item.description}</span>
            </span>
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 accent-[#1A1A1A]"
              checked={settings[item.key]}
              onChange={(event) => onChange({ ...settings, [item.key]: event.target.checked })}
            />
          </label>
        ))}
      </div>
      <div className="mt-5 flex justify-end">
        <button type="button" className="h-11 bg-[#1A1A1A] px-5 font-black text-white" onClick={onClose}>
          확인
        </button>
      </div>
    </Dialog>
  );
}

function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#191919]/35 px-4">
      <div className="w-full max-w-[520px] border border-[#E5E5E5] bg-white shadow-[0_18px_48px_rgba(29,43,58,0.24)]">
        <div className="flex items-center justify-between border-b border-[#E5E5E5] px-6 py-4">
          <h2 className="text-[22px] font-black text-[#191919]">{title}</h2>
          <button type="button" className="text-[24px] font-black text-[#9A9A9A]" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[14px] font-black text-[#5C5C5C]">{label}</span>
      {children}
    </label>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [profile, setProfile] = useState<UserProfile>(initialProfile);
  const [settings, setSettings] = useState<UserSettings>(initialSettings);
  const [authOpen, setAuthOpen] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 회원가입 직후 1회 노출하는 생활습관 문진 모달(건너뛰기 가능).
  const [lifestyleOpen, setLifestyleOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [healthData, setHealthData] = useState<HealthData>(emptyHealthData);

  const loadHealth = async (userId?: string) => {
    try {
      setHealthData(await loadHealthData(userId));
    } catch {
      setHealthData(emptyHealthData);
    }
  };

  const loadProfile = async (quiet = false) => {
    const token = await getAccessToken();
    if (!token) {
      if (!quiet) setMessage('로그인 세션이 없어 현재 화면의 프로필 정보를 사용합니다.');
      return;
    }
    setProfileLoading(true);
    try {
      const users = await apiFetch('/users');
      const first = Array.isArray(users) ? users[0] : null;
      if (first) {
        setProfile({
          id: first.id ?? first.user_id,
          email: first.email,
          name: first.name ?? initialProfile.name,
          gender: Number(first.gender) === 2 ? 2 : 1,
          birth_year: Number(first.birth_year) || initialProfile.birth_year,
          birth_md: Number(first.birth_md) || initialProfile.birth_md,
          smoking: first.smoking ?? null,
          drinking: first.drinking ?? null,
          alcohol_weekly_g: first.alcohol_weekly_g ?? null,
        });
        if (!quiet) setMessage('프로필 정보를 불러왔습니다.');
      } else if (!quiet) {
        setMessage('저장된 프로필이 없어 현재 입력한 정보를 사용합니다.');
      }
    } catch (error) {
      if (!quiet) setMessage(error instanceof Error ? error.message : '프로필 정보를 불러오지 못했습니다.');
    } finally {
      setProfileLoading(false);
    }
  };

  const saveProfile = async (nextProfile: UserProfile) => {
    setProfileLoading(true);
    try {
      const token = await getAccessToken();
      const payload: ApiProfilePayload = {
        name: nextProfile.name,
        gender: nextProfile.gender,
        birth_year: nextProfile.birth_year,
        birth_md: nextProfile.birth_md,
        // 생활습관 문진 — 저장하면 이후 검진 분석에 자동 반영된다(지방간 유형 정식 판정 등).
        smoking: nextProfile.smoking ?? null,
        drinking: nextProfile.drinking ?? null,
        alcohol_weekly_g: nextProfile.alcohol_weekly_g ?? null,
      };
      if (token && nextProfile.id) {
        const saved = await apiFetch(`/users/${nextProfile.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        setProfile({
          ...nextProfile,
          id: saved.id ?? saved.user_id ?? nextProfile.id,
          email: saved.email ?? nextProfile.email,
          name: saved.name ?? nextProfile.name,
          gender: Number(saved.gender) === 2 ? 2 : 1,
          birth_year: Number(saved.birth_year) || nextProfile.birth_year,
          birth_md: Number(saved.birth_md) || nextProfile.birth_md,
          smoking: saved.smoking ?? nextProfile.smoking ?? null,
          drinking: saved.drinking ?? nextProfile.drinking ?? null,
          alcohol_weekly_g: saved.alcohol_weekly_g ?? nextProfile.alcohol_weekly_g ?? null,
        });
      } else {
      setProfile(nextProfile);
      }
      setProfileOpen(false);
      setMessage('프로필이 저장되었습니다.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '프로필 저장에 실패했습니다.');
    } finally {
      setProfileLoading(false);
    }
  };

  // 업로드 탭에서 수정한 생활습관을 프로필에도 반영한다(모바일과 동일 동작).
  const saveLifestyleFromUpload = (lifestyle: Lifestyle) => {
    void saveProfile({
      ...profile,
      smoking: lifestyle.smoking,
      drinking: lifestyle.drinking,
      alcohol_weekly_g: lifestyle.drinking === 'yes' ? lifestyle.alcohol_weekly_g : 0,
    });
  };

  // 회원가입 문진 모달 저장/건너뛰기.
  const saveLifestyleFromSignup = async (lifestyle: Lifestyle) => {
    setLifestyleOpen(false);
    await saveProfile({
      ...profile,
      smoking: lifestyle.smoking,
      drinking: lifestyle.drinking,
      alcohol_weekly_g: lifestyle.drinking === 'yes' ? lifestyle.alcohol_weekly_g : 0,
    });
  };

  // 회원탈퇴 — 계정과 모든 데이터를 영구 삭제한다. 되돌릴 수 없으므로 두 번 확인한다.
  const deleteAccount = async () => {
    if (!profile.id) {
      setMessage('로그인 후 이용할 수 있습니다.');
      return;
    }
    if (!window.confirm('회원탈퇴하면 계정과 모든 검진·분석·복약 데이터가 영구 삭제됩니다.\n정말 탈퇴할까요?')) return;
    if (!window.confirm('삭제된 데이터는 되돌릴 수 없습니다. 진행할까요?')) return;
    try {
      await healthApi.deleteAccount(profile.id);
      if (supabaseConfigured) await supabase.auth.signOut().catch(() => undefined);
      setProfile(initialProfile);
      setHealthData(emptyHealthData);
      setMessage('회원탈퇴가 완료되었습니다.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '회원탈퇴에 실패했습니다.');
    }
  };

  const login = async (email: string, password: string) => {
    if (!supabaseConfigured) {
      setMessage('Supabase 환경변수 설정이 필요합니다.');
      return;
    }
    setAuthLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setAuthOpen(false);
      setMessage('로그인되었습니다.');
      await loadProfile(true);
      await loadHealth();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '로그인에 실패했습니다.');
    } finally {
      setAuthLoading(false);
    }
  };

  const signup = async (input: { email: string; name: string; birth_date: string; gender: 1 | 2; password: string }) => {
    if (!supabaseConfigured) {
      setMessage('Supabase 환경변수 설정이 필요합니다.');
      return;
    }
    setAuthLoading(true);
    try {
      const birth = profileBirthFromDate(input.birth_date);
      const { data, error } = await supabase.auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          data: {
            name: input.name,
            birth_date: input.birth_date,
            gender: input.gender,
          },
        },
      });
      if (error) throw error;

      const nextProfile: UserProfile = {
        id: data.user?.id,
        email: input.email,
        name: input.name,
        gender: input.gender,
        birth_year: birth.birth_year ?? initialProfile.birth_year,
        birth_md: birth.birth_md,
      };

      if (data.session) {
        const saved = await apiFetch('/users', {
          method: 'POST',
          body: JSON.stringify({
            name: nextProfile.name,
            gender: nextProfile.gender,
            birth_year: nextProfile.birth_year,
            birth_md: nextProfile.birth_md,
          }),
        });
        setProfile({
          ...nextProfile,
          id: saved.id ?? saved.user_id ?? data.user?.id,
          name: saved.name ?? nextProfile.name,
          gender: Number(saved.gender) === 2 ? 2 : 1,
          birth_year: Number(saved.birth_year) || nextProfile.birth_year,
          birth_md: Number(saved.birth_md) || nextProfile.birth_md,
        });
        setMessage('회원가입과 프로필 저장이 완료되었습니다.');
        await loadHealth();
        // 가입 완료 후 생활습관 문진(1회, 건너뛰기 가능)을 이어서 받는다.
        setLifestyleOpen(true);
      } else {
        setProfile(nextProfile);
        setMessage('회원가입이 완료되었습니다. 이메일 인증 후 로그인하면 프로필을 저장합니다.');
      }
      setAuthOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '회원가입에 실패했습니다.');
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = async () => {
    if (supabaseConfigured) await supabase.auth.signOut().catch(() => undefined);
    setProfile(initialProfile);
    setHealthData(emptyHealthData);
    setMessage('로그아웃되었습니다.');
  };

  useEffect(() => {
    void loadProfile(true);
    void loadHealth();
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 3000);
    return () => window.clearTimeout(timer);
  }, [message]);

  return (
    <div className="min-h-screen bg-white text-[#191919]">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        profile={profile}
        onEditProfile={() => setProfileOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onReloadProfile={() => void loadProfile()}
        onLogout={() => void logout()}
        onAuth={() => setAuthOpen(true)}
        onDeleteAccount={() => void deleteAccount()}
      />
      <HealthContext.Provider value={healthData}>
        <Layout>
          {activeTab === 'dashboard' && <DashboardView onTabChange={setActiveTab} />}
          {activeTab === 'records' && <RecordsView userId={profile.id} onChanged={() => void loadHealth()} />}
          {activeTab === 'history' && <HistoryView />}
          {activeTab === 'analysis' && <AnalysisView />}
          {activeTab === 'upload' && <UploadView profile={profile} onTabChange={setActiveTab} onSaved={() => void loadHealth()} onSaveLifestyle={saveLifestyleFromUpload} />}
        </Layout>
      </HealthContext.Provider>
      {message && (
        <div className="fixed bottom-5 right-5 z-50 border border-[#E5E5E5] bg-white px-5 py-3 text-[15px] font-bold text-[#191919] shadow-[0_10px_24px_rgba(29,43,58,0.16)]">
          {message}
        </div>
      )}
      {authOpen && <AuthModal loading={authLoading} onClose={() => setAuthOpen(false)} onLogin={login} onSignup={signup} />}
      {lifestyleOpen && (
        <LifestyleModal
          gender={profile.gender}
          loading={profileLoading}
          onSkip={() => setLifestyleOpen(false)}
          onSave={(lifestyle) => void saveLifestyleFromSignup(lifestyle)}
        />
      )}
      {profileOpen && <ProfileModal profile={profile} loading={profileLoading} onClose={() => setProfileOpen(false)} onSave={saveProfile} />}
      {settingsOpen && <SettingsModal settings={settings} onClose={() => setSettingsOpen(false)} onChange={setSettings} />}
    </div>
  );
}
