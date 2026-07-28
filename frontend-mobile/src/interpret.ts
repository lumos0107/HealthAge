// 수치를 사람 말로 바꾸는 순수 로직 모음 — RN 의존성이 없어 vitest로 테스트한다.
import { metricDirection } from './data';
import type { MetricDefinition, MetricKey, Report, Status } from './data';

// 받침 유무에 따라 이/가를 고른다. 한글이 아니면(영문 약어 등) '가'.
function subjectJosa(word: string): '이' | '가' {
  const last = word.charAt(word.length - 1);
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return '가';
  return (code - 0xac00) % 28 > 0 ? '이' : '가';
}

/** 정상범위 경계 파싱 — 범위형은 normalText의 "a-b"에서, 상한/하한형은 normalValue에서. */
export function normalBounds(metric: MetricDefinition): { low?: number; high?: number } {
  const dir = metricDirection(metric);
  if (dir === 'high') return { high: metric.normalValue };
  if (dir === 'low') return { low: metric.normalValue };
  const m = /(\d+(?:\.\d+)?)\s*[-~]\s*(\d+(?:\.\d+)?)/.exec(metric.normalText);
  if (m) return { low: Number(m[1]), high: Number(m[2]) };
  return { high: metric.normalValue };
}

/** L2 상단 헤드라인 — 상태+방향으로 쉬운 문장을 만든다. */
export function headline(metric: MetricDefinition, value: number): string {
  const subject = `${metric.name}${subjectJosa(metric.name)}`;
  if (metric.infoOnly) return `${subject} 참고용 수치예요`;
  if (metric.status === '정상') return `${subject} 정상 범위예요`;
  const { low, high } = normalBounds(metric);
  const isLow = low != null && value < low;
  const dirWord = isLow ? '낮아요' : '높아요';
  const degree = metric.status === '위험' ? '많이' : '살짝';
  return `${subject} ${degree} ${dirWord}`;
}

/** 해당 연도 직전 검진(그 항목이 실제 측정된 해)과의 차이. 이전 기록이 없으면 null. */
export function yearDelta(reports: Report[], key: MetricKey, year: number): { diff: number; prevYear: number } | null {
  const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const current = reports.find((r) => r.year === year);
  if (!current || !isNum(current.values[key])) return null;
  const prev = [...reports]
    .filter((r) => r.year < year && isNum(r.values[key]))
    .sort((a, b) => b.year - a.year)[0];
  if (!prev) return null;
  const diff = Math.round((current.values[key] - prev.values[key]) * 10) / 10;
  return { diff, prevYear: prev.year };
}

export function deltaText(delta: { diff: number; prevYear: number }, unit: string): string {
  if (delta.diff === 0) return `${delta.prevYear}년과 같아요`;
  const dir = delta.diff > 0 ? '올랐어요' : '내렸어요';
  return `${delta.prevYear}년보다 ${Math.abs(delta.diff)}${unit} ${dir}`;
}

const ATTENTION_ORDER: Record<Status, number> = { 위험: 0, 주의: 1, 정상: 2 };

/** 위험→주의→정상 순, 같은 상태끼리는 원래 순서 유지(안정 정렬). */
export function sortByAttention(defs: MetricDefinition[]): MetricDefinition[] {
  return [...defs].sort((a, b) => ATTENTION_ORDER[a.status] - ATTENTION_ORDER[b.status]);
}

/** 홈 TOP3 — 이상 항목만, 위험 우선 최대 3개. infoOnly(키·체중)는 판정 대상이 아니므로 제외한다. */
export function top3Alerts(defs: MetricDefinition[]): MetricDefinition[] {
  return sortByAttention(defs.filter((m) => !m.infoOnly && m.status !== '정상')).slice(0, 3);
}

/** infoOnly(키·체중) 항목은 판정 대상이 아니므로 상태 카운트에서 제외한다. */
export function statusCounts(defs: MetricDefinition[]): { 정상: number; 주의: number; 위험: number } {
  const counts = { 정상: 0, 주의: 0, 위험: 0 };
  for (const m of defs) {
    if (m.infoOnly) continue;
    counts[m.status]++;
  }
  return counts;
}

/** 값 표시용 문자열 — valueLabels가 있으면 등급 라벨(요단백 등)을, 없으면 숫자 그대로 반환한다. 단위는 호출부가 따로 붙인다. */
export function formatMetricValue(metric: MetricDefinition, value: number): string {
  return metric.valueLabels?.[value] ?? String(value);
}

/** "같은 나이대 100명이라면 그중 N등" — 상위 percentile% ≈ N등. 1~100으로 clamp. */
export function rankFromPercentile(percentile: number): number {
  return Math.min(100, Math.max(1, Math.round(percentile)));
}
