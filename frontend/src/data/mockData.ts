export type TabKey = 'dashboard' | 'history' | 'records' | 'risk' | 'upload';

export interface HealthRecord {
  id: number;
  year: number;
  examDate: string;
  hospital: string;
  examType: string;
  age: number;
  sex: 'M' | 'F';
  height: number;
  weight: number;
  bmi: number;
  waist: number;
  sbp: number;
  dbp: number;
  fbs: number;
  totalCholesterol: number;
  ldl: number;
  hdl: number;
  tg: number;
  ast: number;
  alt: number;
  ggt: number;
  creatinine: number;
  urineProtein: string;
  summary: string;
  rawFindings: string[];
}

export const metricLabels = {
  bmi: '체질량지수(BMI)',
  waist: '허리둘레',
  sbp: '수축기 혈압',
  dbp: '이완기 혈압',
  fbs: '공복혈당',
  totalCholesterol: '총콜레스테롤',
  ldl: 'LDL-C',
  hdl: 'HDL-C',
  tg: '중성지방',
  ast: 'AST',
  alt: 'ALT',
  ggt: '감마-GTP',
  creatinine: '혈청 크레아티닌',
} as const;

export type MetricKey = keyof typeof metricLabels;

export const metricUnits: Record<MetricKey, string> = {
  bmi: 'kg/m²',
  waist: 'cm',
  sbp: 'mmHg',
  dbp: 'mmHg',
  fbs: 'mg/dL',
  totalCholesterol: 'mg/dL',
  ldl: 'mg/dL',
  hdl: 'mg/dL',
  tg: 'mg/dL',
  ast: 'IU/L',
  alt: 'IU/L',
  ggt: 'IU/L',
  creatinine: 'mg/dL',
};

export const mockRecords: HealthRecord[] = [
  {
    id: 1,
    year: 2021,
    examDate: '2021-09-15',
    hospital: '서울대병원 강남센터',
    examType: '일반 건강검진',
    age: 51,
    sex: 'M',
    height: 173,
    weight: 70.4,
    bmi: 23.5,
    waist: 84,
    sbp: 128,
    dbp: 82,
    fbs: 95,
    totalCholesterol: 195,
    ldl: 125,
    hdl: 48,
    tg: 130,
    ast: 28,
    alt: 31,
    ggt: 42,
    creatinine: 0.88,
    urineProtein: '음성',
    summary: '3개 항목에 주의가 필요합니다',
    rawFindings: ['혈압 관리 참고', '지질 수치 추적'],
  },
  {
    id: 2,
    year: 2023,
    examDate: '2023-09-15',
    hospital: '서울대병원 강남센터',
    examType: '일반 건강검진',
    age: 53,
    sex: 'M',
    height: 173,
    weight: 75.2,
    bmi: 25.1,
    waist: 89,
    sbp: 134,
    dbp: 84,
    fbs: 103,
    totalCholesterol: 209,
    ldl: 139,
    hdl: 42,
    tg: 161,
    ast: 32,
    alt: 39,
    ggt: 55,
    creatinine: 0.94,
    urineProtein: '음성',
    summary: '대사증후군 기준 3개 항목에 해당합니다',
    rawFindings: ['혈당 관리 참고', '체중·복부 관리 참고'],
  },
  {
    id: 3,
    year: 2024,
    examDate: '2024-03-15',
    hospital: '서울대병원 강남센터',
    examType: '일반 건강검진',
    age: 54,
    sex: 'M',
    height: 173,
    weight: 78.7,
    bmi: 26.3,
    waist: 92,
    sbp: 138,
    dbp: 88,
    fbs: 112,
    totalCholesterol: 218,
    ldl: 145,
    hdl: 39,
    tg: 178,
    ast: 34,
    alt: 45,
    ggt: 68,
    creatinine: 1.01,
    urineProtein: '음성',
    summary: '대사증후군 기준 5개 항목에 해당합니다',
    rawFindings: ['추적 관리 권장', '의료진 상담 고려'],
  },
];
