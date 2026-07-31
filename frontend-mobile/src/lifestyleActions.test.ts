import { describe, expect, it } from 'vitest';
import { reports } from './data';
import { ACTIONS, deviationTotal, rankActions, type Ctx } from './lifestyleActions';

/** 데모 페르소나 2024년 회차(홍길동, 1968년생 남, 현재 흡연·주 280g 음주).
 *  실제 화면이 쓰는 값 그대로 — 여기서 지어내면 화면과 다른 걸 검증하게 된다. */
const latest = reports[reports.length - 1];

const demoCtx: Ctx = {
  values: latest.values,
  gender: 1,
  weightKg: latest.values.weight,
  smoking: 'current',
  alcoholWeeklyG: 280,
  // 138/88 — 대사증후군 혈압 인자(130/85)에는 걸리지만 고혈압군(140/90)은 아니다.
  hypertensive: false,
};

const ratioOf = (id: string, ctx: Ctx = demoCtx) =>
  rankActions(ACTIONS, ctx).find((r) => r.id === id)!.reductionRatio;

describe('deviationTotal — 대사증후군 5기준에서 얼마나 벗어나 있나', () => {
  it('기준을 하나도 안 벗어나면 0이다', () => {
    const clean = { ...latest.values, waist: 80, sbp: 110, dbp: 70, glucose: 85, triglyceride: 100, hdl: 60 };
    expect(deviationTotal(clean, 1)).toBe(0);
  });

  it('데모 페르소나는 6개 경계를 모두 넘어 이탈도가 0.46 근처다', () => {
    // 허리 3/90 + 수축기 8/130 + 이완기 3/85 + 혈당 12/100 + 중성지방 28/150 + HDL 1/40
    expect(deviationTotal(latest.values, 1)).toBeCloseTo(0.4618, 3);
  });

  it('성별로 기준이 다르다 — 같은 값이어도 여성은 허리 85 · HDL 50으로 잰다', () => {
    const v = { ...latest.values, waist: 88, hdl: 45 };
    expect(deviationTotal(v, 2)).toBeGreaterThan(deviationTotal(v, 1));
  });

  it('측정되지 않은 항목은 세지 않는다', () => {
    const partial = { ...latest.values, triglyceride: undefined as unknown as number };
    expect(deviationTotal(partial, 1)).toBeLessThan(deviationTotal(latest.values, 1));
  });
});

describe('rankActions — 효과크기로 순서를 매긴다', () => {
  it('데모 페르소나에게는 체중 → 유산소 → 절주 → 금연 순이다', () => {
    const ranked = rankActions(ACTIONS, demoCtx).map((r) => r.id);
    expect(ranked.slice(0, 4)).toEqual(['weight', 'aerobic', 'alcohol', 'quit_smoking']);
  });

  it('감소폭은 인수인계 문서가 손으로 계산한 값과 맞는다', () => {
    // 문서 §4 A-2: 체중 −27.8 / 유산소 −20.6 / 절주 −15.9 / 금연 −5.4
    // 절주만 다르다 — 문서는 하루 6잔 이상 층을 썼는데 ACTIONS는 280g/주를 5.7잔으로
    // 계산해 4~6잔 층에 넣는다. 그 층 구분은 기존 코드의 것이고 이번 변경 대상이 아니다.
    expect(ratioOf('weight')).toBeCloseTo(0.279, 2);
    expect(ratioOf('aerobic')).toBeCloseTo(0.206, 2);
    expect(ratioOf('quit_smoking')).toBeCloseTo(0.054, 3);
  });

  it('대사증후군 기준을 하나도 안 움직이는 행동은 0%다', () => {
    // 식단+운동 병행은 ALT·AST만 움직인다 — 어느 대사증후군 기준식에도 안 들어간다.
    expect(ratioOf('diet_liver')).toBe(0);
  });

  it('실제로 줄어든 기준만 movedFactors에 담는다', () => {
    // 금연이 움직이는 건 HDL 하나뿐이다.
    const smoke = rankActions(ACTIONS, demoCtx).find((r) => r.id === 'quit_smoking')!;
    expect(smoke.movedFactors).toEqual(['HDL']);
  });

  it('체중 감량은 여러 기준을 한 번에 움직인다', () => {
    const weight = rankActions(ACTIONS, demoCtx).find((r) => r.id === 'weight')!;
    expect(weight.movedFactors).toContain('허리둘레');
    expect(weight.movedFactors).toContain('중성지방');
    expect(weight.movedFactors).toContain('혈압');
    expect(weight.movedFactors).toContain('HDL');
  });

  it('수축기·이완기는 «혈압» 하나로 센다 — 화면에 같은 말이 두 번 나오면 안 된다', () => {
    const weight = rankActions(ACTIONS, demoCtx).find((r) => r.id === 'weight')!;
    expect(weight.movedFactors.filter((f) => f === '혈압')).toHaveLength(1);
  });

  it('해당하지 않는 행동은 목록에 없다 — 비흡연·비음주자에게 금연·절주를 매기지 않는다', () => {
    const ranked = rankActions(ACTIONS, { ...demoCtx, smoking: 'never', alcoholWeeklyG: 0 });
    expect(ranked.map((r) => r.id)).not.toContain('quit_smoking');
    expect(ranked.map((r) => r.id)).not.toContain('alcohol');
  });

  it('기준을 하나도 안 벗어난 사람은 전부 0%이고 원래 순서를 지킨다', () => {
    const clean = { ...latest.values, waist: 80, sbp: 110, dbp: 70, glucose: 85, triglyceride: 100, hdl: 60 };
    const ranked = rankActions(ACTIONS, { ...demoCtx, values: clean });
    expect(ranked.every((r) => r.reductionRatio === 0)).toBe(true);
    expect(ranked.map((r) => r.id)).toEqual(
      ACTIONS.filter((a) => a.applies({ ...demoCtx, values: clean })).map((a) => a.id),
    );
  });

  it('감소폭은 0~1 사이다 — 이탈도가 음수로 내려가 과대평가되지 않는다', () => {
    for (const r of rankActions(ACTIONS, demoCtx)) {
      expect(r.reductionRatio).toBeGreaterThanOrEqual(0);
      expect(r.reductionRatio).toBeLessThanOrEqual(1);
    }
  });
});
