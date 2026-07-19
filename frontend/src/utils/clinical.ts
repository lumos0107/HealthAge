import type { HealthRecord, MetricKey } from '../data/mockData';

export type ClinicalStatus = 'normal' | 'watch' | 'risk' | 'low' | 'unmeasured';

export type NormalRange = {
  label: string;
  min?: number;
  max?: number;
  status: (value: number, record?: HealthRecord) => ClinicalStatus;
  info: string;
  lowNote?: string;
};

const sex = (record?: HealthRecord) => record?.sex ?? 'M';

export const normalRanges: Record<MetricKey, NormalRange> = {
  bmi: {
    label: '18.5-22.9',
    min: 18.5,
    max: 22.9,
    status: (value) => (value < 18.5 ? 'low' : value < 23 ? 'normal' : value < 25 ? 'watch' : 'risk'),
    info: '키와 체중을 함께 보아 체중 상태를 참고하는 값입니다. 한국 기준에서는 23 이상부터 체중 관리가 권장될 수 있습니다.',
    lowNote: 'BMI가 낮게 나오면 영양 상태나 근감소 가능성도 함께 확인하는 것이 좋습니다.',
  },
  waist: {
    label: '남 <90 / 여 <85',
    status: (value, record) => (value < (sex(record) === 'F' ? 85 : 90) ? 'normal' : 'watch'),
    info: '복부비만 여부를 보는 참고 수치입니다. 대사증후군 판단에 함께 쓰일 수 있습니다.',
  },
  sbp: {
    label: '<120',
    max: 119,
    status: (value) => (value < 90 ? 'low' : value < 120 ? 'normal' : value < 140 ? 'watch' : 'risk'),
    info: '심장이 수축할 때의 혈압입니다. 한 번의 결과만으로 판단하지 않고 반복 측정과 증상 확인이 필요합니다.',
    lowNote: '수축기 혈압 90 미만은 어지럼, 탈수, 약물 영향 등을 함께 확인하는 것이 좋습니다.',
  },
  dbp: {
    label: '<80',
    max: 79,
    status: (value) => (value < 60 ? 'low' : value < 80 ? 'normal' : value < 90 ? 'watch' : 'risk'),
    info: '심장이 이완할 때의 혈압입니다. 수축기 혈압과 함께 해석합니다.',
    lowNote: '이완기 혈압 60 미만은 증상 여부를 함께 확인하는 것이 좋습니다.',
  },
  fbs: {
    label: '70-99',
    min: 70,
    max: 99,
    status: (value) => (value < 70 ? 'low' : value < 100 ? 'normal' : value < 126 ? 'watch' : 'risk'),
    info: '공복 상태의 혈당입니다. 100 이상이면 생활습관 관리와 추적 확인이 권장될 수 있습니다.',
    lowNote: '70 미만은 저혈당 가능성이 있어 증상이 있으면 의료진 상담이 필요합니다.',
  },
  totalCholesterol: {
    label: '<200',
    max: 199,
    status: (value) => (value < 120 ? 'low' : value < 200 ? 'normal' : value < 240 ? 'watch' : 'risk'),
    info: '혈액 안의 전체 콜레스테롤 양입니다. LDL, HDL, 중성지방과 함께 보는 것이 중요합니다.',
  },
  ldl: {
    label: '<130',
    max: 129,
    status: (value) => (value < 130 ? 'normal' : value < 160 ? 'watch' : 'risk'),
    info: '흔히 나쁜 콜레스테롤로 부릅니다. 흡연, 혈압, 가족력 등에 따라 목표 기준이 달라질 수 있습니다.',
  },
  hdl: {
    label: '남 >=40 / 여 >=50',
    status: (value, record) => (value >= (sex(record) === 'F' ? 50 : 40) ? 'normal' : 'watch'),
    info: '흔히 좋은 콜레스테롤로 부릅니다. 낮을수록 관리 참고 항목이 될 수 있습니다.',
    lowNote: 'HDL은 높을수록 좋은 방향으로 해석되는 경우가 많습니다.',
  },
  tg: {
    label: '<150',
    max: 149,
    status: (value) => (value < 150 ? 'normal' : value < 200 ? 'watch' : 'risk'),
    info: '중성지방은 식사, 음주, 체중 변화의 영향을 받을 수 있습니다.',
  },
  ast: {
    label: '<40',
    max: 39,
    status: (value) => (value < 40 ? 'normal' : value <= 80 ? 'watch' : 'risk'),
    info: '간 기능을 참고하는 효소 수치입니다. 근육 손상 등 다른 원인으로도 변할 수 있습니다.',
  },
  alt: {
    label: '<40',
    max: 39,
    status: (value) => (value < 40 ? 'normal' : value <= 80 ? 'watch' : 'risk'),
    info: '간세포 손상 여부를 참고하는 효소입니다. 단일 수치만으로 지방간을 판단하지 않습니다.',
  },
  ggt: {
    label: '남 11-63 / 여 8-35',
    status: (value, record) => {
      const max = sex(record) === 'F' ? 35 : 63;
      if (value <= max) return 'normal';
      return value >= 75 ? 'risk' : 'watch';
    },
    info: '간담도계와 음주 영향 등을 참고할 수 있는 수치입니다. 다른 간 수치와 함께 봅니다.',
  },
  creatinine: {
    label: '대략 0.6-1.3',
    min: 0.6,
    max: 1.3,
    status: (value) => (value < 0.6 ? 'low' : value <= 1.3 ? 'normal' : 'watch'),
    info: '신장 기능을 참고하는 수치입니다. eGFR 같은 추가 계산과 함께 해석하는 것이 더 정확합니다.',
  },
};

export function isMeasured(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function statusLabel(status: ClinicalStatus) {
  return {
    normal: '정상 기준 안',
    watch: '관리 참고',
    risk: '추적 관리 권장',
    low: '낮게 측정',
    unmeasured: '미측정',
  }[status];
}

export function statusTone(status: ClinicalStatus) {
  return {
    normal: 'border-teal-200 bg-teal-50 text-teal-800',
    watch: 'border-amber-200 bg-amber-50 text-amber-800',
    risk: 'border-rose-200 bg-rose-50 text-rose-800',
    low: 'border-sky-200 bg-sky-50 text-sky-800',
    unmeasured: 'border-slate-200 bg-slate-50 text-slate-500',
  }[status];
}

export function evaluateMetric(key: MetricKey, value: number, record?: HealthRecord) {
  if (!isMeasured(value)) return 'unmeasured' as ClinicalStatus;
  return normalRanges[key].status(value, record);
}

export function getMetricValue(record: HealthRecord, key: MetricKey) {
  return record[key] as number;
}
