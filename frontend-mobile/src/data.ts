export type TabKey = 'dashboard' | 'records' | 'history' | 'analysis' | 'upload';
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
  // 그 해의 주의/위험 항목 수 — score는 항상 이 값으로부터 계산되어 일치한다.
  manageCount: number;
  trackCount: number;
  values: Record<MetricKey, number>;
  // 그 해 검진에서 항목별로 어떤 상태였는지 — 점수·참고군·상세 화면이 모두 이 값 하나로부터 파생된다(단일 소스).
  // (실제 서비스에서는 GET /reports/{user_id}/{year} 응답의 comprehensive.all_evaluations[]에서 받아온다)
  statusByKey: Record<MetricKey, Status>;
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
  matches: number;
  metrics: string[];
};

export const initialProfile: UserProfile = {
  name: '홍길동',
  gender: 1,
  birth_year: 1974,
  birth_md: 101,
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

function makeReport(base: Pick<Report, 'year' | 'date' | 'hospital' | 'summary' | 'values' | 'statusByKey'>): Report {
  const { score, manageCount, trackCount } = scoreFromStatuses(base.statusByKey);
  const status: Status = trackCount > 0 ? '위험' : manageCount > 0 ? '주의' : '정상';
  return { ...base, score, manageCount, trackCount, status };
}

// 건강검진은 2년에 한 번(만 40세 이상 일반검진 기준) — 2년 단위로 6개년치를 둔다.
// 홍길동(1974년생, 남)이 40세→50세에 걸쳐 대사 지표가 서서히 악화되는 흐름:
// 참고 점수 100 → 88 → 82 → 64 → 40 → 28. 시계열·검진패턴·추세가 한 흐름으로 읽힌다.
export const reports: Report[] = [
  makeReport({
    year: 2014,
    date: '2014-05-20',
    hospital: '한국건강관리협회 서울강남지부',
    summary: '전 항목이 정상 범위로, 현재의 생활습관을 유지하면 좋습니다.',
    values: { sbp: 116, dbp: 74, glucose: 86, bmi: 22.5, waist: 80, ldl: 112, hdl: 54, triglyceride: 104, ast: 23, alt: 25, ggt: 28, hemoglobin: 14.9, creatinine: 0.84 },
    // 감점 없음 → 100
    statusByKey: { sbp: '정상', dbp: '정상', glucose: '정상', bmi: '정상', waist: '정상', ldl: '정상', hdl: '정상', triglyceride: '정상', ast: '정상', alt: '정상', ggt: '정상', hemoglobin: '정상', creatinine: '정상' },
  }),
  makeReport({
    year: 2016,
    date: '2016-06-11',
    hospital: '한국건강관리협회 서울강남지부',
    summary: '혈압과 체중이 정상 상단에 걸치기 시작해 흐름을 지켜봅니다.',
    values: { sbp: 121, dbp: 77, glucose: 91, bmi: 23.3, waist: 82, ldl: 120, hdl: 51, triglyceride: 122, ast: 24, alt: 27, ggt: 33, hemoglobin: 15.0, creatinine: 0.85 },
    // 100 - 6×2 = 88
    statusByKey: { sbp: '주의', dbp: '정상', glucose: '정상', bmi: '주의', waist: '정상', ldl: '정상', hdl: '정상', triglyceride: '정상', ast: '정상', alt: '정상', ggt: '정상', hemoglobin: '정상', creatinine: '정상' },
  }),
  makeReport({
    year: 2018,
    date: '2018-05-30',
    hospital: '한국건강관리협회 서울강남지부',
    summary: '혈압이 이완기까지 올라오고 체중 관리가 필요한 시점입니다.',
    values: { sbp: 125, dbp: 80, glucose: 96, bmi: 23.9, waist: 85, ldl: 129, hdl: 48, triglyceride: 140, ast: 26, alt: 30, ggt: 41, hemoglobin: 15.1, creatinine: 0.87 },
    // 100 - 6×3 = 82
    statusByKey: { sbp: '주의', dbp: '주의', glucose: '정상', bmi: '주의', waist: '정상', ldl: '정상', hdl: '정상', triglyceride: '정상', ast: '정상', alt: '정상', ggt: '정상', hemoglobin: '정상', creatinine: '정상' },
  }),
  makeReport({
    year: 2020,
    date: '2020-07-08',
    hospital: '서울대병원 강남센터',
    summary: '혈당·지질까지 함께 올라 대사 지표를 묶어서 확인합니다.',
    values: { sbp: 129, dbp: 82, glucose: 102, bmi: 24.4, waist: 87, ldl: 134, hdl: 45, triglyceride: 152, ast: 29, alt: 35, ggt: 50, hemoglobin: 15.2, creatinine: 0.89 },
    // 100 - 6×6 = 64
    statusByKey: { sbp: '주의', dbp: '주의', glucose: '주의', bmi: '주의', waist: '정상', ldl: '주의', hdl: '정상', triglyceride: '주의', ast: '정상', alt: '정상', ggt: '정상', hemoglobin: '정상', creatinine: '정상' },
  }),
  makeReport({
    year: 2022,
    date: '2022-06-15',
    hospital: '서울대병원 강남센터',
    summary: '비만·복부비만이 위험 수준에 들어 대사증후군 위험이 커집니다.',
    values: { sbp: 133, dbp: 85, glucose: 107, bmi: 25.2, waist: 90, ldl: 140, hdl: 42, triglyceride: 166, ast: 31, alt: 41, ggt: 59, hemoglobin: 15.3, creatinine: 0.95 },
    // 100 - 6×6 - 12×2 = 40
    statusByKey: { sbp: '주의', dbp: '주의', glucose: '주의', bmi: '위험', waist: '위험', ldl: '주의', hdl: '정상', triglyceride: '주의', ast: '정상', alt: '주의', ggt: '정상', hemoglobin: '정상', creatinine: '정상' },
  }),
  makeReport({
    year: 2024,
    date: '2024-03-15',
    hospital: '서울대병원 강남센터',
    summary: '대사증후군 관련 항목이 여러 개 겹쳐 위험 수준의 확인이 필요합니다.',
    values: { sbp: 138, dbp: 88, glucose: 112, bmi: 26.3, waist: 93, ldl: 145, hdl: 39, triglyceride: 178, ast: 34, alt: 45, ggt: 68, hemoglobin: 15.4, creatinine: 1.01 },
    // 100 - 6×8 - 12×2 = 28
    statusByKey: { sbp: '주의', dbp: '주의', glucose: '주의', bmi: '위험', waist: '위험', ldl: '주의', hdl: '주의', triglyceride: '주의', ast: '정상', alt: '주의', ggt: '주의', hemoglobin: '정상', creatinine: '정상' },
  }),
];

export const latest = reports[reports.length - 1];

export const metricDefinitions: MetricDefinition[] = [
  { key: 'sbp', category: '혈압', name: '수축기 혈압', shortName: '수축기', unit: 'mmHg', normalText: '<120', normalValue: 120, peerMean: 126, status: '주의', description: '심장이 피를 밀어낼 때 혈관에 걸리는 압력입니다.', note: '한 번 높게 나왔다고 바로 판단하지 않고 반복 측정 흐름을 함께 봅니다.' },
  { key: 'dbp', category: '혈압', name: '이완기 혈압', shortName: '이완기', unit: 'mmHg', normalText: '<80', normalValue: 80, peerMean: 79, status: '주의', description: '심장이 쉬는 순간 혈관에 남아 있는 압력입니다.', note: '수축기 혈압과 같이 확인해야 혈압 흐름을 이해하기 쉽습니다.' },
  { key: 'glucose', category: '혈당', name: '공복혈당', shortName: '혈당', unit: 'mg/dL', normalText: '70-99', normalValue: 99, peerMean: 101, status: '주의', description: '식사하지 않은 상태에서 혈액 속 포도당이 어느 정도인지 보는 항목입니다.', note: '식사, 수면, 스트레스 영향을 받을 수 있어 여러 해의 흐름이 중요합니다.' },
  { key: 'bmi', category: '체중·복부', name: '체질량지수(BMI)', shortName: 'BMI', unit: 'kg/m²', normalText: '18.5-22.9', normalValue: 22.9, peerMean: 24.2, status: '위험', description: '키와 체중으로 계산한 체중 상태 참고값입니다.', note: '근육량이 많은 사람은 실제 상태와 다를 수 있어 허리둘레와 함께 봅니다.' },
  { key: 'waist', category: '체중·복부', name: '허리둘레', shortName: '허리', unit: 'cm', normalText: '남 <90 / 여 <85', normalValue: 90, peerMean: 86, status: '위험', description: '복부 비만 여부를 볼 때 참고하는 둘레 수치입니다.', note: '대사증후군 기준과 연결되므로 BMI와 함께 확인합니다.' },
  { key: 'ldl', category: '지질', name: 'LDL-C', shortName: 'LDL', unit: 'mg/dL', normalText: '<130', normalValue: 130, peerMean: 128, status: '주의', description: '혈관 건강 관리에서 자주 확인하는 콜레스테롤 항목입니다.', note: '기저질환이나 복용 약에 따라 목표 기준이 달라질 수 있습니다.' },
  { key: 'hdl', category: '지질', name: 'HDL-C', shortName: 'HDL', unit: 'mg/dL', normalText: '남 ≥40 / 여 ≥50', normalValue: 40, peerMean: 47, status: '주의', description: '흔히 좋은 콜레스테롤이라고 부르며 낮을 때 참고가 필요합니다.', note: '다른 지질 수치와 함께 봐야 전체 흐름을 이해하기 쉽습니다.' },
  { key: 'triglyceride', category: '지질', name: '중성지방', shortName: '중성지방', unit: 'mg/dL', normalText: '<150', normalValue: 150, peerMean: 152, status: '주의', description: '혈액 속 지방 성분 중 하나로 식사와 음주의 영향을 많이 받습니다.', note: '공복 여부와 최근 식습관에 따라 달라질 수 있어 위험이 좋습니다.' },
  { key: 'ast', category: '간 기능', name: 'AST', shortName: 'AST', unit: 'IU/L', normalText: '<40', normalValue: 40, peerMean: 29, status: '정상', description: '간과 근육 세포 상태를 참고할 때 보는 효소 수치입니다.', note: '단독으로 질환을 판단하지 않고 ALT, 감마-GTP와 함께 봅니다.' },
  { key: 'alt', category: '간 기능', name: 'ALT', shortName: 'ALT', unit: 'IU/L', normalText: '<40', normalValue: 40, peerMean: 32, status: '주의', description: '간세포 상태를 참고하는 대표적인 효소 수치입니다.', note: '피로, 음주, 약물 등 여러 요인의 영향을 받을 수 있습니다.' },
  { key: 'ggt', category: '간 기능', name: '감마-GTP', shortName: '감마-GTP', unit: 'IU/L', normalText: '남 11-63 / 여 8-35', normalValue: 63, peerMean: 41, status: '주의', description: '간담도계 상태와 음주 영향을 참고할 때 보는 수치입니다.', note: '음주, 약물, 지방간 등과 함께 해석해야 합니다.' },
  { key: 'hemoglobin', category: '혈액', name: '혈색소', shortName: '혈색소', unit: 'g/dL', normalText: '남 13-17 / 여 12-16', normalValue: 17, peerMean: 14.8, status: '정상', description: '혈액이 산소를 운반하는 능력을 참고하는 항목입니다.', note: '낮거나 높을 때는 다른 혈액검사 결과와 함께 확인합니다.' },
  { key: 'creatinine', category: '신장 기능', name: '혈청 크레아티닌', shortName: '크레아티닌', unit: 'mg/dL', normalText: '기관 기준 확인', normalValue: 1.2, status: '정상', description: '신장 기능을 추정할 때 참고하는 혈액검사 수치입니다.', note: '요청사항에 따라 시계열에는 표시하고 연령대 평균 비교에서는 제외합니다.' },
];

export function metricByKey(key: MetricKey, defs: MetricDefinition[] = metricDefinitions): MetricDefinition {
  return defs.find((m) => m.key === key) ?? metricDefinitions.find((m) => m.key === key)!;
}

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
    .map((m) => ({ ...m, status: report.statusByKey[m.key]! }));
}

export function isBadStatus(status: Status) {
  return status !== '정상';
}

/**
 * 참고 점수 계산: 100점에서 시작해 주의 -6점, 위험 -12점씩 감점.
 * 화면에 보여주는 감점 기준과 항상 일치하도록 단일 함수로 관리한다.
 */
export function computeScore(defs: MetricDefinition[] = metricDefinitions) {
  const manageCount = defs.filter((m) => m.status === '주의').length;
  const trackCount = defs.filter((m) => m.status === '위험').length;
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

const groupDefs = [
  { name: '대사 관리 참고군', keys: ['waist', 'glucose', 'triglyceride', 'hdl', 'sbp'] as MetricKey[], description: '허리둘레, 혈당, 지질, 혈압 항목이 함께 겹칠 때 먼저 확인하는 그룹입니다.', meaning: '대사증후군 기준과 가까운 항목을 묶어 보는 참고군입니다.', related: '복부비만, 혈당 상승, 혈압 상승, 중성지방 상승, HDL 저하와 관련해 볼 수 있습니다.' },
  { name: '혈압 관리 참고군', keys: ['sbp', 'dbp'] as MetricKey[], description: '수축기와 이완기 혈압 흐름을 우선 살펴보는 그룹입니다.', meaning: '혈압 수치가 반복해서 기준을 벗어나는지 확인하는 참고군입니다.', related: '두통, 어지럼, 혈관 부담과 관련해 상담이 필요할 수 있지만 증상 없이 나타나기도 합니다.' },
  { name: '지질 관리 참고군', keys: ['ldl', 'hdl', 'triglyceride'] as MetricKey[], description: '콜레스테롤과 중성지방 항목을 묶어서 보는 그룹입니다.', meaning: '혈관 건강과 관련된 지질 수치를 함께 보는 참고군입니다.', related: 'LDL 상승, HDL 저하, 중성지방 상승은 심혈관 위험 요인과 함께 확인합니다.' },
  { name: '간 기능 관찰군', keys: ['ast', 'alt', 'ggt'] as MetricKey[], description: '간 효소 수치가 생활습관, 약물, 음주와 함께 영향을 받을 수 있는 그룹입니다.', meaning: '간세포나 간담도계 상태를 참고하는 효소 수치를 묶은 그룹입니다.', related: '음주, 약물, 피로, 지방간 가능성 등 여러 요인과 함께 확인합니다.' },
  { name: '신장 기능 관찰군', keys: ['creatinine'] as MetricKey[], description: '혈청 크레아티닌 흐름을 따로 추적하는 그룹입니다.', meaning: '신장 기능 추정에 쓰이는 혈청 크레아티닌을 관찰하는 참고군입니다.', related: '신장 기능 변화는 eGFR 계산과 함께 확인하며 평균 비교에는 사용하지 않습니다.' },
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
