import type { MetricKey, RealReportPayload, Report, Status } from './types';

/**
 * 백엔드 한글 항목명 → 프론트 MetricKey.
 * ⚠️ 백엔드가 '실제로' 내려주는 명칭을 반드시 포함해야 한다. 모바일에서는 아래 4개
 * (식전혈당(공복혈당)·트리글리세라이드·혈청지오티(AST)·혈청지피티(ALT))가 빠져 있어
 * 실계정 화면에서 그 항목들이 통째로 사라졌었다(24번 §3 버그 #2).
 */
export const METRIC_NAME_TO_KEY: Record<string, MetricKey> = {
  '수축기혈압': 'sbp', '수축기 혈압': 'sbp',
  '이완기혈압': 'dbp', '이완기 혈압': 'dbp',
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
};

/** 시계열 응답의 내부 키를 사람이 읽는 이름으로 (24번 기타수정 #3 — non_HDL 등이 그대로 노출되던 문제). */
export const METRIC_LABEL: Record<string, string> = {
  sbp: '수축기혈압', dbp: '이완기혈압', fbs: '공복혈당', glucose: '공복혈당',
  bmi: '체질량지수', waist: '허리둘레', weight: '체중',
  ldl: 'LDL 콜레스테롤', hdl: 'HDL 콜레스테롤', tg: '중성지방',
  non_HDL: 'Non-HDL 콜레스테롤', total_chol: '총콜레스테롤',
  ast: 'AST', alt: 'ALT', ggt: '감마-GTP',
  creatinine: '혈청 크레아티닌', hb: '혈색소', egfr: 'eGFR',
};

/** 시계열/계산기 응답의 키를 표시용 이름으로. 모르는 키는 원본을 그대로 쓴다. */
export function metricLabel(key: string): string {
  return METRIC_LABEL[key] ?? key;
}

/**
 * 백엔드 status 코드 → 3단계 표시.
 * 세 단어(정상·주의·위험)는 모두 백엔드 STATUS_LABELS에 실제로 등장하는 단어다 —
 * 우리가 새로 만들어낸 표현이 아니다.
 */
export function statusFromBackend(status: string): Status {
  if (status === 'normal' || status === 'normal_good' || status === 'info') return '정상';
  if (status === 'caution' || status === 'high' || status === 'low') return '주의';
  return '위험'; // extremely_low / very_low / very_high / extremely_high
}

/** 백엔드 리포트 1건 → 화면용 요약 모양. 판정·점수는 백엔드 값을 그대로 쓴다. */
export function adaptReport(payload: RealReportPayload): Report {
  const c = payload.comprehensive;
  const evals = c?.all_evaluations ?? [];
  const values: Partial<Record<MetricKey, number>> = {};
  const statusByKey: Partial<Record<MetricKey, Status>> = {};

  for (const e of evals) {
    const key = METRIC_NAME_TO_KEY[e.metric];
    if (!key) continue; // 모르는 명칭은 조용히 건너뛴다 — 화면을 깨뜨리지 않는다
    values[key] = e.value;
    statusByKey[key] = statusFromBackend(e.status);
  }

  const manageCount = evals.filter((e) => e.status === 'high' || e.status === 'low').length;
  const trackCount = evals.filter(
    (e) => e.status.startsWith('very_') || e.status.startsWith('extremely_'),
  ).length;
  const bad = manageCount + trackCount;

  return {
    year: payload.year,
    date: String(payload.checkup?.exam_date ?? payload.checkup?.['검진일'] ?? `${payload.year}-01-01`),
    hospital: String(payload.checkup?.hospital ?? payload.checkup?.['검진기관'] ?? ''),
    status: bad === 0 ? '정상' : bad <= 3 ? '주의' : '위험',
    summary: payload.basic_report?.summary ?? c?.summary?.overall_status ?? '',
    score: Math.round(c?.summary?.risk_score ?? 0),
    manageCount,
    trackCount,
    values,
    statusByKey,
  };
}
