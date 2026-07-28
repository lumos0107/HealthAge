# 모바일 디자인 시스템 v2 구현 계획


**Goal:** `frontend-mobile/`(Expo 앱)에 디자인 시스템 v2(토스 구조 × 뱅샐 그린 × 3층 피라미드)를 적용한다 — 5탭 → 4탭, L0 홈 TOP3 → L1 검사항목 리스트 → L2 상세 오버레이 → L3 펼침.

**Architecture:** 새 라이브러리 없이 기존 패턴 확장. 토큰 객체 `T`(UI.tsx) 교체가 전역 파급의 축이고, L2 상세는 RN `Modal`(fullscreen slide, `onRequestClose`로 Android 백버튼 처리)로 구현. 신규 순수 로직은 `src/interpret.ts`에 격리해 vitest로 테스트한다.

**Tech Stack:** Expo 54 / RN 0.81 / react-native-svg / TypeScript. 테스트: vitest(신규 devDependency, 순수 TS 모듈 전용).

**설계서:** `docs/specs-plans/specs/2026-07-28-mobile-design-v2-design.md`

## Global Constraints

- 작업 디렉터리: 모든 명령은 `frontend-mobile/`에서 실행. 웹(`frontend/`)·백엔드·데이터 스키마는 절대 수정 금지.
- 새 런타임 의존성 금지. devDependency는 vitest 하나만 추가 허용.
- 토큰 값(설계서 §5 그대로): 배경 `#F3F5F7` · 카드 흰색 radius 20 무테두리·무그림자 · 브랜드 그린 `#00C073`/눌림 `#00A862`/틴트 `#E6F9F1`(인터랙션 전용) · 정상 `#1F8A5D`+`#EAF7F1` · 주의 `#D97706`+`#FFF3E7` · 위험 `#F04452`+`#FEE9EB` · 텍스트 `#191F28`/`#4E5968`/`#8B95A1` · 구분선 `#F2F4F6` · radius 카드 20/버튼 14/입력 12/칩 999.
- 브랜드 그린은 버튼·링크·활성 탭 등 **인터랙션 전용**. '정상' 상태 표시는 `#1F8A5D`.
- 문구: 해요체·능동형. 수치엔 해석 한 줄. 이상 소견 화면에 장식·캐릭터 금지. L2 하단 고지 "참고용이며 진단이 아닙니다".
- 타이포: 핵심 숫자 크게(점수 64~80pt), 화면 제목 24~26. 새로 만드는 화면의 설명·본문 문장은 fontSize 15 이상(RN pt 기준 — 스펙의 "본문 16px"을 RN에 맞게 15pt로 적용, 캡션·보조 라벨은 12~13 허용).
- 데이터 정직성: percentile 없으면 등수 슬라이더 대신 정상범위 바만. 측정 안 된 연도·항목은 지어내지 않음(기존 원칙 유지).
- 기능 보존 체크리스트(삭제 금지): 연도 선택·기록 삭제·복용약 보기·PDF 내보내기(프로필로 이동)·분석 콘텐츠 전부·업로드 플로우·데모 모드·빈 상태(EmptyDataState)·비로그인 프리뷰.

---

### Task 1: 디자인 토큰 v2 교체 + UI.tsx 기본 컴포넌트 리스킨

**Files:**
- Modify: `frontend-mobile/src/components/UI.tsx`

**Interfaces:**
- Consumes: 없음 (최초 태스크)
- Produces: `T` 객체 — 기존 키 이름 유지(`primary`, `primaryPressed`, `primaryLight`, `bg`, `white`, `cardAlt`, `text1~3`, `border`, `divider`, `success/successBg`, `warn/warnBg`, `danger/dangerBg`, `radius/radiusMd/radiusSm/radiusPill`, `shadow`, `fontDisplay`, `eyebrow`) + 값만 v2로. 이후 모든 태스크가 이 토큰을 사용.

- [ ] **Step 1: `T` 객체 값 교체** — `UI.tsx:37-89`의 `T`를 다음으로 교체(키 이름은 기존 그대로 유지해 기존 화면이 그대로 컴파일되게 한다):

```tsx
// ─── 디자인 시스템 v2: 토스 구조 × 뱅샐 그린 ─────────────────
// - 연회색 배경(#F3F5F7) 위 흰 카드(radius 20, 무테두리·무그림자)로 영역 구분
// - 브랜드 그린(#00C073)은 "누를 수 있는 것" 전용. '정상' 상태는 #1F8A5D로 분리
// - 상태 배지는 틴트 배경 + 상태색 텍스트 병기 (색만으로 구분 금지)
export const T = {
  // Primary = 브랜드 그린. 버튼·링크·활성 탭 등 인터랙션 전용.
  primary: '#00C073',
  primaryPressed: '#00A862',
  primaryLight: '#E6F9F1',
  primaryDark: '#00A862',

  // Backgrounds — 연회색 화면 배경, 카드만 흰색
  bg: '#F3F5F7',
  white: '#FFFFFF',
  cardAlt: '#F2F4F6',

  // Text hierarchy
  text1: '#191F28',
  text2: '#4E5968',
  text3: '#8B95A1',

  // 테두리는 원칙적으로 안 쓴다 — 남은 사용처를 위해 구분선과 같은 색으로.
  border: '#F2F4F6',
  divider: '#F2F4F6',

  // Semantic colors — 상태 전용(인터랙션 그린과 분리)
  success: '#1F8A5D',
  successBg: '#EAF7F1',
  warn: '#D97706',
  warnBg: '#FFF3E7',
  danger: '#F04452',
  dangerBg: '#FEE9EB',

  // Radius — 카드 20 · 버튼 14 · 입력 12 · 칩 999
  radius: 20,
  radiusMd: 14,
  radiusSm: 12,
  radiusPill: 999,

  // 그림자 없음 — 배경 대비로만 구분
  shadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },

  fontDisplay: 'Pretendard',

  eyebrow: { fontSize: 11, fontWeight: '700' as const, color: '#8B95A1', letterSpacing: 1.6, textTransform: 'uppercase' as const },
} as const;
```

파일 상단의 무신사 관련 주석 블록(`UI.tsx:25-36`)은 위 새 주석으로 대체한다.

- [ ] **Step 2: `ui` StyleSheet 리스킨** — `UI.tsx:471-528`에서:
  - `card`: `borderWidth`·`borderColor` 제거, `marginBottom: 12`, `borderRadius: T.radius` 유지(이제 20)
  - `primaryBtn`: `borderRadius: T.radiusMd`(14), `height: 52` 유지
  - `secondaryBtn`: `borderRadius: T.radiusMd`, `backgroundColor: T.cardAlt`
  - `ghostBtn`: `borderRadius: T.radiusMd`
  - `fieldInput`: `borderWidth: 0`(및 `borderColor` 제거), `backgroundColor: T.cardAlt`, `borderRadius: T.radiusSm`(12)
  - `notice`: `backgroundColor: T.cardAlt`, `borderRadius: T.radiusSm`. `noticeText`의 `color: T.primaryDark` → `color: T.text2` (안내문은 인터랙션이 아니므로 그린 금지)
  - `Notice` 컴포넌트(`UI.tsx:188-196`)의 아이콘 색 `T.primary` → `T.text2`
  - `chipActive`: `backgroundColor: T.primaryLight` 유지(활성 칩 = 인터랙션이므로 그린 틴트가 맞음)
  - `PrimaryBtn`의 비활성 색 `#BDBDBD`(`UI.tsx:210`) → `T.text3`
  - `FieldInput`의 에러 표시(`UI.tsx:255`)는 `borderWidth: 1.5` 대신 `{ borderWidth: 1.5, borderColor: T.danger }` 그대로 두되 기본 상태는 무테두리이므로 그대로 동작 확인만
- [ ] **Step 3: `DirectionalBar` 인라인 hex 정리** — `UI.tsx:395`의 `'#1F6B4A'` 2곳 → `T.success`
- [ ] **Step 4: typecheck**

Run: `npm run typecheck` (frontend-mobile에서)
Expected: PASS (에러 0)

- [ ] **Step 5: Commit**

```bash
git add frontend-mobile/src/components/UI.tsx
git commit -m "feat(mobile): 디자인 토큰 v2 교체 — 뱅샐 그린·토스 카드·radius 체계"
```

---

### Task 2: vitest 셋업 + 해석 로직 `interpret.ts` (TDD)

**Files:**
- Modify: `frontend-mobile/package.json` (vitest devDep + `"test": "vitest run"` 스크립트)
- Create: `frontend-mobile/src/interpret.ts`
- Test: `frontend-mobile/src/interpret.test.ts`

**Interfaces:**
- Consumes: `src/data.ts`의 `MetricDefinition`, `Report`, `MetricKey`, `Status`, `metricDirection`
- Produces (이후 태스크가 사용하는 정확한 시그니처):
  - `headline(metric: MetricDefinition, value: number): string` — "공복혈당이 살짝 높아요"
  - `yearDelta(reports: Report[], key: MetricKey, year: number): { diff: number; prevYear: number } | null`
  - `deltaText(delta: { diff: number; prevYear: number }, unit: string): string` — "2022년보다 8 올랐어요"
  - `top3Alerts(defs: MetricDefinition[]): MetricDefinition[]` — 위험 우선, 최대 3개
  - `sortByAttention(defs: MetricDefinition[]): MetricDefinition[]` — 위험→주의→정상 (안정 정렬)
  - `statusCounts(defs: MetricDefinition[]): { 정상: number; 주의: number; 위험: number }`
  - `normalBounds(metric: MetricDefinition): { low?: number; high?: number }`
  - `rankFromPercentile(percentile: number): number` — 1~100 clamp

- [ ] **Step 1: vitest 설치 + 스크립트 추가**

```bash
cd frontend-mobile && npm i -D vitest
```

`package.json`의 `scripts`에 추가: `"test": "vitest run"`

- [ ] **Step 2: 실패하는 테스트 작성** — `src/interpret.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { metricDefinitions, reports } from './data';
import type { MetricDefinition } from './data';
import { deltaText, headline, normalBounds, rankFromPercentile, sortByAttention, statusCounts, top3Alerts, yearDelta } from './interpret';

const by = (key: string) => metricDefinitions.find((m) => m.key === key)!;
const withStatus = (m: MetricDefinition, status: MetricDefinition['status']): MetricDefinition => ({ ...m, status });

describe('headline', () => {
  it('주의 + 높은 방향이면 "살짝 높아요"', () => {
    // glucose: normalText '70-99', 2024년 값 112 → 살짝 높아요
    expect(headline(withStatus(by('glucose'), '주의'), 112)).toBe('공복혈당이 살짝 높아요');
  });
  it('위험이면 "많이 높아요"', () => {
    expect(headline(withStatus(by('waist'), '위험'), 93)).toBe('허리둘레가 많이 높아요');
  });
  it('정상이면 "정상 범위예요"', () => {
    expect(headline(withStatus(by('ast'), '정상'), 34)).toBe('AST가 정상 범위예요');
  });
  it('낮은 방향(HDL)이 주의면 "살짝 낮아요"', () => {
    expect(headline(withStatus(by('hdl'), '주의'), 39)).toBe('HDL-C가 살짝 낮아요');
  });
});

describe('yearDelta / deltaText', () => {
  it('직전 검진 연도와의 차이를 계산한다', () => {
    // glucose 2024=112, 2022=107 → diff +5
    expect(yearDelta(reports, 'glucose', 2024)).toEqual({ diff: 5, prevYear: 2022 });
  });
  it('첫 검진(이전 기록 없음)이면 null', () => {
    expect(yearDelta(reports, 'glucose', 2014)).toBeNull();
  });
  it('문장으로 만든다', () => {
    expect(deltaText({ diff: 5, prevYear: 2022 }, 'mg/dL')).toBe('2022년보다 5mg/dL 올랐어요');
    expect(deltaText({ diff: -3.5, prevYear: 2022 }, 'kg/m²')).toBe('2022년보다 3.5kg/m² 내렸어요');
    expect(deltaText({ diff: 0, prevYear: 2022 }, 'mg/dL')).toBe('2022년과 같아요');
  });
});

describe('top3Alerts / sortByAttention / statusCounts', () => {
  it('위험이 주의보다 먼저, 최대 3개', () => {
    const top = top3Alerts(metricDefinitions);
    expect(top).toHaveLength(3);
    expect(top[0].status).toBe('위험'); // bmi
    expect(top[1].status).toBe('위험'); // waist
    expect(top[2].status).toBe('주의');
  });
  it('정상만 있으면 빈 배열', () => {
    expect(top3Alerts(metricDefinitions.map((m) => withStatus(m, '정상')))).toHaveLength(0);
  });
  it('sortByAttention은 위험→주의→정상, 같은 상태끼리는 원래 순서 유지', () => {
    const sorted = sortByAttention(metricDefinitions);
    expect(sorted[0].status).toBe('위험');
    expect(sorted[sorted.length - 1].status).toBe('정상');
  });
  it('statusCounts', () => {
    const c = statusCounts(metricDefinitions);
    expect(c.정상 + c.주의 + c.위험).toBe(metricDefinitions.length);
    expect(c.위험).toBe(2);
  });
});

describe('normalBounds / rankFromPercentile', () => {
  it('범위형("70-99")은 양쪽 경계', () => {
    expect(normalBounds(by('glucose'))).toEqual({ low: 70, high: 99 });
  });
  it('상한형("<120")은 high만', () => {
    expect(normalBounds(by('sbp'))).toEqual({ high: 120 });
  });
  it('하한형(HDL "남 ≥40 / 여 ≥50")은 normalValue를 low로', () => {
    expect(normalBounds(by('hdl'))).toEqual({ low: 40 });
  });
  it('rank는 1~100으로 clamp', () => {
    expect(rankFromPercentile(0)).toBe(1);
    expect(rankFromPercentile(30.4)).toBe(30);
    expect(rankFromPercentile(150)).toBe(100);
  });
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `npm test`
Expected: FAIL — `Cannot find module './interpret'` 또는 이에 준하는 에러

- [ ] **Step 4: `src/interpret.ts` 구현**

```ts
// 수치를 사람 말로 바꾸는 순수 로직 모음 — RN 의존성이 없어 vitest로 테스트한다.
import { metricDirection } from './data';
import type { MetricDefinition, MetricKey, Report, Status } from './data';

// 받침 유무에 따라 이/가를 고른다. 한글이 아니면(영문 약어 등) '가'.
function subjectJosa(word: string): '이' | '가' {
  const last = word.charAt(word.length - 1);
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return '가';
  return (code - 0xac00) % 28 > 0 ? '이' : '가';
}

/** 정상범위 경계 파싱 — 범위형은 normalText의 "a-b"에서, 상한/하한형은 normalValue에서. */
export function normalBounds(metric: MetricDefinition): { low?: number; high?: number } {
  const dir = metricDirection(metric);
  if (dir === 'high') return { high: metric.normalValue };
  if (dir === 'low') return { low: metric.normalValue };
  const m = /(\d+(?:\.\d+)?)\s*[-~]\s*(\d+(?:\.\d+)?)/.exec(metric.normalText);
  if (m) return { low: Number(m[1]), high: Number(m[2]) };
  return { high: metric.normalValue };
}

/** L2 상단 헤드라인 — 상태+방향으로 쉬운 문장을 만든다. */
export function headline(metric: MetricDefinition, value: number): string {
  const subject = `${metric.name}${subjectJosa(metric.name)}`;
  if (metric.status === '정상') return `${subject} 정상 범위예요`;
  const { low, high } = normalBounds(metric);
  const isLow = low != null && value < low;
  const dirWord = isLow ? '낮아요' : '높아요';
  const degree = metric.status === '위험' ? '많이' : '살짝';
  return `${subject} ${degree} ${dirWord}`;
}

/** 해당 연도 직전 검진(그 항목이 실제 측정된 해)과의 차이. 이전 기록이 없으면 null. */
export function yearDelta(reports: Report[], key: MetricKey, year: number): { diff: number; prevYear: number } | null {
  const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const current = reports.find((r) => r.year === year);
  if (!current || !isNum(current.values[key])) return null;
  const prev = [...reports]
    .filter((r) => r.year < year && isNum(r.values[key]))
    .sort((a, b) => b.year - a.year)[0];
  if (!prev) return null;
  const diff = Math.round((current.values[key] - prev.values[key]) * 10) / 10;
  return { diff, prevYear: prev.year };
}

export function deltaText(delta: { diff: number; prevYear: number }, unit: string): string {
  if (delta.diff === 0) return `${delta.prevYear}년과 같아요`;
  const dir = delta.diff > 0 ? '올랐어요' : '내렸어요';
  return `${delta.prevYear}년보다 ${Math.abs(delta.diff)}${unit} ${dir}`;
}

const ATTENTION_ORDER: Record<Status, number> = { 위험: 0, 주의: 1, 정상: 2 };

/** 위험→주의→정상 순, 같은 상태끼리는 원래 순서 유지(안정 정렬). */
export function sortByAttention(defs: MetricDefinition[]): MetricDefinition[] {
  return [...defs].sort((a, b) => ATTENTION_ORDER[a.status] - ATTENTION_ORDER[b.status]);
}

/** 홈 TOP3 — 이상 항목만, 위험 우선 최대 3개. */
export function top3Alerts(defs: MetricDefinition[]): MetricDefinition[] {
  return sortByAttention(defs.filter((m) => m.status !== '정상')).slice(0, 3);
}

export function statusCounts(defs: MetricDefinition[]): { 정상: number; 주의: number; 위험: number } {
  const counts = { 정상: 0, 주의: 0, 위험: 0 };
  for (const m of defs) counts[m.status]++;
  return counts;
}

/** "같은 나이대 100명이라면 그중 N등" — 상위 percentile% ≈ N등. 1~100으로 clamp. */
export function rankFromPercentile(percentile: number): number {
  return Math.min(100, Math.max(1, Math.round(percentile)));
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test`
Expected: PASS (전부 초록)

- [ ] **Step 6: Commit**

```bash
git add frontend-mobile/package.json frontend-mobile/package-lock.json frontend-mobile/src/interpret.ts frontend-mobile/src/interpret.test.ts
git commit -m "feat(mobile): 해석 로직 interpret.ts + vitest 셋업"
```

---

### Task 3: v2 신규 컴포넌트 (스쿼클 아이콘·등수 슬라이더·범위 바·고정 CTA·추이 차트)

**Files:**
- Create: `frontend-mobile/src/components/v2.tsx`

**Interfaces:**
- Consumes: `T`, `statusColor`(UI.tsx) · `normalBounds`, `rankFromPercentile`(interpret.ts) · `MetricDefinition`, `Report`(data.ts)
- Produces (이후 태스크가 사용):
  - `CATEGORY_VISUAL: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }>` + `categoryVisual(category: string)`
  - `SquircleIcon({ icon, color, bg, size = 42 })`
  - `PeerRankSlider({ rank, color }: { rank: number; color: string })`
  - `RangeBar({ metric, value }: { metric: MetricDefinition; value: number })`
  - `FixedCTA({ label, onPress, disabled, loading }: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean })`
  - `MetricTrendChart({ metric, reports }: { metric: MetricDefinition; reports: Report[] })`

- [ ] **Step 1: `src/components/v2.tsx` 작성**

```tsx
// 디자인 시스템 v2에서 새로 도입한 컴포넌트 모음.
// 상태색(그린/앰버/레드)과 절대 겹치지 않는 카테고리 색을 쓴다 — 상태로 오인 방지.
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import type { MetricDefinition, Report } from '../data';
import { normalBounds } from '../interpret';
import { T, W } from './UI';

export const CATEGORY_VISUAL: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  '혈압': { icon: 'heart-outline', color: '#1E88E5', bg: '#E8F2FD' },
  '혈당': { icon: 'water-outline', color: '#8E24AA', bg: '#F6EBFA' },
  '체중·복부': { icon: 'body-outline', color: '#3949AB', bg: '#EDEFF9' },
  '지질': { icon: 'analytics-outline', color: '#00897B', bg: '#E6F4F2' },
  '간 기능': { icon: 'shield-checkmark-outline', color: '#6D4C41', bg: '#F1EBE9' },
  '혈액': { icon: 'pulse-outline', color: '#5E35B1', bg: '#EFEAF8' },
  '신장 기능': { icon: 'filter-outline', color: '#00ACC1', bg: '#E6F7FA' },
};

export function categoryVisual(category: string) {
  return CATEGORY_VISUAL[category] ?? { icon: 'ellipse-outline' as const, color: T.text2, bg: T.cardAlt };
}

/** 틴트 배경 스쿼클 + 아이콘 — L1 리스트 행, 홈 TOP3 카드 공용 */
export function SquircleIcon({ icon, color, bg, size = 42 }: {
  icon: keyof typeof Ionicons.glyphMap; color: string; bg: string; size?: number;
}) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 3, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={size * 0.5} color={color} />
    </View>
  );
}

/** "같은 나이대 100명이라면 그중 N등" 슬라이더 — 1등~100등 트랙 위 '나' 마커 */
export function PeerRankSlider({ rank, color }: { rank: number; color: string }) {
  const pct = ((rank - 1) / 99) * 100;
  return (
    <View style={{ marginTop: 6 }}>
      <View style={{ height: 26 }}>
        <View style={{ position: 'absolute', left: `${pct}%`, transform: [{ translateX: -16 }], alignItems: 'center' }}>
          <View style={{ backgroundColor: color, paddingHorizontal: 9, paddingVertical: 3, borderRadius: T.radiusPill }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>나</Text>
          </View>
          <View style={{ width: 2, height: 5, backgroundColor: color }} />
        </View>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: T.cardAlt, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', left: `${pct}%`, transform: [{ translateX: -5 }], top: -1, width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
        <Text style={{ fontSize: 12, color: T.text3 }}>1등</Text>
        <Text style={{ fontSize: 12, color: T.text3 }}>100등</Text>
      </View>
    </View>
  );
}

/** percentile이 없는 항목용 — 정상범위 밴드 위에 내 수치 위치만 보여준다(추정 등수를 지어내지 않는다). */
export function RangeBar({ metric, value }: { metric: MetricDefinition; value: number }) {
  const { low, high } = normalBounds(metric);
  // 축 범위: 정상 경계와 내 값이 모두 들어가게 잡고 양쪽 15% 여유
  const lo = Math.min(value, low ?? value, high ?? value);
  const hi = Math.max(value, low ?? value, high ?? value);
  const pad = (hi - lo) * 0.3 || Math.abs(hi) * 0.15 || 1;
  const min = lo - pad;
  const max = hi + pad;
  const pct = (v: number) => Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100));
  const bandL = pct(low ?? min);
  const bandR = pct(high ?? max);
  const { color } = statusTone(metric);
  return (
    <View style={{ marginTop: 6 }}>
      <View style={{ height: 10, borderRadius: 5, backgroundColor: T.cardAlt, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', left: `${bandL}%`, width: `${Math.max(2, bandR - bandL)}%`, top: 0, bottom: 0, backgroundColor: T.successBg }} />
        <View style={{ position: 'absolute', left: `${pct(value)}%`, transform: [{ translateX: -6 }], top: -1, width: 12, height: 12, borderRadius: 6, backgroundColor: color, borderWidth: 2, borderColor: '#fff' }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
        <Text style={{ fontSize: 12, color: T.text3 }}>{low != null ? low : ''}</Text>
        <Text style={{ fontSize: 12, color: T.success, fontWeight: '600' }}>정상 범위</Text>
        <Text style={{ fontSize: 12, color: T.text3 }}>{high != null ? high : ''}</Text>
      </View>
    </View>
  );
}

function statusTone(metric: MetricDefinition) {
  if (metric.status === '정상') return { color: T.success, bg: T.successBg };
  if (metric.status === '주의') return { color: T.warn, bg: T.warnBg };
  return { color: T.danger, bg: T.dangerBg };
}

/** 하단 고정 CTA — 다음 행동 버튼을 항상 같은 위치에. 스크롤 콘텐츠에는 paddingBottom 100 이상을 줄 것. */
export function FixedCTA({ label, onPress, disabled, loading }: {
  label: string; onPress: () => void; disabled?: boolean; loading?: boolean;
}) {
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: T.white, paddingHorizontal: 20, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 28 : 16 }}>
      <Pressable
        onPress={onPress}
        disabled={disabled || loading}
        style={({ pressed }) => ({
          height: 52, borderRadius: T.radiusMd, alignItems: 'center', justifyContent: 'center',
          backgroundColor: disabled || loading ? T.text3 : pressed ? T.primaryPressed : T.primary,
        })}
      >
        {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>{label}</Text>}
      </Pressable>
    </View>
  );
}

// ── 단일 지표 추이 차트 (L3) — 정상범위는 연한 배경 밴드, 최신 값 강조 ──
const CHART_W = W - 32 - 40;
const CHART_H = 170;
const PAD = { top: 16, right: 16, bottom: 28, left: 44 };
const PLOT_W = CHART_W - PAD.left - PAD.right;
const PLOT_H = CHART_H - PAD.top - PAD.bottom;
const LINE = '#1E88E5'; // 상태색과 겹치지 않는 추이선 색

export function MetricTrendChart({ metric, reports }: { metric: MetricDefinition; reports: Report[] }) {
  const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const pts0 = reports
    .map((r, i) => ({ i, year: r.year, v: r.values[metric.key] }))
    .filter((p): p is { i: number; year: number; v: number } => isNum(p.v));
  if (pts0.length === 0) {
    return <Text style={{ fontSize: 13, color: T.text3, textAlign: 'center', paddingVertical: 24 }}>이 항목의 기록이 없어요.</Text>;
  }
  const { low, high } = normalBounds(metric);
  const vals = [...pts0.map((p) => p.v), ...(low != null ? [low] : []), ...(high != null ? [high] : [])];
  const rawMin = Math.min(...vals);
  const rawMax = Math.max(...vals);
  const margin = (rawMax - rawMin) * 0.25 || 5;
  const minVal = rawMin - margin;
  const maxVal = rawMax + margin;
  const range = maxVal - minVal || 1;
  const xPos = (i: number) => (reports.length === 1 ? PLOT_W / 2 : (i / (reports.length - 1)) * PLOT_W);
  const yPos = (v: number) => PLOT_H - ((v - minVal) / range) * PLOT_H;
  const bandTop = yPos(high ?? maxVal);
  const bandBottom = yPos(low ?? minVal);
  const pts = pts0.map((p) => ({ ...p, x: xPos(p.i), y: yPos(p.v) }));
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const last = pts[pts.length - 1];
  const gridVals = Array.from({ length: 4 }, (_, i) => minVal + (i / 3) * (maxVal - minVal));

  return (
    <View>
      <Svg width={CHART_W} height={CHART_H}>
        <G x={PAD.left} y={PAD.top}>
          {/* 정상범위 밴드 */}
          <Rect x={0} y={bandTop} width={PLOT_W} height={Math.max(0, bandBottom - bandTop)} fill={T.successBg} />
          {gridVals.map((v, i) => (
            <G key={i}>
              <Line x1={0} y1={yPos(v)} x2={PLOT_W} y2={yPos(v)} stroke={T.divider} strokeWidth={1} />
              <SvgText x={-6} y={yPos(v) + 4} fontSize={10} fill={T.text3} textAnchor="end">{Math.round(v)}</SvgText>
            </G>
          ))}
          {reports.map((r, i) => (
            <SvgText key={r.year} x={xPos(i)} y={PLOT_H + 20} fontSize={11} fill={T.text3} textAnchor="middle">{r.year}</SvgText>
          ))}
          <Path d={d} stroke={LINE} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {pts.map((p) => (
            <Circle key={p.i} cx={p.x} cy={p.y} r={p.i === last.i ? 6.5 : 4.5} fill={p.i === last.i ? LINE : T.white} stroke={LINE} strokeWidth={2.5} />
          ))}
          {/* 최신 값 강조 라벨 */}
          <SvgText x={last.x} y={last.y - 12} fontSize={12} fill={LINE} textAnchor="middle" fontWeight="700">{last.v}</SvgText>
        </G>
      </Svg>
      <Text style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>연한 초록 밴드가 정상 범위예요. 단위: {metric.unit}</Text>
    </View>
  );
}
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend-mobile/src/components/v2.tsx
git commit -m "feat(mobile): v2 컴포넌트 — 스쿼클 아이콘·등수 슬라이더·범위 바·FixedCTA·추이 차트"
```

---

### Task 4: L2 상세 오버레이 `MetricDetailScreen`

**Files:**
- Create: `frontend-mobile/src/screens/MetricDetailScreen.tsx`

**Interfaces:**
- Consumes: Task 2 `headline/yearDelta/deltaText/rankFromPercentile` · Task 3 `SquircleIcon/categoryVisual/PeerRankSlider/RangeBar/MetricTrendChart` · UI.tsx `T/Collapsible/StatusBadge/Divider`
- Produces: `default MetricDetailScreen({ metric, report, reports, onClose }: { metric: MetricDefinition; report: Report; reports: Report[]; onClose: () => void })` — RN `Modal` 기반 풀스크린 오버레이. Android 백버튼은 `onRequestClose`가 처리.

- [ ] **Step 1: 화면 작성** — 구성(위→아래): 헤더(뒤로가기+항목명) → 상태 배지 → 헤드라인 큰 문장 → 값+전년 대비 → 또래 등수 슬라이더(또는 RangeBar) → '자세히 보기' 펼침(L3: 원본 수치 표·추이 차트·용어 설명) → 고지.

```tsx
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import type { MetricDefinition, Report } from '../data';
import { deltaText, headline, rankFromPercentile, yearDelta } from '../interpret';
import { Collapsible, StatusBadge, T } from '../components/UI';
import { categoryVisual, MetricTrendChart, PeerRankSlider, RangeBar, SquircleIcon } from '../components/v2';

// L2 항목 상세 — 화면 전환은 이 오버레이 한 번만. 안에서는 펼침(L3)으로만 더 들어간다.
export default function MetricDetailScreen({ metric, report, reports, onClose }: {
  metric: MetricDefinition;
  report: Report;
  reports: Report[];
  onClose: () => void;
}) {
  const value = report.values[metric.key];
  const statusColor = metric.status === '정상' ? T.success : metric.status === '주의' ? T.warn : T.danger;
  const delta = yearDelta(reports, metric.key, report.year);
  const visual = categoryVisual(metric.category);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: T.bg }}>
        {/* 헤더 — 뒤로가기 + 항목명 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 54, paddingBottom: 10, backgroundColor: T.white }}>
          <Pressable onPress={onClose} hitSlop={10} style={{ padding: 8 }}>
            <Ionicons name="chevron-back" size={24} color={T.text1} />
          </Pressable>
          <Text style={{ fontSize: 17, fontWeight: '700', color: T.text1 }}>{metric.name}</Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
          {/* L2 상단 — 판단 먼저: 배지 → 쉬운 문장 → 값·전년 대비 */}
          <View style={{ backgroundColor: T.white, borderRadius: T.radius, padding: 20, marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <SquircleIcon icon={visual.icon} color={visual.color} bg={visual.bg} />
              <StatusBadge status={metric.status} />
            </View>
            <Text style={{ fontSize: 24, fontWeight: '800', color: T.text1, lineHeight: 33 }}>{headline(metric, value)}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 12 }}>
              <Text style={{ fontSize: 40, fontWeight: '800', color: statusColor, lineHeight: 44 }}>{value}</Text>
              <Text style={{ fontSize: 14, color: T.text3, marginLeft: 4, marginBottom: 5 }}>{metric.unit}</Text>
            </View>
            {delta && <Text style={{ fontSize: 15, color: T.text2, marginTop: 6 }}>{deltaText(delta, metric.unit)}</Text>}
          </View>

          {/* 또래 비교 — percentile 있을 때만 등수, 없으면 정상범위 위치 바 */}
          <View style={{ backgroundColor: T.white, borderRadius: T.radius, padding: 20, marginBottom: 12 }}>
            {metric.percentile != null ? (
              <>
                <Text style={{ fontSize: 17, fontWeight: '700', color: T.text1, lineHeight: 25 }}>
                  같은 나이대 100명이라면,{'\n'}그중 <Text style={{ color: statusColor }}>{rankFromPercentile(metric.percentile)}등</Text>이에요
                </Text>
                <PeerRankSlider rank={rankFromPercentile(metric.percentile)} color={statusColor} />
              </>
            ) : (
              <>
                <Text style={{ fontSize: 17, fontWeight: '700', color: T.text1 }}>정상 범위와 비교하면 여기예요</Text>
                <RangeBar metric={metric} value={value} />
              </>
            )}
          </View>

          {/* L3 — 자세히 보기 펼침: 원본 수치·정상범위 표, 추이 차트, 용어 설명 */}
          <View style={{ backgroundColor: T.white, borderRadius: T.radius, paddingHorizontal: 20, marginBottom: 12 }}>
            <Collapsible title="자세히 보기">
              <View style={{ flexDirection: 'row', gap: 24, marginBottom: 16 }}>
                <DetailCell label="내 수치" value={`${value}${metric.unit}`} color={statusColor} />
                <DetailCell label="정상 기준" value={metric.normalText} />
                {metric.peerMean != null && <DetailCell label="또래 평균" value={`${metric.peerMean}${metric.unit}`} />}
              </View>
              <MetricTrendChart metric={metric} reports={reports} />
              <View style={{ marginTop: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: T.text1, marginBottom: 4 }}>이 항목은요</Text>
                <Text style={{ fontSize: 15, color: T.text2, lineHeight: 22 }}>{metric.description}</Text>
                <Text style={{ fontSize: 13, color: T.text3, lineHeight: 19, marginTop: 6 }}>{metric.note}</Text>
              </View>
            </Collapsible>
          </View>

          <Text style={{ fontSize: 12, color: T.text3, textAlign: 'center' }}>참고용이며 진단이 아닙니다</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

function DetailCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View>
      <Text style={{ fontSize: 12, color: T.text3, marginBottom: 3 }}>{label}</Text>
      <Text style={{ fontSize: 15, fontWeight: '700', color: color ?? T.text1 }}>{value}</Text>
    </View>
  );
}
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend-mobile/src/screens/MetricDetailScreen.tsx
git commit -m "feat(mobile): L2 항목 상세 오버레이 + L3 펼침"
```

---

### Task 5: 홈(L0) 재구성 — TOP3 카드

**Files:**
- Modify: `frontend-mobile/src/screens/DashboardScreen.tsx`

**Interfaces:**
- Consumes: Task 2 `top3Alerts/headline` · Task 3 `SquircleIcon/categoryVisual`
- Produces: props에 `onOpenDetail?: (key: MetricKey, year: number) => void` 추가(옵셔널 — App 와이어링 전에도 컴파일됨)

- [ ] **Step 1: props 확장** — `MetricKey`를 data import에 추가하고 컴포넌트 시그니처에 `onOpenDetail?: (key: MetricKey, year: number) => void` 추가.
- [ ] **Step 2: "지금 확인할 항목" 카드(DashboardScreen.tsx:150-199)를 TOP3 카드로 교체** — 규칙: **수치 없음**, 1·2·3 번호, 항목명 + `headline()` 한 줄 + 상태 배지 + chevron, 탭하면 `onOpenDetail?.(m.key, latest.year)`:

```tsx
{/* 지금 주의할 항목 TOP 3 — L0에는 수치를 두지 않는다. 탭하면 바로 항목 상세(L2). */}
{!isPreview && (
  <FadeInUp delay={180}>
  <View style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8, marginBottom: 12 }}>
    <Text style={{ fontSize: 17, fontWeight: '700', color: T.text1, marginBottom: 4 }}>지금 주의할 항목 TOP 3</Text>
    <Text style={{ fontSize: 13, color: T.text3, marginBottom: 8 }}>가장 먼저 확인하면 좋은 항목이에요.</Text>
    {top3.length === 0 ? (
      <View style={{ alignItems: 'center', paddingVertical: 20 }}>
        <Ionicons name="checkmark-circle" size={36} color={T.success} />
        <Text style={{ fontSize: 15, fontWeight: '700', color: T.success, marginTop: 8 }}>모두 정상이에요</Text>
        <Text style={{ fontSize: 13, color: T.text3, marginTop: 3 }}>지금의 생활습관을 유지해보세요.</Text>
      </View>
    ) : top3.map((m, i) => {
      const visual = categoryVisual(m.category);
      return (
        <Pressable
          key={m.key}
          onPress={() => onOpenDetail?.(m.key, latest.year)}
          style={[{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
                  i < top3.length - 1 && { borderBottomWidth: 1, borderBottomColor: T.divider }]}
        >
          <Text style={{ width: 16, fontSize: 15, fontWeight: '700', color: T.text3 }}>{i + 1}</Text>
          <SquircleIcon icon={visual.icon} color={visual.color} bg={visual.bg} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: T.text1 }}>{m.name}</Text>
            <Text style={{ fontSize: 13, color: T.text2, marginTop: 2 }}>{headline(m, latest.values[m.key])}</Text>
          </View>
          <StatusBadge status={m.status} />
          <Ionicons name="chevron-forward" size={18} color={T.text3} />
        </Pressable>
      );
    })}
    {/* 전체 보기 — 하단 탭 '검사항목'으로 이동 */}
    <Pressable onPress={() => onTab('records')} style={{ paddingVertical: 14, alignItems: 'center', borderTopWidth: 1, borderTopColor: T.divider }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: T.primary }}>전체 항목 보기</Text>
    </Pressable>
  </View>
  </FadeInUp>
)}
```

컴포넌트 상단에서 `const top3 = top3Alerts(metricDefinitions);`로 계산하고, 기존 `topAlerts`(slice(0,4)) 계산은 제거. import에 `top3Alerts, headline`(interpret), `SquircleIcon, categoryVisual`(v2), `StatusBadge`(UI) 추가.

- [ ] **Step 3: 히어로·빠른이동 토큰 정리** — 점수 히어로(64~80pt 숫자)는 유지. `QUICK_LINKS`의 색은 `T.primary/T.primaryLight`를 쓰고 있는데 이제 그린 틴트가 되므로 그대로 두면 인터랙션 색으로 맞다(빠른 이동 = 누르는 것). 프리뷰 카드·점수 바 등은 토큰이 자동 반영되므로 구조 변경 없음. 단 하나: 히어로가 이제 연회색 배경 위에 바로 놓이므로 히어로 영역(`DashboardScreen.tsx:91` View)을 흰 카드로 감싼다 — `style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, padding: 20, marginBottom: 12, marginTop: 16 }}`. 프리뷰 분기(`:72` View)도 동일하게 흰 카드로.
- [ ] **Step 4: typecheck + Commit**

Run: `npm run typecheck` → PASS

```bash
git add frontend-mobile/src/screens/DashboardScreen.tsx
git commit -m "feat(mobile): 홈 L0 재구성 — TOP3 카드(수치 없음)·전체 보기"
```

---

### Task 6: 검사항목(L1) 재구성 — RecordsScreen

**Files:**
- Modify: `frontend-mobile/src/screens/RecordsScreen.tsx`

**Interfaces:**
- Consumes: Task 2 `sortByAttention/statusCounts` · Task 3 `SquircleIcon/categoryVisual` · UI.tsx `StatusBadge`
- Produces: props에 `onOpenDetail?: (key: MetricKey, year: number) => void` 추가. **PDF 내보내기 버튼·`exportReportPdf` 관련 코드는 이 화면에서 제거**(Task 9에서 프로필로 이식— `reportExport.ts` 모듈 자체는 남긴다).

- [ ] **Step 1: 헤더 교체** — Eyebrow `RECORDS` → `METRICS`, 제목 `검진·복약 기록` → `검사항목`(fontSize 26으로 — 화면 제목은 작게), 부제 "연도를 고르고 항목을 누르면 자세한 설명을 볼 수 있어요."
- [ ] **Step 2: 연도 선택기** — 기존 `ReportRow` 세로 리스트(병원·점수 포함, RecordsScreen.tsx:92-135)를 가로 연도 칩 + 선택 연도 메타 한 줄로 교체:

```tsx
{view === 'metrics' && (
  <FadeInUp delay={140}>
  <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {[...reports].reverse().map((r) => {
        const active = r.year === selectedYear;
        return (
          <Pressable key={r.year} onPress={() => setSelectedYear(r.year)}
            style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: T.radiusPill, backgroundColor: active ? T.primary : T.white }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: active ? '#fff' : T.text2 }}>{r.year}년</Text>
          </Pressable>
        );
      })}
    </ScrollView>
    {/* 선택 연도 메타 + 삭제(기능 보존) */}
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 }}>
      <Text style={{ flex: 1, fontSize: 13, color: T.text3 }}>{detailReport.date} · {detailReport.hospital} · {detailReport.score}점</Text>
      {usingRealData && !!userId && (
        <Pressable hitSlop={8} onPress={confirmDelete}>
          <Ionicons name="trash-outline" size={17} color={T.text3} />
        </Pressable>
      )}
    </View>
  </View>
  </FadeInUp>
)}
```

`confirmDelete`는 기존 `ReportRow`의 `onDelete` Alert 로직(RecordsScreen.tsx:107-129)을 `detailReport` 기준 함수로 옮긴 것(연도 인자만 `detailReport.year`로). `ReportRow` 컴포넌트는 삭제.

- [ ] **Step 3: 상태 요약 칩(필터)** — 연도 선택기 아래에 추가. `const [filter, setFilter] = useState<Status | null>(null);`, `const counts = statusCounts(yearMetrics);`:

```tsx
<View style={{ flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 12 }}>
  {([['전체', null], [`정상 ${counts.정상}`, '정상'], [`주의 ${counts.주의}`, '주의'], [`위험 ${counts.위험}`, '위험']] as const).map(([label, val]) => {
    const active = filter === val;
    return (
      <Pressable key={label} onPress={() => setFilter(val as Status | null)}
        style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: T.radiusPill, backgroundColor: active ? T.primary : T.white }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : T.text2 }}>{label}</Text>
      </Pressable>
    );
  })}
</View>
```

- [ ] **Step 4: 항목 리스트를 L1 행으로 교체** — 기존 상세 항목 Collapsible(RecordsScreen.tsx:137-187) 대신, **주의 순 정렬 + 필터 적용** 리스트. 행 = 스쿼클 아이콘 + 항목명/카테고리 + 값 + 배지 + chevron, 탭하면 `onOpenDetail?.(metric.key, selectedYear)`. **L1에는 설명 문장·정상기준·또래평균을 두지 않는다**(전부 L2/L3로):

```tsx
const rows = sortByAttention(yearMetrics).filter((m) => (filter ? m.status === filter : true));
...
<View style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, marginBottom: 12 }}>
  {rows.map((metric, i) => {
    const visual = categoryVisual(metric.category);
    const { color } = getStatusStyle(metric.status);
    return (
      <Pressable key={metric.key} onPress={() => onOpenDetail?.(metric.key, selectedYear)}
        style={[{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
                i < rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: T.divider }]}>
        <SquircleIcon icon={visual.icon} color={visual.color} bg={visual.bg} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: T.text1 }}>{metric.name}</Text>
          <Text style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>{metric.category}</Text>
        </View>
        <Text style={{ fontSize: 16, fontWeight: '700', color }}>{detailReport.values[metric.key]}<Text style={{ fontSize: 12, fontWeight: '500', color: T.text3 }}>{metric.unit}</Text></Text>
        <StatusBadge status={metric.status} />
        <Ionicons name="chevron-forward" size={16} color={T.text3} />
      </Pressable>
    );
  })}
  {rows.length === 0 && <Text style={{ fontSize: 13, color: T.text3, textAlign: 'center', paddingVertical: 24 }}>해당 상태의 항목이 없어요.</Text>}
</View>
```

- [ ] **Step 5: PDF 코드 제거** — `exportReportPdf` import, `exporting` state, `handleExport`, PDF Pressable(RecordsScreen.tsx:141-152) 삭제. `userName` prop은 유지해도 무해하나 사용처가 없어지므로 prop과 함께 제거(App.tsx의 전달부는 Task 7에서 정리). 복용약 세그먼트는 손대지 않는다(토큰 자동 반영).
- [ ] **Step 6: typecheck + Commit** — 주: App.tsx가 아직 `userName`을 넘기면 TS는 초과 prop 에러를 낸다. 이 태스크에서 App.tsx의 `<RecordsScreen ... userName={profile.name} />`에서 `userName` prop만 지운다(그 외 App 변경은 Task 7).

Run: `npm run typecheck` → PASS

```bash
git add frontend-mobile/src/screens/RecordsScreen.tsx frontend-mobile/App.tsx
git commit -m "feat(mobile): 검사항목 L1 재구성 — 연도 칩·상태 필터·주의 순 리스트"
```

---

### Task 7: App.tsx 4탭 재구성 + 상세 오버레이 와이어링

**Files:**
- Modify: `frontend-mobile/App.tsx`
- Modify: `frontend-mobile/src/data.ts:1` (`TabKey`에서 `'history'` 제거)

**Interfaces:**
- Consumes: Task 4 `MetricDetailScreen`, Task 5·6의 `onOpenDetail` props
- Produces: 탭 = `dashboard(홈) / records(검사항목) / analysis(분석) / upload(업로드)` + 헤더 프로필. `AnalysisScreen`에 `highlights/insight/changePace` props 전달(Task 8에서 수용). `ProfileScreen`에 `reports/metricDefinitions/usingRealData` 전달(Task 9에서 수용).

- [ ] **Step 1: 탭 배열 교체** — `App.tsx:35-41`:

```tsx
const TABS: Array<{ key: AppTab; label: string; icon: keyof typeof Ionicons.glyphMap; activeIcon: keyof typeof Ionicons.glyphMap }> = [
  { key: 'dashboard', label: '홈', icon: 'home-outline', activeIcon: 'home' },
  { key: 'records', label: '검사항목', icon: 'list-outline', activeIcon: 'list' },
  { key: 'analysis', label: '분석', icon: 'pulse-outline', activeIcon: 'pulse' },
  { key: 'upload', label: '업로드', icon: 'cloud-upload-outline', activeIcon: 'cloud-upload' },
];
```

`AppTab` 타입(`App.tsx:33`)에서 `'history'` 제거. `data.ts:1`의 `TabKey`에서도 `'history'` 제거. `HistoryScreen` import와 `{tab === 'history' && ...}` 렌더 분기(App.tsx:346-348) 삭제 — 단 `timeseries` state와 로딩 로직은 유지(Task 8에서 분석 탭이 쓴다).

- [ ] **Step 2: 상세 오버레이 상태 + 렌더** — `App()` 안에 추가:

```tsx
const [detail, setDetail] = useState<{ key: MetricKey; year: number } | null>(null);
const openDetail = (key: MetricKey, year: number) => setDetail({ key, year });
```

(`MetricKey`는 `./src/data` type import에 추가, `metricsForReport`도 import.) 하단 탭바 JSX 아래·토스트 위에:

```tsx
{detail && (() => {
  const rep = reportsForScreens.find((r) => r.year === detail.year) ?? reportsForScreens[reportsForScreens.length - 1];
  const m = metricsForReport(rep, metricDefinitionsForScreens).find((x) => x.key === detail.key);
  return m ? <MetricDetailScreen metric={m} report={rep} reports={reportsForScreens} onClose={() => setDetail(null)} /> : null;
})()}
```

- [ ] **Step 3: props 전달** — `DashboardScreen`·`RecordsScreen`에 `onOpenDetail={openDetail}` 추가. `AnalysisScreen`에 기존 HistoryScreen이 받던 값 전달: `highlights={usingRealData ? timeseries?.highlights ?? null : (isDemoAccount ? dummyHighlights : null)} insight={usingRealData ? timeseries?.insight ?? null : (isDemoAccount ? dummyInsight : null)} changePace={usingRealData ? timeseries?.change_pace ?? null : (isDemoAccount ? dummyChangePace : null)}` (AnalysisScreen이 아직 안 받으므로 **Task 8과 같은 커밋 전 typecheck가 깨진다 — 이 3개 prop 추가는 Task 8에서 한다**. 이 태스크에서는 주석 `// TODO(Task 8): timeseries props`만 남기지 말고 그냥 전달하지 않는다). `ProfileScreen`에는 `reports={reportsForScreens} metricDefinitions={metricDefinitionsForScreens} usingRealData={usingRealData}`를 전달하지 않는다(같은 이유로 Task 9에서).
- [ ] **Step 4: 탭바·헤더 v2 스타일** — `s.nav`: `borderTopWidth: 0`, `backgroundColor: T.white` 유지. `s.header`: `borderBottomWidth: 0`. 활성 탭 색은 `T.primary`(그린)로 토큰이 자동 적용됨. `s.logoIcon` `backgroundColor: T.primary` 그대로(브랜드). AuthForm의 에러 박스 hex `'#FFF0F0'` 2곳(App.tsx:576, 582) → `T.dangerBg`.
- [ ] **Step 5: typecheck + Commit**

Run: `npm run typecheck` → PASS

```bash
git add frontend-mobile/App.tsx frontend-mobile/src/data.ts
git commit -m "feat(mobile): 4탭 재구성 + L2 상세 오버레이 와이어링, 히스토리 탭 제거"
```

---

### Task 8: 분석 탭 — 히스토리 인사이트 카드 이식 + 리스킨, HistoryScreen 삭제

**Files:**
- Modify: `frontend-mobile/src/screens/AnalysisScreen.tsx`
- Modify: `frontend-mobile/App.tsx` (timeseries props 전달)
- Delete: `frontend-mobile/src/screens/HistoryScreen.tsx`

**Interfaces:**
- Consumes: `RealTimeseries`(health.ts), HistoryScreen의 인사이트 카드 JSX(이식 원본)
- Produces: `AnalysisScreen` props 확장 — `highlights?: Highlight[] | null; insight?: Insight | null; changePace?: ChangePace[] | null` (타입 정의는 HistoryScreen.tsx:9-11의 세 줄을 그대로 가져온다). 기존 분석 콘텐츠(대사증후군·ASCVD·계산기·What-if·eGFR·권장사항)는 전부 유지.

- [ ] **Step 1: 인사이트 카드 3종 이식** — HistoryScreen.tsx의 "한눈에 요약"(81-109행), "또래 대비 변화 속도"(113-148행), "주목할 만한 변화"(151-175행) 블록과 `METRIC_LABEL` 맵(15-32행), 타입 3줄(9-11행)을 AnalysisScreen 상단(페이지 헤더 바로 아래)으로 복사. props에 세 값 추가. AnalysisScreen에 이미 있는 `FadeInUp` 등 헬퍼와 충돌하면 AnalysisScreen 쪽 것을 쓴다.
- [ ] **Step 2: App.tsx 전달** — `<AnalysisScreen ...>`에 Task 7 Step 3에 적힌 `highlights/insight/changePace` 표현식 그대로 추가.
- [ ] **Step 3: HistoryScreen.tsx 삭제** — `git rm frontend-mobile/src/screens/HistoryScreen.tsx`. 남은 참조가 없는지 확인: `grep -rn "HistoryScreen" frontend-mobile/src frontend-mobile/App.tsx` → 0건.
- [ ] **Step 4: AnalysisScreen 인라인 hex 정리** — 파일 내 `#1F6B4A` → `T.success`, `#EFEFEF` → `T.cardAlt`, `#111827` → `T.text1`, 그 외 구 팔레트 hex(`#F5F5F5`, `#E5E5E5`, `#9A9A9A`, `#5C5C5C`, `#191919`, `#1A1A1A`, `#3CB371`, `#FF8A3D`, `#F44336`)를 대응 토큰(`T.cardAlt/T.divider/T.text3/T.text2/T.text1/T.text1/T.success/T.warn/T.danger`)으로 치환. 구조 변경은 하지 않는다(리스킨만).
- [ ] **Step 5: typecheck + Commit**

Run: `npm run typecheck` → PASS · `npm test` → PASS

```bash
git add -A frontend-mobile
git commit -m "feat(mobile): 분석 탭에 시계열 인사이트 이식, 히스토리 화면 제거"
```

---

### Task 9: 프로필 — PDF 내보내기 이식 + 리스킨

**Files:**
- Modify: `frontend-mobile/src/screens/ProfileScreen.tsx`
- Modify: `frontend-mobile/App.tsx` (props 전달)

**Interfaces:**
- Consumes: `exportReportPdf(report, metrics, userName)`(reportExport.ts — RecordsScreen에서 쓰던 시그니처 그대로), `metricsForReport`(data.ts)
- Produces: `ProfileScreen` props 확장 — `reports?: Report[] | null; metricDefinitions?: MetricDefinition[] | null` (없으면 PDF 카드 숨김)

- [ ] **Step 1: PDF 카드 추가** — ProfileScreen 설정 목록 위나 아래에 "검진 결과 내보내기" 카드: 연도 칩(가로 스크롤, 기본 최신 연도) + 버튼. 구현은 RecordsScreen에서 제거한 로직 재사용:

```tsx
const [pdfYear, setPdfYear] = useState<number | null>(null);
const [exporting, setExporting] = useState(false);
const pdfReport = reports?.find((r) => r.year === (pdfYear ?? reports[reports.length - 1]?.year));
const handleExport = async () => {
  if (!pdfReport || !metricDefinitions) return;
  setExporting(true);
  try {
    await exportReportPdf(pdfReport, metricsForReport(pdfReport, metricDefinitions), profile.name);
  } catch (e) {
    Alert.alert('내보내기 실패', e instanceof Error ? e.message : 'PDF를 만들지 못했습니다.');
  } finally { setExporting(false); }
};
```

UI: 흰 카드(radius 20) 안에 제목 "검진 결과 내보내기" + 설명 "병원 지참·가족 공유용 PDF로 저장해요." + 연도 칩 + `SecondaryBtn label={exporting ? 'PDF를 만드는 중...' : 'PDF로 내보내기'} onPress={handleExport}`. `reports`가 없거나 비어 있으면 카드 전체 미표시.

- [ ] **Step 2: App.tsx 전달** — `<ProfileScreen ...>`에 `reports={loggedIn && !needEmptyState ? reportsForScreens : null} metricDefinitions={loggedIn && !needEmptyState ? metricDefinitionsForScreens : null}` 추가.
- [ ] **Step 3: ProfileScreen 인라인 hex 정리** — Task 8 Step 4와 같은 치환표 적용.
- [ ] **Step 4: typecheck + Commit**

Run: `npm run typecheck` → PASS

```bash
git add frontend-mobile/src/screens/ProfileScreen.tsx frontend-mobile/App.tsx
git commit -m "feat(mobile): PDF 내보내기를 프로필로 이동"
```

---

### Task 10: 업로드 — 하단 고정 CTA + '분석 중' 로딩 상태 + 리스킨

**Files:**
- Modify: `frontend-mobile/src/screens/UploadScreen.tsx`

**Interfaces:**
- Consumes: Task 3 `FixedCTA`
- Produces: 화면 밖 인터페이스 변화 없음(props 동일)

- [ ] **Step 1: 파일을 읽고 단계 구조 파악** — UploadScreen은 촬영/선택 → OCR → 검수 → 저장 흐름. 각 단계의 "다음으로 진행" 주 버튼(저장·분석 요청 등 `PrimaryBtn` 또는 유사 Pressable)을 찾는다.
- [ ] **Step 2: 주 버튼을 FixedCTA로 이동** — 화면 루트를 `<View style={{ flex: 1 }}>`로 감싸고 ScrollView `contentContainerStyle`에 `paddingBottom: 110` 추가, 각 단계의 주 행동 버튼 1개를 `<FixedCTA label=... onPress=... disabled=... loading=... />`로 화면 하단 고정. 라벨은 동사형("결과지 분석하기", "이대로 저장하기" 등 — 기존 라벨이 동사형이면 유지). 보조 버튼(다시 찍기 등)은 본문에 그대로 둔다.
- [ ] **Step 3: '분석 중' 로딩 카드** — OCR 요청 중 상태(기존 loading state 사용)에서 진행 단계를 보여주는 카드를 본문에 렌더:

```tsx
function AnalyzingCard() {
  return (
    <View style={{ backgroundColor: T.white, borderRadius: T.radius, padding: 24, alignItems: 'center', marginBottom: 12 }}>
      <ActivityIndicator size="large" color={T.primary} style={{ marginBottom: 16 }} />
      <Text style={{ fontSize: 17, fontWeight: '700', color: T.text1, marginBottom: 6 }}>결과지를 읽고 있어요</Text>
      <Text style={{ fontSize: 14, color: T.text3, textAlign: 'center', lineHeight: 21 }}>
        사진에서 검사 수치를 찾아 정리하는 중이에요.{'\n'}보통 10~30초 정도 걸려요.
      </Text>
    </View>
  );
}
```

기존에 로딩 표시가 이미 있으면 이 카드로 교체, 없으면 OCR 대기 분기에 추가.

- [ ] **Step 4: 인라인 hex 정리** — Task 8 Step 4 치환표 적용.
- [ ] **Step 5: typecheck + Commit**

Run: `npm run typecheck` → PASS

```bash
git add frontend-mobile/src/screens/UploadScreen.tsx
git commit -m "feat(mobile): 업로드 하단 고정 CTA + 분석 중 로딩 카드"
```

---

### Task 11: 구 팔레트 hex 전역 정리 + 최종 검증

**Files:**
- Modify: 잔여 hex가 발견되는 모든 `frontend-mobile/src/**`, `frontend-mobile/App.tsx`

- [ ] **Step 1: 구 팔레트 grep** — 다음이 `frontend-mobile/src`와 `App.tsx`에서 0건이어야 한다(치환표는 Task 8 Step 4):

```bash
grep -rniE "#1A1A1A|#EFEFEF|#F5F5F5|#191919|#5C5C5C|#9A9A9A|#E5E5E5|#3CB371|#FF8A3D|#F44336|#1F6B4A|#FFF0F0|#111827|#BDBDBD" frontend-mobile/src frontend-mobile/App.tsx
```

발견되면 토큰으로 치환. (DashboardScreen의 `PillIcon` 등 일러스트성 색은 `T.primary` 사용 중이므로 자동 반영 — 어색하면 `T.text1`로.)

- [ ] **Step 2: 전체 검증**

Run: `npm run typecheck` → PASS · `npm test` → PASS (interpret 테스트 전부)

- [ ] **Step 3: 데모 렌더 확인(수동)** — `npx expo start`로 실행해 root/1234 데모 로그인 후 확인: ① 홈 점수+TOP3(수치 없음)+전체 보기 ② 검사항목 연도 칩·필터·주의 순 ③ 항목 탭 → L2 오버레이(헤드라인·전년 대비·범위 바) → 자세히 보기 펼침(표·정상 밴드 차트·설명·고지) → 뒤로가기/Android 백버튼 ④ 분석 탭 인사이트 카드+기존 콘텐츠 ⑤ 업로드 고정 CTA ⑥ 프로필 PDF 내보내기 ⑦ 비로그인 프리뷰·빈 상태. 문제 발견 시 수정 후 재확인.
- [ ] **Step 4: Commit**

```bash
git add -A frontend-mobile
git commit -m "chore(mobile): 구 팔레트 hex 정리 및 v2 최종 검증"
```
