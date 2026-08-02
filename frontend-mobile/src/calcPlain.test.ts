import { describe, expect, it } from 'vitest';
import { dummyComboAnalysisByYear } from './dummyAnalysis';

/**
 * 1뎁스 결론은 백엔드 `plain`(해요체 한 문장)을 그대로 쓴다. `interpretation`은 학회
 * 원문 라벨이라 2뎁스 배지 전용이다(스펙 §2-1「1뎁스 결론 — 개수가 아니라 판정」).
 *
 * ⚠️ 이 테스트가 막으려는 것은 «조용한 빈칸»이다. `plain`은 선택 필드라 빠져도
 * tsc가 잡지 않고, worstInterpretation은 null을 돌려주므로 카드가 결론 없이 그려진다.
 * 기록 39 §6이 적은 «tsc도 테스트도 통과하는데 화면만 빈칸» 사고와 같은 종류다.
 *
 * 세 가지를 동시에 잡는다 —
 *   1. 백엔드가 어느 분기에서 plain을 빠뜨린 경우
 *   2. 백엔드는 고쳤는데 더미를 다시 안 만든 경우
 *   3. 나중에 다른 카드가 plain 없는 계산기로 결론을 만들려는 경우
 */

/** 1뎁스 결론에 오르는 계산기 키. 늘리려면 그 계산기에 plain부터 넣어야 한다. */
const SUMMARY_CALC_KEYS = ['bard'];

const years = Object.keys(dummyComboAnalysisByYear).map(Number).sort();

describe('1뎁스 결론용 plain — 데모 전 연도', () => {
  it('연도가 하나 이상 있다 (이 테스트가 공회전하지 않도록)', () => {
    expect(years.length).toBeGreaterThan(0);
  });

  it.each(years)('%i년 FLI·HSI에 plain이 있다', (year) => {
    const fl = dummyComboAnalysisByYear[year]?.fatty_liver?.indices;
    for (const key of ['fli', 'hsi'] as const) {
      const idx = fl?.[key];
      if (!idx) continue;   // 입력값이 없어 계산되지 않은 해는 대상이 아니다
      expect(idx.plain, `${year} ${key}`).toBeTruthy();
      expect(idx.plain, `${year} ${key}`).toMatch(/요$/);   // §7 해요체
    }
  });

  it.each(years)('%i년 결론용 계산기에 plain이 있다', (year) => {
    const items = dummyComboAnalysisByYear[year]?.calculators?.items ?? [];
    for (const key of SUMMARY_CALC_KEYS) {
      const it = items.find((x) => x.key === key);
      if (!it) continue;
      expect(it.plain, `${year} ${key}`).toBeTruthy();
      expect(it.plain, `${year} ${key}`).toMatch(/요$/);
    }
  });

  it('plain은 원문 라벨을 그대로 베끼지 않는다 — 베꼈으면 번역이 안 된 것이다', () => {
    for (const year of years) {
      const fl = dummyComboAnalysisByYear[year]?.fatty_liver?.indices;
      const items = dummyComboAnalysisByYear[year]?.calculators?.items ?? [];
      const pairs = [fl?.fli, fl?.hsi, ...items.filter((x) => SUMMARY_CALC_KEYS.includes(x.key))];
      for (const p of pairs) {
        if (!p?.plain) continue;
        expect(p.plain, `${year}`).not.toBe(p.interpretation);
      }
    }
  });

  it('1뎁스 결론에 전문 약어·컷오프 숫자가 새지 않는다', () => {
    // 축 2 — NPV~96% · (<1) 같은 것이 결론 문장에 오면 안 된다.
    const banned = /NPV|[<>≥≤]\s*\d|%/;
    for (const year of years) {
      const fl = dummyComboAnalysisByYear[year]?.fatty_liver?.indices;
      const items = dummyComboAnalysisByYear[year]?.calculators?.items ?? [];
      for (const p of [fl?.fli, fl?.hsi, ...items.filter((x) => SUMMARY_CALC_KEYS.includes(x.key))]) {
        if (!p?.plain) continue;
        expect(p.plain, `${year}: ${p.plain}`).not.toMatch(banned);
      }
    }
  });
});
