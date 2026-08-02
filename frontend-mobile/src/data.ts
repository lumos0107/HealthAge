export type TabKey = 'dashboard' | 'records' | 'history' | 'analysis' | 'upload';
export type Status = '정상' | '주의' | '위험';
export type MetricKey =
  | 'sbp' | 'dbp' | 'glucose' | 'bmi' | 'waist'
  | 'ldl' | 'hdl' | 'triglyceride'
  | 'ast' | 'alt' | 'ggt'
  | 'hemoglobin' | 'creatinine'
  | 'totalCholesterol' | 'urineProtein' | 'height' | 'weight';

export type Report = {
  year: number;
  date: string;
  hospital: string;
  status: Status;
  summary: string;
  score: number;
  // 그 해의 주의/위험 항목 수 — score는 항상 이 값으로부터 계산되어 일치한다.
  manageCount: number;
  trackCount: number;
  values: Record<MetricKey, number>;
  // 그 해 검진에서 항목별로 어떤 상태였는지 — 점수·참고군·상세 화면이 모두 이 값 하나로부터 파생된다(단일 소스).
  // (실제 서비스에서는 GET /reports/{user_id}/{year} 응답의 comprehensive.all_evaluations[]에서 받아온다)
  statusByKey: Record<MetricKey, Status>;
  /** 그 해 항목별 또래 백분위(공단 표본 실측). 없는 항목은 비운다.
   *
   *  ⚠️ 이게 없으면 화면이 정규분포 근사로 등수를 «어림»한다. 근사도 정직하게
   *  「(어림)」이라 밝히지만, **실측 데이터가 있는데 근사를 보여주는 것**은 §1-1이
   *  말한 «만들어 놓고 안 닿는 자산»이다. 실서비스는 백엔드가 항목마다 백분위를
   *  내려주므로(health_report.py) 데모도 같은 파이프라인으로 뽑아 채운다. */
  percentileByKey?: Partial<Record<MetricKey, number>>;
};

export type MetricDefinition = {
  key: MetricKey;
  category: string;
  name: string;
  shortName: string;
  unit: string;
  normalText: string;
  normalValue: number;
  peerMean?: number;
  status: Status;
  description: string;
  note: string;
  // 실제 백엔드 평가 데이터에서만 채워지는 부가 정보(더미 데이터에는 없음) — 있을 때만 화면에 표시한다.
  percentile?: number | null;
  onMedication?: boolean;
  isElderlyWarning?: boolean;
  /** 백엔드 thresholds의 direction:"info_only" — 판정 대상이 아닌 참고값(키·체중). 점수·카운트에서 제외한다. */
  infoOnly?: boolean;
  /** 값이 숫자가 아니라 등급인 항목(요단백)의 표시 라벨. 예: {1:'음성', 3:'1+'} */
  valueLabels?: Record<number, string>;
  /** 성별로 기준이 다른 항목(허리둘레·HDL·감마-GTP·혈색소)의 여성 기준.
   *  normalText/normalValue는 남성 기준이고, 화면에 넘기기 전 applyGender()로 한 번 치환한다. */
  female?: { normalText: string; normalValue: number };
};

export type OcrField = {
  id: string;
  label: string;
  value: string;
  unit?: string;
  required?: boolean;
  // OCR이 이 값을 얼마나 확신하는지(0~1). 백엔드 measurements_confidence에서 온다.
  // 사진 인식이 아닌 경우(직접 입력·예시)는 확신도라는 게 없으므로 undefined로 둔다 —
  // 없는 숫자를 만들어 넣으면 검수 하이라이트가 거짓 근거로 뜨게 된다.
  confidence?: number;
  // 휴리스틱이 붙인 의심 표시: out_of_range_suspect(범위 밖) / low_llm_confidence.
  flags?: string[];
  section: '기본 정보' | '검사 수치';
};

export type UserProfile = {
  id?: string;
  email?: string;
  name: string;
  gender: 1 | 2;
  birth_year: number;
  birth_md?: number;
  // 생활습관 문진 (회원가입 시 1회, 내정보/업로드에서 수정). 검진 분석에 자동 사용.
  smoking?: 'never' | 'former' | 'current' | null;
  drinking?: 'no' | 'yes' | null;
  alcohol_weekly_g?: number | null;
};

export type UserSettings = {
  checkupReminder: boolean;
  medicationReminder: boolean;
  simpleWords: boolean;
};

export type GroupDef = {
  name: string;
  keys: MetricKey[];
  description: string;
  meaning: string;
  related: string;
  /** 이 묶음의 근거(§1-1③) — 학회 기준에 대응하면 그 기준을, 앱이 편의상 묶은 것이면
   *  "임상 분류가 아니라 함께 보기 위한 묶음"임을 밝힌다. 화면 2뎁스에 그대로 나간다. */
  basis: string;
  matches: number;
  metrics: string[];
};

export const initialProfile: UserProfile = {
  name: '홍길동',
  gender: 1,
  // 1968년생 — 2010년 첫 회차에 만 42세가 되게 잡았다. 지질 4종(총콜·LDL·HDL·중성지방)이
  // 만 40세부터의 검진 항목이라(peer_compare.SCREENING_AGE_MIN), 그보다 어리면 8개 회차 중
  // 앞의 둘만 지질이 빠져 또래비교가 '해당 연령 검진 항목 아님'으로 빠진다.
  birth_year: 1968,
  birth_md: 101,
  // 생활습관은 8회차 내내 같다 — 분석(음주자·현재 흡연자 판정)과 프로필이 어긋나지 않게 맞춘다.
  // 예전에는 이 셋이 비어 있어, 분석 탭은 "음주자 · MetALD 의심"이라 말하는데 ④층
  // 「다음 검진 목표」는 절주·금연 행동을 아예 못 내놓는 상태였다.
  smoking: 'current',
  drinking: 'yes',
  // 주당 순알코올 280g — MetALD 구간(남 210~420g) 안이라 지금 지방간 유형 판정과 앞뒤가 맞고,
  // 값이 있으면 '잠정'이 풀려 MASLD/MetALD/ALD를 정식으로 가른다.
  alcohol_weekly_g: 280,
};

export const initialSettings: UserSettings = {
  checkupReminder: true,
  medicationReminder: true,
  simpleWords: true,
};

/**
 * 참고 점수 계산: 100점에서 시작해 주의 -6점, 위험 -12점씩 감점.
 * 화면에 보여주는 감점 기준과 항상 일치하도록 단일 값으로 관리한다.
 */
export const SCORE_PENALTY = { manage: 6, track: 12 } as const;

// 항목별 상태(statusByKey)로부터 주의/위험 개수와 참고 점수를 계산한다.
// → score는 항상 statusByKey와 일치한다(단일 소스에서 파생되므로 어긋날 수 없음).
function scoreFromStatuses(statusByKey: Record<MetricKey, Status>) {
  let manageCount = 0;
  let trackCount = 0;
  for (const s of Object.values(statusByKey)) {
    if (s === '주의') manageCount++;
    else if (s === '위험') trackCount++;
  }
  const score = Math.max(0, 100 - SCORE_PENALTY.manage * manageCount - SCORE_PENALTY.track * trackCount);
  return { score, manageCount, trackCount };
}

function makeReport(base: Pick<Report, 'year' | 'date' | 'hospital' | 'summary' | 'values' | 'statusByKey' | 'percentileByKey'>): Report {
  const { score, manageCount, trackCount } = scoreFromStatuses(base.statusByKey);
  const status: Status = trackCount > 0 ? '위험' : manageCount > 0 ? '주의' : '정상';
  return { ...base, score, manageCount, trackCount, status };
}

// 건강검진은 2년에 한 번(만 40세 이상 일반검진 기준) — 2년 단위로 8개년치를 둔다.
// 홍길동(1968년생, 남)이 42세→56세. 2018년(50세)에 바닥을 찍고 돌아서는 흐름:
// 참고 점수 94 → 88 → 82 → 64 → **22** → 34 → 46 → 58. 바닥 뒤로는 회차마다 +12씩.
//
// 앞의 세 회차를 100점으로 두지 않은 것은 일부러다 — 42세에 감점이 하나도 없는
// 검진표는 드물다. 총콜레스테롤 202처럼 하나씩 걸치는 쪽이 실제에 가깝다.
// 점수는 주의 −6 · 위험 −12 단위로만 움직이므로 «아주 조금씩»의 최소 단위가 6점이다.
//
// ⚠️ 여기 values를 고치면 tools/gen_demo_analysis.py 의 YEARS 도 **같이** 고쳐야 한다.
//    두 곳이 갈리면 화면 위쪽(수치·점수)과 아래쪽(대사증후군·계산기·ASCVD)이
//    서로 다른 사람을 말하게 된다. 고친 뒤에는 두 생성 스크립트를 차례로 돌린다:
//      uv run python ../tools/gen_demo_analysis.py      → tools/dummy_by_year.json
//      uv run python ../tools/gen_dummy_analysis_ts.py  → src/dummyAnalysis.ts
export const reports: Report[] = [
  makeReport({
    year: 2008,
    date: '2008-05-14',
    hospital: '한국건강관리협회 서울강남지부',
    summary: '만 40세 첫 일반검진입니다. 총콜레스테롤만 기준을 살짝 넘었습니다.',
    values: { sbp: 117, dbp: 74, glucose: 90, bmi: 22.2, waist: 80, ldl: 123, hdl: 54, triglyceride: 126, ast: 22, alt: 24, ggt: 30, hemoglobin: 14.6, creatinine: 0.8, height: 165.9, weight: 61.1, totalCholesterol: 201, urineProtein: 1 },
    // 주의 1 → 94
    statusByKey: { sbp: '정상', dbp: '정상', glucose: '정상', bmi: '정상', waist: '정상', ldl: '정상', hdl: '정상', triglyceride: '정상', ast: '정상', alt: '정상', ggt: '정상', hemoglobin: '정상', creatinine: '정상', height: '정상', weight: '정상', totalCholesterol: '주의', urineProtein: '정상' },
    percentileByKey: { sbp: 31.2, dbp: 34.4, glucose: 25, bmi: 22.5, waist: 25, ldl: 55.4, hdl: 58.3, triglyceride: 42.8, ast: 37.5, alt: 40.6, ggt: 38.5, hemoglobin: 20, creatinine: 10, totalCholesterol: 48.9 },
  }),
  makeReport({
    year: 2010,
    date: '2010-04-19',
    hospital: '한국건강관리협회 서울강남지부',
    summary: '수축기 혈압이 정상 위쪽으로 올라왔습니다.',
    values: { sbp: 120, dbp: 76, glucose: 93, bmi: 22.6, waist: 82, ldl: 127, hdl: 52, triglyceride: 132, ast: 23, alt: 25, ggt: 34, hemoglobin: 14.7, creatinine: 0.82, height: 165.9, weight: 62.2, totalCholesterol: 202, urineProtein: 1 },
    // 주의 2 → 88
    statusByKey: { sbp: '주의', dbp: '정상', glucose: '정상', bmi: '정상', waist: '정상', ldl: '정상', hdl: '정상', triglyceride: '정상', ast: '정상', alt: '정상', ggt: '정상', hemoglobin: '정상', creatinine: '정상', height: '정상', weight: '정상', totalCholesterol: '주의', urineProtein: '정상' },
    percentileByKey: { sbp: 40.6, dbp: 40.6, glucose: 35.7, bmi: 26.4, waist: 35, ldl: 59.8, hdl: 52.8, triglyceride: 46.1, ast: 43.8, alt: 43.8, ggt: 46.2, hemoglobin: 22.5, creatinine: 13, totalCholesterol: 50 },
  }),
  makeReport({
    year: 2012,
    date: '2012-05-08',
    hospital: '한국건강관리협회 서울강남지부',
    summary: 'LDL이 기준을 넘어 지질 항목을 함께 봐야 합니다.',
    values: { sbp: 122, dbp: 78, glucose: 96, bmi: 22.9, waist: 83, ldl: 131, hdl: 50, triglyceride: 138, ast: 24, alt: 26, ggt: 38, hemoglobin: 14.8, creatinine: 0.83, height: 165.9, weight: 63.0, totalCholesterol: 204, urineProtein: 1 },
    // 주의 3 → 82
    statusByKey: { sbp: '주의', dbp: '정상', glucose: '정상', bmi: '정상', waist: '정상', ldl: '주의', hdl: '정상', triglyceride: '정상', ast: '정상', alt: '정상', ggt: '정상', hemoglobin: '정상', creatinine: '정상', height: '정상', weight: '정상', totalCholesterol: '주의', urineProtein: '정상' },
    percentileByKey: { sbp: 46.9, dbp: 46.9, glucose: 46.4, bmi: 30.1, waist: 40, ldl: 64.1, hdl: 46.9, triglyceride: 49.4, ast: 50, alt: 46.9, ggt: 51.9, hemoglobin: 25, creatinine: 14.5, totalCholesterol: 52 },
  }),
  makeReport({
    year: 2014,
    date: '2014-05-20',
    hospital: '한국건강관리협회 서울강남지부',
    summary: '혈압·혈당·체중이 함께 올라오기 시작했습니다.',
    values: { sbp: 126, dbp: 81, glucose: 101, bmi: 23.6, waist: 85, ldl: 134, hdl: 46, triglyceride: 144, ast: 25, alt: 28, ggt: 44, hemoglobin: 14.9, creatinine: 0.85, height: 165.9, weight: 65.0, totalCholesterol: 206, urineProtein: 1 },
    // 주의 6 → 64
    statusByKey: { sbp: '주의', dbp: '주의', glucose: '주의', bmi: '주의', waist: '정상', ldl: '주의', hdl: '정상', triglyceride: '정상', ast: '정상', alt: '정상', ggt: '정상', hemoglobin: '정상', creatinine: '정상', height: '정상', weight: '정상', totalCholesterol: '주의', urineProtein: '정상' },
    percentileByKey: { sbp: 58.3, dbp: 55, glucose: 57.5, bmi: 38.9, waist: 50, ldl: 68.5, hdl: 34.4, triglyceride: 51.8, ast: 50, alt: 54.5, ggt: 57.7, hemoglobin: 32.1, creatinine: 31.2, totalCholesterol: 55 },
  }),
  makeReport({
    year: 2016,
    date: '2016-06-11',
    hospital: '한국건강관리협회 서울강남지부',
    summary: '중성지방·감마-GTP까지 올라 대사증후군 3개 기준에 해당합니다.',
    values: { sbp: 130, dbp: 83, glucose: 104, bmi: 24.4, waist: 88, ldl: 140, hdl: 42, triglyceride: 156, ast: 27, alt: 32, ggt: 66, hemoglobin: 15.0, creatinine: 0.88, height: 165.9, weight: 67.2, totalCholesterol: 210, urineProtein: 1 },
    // 주의 8 → 52
    statusByKey: { sbp: '주의', dbp: '주의', glucose: '주의', bmi: '주의', waist: '정상', ldl: '주의', hdl: '정상', triglyceride: '주의', ast: '정상', alt: '정상', ggt: '주의', hemoglobin: '정상', creatinine: '정상', height: '정상', weight: '정상', totalCholesterol: '주의', urineProtein: '정상' },
    percentileByKey: { sbp: 69.4, dbp: 65, glucose: 65, bmi: 48.9, waist: 65, ldl: 75, hdl: 22, triglyceride: 56.2, ast: 58.3, alt: 63.6, ggt: 76.3, hemoglobin: 35.7, creatinine: 35, totalCholesterol: 59 },
  }),
  makeReport({
    year: 2018,
    date: '2018-05-30',
    hospital: '한국건강관리협회 서울강남지부',
    summary: '허리둘레가 복부비만 기준을 넘어 위험 항목이 생겼습니다.',
    values: { sbp: 133, dbp: 84, glucose: 108, bmi: 25.4, waist: 92, ldl: 144, hdl: 41, triglyceride: 165, ast: 30, alt: 37, ggt: 72, hemoglobin: 15.1, creatinine: 0.93, height: 165.9, weight: 69.9, totalCholesterol: 214, urineProtein: 1 },
    // 주의 6 · 위험 2 → 40
    statusByKey: { sbp: '주의', dbp: '정상', glucose: '주의', bmi: '위험', waist: '위험', ldl: '주의', hdl: '정상', triglyceride: '주의', ast: '정상', alt: '정상', ggt: '주의', hemoglobin: '정상', creatinine: '정상', height: '정상', weight: '정상', totalCholesterol: '주의', urineProtein: '정상' },
    percentileByKey: { sbp: 75, dbp: 70, glucose: 68.2, bmi: 65.5, waist: 81, ldl: 78.4, hdl: 19, triglyceride: 62.1, ast: 70.8, alt: 76.9, ggt: 78.6, hemoglobin: 42.9, creatinine: 53.8, totalCholesterol: 65.4 },
  }),
  makeReport({
    year: 2020,
    date: '2020-07-08',
    hospital: '서울대병원 강남센터',
    summary: '대사증후군 5개 기준을 모두 충족한 회차입니다. 9회차 중 가장 나빴던 시점입니다.',
    values: { sbp: 139, dbp: 89, glucose: 120, bmi: 27.0, waist: 96, ldl: 153, hdl: 36, triglyceride: 196, ast: 34, alt: 47, ggt: 82, hemoglobin: 15.2, creatinine: 1.05, height: 165.9, weight: 74.3, totalCholesterol: 228, urineProtein: 1 },
    // 주의 9 · 위험 2 → 22 (최저)
    statusByKey: { sbp: '주의', dbp: '주의', glucose: '주의', bmi: '위험', waist: '위험', ldl: '주의', hdl: '주의', triglyceride: '주의', ast: '정상', alt: '주의', ggt: '주의', hemoglobin: '정상', creatinine: '정상', height: '정상', weight: '정상', totalCholesterol: '주의', urineProtein: '정상' },
    percentileByKey: { sbp: 87.9, dbp: 87, glucose: 81.1, bmi: 83, waist: 91.7, ldl: 84.5, hdl: 6, triglyceride: 74.2, ast: 79.5, alt: 86.2, ggt: 81.8, hemoglobin: 46.4, creatinine: 68.8, totalCholesterol: 77.5 },
  }),
  makeReport({
    year: 2022,
    date: '2022-06-15',
    hospital: '서울대병원 강남센터',
    summary: '체중을 3.0kg 줄여 간 수치가 먼저 내려왔습니다.',
    values: { sbp: 136, dbp: 84, glucose: 113, bmi: 25.9, waist: 91, ldl: 147, hdl: 38, triglyceride: 174, ast: 30, alt: 38, ggt: 68, hemoglobin: 15.1, creatinine: 1.02, height: 165.9, weight: 71.3, totalCholesterol: 219, urineProtein: 1 },
    // 주의 7 · 위험 2 → 34
    statusByKey: { sbp: '주의', dbp: '정상', glucose: '주의', bmi: '위험', waist: '위험', ldl: '주의', hdl: '주의', triglyceride: '주의', ast: '정상', alt: '정상', ggt: '주의', hemoglobin: '정상', creatinine: '정상', height: '정상', weight: '정상', totalCholesterol: '주의', urineProtein: '정상' },
    percentileByKey: { sbp: 81.4, dbp: 70, glucose: 76.4, bmi: 72.1, waist: 78, ldl: 80.5, hdl: 10, triglyceride: 65.6, ast: 70.8, alt: 77.8, ggt: 77.3, hemoglobin: 42.9, creatinine: 65, totalCholesterol: 70.2 },
  }),
  makeReport({
    year: 2024,
    date: '2024-03-15',
    hospital: '서울대병원 강남센터',
    summary: '허리둘레가 복부비만 기준 아래로 내려와 위험 항목이 하나 풀렸습니다.',
    values: { sbp: 134, dbp: 85, glucose: 110, bmi: 25.2, waist: 88, ldl: 145, hdl: 39, triglyceride: 168, ast: 27, alt: 33, ggt: 64, hemoglobin: 15.1, creatinine: 0.99, height: 165.9, weight: 69.4, totalCholesterol: 216, urineProtein: 1 },
    // 주의 8 · 위험 1 → 40
    statusByKey: { sbp: '주의', dbp: '주의', glucose: '주의', bmi: '위험', waist: '정상', ldl: '주의', hdl: '주의', triglyceride: '주의', ast: '정상', alt: '정상', ggt: '주의', hemoglobin: '정상', creatinine: '정상', height: '정상', weight: '정상', totalCholesterol: '주의', urineProtein: '정상' },
    percentileByKey: { sbp: 72.2, dbp: 75, glucose: 67.3, bmi: 64.2, waist: 65, ldl: 81.5, hdl: 15, triglyceride: 67.4, ast: 58.3, alt: 72.5, ggt: 77.4, hemoglobin: 50, creatinine: 61.2, totalCholesterol: 72.1 },
  }),
];

export const latest = reports[reports.length - 1];

/** 항목 정의 — 이름·단위·정상범위·설명. status는 **최신 회차에서 파생**한다(바로 아래).
 *
 *  ⚠️ status를 여기 손으로 적어두면 안 된다. 홈 탭만 이 값을 그대로 쓰고(다른 탭은
 *  metricsForReport로 그 해 statusByKey를 덮어쓴다), 데모 수치를 바꿨을 때 홈에서만
 *  옛 판정이 남는다. 실제로 허리둘레가 96→88로 내려온 뒤에도 홈 TOP3는 «허리둘레 위험»을
 *  가리키고 있었다. 그래서 아래 METRIC_DEFS에는 자리만 두고 값은 latest에서 채운다. */
const METRIC_DEFS: MetricDefinition[] = [
  { key: 'sbp', category: '혈압', name: '수축기 혈압', shortName: '수축기', unit: 'mmHg', normalText: '90-119', normalValue: 120, peerMean: 126, status: '주의', description: '심장이 피를 밀어낼 때 혈관에 걸리는 압력입니다.', note: '한 번 높게 나왔다고 바로 판단하지 않고 반복 측정 흐름을 함께 봅니다.' },
  { key: 'dbp', category: '혈압', name: '이완기 혈압', shortName: '이완기', unit: 'mmHg', normalText: '60-79', normalValue: 80, peerMean: 79, status: '주의', description: '심장이 쉬는 순간 혈관에 남아 있는 압력입니다.', note: '수축기 혈압과 같이 확인해야 혈압 흐름을 이해하기 쉽습니다.' },
  { key: 'glucose', category: '혈당', name: '공복혈당', shortName: '혈당', unit: 'mg/dL', normalText: '70-99', normalValue: 99, peerMean: 101, status: '주의', description: '식사하지 않은 상태에서 혈액 속 포도당이 어느 정도인지 보는 항목입니다.', note: '식사, 수면, 스트레스 영향을 받을 수 있어 여러 해의 흐름이 중요합니다.' },
  { key: 'bmi', category: '체중·복부', name: '체질량지수(BMI)', shortName: 'BMI', unit: 'kg/m²', normalText: '18.5-22.9', normalValue: 22.9, peerMean: 24.2, status: '위험', description: '키와 체중으로 계산한 체중 상태 참고값입니다.', note: '근육량이 많은 사람은 실제 상태와 다를 수 있어 허리둘레와 함께 봅니다.' },
  { key: 'height', category: '체중·복부', name: '키', shortName: '키', unit: 'cm', normalText: '참고값', normalValue: 0, infoOnly: true, status: '정상', description: '체질량지수(BMI)를 계산할 때 쓰는 기준값입니다.', note: '좋고 나쁨을 판정하는 항목이 아니라 다른 수치를 계산하기 위한 참고값이에요.' },
  { key: 'weight', category: '체중·복부', name: '몸무게', shortName: '몸무게', unit: 'kg', normalText: '참고값', normalValue: 0, infoOnly: true, status: '정상', description: '키와 함께 체질량지수(BMI)를 계산하는 데 쓰입니다.', note: '몸무게 자체보다 BMI와 허리둘레를 함께 보는 것이 도움이 됩니다.' },
  { key: 'waist', category: '체중·복부', name: '허리둘레', shortName: '허리', unit: 'cm', normalText: '남 <90', normalValue: 90, female: { normalText: '여 <85', normalValue: 85 }, peerMean: 86, status: '위험', description: '복부 비만 여부를 볼 때 참고하는 둘레 수치입니다.', note: '대사증후군 기준과 연결되므로 BMI와 함께 확인합니다.' },
  { key: 'totalCholesterol', category: '지질', name: '총콜레스테롤', shortName: '총콜레스테롤', unit: 'mg/dL', normalText: '150-199', normalValue: 199, peerMean: 193, status: '주의', description: '혈액 속 콜레스테롤을 모두 합친 값입니다.', note: 'LDL·HDL·중성지방을 함께 봐야 전체 지질 상태를 이해할 수 있습니다.' },
  { key: 'ldl', category: '지질', name: 'LDL-C', shortName: 'LDL', unit: 'mg/dL', normalText: '<130', normalValue: 130, peerMean: 128, status: '주의', description: '혈관 건강 관리에서 자주 확인하는 콜레스테롤 항목입니다.', note: '기저질환이나 복용 약에 따라 목표 기준이 달라질 수 있습니다.' },
  { key: 'hdl', category: '지질', name: 'HDL-C', shortName: 'HDL', unit: 'mg/dL', normalText: '남 ≥40', normalValue: 40, female: { normalText: '여 ≥50', normalValue: 50 }, peerMean: 47, status: '주의', description: '흔히 좋은 콜레스테롤이라고 부르며 낮을 때 참고가 필요합니다.', note: '다른 지질 수치와 함께 봐야 전체 흐름을 이해하기 쉽습니다.' },
  { key: 'triglyceride', category: '지질', name: '중성지방', shortName: '중성지방', unit: 'mg/dL', normalText: '<150', normalValue: 150, peerMean: 152, status: '주의', description: '혈액 속 지방 성분 중 하나로 식사와 음주의 영향을 많이 받습니다.', note: '공복 여부와 최근 식습관에 따라 달라질 수 있어 위험이 좋습니다.' },
  { key: 'ast', category: '간 기능', name: 'AST', shortName: 'AST', unit: 'IU/L', normalText: '<40', normalValue: 40, peerMean: 29, status: '정상', description: '간과 근육 세포 상태를 참고할 때 보는 효소 수치입니다.', note: '단독으로 질환을 판단하지 않고 ALT, 감마-GTP와 함께 봅니다.' },
  { key: 'alt', category: '간 기능', name: 'ALT', shortName: 'ALT', unit: 'IU/L', normalText: '<40', normalValue: 40, peerMean: 32, status: '주의', description: '간세포 상태를 참고하는 대표적인 효소 수치입니다.', note: '피로, 음주, 약물 등 여러 요인의 영향을 받을 수 있습니다.' },
  { key: 'ggt', category: '간 기능', name: '감마-GTP', shortName: '감마-GTP', unit: 'IU/L', normalText: '남 11-63', normalValue: 63, female: { normalText: '여 8-35', normalValue: 35 }, peerMean: 41, status: '주의', description: '간담도계 상태와 음주 영향을 참고할 때 보는 수치입니다.', note: '음주, 약물, 지방간 등과 함께 해석해야 합니다.' },
  { key: 'hemoglobin', category: '혈액', name: '혈색소', shortName: '혈색소', unit: 'g/dL', normalText: '남 13-17', normalValue: 17, female: { normalText: '여 12-16', normalValue: 16 }, peerMean: 14.8, status: '정상', description: '혈액이 산소를 운반하는 능력을 참고하는 항목입니다.', note: '낮거나 높을 때는 다른 혈액검사 결과와 함께 확인합니다.' },
  { key: 'creatinine', category: '신장 기능', name: '혈청 크레아티닌', shortName: '크레아티닌', unit: 'mg/dL', normalText: '기관 기준 확인', normalValue: 1.2, status: '정상', description: '신장 기능을 추정할 때 참고하는 혈액검사 수치입니다.', note: '요청사항에 따라 시계열에는 표시하고 연령대 평균 비교에서는 제외합니다.' },
  { key: 'urineProtein', category: '신장 기능', name: '요단백', shortName: '요단백', unit: '', normalText: '음성', normalValue: 1, status: '정상', valueLabels: { 1: '음성', 2: '약양성(±)', 3: '1+', 4: '2+', 5: '3+', 6: '4+' }, description: '소변에 단백질이 섞여 나오는지 보는 검사입니다.', note: '일시적으로 나타날 수 있어 반복해서 나오면 신장 기능과 함께 확인합니다.' },
];

// status만 최신 회차 판정으로 갈아 끼운다 — 나머지 필드는 그대로다.
export const metricDefinitions: MetricDefinition[] = METRIC_DEFS.map((m) => ({
  ...m,
  status: latest.statusByKey[m.key] ?? m.status,
}));

/** 성별 기준이 다른 항목을 그 사용자 기준으로 바꿔 놓는다.
 *  정상범위 밴드·판정 문구·차트가 모두 normalText/normalValue만 읽으므로,
 *  화면에 정의를 넘기기 전 여기서 한 번 치환하면 전부 맞는 기준을 쓴다. */
export function applyGender<T extends MetricDefinition>(defs: T[], gender: 1 | 2): T[] {
  if (gender !== 2) return defs;
  return defs.map((m) => (m.female ? { ...m, normalText: m.female.normalText, normalValue: m.female.normalValue } : m));
}

export function metricByKey(key: MetricKey, defs: MetricDefinition[] = metricDefinitions): MetricDefinition {
  return defs.find((m) => m.key === key) ?? metricDefinitions.find((m) => m.key === key)!;
}

export type CardContent = {
  definition: string;
  detail?: string;
  /** 방향·상태를 가정하지 않는 기본 문장. 추세를 모를 때(회차 1개) 쓰인다. */
  meaning: string;
  tips?: string[];
  /** 추세 방향에 따라 갈리는 해설.
   *
   *  ⚠️ 왜 갈래가 필요한가: meaning이 "혈압이 해마다 조금씩 올라가는 흐름은…"이라고
   *     방향을 가정하고 있어서, 혈압이 내려간 사람도 이 문장을 봤다. 바로 위 헤드라인은
   *     "18mmHg 내렸어요"라고 말하는데 아래는 올라간다고 말하는, 한 화면 안에서 앞뒤가
   *     안 맞는 상태가 됐다. 방향을 가정한 카드에만 둔다 — 「지질」의 meaning처럼
   *     "어떤 조합이 위험한가"라는 일반 설명은 이 사람 추세와 무관하게 참이라 두지 않는다. */
  byTrend?: Record<'up' | 'down' | 'flat', { meaning: string }>;
  /** 상태에 따라 갈리는 tips. 추세와는 다른 축이다 —
   *  "나트륨을 줄이는 게 가장 효과가 큰 습관"은 방향이 아니라 고혈압군을 가정한 문장이라,
   *  혈압이 오르는 중이어도 아직 정상범위인 사람에게는 근거보다 센 말이 된다. */
  tipsByStatus?: { normal: string[]; attention: string[] };
};

/** 히스토리·분석 카드의 2뎁스 콘텐츠 — 카드 제목을 키로 쓴다(화면에 보이는 이름과 1:1이라 추적이 쉽다).
 * 구성: definition(이게 뭔지) · detail(2.5뎁스 심화) · meaning(그래서 의미하는 것) · tips(뭘 하면 좋은지).
 * 개별 검사항목이 아니라 '묶음'을 설명하는 층이라 metricContent와 분리해 둔다. */
/** 「지방간」 카드 ③의 「유형을 어떻게 나누나」 펼침 문구.
 *  cardContent에 두지 않는 이유: 그 맵은 «카드 제목 → 2뎁스 콘텐츠»라는 계약이고,
 *  이건 카드가 아니라 카드 «안»의 한 펼침이다. 넣으면 키가 제목인지 아닌지 알 수 없어진다.
 *  원래 「지방간 유형」 카드의 2.5뎁스였고, 합치면서 여기로 옮겼다(§1-1②). */
export const FATTY_LIVER_TYPE_CRITERIA =
  '2025년 개정된 국제 기준에서는 지방간을 MASLD(대사이상 지방간), MetALD(대사이상+음주), ALD(알코올성)로 나눕니다. 비만·고혈당·고혈압·고중성지방·낮은 HDL 중 하나 이상에 해당하면 대사 요인이 있는 것으로 보고, 여기에 음주량을 더해 유형을 가릅니다.';

export const cardContent: Record<string, CardContent> = {
  // ── 히스토리: 검사 묶음의 연도별 추이 ──
  '혈압': {
    definition: '심장이 피를 밀어낼 때(수축기)와 쉴 때(이완기) 혈관에 걸리는 압력의 여러 해 흐름이에요.',
    detail: '혈압은 하루 안에서도 20mmHg 넘게 오르내리기 때문에 한 번의 값보다 여러 해의 추세가 중요합니다. 수축기 140 또는 이완기 90 이상이 반복되면 고혈압 범위로 보고, 그 아래 구간(120-139/80-89)은 전 단계로 관리 대상입니다. 젊을수록 이완기가, 나이가 들수록 수축기가 먼저 오르는 경향이 있습니다.',
    meaning: '혈압은 증상이 없어도 진행되기 때문에, 한 번의 값보다 여러 해에 걸친 수치의 방향성 자체가 정보예요.',
    byTrend: {
      up: { meaning: '혈압이 해마다 조금씩 올라가는 흐름은 혈관이 받는 부담이 누적되고 있다는 신호로 봅니다. 증상이 없어도 진행되기 때문에 수치의 방향성 자체가 정보예요.' },
      down: { meaning: '혈압이 내려가는 흐름은 혈관이 받는 부담이 줄고 있다는 신호로 봅니다. 증상 없이 진행되는 항목이라 이 방향을 유지하는 것 자체가 목표가 돼요.' },
      flat: { meaning: '혈압이 여러 해에 걸쳐 큰 방향 없이 유지되고 있어요. 나이가 들면 수축기가 서서히 오르는 경향이 있어, 그대로 유지되는 것도 결과입니다.' },
    },
    tips: ['나트륨을 줄이는 게 가장 효과가 큰 습관이에요', '주 150분 유산소 운동이 혈압을 내리는 데 도움이 돼요', '가정혈압을 아침·저녁으로 기록하면 흐름이 더 정확해요'],
    tipsByStatus: {
      // "가장 효과가 큰"은 고혈압군 기준 효과크기라, 기준 안에 있는 사람에게는 근거보다 센 말이 된다.
      normal: ['짠 국물·젓갈을 덜 먹는 습관이 지금 수준을 지키는 데 도움이 돼요', '주 150분 유산소 운동이 혈압 관리에 도움이 돼요', '가정혈압을 아침·저녁으로 기록하면 흐름이 더 정확해요'],
      attention: ['나트륨을 줄이는 게 가장 효과가 큰 습관이에요', '주 150분 유산소 운동이 혈압을 내리는 데 도움이 돼요', '가정혈압을 아침·저녁으로 기록하면 흐름이 더 정확해요'],
    },
  },
  '혈당·체중': {
    definition: '공복혈당과 체중 관련 수치(BMI·허리둘레)를 함께 본 흐름이에요.',
    detail: '체중이 늘면 인슐린이 잘 듣지 않게 되고(인슐린 저항성), 그 결과 공복혈당이 따라 오르는 경로가 잘 알려져 있습니다. 공복혈당 100-125는 당뇨 전단계, 126 이상 반복은 당뇨 범위입니다. 특히 허리둘레가 반영하는 내장지방은 BMI보다 혈당 변화와 더 밀접합니다.',
    meaning: '혈당과 체중은 각각의 문제가 아니라 대사 상태 전반을 함께 보여주는 짝이에요. 한쪽이 움직이면 다른 쪽도 따라 움직이는 경우가 많습니다.',
    byTrend: {
      up: { meaning: '두 수치가 같은 방향으로 함께 오르고 있다면 각각의 문제가 아니라 대사 상태 전반이 변하고 있다는 뜻이에요. 체중을 줄이면 혈당도 같이 좋아지는 경우가 많습니다.' },
      down: { meaning: '두 수치가 함께 내려가고 있어요. 체중이 줄면 인슐린이 다시 잘 듣게 되고 공복혈당이 따라 내려가는 경로가 잘 알려져 있어, 대사 상태 전반이 같이 좋아지는 흐름으로 봅니다.' },
      flat: { meaning: '두 수치가 여러 해에 걸쳐 큰 변화 없이 유지되고 있어요. 나이가 들면 같은 생활을 해도 체중과 공복혈당이 서서히 오르는 경향이 있어, 유지되는 것도 결과입니다.' },
    },
    tips: ['체중 5% 감량이 혈당 개선의 가장 확실한 지렛대예요', '식후 10분 걷기가 혈당 곡선을 완만하게 만들어요', '정제 탄수화물과 단 음료부터 줄여요'],
    tipsByStatus: {
      normal: ['지금 체중을 유지하는 것이 혈당 관리의 가장 확실한 방법이에요', '식후 10분 걷기가 혈당 곡선을 완만하게 만들어요', '정제 탄수화물과 단 음료부터 줄여요'],
      attention: ['체중 5% 감량이 혈당 개선의 가장 확실한 지렛대예요', '식후 10분 걷기가 혈당 곡선을 완만하게 만들어요', '정제 탄수화물과 단 음료부터 줄여요'],
    },
  },
  '지질': {
    // 제목이 '지질'이라는 전문 용어라, 정의의 첫 문장이 그 말 자체를 풀어줘야 한다.
    // 예전엔 "혈액 속 콜레스테롤과 중성지방의 흐름"으로 시작해 무엇이 들어있는지만 말하고
    // 지질이 무슨 뜻인지는 끝까지 말하지 않았다.
    definition: '지질은 혈액 속 기름 성분을 묶어 부르는 말이에요. LDL·HDL·중성지방·총콜레스테롤 네 가지의 흐름을 함께 봐요.',
    detail: 'LDL은 혈관 벽에 쌓여 동맥경화의 위험 요인이 되고, HDL은 쌓인 콜레스테롤을 회수하는 역할이라 높을수록 좋습니다. 중성지방은 식사·음주에 민감해 12시간 공복 측정이 기준입니다. 총콜레스테롤은 이들의 합이라 총량보다 구성(LDL이 높은지, HDL이 낮은지)이 더 중요합니다.',
    meaning: '지질은 단독 수치보다 조합이 의미를 만듭니다. LDL·중성지방이 오르면서 HDL이 함께 내려가는 패턴이 심혈관 위험 요인으로 특히 주목받는 조합이에요.',
    tips: ['포화지방·트랜스지방을 줄이고 생선·견과로 바꿔요', '유산소 운동은 HDL을 올리는 거의 유일한 습관이에요', '술과 단 음료를 줄이면 중성지방이 먼저 반응해요'],
  },
  '간 기능': {
    definition: '간세포와 담즙이 지나는 길의 상태를 참고하는 효소 수치(AST·ALT·감마-GTP)의 흐름이에요.',
    detail: 'ALT는 간에 비교적 특이적이고, AST는 근육에도 있어 격한 운동 후 오를 수 있습니다. 감마-GTP는 음주와 담도 상태에 특히 민감합니다. 세 수치가 기준을 넘는 가장 흔한 원인은 지방간이며, 약물·영양제도 영향을 줍니다.',
    meaning: '간 효소는 한 번의 값보다 여러 해의 추세가 더 믿을 만해요. 한 번의 상승은 격한 운동·음주 같은 일시적 요인일 수 있습니다.',
    byTrend: {
      up: { meaning: '효소 수치가 함께 오르는 흐름은 간이 지속적으로 부담을 받고 있다는 신호로 봅니다. 다만 한 번의 상승은 일시적 요인일 수 있어 여러 해의 추세가 더 믿을 만해요.' },
      down: { meaning: '효소 수치가 내려가는 흐름은 간이 받던 부담이 줄고 있다는 신호로 봅니다. 간은 부담이 사라지면 효소 수치가 비교적 빨리 돌아오는 장기예요.' },
      flat: { meaning: '효소 수치가 여러 해에 걸쳐 큰 변화 없이 유지되고 있어요. 간은 부담이 쌓이면 수치가 따라 오르는 편이라, 흔들림 없이 유지되는 것 자체가 정보입니다.' },
    },
    tips: ['2-4주 금주 후 재검하면 원인이 술인지 가려져요', '체중 5-10% 감량으로 지방간이 좋아진 보고가 많아요', '복용 중인 약·영양제 목록을 진료 때 알려요'],
    tipsByStatus: {
      // 기준 안인 사람에게 "지방간이 좋아진"이라고 말하면 없는 지방간을 있는 것처럼 읽힌다.
      normal: ['음주 후에는 간이 회복할 2-3일 간격을 줘요', '체중을 지금 수준으로 유지하는 것이 지방간 예방에 도움이 돼요', '복용 중인 약·영양제 목록을 진료 때 알려요'],
      attention: ['2-4주 금주 후 재검하면 원인이 술인지 가려져요', '체중 5-10% 감량으로 지방간이 좋아진 보고가 많아요', '복용 중인 약·영양제 목록을 진료 때 알려요'],
    },
  },
  '혈액·신장': {
    definition: '산소 운반 능력(혈색소)과 신장 여과 기능(크레아티닌)의 흐름이에요.',
    detail: '혈색소가 기준보다 낮으면 빈혈을 참고하며 철 결핍이 가장 흔한 원인입니다. 크레아티닌은 근육에서 나오는 노폐물로, 신장이 잘 걸러내지 못하면 올라갑니다. 다만 근육량이 많아도 높게 나올 수 있어 eGFR(추정 여과율)과 함께 봅니다.',
    meaning: '두 수치 모두 한 번의 값보다 여러 해에 걸친 완만한 추세가 중요합니다.',
    byTrend: {
      up: { meaning: '두 수치 모두 급격한 변화보다 완만한 추세가 중요합니다. 크레아티닌이 여러 해에 걸쳐 조금씩 오른다면 신장 기능의 변화를 함께 확인할 만한 신호예요.' },
      down: { meaning: '두 수치 모두 급격한 변화보다 완만한 추세가 중요합니다. 크레아티닌이 내려가는 흐름 자체는 걱정할 방향은 아니지만, 근육량이 줄어도 같이 내려가기 때문에 체중 변화와 함께 봐야 해요.' },
      flat: { meaning: '두 수치 모두 여러 해에 걸쳐 큰 변화 없이 유지되고 있어요. 신장 기능은 나이가 들면 자연히 조금씩 감소하는 항목이라, 유지되는 것도 결과입니다.' },
    },
    tips: ['물을 충분히 마시는 습관이 신장 부담을 줄여요', '혈압·혈당 관리가 곧 신장 보호예요', '피로·어지럼이 이어지면 빈혈 여부를 상담해요'],
  },

  // ── 분석: 계산·판정 지표 ──
  '콩팥이 잘 거르고 있나': {
    definition: '피 속 노폐물(크레아티닌) 수치로 가늠한, 신장이 1분에 걸러내는 피의 양이에요.',
    detail: 'eGFR 90 이상이 정상, 60-89는 경도 감소, 60 미만이 3개월 이상 이어지면 만성 신장질환 범위로 봅니다. 나이가 들면 자연히 조금씩 감소하며, 근육량·수분 상태에 따라 값이 흔들릴 수 있어 한 번의 결과로 판단하지 않습니다.',
    meaning: '신장은 나빠져도 증상이 늦게 나타나는 장기라, 이 수치는 증상보다 먼저 변화를 알려주는 역할을 합니다.',
    tips: ['혈압·혈당 관리가 신장 보호의 핵심이에요', '진통소염제 장기 복용은 신장에 부담이 될 수 있어요', '탈수 상태에서 검사하면 일시적으로 나쁘게 나와요'],
  },
  /** 「지방간 보조지표」와 「지방간 유형」을 합쳤다(2026-08-02).
   *  둘은 같은 질문의 앞뒤였다 — 「지방간일 가능성이 있나」와 「그렇다면 왜 그런가」.
   *  갈라 두니 뒤 카드가 조건(ALT>40 또는 GGT>75)을 못 맞추는 해에 아무 말 없이 사라졌다.
   *  ⚠️ 버린 문구는 없다. 유형 쪽 detail(2025 MASLD 지침)은 길이 때문에 여기 두지 않고
   *  화면의 ③「원인은 무엇인가」 안 별도 펼침으로 옮겼다(§1-1② — 어디로 갔는지 기록). */
  '간에 지방이 꼈나': {
    definition: '검진 수치만으로 지방간 가능성을 가늠하는 선별용 계산 지표(FLI·HSI)예요. 가능성이 높으면 원인이 대사 문제인지 음주인지도 나눠 봐요.',
    detail: 'FLI는 중성지방·BMI·허리둘레·감마GTP를, HSI는 ALT/AST비·BMI·성별·당뇨를 조합해 계산합니다. 초음파나 조직검사를 대체하지 않고, 추가 검사가 필요한지 가려내는 선별 목적의 지표입니다.',
    meaning: '높은 구간이라면 지방간 가능성을 한 번 확인해 볼 단계라는 뜻이지, 지방간이 확진된 것은 아니에요. 같은 지방간이라도 유형에 따라 먼저 손댈 것이 달라집니다 — 대사형은 체중과 혈당이, 알코올형은 금주가 우선이에요.',
    tips: [
      '복부 초음파로 실제 지방간 여부를 확인할 수 있어요',
      '체중 감량이 지방간에 가장 잘 듣는 치료예요',
      '금주 기간을 두고 간 수치 변화를 봐요',
      '해당하는 위험인자를 하나씩 줄이는 게 유형과 무관하게 가장 확실해요',
      '음주량을 정확히 기록해 두면 유형 판정이 정확해져요',
    ],
  },
  '간이 굳어가고 있나': {
    definition: '간 효소를 조합해 간이 굳어가는 정도(섬유화)와 손상 유형을 가늠하는 지표(BARD·De Ritis)예요.',
    detail: 'BARD 점수는 BMI·AST/ALT비·당뇨로 진행된 섬유화를 배제하는 데 쓰이고, De Ritis비(AST/ALT)는 1보다 크면 알코올성, 작으면 비알코올성 지방간에 가까운 패턴으로 알려져 있습니다.',
    meaning: '간 수치가 왜 올랐는지(술 때문인지, 지방간 때문인지) 방향을 좁혀 보는 참고 지표예요.',
    tips: ['음주력과 함께 봐야 해석이 정확해져요', '간 수치가 반복해 높다면 초음파를 참고해요'],
  },
  '혈당·지질에 이상이 있나': {
    definition: '검진 기본검사 수치만으로 산출하는, 대사·혈관 상태의 검증된 참고 지표들이에요.',
    detail: 'TyG는 중성지방과 공복혈당으로 인슐린 저항성을 가늠하고, Non-HDL 콜레스테롤은 총콜레스테롤에서 HDL을 뺀 값으로 LDL보다 심혈관 위험을 잘 반영한다는 연구가 있습니다. MAP(평균동맥압)은 장기에 실제로 전달되는 평균 압력입니다.',
    meaning: '개별 수치는 정상이어도 조합으로 계산하면 위험 신호가 드러나는 경우가 있어, 기본 검사만으로 한 단계 더 들여다보는 층이에요.',
    tips: ['TyG가 높으면 체중·탄수화물 관리가 우선이에요', 'Non-HDL은 LDL 목표보다 30 높게 잡는 게 관행이에요'],
  },
  '내 LDL 목표를 넘었나': {
    definition: '검진지에 찍힌 LDL 정상 범위는 모두에게 같지만, 실제로 맞춰야 할 목표는 사람마다 달라요. 내 위험 요인을 세어 나에게 맞는 목표를 계산했어요.',
    // ⚠️ 숫자는 백엔드 LDL_TARGETS(clinical_targets.py)와 일치해야 한다.
    //    예전 문장은 「고위험군(당뇨 등) 70」·「중등도 100-130」이라 두 군데가 틀렸다 —
    //    합병증 없는 당뇨는 100이고 중등도는 130이며, 저위험 160은 아예 빠져 있었다.
    detail: '2022 한국지질·동맥경화학회 지침은 위험이 높을수록 목표를 낮게 잡습니다. 초고위험군(관상동맥질환) 55 미만 / 고위험군(뇌경색·말초동맥질환, 또는 합병증 동반 당뇨) 70 미만 / 당뇨(합병증 없음) 100 미만 / 중등도위험군(위험인자 2개 이상) 130 미만 / 저위험군(위험인자 1개 이하) 160 미만입니다. 초고위험·고위험은 병력을 알아야 정할 수 있어 검진 수치만으로는 판정하지 않습니다.',
    meaning: '"정상 범위"가 모두에게 같지 않다는 뜻입니다. 같은 130이라도 어떤 사람에게는 목표 달성이고 다른 사람에게는 초과예요.',
    tips: ['위험인자가 겹친다면 진료에서 목표치를 확인해요', '식이 조절로 부족하면 약물 치료를 상담할 수 있어요'],
  },
  '이 조합이 흔한가': {
    definition: '내 검진 결과와 같은 조합을 가진 사람들이 공단 표본에서 얼마나 되는지 비교한 통계예요.',
    detail: 'O/E비는 각 요인이 서로 무관하다면 기대되는 동반 빈도 대비, 실제로 함께 나타난 빈도의 비율입니다. 1보다 크면 우연보다 자주 같이 나타난다는 뜻이지만, 인과관계나 개인의 위험도를 뜻하지는 않습니다.',
    meaning: '내 상태가 흔한 패턴인지 드문 조합인지 위치를 알려주는 통계 참고값이에요. 위험의 크기는 계산기(ASCVD 등)가 담당합니다.',
  },
  '또래 자체가 나빠졌나': {
    definition: '지금의 내 또래가 16년 전 같은 나이대보다 나빠졌는지 비교한 결과예요.',
    detail: '국민건강보험공단 표본 2009~2024년 1,596만 건에서, 나와 같은 성별·연령대만 뽑아 2009년과 2024년의 유병률을 비교했습니다. 나이를 고정했기 때문에 인구 고령화 때문에 생기는 착시가 제거됩니다. 개인식별자가 없는 자료라 같은 사람을 추적한 것이 아니라 같은 나이대 집단끼리의 비교입니다.',
    meaning: '또래 비교에서 "평균 근처"라는 말의 뜻이 16년 전과 달라졌어요. 기준이 되는 또래 집단 자체가 나빠졌다면, 평균이라는 위치가 안심할 근거가 되지는 않습니다.',
    tips: ['또래 평균이 아니라 정상범위를 기준으로 삼아요', '악화 폭이 큰 항목부터 먼저 관리해요', '같은 수치를 유지하는 것만으로도 또래 대비 순위는 올라가요'],
  },
  '나는 어떤 상태인가': {
    // 제목에서 「집단군」(우리가 지은 말)을 뺐으므로 여기도 그 말에 기대지 않는다.
    // 대신 어떤 이름들이 나오는지 예를 들어준다 — 카드를 열기 전에 무엇을 볼지 알게 된다.
    definition: '검진 수치와 복용 약물을 함께 봐서, 고혈압·당뇨·대사증후군 같은 상태 기준에 해당하는지 가린 결과예요.',
    detail: '임상 기준(고혈압·당뇨·대사증후군 등)은 학회 진단 기준을 그대로 적용하고, 약을 복용 중이면 수치가 정상이어도 해당으로 봅니다. 생활습관 기준은 흡연·음주 등 문진 응답으로 가립니다.',
    meaning: '해당 개수가 많을수록 여러 기준에 동시에 걸쳐 있다는 뜻이고, 그만큼 관리 우선순위를 정할 근거가 됩니다.',
  },
  '심혈관 위험이 얼마나 되나': {
    definition: '앞으로 10년 안에 심근경색·뇌졸중이 생길 확률을 가늠해 보는 참고용 계산이에요.',
    detail: '나이·성별·콜레스테롤·혈압·흡연·당뇨를 넣어 계산하는 ASCVD 위험도 공식을 씁니다. 미국인 코호트에서 만들어진 식이라 한국인에게는 과대추정되는 경향이 보고돼 있어, 절대값보다 무엇을 바꾸면 얼마나 달라지는지를 보는 데 의미가 있습니다.',
    meaning: '지금 상태가 유지된다고 가정한 수치예요. 아래 시나리오처럼 금연·혈압 조절로 숫자가 얼마나 내려가는지가 실제로 쓸모 있는 정보입니다.',
    tips: ['금연이 단일 항목 중 가장 크게 위험을 낮춰요', '혈압과 LDL은 함께 관리할 때 효과가 커요'],
  },
  '또래보다 빠르게 변한 항목': {
    definition: '같은 성별·연령대 사람들의 평균 변화량과, 내 수치가 변한 폭을 비교한 값이에요.',
    detail: '건강보험공단 검진 표본에서 같은 성별·연령대의 연간 평균 변화량을 구하고, 내 변화량이 그 몇 배인지 계산합니다. 또래 평균 변화가 0에 가까우면 배수가 발산하므로 변화가 뚜렷할 때(±0.5 이상)만 배수를 냅니다.',
    meaning: '나이가 들면 자연히 오르는 수치도 있어서, 절대값보다 "또래보다 빠른가"가 관리 시급성을 더 잘 알려줍니다.',
    tips: ['또래보다 빠른 항목부터 우선순위를 잡아요', '평균과의 비교라 또래 안의 개인차는 담기지 않아요'],
  },
  '주목할 만한 변화': {
    definition: '여러 해의 기록을 비교해 시스템이 자동으로 짚어낸 변화 목록이에요.',
    detail: '정상→주의→위험처럼 구간이 바뀐 항목, 여러 해 연속 같은 방향으로 움직인 항목을 찾아냅니다. 2년 이상의 기록이 있어야 판단할 수 있어 기록이 적으면 비어 있을 수 있습니다.',
    meaning: '한 해만 보면 지나치기 쉬운 완만한 변화를, 여러 해를 이어 붙여야 보이는 흐름으로 잡아낸 것이에요.',
  },
  '맞춤 권장사항': {
    definition: '내 검진 결과와 해당하는 상태 기준을 바탕으로 만든 생활습관·검진 안내예요.',
    meaning: '일반적인 건강 수칙이 아니라, 내 수치에서 실제로 벗어난 항목에 맞춰 우선순위를 매긴 참고 정보예요.',
  },
};

/** 이 사람의 추세·상태에 맞는 카드 문구를 고른다.
 *
 *  화면은 이 함수 하나만 부른다 — 갈래를 고르는 판단이 화면마다 흩어지면 히스토리와
 *  분석이 같은 카드에 다른 문장을 띄우게 된다.
 *
 *  @param dir    추세 방향. null(회차 1개 등 방향을 모를 때)이면 방향을 가정하지 않는 기본 문장.
 *  @param status 그 카드 대표 항목의 그 해 판정. 없으면 기본 tips.
 */
export function cardContentFor(
  title: string,
  dir: 'up' | 'down' | 'flat' | null,
  status?: Status,
): { definition?: string; detail?: string; meaning?: string; tips?: string[] } {
  const c = cardContent[title];
  if (!c) return { definition: undefined, detail: undefined, meaning: undefined, tips: undefined };
  const tips = status && c.tipsByStatus
    ? (status === '정상' ? c.tipsByStatus.normal : c.tipsByStatus.attention)
    : c.tips;
  return {
    definition: c.definition,
    detail: c.detail,
    meaning: (dir && c.byTrend?.[dir]?.meaning) || c.meaning,
    tips,
  };
}

/** L2 상세의 심화 콘텐츠 — 항목별 상세 설명(detail: 2.5뎁스 펼치기)과 행동 팁(tips).
 * MetricDefinition에 넣지 않고 key로 찾는 별도 맵으로 둔 이유: 실데이터 경로(health.ts)가 만드는
 * MetricDefinition에도 같은 key가 있어, 매핑 코드를 고치지 않고 화면에서 바로 찾아 쓸 수 있다.
 * 톤: 참고용 정보 — 진단·처방 표현을 쓰지 않고, 기준 수치와 생활습관 수준의 팁만 담는다.
 * tips는 습관 기반 문장이라 정상(유지)·주의/위험(개선) 어느 프레임에서도 자연스럽게 읽히도록 쓴다. */
/** 1뎁스 리스트용 짧은 뜻풀이 — 이름만 봐선 모를 항목에만 붙인다.
 * 혈압·몸무게·허리둘레처럼 이름이 곧 설명인 항목은 넣지 않는다(뻔한 말은 노이즈).
 * 긴 정의는 2뎁스의 "이 항목은요"가 맡는다. */
// 값·배지가 오른쪽 폭을 쓰므로 한 줄에 안 잘리려면 10자 안쪽이어야 한다.
export const metricGloss: Partial<Record<MetricKey, string>> = {
  bmi: '키·몸무게 비만도',
  ldl: '나쁜 콜레스테롤',
  hdl: '좋은 콜레스테롤',
  triglyceride: '혈액 속 지방',
  ast: '간 효소',
  alt: '간 효소',
  ggt: '간·음주 효소',
  hemoglobin: '산소 운반 능력',
  creatinine: '신장 노폐물',
  urineProtein: '소변 속 단백질',
};

/** 1뎁스 요약 문장의 주어 — `쉬운 말(실제 용어)` 형식.
 *  쉬운 말만 두면 검사 결과지·2뎁스와 이름이 달라 같은 항목인 줄 모르고, 실제 용어만 두면
 *  약어라 안 읽힌다. 둘 다 적어 처음 보는 사람은 앞을, 결과지와 맞춰 보는 사람은 뒤를 읽는다.
 *
 *  metricGloss(검사항목 탭의 부제)와 따로 둔 이유: 그건 이름 아래 붙는 뜻풀이라
 *  "키·몸무게 비만도"처럼 명사구여도 되지만, 여기 값은 "…가 3.8 올랐어요"의 주어라
 *  문장에 그대로 들어가야 읽힌다.
 *
 *  ⚠️ 조사를 직접 적는다. 약어의 조사는 소리로 정해지는데(LDL은 '엘디엘'이라 "LDL이")
 *  interpret.subjectJosa는 한글 받침만 읽어서 라틴 문자에서는 틀린다.
 *  혈색소·중성지방·혈당·허리처럼 이미 쉬운 한글 이름인 항목은 넣지 않는다 —
 *  shortName + subjectJosa로 정확히 처리되고, 괄호를 붙이면 길기만 하다. */
export const metricPlainName: Partial<Record<MetricKey, { text: string; sub: '이' | '가'; top: '은' | '는' }>> = {
  ldl: { text: '나쁜 콜레스테롤(LDL)', sub: '이', top: '은' },
  hdl: { text: '좋은 콜레스테롤(HDL)', sub: '이', top: '은' },
  ast: { text: '간 수치(AST)', sub: '가', top: '는' },
  alt: { text: '간 수치(ALT)', sub: '가', top: '는' },
  ggt: { text: '간 수치(감마-GTP)', sub: '가', top: '는' },
  bmi: { text: '체질량지수(BMI)', sub: '가', top: '는' },
  sbp: { text: '수축기 혈압', sub: '이', top: '은' },
  dbp: { text: '이완기 혈압', sub: '이', top: '은' },
  creatinine: { text: '신장 수치(크레아티닌)', sub: '이', top: '은' },
};

// 백엔드는 내부 검진항목 키를 그대로 쓴다(non_HDL, 식전혈당(공복혈당) 등).
// 화면에는 사용자가 읽는 이름으로 바꿔 보여준다. 맵에 없으면 원래 키를 그대로 쓴다.
const METRIC_LABEL: Record<string, string> = {
  '수축기혈압': '수축기 혈압',
  '이완기혈압': '이완기 혈압',
  '식전혈당(공복혈당)': '공복혈당',
  '트리글리세라이드': '중성지방',
  'non_HDL': 'Non-HDL 콜레스테롤',
  '총콜레스테롤': '총콜레스테롤',
  'LDL콜레스테롤': 'LDL 콜레스테롤',
  'HDL콜레스테롤': 'HDL 콜레스테롤',
  '혈청지오티(AST)': 'AST',
  '혈청지피티(ALT)': 'ALT',
  '감마지티피': '감마-GTP',
  '혈청크레아티닌': '크레아티닌',
  'AST_ALT비': 'AST/ALT 비',
  'BMI': '체질량지수(BMI)',
  '맥압': '맥압',
};
export const metricLabel = (m: string) => METRIC_LABEL[m] ?? m;

export const metricContent: Record<MetricKey, { detail: string; tips: string[] }> = {
  sbp: {
    detail: '120-139mmHg는 고혈압 전 단계, 140mmHg 이상이 반복되면 고혈압 범위로 봅니다. 혈압은 긴장·시각에 따라 10-20씩 흔들리기 때문에, 진료실 1회 측정보다 아침·저녁 가정혈압의 평균이 실제 상태에 가깝습니다.',
    tips: ['국물·젓갈 등 짠 음식을 줄여 나트륨 섭취를 낮춰요', '빠르게 걷기 같은 유산소 운동을 주 150분 해요', '아침·저녁 가정혈압을 기록해 흐름을 확인해요'],
  },
  dbp: {
    detail: '80-89mmHg는 전 단계, 90mmHg 이상이 반복되면 고혈압 범위입니다. 이완기만 높은 경우는 비교적 젊은 나이에서 흔하고, 말초 혈관의 저항이 높아진 상태와 관련이 있다고 알려져 있습니다.',
    tips: ['카페인과 음주를 줄이면 이완기 혈압에 도움이 돼요', '체중을 5%만 줄여도 혈압이 내려가는 경향이 있어요', '수축기 혈압과 함께 기록해서 같이 봐요'],
  },
  glucose: {
    detail: '100-125mg/dL는 공복혈당장애(당뇨 전 단계), 126mg/dL 이상이 반복되면 당뇨 범위입니다. 당화혈색소(HbA1c)를 함께 확인하면 최근 2-3개월의 평균 혈당 흐름까지 알 수 있습니다.',
    tips: ['흰밥·빵·단 음료 같은 정제 탄수화물을 줄여요', '식사 후 10분 걷기가 혈당을 완만하게 만들어요', '수면 부족도 혈당을 올려요 — 7시간을 목표로 해요'],
  },
  bmi: {
    detail: '한국 기준으로 23-24.9는 과체중, 25 이상은 비만 범위입니다. 근육량이 많으면 실제보다 높게 나올 수 있어, 허리둘레·체지방률과 함께 보면 더 정확합니다.',
    tips: ['현재 체중의 5% 감량을 첫 목표로 잡아요', '유산소 주 150분에 근력 운동 주 2회를 더해요', '야식과 음주 빈도를 줄이는 게 시작점이에요'],
  },
  height: {
    detail: '키 자체는 좋고 나쁨을 판정하지 않습니다. 다만 성인이 된 뒤 키가 눈에 띄게(2cm 이상) 줄었다면 뼈 건강 변화를 참고할 수 있는 신호로 봅니다.',
    tips: [],
  },
  weight: {
    detail: '체중은 BMI 계산의 재료로 쓰는 참고값입니다. 다이어트를 하지 않았는데 6개월 사이 5% 이상 늘거나 줄었다면 상담 시 참고할 만한 변화입니다.',
    tips: [],
  },
  waist: {
    detail: '남성 90cm, 여성 85cm 이상이면 복부비만으로 봅니다. 허리둘레는 내장지방을 반영하는 수치라 BMI가 정상이어도 따로 볼 가치가 있고, 대사증후군 5가지 기준 중 하나입니다.',
    tips: ['내장지방은 유산소 운동에 가장 잘 반응해요', '음주 빈도를 줄이면 복부지방 관리에 도움이 돼요', '아침 공복, 같은 조건에서 재야 변화를 비교할 수 있어요'],
  },
  totalCholesterol: {
    detail: '200-239mg/dL는 경계, 240mg/dL 이상은 높음 범위입니다. 총콜레스테롤은 LDL·HDL·중성지방을 합쳐 본 값이라, 총량보다 그 구성(LDL이 높은지, HDL이 낮은지)이 더 중요합니다.',
    tips: ['삼겹살·버터 같은 포화지방을 줄이고 생선·견과로 바꿔요', '귀리·콩 등 식이섬유가 콜레스테롤 배출을 도와요', '유산소 운동이 지질 구성 전반을 개선해요'],
  },
  ldl: {
    detail: '130-159mg/dL는 경계, 160mg/dL 이상은 높음 범위입니다. LDL은 혈관 벽에 쌓여 동맥경화의 위험 요인이 되는 콜레스테롤이라, 당뇨·고혈압 같은 위험 요인이 있으면 목표 기준이 더 낮게 잡힙니다.',
    tips: ['트랜스지방(가공식품)·포화지방부터 줄여요', '귀리·보리·콩의 수용성 식이섬유가 LDL을 낮춰요', '위험 요인이 겹쳐 있다면 진료에서 목표치를 확인해요'],
  },
  hdl: {
    detail: '남성 40, 여성 50mg/dL 미만이면 낮음으로 보고, 60mg/dL 이상이면 오히려 보호 요인으로 봅니다. HDL은 혈관에 쌓인 콜레스테롤을 되가져오는 역할이라 "좋은 콜레스테롤"로 불리며, 운동으로 올릴 수 있는 대표 지표입니다.',
    tips: ['유산소 운동이 HDL을 올리는 가장 확실한 습관이에요', '흡연은 HDL을 낮춰요 — 금연이 곧 지질 관리예요', '흰 탄수화물을 줄이면 HDL·중성지방이 같이 좋아져요'],
  },
  triglyceride: {
    detail: '150-199mg/dL는 경계, 200mg/dL 이상은 높음 범위입니다. 중성지방은 식사·음주 직후 크게 오르는 수치라 12시간 공복 상태 측정이 기준이고, 술과 단 음료의 영향이 특히 큽니다.',
    tips: ['술과 단 음료를 줄이는 게 가장 효과가 커요', '야식을 줄이면 공복 중성지방이 내려가요', '유산소 운동이 중성지방을 태우는 데 효과적이에요'],
  },
  ast: {
    detail: '40IU/L 이상이면 간·근육 세포의 손상을 참고합니다. 간에만 있는 효소가 아니어서 격한 운동 후에도 일시적으로 오를 수 있고, ALT·감마-GTP와 함께 봐야 간 상태를 구분할 수 있습니다.',
    tips: ['검진 전날 격한 운동은 수치를 올릴 수 있어요', '음주 후에는 간이 회복할 2-3일 간격을 줘요', 'ALT·감마-GTP와 함께 흐름을 봐요'],
  },
  alt: {
    detail: '40IU/L 이상이 반복되면 가장 흔한 원인은 지방간입니다. ALT는 간세포에 주로 있는 효소라 간 상태를 비교적 특이적으로 반영하며, 약물·영양제도 영향을 줄 수 있습니다.',
    tips: ['체중 5-10% 감량으로 지방간이 좋아진 보고가 많아요', '음주량과 빈도를 함께 줄여요', '새로 시작한 약·영양제가 있다면 목록을 확인해요'],
  },
  ggt: {
    detail: '기준(남 11-63, 여 8-35IU/L)을 넘으면 음주·담도·지방간의 영향을 참고합니다. 감마-GTP는 음주에 특히 민감해서, 2-4주 금주 후 다시 재면 원인이 술인지 아닌지 구분하는 데 도움이 됩니다.',
    tips: ['2-4주 금주 후 변화를 보면 원인 파악에 도움이 돼요', '지방간 관리(체중·식이)가 감마-GTP도 낮춰요', '복용 중인 약이 있다면 함께 참고해요'],
  },
  hemoglobin: {
    detail: '기준보다 낮으면 빈혈을 참고하며 철 결핍이 가장 흔한 원인입니다. 높은 경우는 흡연·탈수 등의 영향일 수 있습니다. 피로·어지럼 같은 증상과 함께 볼 때 의미가 커집니다.',
    tips: ['붉은 살코기·시금치 등 철분이 풍부한 식품을 챙겨요', '식사 직후 커피·차는 철분 흡수를 방해해요', '피로·어지럼이 계속되면 상담 시 참고해요'],
  },
  creatinine: {
    detail: '근육에서 나오는 노폐물로, 신장이 얼마나 잘 걸러내는지(eGFR 추정)에 쓰는 수치입니다. 근육량이 많으면 신장이 정상이어도 높게 나올 수 있어 기관 기준과 함께 봅니다.',
    tips: ['물을 충분히 마시는 습관이 신장 부담을 줄여요', '진통소염제를 오래 복용 중이라면 참고가 필요해요', '단백질 보충제 과다 섭취는 수치를 올릴 수 있어요'],
  },
  urineProtein: {
    detail: '음성이 정상입니다. 격한 운동·발열·탈수 뒤에는 일시적으로 양성이 나올 수 있어 한 번의 결과로 판단하지 않고, 반복해서 나오면 신장의 거름망(사구체) 상태를 참고합니다.',
    tips: ['양성이 나왔다면 재검으로 지속 여부를 확인해요', '혈압·혈당 관리가 곧 신장 보호예요', '아침 첫 소변 기준이 가장 안정적이에요'],
  },
};

/**
 * 특정 연도 보고서의 항목별 상태(statusByKey)를 metricDefinitions에 입혀서
 * "그 해 기준" 항목 목록을 만든다. 점수·참고군·상세 화면이 전부 이 함수 하나로
 * 부터 파생되므로, 어떤 화면에서 봐도 항상 같은 그림을 보게 된다.
 */
export function metricsForReport(report: Report, defs: MetricDefinition[] = metricDefinitions): MetricDefinition[] {
  // 건강검진은 매번 모든 항목을 검사하지 않는다 — 그 해에 실제로 측정되지 않은 항목까지
  // (다른 해의 상태값 등으로) 채워서 보여주면 사용자에게 사실과 다른 정보를 전달하게 된다.
  // 그래서 statusByKey에 실제 값이 있는, 즉 그 해에 "실제로 측정된" 항목만 포함한다.
  return defs
    .filter((m) => report.statusByKey[m.key] !== undefined)
    // 그 해 실측 백분위가 있으면 얹는다 — 없으면 화면이 근사로 «어림» 등수를 만든다.
    .map((m) => ({
      ...m,
      status: report.statusByKey[m.key]!,
      percentile: report.percentileByKey?.[m.key] ?? m.percentile,
    }));
}

/** 그 항목을 실제로 측정한 해만 오름차순으로. L2 상세의 연도 칩이 쓴다.
 *  판정 기준을 metricsForReport와 똑같이(statusByKey 유무) 두는 것이 핵심이다 —
 *  안 잰 해를 고를 수 있게 두면 그 해엔 MetricDefinition이 만들어지지 않아
 *  상세 화면 자체가 조용히 사라진다. */
export function yearsWithMetric(reports: Report[], key: MetricKey): number[] {
  return reports.filter((r) => r.statusByKey[key] !== undefined).map((r) => r.year);
}

export function isBadStatus(status: Status) {
  return status !== '정상';
}

/**
 * 참고 점수 계산: 100점에서 시작해 주의 -6점, 위험 -12점씩 감점.
 * 화면에 보여주는 감점 기준과 항상 일치하도록 단일 함수로 관리한다.
 */
export function computeScore(defs: MetricDefinition[] = metricDefinitions) {
  const scoringDefs = defs.filter((m) => !m.infoOnly);
  const manageCount = scoringDefs.filter((m) => m.status === '주의').length;
  const trackCount = scoringDefs.filter((m) => m.status === '위험').length;
  const score = Math.max(0, 100 - SCORE_PENALTY.manage * manageCount - SCORE_PENALTY.track * trackCount);
  return { score, manageCount, trackCount };
}

/**
 * 수치가 어느 방향으로 갈 때 주의가 필요한지 알려준다.
 * - 'high'  : 높을수록 주의 (예: "<120")
 * - 'low'   : 낮을수록 주의 (예: "≥40")
 * - 'range' : 정해진 범위를 벗어나면(높아도, 낮아도) 주의 (예: "70-99", "13-17")
 */
export type MetricDirection = 'high' | 'low' | 'range';

export function metricDirection(metric: MetricDefinition): MetricDirection {
  const t = metric.normalText;
  if (t.includes('-') || t.includes('~')) return 'range';
  if (t.includes('<') || t.includes('≤')) return 'high';
  if (t.includes('≥') || t.includes('>')) return 'low';
  return 'range';
}

export function directionLabel(dir: MetricDirection) {
  if (dir === 'high') return { icon: '▲', text: '높으면 주의' };
  if (dir === 'low') return { icon: '▼', text: '낮으면 주의' };
  return { icon: '◆', text: '범위를 벗어나면 주의' };
}

export function historyRows(keys: MetricKey[], reportList: Report[] = reports) {
  return reportList.map((r) => ({
    year: r.year,
    ...Object.fromEntries(keys.map((k) => [metricByKey(k).shortName, r.values[k]])),
  }));
}

// basis(§1-1③) — 다른 카드는 전부 formula/cutoffs/reference를 다는데 참고군만 근거 필드가
// 없었다. 대사 참고군만 학회 진단기준에 대응하고, 나머지 넷은 검진표의 검사 패널 묶음이다.
const groupDefs = [
  { name: '대사 관리 참고군', keys: ['waist', 'glucose', 'triglyceride', 'hdl', 'sbp'] as MetricKey[], description: '허리둘레, 혈당, 지질, 혈압 항목이 함께 겹칠 때 먼저 확인하는 그룹입니다.', meaning: '대사증후군 기준과 가까운 항목을 묶어 보는 참고군입니다.', related: '복부비만, 혈당 상승, 혈압 상승, 중성지방 상승, HDL 저하와 관련해 볼 수 있습니다.', basis: '대사증후군 진단기준(허리둘레·혈당·중성지방·HDL·혈압 5인자)과 같은 항목 묶음이에요. 정식 판정은 위 「나는 어떤 상태인가」 카드가 약 복용까지 반영해 따로 셉니다.' },
  { name: '혈압 관리 참고군', keys: ['sbp', 'dbp'] as MetricKey[], description: '수축기와 이완기 혈압 흐름을 우선 살펴보는 그룹입니다.', meaning: '혈압 수치가 반복해서 기준을 벗어나는지 확인하는 참고군입니다.', related: '두통, 어지럼, 혈관 부담과 관련해 상담이 필요할 수 있지만 증상 없이 나타나기도 합니다.', basis: '검진표의 혈압 두 항목을 함께 보기 위한 묶음이에요. 임상 분류가 아닙니다.' },
  { name: '지질 관리 참고군', keys: ['ldl', 'hdl', 'triglyceride', 'totalCholesterol'] as MetricKey[], description: '콜레스테롤과 중성지방 항목을 묶어서 보는 그룹입니다.', meaning: '혈관 건강과 관련된 지질 수치를 함께 보는 참고군입니다.', related: 'LDL 상승, HDL 저하, 중성지방 상승은 심혈관 위험 요인과 함께 확인합니다.', basis: '검진표의 지질 패널(총콜레스테롤·LDL·HDL·중성지방)을 함께 보기 위한 묶음이에요. 임상 분류가 아닙니다.' },
  { name: '간 기능 관찰군', keys: ['ast', 'alt', 'ggt'] as MetricKey[], description: '간 효소 수치가 생활습관, 약물, 음주와 함께 영향을 받을 수 있는 그룹입니다.', meaning: '간세포나 간담도계 상태를 참고하는 효소 수치를 묶은 그룹입니다.', related: '음주, 약물, 피로, 지방간 가능성 등 여러 요인과 함께 확인합니다.', basis: '검진표의 간효소 패널(AST·ALT·감마-GTP)을 함께 보기 위한 묶음이에요. 임상 분류가 아닙니다.' },
  { name: '신장 기능 관찰군', keys: ['creatinine', 'urineProtein'] as MetricKey[], description: '혈청 크레아티닌과 요단백 흐름을 따로 추적하는 그룹입니다.', meaning: '신장 기능 추정에 쓰이는 혈청 크레아티닌을 관찰하는 참고군입니다.', related: '신장 기능 변화는 eGFR 계산과 함께 확인하며 평균 비교에는 사용하지 않습니다.', basis: '검진표의 신장 패널(혈청 크레아티닌·요단백)을 함께 보기 위한 묶음이에요. 임상 분류가 아닙니다.' },
];

/**
 * 특정 연도의 "그 해 기준" 항목 상태(metricsForReport)를 바탕으로 가까운 참고군을 계산한다.
 * → 점수·항목 상태·참고군이 전부 같은 statusByKey에서 파생되므로 서로 어긋나지 않는다.
 */
export function computeGroupsForReport(report: Report, defs: MetricDefinition[] = metricDefinitions): GroupDef[] {
  const yearMetrics = metricsForReport(report, defs);
  const byKey = (k: MetricKey) => yearMetrics.find((m) => m.key === k);
  return groupDefs
    .map((g) => {
      const matched = g.keys.map(byKey).filter((m): m is MetricDefinition => !!m && m.status !== '정상');
      return { ...g, matches: matched.length, metrics: matched.map((m) => m.name) };
    })
    .sort((a, b) => b.matches - a.matches);
}

export function computeGroups(defs: MetricDefinition[] = metricDefinitions): GroupDef[] {
  const byKey = (k: MetricKey) => defs.find((m) => m.key === k)!;
  return groupDefs
    .map((g) => {
      const matched = g.keys.map(byKey).filter((m) => m.status !== '정상');
      return { ...g, matches: matched.length, metrics: matched.map((m) => m.name) };
    })
    .sort((a, b) => b.matches - a.matches);
}

// 검수 화면의 항목 틀(라벨·단위·필수여부·구분). 값과 confidence는 실제 OCR 응답으로 채운다.
// ※ 예전에는 여기에 confidence가 하드코딩돼 있었으나 아무도 쓰지 않는 허구값이라 제거했다.
export const ocrTemplate: OcrField[] = [
  { id: 'exam_date', label: '검진일', value: '', required: true, section: '기본 정보' },
  { id: 'hospital', label: '검진기관', value: '', required: true, section: '기본 정보' },
  { id: 'height', label: '키', value: '165.9', unit: 'cm', section: '검사 수치' },
  { id: 'weight', label: '몸무게', value: '74.0', unit: 'kg', section: '검사 수치' },
  { id: 'waist', label: '허리둘레', value: '86.0', unit: 'cm', section: '검사 수치' },
  { id: 'sbp', label: '수축기 혈압', value: '135', unit: 'mmHg', required: true, section: '검사 수치' },
  { id: 'dbp', label: '이완기 혈압', value: '117', unit: 'mmHg', required: true, section: '검사 수치' },
  { id: 'hb', label: '혈색소', value: '15.9', unit: 'g/dL', section: '검사 수치' },
  { id: 'fbs', label: '공복혈당', value: '94', unit: 'mg/dL', required: true, section: '검사 수치' },
  { id: 'total_cholesterol', label: '총콜레스테롤', value: '비해당', unit: 'mg/dL', section: '검사 수치' },
  { id: 'hdl', label: 'HDL 콜레스테롤', value: '비해당', unit: 'mg/dL', section: '검사 수치' },
  { id: 'tg', label: '중성지방', value: '비해당', unit: 'mg/dL', section: '검사 수치' },
  { id: 'ldl', label: 'LDL 콜레스테롤', value: '비해당', unit: 'mg/dL', section: '검사 수치' },
  { id: 'creatinine', label: '혈청 크레아티닌', value: '0.9', unit: 'mg/dL', section: '검사 수치' },
  { id: 'urine_protein', label: '요단백', value: '정상', section: '검사 수치' },
  { id: 'ast', label: 'AST(SGOT)', value: '26', unit: 'IU/L', section: '검사 수치' },
  { id: 'alt', label: 'ALT(SGPT)', value: '36', unit: 'IU/L', section: '검사 수치' },
  { id: 'ggt', label: '감마-GTP', value: '35', unit: 'IU/L', section: '검사 수치' },
];

// ── 약 정보(처방전·복약자료 OCR) ──────────────────────────────────────────
// 백엔드 medication 모듈(스키마: app/schemas/medication_schema.py의 MedicationItem)이
// 내려주는 모양을 그대로 따른다 — 우리가 임의로 필드명을 바꾸면 실제 연동 시 매번 변환이
// 필요해지고 어긋나기 쉬우므로, 백엔드 스키마를 기준으로 프론트 더미 데이터도 맞춘다.
//   dispensed_date  조제일자 (YYYYMMDD)       efficacy_class  약효분류(효능군)
//   product_name    제품명                     ingredient_en   성분명(영문)
//   total_days      총 투약일수                times_per_day   1일 투여 횟수
//   dose_per_time   1회 투여량                 unit            단위
// 프론트는 이걸 efficacy_class(효능군) 기준으로 묶어서 "내가 먹는 약! 한눈에" 형식으로 보여준다.
export type MedicationItem = {
  dispensed_date: string;
  product_name: string;
  efficacy_class: string;
  ingredient_en: string;
  total_days: number | null;
  times_per_day: number | null;
  dose_per_time: string | null;
  unit: string | null;
  drug_code: string | null;
  prescriber: string | null;
  dispenser: string | null;
  safety_alert: string | null;
  antithrombotic: string | null;
};

export const medicationTemplate: MedicationItem[] = [
  { dispensed_date: '20230905', product_name: '아모디핀정 5mg', efficacy_class: '고혈압약', ingredient_en: 'amlodipine', total_days: 30, times_per_day: 1, dose_per_time: '1', unit: '정', drug_code: null, prescriber: null, dispenser: null, safety_alert: null, antithrombotic: null },
  { dispensed_date: '20240312', product_name: '글리메피리드정 2mg', efficacy_class: '당뇨약', ingredient_en: 'glimepiride', total_days: 30, times_per_day: 1, dose_per_time: '1', unit: '정', drug_code: null, prescriber: null, dispenser: null, safety_alert: null, antithrombotic: null },
  { dispensed_date: '20230905', product_name: '리피토정 10mg', efficacy_class: '이상지질혈증약', ingredient_en: 'atorvastatin', total_days: 30, times_per_day: 1, dose_per_time: '1', unit: '정', drug_code: null, prescriber: null, dispenser: null, safety_alert: null, antithrombotic: null },
  { dispensed_date: '20240520', product_name: '큐란정 150mg', efficacy_class: '소화기약', ingredient_en: 'ranitidine', total_days: 14, times_per_day: 2, dose_per_time: '1', unit: '정', drug_code: null, prescriber: null, dispenser: null, safety_alert: null, antithrombotic: null },
];

/** 조제일자(YYYYMMDD) → "YYYY-MM-DD" 표시용 문자열로 변환 */
export function formatDispensedDate(raw: string): string {
  if (raw.length !== 8) return raw;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

/** 1일 투여 횟수·1회 투여량·단위를 묶어 "1일 1회, 1회 1정" 같은 용법 문구로 만든다 */
export function medicationDosageText(item: MedicationItem): string {
  const parts: string[] = [];
  if (item.times_per_day != null) parts.push(`1일 ${item.times_per_day}회`);
  if (item.dose_per_time != null) parts.push(`1회 ${item.dose_per_time}${item.unit ?? ''}`);
  return parts.length > 0 ? parts.join(', ') : '용법 정보 없음';
}

/** 조제일자 + 총 투약일수를 묶어 "2024-03-12 조제 · 30일분" 같은 복용 기간 문구로 만든다 */
export function medicationPeriodText(item: MedicationItem): string {
  const date = formatDispensedDate(item.dispensed_date);
  return item.total_days != null ? `${date} 조제 · ${item.total_days}일분` : `${date} 조제`;
}

export function birthDateFromProfile(profile: UserProfile) {
  const md = profile.birth_md ? String(profile.birth_md).padStart(4, '0') : '0101';
  return `${profile.birth_year}-${md.slice(0, 2)}-${md.slice(2, 4)}`;
}

export function profileBirthFromDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return {
    birth_year: year || undefined,
    birth_md: month && day ? month * 100 + day : undefined,
  };
}

/**
 * 계산기 뜻풀이 — «이 값이 무엇을 보는가» 한 줄.
 *
 * 계산기 행은 제목·값·판정 배지·기준을 보여주는데, 제목이 「AIP 죽상형성지수」·「METS-IR」·
 * 「De Ritis 비」처럼 전부 전문용어라 **숫자가 무엇을 뜻하는지 알 수 없었다.** 신장·간은
 * 카드가 하나의 지표를 다뤄 ②「이 지표는요」가 설명을 맡았지만, 대사·지질(9종)과
 * 심혈관(4종)은 한 카드가 여러 지표를 담아 ② 한 문장으로 덮이지 않는다.
 *
 * ⚠️ 판정이 아니라 **정의**다. 정의는 사람마다 달라지지 않으므로 프론트에 둔다
 * (`metricDefinitions.description`·`cardContent.definition`과 같은 취급).
 * 값·구간·판정 문구는 지금처럼 백엔드 것을 그대로 쓴다.
 *
 * 공식은 여기 쓰지 않는다 — 2뎁스에 공식 금지(스펙 §2-1 축 2). 공식은 「공식과 근거」에 있다.
 */
export const calcGloss: Record<string, string> = {
  // 지질
  non_hdl_c: '혈관에 쌓일 수 있는 콜레스테롤을 모두 합친 양이에요.',
  castelli_1: '전체 콜레스테롤 중 «치우는 쪽»(HDL)이 얼마나 되는지 보는 비율이에요.',
  castelli_2: '쌓는 콜레스테롤과 치우는 콜레스테롤의 균형을 보는 비율이에요.',
  aip: '중성지방과 HDL의 균형 — 혈관에 기름이 끼기 쉬운 상태인지 봐요.',
  // 인슐린저항성
  tyg: '인슐린이 잘 듣고 있는지를 중성지방과 공복혈당으로 가늠해요.',
  mets_ir: '인슐린이 잘 듣고 있는지를 체형까지 함께 넣어 가늠해요.',
  // 내장지방
  lap: '배에 지방이 얼마나 쌓였는지 허리둘레와 중성지방으로 봐요.',
  vai: '내장지방이 제 기능을 하고 있는지 가늠하는 값이에요.',
  // 간
  de_ritis: '간 효소 두 가지의 비율로 손상 원인이 술 쪽인지 가늠해요.',
  alt_ggt: '간 효소의 비율로 술의 영향이 큰 편인지 가늠해요.',
  bard: '간이 굳어가고 있을 가능성을 배제할 수 있는지 보는 점수예요.',
  // 혈압
  map: '심장이 뛰고 쉬는 동안 혈관이 받는 압력을 평균 낸 값이에요.',
  // 심혈관 위험엔진
  prevent: '앞으로 10년·30년 안에 심혈관 질환이 생길 가능성을 추정해요.',
  framingham: '앞으로 10년 안에 심근경색 같은 일이 생길 가능성을 추정해요.',
  score2: '유럽 기준으로 앞으로 10년 안의 심혈관 위험을 추정해요.',
};
