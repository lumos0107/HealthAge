# 웹 프론트 전면 재작성 — 앱 + 백엔드 전 기능 담기 (설계)

> 2026-07-27. 브레인스토밍 승인 설계.
> 배경: 정리/24번 문서 §7-3 "웹 프론트에 앱 신규기능 반영 — 현재 앱만 앞서 있어 격차가 커졌다".
> 사용자 의도: **앱은 화면이 작아 복잡해졌으니, 웹은 큰 화면에서 자세한 정보를 한눈에 보여주는 상세 열람용.**
> 구성은 앱과 달라도 되고, **기능은 전부** 들어가야 한다 (앱조차 안 쓰는 백엔드 기능 포함).

## 결정 사항

| 질문 | 결정 |
|---|---|
| 기존 `frontend/` 확장 vs 신규 | **전면 재작성** (`src/`만 갈아엎음, 빌드 설정·`.env` 유지) |
| 기능 범위 | **백엔드 22개 엔드포인트 전부** (medication·reference·renal·rarity 포함) |
| 용도 | 큰 화면 상세 열람 (앱의 보완재) |
| 레이아웃 | **A안: 좌측 사이드바 + 넓은 콘텐츠** (관리자 대시보드 스타일) |

## 기술 스택 (변경 없음)

Vite + React + TypeScript + Tailwind + Recharts + Supabase JS.
라우팅 라이브러리 없음 — `activeSection` 상태로 전환 (기존 방식).
인증: Supabase Auth → 백엔드에 `Authorization: Bearer {token}`.
데모: `webdemo40680@example.com` 실계정. **웹에 root 더미 모드는 만들지 않는다** (24번 교훈: 더미 검증 통과는 위험신호 — 실계정 경로만 사용).

## 폴더 구조

```
frontend/src/
├─ main.tsx / App.tsx        # 셸: 작업 확인, 사이드바, 섹션 전환 (얇게)
├─ api/
│  ├─ client.ts              # fetch 래퍼 (토큰 자동 첨부)
│  ├─ types.ts               # 백엔드 응답 타입 — 모바일 health.ts에서 이식
│  └─ endpoints.ts           # 22개 엔드포인트 함수
├─ sections/                 # 사이드바 섹션별 1파일 (7개)
│  ├─ DashboardSection.tsx
│  ├─ AnalysisSection.tsx
│  ├─ HistorySection.tsx
│  ├─ RecordsSection.tsx
│  ├─ UploadSection.tsx
│  ├─ ToolsSection.tsx
│  └─ ProfileSection.tsx
├─ components/               # 공용: 배지, 카드, 게이지, WhatIfPanel 등
└─ styles.css                # + 인쇄용 print CSS
```

## 섹션 ↔ 엔드포인트 전량 매핑 (22개)

| 섹션 | 기능 | 엔드포인트 |
|---|---|---|
| ① 대시보드 | 최근 검진 요약, 관리점수, 관리 필요 항목, insight(다음 검진 연도), **rarity 희귀도**("희귀≠위험" 프레이밍 동반) | `GET /reports/{id}/comprehensive/latest` |
| ② 종합 분석 (핵심) | 계산기 **15종 전체 표**(대사·지질·간·신장 그룹), 대사증후군 5요소+`metabolic_syndrome_detail`, **LDL 개인 목표**(TG≥400 판정보류 배지·`ldl_reliable`·`reliability_note`), 조합그룹 **단일13+조합12**(의학 출처 상시 노출), **What-if 시뮬레이터**(모달 아닌 넓은 패널: 좌 스테퍼 7종 / 우 결과 비교) | `GET /reports/{id}/{year}`, `POST /analyze/simulate` |
| ③ 히스토리 | 연도별 그래프(Recharts), 시계열 insight·highlights, **또래 대비 변화속도(change_pace)**, `exam_pattern`·`full_timeseries` 표 노출(앱 미사용분) | `GET /timeseries/{id}`, `POST /timeseries/refresh` |
| ④ 검진 기록 | 목록·상세·JSON 다운로드·삭제, **리포트 인쇄/PDF**(print CSS + `window.print()` — 앱 ⑨의 웹 구현. 화면에 보이는 값만, 새 의학 판단 없음, 면책 문구 포함) | `GET /reports/{id}`, `GET /reports/{id}/{year}`, `DELETE /reports/{id}/{year}` |
| ⑤ 업로드·입력 | OCR 업로드 + **확신도 검수**(`measurements_confidence` 0.7 미만 배지, `flags`→사람말, 편집 시 해제), **직접 입력**(검진지 없이), 생활습관 폼(음주량 g→MASLD/MetALD/ALD 3구간), 분석 실행·저장(`save:true`) | `POST /uploads`, `POST /analyze` |
| ⑥ 도구·참고 | **투약이력**: HIRA 엑셀 업로드·파싱(생일 복호화, `manual_birthday` 폴백)·저장분 조회 / **검사항목 참고치**: 지원 항목 목록 + 값 일괄 평가 / **eGFR 단독 계산기** | `POST /medication/upload`, `GET /medication/{user_id}`, `GET /reference/items`, `POST /reference/evaluate`, `POST /renal/egfr` |
| ⑦ 프로필 | 조회·수정·탈퇴, 내 인증정보, **다음 검진 알림 → .ics 캘린더 다운로드**(앱 ⑧의 웹 등가물 — 웹은 백그라운드 로컬 알림 불가) | `GET /users`, `GET/POST/PATCH/DELETE /users/{id}`, `GET /auth/me` |
| 셸 | 사이드바 하단 백엔드 연결 상태등 | `GET /`, `GET /health` |

### 앱 기능의 웹 대체 판단 2건
- **⑧ 검진 리마인더** → .ics 파일 다운로드 (의도 유지: "다음 검진 시기를 놓치지 않게". `insight.next_exam_year` 근거).
- **⑨ PDF 내보내기** → print CSS + 브라우저 PDF 저장.

## 데이터 흐름

```
로그인 → App.tsx 셸이 1회 로드:
  GET /users/{id} + GET /reports/{id}(연도목록)
  → 각 연도 GET /reports/{id}/{year} + comprehensive/latest + GET /timeseries/{id}
  → 컨텍스트로 각 섹션 전달 (섹션 전환 시 재요청 없음)
저장·삭제 발생 → 전체 재로드 + POST /timeseries/refresh
What-if·reference·medication·egfr → 섹션 내 개별 호출 (전역 상태 불변)
```

- 모바일 `frontend-mobile/src/health.ts`의 **언랩 로직·명칭맵(`METRIC_NAME_TO_KEY`, `METRIC_LABEL`)을 이식** — 24번 실계정 버그 3건(언랩 누락·명칭맵 누락·프로필 미초기화)을 웹에서 반복하지 않는다.
- What-if 기준선은 서버가 항상 최신 저장 검진값 사용 (앱과 동일 — 연도 선택과 무관하게 최신 회차 전달).

## 원칙 (기존 유지)

- 백엔드가 판정(status·label·risk_score), 프론트는 표시만. 프론트 재계산 금지.
- API에 없는 값은 만들지 않는다 → "미측정".
- 의료 표현: 진단·확진 금지 → 참고 정보·관리 필요·추적 관리 권장.
- What-if는 예측이 아님을 명시 (`limitations` 표시).

## 에러 처리

- API 실패 → 섹션 안에 사람말 에러 + 재시도 버튼 (화면 전체 유지).
- 신규 계정(데이터 0) → 섹션별 빈 상태 안내 → 업로드 섹션 유도.
- 백엔드 다운 → 상태등 빨간색.
- HIRA 업로드 401(생일 불일치) → manual_birthday 입력 폼 노출.

## 검증 (각 구현 단계 공통)

1. `tsc --noEmit` 0 에러 + `npm run build` 성공.
2. 로컬 백엔드(`127.0.0.1:8000`) + **`webdemo40680` 실계정** 브라우저 실화면 — 더미 검증 금지.
3. Playwright(설치됨) 섹션별 스크린샷 확인.
4. What-if 회귀 대조: 허리−5·혈당−14·TG−35·HDL+6 → 대사증후군 5→1, METS-IR 상위 77.3%→65.4% (24번 §2-G3 기지값).

## 명시적 제외 (YAGNI)

- react-router / 상태관리 라이브러리 도입 안 함.
- 웹용 더미(오프라인) 모드 안 만듦.
- 모바일 반응형은 최소한만 (주 대상 = 데스크톱 큰 화면).

## 백엔드 수정 (최소 1건)

`rarity`·`metabolic_syndrome_detail`은 `group_analysis` 안에만 있고 DB에 저장되는 건 `combo_analysis`뿐이라
`GET /reports/…`로 내려오지 않는다 (24번 §5 "combo_analysis 미주입"의 실체).
→ `checkup_service.py:128-135`의 기존 주입 블록(`single_groups`·`ascvd_simulation`·`calculators`·`ldl_target`)에
**같은 패턴으로 2줄 추가**한다. 그 외 백엔드 수정 없음.
⚠️ 주입 후 새로 저장된 분석에만 담긴다 — 기존 저장 행에는 없으므로 프론트는 null 처리 필수.
