import type { ApiComprehensiveReport, ApiEvaluation, ApiUser } from './healthApi';
import type { HealthRecord } from '../data/mockData';

type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === 'object' ? (value as AnyRecord) : {};
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeMetricName(value: string): string {
  return value.replace(/\s/g, '').toLowerCase();
}

export function extractComprehensive(raw: unknown): ApiComprehensiveReport | null {
  const data = asRecord(raw);
  const candidate = data.comprehensive ?? data.comprehensive_report ?? raw;
  return candidate && typeof candidate === 'object' ? (candidate as ApiComprehensiveReport) : null;
}

export function getUserId(user: ApiUser): string {
  return user.user_id ?? user.id ?? '';
}

export function getUserName(user?: ApiUser, comprehensive?: ApiComprehensiveReport | null): string {
  return user?.name ?? user?.user_name ?? comprehensive?.user_name ?? '사용자';
}

export function evaluationByMetric(comprehensive: ApiComprehensiveReport | null | undefined, metric: string): ApiEvaluation | null {
  const target = normalizeMetricName(metric);
  return comprehensive?.all_evaluations?.find((item) => normalizeMetricName(String(item.metric ?? item.label ?? '')) === target) ?? null;
}

export function normalizeReport(raw: unknown, yearFallback: number, fallbackIndex = 0): HealthRecord {
  const data = asRecord(raw);
  const checkup = asRecord(data.checkup ?? data.basic_report ?? data.report ?? data);
  const comprehensive = extractComprehensive(raw);
  const year = asNumber(checkup.year ?? data.year, yearFallback);

  return {
    id: fallbackIndex + 1,
    year,
    examDate: String(checkup.examDate ?? checkup.exam_date ?? checkup.date ?? `${year}-01-01`),
    hospital: String(checkup.hospital ?? checkup.institution ?? checkup.organization ?? '검진기관 미입력'),
    examType: String(checkup.examType ?? checkup.exam_type ?? '건강검진'),
    age: asNumber(checkup.age ?? comprehensive?.age, 0),
    sex: String(checkup.sex ?? comprehensive?.gender ?? 'M').toLowerCase().startsWith('f') ? 'F' : 'M',
    height: asNumber(checkup.height),
    weight: asNumber(checkup.weight),
    bmi: asNumber(checkup.bmi),
    waist: asNumber(checkup.waist),
    sbp: asNumber(checkup.sbp ?? checkup.systolic_bp),
    dbp: asNumber(checkup.dbp ?? checkup.diastolic_bp),
    fbs: asNumber(checkup.fbs ?? checkup.fasting_glucose),
    totalCholesterol: asNumber(checkup.totalCholesterol ?? checkup.total_cholesterol),
    ldl: asNumber(checkup.ldl),
    hdl: asNumber(checkup.hdl),
    tg: asNumber(checkup.tg ?? checkup.triglyceride),
    ast: asNumber(checkup.ast),
    alt: asNumber(checkup.alt),
    ggt: asNumber(checkup.ggt ?? checkup.gamma_gtp),
    creatinine: asNumber(checkup.creatinine ?? checkup.serum_creatinine),
    urineProtein: String(checkup.urineProtein ?? checkup.urine_protein ?? '미측정'),
    summary: String(checkup.summary ?? comprehensive?.summary?.overall_status ?? '저장된 검진 결과'),
    rawFindings: Array.isArray(checkup.rawFindings) ? checkup.rawFindings.map(String) : [],
  };
}
