// 수치를 사람 말로 바꾸는 순수 로직 모음 — RN 의존성이 없어 vitest로 테스트한다.
import { metricDirection } from './data';
import type { MetricDefinition, MetricKey, Report, Status } from './data';

/** 마지막 글자에 받침이 있는지. 한글이 아니면(영문 약어 등) 없는 것으로 본다. */
function hasFinalConsonant(word: string): boolean {
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 > 0;
}

// 받침 유무에 따라 이/가를 고른다. 한글이 아니면(영문 약어 등) '가'.
export function subjectJosa(word: string): '이' | '가' {
  return hasFinalConsonant(word) ? '이' : '가';
}

/** 은/는 — 항목 이름 뒤에 붙는다. shortName은 '수축기'처럼 받침이 없는 경우가 많아 반드시 판별해야 한다. */
export function topicJosa(word: string): '은' | '는' {
  return hasFinalConsonant(word) ? '은' : '는';
}

/** 정상범위 경계 파싱 — 범위형은 normalText의 "a-b"에서, 상한/하한형은 normalValue에서.
 * 상한형(LDL·AST 등)은 검진 결과지 관행("0~40")대로 하한 0을 채워 양쪽 경계를 돌려준다.
 * 하한형(HDL)은 높을수록 좋아 의학적 상한이 없으므로 위쪽을 열어둔다. */
export function normalBounds(metric: MetricDefinition): { low?: number; high?: number } {
  const dir = metricDirection(metric);
  if (dir === 'high') return { low: 0, high: metric.normalValue };
  if (dir === 'low') return { low: metric.normalValue };
  const m = /(\d+(?:\.\d+)?)\s*[-~]\s*(\d+(?:\.\d+)?)/.exec(metric.normalText);
  if (m) return { low: Number(m[1]), high: Number(m[2]) };
  return { low: 0, high: metric.normalValue };
}

/** L2 상단 헤드라인 — 상태+방향으로 쉬운 문장을 만든다.
 *  ⚠️ 주어(항목명)를 넣지 않는다. 호출처 두 곳(홈 TOP3·검사항목 상세)이 모두 바로 위에
 *  항목명을 제목으로 띄우고 있어서, 주어를 넣으면 같은 이름이 두 줄 연속으로 나온다. */
export function headline(metric: MetricDefinition, value: number): string {
  if (metric.infoOnly) return '참고용 수치예요';
  if (metric.status === '정상') return '정상 범위예요';
  const { low } = normalBounds(metric);
  const isLow = low != null && value < low;
  const dirWord = isLow ? '낮아요' : '높아요';
  const degree = metric.status === '위험' ? '많이' : '살짝';
  return `${degree} ${dirWord}`;
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

/** 참고 점수를 항목 상태와 같은 3단계로 환산한다 — 색·라벨은 이 값 하나에서 파생시킨다.
 *  70/40 경계가 홈·분석·히스토리 세 곳에 흩어져 있어 갈릴 위험이 있었다. */
export function scoreGrade(score: number): Status {
  if (score >= 70) return '정상';
  if (score >= 40) return '주의';
  return '위험';
}

export type ScorePoint = { year: number; score: number; judged: number; complete: boolean };

/** 점수 추이 시리즈 — 연도순 점수 + 그 해가 '온전한 검진'이었는지.
 *
 * ⚠️ 참고 점수는 판정된 항목만 감점한다(검사 안 한 항목은 감점 0). 지질검사가
 *    4년주기라 지질 4항목이 빠진 해는 점수가 최대 12점 높게 나온다. 그 해를
 *    그냥 이으면 "검사를 안 받아서 좋아진 것처럼" 보이는 위쪽 꺾임이 생기므로,
 *    항목 수가 최대치보다 적은 해는 complete:false로 표시해 화면이 다르게 그린다.
 */
export function scoreSeries(reports: Report[]): ScorePoint[] {
  const rows = [...reports]
    .sort((a, b) => a.year - b.year)
    .map((r) => ({ year: r.year, score: r.score, judged: Object.keys(r.statusByKey).length }));
  const maxJudged = Math.max(...rows.map((r) => r.judged), 0);
  return rows.map((r) => ({ ...r, complete: r.judged === maxJudged }));
}

/** 점수 추이 한 줄 결론 — "10년간 78점 내려갔어요".
 *  기간은 회차 수가 아니라 첫 해와 마지막 해의 차이로 센다. */
export function scoreTrendText(series: ScorePoint[]): string | null {
  if (series.length < 2) return null;
  const first = series[0];
  const last = series[series.length - 1];
  const span = last.year - first.year;
  const diff = last.score - first.score;
  const period = span > 0 ? `${span}년간 ` : '';
  if (diff === 0) return `${period}점수는 그대로예요.`;
  return `${period}${Math.abs(diff)}점 ${diff < 0 ? '내려갔어요' : '올라갔어요'}.`;
}

/** 검사 항목이 빠진 해가 있으면 그 사실을 알리는 문구. 없으면 null. */
export function scoreGapNote(series: ScorePoint[]): string | null {
  const gaps = series.filter((p) => !p.complete);
  if (!gaps.length) return null;
  return `${gaps.map((g) => g.year).join('·')}년은 검사한 항목이 적어(${gaps[0].judged}개) 점수가 높게 나옵니다. 점선으로 표시했어요.`;
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

/** percentile(실측)이 없을 때의 "100명 중 N등" 추정 — 또래 평균을 중심으로,
 * 정상범위 폭의 1/4을 표준편차로 가정한 정규분포 근사(검사 수치의 정상범위 ≈ 평균±2SD 관행).
 * 실제 분포 데이터가 아니므로 화면에는 반드시 '추정'임을 함께 표기해야 한다.
 * 1등 = 가장 좋은 상태. HDL처럼 높을수록 좋은 항목은 방향을 뒤집는다. */
export function estimateRank(metric: MetricDefinition, value: number): number | null {
  if (metric.peerMean == null) return null;
  const { low, high } = normalBounds(metric);
  const span = (low != null && high != null ? high - low : Math.abs(low ?? high ?? 0) * 0.25) || 1;
  const sd = span / 4;
  const z = (value - metric.peerMean) / sd;
  // 표준정규 누적분포 Φ(z)의 로지스틱 근사(오차 <1%p) — 의존성 없이 충분한 정밀도.
  const phi = 1 / (1 + Math.exp(-1.702 * z));
  // 나보다 좋은 사람 비율 ≈ 내 등수. 높을수록 나쁜 항목(범위형 포함)은 값이 낮은 쪽이 좋은 사람.
  const betterFrac = metricDirection(metric) === 'low' ? 1 - phi : phi;
  return Math.min(100, Math.max(1, Math.round(betterFrac * 100)));
}
