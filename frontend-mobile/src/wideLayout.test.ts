import { describe, expect, it } from 'vitest';
import { analysisCols, isWideLayout, keepSelection, readSearch, recordsSplit } from './wideLayout';

describe('isWideLayout — 넓은 모니터 배치(wide)를 켤지', () => {
  it('웹은 창 폭 1280부터 켠다', () => {
    expect(isWideLayout(1279, 'web', '')).toBe(false);
    expect(isWideLayout(1280, 'web', '')).toBe(true);
  });

  it('네이티브 앱은 폭과 상관없이 켜지 않는다', () => {
    expect(isWideLayout(2560, 'android', '')).toBe(false);
    expect(isWideLayout(2560, 'ios', '')).toBe(false);
  });

  it('주소에 wide=0이 있으면 끈다(전시장 비상 단추)', () => {
    expect(isWideLayout(1920, 'web', '?wide=0')).toBe(false);
    expect(isWideLayout(1920, 'web', '?a=1&wide=0')).toBe(false);
  });

  it('강제로 켜는 값은 없다 — wide=1이어도 폭 기준을 따른다', () => {
    expect(isWideLayout(1100, 'web', '?wide=1')).toBe(false);
    expect(isWideLayout(1920, 'web', '?wide=1')).toBe(true);
  });
});

describe('readSearch — 주소 뒤 ?… 를 안전하게 읽기', () => {
  it('네이티브에서는 window가 있어도 location을 건드리지 않는다', () => {
    expect(readSearch('android', {})).toBe('');
    expect(readSearch('android', { location: { search: '?wide=0' } })).toBe('');
  });

  it('웹이라도 location이 없으면 빈 값', () => {
    expect(readSearch('web', {})).toBe('');
    expect(readSearch('web', undefined)).toBe('');
  });

  it('웹에서 location.search를 그대로 돌려준다', () => {
    expect(readSearch('web', { location: { search: '?wide=0' } })).toBe('?wide=0');
  });
});

describe('recordsSplit — 검사항목 넓은 배치의 오른쪽 상세 폭과 목록 열 수', () => {
  it('1280 창(본문 1184): 상세 440, 목록 2열', () => {
    expect(recordsSplit(1184)).toEqual({ paneW: 440, listCols: 2 });
  });
  it('1366 창(본문 1270): 상세 461, 목록 2열', () => {
    expect(recordsSplit(1270)).toEqual({ paneW: 461, listCols: 2 });
  });
  it('1536 창(본문 1440): 상세 526, 목록 2열 — 3열이면 카드가 300보다 좁다', () => {
    expect(recordsSplit(1440)).toEqual({ paneW: 526, listCols: 2 });
  });
  it('1920·2560 창(본문 상한 1824): 상세 600, 목록 3열', () => {
    expect(recordsSplit(1824)).toEqual({ paneW: 600, listCols: 3 });
  });
});

describe('analysisCols — 분석 요약 카드를 한 줄에 몇 장', () => {
  it('격자 폭(본문 − 56)이 1450 이상이면 4장, 아니면 2×2', () => {
    expect(analysisCols(1824)).toBe(4);
    expect(analysisCols(1506)).toBe(4);
    expect(analysisCols(1505)).toBe(2);
    expect(analysisCols(1440)).toBe(2);
    expect(analysisCols(1184)).toBe(2);
  });
});

describe('keepSelection — 검사항목 오른쪽 칸에서 고른 항목을 그해 목록에 맞춰 둘지', () => {
  it('그해 목록에 있으면 그대로', () => {
    expect(keepSelection(['bmi', 'sbp'], 'sbp')).toBe('sbp');
  });
  it('그해 목록에 없으면 고른 것을 지운다(첫 항목으로 바뀌고, 다른 해로 가도 되살아나지 않음)', () => {
    expect(keepSelection(['bmi', 'sbp'], 'hdl')).toBeNull();
  });
  it('고른 것이 없으면 없는 그대로', () => {
    expect(keepSelection(['bmi'], null)).toBeNull();
  });
});
