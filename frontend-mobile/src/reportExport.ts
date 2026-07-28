/**
 * 검진 결과 리포트 내보내기 — PDF 파일로 만들어 공유한다.
 *
 * 쓰임: 진료 갈 때 지참, 가족에게 보내기. 앱을 안 쓰는 사람도 볼 수 있어야 하므로
 * 스크린샷이 아니라 텍스트가 살아있는 PDF로 만든다(expo-print).
 *
 * ⚠️ 여기서 새로 판단하는 값은 없다. 화면에 이미 보이는 값(연도별 검진값·상태·
 *    참고 점수)만 옮겨 담는다. 의학적 해석을 새로 만들어 넣지 않는다.
 */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { MetricDefinition, Report, Status } from './data';
import { T } from './components/UI';

const STATUS_COLOR: Record<Status, string> = {
  정상: '#0F7B4F',
  주의: '#B4690E',
  위험: '#C0392B',
};

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

function buildHtml(report: Report, metrics: MetricDefinition[], userName: string): string {
  const rows = metrics.map((m) => {
    const v = report.values[m.key];
    return `<tr>
      <td>${esc(m.name)}</td>
      <td class="num">${esc(v)}<span class="unit">${esc(m.unit)}</span></td>
      <td class="num muted">${esc(m.normalText)}</td>
      <td><span class="tag" style="color:${STATUS_COLOR[m.status]}">${esc(m.status)}</span></td>
    </tr>`;
  }).join('');

  return `<!doctype html><html><head><meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Noto Sans KR", sans-serif; color: ${T.text1}; padding: 36px 32px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
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
  .unit { color: #9CA3AF; font-size: 11px; margin-left: 2px; }
  .muted { color: #9CA3AF; }
  .tag { font-weight: 700; font-size: 12px; }
  .foot { margin-top: 26px; font-size: 10.5px; color: #9CA3AF; line-height: 1.7; }
</style></head><body>
  <h1>건강검진 결과 요약</h1>
  <div class="sub">${esc(userName)} · ${esc(report.year)}년 검진 (${esc(report.date)}) · ${esc(report.hospital)}</div>

  <div class="score">${esc(report.score)}<small> / 100점 (참고 점수)</small></div>
  <div class="counts">주의 ${esc(report.manageCount)}개 · 위험 ${esc(report.trackCount)}개</div>

  <div class="summary">${esc(report.summary)}</div>

  <table>
    <thead><tr><th>검사 항목</th><th style="text-align:right">내 수치</th>
    <th style="text-align:right">정상 기준</th><th>상태</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="foot">
    · 헬스에이지가 검진 결과지 값을 옮겨 정리한 요약입니다. 진단서·소견서가 아닙니다.<br/>
    · 참고 점수는 주의·위험 항목 수로 계산한 자체 지표이며 의학적 등급이 아닙니다.<br/>
    · 상태 구분은 학회 진료지침 기준을 따르며, 치료 판단은 의료진과 상의하세요.
  </div>
</body></html>`;
}

/**
 * 리포트를 PDF로 만들어 공유 시트를 띄운다.
 * @returns 만들어진 파일 경로. 공유가 불가능한 환경이면 경로만 돌려준다.
 */
export async function exportReportPdf(
  report: Report,
  metrics: MetricDefinition[],
  userName: string,
): Promise<string> {
  const { uri } = await Print.printToFileAsync({
    html: buildHtml(report, metrics, userName),
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `${report.year}년 검진 결과 공유`,
      UTI: 'com.adobe.pdf',
    });
  }
  return uri;
}
