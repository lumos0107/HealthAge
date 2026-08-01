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

  it('데모 페르소나는 6개 중 4개 경계를 넘어 이탈도가 0.22 근처다', () => {
    // 2024년 회차(134/86 · 혈당 108 · 허리 88 · 중성지방 165 · HDL 45):
    //   허리 88<90 → 0 · 수축기 4/130 · 이완기 1/85 · 혈당 8/100 · 중성지방 15/150 · HDL 45≥40 → 0
    //   = 0.030769 + 0.011765 + 0.08 + 0.1 = 0.222534
    // 2020년 바닥에서 허리와 HDL이 기준 안으로 돌아와 두 항이 0이 됐다.
    expect(deviationTotal(latest.values, 1)).toBeCloseTo(0.2225, 3);
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
  it('데모 페르소나에게는 유산소 → 체중 → 절주 순이다', () => {
    // ⚠️ 순서가 페르소나에 달려 있다. 2020년 바닥일 때는 체중이 1위였다 —
    //    허리 95cm의 이탈이 커서 감량이 가장 크게 줄였기 때문이다. 2024년에는 허리가
    //    88cm(기준 아래)라 감량이 허리를 못 줄이고, 남은 혈압·중성지방에서
    //    유산소가 조금 앞선다.
    const ranked = rankActions(ACTIONS, demoCtx).map((r) => r.id);
    expect(ranked.slice(0, 3)).toEqual(['aerobic', 'weight', 'alcohol']);
  });

  it('금연은 대사증후군 이탈을 하나도 줄이지 못한다 — HDL이 이미 기준 위다', () => {
    // 금연이 움직이는 대사증후군 인자는 HDL 하나뿐인데, 2024년 HDL 45는 이미 기준(40)을
    // 넘어서 «줄일 이탈»이 없다. 0%가 나오는 것이 맞다 — 근거문서 §6-9의
    // "이건 안 움직입니다도 정보"에 해당한다. 심혈관 위험(ASCVD)에서는 여전히 크게 작용한다.
    expect(ratioOf('quit_smoking')).toBe(0);
  });

  it('대사증후군 기준을 하나도 안 움직이는 행동은 0%다', () => {
    // 식단+운동 병행은 ALT·AST만 움직인다 — 어느 대사증후군 기준식에도 안 들어간다.
    expect(ratioOf('diet_liver')).toBe(0);
  });

  it('실제로 줄어든 기준만 movedFactors에 담는다', () => {
    // 금연이 움직이는 건 HDL 하나뿐인데 2024년 HDL 45는 이미 기준 위다 → 담을 게 없다.
    const smoke = rankActions(ACTIONS, demoCtx).find((r) => r.id === 'quit_smoking')!;
    expect(smoke.movedFactors).toEqual([]);
  });

  it('체중 감량은 여러 기준을 한 번에 움직인다', () => {
    // 혈압·중성지방 둘을 함께 내린다. 허리·HDL은 «이미 기준 안»이라 담기지 않는다 —
    // 움직일 여지가 없는 것을 성과로 세면 감소폭이 부풀려진다.
    const weight = rankActions(ACTIONS, demoCtx).find((r) => r.id === 'weight')!;
    expect(weight.movedFactors).toContain('중성지방');
    expect(weight.movedFactors).toContain('혈압');
    expect(weight.movedFactors).not.toContain('허리둘레');
    expect(weight.movedFactors).not.toContain('HDL');
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
