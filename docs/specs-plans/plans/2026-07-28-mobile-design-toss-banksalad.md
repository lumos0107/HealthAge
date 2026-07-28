# 모바일 디자인 개편(토스 구조 × 뱅샐 컬러) Implementation Plan


**Goal:** `frontend-mobile`의 무신사 스타일을 토스 문법 × 뱅크샐러드 그린으로 전면 교체한다 (기능·정보 100% 유지, 로직 diff 0).

**Architecture:** 디자인 토큰이 `src/components/UI.tsx`의 `T` 객체에 집중돼 있고, 화면들의 카드 래퍼가 이미 `T.white`·`T.radius`를 참조한다. 따라서 Task 1(토큰+공통 컴포넌트)이 전 화면에 즉시 파급되고, 이후 화면별 태스크는 "full-bleed 구분선 블록 → 카드", "회색 배지 → 색 틴트 칩" 재배치만 담당한다.

**Tech Stack:** React Native (Expo), TypeScript, Pretendard(적용됨), 검증은 tsc + Android 에뮬레이터 실화면.

**스펙:** `docs/specs-plans/specs/2026-07-28-mobile-design-toss-banksalad.md` (승인됨)

## Global Constraints

- **핵심 원칙: 구조·컴포넌트는 토스, 브랜드 컬러만 뱅크샐러드.**
- **로직 diff 0**: 데이터 로딩·계산·상태·핸들러 코드는 한 줄도 바꾸지 않는다. 스타일 객체·JSX 래퍼·아이콘 색만 변경.
- **기능·정보 100% 유지**: 표시되는 텍스트·수치·기능을 하나도 빼지 않는다. 정보 담긴 문구 변경 금지(딱딱한 라벨의 어투 다듬기만 허용).
- **그린 역할 분리**: 브랜드 그린 `#00C073`은 버튼·링크·활성 탭·인터랙션 아이콘 전용. 상태 '정상'은 딥그린 `#1F8A5D` 배지·수치 전용.
- **토큰 키 이름은 절대 바꾸지 않는다** (`T.bg`, `T.radius` 등) — 값만 교체해야 화면 코드가 그대로 컴파일된다.
- **⛔ 이번 단계 아님 (다음 단계로 이월 — 누락 아님)**: ① 정상범위 표기 방식 변경 ② 해석 문장(인사이트 카피) 개편 ③ 차트 밴드(정상범위 음영) 도입. 이 3종은 건드리지 말 것.
- 작업 브랜치: `front-app`. 마지막 태스크에서 main 머지 + 4브랜치 동기화(25번 문서 §5 흐름).
- 검증 산출물은 `.task-design-verify/`에 저장(기존 `.task*-verify/` gitignore 글롭에 걸림 — 커밋 금지).

---

### Task 0: 환경 준비 + 개편 전(before) 스크린샷 확보

**Files:** 코드 변경 없음.

- [ ] **Step 1: 브랜치 정렬**

```bash
cd WITHUS/Health_Management_Service
git checkout front-app && git merge main   # 스펙 커밋(0e0d69b)까지 ff
```

- [ ] **Step 2: 에뮬레이터·Metro 기동**

```bash
# 에뮬레이터 withus(5554) 부팅 확인. 데모 계정은 오프라인 동작이라 백엔드 불필요.
adb devices          # emulator-5554 확인
cd frontend-mobile && npx expo start --port 8081   # 백그라운드
```

앱 실행 후 로그인 모달에 데모 계정 `root` / `1234` 입력(오프라인 완전 동작, 24번 문서 §6).

- [ ] **Step 3: 개편 전 6화면 + 로그인 모달 스크린샷**

```bash
mkdir -p .task-design-verify/before
# 각 탭 이동 후:
adb -s emulator-5554 exec-out screencap -p > .task-design-verify/before/<dashboard|analysis|history|records|upload|profile|auth-modal>.png
```

Expected: before/ 에 PNG 7장. 이후 태스크의 "정보 누락 대조" 기준본이 된다.

---

### Task 1: 디자인 토큰 `T` + 공통 컴포넌트 교체 (UI.tsx)

**Files:**
- Modify: `frontend-mobile/src/components/UI.tsx` (토큰 37-89행, StyleSheet 471-528행, 개별 컴포넌트)

**Interfaces:**
- Produces: 토큰 키는 기존과 100% 동일(값만 교체). 이후 모든 태스크가 이 값을 소비한다.

- [ ] **Step 1: `T` 객체를 아래 값으로 교체** (키 추가·삭제 없이 값만. 파일 상단 무신사 주석 블록은 토스×뱅샐 설명으로 교체)

```ts
export const T = {
  // Primary — 뱅크샐러드 그린. "누를 수 있는 것만 브랜드 그린" (버튼·링크·활성탭·인터랙션 아이콘 전용)
  primary: '#00C073',
  primaryPressed: '#00A862',
  primaryLight: '#E6F9F1',
  primaryDark: '#00834F',

  // Backgrounds — 토스 문법: 연회색 화면 배경 위 테두리 없는 흰 카드
  bg: '#F3F5F7',
  white: '#FFFFFF',
  cardAlt: '#F2F4F6',        // 입력 채움·스쿼클 배경

  // Text — 토스 잉크(블루-그레이) 위계
  text1: '#191F28',
  text2: '#4E5968',
  text3: '#8B95A1',

  // Borders & dividers — 카드 테두리는 없다. 구분선은 카드 내부 행 전용
  border: '#E5E8EB',          // 입력 포커스·예외적 경계 전용
  divider: '#F2F4F6',

  // Semantic — 상태색은 배지·수치 전용. 배경은 옅은 색 틴트 칩
  success: '#1F8A5D',         // 딥그린 (브랜드 그린과 톤·역할 분리)
  successBg: '#EAF7F1',
  warn: '#D97706',            // 딥 앰버 (#FF8A3D는 틴트 위 대비 부족으로 어둡게 조정)
  warnBg: '#FFF3E7',
  danger: '#F04452',
  dangerBg: '#FEE9EB',

  // Radius — 카드 20 · 버튼 14 · 입력 12 · 칩 999
  radius: 20,
  radiusMd: 14,
  radiusSm: 12,
  radiusPill: 999,

  // Shadow — 없음. 배경 대비로만 카드 구분 (토스 방식)
  shadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },

  fontDisplay: 'Pretendard',

  // eyebrow — 대문자·자간 폐기. 일반 회색 캡션으로 (컴포넌트 호환 유지)
  eyebrow: { fontSize: 13, fontWeight: '600' as const, color: '#8B95A1', letterSpacing: 0, textTransform: 'none' as const },
} as const;
```

- [ ] **Step 2: `ui` StyleSheet 교체** (471-528행)

```ts
const ui = StyleSheet.create({
  card: {
    backgroundColor: T.white,
    borderRadius: T.radius,
    padding: 20,
    marginBottom: 12,
    // 테두리 제거 — 배경 대비로 구분
  },
  pageTitle: { fontSize: 24, fontWeight: '700', fontFamily: T.fontDisplay, color: T.text1, letterSpacing: -0.3, marginTop: 6 },
  pageSubtitle: { fontSize: 14, color: T.text3, lineHeight: 20, marginTop: 6 },
  notice: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: T.white, borderRadius: T.radiusMd,
    padding: 16, marginBottom: 12,
  },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 20, color: T.text2, fontWeight: '500' },
  primaryBtn: {
    backgroundColor: T.primary,
    height: 54,
    borderRadius: T.radiusMd,   // 필 → 토스식 사각라운드 14
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryBtn: {
    backgroundColor: T.cardAlt,
    height: 54,
    borderRadius: T.radiusMd,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  secondaryBtnText: { color: T.text2, fontWeight: '700', fontSize: 15 },
  ghostBtn: { height: 48, borderRadius: T.radiusMd, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  ghostBtnText: { color: T.text3, fontWeight: '600', fontSize: 15 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: T.radiusPill,
    backgroundColor: T.cardAlt,
  },
  chipActive: { backgroundColor: T.primaryLight },
  chipText: { fontSize: 14, fontWeight: '500', color: T.text3 },
  chipTextActive: { color: T.primary, fontWeight: '700' },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: T.text2, marginBottom: 8 },
  fieldInput: {
    height: 52,
    borderWidth: 0,             // 테두리 박스 → 회색 채움 (토스 입력 문법)
    borderRadius: T.radiusSm,
    paddingHorizontal: 16,
    fontSize: 15,
    color: T.text1,
    backgroundColor: T.cardAlt,
  },
});
```

- [ ] **Step 3: 개별 컴포넌트 정리** (전부 UI.tsx 안)

  - `FieldInput`(255행): error 시 `{ borderColor: T.danger, borderWidth: 1.5 }` 유지(채움형이라 error에만 테두리 등장 — 의도). "확인 필요" 문구는 `다시 확인해 주세요`로.
  - `FieldDisplay`(270행): 내부 배경 `T.cardAlt` 그대로(토큰 교체로 자동 적용).
  - `SecondaryBtn` danger(221행): `{ backgroundColor: T.dangerBg }` + 글자 `T.danger` 그대로 — 틴트 칩 문법과 일치.
  - `statusColor`(94-98행): 로직 그대로 (successBg 등 토큰 값이 틴트로 바뀌며 자동 적용).
  - `DirectionalBar`(393-397행): 하드코딩 `'#1F6B4A'` 2곳 → `T.success`, `'#9A9A9A'` → `T.text3`.
  - `SectionTitle`(162행): fontSize 18 → 17, action 색 `T.primary`(브랜드 그린 링크 — 인터랙션이므로 허용).
  - `AnimatedScore`(366행)·`DirectionalBar`(436행)의 트랙 배경 `T.bg` → `T.cardAlt` (bg가 연회색이 되면서 흰 카드 안 트랙이 보이도록).

- [ ] **Step 4: 타입·빌드 확인**

```bash
cd frontend-mobile && npx tsc --noEmit
```

Expected: 에러 0 (토큰 키 불변이므로).

- [ ] **Step 5: 에뮬레이터 스모크 확인** — 대시보드가 연회색 배경 + 흰 카드로 보이는지, 버튼이 그린 사각라운드인지.

```bash
adb -s emulator-5554 exec-out screencap -p > .task-design-verify/task1-smoke.png
```

- [ ] **Step 6: Commit**

```bash
git add frontend-mobile/src/components/UI.tsx
git commit -m "design(app): 토큰·공통 컴포넌트 토스 구조 × 뱅샐 그린으로 교체"
```

---

### Task 2: App.tsx 셸 — 헤더·탭바·로그인 바텀시트·토스트·잠금/빈 상태

**Files:**
- Modify: `frontend-mobile/App.tsx` (317-335 헤더, 367-380 탭바, 382-388 토스트, 390-399+ 모달, LockedNotice·EmptyDataState, 하단 StyleSheet `s`)

**Interfaces:**
- Consumes: Task 1의 `T` 값.

- [ ] **Step 1: 셸 스타일 교체**

  - 헤더: 배경 `T.bg`(화면과 한 몸), 그림자·경계 제거. 로고 아이콘 배경(`s.logoIcon`) → `T.primary`.
  - 탭바(`s.nav`): 배경 `T.white`, `borderTopWidth: 0.5, borderTopColor: T.border`. 활성 아이콘·라벨 `T.primary`(브랜드 그린), 비활성 `T.text3`. `s.navIconWrapActive`의 배경 칠은 제거(토스 탭바는 아이콘 색만 바뀜).
  - 토스트(`s.toast`): 배경 `#191F28`(잉크 다크), 흰 글자, radius 14, 체크 아이콘 `#00C073`.
  - 로그인 바텀시트(`s.modalSheet`): 상단 radius 24, 핸들 `#E5E8EB`. 내부 입력은 FieldInput이라 자동 적용.
  - LockedNotice·EmptyDataState: 아이콘 원 배경 `T.primaryLight` + 아이콘 `T.primary`, 안내 블록을 흰 카드(radius 20)로.

- [ ] **Step 2: 검증** — `npx tsc --noEmit` 0 → 탭 4개 순회 + 로그아웃 상태 잠금 화면 + 로그인 모달 스크린샷:

```bash
adb -s emulator-5554 exec-out screencap -p > .task-design-verify/task2-<shell|auth|locked>.png
```

- [ ] **Step 3: Commit** — `design(app): 셸(헤더·탭바·모달·토스트) 토스 문법 적용`

---

### Task 3: 대시보드 화면

**Files:**
- Modify: `frontend-mobile/src/screens/DashboardScreen.tsx`

- [ ] **Step 1: 블록별 카드화**

  - 히어로(91-119행): 맨바닥 View → 흰 카드 `{ backgroundColor: T.white, marginHorizontal: 16, marginTop: 12, marginBottom: 12, borderRadius: T.radius, padding: 20 }`. 점수 폰트 80 → 64(카드 안 비례). 현황 3칸의 `borderLeftWidth` 세로선은 유지하되 색 `T.divider`.
  - 프리뷰 히어로(70-88행): 동일하게 카드화. 로그인 버튼은 이미 `T.primary` 참조 — radius만 `T.radiusMd`로.
  - 빠른 이동(125행): `borderTopWidth·borderBottomWidth` 제거 → 흰 카드. 아이콘 스쿼클(138행) `borderRadius: 18` 유지, 배경 `T.cardAlt`, 아이콘 색 `T.primary`(이동 링크 = 인터랙션 = 브랜드 그린). `PillIcon` 호출부는 `fill`/`outline` 기본값이 `T.primary`를 따르므로 수정 불필요.
  - "지금 확인할 항목"(153행): 래퍼는 이미 카드 — `paddingBottom: 8` → 12, 행 아이콘 스쿼클 배경은 틴트(`T.warnBg`/`T.dangerBg` — 토큰 교체로 자동 색 틴트화). 배지도 자동.

- [ ] **Step 2: 검증** — tsc 0 → 로그인/프리뷰 두 상태 스크린샷 → before/dashboard.png 대비 정보 누락 없는지 항목 단위 대조.

- [ ] **Step 3: Commit** — `design(app): 대시보드 카드 문법 적용`

---

### Task 4: 분석 화면 + WhatIfSimulator

**Files:**
- Modify: `frontend-mobile/src/screens/AnalysisScreen.tsx`, `frontend-mobile/src/components/WhatIfSimulator.tsx`

- [ ] **Step 1: AnalysisScreen 재배치**

  - 면책 고지(128행): `borderBottomWidth` full-bleed 행 → 카드 밖 캡션 유지하되 경계선 제거, `paddingHorizontal: 20`.
  - 카드 래퍼(138·183·245·282·316행 등): 이미 `T.radius` 참조 — `marginBottom: 8` → 12만 일괄 교체.
  - 카드 내부 행 구분(31·217·258·289행 등): `borderTopColor: T.divider` 그대로(토큰이 옅어져 자동).
  - 상태 표시: 회색 배지 → `statusColor()` 틴트 칩(토큰 교체로 자동). 하드코딩 색이 있으면 `T.*`로 치환.
  - 집단군 요약 줄(25번 §5-2에서 추가된 블록): 내용·문구 불변, 스타일만 틴트 박스.

- [ ] **Step 2: WhatIfSimulator** — 슬라이더·결과 블록의 하드코딩 회색을 `T.*` 토큰으로, 결과 강조는 상태색 유지(방향 필터 없음 원칙 그대로). 적용 버튼은 `PrimaryBtn` 상속으로 자동.

- [ ] **Step 3: 검증** — tsc 0 → 분석 탭 상·중·하 스크롤 3장 + What-if 조작 1장 스크린샷, before/analysis.png 대비 카드·수치 전량 존재 확인. **⛔ 해석 문장·정상범위 표기는 건드리지 않았는지 diff로 확인** (`git diff --stat`에 문구 변경이 없어야 함).

- [ ] **Step 4: Commit** — `design(app): 분석 화면 + What-if 카드 문법 적용`

---

### Task 5: 히스토리 화면

**Files:**
- Modify: `frontend-mobile/src/screens/HistoryScreen.tsx`

- [ ] **Step 1:** 인사이트 고지(73행) full-bleed 경계 제거, 카드들(82·115·153·242행) `marginBottom: 8→12`, "항목별 쉬운 설명" Collapsible(185행)의 `borderTopWidth` 래퍼 → 흰 카드로 감싸기. 그래프 트랙·축 회색은 `T.*` 토큰 치환. **⛔ 차트 밴드 추가 금지(다음 단계).**

- [ ] **Step 2: 검증** — tsc 0 → 스크롤 2장 스크린샷, before/history.png 대조(그래프 5종·하이라이트·또래 변화속도 전량).

- [ ] **Step 3: Commit** — `design(app): 히스토리 카드 문법 적용`

---

### Task 6: 기록 화면

**Files:**
- Modify: `frontend-mobile/src/screens/RecordsScreen.tsx`

- [ ] **Step 1:** 연도 세그먼트(68행): 흰 필 배경 → `T.cardAlt` 트랙 + 활성 세그먼트 흰색(토스 세그먼트 문법), 활성 글자 `T.text1`. PDF 버튼(145행): radius `T.radiusPill` → `T.radiusMd`, 배경 `T.primary`. 카테고리 카드(214행)·상세 행(263행): margin 8→12, 행 터치 하이라이트 `T.cardAlt`.

- [ ] **Step 2: 검증** — tsc 0 → 회차 표 + 상세 16항목 펼침 스크린샷, before/records.png 대조.

- [ ] **Step 3: Commit** — `design(app): 기록 화면 카드 문법 적용`

---

### Task 7: 업로드 화면 + LifestyleForm

**Files:**
- Modify: `frontend-mobile/src/screens/UploadScreen.tsx`, `frontend-mobile/src/components/LifestyleForm.tsx`

- [ ] **Step 1:** 상단 모드 탭(242행): `borderBottomWidth` 밑줄 탭 → `T.cardAlt` 트랙 세그먼트(기록 화면과 동일 문법). 확신도 검수 경고(306행): `T.warnBg` 틴트가 토큰으로 자동 — 글자 `T.warn` 확인. 업로드 타일(418·451행)·필드 카드(318행): margin 8→12. 입력은 FieldInput 상속 자동. LifestyleForm: 하드코딩 회색 → `T.*`.

- [ ] **Step 2: 검증** — tsc 0 → OCR 업로드·직접 입력·문진 3장 스크린샷, before/upload.png 대조. 저장 동작은 건드리지 않았으므로 실행하지 않는다(로직 diff 0을 `git diff`로 확인).

- [ ] **Step 3: Commit** — `design(app): 업로드·문진 카드 문법 적용`

---

### Task 8: 프로필 화면

**Files:**
- Modify: `frontend-mobile/src/screens/ProfileScreen.tsx`

- [ ] **Step 1:** 프로필 헤더(105행): full-bleed 경계 → 흰 카드(아바타 원 배경 `T.primaryLight`, 아이콘 `T.primary`). 설정 그룹(206·240행): `borderTopWidth` 그룹 → 토스 설정 문법 — 그룹별 흰 카드 + 행(아이콘 스쿼클 `T.cardAlt` + 라벨 + chevron `T.text3`). 탈퇴는 `T.danger` 글자 행 유지.

- [ ] **Step 2: 검증** — tsc 0 → 프로필 전체 스크롤 스크린샷, before/profile.png 대조(.ics·알림·인증정보·탈퇴 전량).

- [ ] **Step 3: Commit** — `design(app): 프로필 토스 설정 문법 적용`

---

### Task 9: 최종 전체 리뷰 + 정보 무결성 대조

**Files:** 수정은 발견된 결함에 한정.

- [ ] **Step 1:** 6화면 + 모달 after 스크린샷 세트 → before/ 와 나란히 놓고 **표시 정보 단위로** 대조(카드·수치·버튼·문구 개수). 누락 발견 시 해당 화면 수정 후 재확인.
- [ ] **Step 2:** 원칙 위반 스캔: ① 브랜드 그린이 상태 표시에 쓰인 곳 없는지 ② 상태 딥그린이 버튼에 쓰인 곳 없는지 ③ 하드코딩 색 잔존(`grep -rn "#[0-9A-Fa-f]\{6\}" src/screens src/components` — T 정의부·PillIcon 흰색 제외) ④ ⛔ 이월 3종을 건드리지 않았는지.
- [ ] **Step 3:** `npx tsc --noEmit` 0 확인 → 잔여 수정 커밋: `design(app): 최종 리뷰 반영`

---

### Task 10: 머지·동기화 (25번 문서 §5 흐름)

- [ ] **Step 1:**

```bash
git checkout main && git merge front-app
git branch -f front-web main && git branch -f backend main && git branch -f front-app main
git push origin main front-app front-web backend
```

- [ ] **Step 2:** `git branch -vv`로 4개 브랜치 동일 지점 확인.

---

## 다음 단계 (이 계획에 없음 — 의도적 이월, 스펙 ⛔ 섹션)

1. 정상범위 표기 방식 변경
2. 해석 문장(인사이트 카피) 개편
3. 차트 밴드(정상범위 음영) 도입
