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
