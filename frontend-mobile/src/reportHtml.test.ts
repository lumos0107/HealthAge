// 결과 요약 PDF HTML(1쪽 검사항목 · 2쪽 히스토리 · 3쪽 분석) 테스트.
import { describe, expect, it, vi } from 'vitest';

vi.mock('./api', () => ({
  supabase: {},
  supabaseConfigured: false,
  getAccessToken: async () => null,
  apiFetch: async () => ({}),
}));

const { buildReportHtml } = await import('./reportHtml');
type PdfExtras = import('./reportHtml').PdfExtras;
const { reports, metricDefinitions } = await import('./data');
const { dummyComboAnalysisByYear, dummyEgfrByYear, dummyRecommendationsByYear, dummyHighlights, dummyInsight, dummyChangePace } = await import('./dummyAnalysis');

const byYear = (y: number) => reports.find((r) => r.year === y)!;
const demoExtras: PdfExtras = {
  reports,
  highlights: dummyHighlights,
  insight: dummyInsight,
  changePace: dummyChangePace,
  recommendationsByYear: dummyRecommendationsByYear,
  egfrByYear: dummyEgfrByYear,
  comboAnalysisByYear: dummyComboAnalysisByYear,
  gender: 1,
  smoking: 'current',
  alcoholWeeklyG: 280,
};
const pages = (html: string) => (html.match(/<section class="page">/g) ?? []).length;
/** 태그를 뺀 «보이는 글자» — 굵게 표시 같은 꾸밈에 상관없이 문장을 확인한다. */
const text = (html: string) => html.replace(/<[^>]+>/g, '');

describe('buildReportHtml — 1쪽 검사항목', () => {
  it('extras가 없으면 검사항목 쪽만(지금 PDF와 같음)', () => {
    const html = buildReportHtml(byYear(2024), metricDefinitions, '홍길동');
    expect(html).toContain('건강검진 결과 요약');
    expect(pages(html)).toBe(0);
    expect(html).not.toContain('히스토리');
  });

  it('키·몸무게(참고값)는 상태 칸에 「참고」', () => {
    const html = buildReportHtml(byYear(2024), metricDefinitions, '홍길동');
    const row = html.match(/<tr>\s*<td>키<\/td>[\s\S]*?<\/tr>/)?.[0] ?? '';
    expect(row).toContain('>참고</span>');
    expect(row).not.toContain('>정상</span>');
  });

  it('이름·병원은 HTML 이스케이프', () => {
    const html = buildReportHtml(byYear(2024), metricDefinitions, '<b>&');
    expect(html).toContain('&lt;b&gt;&amp;');
    expect(html).not.toContain('<b>&');
  });
});

describe('buildReportHtml — 2쪽 히스토리 · 3쪽 분석', () => {
  it('데모 2024년: 히스토리·분석 두 쪽이 붙는다', () => {
    const html = buildReportHtml(byYear(2024), metricDefinitions, '홍길동', demoExtras);
    expect(pages(html)).toBe(2);
    expect(text(html)).toContain('2020년 이후 점수가 오르고 있어요.');
    expect(html).toContain('우려할 변화');
    expect(html).toContain('크게 바뀐 항목');
    expect(html).toContain('다음 검진 권장: 2026년');
    expect(html).toContain('내 건강 점수는');
    expect(html).toContain('대사증후군');
    expect(html).toContain('부터 시작하면 현재 지표를 가장 크게 움직여요.');
  });

  it('2018년을 고르면 점수 그래프는 2018년까지만', () => {
    const html = buildReportHtml(byYear(2018), metricDefinitions, '홍길동', demoExtras);
    const svg = html.match(/<svg[\s\S]*?<\/svg>/)?.[0] ?? '';
    expect(svg).toContain('2018');
    expect(svg).not.toContain('2020');
    expect(svg).not.toContain('2024');
  });

  it('검진이 한 해뿐이면 그래프 없이 문장만, NaN 없음', () => {
    const html = buildReportHtml(byYear(2024), metricDefinitions, '홍길동', { ...demoExtras, reports: [byYear(2024)] });
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('NaN');
    expect(text(html)).toContain('이번 검진 점수예요.');
  });

  it('히스토리 서술 자료가 없으면(실계정 미분석) 그 묶음 제목을 빼고 그래프만', () => {
    const html = buildReportHtml(byYear(2024), metricDefinitions, '홍길동', { ...demoExtras, highlights: null, insight: null, changePace: null });
    expect(html).toContain('<svg');
    expect(html).not.toContain('우려할 변화');
    expect(html).not.toContain('크게 바뀐 항목');
    expect(html).not.toContain('또래보다 빨리 변한 항목');
  });

  it('그 해 분석 자료가 없으면 ②에 「이 연도에 저장된 추가 분석이 없어요.」', () => {
    const html = buildReportHtml(byYear(2024), metricDefinitions, '홍길동', { ...demoExtras, comboAnalysisByYear: {}, egfrByYear: {}, recommendationsByYear: {} });
    expect(html).toContain('이 연도에 저장된 추가 분석이 없어요.');
  });

  it('안내 문구는 문서 맨 끝 한 번', () => {
    const html = buildReportHtml(byYear(2024), metricDefinitions, '홍길동', demoExtras);
    expect(html.match(/진단서·소견서가 아닙니다/g)?.length).toBe(1);
    expect(html.lastIndexOf('진단서·소견서가 아닙니다')).toBeGreaterThan(html.lastIndexOf('<section class="page">'));
  });
});

describe('buildReportHtml — 2쪽이 히스토리 화면과 같은 말을 한다(최종 검토 지적)', () => {
  it('항목 이름은 화면처럼 metricLabel로 바꿔 쓴다 — 백엔드 원래 이름(감마지티피)이 그대로 나오지 않는다', async () => {
    const { metricLabel } = await import('./data');
    const html = buildReportHtml(byYear(2024), metricDefinitions, '홍길동', demoExtras);
    expect(text(html)).not.toContain('감마지티피');
    expect(text(html)).toContain(metricLabel('감마지티피'));
  });

  it('또래보다 빨리 변한 항목에는 화면의 주의 문구가 붙는다', () => {
    const html = buildReportHtml(byYear(2024), metricDefinitions, '홍길동', demoExtras);
    expect(text(html)).toContain('악화 방향만 모았어요.');
    expect(text(html)).toContain('첫 회차와 마지막 회차를 비교한 값이에요. 중간에 좋아진 구간이 있어도 여기엔 담기지 않아요');
  });
});
