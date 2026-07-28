import { describe, expect, it } from 'vitest';
import { alcoholWeeklyGrams, buildCheckupIcs, fmt, ocrFlagText } from './format';

describe('ocrFlagText', () => {
  it('flag가 없으면 null', () => {
    expect(ocrFlagText()).toBeNull();
    expect(ocrFlagText([])).toBeNull();
  });
  it('아는 flag를 사람말로 바꾼다', () => {
    expect(ocrFlagText(['out_of_range_suspect'])).toBe('일반적인 범위를 벗어난 값이에요');
    expect(ocrFlagText(['low_llm_confidence'])).toBe('글자가 흐릿해 판독이 불확실했어요');
  });
  it('여러 개면 가운뎃점으로 잇는다', () => {
    expect(ocrFlagText(['out_of_range_suspect', 'low_llm_confidence']))
      .toBe('일반적인 범위를 벗어난 값이에요 · 글자가 흐릿해 판독이 불확실했어요');
  });
  it('모르는 flag는 그대로 노출하지 않는다', () => {
    expect(ocrFlagText(['some_internal_code'])).toBeNull();
  });
});

describe('alcoholWeeklyGrams', () => {
  it('주횟수 × 잔수 × 술종류 g으로 계산해 반올림한다', () => {
    expect(alcoholWeeklyGrams(2, 3, '소주')).toBe(42);   // 2*3*7
    expect(alcoholWeeklyGrams(1, 2, '와인')).toBe(28);   // 1*2*14
  });
  it('모르는 술 종류는 0', () => {
    expect(alcoholWeeklyGrams(2, 3, '없는술')).toBe(0);
  });
});

describe('fmt', () => {
  it('값이 없으면 미측정', () => {
    expect(fmt(null)).toBe('미측정');
    expect(fmt(undefined)).toBe('미측정');
  });
  it('0은 미측정이 아니다', () => {
    expect(fmt(0, 'mg/dL')).toBe('0 mg/dL');
  });
  it('단위를 붙인다', () => {
    expect(fmt(112, 'mg/dL')).toBe('112 mg/dL');
    expect(fmt(23.4)).toBe('23.4');
  });
});

describe('buildCheckupIcs', () => {
  const ics = buildCheckupIcs(2027, '홍길동');
  it('유효한 VCALENDAR 골격을 만든다', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VEVENT');
  });
  it('권장 연도 1월 10일 종일 일정으로 잡는다', () => {
    expect(ics).toContain('DTSTART;VALUE=DATE:20270110');
  });
  it('제목에 이름을 넣는다', () => {
    expect(ics).toContain('SUMMARY:홍길동 님 건강검진 받는 해');
  });
  it('줄바꿈은 CRLF (RFC 5545)', () => {
    expect(ics).toContain('\r\n');
  });
});
