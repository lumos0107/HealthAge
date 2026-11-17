/**
 * 검진 결과 리포트 내보내기 — PDF 파일로 만들어 공유한다.
 *
 * 쓰임: 진료 갈 때 지참, 가족에게 보내기. 앱을 안 쓰는 사람도 볼 수 있어야 하므로
 * 스크린샷이 아니라 텍스트가 살아있는 PDF로 만든다(expo-print).
 *
 * ⚠️ 여기서 새로 판단하는 값은 없다. 내용(HTML)은 reportHtml.ts가 만든다 —
 *    1쪽 검사항목 · 2쪽 히스토리 · 3쪽 분석 ①~④ 요약(design-d).
 */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { MetricDefinition, Report } from './data';
import { buildReportHtml } from './reportHtml';
import type { PdfExtras } from './reportHtml';

export type { PdfExtras } from './reportHtml';

// 갤럭시탭에서 PDF 만들기가 끝나지 않아 "만드는 중"이 영원히 남은 적이 있다(2026-11-17).
// 멈추면 기다리게 두지 않고 이 시간 뒤 실패로 알린다.
const RENDER_TIMEOUT_MS = 20000;

function withTimeout<T>(p: Promise<T>, stage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${stage} 단계가 ${RENDER_TIMEOUT_MS / 1000}초 안에 끝나지 않았어요.`)), RENDER_TIMEOUT_MS);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/**
 * 리포트를 PDF로 만들어 공유 시트를 띄운다.
 * extras(히스토리·분석 자료)가 있으면 3쪽, 없으면 검사항목 1쪽.
 * @returns 만들어진 파일 경로. 공유가 불가능한 환경이면 경로만 돌려준다.
 */
export async function exportReportPdf(
  report: Report,
  metricDefinitions: MetricDefinition[],
  userName: string,
  extras?: PdfExtras | null,
): Promise<string> {
  const { uri } = await withTimeout(Print.printToFileAsync({
    html: buildReportHtml(report, metricDefinitions, userName, extras),
  }), 'PDF 파일 만들기');
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `${report.year}년 검진 결과 공유`,
      UTI: 'com.adobe.pdf',
    });
  }
  return uri;
}

/**
 * 같은 요약을 기기 기본 인쇄 창으로 바로 연다(파일 저장은 인쇄 창이 맡는다 — 「PDF로 저장」·프린터 선택).
 */
export async function printReport(
  report: Report,
  metricDefinitions: MetricDefinition[],
  userName: string,
  extras?: PdfExtras | null,
): Promise<void> {
  await withTimeout(Print.printAsync({ html: buildReportHtml(report, metricDefinitions, userName, extras) }), '인쇄 창 열기');
}
