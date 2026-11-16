import { useWindowDimensions } from 'react-native';

// 태블릿 반응형 기준 (태블릿-시안-초안.md 2절)
//   600 미만                → 모바일 그대로 (하단 탭, 1열)
//   600 ~ 1023 (태블릿 세로) → 좌측 레일 96px + 본문 2열
//   1024 이상  (태블릿 가로) → 좌측 레일 + 검사항목 목록 3열 · 항목 상세 3열
// 짧은 변이 600 미만이면(폰 가로) 태블릿 구조를 쓰지 않는다 — 폰 가로 처리는 시안에서 미정이라
// 기존 모바일 화면을 그대로 둔다.
export const TABLET_MIN = 600;
export const LANDSCAPE_MIN = 1024;
export const RAIL_W = 96;

export type LayoutMode = 'phone' | 'tabletPortrait' | 'tabletLandscape';

export function layoutFor(width: number, height: number): LayoutMode {
  if (width < TABLET_MIN || Math.min(width, height) < TABLET_MIN) return 'phone';
  return width >= LANDSCAPE_MIN ? 'tabletLandscape' : 'tabletPortrait';
}

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const mode = layoutFor(width, height);
  const isTablet = mode !== 'phone';
  const isLandscape = mode === 'tabletLandscape';
  // 레일을 뺀 본문 폭
  const contentWidth = isTablet ? width - RAIL_W : width;
  return {
    mode, isTablet, isLandscape, width, height, contentWidth,
    /** 본문 좌우 여백 — 시안 28 / 모바일은 각 화면이 정한 16 */
    pad: isTablet ? 28 : 16,
    /** 검사항목 목록 열 수 */
    itemCols: isLandscape ? 3 : 2,
  };
}
