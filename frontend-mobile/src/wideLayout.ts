// 넓은 모니터 배치(wide) — 학과 전시에서 웹 체험판을 PC 모니터로 보여 줄 때 쓰는 배치.
// react-native를 import하지 않는다(vitest가 node에서 바로 돈다). 화면 폭 판단만 여기서 하고,
// useLayout()(responsive.ts)이 이 값으로 mode를 'wide'로 바꾼다.

/** 웹에서 창 폭이 이 값 이상이면 넓은 배치. 1366×768, 1920×1080의 100~150% 배율까지 들어온다. */
export const WIDE_MIN = 1280;
/** 넓은 배치에서 레일(96)을 뺀 본문 최대 폭 — 1920 화면에서 꽉 차고, 그보다 넓으면 가운데. */
export const WIDE_MAX_CONTENT = 1824;
/** 다섯 탭 밖 화면(항목 상세 창·프로필 등)의 최대 폭. */
export const NARROW_MAX = 1280;

/** 주소 뒤 ?… 를 읽는다. RN 네이티브에도 전역 window는 있지만 location이 없어서, 웹이 아니면 아예 보지 않는다. */
export function readSearch(os: string, win: unknown): string {
  if (os !== 'web') return '';
  const search = (win as { location?: { search?: unknown } } | undefined)?.location?.search;
  return typeof search === 'string' ? search : '';
}

/** 넓은 배치를 켤지. 웹이고 폭 1280 이상일 때만, 주소에 wide=0이 있으면 끈다(전시장 비상 단추). 높이는 보지 않는다. */
export function isWideLayout(width: number, os: string, search: string): boolean {
  if (os !== 'web') return false;
  if (/[?&]wide=0(&|$)/.test(search)) return false;
  return width >= WIDE_MIN;
}

/** 검사항목 넓은 배치: 오른쪽 상세 칸 폭과 왼쪽 목록 열 수. contentWidth는 레일을 뺀 본문 폭(상한 적용).
 *  본문 좌우 여백 28×2, 두 칸 사이 12, 목록 열 사이 12×2. 상세는 본문의 38%를 440~600으로 자르고,
 *  목록 카드가 300 이상 나올 때만 3열(좁으면 이름·배지·화살표가 한 줄에 안 들어간다). */
export function recordsSplit(contentWidth: number): { paneW: number; listCols: 2 | 3 } {
  const inner = contentWidth - 56;
  const paneW = Math.min(600, Math.max(440, Math.round(inner * 0.38)));
  const listW = inner - paneW - 12;
  return { paneW, listCols: (listW - 24) / 3 >= 300 ? 3 : 2 };
}

/** 분석 요약(네 단계 카드)을 한 줄에 몇 장 놓을지. 격자 폭(본문 − 좌우 여백 56)이 1450 이상일 때만 4장 —
 *  그보다 좁으면 카드 하나가 350 아래로 내려가 제목·요약이 눌린다. 1920 창(본문 1824)부터 4장. */
export function analysisCols(contentWidth: number): 2 | 4 {
  return contentWidth - 56 >= 1450 ? 4 : 2;
}

/** 넓은 배치의 작은 확인 창(바텀시트·가운데 창) 최대 폭 — 넓은 모니터에서 화면 가로 전체로 퍼지지 않게. */
export const DIALOG_MAX = 560;

/** 검사항목 오른쪽 칸에서 고른 항목을 그해 목록에 맞춰 둔다. 그해 목록에 없으면 고른 것을 지운다
 *  (오른쪽 칸은 목록 첫 항목을 보이고, 그 항목을 잰 해로 돌아가도 예전 선택이 되살아나지 않는다). */
export function keepSelection<K extends string>(rowKeys: K[], selected: K | null): K | null {
  return selected !== null && rowKeys.includes(selected) ? selected : null;
}
