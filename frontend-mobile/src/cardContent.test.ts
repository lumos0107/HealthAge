import { describe, expect, it } from 'vitest';
import { cardContent, cardContentFor } from './data';
import { trendDirection } from './interpret';

/** byTrend가 붙은 카드 = 방향을 가정한 문장이 있던 카드. 갈래를 빠뜨리지 않았는지 여기서 강제한다. */
const BRANCHED = Object.entries(cardContent).filter(([, c]) => c.byTrend).map(([t]) => t);

describe('trendDirection — 여러 해 값이 어느 쪽으로 움직였나', () => {
  it('첫 회차보다 오르면 up', () => {
    expect(trendDirection([110, 120, 138])).toBe('up');
  });

  it('첫 회차보다 내리면 down', () => {
    expect(trendDirection([150, 140, 132])).toBe('down');
  });

  it('상대 변화가 5% 미만이면 flat — groupSummary가 «큰 변화 없이 비슷한 수준»이라 말하는 경계와 같다', () => {
    expect(trendDirection([120, 121, 123])).toBe('flat');   // +2.5%
    expect(trendDirection([120, 119, 115])).toBe('flat');   // −4.2%
    expect(trendDirection([120, 121, 127])).toBe('up');     // +5.8%
  });

  it('측정 안 한 해는 건너뛴다', () => {
    expect(trendDirection([110, null, undefined, 138])).toBe('up');
  });

  it('비교할 해가 없으면 null — 방향을 모를 때 아무 갈래나 고르지 않는다', () => {
    expect(trendDirection([120])).toBeNull();
    expect(trendDirection([])).toBeNull();
    expect(trendDirection([null, null])).toBeNull();
  });
});

describe('cardContentFor — 추세에 맞는 해설을 고른다', () => {
  it('혈압이 내려간 사람에게 «올라가는 흐름»이라고 말하지 않는다', () => {
    const down = cardContentFor('혈압', 'down');
    expect(down.meaning).not.toMatch(/올라가|오르는/);
    expect(down.meaning).toMatch(/내려가|줄고/);
  });

  it('혈압이 올라간 사람에게는 원래 문장을 그대로 준다', () => {
    expect(cardContentFor('혈압', 'up').meaning).toBe(cardContent['혈압'].byTrend!.up!.meaning);
  });

  it('큰 변화가 없으면 «유지»로 말한다', () => {
    const flat = cardContentFor('혈압', 'flat');
    expect(flat.meaning).toMatch(/유지/);
    expect(flat.meaning).not.toMatch(/올라가는 흐름|내려가는 흐름/);
  });

  it('방향을 모르면(null) 기본 문장으로 돌아간다', () => {
    expect(cardContentFor('혈압', null).meaning).toBe(cardContent['혈압'].meaning);
  });

  it('방향을 가정하지 않던 카드는 추세와 무관하게 그대로다', () => {
    // 지질의 meaning은 «어떤 조합이 위험한가»라는 일반 설명이라 이 사람 추세와 무관하게 참이다.
    for (const dir of ['up', 'down', 'flat', null] as const) {
      expect(cardContentFor('지질', dir).meaning).toBe(cardContent['지질'].meaning);
    }
  });

  it('갈래를 만든 카드는 오름·내림·유지 셋을 모두 갖는다', () => {
    expect(BRANCHED.length).toBeGreaterThan(0);
    for (const title of BRANCHED) {
      const b = cardContent[title].byTrend!;
      expect(Object.keys(b).sort(), `${title}에 빠진 갈래가 있다`).toEqual(['down', 'flat', 'up']);
    }
  });

  it('내림 갈래 어디에도 «오른다»는 말이 남아 있지 않다', () => {
    for (const title of BRANCHED) {
      expect(cardContentFor(title, 'down').meaning, title).not.toMatch(/올라가|오르는|오르고|오른다면/);
    }
  });

  it('유지 갈래 어디에도 방향을 단정하는 말이 남아 있지 않다', () => {
    for (const title of BRANCHED) {
      expect(cardContentFor(title, 'flat').meaning, title).not.toMatch(/올라가는 흐름|내려가는 흐름/);
    }
  });
});

describe('cardContentFor — 상태를 가정한 tips를 가른다', () => {
  it('정상인 사람에게 «나트륨이 가장 효과가 큰 습관»이라고 말하지 않는다', () => {
    const tips = cardContentFor('혈압', 'flat', '정상').tips ?? [];
    expect(tips.join(' ')).not.toMatch(/가장 효과가 큰/);
  });

  it('주의·위험인 사람에게는 개선 프레임을 그대로 준다', () => {
    const tips = cardContentFor('혈압', 'up', '주의').tips ?? [];
    expect(tips.join(' ')).toMatch(/나트륨/);
  });

  it('상태를 모르면 기본 tips로 돌아간다', () => {
    expect(cardContentFor('혈압', 'up').tips).toEqual(cardContent['혈압'].tips);
  });

  it('tipsByStatus가 없는 카드는 상태와 무관하게 그대로다', () => {
    for (const s of ['정상', '주의', '위험'] as const) {
      expect(cardContentFor('지질', 'up', s).tips).toEqual(cardContent['지질'].tips);
    }
  });

  it('없는 카드를 물으면 빈 값을 준다 — 화면이 터지지 않는다', () => {
    expect(cardContentFor('없는 카드', 'up')).toEqual({ definition: undefined, detail: undefined, meaning: undefined, tips: undefined });
  });
});
