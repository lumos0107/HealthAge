/**
 * 결과 요약 PDF의 HTML — 1쪽 검사항목 · 2쪽 히스토리 · 3쪽 분석 ①~④ 요약(design-d).
 *
 * ⚠️ 여기서 새로 판단하는 값은 없다. 화면에 이미 보이는 값·문장만 옮겨 담는다.
 *    분석 요약은 analysisSummary(분석 탭과 공용), 점수 추이 문장은 scoreTrend(히스토리와 공용)를 쓴다.
 * react-native를 import하지 않는다(vitest로 시험한다). 실제 PDF 만들기는 reportExport.ts.
 */
import { metricLabel, metricsForReport } from './data';
import type { MetricDefinition, Report, Status } from './data';
import { scoreTrend } from './interpret';
import { analysisSummary } from './analysisSummary';
import type { RealComboAnalysis, RealEgfr, RealRecommendations, RealTimeseries } from './health';

type Highlight = NonNullable<RealTimeseries['highlights']>[number];
type Insight = NonNullable<RealTimeseries['insight']>;
type ChangePace = NonNullable<RealTimeseries['change_pace']>[number];

/** 히스토리·분석 쪽을 만드는 데 필요한 자료 — App이 화면들에 내려주는 것과 같은 값. */
export type PdfExtras = {
  reports: Report[];
  highlights?: Highlight[] | null;
  insight?: Insight | null;
  changePace?: ChangePace[] | null;
  recommendationsByYear?: Record<number, RealRecommendations>;
  egfrByYear?: Record<number, RealEgfr>;
  comboAnalysisByYear?: Record<number, RealComboAnalysis>;
  gender: 1 | 2;
  smoking?: 'never' | 'former' | 'current' | null;
  alcoholWeeklyG?: number | null;
};

const TEXT1 = '#191F28';
const MUTED = '#9CA3AF';
const STATUS_COLOR: Record<Status, string> = {
  정상: '#0F7B4F',
  주의: '#B4690E',
  위험: '#C0392B',
};

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

const STYLE = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Noto Sans KR", sans-serif; color: ${TEXT1}; padding: 36px 32px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 14px 0 4px; }
  .sub { color: #6B7280; font-size: 12px; margin-bottom: 22px; }
  .score { font-size: 40px; font-weight: 800; letter-spacing: -1px; }
  .score small { font-size: 14px; font-weight: 500; color: #6B7280; }
  .counts { font-size: 13px; color: #374151; margin-top: 2px; }
  .summary { background: #F6F6F6; border-radius: 8px; padding: 14px 16px; font-size: 13px;
             line-height: 1.6; margin: 18px 0 24px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; color: #6B7280; font-weight: 600; font-size: 11px;
       border-bottom: 1px solid #E5E7EB; padding: 8px 6px; }
  td { padding: 9px 6px; border-bottom: 1px solid #F0F0F0; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .unit { color: ${MUTED}; font-size: 11px; margin-left: 2px; }
  .muted { color: ${MUTED}; }
  .tag { font-weight: 700; font-size: 12px; }
  .page { page-break-before: always; break-before: page; padding-top: 24px; }
  .lead { font-size: 14px; margin: 2px 0 6px; }
  .basis { font-size: 11px; color: #6B7280; margin-top: 8px; }
  .item { font-size: 12px; line-height: 1.5; padding: 4px 0; border-bottom: 1px solid #F0F0F0; break-inside: avoid; }
  .item b { color: ${TEXT1}; }
  .item .d { color: #4B5563; }
  .next { font-size: 13px; margin-top: 10px; font-weight: 700; }
  .layer { border: 1px solid #E5E7EB; border-radius: 10px; padding: 10px 14px; margin-bottom: 8px; break-inside: avoid; }
  .layer h2 { margin: 0 0 2px; }
  .layer .q { font-size: 11px; color: #6B7280; margin-bottom: 4px; }
  .layer .row { font-size: 12px; line-height: 1.5; padding: 3px 0; border-top: 1px solid #F3F4F6; }
  .layer .row b { display: inline-block; min-width: 120px; }
  .layer p { font-size: 12px; line-height: 1.5; margin: 3px 0 0; }
  .note { font-size: 11px; color: #6B7280; }
  .foot { margin-top: 14px; font-size: 10.5px; color: ${MUTED}; line-height: 1.7; }
`;

/** 1쪽 — 그 해 검진 점수와 검사 항목 표(원래 PDF 그대로, 키·몸무게만 「참고」). */
function checkupPage(report: Report, metricDefinitions: MetricDefinition[], userName: string): string {
  const rows = metricsForReport(report, metricDefinitions).map((m) => {
    const v = report.values[m.key];
    // 키·몸무게는 판정하지 않는 참고값이다 — 화면도 「참고」로 보여 준다.
    const tag = m.infoOnly
      ? `<span class="tag" style="color:${MUTED}">참고</span>`
      : `<span class="tag" style="color:${STATUS_COLOR[m.status]}">${esc(m.status)}</span>`;
    return `<tr>
      <td>${esc(m.name)}</td>
      <td class="num">${esc(v)}<span class="unit">${esc(m.unit)}</span></td>
      <td class="num muted">${esc(m.normalText)}</td>
      <td>${tag}</td>
    </tr>`;
  }).join('');

  return `
  <h1>건강검진 결과 요약</h1>
  <div class="sub">${esc(userName)} · ${esc(report.year)}년 검진 (${esc(report.date)}) · ${esc(report.hospital)}</div>
  <div class="score">${esc(report.score)}<small> / 100점 (참고 점수)</small></div>
  <div class="counts">주의 ${esc(report.manageCount)}개 · 위험 ${esc(report.trackCount)}개</div>
  <div class="summary">${esc(report.summary)}</div>
  <table>
    <thead><tr><th>검사 항목</th><th style="text-align:right">내 수치</th>
    <th style="text-align:right">정상 기준</th><th>상태</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/** 점수 꺾은선 — 앱 그래프와 같은 70·40 경계 띠, 점마다 연도·점수. 2해 이상일 때만 부른다. */
function scoreSvg(series: { year: number; score: number }[]): string {
  const W = 520, H = 150, L = 40, R = 20, TOP = 20, BOT = 24;
  const pw = W - L - R, ph = H - TOP - BOT;
  const x = (i: number) => L + (series.length === 1 ? pw / 2 : (pw * i) / (series.length - 1));
  const y = (s: number) => TOP + ph * (1 - Math.max(0, Math.min(100, s)) / 100);
  const band = (hi: number, lo: number, fill: string, label: string) =>
    `<rect x="${L}" y="${y(hi)}" width="${pw}" height="${y(lo) - y(hi)}" fill="${fill}"/>` +
    `<text x="${L - 6}" y="${(y(hi) + y(lo)) / 2 + 4}" font-size="10" text-anchor="end" fill="#6B7280">${label}</text>`;
  const pts = series.map((p, i) => `${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ');
  const marks = series.map((p, i) => `
    <circle cx="${x(i).toFixed(1)}" cy="${y(p.score).toFixed(1)}" r="3.5" fill="#2B6CD9"/>
    <text x="${x(i).toFixed(1)}" y="${(y(p.score) - 8).toFixed(1)}" font-size="10" font-weight="700" text-anchor="middle" fill="${TEXT1}">${esc(p.score)}</text>
    <text x="${x(i).toFixed(1)}" y="${H - 8}" font-size="10" text-anchor="middle" fill="#6B7280">${esc(p.year)}</text>`).join('');
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    ${band(100, 70, '#EAF6EF', '정상')}${band(70, 40, '#FDF4E8', '주의')}${band(40, 0, '#FCEDEC', '위험')}
    <polyline points="${pts}" fill="none" stroke="#2B6CD9" stroke-width="2"/>${marks}
  </svg>`;
}

/** 2쪽 — 히스토리. 그래프는 고른 연도까지, 서술은 전체 기록 기준(그렇다고 밝힌다). */
function historyPage(report: Report, extras: PdfExtras): string {
  const upto = extras.reports.filter((r) => r.year <= report.year).sort((a, b) => a.year - b.year);
  const series = upto.map((r) => ({ year: r.year, score: r.score }));
  const trend = scoreTrend(series);
  const latestYear = Math.max(...extras.reports.map((r) => r.year));

  const concerns = extras.insight?.top_concerns ?? [];
  const highlights = extras.highlights ?? [];
  const pace = extras.changePace ?? [];
  const nextYear = extras.insight?.next_exam_year ?? null;
  const hasNarrative = concerns.length > 0 || highlights.length > 0 || pace.length > 0 || nextYear != null;

  const list = (title: string, items: string[], note = '') => items.length ? `<h2>${title}</h2>${note}${items.join('')}` : '';
  return `
  <section class="page">
  <h1>히스토리</h1>
  <div class="sub">${series.length > 1 ? `${esc(series[0].year)}~${esc(report.year)}년 검진 ${series.length}회` : `${esc(report.year)}년 검진`}</div>
  <h2>점수 변화</h2>
  <div class="lead">${esc(trend.lead)}<b>${esc(trend.main)}</b></div>
  ${series.length > 1 ? scoreSvg(series) : ''}
  ${hasNarrative ? `<div class="basis">아래 내용은 전체 기록(~${esc(latestYear)}년) 기준이에요.</div>` : ''}
  ${list('우려할 변화', concerns.map((c) => `<div class="item"><b>${esc(c.title)}</b>${c.current_value ? ` <span class="muted">(${esc(c.current_value)})</span>` : ''}<br/><span class="d">${esc(c.details)}</span></div>`))}
  ${list('크게 바뀐 항목', highlights.map((h) => `<div class="item"><b>${esc(metricLabel(h.metric))}</b> · <span class="d">${esc(h.message)}</span></div>`))}
  ${list('또래보다 빨리 변한 항목', pace.map((p) => `<div class="item"><b>${esc(metricLabel(p.metric))}</b> · <span class="d">${esc(p.pace.text)}</span></div>`),
    // 화면(HistoryScreen 또래보다 빨리 변한 항목)과 같은 단서 — 백엔드 «악화 중» 문장은 첫·마지막 회차만 비교한 값이다.
    '<div class="note">악화 방향만 모았어요. 첫 회차와 마지막 회차를 비교한 값이에요. 중간에 좋아진 구간이 있어도 여기엔 담기지 않아요 — 최근 흐름은 위 점수 변화를 보세요.</div>')}
  ${nextYear != null ? `<div class="next">다음 검진 권장: ${esc(nextYear)}년</div>` : ''}
  </section>`;
}

/** 3쪽 — 분석 ①~④. 분석 탭 태블릿 첫 화면의 요약 카드와 같은 내용·문장. */
function analysisPage(report: Report, metricDefinitions: MetricDefinition[], extras: PdfExtras): string {
  const s = analysisSummary({
    report,
    metricDefinitions,
    recommendations: extras.recommendationsByYear?.[report.year] ?? null,
    egfr: extras.egfrByYear?.[report.year] ?? null,
    combo: extras.comboAnalysisByYear?.[report.year] ?? null,
    gender: extras.gender,
    smoking: extras.smoking,
    alcoholWeeklyG: extras.alcoholWeeklyG,
  });
  const layer = (step: string, title: string, q: string, body: string) =>
    `<div class="layer"><h2>${step} ${title}</h2><div class="q">${q}</div>${body}</div>`;
  const row = (label: string, value: string) => `<div class="row"><b>${esc(label)}</b> ${esc(value)}</div>`;

  const l1 = [
    `<p><b>참고 점수 ${esc(s.score)}점</b> · ${esc(s.scoreLabel)}</p>`,
    `<p>정상 ${esc(s.counts.normal)} · 주의 ${esc(s.counts.warn)} · 위험 ${esc(s.counts.danger)}</p>`,
    `<p>${s.focus.length ? `먼저 확인할 항목 ${esc(s.focus.join(' · '))}` : '모든 검사 항목이 기준 안이에요.'}</p>`,
    s.outsideScore.length
      ? `<p class="note">점수에 포함되지 않는 신호 ${s.outsideScore.length}가지</p>${s.outsideScore.map((o) => row(o.label, o.detail)).join('')}`
      : '',
  ].join('');
  const l2 = s.computed.length ? s.computed.map(([label, value]) => row(label, value)).join('') : '<p>이 연도에 저장된 추가 분석이 없어요.</p>';
  const l3 = s.peers.length
    ? s.peers.map((p) => row(p.name, `${p.rank}등`)).join('') + '<p class="note">등수가 높을수록 또래 중 관리가 더 필요한 쪽이에요.</p>'
    : '<p>비교할 수 있는 또래 자료가 없어요.</p>';
  const l4 = `<p>${s.topAction ? `${esc(s.topAction)}부터 시작하면 현재 지표를 가장 크게 움직여요.` : '현재 조건에 맞는 우선 행동을 계산할 수 없어요.'}</p>`
    + (s.priorityMessage ? `<p><b>${esc(s.priorityMessage)}</b></p>` : '');

  return `
  <section class="page">
  <h1>분석</h1>
  <div class="sub">${esc(report.year)}년 검진 기준</div>
  ${layer('①', '내 건강 점수는', `${esc(report.year)}년 검진 수치가 학회 기준 안에 있는지 봅니다.`, l1)}
  ${layer('②', '검진지에 없는 값을 만들어요', '검진 수치를 묶어 결과지에 없는 지표를 계산합니다.', l2)}
  ${layer('③', '같은 또래는 어떤가', '같은 성별·연령대 안에서 내 위치를 확인합니다.', l3)}
  ${layer('④', '그래서 뭘 하면 되나', '앞에서 확인한 결과를 실천과 다음 검진 목표로 옮깁니다.', l4)}
  </section>`;
}

/**
 * 결과 요약 PDF의 HTML. extras가 없으면 1쪽(검사항목)만 만든다 — 예전 PDF와 같다.
 */
export function buildReportHtml(
  report: Report,
  metricDefinitions: MetricDefinition[],
  userName: string,
  extras?: PdfExtras | null,
): string {
  return `<!doctype html><html><head><meta charset="utf-8" />
<style>${STYLE}</style></head><body>
  ${checkupPage(report, metricDefinitions, userName)}
  ${extras ? historyPage(report, extras) : ''}
  ${extras ? analysisPage(report, metricDefinitions, extras) : ''}
  <div class="foot">
    · 헬스에이지가 검진 결과지 값을 옮겨 정리한 요약입니다. 진단서·소견서가 아닙니다.<br/>
    · 참고 점수는 주의·위험 항목 수로 계산한 자체 지표이며 의학적 등급이 아닙니다.<br/>
    · 상태 구분은 학회 진료지침 기준을 따르며, 치료 판단은 의료진과 상의하세요.
  </div>
</body></html>`;
}
