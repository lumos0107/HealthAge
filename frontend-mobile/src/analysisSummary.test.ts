// 분석 탭 태블릿 1뎁스 요약(①~④)을 만드는 순수 함수 테스트.
// 화면과 PDF가 같은 함수를 쓰므로, 데모 계정 자료로 화면에 보이던 값이 그대로 나오는지 확인한다.
import { describe, expect, it, vi } from 'vitest';

vi.mock('./api', () => ({
  supabase: {},
  supabaseConfigured: false,
  getAccessToken: async () => null,
  apiFetch: async () => ({}),
}));

const { analysisSummary } = await import('./analysisSummary');
const { reports, metricDefinitions, metricsForReport } = await import('./data');
const { sortByAttention } = await import('./interpret');
const { dummyComboAnalysisByYear, dummyEgfrByYear, dummyRecommendationsByYear } = await import('./dummyAnalysis');

const r2024 = reports.find((r) => r.year === 2024)!;
const base = {
  report: r2024,
  metricDefinitions,
  recommendations: dummyRecommendationsByYear[2024] ?? null,
  egfr: dummyEgfrByYear[2024] ?? null,
  combo: dummyComboAnalysisByYear[2024] ?? null,
  gender: 1 as const,
  smoking: 'current' as const,
  alcoholWeeklyG: 280,
};

describe('analysisSummary — ① 내 건강 점수는', () => {
  it('2024년 데모: 점수 40, 「주의가 필요해요」, 주의 8·위험 1', () => {
    const s = analysisSummary(base);
    expect(s.score).toBe(40);
    expect(s.scoreLabel).toBe('주의가 필요해요');
    expect(s.counts.warn).toBe(8);
    expect(s.counts.danger).toBe(1);
  });

  it('정상 개수는 키·몸무게(참고값)를 빼고 센다', () => {
    const s = analysisSummary(base);
    const judged = metricsForReport(r2024, metricDefinitions).filter((m) => !m.infoOnly);
    expect(s.counts.normal).toBe(judged.filter((m) => m.status === '정상').length);
  });

  it('먼저 확인할 항목은 기준 밖 항목을 주의 순으로 최대 3개', () => {
    const s = analysisSummary(base);
    const expected = sortByAttention(metricsForReport(r2024, metricDefinitions).filter((m) => !m.infoOnly && m.status !== '정상'))
      .slice(0, 3).map((m) => m.shortName ?? m.name);
    expect(s.focus).toEqual(expected);
  });

  it('점수에 안 들어가는 신호에 대사증후군이 있다', () => {
    const s = analysisSummary(base);
    expect(s.outsideScore.map((o) => o.label)).toContain('대사증후군');
  });
});

describe('analysisSummary — ②③④', () => {
  it('② 계산 지표 행이 있고 첫 칸은 라벨', () => {
    const s = analysisSummary(base);
    expect(s.computed.length).toBeGreaterThan(0);
    expect(s.computed.map(([label]) => label)).toContain('신장 기능');
  });

  it('③ 또래 등수는 최대 3개, 등수 내림차순', () => {
    const s = analysisSummary(base);
    expect(s.peers.length).toBeLessThanOrEqual(3);
    const ranks = s.peers.map((p) => p.rank);
    expect([...ranks].sort((a, b) => b - a)).toEqual(ranks);
  });

  it('④ 먼저 할 행동은 문장이다', () => {
    const s = analysisSummary(base);
    expect(typeof s.topAction).toBe('string');
    expect(s.topAction!.length).toBeGreaterThan(0);
  });

  it('그 해 분석 자료가 없으면 ②는 비고 ④ 우선 메시지는 null — 오류 없이', () => {
    const s = analysisSummary({ ...base, recommendations: null, egfr: null, combo: null });
    expect(s.computed).toEqual([]);
    expect(s.priorityMessage).toBeNull();
    expect(s.outsideScore).toEqual([]);
  });
});
