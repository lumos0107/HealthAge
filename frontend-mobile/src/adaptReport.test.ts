// 실계정 응답 → Report 변환 회귀 테스트.
//
// 잡은 버그: adaptReport가 백엔드 `summary.risk_score`를 Report.score에 그대로 넣었다.
// risk_score는 '나쁨 점수'(0=건강, 클수록 나쁨)인데 화면은 이 필드를 100점 만점 '좋음 점수'로
// 그린다(AnalysisScreen 색 임계값 70/40, reportExport "/ 100점"). 실계정에서 극성이 뒤집혀
// 건강한 사람이 0점, 나쁜 사람이 높은 점수로 보였다. 더미·홈과 같은 감점식으로 통일했다.
import { describe, expect, it, vi } from 'vitest';

vi.mock('./api', () => ({
  supabase: {},
  supabaseConfigured: false,
  getAccessToken: async () => null,
  apiFetch: async () => ({}),
}));

const { adaptReport, adaptEvaluation } = await import('./health');
const { computeScore, SCORE_PENALTY } = await import('./data');

/** 백엔드 all_evaluations 한 건 — 점수에 쓰이는 metric/value/status만 채운다. */
const ev = (metric: string, value: number, status: string) => ({
  metric, value, status,
  label: '', icon: '', color: '', meaning: '', direction: '', unit: '',
});

/** 백엔드가 실제로 계산하듯 risk_score를 만든다(pipeline.py:190) — 이 값을 쓰면 안 된다는 걸 보이기 위해. */
const riskScore = (evals: { status: string }[]) =>
  evals.reduce((sum, e) => sum + (
    e.status.startsWith('extremely_') ? 5
      : e.status.startsWith('very_') ? 3
      : (e.status === 'high' || e.status === 'low') ? 1
      : e.status === 'caution' ? 0.5 : 0), 0);

const payload = (evals: ReturnType<typeof ev>[]) => ({
  year: 2024,
  checkup: { exam_date: '2024-05-02', hospital: '제주대학교병원' },
  comprehensive: {
    summary: {
      total_metrics: evals.length, risk_count: 0, warning_count: 0, normal_count: 0,
      elderly_warning_count: 0, risk_score: riskScore(evals), overall_status: '주의 필요',
    },
    all_evaluations: evals,
  },
});

describe('adaptReport — 점수 극성', () => {
  it('건강한 사람은 100점이다 (risk_score 0을 그대로 쓰면 0점이 됐다)', () => {
    const p = payload([
      ev('수축기혈압', 112, 'normal'),
      ev('식전혈당(공복혈당)', 88, 'normal'),
      ev('신장', 172, 'info'),
    ]);
    expect(p.comprehensive.summary.risk_score).toBe(0);   // 백엔드 원본
    expect(adaptReport(p as any).score).toBe(100);        // 화면에 쓰는 값
  });

  it('나쁠수록 점수가 내려간다 — 주의 -6 / 위험 -12', () => {
    const p = payload([
      ev('수축기혈압', 138, 'high'),          // 주의
      ev('HDL콜레스테롤', 39, 'low'),          // 주의
      ev('트리글리세라이드', 320, 'very_high'), // 위험
    ]);
    const r = adaptReport(p as any);
    expect(r.manageCount).toBe(2);
    expect(r.trackCount).toBe(1);
    expect(r.score).toBe(100 - SCORE_PENALTY.manage * 2 - SCORE_PENALTY.track * 1); // 76
    // risk_score(1+1+3=5)를 그대로 썼다면 5점 — 색 임계값 40 아래라 무조건 빨강이었다.
    expect(p.comprehensive.summary.risk_score).toBe(5);
  });

  it("'caution'도 주의로 세서 statusByKey와 어긋나지 않는다", () => {
    // statusFromBackend는 caution을 '주의'로 매핑한다. 예전 개수 계산은 caution을 빼서
    // 배지는 주의인데 점수는 감점이 없는 상태가 됐다.
    const r = adaptReport(payload([ev('감마지티피', 70, 'caution')]) as any);
    expect(r.statusByKey.ggt).toBe('주의');
    expect(r.manageCount).toBe(1);
    expect(r.score).toBe(100 - SCORE_PENALTY.manage);
  });

  it('점수는 0 아래로 내려가지 않는다', () => {
    const evals = Array.from({ length: 12 }, (_, i) => ev(`m${i}`, 1, 'extremely_high'));
    expect(adaptReport(payload(evals) as any).score).toBe(0);
  });
});

describe('분석 탭 점수 == 홈 점수 (같은 검진 한 건)', () => {
  // AnalysisScreen은 report.score를, DashboardScreen은 computeScore(정의들)를 쓴다.
  // 두 값이 갈리면 같은 검진인데 탭마다 다른 점수가 보인다.
  it('두 경로가 같은 값을 낸다', () => {
    const evals = [
      ev('수축기혈압', 138, 'high'),
      ev('이완기혈압', 88, 'high'),
      ev('식전혈당(공복혈당)', 112, 'high'),
      ev('트리글리세라이드', 320, 'very_high'),
      ev('감마지티피', 70, 'caution'),
      ev('혈색소', 15, 'normal'),
      ev('신장', 172, 'info'),
    ];
    const report = adaptReport(payload(evals) as any);
    const defs = evals.map((e) => adaptEvaluation(e as any));
    expect(computeScore(defs).score).toBe(report.score);
    expect(computeScore(defs).manageCount).toBe(report.manageCount);
    expect(computeScore(defs).trackCount).toBe(report.trackCount);
  });
});
