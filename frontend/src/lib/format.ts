/** 검수 하이라이트 임계값 — 이 값 미만이면 "꼭 확인하세요"로 표시한다(표시 기준, 의학 기준 아님). */
export const OCR_LOW_CONFIDENCE = 0.7;

/** OCR confidence flag → 사람이 읽는 이유. 모르는 flag는 노출하지 않는다. */
export function ocrFlagText(flags?: string[]): string | null {
  if (!flags?.length) return null;
  const parts: string[] = [];
  if (flags.includes('out_of_range_suspect')) parts.push('일반적인 범위를 벗어난 값이에요');
  if (flags.includes('low_llm_confidence')) parts.push('글자가 흐릿해 판독이 불확실했어요');
  return parts.length ? parts.join(' · ') : null;
}

/** 술 종류별 1잔 순알코올(g) 근사 — 순알코올 g ≈ 용량(ml) × 도수 × 0.789. 모바일 LifestyleForm과 동일. */
export const GRAMS_PER_GLASS: Record<string, number> = {
  소주: 7, 맥주: 7, 막걸리: 9, 와인: 14, 양주: 13,
};
export const DRINK_TYPES = ['소주', '맥주', '막걸리', '와인', '양주'] as const;

export function alcoholWeeklyGrams(freq: number, glasses: number, type: string): number {
  return Math.round(freq * glasses * (GRAMS_PER_GLASS[type] ?? 0));
}

/** 값 표시 — 없으면 "미측정". 0은 유효한 값이므로 미측정이 아니다. */
export function fmt(value: number | null | undefined, unit?: string): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '미측정';
  return unit ? `${value} ${unit}` : String(value);
}

/**
 * 다음 검진 시기를 캘린더에 넣을 .ics 문자열.
 * 웹은 백그라운드 로컬 알림을 예약할 수 없으므로 앱 ⑧ 리마인더의 웹 등가물로 쓴다.
 * 근거 연도는 insight.next_exam_year — 우리가 만들어내는 값이 아니다.
 */
export function buildCheckupIcs(year: number, name: string): string {
  const date = `${year}0110`; // 권장 검진 연도 1월 10일 (앱 알림과 같은 날)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//WITHUS//Health Age//KO',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:withus-checkup-${year}@health-age`,
    `DTSTART;VALUE=DATE:${date}`,
    `SUMMARY:${name} 님 건강검진 받는 해`,
    'DESCRIPTION:분석 결과에 따른 권장 검진 시기입니다. 참고 정보이며 진단이 아닙니다.',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ];
  return lines.join('\r\n'); // RFC 5545는 CRLF를 요구한다
}
