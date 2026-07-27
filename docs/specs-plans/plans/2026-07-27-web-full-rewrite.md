# 웹 프론트 전면 재작성 Implementation Plan


**Goal:** `frontend/src/`를 전면 재작성해 모바일 앱의 전 기능 + 백엔드 22개 엔드포인트 전부를 큰 화면용 사이드바 레이아웃 웹으로 제공한다.

**Architecture:** Vite+React+TS 단일 SPA. `App.tsx`는 얇은 셸(작업·사이드바·섹션 전환·전역 데이터 1회 로드)이고, 7개 섹션이 각각 1파일로 자기 화면을 책임진다. 백엔드 통신은 `api/` 3파일(client·types·endpoints)에 모으고, 백엔드 응답→화면 모양 변환은 `api/adapt.ts` 한 곳에서만 한다. 판정은 전부 백엔드가 하고 프론트는 표시만 한다.

**Tech Stack:** Vite 7, React 19, TypeScript 5.8, Tailwind 4, Recharts 3, lucide-react, @supabase/supabase-js 2, vitest(신규 devDep), Playwright(설치됨)

## Global Constraints

이 제약은 **모든 task에 암묵적으로 포함**된다.

- **작업 위치**: `c:\Users\seungjun\Documents\work\WITHUS\Health_Management_Service`. git 저장소 `main` 브랜치. 이미 `01a4476`(G4) + `c5a5dae`(스펙) 위에서 작업.
- **셸**: Windows. PowerShell 7 사용. 경로 구분자 `\`, npm 명령은 `frontend/`에서 실행.
- **판정 금지**: 정상/주의/위험, risk_score, 대사증후군 판정, 계산기 값 — **전부 백엔드 값을 그대로 표시**한다. 프론트에서 재계산·재분류하지 않는다. (기존 `utils/healthScores.ts`의 프론트 계산은 삭제 대상)
- **값 없으면 "미측정"**: API에 없는 값을 프론트가 만들지 않는다. 숫자 0으로 채우지 않는다.
- **의료 표현 금지어**: 진단 · 확진 · 질병 판정. 대신 사용: 참고 정보 · 관리 필요 · 위험 경향 · 추적 관리 권장 · 미측정.
- **더미 금지**: 웹에는 오프라인/더미 모드를 만들지 않는다. 검증은 **항상 실계정 `webdemo40680@example.com` / `(비밀번호 가림)`** + 로컬 백엔드로 한다. (24번 §3 교훈: "더미로 검증했더니 통과했다"는 위험신호)
- **구버전 저장 행 대응**: `combo_analysis`, `single_groups`, `calculators`, `ldl_target`, `rarity`, `metabolic_syndrome_detail`은 **없을 수 있다**. 모든 소비 지점에서 `null` 분기를 반드시 둔다. 없으면 그 카드를 통째로 숨기고, 옆 카드가 깨지지 않게 한다.
- **커밋 메시지 끝에 반드시 추가**:
  ```
  ```
- **푸시 금지**: 사용자가 명시적으로 요청할 때만 `git push`. 각 task는 로컬 커밋까지만.
- **매 task 종료 조건**: `npm run build` 성공(= `tsc && vite build`) + 해당 task의 검증 통과 + 커밋.

## 로컬 실행 환경 (모든 검증 task의 전제)

```powershell
# 터미널 1 — 백엔드
cd c:\Users\seungjun\Documents\work\WITHUS\Health_Management_Service\backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000

# 터미널 2 — 웹
cd c:\Users\seungjun\Documents\work\WITHUS\Health_Management_Service\frontend
npm run dev     # http://127.0.0.1:5173
```

`frontend/.env`의 `VITE_BACKEND_URL=http://localhost:8000` 확인. `VITE_SUPABASE_URL`·`VITE_SUPABASE_ANON_KEY`가 채워져 있어야 로그인이 된다.

---

## File Structure

**삭제** (기존 웹 프론트 — 전면 재작성):
- `src/App.tsx` (126KB — 재작성)
- `src/app/components/` 전체 (Common, Dashboard, DataUpload, Header, HealthHistory, Records, RiskAnalysis)
- `src/api/healthApi.ts`, `src/api/reportMapper.ts`
- `src/data/mockData.ts`
- `src/utils/healthScores.ts`, `src/utils/clinical.ts`

**유지**:
- `src/main.tsx`, `src/api/supabaseClient.ts`, `index.html`, `vite.config.ts`, `tsconfig.json`, `package.json`(+vitest 추가)
- `src/styles.css` (print CSS 추가)

**신규**:

| 파일 | 책임 |
|---|---|
| `src/api/client.ts` | fetch 래퍼 1개. 토큰 첨부, 204 처리, 에러 메시지 정규화 |
| `src/api/types.ts` | 백엔드 응답 타입 전량 (모바일 `health.ts`에서 이식) |
| `src/api/endpoints.ts` | 엔드포인트 22개 함수. 여기 밖에서 `client()` 직접 호출 금지 |
| `src/api/adapt.ts` | 명칭맵 + 백엔드→화면 변환 (순수 함수, 테스트 대상) |
| `src/lib/format.ts` | 표시 유틸: 확신도 문구, 음주 g 환산, .ics 생성 (순수 함수, 테스트 대상) |
| `src/components/UI.tsx` | Card, SectionTitle, StatusBadge, LevelBadge, EmptyState, ErrorBox, Stepper, KV |
| `src/components/Sidebar.tsx` | 좌측 네비 + 백엔드 상태등 |
| `src/components/WhatIfPanel.tsx` | What-if 시뮬레이터 (좌 스테퍼 / 우 결과) |
| `src/sections/DashboardSection.tsx` | ① 대시보드 |
| `src/sections/AnalysisSection.tsx` | ② 종합 분석 |
| `src/sections/HistorySection.tsx` | ③ 히스토리 |
| `src/sections/RecordsSection.tsx` | ④ 검진 기록 |
| `src/sections/UploadSection.tsx` | ⑤ 업로드·직접 입력 |
| `src/sections/ToolsSection.tsx` | ⑥ 도구·참고 |
| `src/sections/ProfileSection.tsx` | ⑦ 프로필 |
| `src/App.tsx` | 셸 (로그인 게이트 + 데이터 로드 + 섹션 전환) |
| `src/api/adapt.test.ts` / `src/lib/format.test.ts` | 순수 함수 단위 테스트 |

---

## Task 1: 백엔드 — rarity·metabolic_syndrome_detail 주입

`rarity`와 `metabolic_syndrome_detail`은 `group_analysis` 안에서 계산되지만 DB에 저장되는 건 `combo_analysis`뿐이라 `GET /reports/…`로 내려오지 않는다. 기존 `single_groups`·`calculators` 주입과 **완전히 같은 패턴**으로 2줄 추가한다.

**Files:**
- Modify: `backend/app/services/checkup_service.py:128-135`
- Test: `backend/tests/test_checkup_service_injection.py` (신규)

**Interfaces:**
- Produces: `GET /reports/{user_id}/{year}` 및 `POST /analyze` 응답의 `combo_analysis` 안에 두 키가 추가된다.
  - `combo_analysis["rarity"]`: `{clinical_groups: str[], lifestyle_groups: str[], clinical_count: int, lifestyle_count: int, interpretation: str}`
  - `combo_analysis["metabolic_syndrome_detail"]`: `run_analysis()`의 `ms_evaluation` 딕셔너리 그대로
  - ⚠️ **새로 저장되는 분석에만** 담긴다. 기존 행에는 없다 → 프론트 null 처리 필수 (Task 5에서 처리).

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_checkup_service_injection.py`:

```python
"""combo_analysis 주입 — rarity·metabolic_syndrome_detail이 저장 대상에 포함되는지."""
from __future__ import annotations


def test_inject_group_extras_adds_rarity_and_ms_detail():
    from app.services.checkup_service import _inject_group_extras

    combo = {"combo_groups": {"matched": []}}
    group_analysis = {
        "user_groups": {},
        "ascvd_simulation": {"available": False},
        "calculators": {"items": []},
        "ldl_target": {"target_ldl": 130},
        "rarity": {
            "clinical_groups": ["고혈압군"],
            "lifestyle_groups": [],
            "clinical_count": 1,
            "lifestyle_count": 0,
            "interpretation": "단일 위험 요인 (관리 필요)",
        },
        "metabolic_syndrome_detail": {"count": 2, "is_metabolic_syndrome": False},
    }

    _inject_group_extras(combo, group_analysis)

    assert combo["rarity"]["clinical_count"] == 1
    assert combo["rarity"]["interpretation"] == "단일 위험 요인 (관리 필요)"
    assert combo["metabolic_syndrome_detail"]["count"] == 2
    # 기존 주입도 그대로 유지되어야 한다
    assert combo["calculators"] == {"items": []}
    assert combo["ldl_target"] == {"target_ldl": 130}
    assert "single_groups" in combo


def test_inject_group_extras_tolerates_missing_keys():
    """group_analysis에 rarity가 없어도 예외 없이 None으로 넣는다."""
    from app.services.checkup_service import _inject_group_extras

    combo = {}
    _inject_group_extras(combo, {"user_groups": {}})

    assert combo["rarity"] is None
    assert combo["metabolic_syndrome_detail"] is None
```

- [ ] **Step 2: 테스트 실패 확인**

```powershell
cd c:\Users\seungjun\Documents\work\WITHUS\Health_Management_Service\backend
.\.venv\Scripts\Activate.ps1
pytest tests/test_checkup_service_injection.py -v
```

Expected: FAIL — `ImportError: cannot import name '_inject_group_extras'`

- [ ] **Step 3: 최소 구현 — 기존 인라인 주입 블록을 함수로 추출하고 2줄 추가**

`backend/app/services/checkup_service.py` 의 `analyze_and_save()` 안, 현재 128-135행:

```python
    if combo_analysis and group_analysis:
        combo_analysis["single_groups"] = _single_groups_for_display(
            group_analysis.get("user_groups") or {}
        )
        combo_analysis["ascvd_simulation"] = group_analysis.get("ascvd_simulation")
        combo_analysis["calculators"] = group_analysis.get("calculators")
        # LDL 위험도별 개인 목표치(초고위험<55 … 저위험<160)도 함께 내려 화면에 표시한다.
        combo_analysis["ldl_target"] = group_analysis.get("ldl_target")
```

를 아래로 교체:

```python
    if combo_analysis and group_analysis:
        _inject_group_extras(combo_analysis, group_analysis)
```

그리고 `_single_groups_for_display` 정의 바로 위(현재 277행 근처)에 함수를 추가:

```python
def _inject_group_extras(
    combo_analysis: dict[str, Any],
    group_analysis: dict[str, Any],
) -> None:
    """group_analysis에서만 계산되는 부가 결과를 combo_analysis(jsonb)에 담는다.

    combo_analysis만 DB에 저장되므로, 여기 넣지 않으면 GET /reports로 내려가지 않는다.
    ⚠️ 여기서 추가한 키는 '이후 새로 저장되는 분석'에만 들어간다 — 기존 행에는 없다.
    """
    combo_analysis["single_groups"] = _single_groups_for_display(
        group_analysis.get("user_groups") or {}
    )
    combo_analysis["ascvd_simulation"] = group_analysis.get("ascvd_simulation")
    combo_analysis["calculators"] = group_analysis.get("calculators")
    # LDL 위험도별 개인 목표치(초고위험<55 … 저위험<160)도 함께 내려 화면에 표시한다.
    combo_analysis["ldl_target"] = group_analysis.get("ldl_target")
    # 희귀도·대사증후군 세부 — 계산은 되고 있었으나 저장되지 않아 화면에 못 띄우던 값.
    combo_analysis["rarity"] = group_analysis.get("rarity")
    combo_analysis["metabolic_syndrome_detail"] = group_analysis.get(
        "metabolic_syndrome_detail"
    )
```

- [ ] **Step 4: 테스트 통과 확인 + 기존 테스트 회귀 확인**

```powershell
pytest tests/test_checkup_service_injection.py -v
pytest
```

Expected: 신규 2건 PASS. 전체는 **67 passed / 1 failed** — 유일한 red는 기존 문제인 `test_analyzer_isolation`(24번 §4에 기록됨, 이번 작업과 무관). 다른 실패가 있으면 멈추고 보고.

- [ ] **Step 5: 커밋**

```powershell
cd c:\Users\seungjun\Documents\work\WITHUS\Health_Management_Service
git add backend/app/services/checkup_service.py backend/tests/test_checkup_service_injection.py
git commit -m @'
feat(backend): combo_analysis에 rarity·metabolic_syndrome_detail 주입

계산은 되고 있었으나 group_analysis에만 있어 저장·조회되지 않던 두 값을
기존 single_groups·calculators와 같은 패턴으로 주입한다. 웹에서 희귀도를
노출하기 위한 선행 작업. 신규 저장분부터 적용된다.

'@
```

---

## Task 2: API 기반 레이어 (client · types · endpoints)

**Files:**
- Create: `frontend/src/api/client.ts`, `frontend/src/api/types.ts`, `frontend/src/api/endpoints.ts`
- Modify: `frontend/package.json` (vitest 추가)
- Delete: `frontend/src/api/healthApi.ts`, `frontend/src/api/reportMapper.ts`

**Interfaces:**
- Produces:
  - `client.ts`: `apiFetch(path: string, init?: RequestInit): Promise<any>`, `apiUpload(path: string, form: FormData): Promise<any>`, `API_BASE_URL: string`
  - `types.ts`: 아래 Step 3에 정의된 모든 타입 export
  - `endpoints.ts`: 22개 함수 (Step 4)
- Consumes: `api/supabaseClient.ts`의 `getAccessToken()` (기존 파일, 수정 없음)

- [ ] **Step 1: vitest 설치 + 기존 파일 삭제**

```powershell
cd c:\Users\seungjun\Documents\work\WITHUS\Health_Management_Service\frontend
npm install -D vitest@^3
Remove-Item src\api\healthApi.ts, src\api\reportMapper.ts
```

`package.json`의 `scripts`에 추가:

```json
    "test": "vitest run",
```

- [ ] **Step 2: `src/api/client.ts` 작성**

```typescript
import { getAccessToken } from './supabaseClient';

export const API_BASE_URL =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? 'http://127.0.0.1:8000';

/** 백엔드 에러 응답을 사람이 읽을 수 있는 한 줄로 정규화한다. */
async function toError(res: Response): Promise<Error> {
  const text = await res.text().catch(() => '');
  let detail = text;
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed?.detail === 'string') detail = parsed.detail;
  } catch {
    // JSON이 아니면 원문 그대로 쓴다
  }
  return new Error(`${res.status} ${res.statusText}${detail ? ` - ${detail}` : ''}`);
}

/** JSON API 호출. Supabase 토큰을 자동으로 붙인다. */
export async function apiFetch(path: string, init?: RequestInit): Promise<any> {
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw await toError(res);
  // 204 No Content(회원탈퇴 DELETE 등)는 본문이 없어 json() 파싱이 실패한다.
  if (res.status === 204) return null;
  return res.json();
}

/** multipart 업로드. Content-Type은 브라우저가 boundary와 함께 자동으로 넣게 둔다. */
export async function apiUpload(path: string, form: FormData): Promise<any> {
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form,
  });
  if (!res.ok) throw await toError(res);
  return res.json();
}
```

- [ ] **Step 3: `src/api/types.ts` 작성 — 모바일 `health.ts`에서 이식**

`frontend-mobile/src/health.ts`의 69~258행, 335~363행, 399~421행, 494~521행, 533~539행, 567~580행에 정의된 타입을 **그대로 복사**한다. 추가로 아래 3개를 새로 정의한다 (모바일에는 없던 웹 전용).

```typescript
// ─── 화면용 요약 모양 (adapt.ts가 만든다) ────────────────────────────────
export type Status = '정상' | '주의' | '위험';

export type MetricKey =
  | 'sbp' | 'dbp' | 'glucose' | 'bmi' | 'waist'
  | 'ldl' | 'hdl' | 'triglyceride'
  | 'ast' | 'alt' | 'ggt'
  | 'hemoglobin' | 'creatinine';

export type Report = {
  year: number;
  date: string;
  hospital: string;
  status: Status;
  summary: string;
  score: number;
  manageCount: number;
  trackCount: number;
  values: Partial<Record<MetricKey, number>>;
  statusByKey: Partial<Record<MetricKey, Status>>;
};

// ─── Task 1에서 백엔드가 새로 주입하는 두 필드 ─────────────────────────
// ⚠️ 기존 저장 행에는 없다 → 항상 null 가능.
export type RealRarity = {
  clinical_groups: string[];
  lifestyle_groups: string[];
  clinical_count: number;
  lifestyle_count: number;
  interpretation: string;
} | null;

export type RealMetabolicSyndromeDetail = {
  count?: number | null;
  evaluable?: number | null;
  is_metabolic_syndrome?: boolean | null;
  met_factors?: string[];
  [key: string]: any;
} | null;

// ─── 프로필 (backend/app/schemas/profile.py ProfileResponse와 1:1) ──────
export type Profile = {
  id: string;
  name: string | null;
  gender: 1 | 2 | null;
  birth_year: number | null;
  smoking: 'never' | 'former' | 'current' | null;
  drinking: 'no' | 'yes' | null;
  alcohol_weekly_g: number | null;
  created_at: string;
  updated_at: string;
};

// ─── 검사항목 참고치 (backend/app/reference/schemas.py와 1:1) ───────────
export type ReferenceItemResult = {
  item: string;
  value: number;
  unit: string;
  normal_low: number | null;
  normal_high: number | null;
  normal_status: 'normal' | 'low' | 'high';
  severity: 'normal' | 'caution' | 'warning';
  in_normal_range: boolean;
  population_mean: number | null;
  diff_from_mean: number | null;
  pct_from_mean: number | null;
  mean_position: 'above' | 'below' | 'near' | null;
};

export type ReferenceEvaluateResponse = {
  sex: 'M' | 'F';
  results: ReferenceItemResult[];
};
```

그리고 이식한 `RealComboAnalysis` 타입에 두 필드를 **추가**한다:

```typescript
  // Task 1에서 백엔드가 주입. 구버전 저장 행에는 없다.
  rarity?: RealRarity;
  metabolic_syndrome_detail?: RealMetabolicSyndromeDetail;
```

- [ ] **Step 4: `src/api/endpoints.ts` 작성 — 22개 전량**

```typescript
import { apiFetch, apiUpload } from './client';
import type {
  Profile, RealAnalyzeResult, RealEgfr, RealMedicationUploadResult,
  RealOcrResult, RealReportPayload, RealSimulation, RealTimeseries,
  ReferenceEvaluateResponse, SimulateChanges,
} from './types';
import type { MedicationItem } from './types';

// ── health (2) ──────────────────────────────────────────────────────────
export const getRoot = () => apiFetch('/');
export const getHealth = () => apiFetch('/health');

// ── auth (1) ────────────────────────────────────────────────────────────
export const getMe = () => apiFetch('/auth/me');

// ── users (5) ───────────────────────────────────────────────────────────
export const listUsers = (): Promise<Profile[]> => apiFetch('/users');
export const getUser = (userId: string): Promise<Profile> => apiFetch(`/users/${userId}`);
export const createUser = (body: Partial<Profile>): Promise<Profile> =>
  apiFetch('/users', { method: 'POST', body: JSON.stringify(body) });
export const patchUser = (userId: string, body: Partial<Profile>): Promise<Profile> =>
  apiFetch(`/users/${userId}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteUser = (userId: string): Promise<null> =>
  apiFetch(`/users/${userId}`, { method: 'DELETE' });

// ── uploads · analysis (6) ──────────────────────────────────────────────
export function uploadCheckupImage(file: File): Promise<RealOcrResult> {
  const form = new FormData();
  form.append('file', file);
  return apiUpload('/uploads', form);
}
export const analyzeCheckup = (ocr: RealOcrResult['ocr'], save: boolean): Promise<RealAnalyzeResult> =>
  apiFetch('/analyze', { method: 'POST', body: JSON.stringify({ ocr, save }) });
export const simulateCheckup = (changes: SimulateChanges): Promise<RealSimulation> =>
  apiFetch('/analyze/simulate', { method: 'POST', body: JSON.stringify(changes) });
export const getReportYears = async (userId: string): Promise<number[]> =>
  (await apiFetch(`/reports/${userId}`))?.years ?? [];
export const getReportByYear = (userId: string, year: number): Promise<RealReportPayload> =>
  apiFetch(`/reports/${userId}/${year}`);
export const getLatestComprehensive = (userId: string): Promise<RealReportPayload> =>
  apiFetch(`/reports/${userId}/comprehensive/latest`);
export const deleteReport = (userId: string, year: number): Promise<null> =>
  apiFetch(`/reports/${userId}/${year}`, { method: 'DELETE' });

// ── timeseries (2) ──────────────────────────────────────────────────────
/**
 * GET /timeseries/{id}는 DB 행(timeseries_data·insights 컬럼)을 그대로 준다.
 * 언랩하지 않으면 insight·highlights·change_pace가 전부 undefined가 된다.
 * (24번 §3 버그 #1 — 모바일에서 잡은 것과 같은 함정)
 * 회차가 2년 미만이면 404 → null로 돌려 화면이 "데이터 부족"으로 처리하게 한다.
 */
export async function getTimeseries(userId: string): Promise<RealTimeseries | null> {
  try {
    const row = await apiFetch(`/timeseries/${userId}`);
    if (!row) return null;
    const body = row.timeseries_data ?? row;
    return { ...body, insight: body.insight ?? row.insights ?? null };
  } catch {
    return null;
  }
}
export async function refreshTimeseries(): Promise<void> {
  try {
    await apiFetch('/timeseries/refresh', { method: 'POST' });
  } catch {
    // 회차 부족이면 백엔드가 available=false로 응답 — 화면은 "데이터 부족"으로 자연 처리된다.
  }
}

// ── medication (2) ──────────────────────────────────────────────────────
export function uploadMedicationFile(file: File, manualBirthday?: string): Promise<RealMedicationUploadResult> {
  const form = new FormData();
  form.append('file', file);
  if (manualBirthday) form.append('manual_birthday', manualBirthday);
  form.append('persist', 'true');
  return apiUpload('/medication/upload', form);
}
export const getMedications = (userId: string): Promise<MedicationItem[]> =>
  apiFetch(`/medication/${userId}`);

// ── reference (2) ───────────────────────────────────────────────────────
export const getReferenceItems = async (): Promise<string[]> =>
  (await apiFetch('/reference/items'))?.items ?? [];
export const evaluateReference = (
  sex: 'M' | 'F',
  items: { item: string; value: number; population_mean?: number | null }[],
): Promise<ReferenceEvaluateResponse> =>
  apiFetch('/reference/evaluate', { method: 'POST', body: JSON.stringify({ sex, items }) });

// ── renal (1) ───────────────────────────────────────────────────────────
export const calcEgfr = (
  serumCr: number, age: number, sex: 1 | 2, weightKg?: number | null,
): Promise<RealEgfr> =>
  apiFetch('/renal/egfr', {
    method: 'POST',
    body: JSON.stringify({
      serum_cr: serumCr, age, sex: sex === 2 ? 'female' : 'male',
      ...(typeof weightKg === 'number' && weightKg > 0 ? { weight_kg: weightKg } : {}),
    }),
  });
```

- [ ] **Step 5: 타입 검사 통과 확인**

```powershell
cd c:\Users\seungjun\Documents\work\WITHUS\Health_Management_Service\frontend
npx tsc --noEmit
```

Expected: `src/App.tsx` 등 **아직 재작성 안 한 기존 파일**의 에러만 남고, `src/api/*.ts` 관련 에러는 0건이어야 한다. api 파일 에러가 있으면 고친다.

- [ ] **Step 6: 커밋**

```powershell
cd c:\Users\seungjun\Documents\work\WITHUS\Health_Management_Service
git add frontend/src/api frontend/package.json frontend/package-lock.json
git commit -m @'
feat(web): API 기반 레이어 — client·types·endpoints (22개 엔드포인트 전량)

healthApi.ts·reportMapper.ts를 대체한다. timeseries 언랩은 모바일에서
검증된 구현을 이식했다(24번 버그 #1 재발 방지).

'@
```

---

## Task 3: 변환·유틸 순수 함수 (TDD)

화면이 아닌 **순수 함수만** 다룬다. 여기서 만든 함수는 이후 모든 섹션이 쓴다.

**Files:**
- Create: `frontend/src/api/adapt.ts`, `frontend/src/api/adapt.test.ts`
- Create: `frontend/src/lib/format.ts`, `frontend/src/lib/format.test.ts`
- Delete: `frontend/src/utils/healthScores.ts`, `frontend/src/utils/clinical.ts`, `frontend/src/data/mockData.ts`

**Interfaces:**
- Consumes: `api/types.ts`의 `RealReportPayload`, `RealEvaluation`, `Report`, `Status`, `MetricKey`, `OcrFieldLike`
- Produces:
  - `adapt.ts`: `METRIC_NAME_TO_KEY: Record<string, MetricKey>`, `METRIC_LABEL: Record<string, string>`, `statusFromBackend(status: string): Status`, `adaptReport(payload: RealReportPayload): Report`
  - `format.ts`: `OCR_LOW_CONFIDENCE = 0.7`, `ocrFlagText(flags?: string[]): string | null`, `GRAMS_PER_GLASS`, `alcoholWeeklyGrams(freq: number, glasses: number, type: string): number`, `buildCheckupIcs(year: number, name: string): string`, `fmt(value: number | null | undefined, unit?: string): string`

- [ ] **Step 1: 실패하는 테스트 작성 — `src/api/adapt.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';
import { METRIC_NAME_TO_KEY, adaptReport, statusFromBackend } from './adapt';
import type { RealReportPayload } from './types';

describe('METRIC_NAME_TO_KEY', () => {
  // 24번 §3 버그 #2 — 백엔드 실제 명칭 4개가 맵에 없어 실계정 화면에서 항목이 통째로 사라졌다.
  it('백엔드가 실제로 내려주는 한글 명칭을 모두 매핑한다', () => {
    expect(METRIC_NAME_TO_KEY['식전혈당(공복혈당)']).toBe('glucose');
    expect(METRIC_NAME_TO_KEY['트리글리세라이드']).toBe('triglyceride');
    expect(METRIC_NAME_TO_KEY['혈청지오티(AST)']).toBe('ast');
    expect(METRIC_NAME_TO_KEY['혈청지피티(ALT)']).toBe('alt');
  });
});

describe('statusFromBackend', () => {
  it('normal 계열은 정상', () => {
    expect(statusFromBackend('normal')).toBe('정상');
    expect(statusFromBackend('normal_good')).toBe('정상');
    expect(statusFromBackend('info')).toBe('정상');
  });
  it('caution/high/low는 주의', () => {
    expect(statusFromBackend('caution')).toBe('주의');
    expect(statusFromBackend('high')).toBe('주의');
    expect(statusFromBackend('low')).toBe('주의');
  });
  it('very_/extremely_ 계열은 위험', () => {
    expect(statusFromBackend('very_high')).toBe('위험');
    expect(statusFromBackend('extremely_low')).toBe('위험');
  });
});

function payload(evals: any[]): RealReportPayload {
  return {
    user_id: 'u1',
    year: 2024,
    checkup: { exam_date: '2024-03-11', hospital: '서울내과' },
    basic_report: { summary: '요약문' },
    comprehensive: {
      summary: {
        total_metrics: evals.length, risk_count: 0, warning_count: 0,
        normal_count: 0, elderly_warning_count: 0,
        risk_score: 72.4, overall_status: '관리 필요',
      },
      all_evaluations: evals,
    },
  } as RealReportPayload;
}

const ev = (metric: string, value: number, status: string) => ({
  metric, value, status, label: '', icon: '', color: '',
  meaning: '', direction: 'high_bad', unit: 'mg/dL',
});

describe('adaptReport', () => {
  it('평가 항목을 values·statusByKey로 펼친다', () => {
    const r = adaptReport(payload([
      ev('식전혈당(공복혈당)', 112, 'high'),
      ev('수축기혈압', 138, 'normal'),
    ]));
    expect(r.values.glucose).toBe(112);
    expect(r.statusByKey.glucose).toBe('주의');
    expect(r.values.sbp).toBe(138);
    expect(r.statusByKey.sbp).toBe('정상');
  });

  it('manageCount·trackCount를 백엔드 status로 센다', () => {
    const r = adaptReport(payload([
      ev('수축기혈압', 138, 'high'),
      ev('이완기혈압', 92, 'low'),
      ev('중성지방', 480, 'very_high'),
      ev('HDL콜레스테롤', 60, 'normal'),
    ]));
    expect(r.manageCount).toBe(2);
    expect(r.trackCount).toBe(1);
  });

  it('score는 백엔드 risk_score를 반올림해 그대로 쓴다(프론트 재계산 금지)', () => {
    expect(adaptReport(payload([])).score).toBe(72);
  });

  it('맵에 없는 명칭은 조용히 건너뛴다(화면을 깨뜨리지 않는다)', () => {
    const r = adaptReport(payload([ev('처음보는항목', 1, 'high')]));
    expect(Object.keys(r.values)).toHaveLength(0);
    expect(r.manageCount).toBe(1); // 카운트는 전체 평가 기준이라 유지된다
  });

  it('검진일·기관이 없으면 연도 기본값과 빈 문자열로 채운다', () => {
    const p = payload([]);
    p.checkup = {};
    const r = adaptReport(p);
    expect(r.date).toBe('2024-01-01');
    expect(r.hospital).toBe('');
  });
});
```

- [ ] **Step 2: 실패하는 테스트 작성 — `src/lib/format.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';
import { alcoholWeeklyGrams, buildCheckupIcs, fmt, ocrFlagText } from './format';

describe('ocrFlagText', () => {
  it('flag가 없으면 null', () => {
    expect(ocrFlagText()).toBeNull();
    expect(ocrFlagText([])).toBeNull();
  });
  it('아는 flag를 사람말로 바꾼다', () => {
    expect(ocrFlagText(['out_of_range_suspect'])).toBe('일반적인 범위를 벗어난 값이에요');
    expect(ocrFlagText(['low_llm_confidence'])).toBe('글자가 흐릿해 판독이 불확실했어요');
  });
  it('여러 개면 가운뎃점으로 잇는다', () => {
    expect(ocrFlagText(['out_of_range_suspect', 'low_llm_confidence']))
      .toBe('일반적인 범위를 벗어난 값이에요 · 글자가 흐릿해 판독이 불확실했어요');
  });
  it('모르는 flag는 그대로 노출하지 않는다', () => {
    expect(ocrFlagText(['some_internal_code'])).toBeNull();
  });
});

describe('alcoholWeeklyGrams', () => {
  it('주횟수 × 잔수 × 술종류 g으로 계산해 반올림한다', () => {
    expect(alcoholWeeklyGrams(2, 3, '소주')).toBe(42);   // 2*3*7
    expect(alcoholWeeklyGrams(1, 2, '와인')).toBe(28);   // 1*2*14
  });
  it('모르는 술 종류는 0', () => {
    expect(alcoholWeeklyGrams(2, 3, '없는술')).toBe(0);
  });
});

describe('fmt', () => {
  it('값이 없으면 미측정', () => {
    expect(fmt(null)).toBe('미측정');
    expect(fmt(undefined)).toBe('미측정');
  });
  it('0은 미측정이 아니다', () => {
    expect(fmt(0, 'mg/dL')).toBe('0 mg/dL');
  });
  it('단위를 붙인다', () => {
    expect(fmt(112, 'mg/dL')).toBe('112 mg/dL');
    expect(fmt(23.4)).toBe('23.4');
  });
});

describe('buildCheckupIcs', () => {
  const ics = buildCheckupIcs(2027, '홍길동');
  it('유효한 VCALENDAR 골격을 만든다', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VEVENT');
  });
  it('권장 연도 1월 10일 종일 일정으로 잡는다', () => {
    expect(ics).toContain('DTSTART;VALUE=DATE:20270110');
  });
  it('제목에 이름을 넣는다', () => {
    expect(ics).toContain('SUMMARY:홍길동 님 건강검진 받는 해');
  });
  it('줄바꿈은 CRLF (RFC 5545)', () => {
    expect(ics).toContain('\r\n');
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

```powershell
cd c:\Users\seungjun\Documents\work\WITHUS\Health_Management_Service\frontend
npm test
```

Expected: FAIL — `Failed to resolve import "./adapt"` / `"./format"`

- [ ] **Step 4: `src/api/adapt.ts` 구현**

```typescript
import type { MetricKey, RealReportPayload, Report, Status } from './types';

/**
 * 백엔드 한글 항목명 → 프론트 MetricKey.
 * ⚠️ 백엔드가 '실제로' 내려주는 명칭을 반드시 포함해야 한다. 모바일에서는 아래 4개
 * (식전혈당(공복혈당)·트리글리세라이드·혈청지오티(AST)·혈청지피티(ALT))가 빠져 있어
 * 실계정 화면에서 그 항목들이 통째로 사라졌었다(24번 §3 버그 #2).
 */
export const METRIC_NAME_TO_KEY: Record<string, MetricKey> = {
  '수축기혈압': 'sbp', '수축기 혈압': 'sbp',
  '이완기혈압': 'dbp', '이완기 혈압': 'dbp',
  '공복혈당': 'glucose', '식전혈당(공복혈당)': 'glucose',
  '체질량지수': 'bmi', 'BMI': 'bmi',
  '허리둘레': 'waist',
  'LDL콜레스테롤': 'ldl', 'LDL-C': 'ldl', 'LDL 콜레스테롤': 'ldl',
  'HDL콜레스테롤': 'hdl', 'HDL-C': 'hdl', 'HDL 콜레스테롤': 'hdl',
  '중성지방': 'triglyceride', '트리글리세라이드': 'triglyceride',
  'AST': 'ast', 'AST(SGOT)': 'ast', '혈청지오티(AST)': 'ast',
  'ALT': 'alt', 'ALT(SGPT)': 'alt', '혈청지피티(ALT)': 'alt',
  '감마지티피': 'ggt', '감마-GTP': 'ggt',
  '혈색소': 'hemoglobin',
  '혈청크레아티닌': 'creatinine', '혈청 크레아티닌': 'creatinine',
};

/** 시계열 응답의 내부 키를 사람이 읽는 이름으로 (24번 기타수정 #3 — non_HDL 등이 그대로 노출되던 문제). */
export const METRIC_LABEL: Record<string, string> = {
  sbp: '수축기혈압', dbp: '이완기혈압', fbs: '공복혈당', glucose: '공복혈당',
  bmi: '체질량지수', waist: '허리둘레', weight: '체중',
  ldl: 'LDL 콜레스테롤', hdl: 'HDL 콜레스테롤', tg: '중성지방',
  non_HDL: 'Non-HDL 콜레스테롤', total_chol: '총콜레스테롤',
  ast: 'AST', alt: 'ALT', ggt: '감마-GTP',
  creatinine: '혈청 크레아티닌', hb: '혈색소', egfr: 'eGFR',
};

/** 시계열/계산기 응답의 키를 표시용 이름으로. 모르는 키는 원본을 그대로 쓴다. */
export function metricLabel(key: string): string {
  return METRIC_LABEL[key] ?? key;
}

/**
 * 백엔드 status 코드 → 3단계 표시.
 * 세 단어(정상·주의·위험)는 모두 백엔드 STATUS_LABELS에 실제로 등장하는 단어다 —
 * 우리가 새로 만들어낸 표현이 아니다.
 */
export function statusFromBackend(status: string): Status {
  if (status === 'normal' || status === 'normal_good' || status === 'info') return '정상';
  if (status === 'caution' || status === 'high' || status === 'low') return '주의';
  return '위험'; // extremely_low / very_low / very_high / extremely_high
}

/** 백엔드 리포트 1건 → 화면용 요약 모양. 판정·점수는 백엔드 값을 그대로 쓴다. */
export function adaptReport(payload: RealReportPayload): Report {
  const c = payload.comprehensive;
  const evals = c?.all_evaluations ?? [];
  const values: Partial<Record<MetricKey, number>> = {};
  const statusByKey: Partial<Record<MetricKey, Status>> = {};

  for (const e of evals) {
    const key = METRIC_NAME_TO_KEY[e.metric];
    if (!key) continue; // 모르는 명칭은 조용히 건너뛴다 — 화면을 깨뜨리지 않는다
    values[key] = e.value;
    statusByKey[key] = statusFromBackend(e.status);
  }

  const manageCount = evals.filter((e) => e.status === 'high' || e.status === 'low').length;
  const trackCount = evals.filter(
    (e) => e.status.startsWith('very_') || e.status.startsWith('extremely_'),
  ).length;
  const bad = manageCount + trackCount;

  return {
    year: payload.year,
    date: String(payload.checkup?.exam_date ?? payload.checkup?.['검진일'] ?? `${payload.year}-01-01`),
    hospital: String(payload.checkup?.hospital ?? payload.checkup?.['검진기관'] ?? ''),
    status: bad === 0 ? '정상' : bad <= 3 ? '주의' : '위험',
    summary: payload.basic_report?.summary ?? c?.summary?.overall_status ?? '',
    score: Math.round(c?.summary?.risk_score ?? 0),
    manageCount,
    trackCount,
    values,
    statusByKey,
  };
}
```

- [ ] **Step 5: `src/lib/format.ts` 구현**

```typescript
/** 검수 하이라이트 임계값 — 이 값 미만이면 "꼭 확인하세요"로 표시한다(표시 기준, 의학 기준 아님). */
export const OCR_LOW_CONFIDENCE = 0.7;

/** OCR confidence flag → 사람이 읽는 이유. 모르는 flag는 노출하지 않는다. */
export function ocrFlagText(flags?: string[]): string | null {
  if (!flags?.length) return null;
  const parts: string[] = [];
  if (flags.includes('out_of_range_suspect')) parts.push('일반적인 범위를 벗어난 값이에요');
  if (flags.includes('low_llm_confidence')) parts.push('글자가 흐릿해 판독이 불확실했어요');
  return parts.length ? parts.join(' · ') : null;
}

/** 술 종류별 1잔 순알코올(g) 근사 — 순알코올 g ≈ 용량(ml) × 도수 × 0.789. 모바일 LifestyleForm과 동일. */
export const GRAMS_PER_GLASS: Record<string, number> = {
  소주: 7, 맥주: 7, 막걸리: 9, 와인: 14, 양주: 13,
};
export const DRINK_TYPES = ['소주', '맥주', '막걸리', '와인', '양주'] as const;

export function alcoholWeeklyGrams(freq: number, glasses: number, type: string): number {
  return Math.round(freq * glasses * (GRAMS_PER_GLASS[type] ?? 0));
}

/** 값 표시 — 없으면 "미측정". 0은 유효한 값이므로 미측정이 아니다. */
export function fmt(value: number | null | undefined, unit?: string): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '미측정';
  return unit ? `${value} ${unit}` : String(value);
}

/**
 * 다음 검진 시기를 캘린더에 넣을 .ics 문자열.
 * 웹은 백그라운드 로컬 알림을 예약할 수 없으므로 앱 ⑧ 리마인더의 웹 등가물로 쓴다.
 * 근거 연도는 insight.next_exam_year — 우리가 만들어내는 값이 아니다.
 */
export function buildCheckupIcs(year: number, name: string): string {
  const date = `${year}0110`; // 권장 검진 연도 1월 10일 (앱 알림과 같은 날)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//WITHUS//Health Age//KO',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:withus-checkup-${year}@health-age`,
    `DTSTART;VALUE=DATE:${date}`,
    `SUMMARY:${name} 님 건강검진 받는 해`,
    'DESCRIPTION:분석 결과에 따른 권장 검진 시기입니다. 참고 정보이며 진단이 아닙니다.',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ];
  return lines.join('\r\n'); // RFC 5545는 CRLF를 요구한다
}
```

- [ ] **Step 6: 테스트 통과 확인**

```powershell
npm test
```

Expected: 전부 PASS (adapt 8건 + format 12건 내외).

- [ ] **Step 7: 죽은 파일 삭제 + 커밋**

```powershell
Remove-Item src\utils\healthScores.ts, src\utils\clinical.ts, src\data\mockData.ts
Remove-Item src\utils, src\data -Recurse -Force
cd c:\Users\seungjun\Documents\work\WITHUS\Health_Management_Service
git add -A frontend/src
git commit -m @'
feat(web): 변환·표시 순수 함수 + 단위 테스트

adaptReport·METRIC_NAME_TO_KEY는 모바일에서 실계정 버그로 검증된 구현을
이식했고, 백엔드 실제 명칭 4종 매핑을 테스트로 고정했다.
프론트 재계산 유틸(healthScores·clinical)과 mockData는 제거.

'@
```

---

## Task 4: 셸 — 로그인 게이트 · 사이드바 · 공용 UI · 전역 데이터 로드

이 task가 끝나면 **로그인해서 빈 7개 섹션 사이를 이동할 수 있는 앱**이 된다. 이후 task는 각 섹션 내용만 채운다.

**Files:**
- Create: `frontend/src/components/UI.tsx`, `frontend/src/components/Sidebar.tsx`
- Create: `frontend/src/sections/*.tsx` 7개 (이 task에서는 자리표시 골격만)
- Rewrite: `frontend/src/App.tsx`
- Modify: `frontend/src/styles.css` (print CSS 추가)
- Delete: `frontend/src/app/` 전체

**Interfaces:**
- Consumes: `api/endpoints.ts` 전량, `api/adapt.ts`의 `adaptReport`
- Produces:
  - `UI.tsx`: `Card`, `SectionTitle`, `StatusBadge`, `LevelBadge`, `EmptyState`, `ErrorBox`, `KV`, `Stepper`, `Loading`
  - `Sidebar.tsx`: `Sidebar({ active, onSelect, backendOk, userName })`
  - `App.tsx`: `AppData` 타입 — 모든 섹션이 props로 받는 전역 데이터 묶음
    ```typescript
    export type AppData = {
      userId: string;
      profile: Profile | null;
      reports: Report[];              // 연도 오름차순
      raw: RealReportPayload[];       // 연도 오름차순, reports와 같은 길이·순서
      latest: RealReportPayload | null;
      timeseries: RealTimeseries | null;
      reload: () => Promise<void>;    // 저장·삭제 후 전체 재로드 + timeseries refresh
    };
    ```

- [ ] **Step 1: `src/components/UI.tsx` 작성**

Tailwind 클래스만 쓰고 외부 UI 라이브러리는 추가하지 않는다. 아이콘은 이미 있는 `lucide-react`.

```tsx
import type { ReactNode } from 'react';
import type { Status } from '../api/types';

export function Card({ title, sub, children, className = '' }: {
  title?: string; sub?: string; children: ReactNode; className?: string;
}) {
  return (
    <section className={`rounded-2xl bg-white ring-1 ring-slate-200 p-6 ${className}`}>
      {title && <h3 className="text-base font-bold text-slate-900">{title}</h3>}
      {sub && <p className="mt-1 text-sm text-slate-500 leading-relaxed">{sub}</p>}
      {(title || sub) && <div className="h-4" />}
      {children}
    </section>
  );
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <header className="mb-6">
      <h2 className="text-2xl font-bold text-slate-900">{children}</h2>
      {sub && <p className="mt-1.5 text-sm text-slate-500">{sub}</p>}
    </header>
  );
}

const STATUS_STYLE: Record<Status, string> = {
  정상: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  주의: 'bg-amber-50 text-amber-700 ring-amber-200',
  위험: 'bg-rose-50 text-rose-700 ring-rose-200',
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${STATUS_STYLE[status]}`}>
      {status}
    </span>
  );
}

/** 계산기·지방간지수의 level 배지. info는 판정이 아니라 정보이므로 중립 회색을 쓴다. */
const LEVEL_STYLE: Record<string, string> = {
  low: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  intermediate: 'bg-amber-50 text-amber-700 ring-amber-200',
  borderline: 'bg-amber-50 text-amber-700 ring-amber-200',
  high: 'bg-rose-50 text-rose-700 ring-rose-200',
  very_high: 'bg-rose-100 text-rose-800 ring-rose-300',
  info: 'bg-slate-100 text-slate-600 ring-slate-200',
};
const LEVEL_TEXT: Record<string, string> = {
  low: '낮음', intermediate: '중간', borderline: '경계',
  high: '높음', very_high: '매우 높음', info: '참고',
};

export function LevelBadge({ level }: { level?: string }) {
  if (!level) return null;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${LEVEL_STYLE[level] ?? LEVEL_STYLE.info}`}>
      {LEVEL_TEXT[level] ?? level}
    </span>
  );
}

export function KV({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-500 shrink-0">{label}</span>
      <span className="text-sm font-semibold text-slate-900 tabular-nums text-right">
        {value}
        {hint && <span className="ml-2 font-normal text-slate-400">{hint}</span>}
      </span>
    </div>
  );
}

export function EmptyState({ title, desc, action }: { title: string; desc: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-14 text-center">
      <p className="text-base font-semibold text-slate-700">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">{desc}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl bg-rose-50 ring-1 ring-rose-200 px-5 py-4">
      <p className="text-sm font-semibold text-rose-800">불러오지 못했어요</p>
      <p className="mt-1 text-sm text-rose-700 break-all">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-3 rounded-lg bg-rose-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-rose-700">
          다시 시도
        </button>
      )}
    </div>
  );
}

export function Loading({ label = '불러오는 중…' }: { label?: string }) {
  return <p className="py-10 text-center text-sm text-slate-400">{label}</p>;
}

export function Stepper({ label, value, min, max, step = 1, unit, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit: string;
  onChange: (v: number) => void;
}) {
  const round = (v: number) => Math.round(v * 10) / 10;
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-sm font-medium text-slate-600">{label}</span>
      <div className="flex items-center gap-3">
        <button onClick={() => onChange(round(Math.max(min, value - step)))}
          className="h-8 w-8 rounded-full ring-1 ring-slate-300 text-slate-600 hover:bg-slate-50">−</button>
        <span className="min-w-[72px] text-center text-sm font-bold text-slate-900 tabular-nums">
          {value}<span className="ml-0.5 font-medium text-slate-400">{unit}</span>
        </span>
        <button onClick={() => onChange(round(Math.min(max, value + step)))}
          className="h-8 w-8 rounded-full ring-1 ring-slate-300 text-slate-600 hover:bg-slate-50">+</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `src/components/Sidebar.tsx` 작성**

```tsx
import {
  Activity, BarChart3, ClipboardList, LayoutDashboard,
  Upload, User, Wrench,
} from 'lucide-react';

export const SECTIONS = [
  { key: 'dashboard', label: '대시보드', icon: LayoutDashboard, desc: '한눈에 보기' },
  { key: 'analysis', label: '종합 분석', icon: Activity, desc: '계산기·집단군·What-if' },
  { key: 'history', label: '히스토리', icon: BarChart3, desc: '연도별 추이·변화속도' },
  { key: 'records', label: '검진 기록', icon: ClipboardList, desc: '회차별 원본·인쇄' },
  { key: 'upload', label: '업로드·입력', icon: Upload, desc: '검진지 OCR·직접 입력' },
  { key: 'tools', label: '도구·참고', icon: Wrench, desc: '투약이력·참고치·eGFR' },
  { key: 'profile', label: '내 정보', icon: User, desc: '프로필·검진 알림' },
] as const;

export type SectionKey = (typeof SECTIONS)[number]['key'];

export function Sidebar({ active, onSelect, backendOk, userName, onSignOut }: {
  active: SectionKey;
  onSelect: (k: SectionKey) => void;
  backendOk: boolean | null;
  userName: string;
  onSignOut: () => void;
}) {
  return (
    <aside className="fixed inset-y-0 left-0 flex w-64 flex-col border-r border-slate-200 bg-white print:hidden">
      <div className="px-6 py-7">
        <p className="text-lg font-bold text-slate-900">헬스에이지</p>
        <p className="mt-0.5 text-xs text-slate-400">건강검진 결과 상세 열람</p>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const on = active === s.key;
          return (
            <button key={s.key} onClick={() => onSelect(s.key)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                on ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}>
              <Icon size={18} className="shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{s.label}</span>
                <span className={`block truncate text-xs ${on ? 'text-slate-300' : 'text-slate-400'}`}>{s.desc}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 px-5 py-4">
        <p className="truncate text-sm font-semibold text-slate-700">{userName}</p>
        <div className="mt-2 flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${
            backendOk === null ? 'bg-slate-300' : backendOk ? 'bg-emerald-500' : 'bg-rose-500'
          }`} />
          <span className="text-xs text-slate-400">
            {backendOk === null ? '연결 확인 중' : backendOk ? '백엔드 연결됨' : '백엔드 연결 안 됨'}
          </span>
        </div>
        <button onClick={onSignOut} className="mt-3 text-xs font-medium text-slate-400 hover:text-slate-700">
          로그아웃
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: 섹션 7개 골격 생성**

각 섹션 파일을 아래 형태로 만든다 (`DashboardSection` 자리에 각 이름). 내용은 이후 task에서 채운다.

```tsx
import type { AppData } from '../App';
import { SectionTitle } from '../components/UI';

export function DashboardSection({ data }: { data: AppData }) {
  return (
    <>
      <SectionTitle sub="가장 최근 검진 기준 요약입니다.">대시보드</SectionTitle>
      <p className="text-sm text-slate-400">준비 중</p>
    </>
  );
}
```

7개 각각의 `SectionTitle` 문구:

| 파일 | 제목 | sub |
|---|---|---|
| `DashboardSection` | 대시보드 | 가장 최근 검진 기준 요약입니다. |
| `AnalysisSection` | 종합 분석 | 검진 수치로 계산한 참고 지표입니다. 진단이 아닙니다. |
| `HistorySection` | 히스토리 | 회차별 변화와 또래 대비 변화 속도입니다. |
| `RecordsSection` | 검진 기록 | 저장된 회차의 원본 값입니다. |
| `UploadSection` | 업로드·입력 | 검진지 사진을 올리거나 값을 직접 입력합니다. |
| `ToolsSection` | 도구·참고 | 투약이력·검사항목 참고치·신장기능 계산기입니다. |
| `ProfileSection` | 내 정보 | 프로필과 검진 알림을 관리합니다. |

- [ ] **Step 4: `src/App.tsx` 재작성**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { adaptReport } from './api/adapt';
import * as api from './api/endpoints';
import { supabase, supabaseConfigured } from './api/supabaseClient';
import type { Profile, RealReportPayload, RealTimeseries, Report } from './api/types';
import { Sidebar, type SectionKey } from './components/Sidebar';
import { ErrorBox, Loading } from './components/UI';
import { AnalysisSection } from './sections/AnalysisSection';
import { DashboardSection } from './sections/DashboardSection';
import { HistorySection } from './sections/HistorySection';
import { ProfileSection } from './sections/ProfileSection';
import { RecordsSection } from './sections/RecordsSection';
import { ToolsSection } from './sections/ToolsSection';
import { UploadSection } from './sections/UploadSection';

export type AppData = {
  userId: string;
  profile: Profile | null;
  reports: Report[];
  raw: RealReportPayload[];
  latest: RealReportPayload | null;
  timeseries: RealTimeseries | null;
  reload: () => Promise<void>;
};

function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setBusy(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-8 ring-1 ring-slate-200">
        <h1 className="text-xl font-bold text-slate-900">헬스에이지</h1>
        <p className="mt-1 text-sm text-slate-500">건강검진 결과 상세 열람</p>
        {!supabaseConfigured && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
            .env에 VITE_SUPABASE_URL·VITE_SUPABASE_ANON_KEY가 없어 로그인할 수 없어요.
          </p>
        )}
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required
          placeholder="이메일" autoComplete="username"
          className="mt-6 w-full rounded-xl px-4 py-2.5 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-slate-900 outline-none" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required
          placeholder="비밀번호" autoComplete="current-password"
          className="mt-3 w-full rounded-xl px-4 py-2.5 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-slate-900 outline-none" />
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        <button disabled={busy || !supabaseConfigured}
          className="mt-5 w-full rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
          {busy ? '로그인 중…' : '로그인'}
        </button>
      </form>
    </div>
  );
}

export default function App() {
  const [userId, setUserId] = useState<string | null>(null);
  const [section, setSection] = useState<SectionKey>('dashboard');
  const [data, setData] = useState<Omit<AppData, 'reload'> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [backendOk, setBackendOk] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUserId(s?.user.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    api.getHealth().then(() => setBackendOk(true)).catch(() => setBackendOk(false));
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true); setError('');
    try {
      // 프로필·연도목록을 먼저, 그 다음 연도별 상세를 병렬로.
      const [profile, years] = await Promise.all([
        api.getUser(userId).catch(() => null),
        api.getReportYears(userId),
      ]);
      const raw = (await Promise.all(years.map((y) => api.getReportByYear(userId, y))))
        .sort((a, b) => a.year - b.year);
      const [latest, timeseries] = await Promise.all([
        raw.length ? api.getLatestComprehensive(userId).catch(() => null) : Promise.resolve(null),
        api.getTimeseries(userId),
      ]);
      setData({ userId, profile, reports: raw.map(adaptReport), raw, latest, timeseries });
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  /** 저장·삭제 후 호출 — 시계열을 먼저 재생성한 뒤 전체를 다시 읽는다. */
  const reload = useCallback(async () => {
    await api.refreshTimeseries();
    await load();
  }, [load]);

  if (!userId) return <SignIn />;

  const appData: AppData | null = data ? { ...data, reload } : null;
  const Section = {
    dashboard: DashboardSection, analysis: AnalysisSection, history: HistorySection,
    records: RecordsSection, upload: UploadSection, tools: ToolsSection, profile: ProfileSection,
  }[section];

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar active={section} onSelect={setSection} backendOk={backendOk}
        userName={data?.profile?.name ?? '사용자'}
        onSignOut={() => { void supabase.auth.signOut(); }} />
      <main className="ml-64 px-10 py-9 print:ml-0 print:px-0 print:py-0">
        <div className="mx-auto max-w-6xl">
          {loading && !appData && <Loading />}
          {error && <ErrorBox message={error} onRetry={() => void load()} />}
          {appData && <Section data={appData} />}
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 5: `src/styles.css`에 print CSS 추가**

파일 끝에 덧붙인다:

```css
/* 검진 결과 인쇄 — 화면에 보이는 값만 옮겨 담는다. 새 의학 판단은 하지 않는다. */
@media print {
  body {
    background: #ffffff;
  }

  .print-hide {
    display: none !important;
  }

  .print-page {
    break-inside: avoid;
  }

  @page {
    size: A4;
    margin: 14mm;
  }
}
```

- [ ] **Step 6: 기존 폴더 삭제 + 빌드·타입 검사**

```powershell
cd c:\Users\seungjun\Documents\work\WITHUS\Health_Management_Service\frontend
Remove-Item src\app -Recurse -Force
npx tsc --noEmit
npm run build
```

Expected: 둘 다 에러 0건.

- [ ] **Step 7: 실화면 검증 (실계정)**

로컬 백엔드 + `npm run dev` 실행 후 브라우저에서:

1. `http://127.0.0.1:5173` → 로그인 화면이 뜬다
2. `webdemo40680@example.com` / `(비밀번호 가림)` 로그인 → 사이드바가 있는 화면으로 전환
3. 사이드바 7개 항목을 모두 클릭 → 각 섹션의 제목이 바뀌고 "준비 중"이 보인다
4. 사이드바 하단 상태등이 **초록**(백엔드 연결됨)
5. 백엔드를 잠깐 끄고 새로고침 → 상태등이 **빨강**으로 바뀌는지 확인 후 다시 켠다

**확인 못 하면 다음 task로 넘어가지 말 것.** 5개 항목 결과를 그대로 보고한다.

- [ ] **Step 8: 커밋**

```powershell
cd c:\Users\seungjun\Documents\work\WITHUS\Health_Management_Service
git add -A frontend/src frontend/index.html
git commit -m @'
feat(web): 사이드바 셸 — 로그인 게이트·7섹션 전환·전역 데이터 로드

기존 5탭 구조와 app/components를 제거하고 큰 화면용 사이드바 레이아웃으로
재작성했다. 섹션 내용은 후속 커밋에서 채운다.

'@
```

---

## Task 5: ① 대시보드 섹션 (rarity 포함)

**Files:**
- Rewrite: `frontend/src/sections/DashboardSection.tsx`

**Interfaces:**
- Consumes: `AppData`(Task 4), `UI.tsx`의 `Card`·`KV`·`StatusBadge`·`EmptyState`, `lib/format.ts`의 `fmt`
- Produces: 없음 (말단 화면)

**렌더링 내용 — 전부 백엔드 값 그대로:**

1. **상단 요약 4칸**: 저장 회차 수 / 관리점수(`comprehensive.summary.risk_score` 반올림) / 관리 필요 항목 수(`manageCount + trackCount`) / 최근 검진일·기관
2. **최근 인사이트**: `timeseries.insight.summary` + `top_concerns[]` (제목·현재값·상세). 없으면 카드 자체를 숨긴다.
3. **다음 검진 시기**: `timeseries.insight.next_exam_year` — 있으면 "○○○○년에 받으시면 돼요" + "내 정보에서 캘린더에 추가할 수 있어요" 안내
4. **희귀도(rarity)**: `latest.combo_analysis.rarity`. 표시 항목 = `clinical_count`·`lifestyle_count`·`clinical_groups[]`·`lifestyle_groups[]`·`interpretation`.
   - **필수 프레이밍 문구**(카드 하단 고정): `"해당 조합이 드물다는 것은 통계적으로 흔치 않다는 뜻이며, 그 자체로 더 위험하다는 뜻이 아닙니다."`
   - `rarity`가 없으면(구버전 저장 행) 카드를 통째로 숨긴다 — "데이터 없음" 카드를 만들지 않는다.
5. **주요 지표**: `latest.comprehensive.all_evaluations[]` 중 `status !== 'normal'`인 것 상위 6개를 `metric`·`value`+`unit`·`label`·`meaning`으로. `label`은 백엔드 문자열을 그대로 쓴다.
6. **데이터 0건**: `reports.length === 0`이면 `EmptyState`("아직 저장된 검진이 없어요" / "업로드·입력에서 검진지를 올리면 여기에 요약이 나타나요")

- [ ] **Step 1: 구현**

핵심 구조(전체를 이 골격에 맞춰 작성):

```tsx
import type { AppData } from '../App';
import { fmt } from '../lib/format';
import { Card, EmptyState, KV, SectionTitle } from '../components/UI';

export function DashboardSection({ data }: { data: AppData }) {
  const { reports, latest, timeseries } = data;
  const insight = timeseries?.insight ?? null;
  const rarity = latest?.combo_analysis?.rarity ?? null;
  const summary = latest?.comprehensive?.summary;

  if (reports.length === 0) {
    return (
      <>
        <SectionTitle sub="가장 최근 검진 기준 요약입니다.">대시보드</SectionTitle>
        <EmptyState
          title="아직 저장된 검진이 없어요"
          desc="왼쪽 '업로드·입력'에서 검진지를 올리거나 값을 직접 넣으면 여기에 요약이 나타나요."
        />
      </>
    );
  }

  const recent = reports[reports.length - 1];

  return (
    <>
      <SectionTitle sub="가장 최근 검진 기준 요약입니다.">대시보드</SectionTitle>

      {/* 1. 요약 4칸 */}
      <div className="grid grid-cols-4 gap-4">
        {/* 저장 회차 / 관리점수 / 관리 필요 / 최근 검진 */}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4">
        {/* 2·3. 인사이트 + 다음 검진 (2칸) — insight 없으면 렌더하지 않는다 */}
        {/* 4. 희귀도 (1칸) — rarity 없으면 렌더하지 않는다 */}
      </div>

      {/* 5. 주요 지표 */}
    </>
  );
}
```

- [ ] **Step 2: 타입·빌드 검사**

```powershell
cd c:\Users\seungjun\Documents\work\WITHUS\Health_Management_Service\frontend
npx tsc --noEmit && npm run build
```

Expected: 에러 0건.

- [ ] **Step 3: 실화면 검증 (실계정)**

브라우저에서 `webdemo40680` 로그인 → 대시보드에서 확인:

1. 요약 4칸에 실제 숫자가 들어간다 (0이나 NaN이 아니다)
2. 인사이트 요약문과 주요 우려 항목이 보인다
3. **희귀도 카드가 보이는지 확인** — 안 보이면 정상이다(기존 저장 행에는 `rarity`가 없음). 이 경우 Task 9(업로드)로 **분석을 한 번 새로 저장한 뒤 다시 확인**한다. Task 9 완료 전이면 "미확인"으로 기록하고 넘어가되, **Task 9 검증 때 반드시 되돌아와 확인**한다.
4. 주요 지표 목록의 항목명이 한글이고 `non_HDL` 같은 내부 키가 노출되지 않는다

- [ ] **Step 4: 커밋**

```powershell
cd c:\Users\seungjun\Documents\work\WITHUS\Health_Management_Service
git add frontend/src/sections/DashboardSection.tsx
git commit -m @'
feat(web): 대시보드 — 요약·인사이트·다음 검진·희귀도

희귀도는 "희귀≠위험" 프레이밍 문구를 카드에 고정했다.
구버전 저장 행에는 rarity가 없어 카드를 숨긴다.

'@
```

---

## Task 6: ② 종합 분석 섹션 (What-if 제외)

가장 넓은 화면. 앱 `AnalysisScreen.tsx`(46KB)가 세로로 스크롤하며 보여주던 것을 **2열 그리드로 펼친다**.

**Files:**
- Rewrite: `frontend/src/sections/AnalysisSection.tsx`

**Interfaces:**
- Consumes: `AppData`, `UI.tsx` 전량, `api/adapt.ts`의 `metricLabel`
- Produces: 없음 (Task 7의 `WhatIfPanel`이 이 섹션에 삽입된다)

**연도 선택:** 상단에 회차 탭(`reports.map(r => r.year)`). 선택 연도의 `raw[i]`를 렌더한다. 기본값 = 최신.

**렌더링 카드 목록 — `combo_analysis`의 각 필드가 `null`이면 그 카드를 숨긴다:**

| 카드 | 데이터 | 표시 항목 |
|---|---|---|
| 대사증후군 | `combo_analysis.metabolic_syndrome_detail` | `count`/`evaluable`, `is_metabolic_syndrome`, `met_factors[]` |
| LDL 개인 목표 | `combo_analysis.ldl_target` | `label`·`target_text`·`current_ldl`·`gap`·`risk_factors[]`·`basis`·`reference`·`limitations[0]` |
| 계산기 15종 | `combo_analysis.calculators.items[]` | `category`별로 묶어서 표. 열 = 지표명(`title`)·값(`value`+`unit`)·구간(`LevelBadge level`)·해석(`interpretation`)·기준(`cutoffs`)·식(`formula`). `peer_label`·`percentile`이 있으면 "또래 상위 ○○%" 함께 표시 |
| 지방간 | `combo_analysis.fatty_liver` | `type`·`provisional`·`basis`·`cardiometabolic_factors[]` + `indices.fli`/`indices.hsi`(`value`·`level`·`interpretation`) |
| 조합그룹 | `combo_analysis.combo_groups` | `matched[]`: `combo_name`·`meaning`·`components[]`·`population.observed_to_expected`(O/E)·`n_in_combo`·`pct_of_total`. `not_evaluable[]`은 접힌 목록으로 `missing[]` 표시. `caveats[]`와 `population.source`는 **항상 노출** |
| 단일 집단군 | `combo_analysis.single_groups[]` | `applies === true`만 강조, `null`은 "판정 불가(입력값 없음)" 회색 |
| ASCVD 참고 | `combo_analysis.ascvd_simulation` | `available`이 false면 `reason`만. true면 `risk_percent`·`risk_label`·`scenarios[]`·`how_to_read`·`limitations[]` |
| 권장사항 | `raw[i].recommendations` | `priority_messages[]` + `recommendations.common[]`·`metabolic_factors[]`·`group_specific[]`·`medication_notes[]`·`elderly_notes[]` |

**필수 규칙 3가지:**
- **LDL 판정보류**: `ldl_target.ldl_reliable === false`면 `achieved`를 쓰지 않고 **"판정 보류" 배지 + `reliability_note` 경고박스**를 보여준다. `gap`도 표시하지 않는다.
- **계산기 `level: 'info'`**는 중립 회색(`LevelBadge`가 이미 처리). ALT/GGT 비 같은 유형 감별 지표를 위험도로 오독하게 하면 안 된다.
- **`disclaimer` 문자열**(`calculators.disclaimer`, `combo_analysis.disclaimer`, `fatty_liver.indices.disclaimer`)은 각 카드 하단에 **작게라도 반드시 노출**한다.

- [ ] **Step 1: 구현**

```tsx
import { useState } from 'react';
import type { AppData } from '../App';
import { Card, EmptyState, KV, LevelBadge, SectionTitle } from '../components/UI';
import { fmt } from '../lib/format';

export function AnalysisSection({ data }: { data: AppData }) {
  const { reports, raw } = data;
  const [year, setYear] = useState<number | null>(null);
  if (reports.length === 0) {
    return (
      <>
        <SectionTitle sub="검진 수치로 계산한 참고 지표입니다. 진단이 아닙니다.">종합 분석</SectionTitle>
        <EmptyState title="분석할 검진이 없어요" desc="'업로드·입력'에서 검진 결과를 저장하면 여기에 분석이 나타나요." />
      </>
    );
  }
  const idx = year === null ? raw.length - 1 : raw.findIndex((r) => r.year === year);
  const report = raw[idx < 0 ? raw.length - 1 : idx];
  const combo = report.combo_analysis ?? null;
  // ... 위 표에 따라 카드들을 2열 그리드로 렌더
}
```

- [ ] **Step 2: 타입·빌드 검사**

```powershell
npx tsc --noEmit && npm run build
```

Expected: 에러 0건.

- [ ] **Step 3: 실화면 검증 (실계정)**

브라우저에서 확인하고 **각 항목의 실제 값을 보고**한다:

1. 계산기가 **15종** 나온다 (14종이면 백엔드가 alt_ggt를 안 내려주는 것 — 저장 시점 문제인지 확인)
2. ALT/GGT 비 배지가 **회색(참고)** 이다
3. LDL 개인 목표 카드에 목표치·현재값·기준이 보인다
4. 조합그룹 matched 항목에 **O/E 배수**와 모집단 출처가 보인다
5. 단일 집단군 13개가 전부 나오고, 판정 불가 항목이 회색으로 구분된다
6. 연도 탭을 바꾸면 내용이 바뀐다
7. `null` 필드 때문에 화면이 깨진 곳이 없다

- [ ] **Step 4: 커밋**

```powershell
cd c:\Users\seungjun\Documents\work\WITHUS\Health_Management_Service
git add frontend/src/sections/AnalysisSection.tsx
git commit -m @'
feat(web): 종합 분석 — 계산기 15종·대사증후군·LDL목표·조합그룹·ASCVD·권장사항

TG≥400 판정보류와 info 레벨 중립 표시 규칙을 지켰다. disclaimer는
카드마다 노출한다.

'@
```

---

## Task 7: What-if 시뮬레이터 패널

앱에서는 모달이었지만 **웹은 넓으니 좌우 2단으로 펼친다** — 왼쪽 스테퍼, 오른쪽 결과 비교가 동시에 보인다.

**Files:**
- Create: `frontend/src/components/WhatIfPanel.tsx`
- Modify: `frontend/src/sections/AnalysisSection.tsx` (패널 삽입)

**Interfaces:**
- Consumes: `api/endpoints.ts`의 `simulateCheckup`, `UI.tsx`의 `Stepper`·`Card`·`LevelBadge`·`ErrorBox`, `api/types.ts`의 `RealSimulation`·`SimulateChanges`
- Produces: `WhatIfPanel({ latest }: { latest: Report })`

**스테퍼 7종** — `Report.values`의 키에서 초기값을 읽고, `SimulateChanges`의 키로 보낸다:

| 라벨 | `Report.values` 키 | `SimulateChanges` 키 | min | max | step | 단위 |
|---|---|---|---|---|---|---|
| 허리둘레 | `waist` | `waist` | 50 | 150 | 1 | cm |
| 수축기혈압 | `sbp` | `sbp` | 80 | 220 | 1 | mmHg |
| 이완기혈압 | `dbp` | `dbp` | 40 | 140 | 1 | mmHg |
| 공복혈당 | `glucose` | `fbs` | 50 | 400 | 1 | mg/dL |
| 중성지방 | `triglyceride` | `tg` | 30 | 900 | 5 | mg/dL |
| HDL | `hdl` | `hdl` | 15 | 120 | 1 | mg/dL |
| LDL | `ldl` | `ldl` | 30 | 300 | 1 | mg/dL |

**동작 규칙:**
- 초기값은 `latest.values[…]`. 값이 없는 항목은 **스테퍼를 렌더하지 않는다**(임의값 금지).
- 전송은 **바뀐 항목만**. 하나도 안 바뀌었으면 호출하지 않고 "바꾼 값이 없어요. 위 항목을 조정한 뒤 다시 계산해주세요." 표시.
- 서버는 항상 **최신 저장 검진값**을 기준선으로 쓴다 → `latest`는 반드시 `reports[reports.length - 1]`을 넘긴다(연도 탭과 무관하게). 이 이유를 주석으로 남긴다.

**결과 표시 (오른쪽):**
1. **대사증후군 before → after**: `metabolic_syndrome.before.count` → `after.count`, `met_factors[]` 차이. `after.is_metabolic_syndrome === false && before === true`면 강조 문구.
2. **바뀐 계산기**: `calculators.filter(c => c.changed)` — `title`, `before`→`after`, `delta`, `before_level`→`after_level`, `after_interpretation`. `before_percentile`/`after_percentile`이 있으면 **"또래 상위 ○○% → ○○%"** 함께.
3. **집단군 변화**: `groups.resolved[]`(벗어남) / `groups.added[]`(새로 해당)
4. **LDL 목표**: `ldl_target.before_achieved` → `after_achieved`
5. **그대로인 지표**: `unchanged[]` — "바꾼 값이 이 지표의 계산식에 들어가지 않아서예요" 설명과 함께
6. **`limitations[]` 전량 노출** — 접거나 생략하지 않는다.

**필수 문구** (패널 상단 고정):
```
다음 검진에서 값이 이렇게 나오면 지표가 어떻게 달라지는지 공식으로 다시 계산해요.
"몇 kg 빼면 수치가 얼마나 내려갈지"를 예측하는 것이 아닙니다.
```

**정직성 규칙:** 지표가 나빠지는 방향으로 바뀌어도 **그대로 보여준다** (예: 체중만 줄이면 VAI는 오히려 올라간다 — VAI 식 분모에 BMI가 있어서). 좋은 변화만 골라 보여주지 않는다.

- [ ] **Step 1: `WhatIfPanel.tsx` 구현**

```tsx
import { useState } from 'react';
import { simulateCheckup } from '../api/endpoints';
import type { MetricKey, RealSimulation, Report, SimulateChanges } from '../api/types';
import { Card, ErrorBox, LevelBadge, Stepper } from './UI';

const CONTROLS: {
  label: string; from: MetricKey; to: keyof SimulateChanges;
  min: number; max: number; step: number; unit: string;
}[] = [
  { label: '허리둘레', from: 'waist', to: 'waist', min: 50, max: 150, step: 1, unit: 'cm' },
  { label: '수축기혈압', from: 'sbp', to: 'sbp', min: 80, max: 220, step: 1, unit: 'mmHg' },
  { label: '이완기혈압', from: 'dbp', to: 'dbp', min: 40, max: 140, step: 1, unit: 'mmHg' },
  { label: '공복혈당', from: 'glucose', to: 'fbs', min: 50, max: 400, step: 1, unit: 'mg/dL' },
  { label: '중성지방', from: 'triglyceride', to: 'tg', min: 30, max: 900, step: 5, unit: 'mg/dL' },
  { label: 'HDL 콜레스테롤', from: 'hdl', to: 'hdl', min: 15, max: 120, step: 1, unit: 'mg/dL' },
  { label: 'LDL 콜레스테롤', from: 'ldl', to: 'ldl', min: 30, max: 300, step: 1, unit: 'mg/dL' },
];

/**
 * ⚠️ latest는 반드시 '가장 최근' 회차여야 한다.
 * 서버(POST /analyze/simulate)는 항상 최신 저장 검진값을 기준선으로 쓰기 때문에,
 * 연도 탭에서 과거 회차를 넘기면 스테퍼에 보이는 값과 계산 기준이 어긋난다.
 */
export function WhatIfPanel({ latest }: { latest: Report }) {
  const active = CONTROLS.filter((c) => typeof latest.values[c.from] === 'number');
  const [values, setValues] = useState<Partial<Record<MetricKey, number>>>(
    () => Object.fromEntries(active.map((c) => [c.from, latest.values[c.from]!])),
  );
  const [result, setResult] = useState<RealSimulation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    const changes: SimulateChanges = {};
    for (const c of active) {
      const v = values[c.from];
      if (typeof v === 'number' && v !== latest.values[c.from]) changes[c.to] = v;
    }
    if (!Object.keys(changes).length) {
      setError('바꾼 값이 없어요. 위 항목을 조정한 뒤 다시 계산해주세요.');
      return;
    }
    setBusy(true); setError('');
    try {
      setResult(await simulateCheckup(changes));
    } catch (e) {
      setError(e instanceof Error ? e.message : '재계산에 실패했어요.');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setValues(Object.fromEntries(active.map((c) => [c.from, latest.values[c.from]!])));
    setResult(null); setError('');
  };

  // 좌: 스테퍼 + [다시 계산]/[되돌리기], 우: 결과 6블록
  // ...
}
```

- [ ] **Step 2: `AnalysisSection.tsx`에 삽입**

연도 탭 **바로 아래, 카드 그리드 위**에 넣는다. 반드시 최신 회차를 넘긴다:

```tsx
{/* 서버가 최신 저장 검진값을 기준선으로 쓰므로 연도 선택과 무관하게 최신 회차를 넘긴다 */}
<WhatIfPanel latest={reports[reports.length - 1]} />
```

- [ ] **Step 3: 타입·빌드 검사**

```powershell
npx tsc --noEmit && npm run build
```

Expected: 에러 0건.

- [ ] **Step 4: 회귀 검증 — 24번 기지값과 대조 (중요)**

실계정에서 24번 §2-G3에 기록된 **정확히 같은 입력**을 넣고 결과를 대조한다:

> 입력: 허리 **−5** · 공복혈당 **−14** · 중성지방 **−35** · HDL **+6**

기대 결과 (앱에서 확인된 값):

| 항목 | 기대값 |
|---|---|
| 대사증후군 | **5 → 1** + "3개 미만이 되어 대사증후군 기준에서 벗어나요" |
| METS-IR 또래 | **상위 77.3% → 65.4%** |
| LAP | 76% → 56.5% |
| VAI | 76.7% → 56.1% |
| 그대로인 지표 | **4종** + "바꾼 값이 이 지표의 계산식에 들어가지 않아서예요" |

**값이 다르면 멈추고 보고한다.** (기준선이 되는 최신 회차가 그때와 달라졌을 수 있으니, 다르면 먼저 `latest` 회차가 같은 연도인지부터 확인)

- [ ] **Step 5: 정직성 확인**

체중/허리만 줄여서 **VAI가 오히려 올라가는 케이스**를 만들어 보고, 그 값이 화면에 **감춰지지 않고 그대로** 나오는지 확인한다.

- [ ] **Step 6: 커밋**

```powershell
cd c:\Users\seungjun\Documents\work\WITHUS\Health_Management_Service
git add frontend/src/components/WhatIfPanel.tsx frontend/src/sections/AnalysisSection.tsx
git commit -m @'
feat(web): What-if 시뮬레이터 — 좌 스테퍼 / 우 결과 2단 패널

모달 대신 넓은 화면을 살려 조작과 결과를 동시에 보여준다.
24번 기지값(대사증후군 5→1, METS-IR 77.3→65.4)으로 회귀 확인.

'@
```

---

## Task 8: ③ 히스토리 섹션

**Files:**
- Rewrite: `frontend/src/sections/HistorySection.tsx`

**Interfaces:**
- Consumes: `AppData`, Recharts(`LineChart`·`Line`·`XAxis`·`YAxis`·`Tooltip`·`CartesianGrid`·`ResponsiveContainer`·`Legend`), `api/adapt.ts`의 `metricLabel`
- Produces: 없음

**렌더링 내용:**

1. **회차 0~1개**: 선그래프 대신 안내. 1개면 "회차가 2개 이상이면 추이 그래프가 나타나요" + 현재 값 표.
2. **그래프 5종** (2열 그리드, 각 `ResponsiveContainer` height 260):
   - 혈압 추이 (`sbp`·`dbp`)
   - 콜레스테롤 추이 (`ldl`·`hdl`·`total_chol`)
   - BMI·허리둘레 추이
   - 혈당·중성지방 추이
   - 간·신장 기능 추이 (`ast`·`alt`·`ggt`·`creatinine`)
   - X축 = 연도. **값이 없는 해는 점을 찍지 않는다**(`connectNulls={false}`) — 0으로 채우지 않는다.
3. **또래 대비 변화 속도** (`timeseries.change_pace[]`): `metricLabel(metric)` · `pace.text` · `user_change` · `population_change` · `span_years`.
   - `pace.ratio`가 있으면 "○○배" 표시. **`ratio`가 `null`이면 배수를 만들어내지 말고 `pace.text`만** 보여준다 (또래 변화가 ±0.5 미만이면 배수가 발산하므로 백엔드가 일부러 null을 준다).
   - 카드 하단 고정 문구: `"배수는 또래 '평균'과의 비교라서 또래 안의 개인차는 담기지 않습니다."`
4. **하이라이트** (`timeseries.highlights[]`): `metric`(라벨 변환) · `message` · `severity`별 색.
5. **검진 패턴** (`timeseries.exam_pattern`): 있으면 그대로 KV 목록으로. 앱에서 안 쓰던 값이므로 **키를 그대로 나열하되 알려진 키만 한글 라벨**을 붙이고 모르는 키는 원본 키로 표시.
6. **전체 시계열 원본** (`timeseries.full_timeseries`): `<details>`로 접은 표. 지표명은 `metricLabel()`로 변환.

- [ ] **Step 1: 구현**

- [ ] **Step 2: 타입·빌드 검사**

```powershell
npx tsc --noEmit && npm run build
```

Expected: 에러 0건.

- [ ] **Step 3: 실화면 검증 (실계정)**

1. 그래프 5종이 렌더되고 X축이 연도다
2. **변화 속도 항목의 지표명이 한글**이다 (`non_HDL` 같은 내부 키가 아니다)
3. `ratio`가 null인 항목이 있으면 배수 없이 문장만 나온다
4. HDL이 **올라간 해가 경고색으로 보이지 않는다** (HDL은 높은 게 좋다 — 24번 기타수정 #1과 같은 함정)
5. `exam_pattern`·`full_timeseries`가 없으면 그 블록이 조용히 사라진다

- [ ] **Step 4: 커밋**

```powershell
cd c:\Users\seungjun\Documents\work\WITHUS\Health_Management_Service
git add frontend/src/sections/HistorySection.tsx
git commit -m @'
feat(web): 히스토리 — 추이 그래프 5종·변화속도·하이라이트·시계열 원본

앱이 쓰지 않던 exam_pattern·full_timeseries도 노출한다.
ratio가 null이면 배수를 만들지 않고 문장만 보여준다.

'@
```

---

## Task 9: ④ 검진 기록 섹션 + 인쇄

**Files:**
- Rewrite: `frontend/src/sections/RecordsSection.tsx`

**Interfaces:**
- Consumes: `AppData`(특히 `reload`), `api/endpoints.ts`의 `deleteReport`
- Produces: 없음

**렌더링 내용:**

1. **회차 표**: 열 = 검진연도 · 검진일 · 의료기관 · 상태(`StatusBadge`) · 요약 · 작업
2. **작업 3종**:
   - **자세히 보기** → 아래 상세 패널 토글
   - **JSON 다운로드** → `raw[i]` 전체를 `checkup-{year}.json`으로 (Blob + `URL.createObjectURL`)
   - **삭제** → `window.confirm('{year}년 검진 기록을 삭제할까요? 되돌릴 수 없어요.')` → `deleteReport` → `data.reload()`
3. **상세 패널** — `raw[i].checkup`에서 표시할 항목(이 순서 고정):
   신장 · 체중 · BMI · 허리둘레 · 수축기혈압 · 이완기혈압 · 공복혈당 · 총콜레스테롤 · LDL · HDL · 중성지방 · AST · ALT · 감마GTP · 크레아티닌 · 요단백
   - 값이 없으면 **"미측정"**. `icon`·`color`·`auto_calculated`·내부 status 코드는 **숨긴다**.
4. **인쇄 (앱 ⑨의 웹 구현)**:
   - `[인쇄 / PDF로 저장]` 버튼 → `window.print()`
   - 인쇄 대상은 **선택된 회차의 상세 패널**. 사이드바·버튼·표의 작업 열은 `print:hidden`/`print-hide`로 감춘다.
   - 인쇄 영역 하단에 **면책 3줄 고정**:
     ```
     이 문서는 건강검진 수치를 정리한 참고 자료입니다.
     진단서·소견서가 아니며, 참고 점수는 이 서비스의 자체 지표입니다.
     의학적 판단은 의료진과 상의하세요.
     ```
   - **화면에 이미 보이는 값만 옮겨 담는다. 새 의학 판단을 만들지 않는다.**

- [ ] **Step 1: 구현**

- [ ] **Step 2: 타입·빌드 검사**

```powershell
npx tsc --noEmit && npm run build
```

Expected: 에러 0건.

- [ ] **Step 3: 실화면 검증 (실계정)**

1. 표에 저장된 회차가 모두 나온다
2. 자세히 보기 → 16개 항목이 순서대로, 없는 값은 "미측정"
3. JSON 다운로드 → 파일이 받아지고 열어보면 백엔드 응답 그대로다
4. **인쇄 미리보기**(Ctrl+P)에서: 사이드바가 안 보이고 / 검진값이 보이고 / **면책 3줄이 보인다**
5. 삭제 → 확인 대화상자 → 삭제 후 표에서 사라지고 히스토리 그래프도 갱신된다
   - ⚠️ 실계정 데이터를 실제로 지우게 되므로, **삭제는 마지막에 테스트용 회차 1건으로만** 하거나 사용자에게 먼저 확인받는다.

- [ ] **Step 4: 커밋**

```powershell
cd c:\Users\seungjun\Documents\work\WITHUS\Health_Management_Service
git add frontend/src/sections/RecordsSection.tsx
git commit -m @'
feat(web): 검진 기록 — 회차 표·상세·JSON 다운로드·삭제·인쇄

인쇄는 print CSS + window.print()로 앱 PDF 내보내기를 대체한다.
화면에 보이는 값만 담고 면책 3줄을 고정 노출한다.

'@
```

---

## Task 10: ⑤ 업로드·직접 입력 섹션

**Files:**
- Rewrite: `frontend/src/sections/UploadSection.tsx`

**Interfaces:**
- Consumes: `api/endpoints.ts`의 `uploadCheckupImage`·`analyzeCheckup`, `lib/format.ts`의 `OCR_LOW_CONFIDENCE`·`ocrFlagText`·`alcoholWeeklyGrams`·`DRINK_TYPES`, `AppData.reload`
- Produces: 없음

**검수 폼 항목 틀** — 모바일 `data.ts`의 `ocrTemplate`(300-319행)과 **같은 id·라벨·단위·구분**을 쓴다. 단 **예시값은 넣지 않는다**(모바일 템플릿의 `value: '165.9'` 등은 복사하지 않고 전부 빈 문자열):

| id | 라벨 | 단위 | 필수 | 구분 |
|---|---|---|---|---|
| `exam_date` | 검진일 | — | ✔ | 기본 정보 |
| `hospital` | 검진기관 | — | ✔ | 기본 정보 |
| `height` | 키 | cm | | 검사 수치 |
| `weight` | 몸무게 | kg | | 검사 수치 |
| `waist` | 허리둘레 | cm | | 검사 수치 |
| `sbp` | 수축기 혈압 | mmHg | ✔ | 검사 수치 |
| `dbp` | 이완기 혈압 | mmHg | ✔ | 검사 수치 |
| `hb` | 혈색소 | g/dL | | 검사 수치 |
| `fbs` | 공복혈당 | mg/dL | ✔ | 검사 수치 |
| `total_cholesterol` | 총콜레스테롤 | mg/dL | | 검사 수치 |
| `hdl` | HDL 콜레스테롤 | mg/dL | | 검사 수치 |
| `tg` | 중성지방 | mg/dL | | 검사 수치 |
| `ldl` | LDL 콜레스테롤 | mg/dL | | 검사 수치 |
| `creatinine` | 혈청 크레아티닌 | mg/dL | | 검사 수치 |
| `urine_protein` | 요단백 | — | | 검사 수치 |
| `ast` | AST(SGOT) | IU/L | | 검사 수치 |
| `alt` | ALT(SGPT) | IU/L | | 검사 수치 |
| `ggt` | 감마-GTP | IU/L | | 검사 수치 |

**두 진입점 (탭):**

- **A. 검진지 사진 업로드**: `<input type="file" accept="image/*">` → `uploadCheckupImage` → `ocr.measurements[id].value`로 폼을 채운다. `warnings[]`는 상단 배너.
- **B. 직접 입력**: 빈 폼. `POST /uploads`를 호출하지 않고, 저장 시 백엔드 `ocr` 골격을 직접 조립한다:
  ```typescript
  { meta: { exam_date, hospital }, measurements: { [id]: { value, unit } } }
  ```

**확신도 검수 하이라이트 (⑦):**
- `ocr.measurements_confidence[id]`에서 `confidence`·`flags`를 읽는다. **없으면 표시하지 않는다** — 허구 confidence를 만들지 않는다(24번 G2에서 하드코딩 18개를 제거한 이유).
- `confidence < OCR_LOW_CONFIDENCE(0.7)`이면 해당 입력칸에 노란 테두리 + **"확신 ○○%"** 배지 + `ocrFlagText(flags)` 문구.
- **사용자가 그 칸을 편집하면 즉시 해제**한다 (편집한 값에는 OCR 확신도라는 개념이 없다).
- 저장 시도 전에는 "확인 필요" 배너를 띄우지 않는다 (빈 폼에서 경고가 뜨면 안 된다).

**생활습관 폼:** 흡연(비흡연/과거/현재) · 음주(안 마심/마심) · 마심이면 주횟수 · 1회 잔수 · 술 종류 → `alcoholWeeklyGrams()`로 주당 순알코올 g 계산 후 표시. 지방간 기준선(남 210g / 여 140g)을 함께 안내하고, 넘으면 강조색.
→ 이 값은 프로필(`PATCH /users/{id}`의 `smoking`·`drinking`·`alcohol_weekly_g`)에 저장한다. 분석은 백엔드가 프로필에서 읽어 쓴다.

**저장:** `analyzeCheckup(ocr, true)` → 성공하면 `data.reload()` → 대시보드로 이동. `warnings[]`가 있으면 노출.

- [ ] **Step 1: 구현**

- [ ] **Step 2: 타입·빌드 검사**

```powershell
npx tsc --noEmit && npm run build
```

Expected: 에러 0건.

- [ ] **Step 3: 실화면 검증 — 직접 입력 (실계정)**

1. 직접 입력 탭 → **모든 칸이 비어 있다** (예시값이 안 들어 있다)
2. 필수 5개(검진일·기관·sbp·dbp·fbs)만 채우고 저장 → 성공
3. 저장 후 대시보드·분석·기록에 새 회차가 나타난다
4. **⚠️ Task 5 Step 3에서 미확인이었던 희귀도 카드를 지금 다시 확인한다** — 새로 저장한 분석에는 `rarity`가 들어 있어야 한다. 안 보이면 Task 1 주입이 실제로 동작하는지 백엔드 응답을 직접 확인한다:
   ```powershell
   # 브라우저 개발자도구 Network 탭에서 GET /reports/{id}/{year} 응답의
   # combo_analysis.rarity 존재 여부를 확인
   ```

- [ ] **Step 4: 실화면 검증 — 확신도 하이라이트**

에뮬레이터가 아니라 브라우저이므로 실제 검진지 사진이 없으면 확신도 케이스를 못 만든다. 그 경우 **임시 주입으로 확인 후 원복**한다 (24번 §4-4와 같은 방법):

1. `UploadSection.tsx`에서 OCR 응답을 받은 직후에 임시로 한 줄 주입:
   ```typescript
   // ⚠️ 임시 검증용 — 확인 후 반드시 지운다
   res.ocr.measurements_confidence = { dbp: { confidence: 0.5, flags: ['out_of_range_suspect'] }, fbs: { confidence: 0.62, flags: ['low_llm_confidence'] } };
   ```
2. 확인할 것: 이완기혈압 칸에 **"확신 50%"** + "일반적인 범위를 벗어난 값이에요" / 공복혈당 칸에 **"확신 62%"** + "글자가 흐릿해 판독이 불확실했어요"
3. 두 칸 중 하나를 **편집하면 배지가 즉시 사라지는지** 확인
4. **주입한 줄을 지우고** 다시 빌드해 원복 확인

- [ ] **Step 5: 커밋**

```powershell
cd c:\Users\seungjun\Documents\work\WITHUS\Health_Management_Service
git add frontend/src/sections/UploadSection.tsx
git commit -m @'
feat(web): 업로드·직접 입력 — OCR 검수 하이라이트·생활습관 문진

confidence는 백엔드가 준 값만 쓰고 없으면 표시하지 않는다.
편집 시 즉시 해제. 직접 입력 폼에는 예시값을 넣지 않는다.

'@
```

---

## Task 11: ⑥ 도구·참고 섹션 (medication · reference · eGFR)

앱에 없던 백엔드 기능 3종. 각각 독립 카드이며 서로 상태를 공유하지 않는다.

**Files:**
- Rewrite: `frontend/src/sections/ToolsSection.tsx`

**Interfaces:**
- Consumes: `api/endpoints.ts`의 `uploadMedicationFile`·`getMedications`·`getReferenceItems`·`evaluateReference`·`calcEgfr`
- Produces: 없음

**A. 투약이력 (HIRA)**

- `<input type="file" accept=".xls,.xlsx">` → `uploadMedicationFile(file)` → 결과 표시
- 응답: `count` · `persisted` · `inserted` · `unique_ingredients[]` · `items[]`
- `items[]`를 **`efficacy_class`(효능군)로 묶어서** 표시. 각 항목: `product_name` · `ingredient_en` · `dispensed_date`(YYYYMMDD → YYYY-MM-DD 표시) · `total_days`일 · 1일 `times_per_day`회 · `dose_per_time``unit`
- **401 에러 처리**: 백엔드가 생일 불일치 시 401을 준다 → `manual_birthday` 입력칸(YYYYMMDD 또는 YYYY-MM-DD)을 노출하고 재시도하게 한다. 에러 문구를 그대로 보여준다.
- **400 에러**: 엑셀이 아니거나 빈 파일 → 메시지 그대로.
- 아래에 `getMedications(userId)`로 **저장된 이력 조회** 버튼/표.

**B. 검사항목 참고치**

- 마운트 시 `getReferenceItems()` → 지원 항목 목록(`sbp`, `dbp`, `fbs`, `total_chol`, `ldl`, `tg`, `ast`, `alt`, `bmi`, `egfr`, `hdl`, `waist`, `hb`, `ggt`, `creatinine` 등)을 받는다. 목록은 백엔드가 주는 것을 그대로 쓴다.
- 성별 선택(M/F) + 항목별 값 입력(빈 칸은 전송 안 함) → `evaluateReference(sex, items)`
- 결과 표: 항목 · 값+`unit` · 정상범위(`normal_low`~`normal_high`) · `normal_status` · `severity` · `in_normal_range`
- `population_mean`을 입력하면 `diff_from_mean`·`pct_from_mean`·`mean_position`도 표시.
- 라벨은 `metricLabel()`로 한글화하되, 매핑에 없으면 원본 키를 그대로 쓴다.

**C. eGFR 계산기**

- 입력: 혈청 크레아티닌(mg/dL, 필수) · 나이(필수) · 성별(필수) · 체중(kg, 선택)
- 프로필에 `birth_year`·`gender`가 있으면 나이·성별을 **기본값으로 채운다**(수정 가능).
- 최근 검진에 `creatinine`이 있으면 그 값을 기본값으로.
- 결과: `egfr` + `unit` · `stage` · `label` · `description` · `severity` · `method`
- 체중을 넣었을 때만: `crcl` · `crcl_label` · `crcl_note` · `crcl_method` — **"약물 용량 참고용"**이라고 명시.

- [ ] **Step 1: 구현**

- [ ] **Step 2: 타입·빌드 검사**

```powershell
npx tsc --noEmit && npm run build
```

Expected: 에러 0건.

- [ ] **Step 3: 실화면 검증 (실계정)**

1. **참고치**: 성별 M + `sbp` 138, `fbs` 112 입력 → 평가 결과가 나오고 `normal_status`가 `high`다
2. **eGFR**: 크레아티닌 0.9 · 나이 52 · 남 → egfr 값과 stage·label이 나온다. 체중 74를 추가하면 **crcl이 추가로** 나온다
3. **투약이력**: HIRA 엑셀 파일이 없으면 임의의 `.xls`가 아닌 파일을 넣어 **400 에러 메시지가 사람말로** 나오는지만 확인하고, 실제 파싱은 "미검증"으로 기록한다 (실물 파일이 필요 — 사용자에게 요청)
4. 세 카드 중 하나가 실패해도 **나머지가 정상 동작**한다

- [ ] **Step 4: 커밋**

```powershell
cd c:\Users\seungjun\Documents\work\WITHUS\Health_Management_Service
git add frontend/src/sections/ToolsSection.tsx
git commit -m @'
feat(web): 도구·참고 — HIRA 투약이력·검사항목 참고치·eGFR 계산기

앱에 없던 백엔드 기능 3종을 웹에 노출한다. 각 카드는 독립 실패한다.

'@
```

---

## Task 12: ⑦ 프로필 섹션 + .ics 캘린더

**Files:**
- Rewrite: `frontend/src/sections/ProfileSection.tsx`

**Interfaces:**
- Consumes: `api/endpoints.ts`의 `getMe`·`patchUser`·`deleteUser`, `lib/format.ts`의 `buildCheckupIcs`·`alcoholWeeklyGrams`·`DRINK_TYPES`, `AppData.reload`
- Produces: 없음

**렌더링 내용:**

1. **프로필 수정**: 이름 · 성별(1=남/2=여) · 출생연도 → `patchUser(userId, {...})` → `data.reload()`
2. **생활습관**: 흡연 · 음주 · 음주량(Task 10과 같은 계산) → 같은 `patchUser` 호출에 포함
3. **인증 정보**: `getMe()` 응답을 그대로 KV로 (`/auth/me`)
4. **다음 검진 알림 (.ics)**:
   - `timeseries.insight.next_exam_year`가 있을 때만 카드를 보여준다. 없으면 숨긴다.
   - "○○○○년에 검진을 받으시면 돼요" + `[캘린더에 추가 (.ics)]` 버튼
   - 클릭 → `buildCheckupIcs(year, profile.name ?? '회원')` → Blob(`text/calendar;charset=utf-8`) → `checkup-{year}.ics` 다운로드
   - 안내 문구: `"웹에서는 알림을 대신 울려드릴 수 없어, 캘린더 파일로 내려드려요. 앱에서는 알림 예약이 됩니다."`
5. **회원 탈퇴**: `[계정 삭제]` → `window.confirm('계정과 모든 검진·분석·투약 기록이 영구 삭제됩니다. 되돌릴 수 없어요. 정말 삭제할까요?')` → `deleteUser(userId)` → `supabase.auth.signOut()`
   - ⚠️ **실계정 검증에서는 절대 끝까지 실행하지 않는다.** 확인 대화상자가 뜨는 것까지만 보고 **취소**한다.

- [ ] **Step 1: 구현**

- [ ] **Step 2: 타입·빌드 검사**

```powershell
npx tsc --noEmit && npm run build
```

Expected: 에러 0건.

- [ ] **Step 3: 실화면 검증 (실계정)**

1. 프로필에 현재 이름·성별·출생연도가 채워져 있다
2. 이름을 바꿔 저장 → 사이드바 하단 이름이 바뀐다 → **원래 이름으로 되돌린다**
3. `/auth/me` 정보가 표시된다
4. **.ics 다운로드** → 받은 파일을 텍스트로 열어 `DTSTART;VALUE=DATE:{연도}0110`과 `SUMMARY:`가 들어 있는지 확인
5. 계정 삭제 → **확인 대화상자만 확인하고 취소**

- [ ] **Step 4: 커밋**

```powershell
cd c:\Users\seungjun\Documents\work\WITHUS\Health_Management_Service
git add frontend/src/sections/ProfileSection.tsx
git commit -m @'
feat(web): 내 정보 — 프로필·생활습관·인증정보·검진 .ics·탈퇴

웹은 백그라운드 알림을 예약할 수 없어 앱 ⑧ 리마인더를 캘린더 파일
다운로드로 대체한다.

'@
```

---

## Task 13: 전체 검증 · 스크린샷 · 문서

**Files:**
- Create: `frontend/capture_sections.mjs`
- Rewrite: `frontend/docs/frontend-guide.md`

**Interfaces:**
- Consumes: 완성된 앱 전체
- Produces: `frontend/screenshots/*.png` 7장, 갱신된 설명서

- [ ] **Step 1: 전체 테스트·빌드 통과 확인**

```powershell
cd c:\Users\seungjun\Documents\work\WITHUS\Health_Management_Service\frontend
npm test
npx tsc --noEmit
npm run build

cd ..\backend
.\.venv\Scripts\Activate.ps1
pytest
```

Expected: vitest 전건 PASS / tsc 0 에러 / vite build 성공 / pytest **67 passed, 1 failed**(기존 `test_analyzer_isolation`만).

- [ ] **Step 2: 섹션별 스크린샷 스크립트 작성**

`frontend/capture_sections.mjs`:

```javascript
// 7개 섹션을 실계정으로 순회하며 스크린샷을 남긴다.
// 사용: node capture_sections.mjs  (dev 서버와 백엔드가 켜져 있어야 함)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const EMAIL = process.env.DEMO_EMAIL ?? 'webdemo40680@example.com';
const PASSWORD = process.env.DEMO_PASSWORD ?? '';
const SECTIONS = ['대시보드', '종합 분석', '히스토리', '검진 기록', '업로드·입력', '도구·참고', '내 정보'];

mkdirSync('screenshots', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

await page.goto('http://127.0.0.1:5173');
await page.fill('input[type=email]', EMAIL);
await page.fill('input[type=password]', PASSWORD);
await page.click('button:has-text("로그인")');
await page.waitForSelector('nav button', { timeout: 20000 });
await page.waitForTimeout(3000); // 전역 데이터 로드 대기

for (const [i, label] of SECTIONS.entries()) {
  await page.click(`nav button:has-text("${label}")`);
  await page.waitForTimeout(1500);
  const file = `screenshots/${String(i + 1).padStart(2, '0')}-${label.replace(/[·\s]/g, '')}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log('saved', file);
}

await browser.close();
```

- [ ] **Step 3: 스크린샷 촬영 + 육안 확인**

```powershell
cd c:\Users\seungjun\Documents\work\WITHUS\Health_Management_Service\frontend
node capture_sections.mjs
```

7장을 **하나씩 열어서** 확인한다:
- 레이아웃이 깨진 곳 없음
- 빈 카드("준비 중", 빈 표)가 남아 있지 않음
- 콘솔 에러로 인한 흰 화면 없음
- 금지어(진단·확진·질병 판정)가 화면에 없음

- [ ] **Step 4: 엔드포인트 커버리지 확인**

브라우저 개발자도구 Network 탭을 열고 7개 섹션을 모두 순회 + 각 도구를 한 번씩 실행해, **22개 엔드포인트가 전부 최소 1회 호출**되는지 확인한다. 호출 안 된 엔드포인트가 있으면 목록으로 보고한다.

| # | 엔드포인트 | 섹션 |
|---|---|---|
| 1 | `GET /` | 셸 |
| 2 | `GET /health` | 셸 |
| 3 | `GET /auth/me` | 내 정보 |
| 4 | `GET /users` | (프로필 조회로 대체 가능 — 호출 안 되면 정상) |
| 5 | `GET /users/{id}` | 셸 |
| 6 | `POST /users` | 미호출 정상 (가입 시에만) |
| 7 | `PATCH /users/{id}` | 내 정보 |
| 8 | `DELETE /users/{id}` | 내 정보 (실행 안 함 — 코드 존재만 확인) |
| 9 | `POST /uploads` | 업로드 |
| 10 | `POST /analyze` | 업로드 |
| 11 | `POST /analyze/simulate` | 종합 분석 |
| 12 | `GET /reports/{id}` | 셸 |
| 13 | `GET /reports/{id}/{year}` | 셸 |
| 14 | `GET /reports/{id}/comprehensive/latest` | 셸 |
| 15 | `DELETE /reports/{id}/{year}` | 검진 기록 (실행 주의) |
| 16 | `POST /timeseries/refresh` | 저장·삭제 후 |
| 17 | `GET /timeseries/{id}` | 셸 |
| 18 | `POST /medication/upload` | 도구 |
| 19 | `GET /medication/{id}` | 도구 |
| 20 | `GET /reference/items` | 도구 |
| 21 | `POST /reference/evaluate` | 도구 |
| 22 | `POST /renal/egfr` | 도구 |

- [ ] **Step 5: `frontend/docs/frontend-guide.md` 갱신**

기존 문서는 5탭 구조 기준이라 전부 낡았다. 아래 목차로 다시 쓴다:

1. 개요 — 이 웹의 역할("앱은 요약, 웹은 큰 화면 상세 열람")
2. 사용 기술 · 실행 방법 · 환경변수 (기존 4·3장 유지)
3. 폴더 구조 (이 계획의 File Structure 표)
4. 7개 섹션 ↔ 22개 엔드포인트 매핑표 (스펙 문서의 표를 옮김)
5. 데이터 흐름 (셸 1회 로드 → 섹션 props / 저장·삭제 시 reload)
6. 설계 원칙 — 백엔드가 판정·프론트는 표시 / 없는 값은 미측정 / 더미 금지 / 의료 표현
7. 앱과 다른 점 — ⑧ 알림 → .ics, ⑨ PDF → print CSS
8. 테스트 (`npm test`) 와 스크린샷 (`node capture_sections.mjs`)

- [ ] **Step 6: 24번 정리 문서에 후속 기록 추가**

`WITHUS/정리/24_기능9종_G1~G4_구현검증_작업기록_2026-07-27.md` §7 "다음 후보"의 3번 항목을 완료로 옮기지 말고, **§7 아래에 한 줄만** 덧붙인다:

```markdown
> **후속(같은 날)**: §7-3 웹 반영 완료 — 웹 프론트를 사이드바 레이아웃으로 전면 재작성해
> 앱 전 기능 + 백엔드 22개 엔드포인트 전량을 노출했다. §7-2 rarity도 함께 해결
> (`combo_analysis` 주입 + 대시보드 노출). 설계·계획은 `docs/specs-plans/`에 있다.
```

- [ ] **Step 7: 최종 커밋**

```powershell
cd c:\Users\seungjun\Documents\work\WITHUS\Health_Management_Service
git add frontend/capture_sections.mjs frontend/docs/frontend-guide.md
git add ..\정리\24_기능9종_G1~G4_구현검증_작업기록_2026-07-27.md
git commit -m @'
docs(web): 설명서 갱신 + 섹션 스크린샷 스크립트

7개 섹션 ↔ 22개 엔드포인트 매핑과 앱 대비 차이(.ics/print)를 기록.

'@
```

- [ ] **Step 8: 사용자에게 결과 보고**

다음을 있는 그대로 보고한다 (미검증 항목을 "완료"라고 하지 않는다):
- 통과한 검증: vitest / tsc / build / pytest 결과 숫자
- 22개 엔드포인트 중 실제 호출 확인된 개수
- **미검증으로 남은 것**: HIRA 실물 엑셀 파싱, 실제 검진지 OCR (24번 §7-5와 같은 이유 — 실물 파일 필요)
- 스크린샷 7장 위치
- 푸시 여부는 팀 결정에 맡긴다

---

## Self-Review 결과

**1. 스펙 커버리지**

| 스펙 요구 | 담당 Task |
|---|---|
| 전면 재작성, `src/`만 | Task 2·3·4 (삭제 목록 명시) |
| 사이드바 레이아웃 | Task 4 |
| 백엔드 22개 전량 | Task 2(정의) + Task 13 Step 4(커버리지 확인) |
| ① 대시보드 + rarity | Task 1(백엔드 주입) + Task 5 |
| ② 계산기 15종·대사증후군·LDL·조합그룹 | Task 6 |
| ② What-if | Task 7 |
| ③ 히스토리·change_pace·exam_pattern·full_timeseries | Task 8 |
| ④ 기록·JSON·삭제·인쇄 | Task 9 |
| ⑤ OCR·확신도·직접입력·생활습관 | Task 10 |
| ⑥ medication·reference·egfr | Task 11 |
| ⑦ 프로필·auth/me·.ics·탈퇴 | Task 12 |
| 백엔드 상태등 | Task 4 |
| 모바일 health.ts 이식 | Task 2(타입)·Task 3(adapt) |
| 더미 금지·실계정 검증 | Global Constraints + 각 Task 검증 Step |
| print CSS | Task 4 Step 5 + Task 9 |
| 에러 처리 | Task 4(ErrorBox) + Task 11(카드별 독립 실패) |

**2. 발견해 고친 것**
- 스펙의 "백엔드 수정 없음"이 사실과 달라 Task 1을 신설하고 스펙도 정정했다.
- Task 5의 희귀도 검증은 Task 1 주입 이후 **새로 저장된 분석**에만 적용되므로, Task 10 Step 3에 재확인 단계를 걸어뒀다.
- `Report.values`를 모바일의 `Record<MetricKey, number>`에서 `Partial<Record<...>>`로 바꿨다 — 모든 지표가 항상 있지 않으므로 원본 타입은 거짓말이다. What-if 스테퍼의 "값 없으면 렌더 안 함" 규칙이 여기 의존한다.

**3. 타입 일관성 확인**
- `adaptReport` → `Report` → `WhatIfPanel({latest})`의 `values[c.from]` 접근: `Partial`이므로 `typeof === 'number'` 가드 필수 — Task 7 코드에 반영됨.
- `getTimeseries` 반환 `RealTimeseries | null` → `AppData.timeseries` → 각 섹션의 `?.` 접근: 일관됨.
- `combo_analysis`의 신규 2필드는 Task 2 Step 3에서 `RealComboAnalysis`에 추가하도록 명시했고, Task 5·6이 그 이름(`rarity`·`metabolic_syndrome_detail`)으로 읽는다: 일치.
- `refreshTimeseries()`는 인자를 받지 않는다(백엔드가 JWT로 사용자 식별) — `App.tsx`의 `reload`에서도 무인자 호출: 일치.
