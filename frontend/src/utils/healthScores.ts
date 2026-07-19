import type { ApiComprehensiveReport } from '../api/healthApi';
import type { HealthRecord, MetricKey } from '../data/mockData';
import { evaluateMetric, getMetricValue, isMeasured } from './clinical';

export const mainMetricKeys: MetricKey[] = ['sbp', 'dbp', 'fbs', 'bmi', 'ldl', 'hdl', 'tg', 'alt', 'ggt', 'creatinine'];

export function ageGroupLabel(age?: number | null) {
  if (!age || age < 0) return '연령대 미입력';
  const decade = Math.floor(age / 10) * 10;
  return `${decade}대`;
}

export function managementScore(record: HealthRecord | undefined, comprehensive: ApiComprehensiveReport | null) {
  const apiRiskScore = comprehensive?.summary?.risk_score;
  if (typeof apiRiskScore === 'number' && Number.isFinite(apiRiskScore)) {
    return Math.max(0, Math.min(100, Math.round(100 - apiRiskScore * 6)));
  }
  if (!record) return 0;
  const measured = mainMetricKeys.filter((key) => isMeasured(getMetricValue(record, key)));
  if (!measured.length) return 0;
  const penalty = measured.reduce((sum, key) => {
    const status = evaluateMetric(key, getMetricValue(record, key), record);
    return sum + (status === 'risk' ? 18 : status === 'watch' ? 9 : status === 'low' ? 7 : 0);
  }, 0);
  return Math.max(0, Math.min(100, 100 - Math.round((penalty / measured.length) * 2.4)));
}

export function statusCounts(record: HealthRecord | undefined, comprehensive: ApiComprehensiveReport | null) {
  if (comprehensive?.summary) {
    return {
      normal: comprehensive.summary.normal_count ?? 0,
      watch: comprehensive.summary.warning_count ?? 0,
      risk: comprehensive.summary.risk_count ?? 0,
    };
  }
  if (!record) return { normal: 0, watch: 0, risk: 0 };
  return mainMetricKeys.reduce(
    (acc, key) => {
      const value = getMetricValue(record, key);
      if (!isMeasured(value)) return acc;
      const status = evaluateMetric(key, value, record);
      if (status === 'risk') acc.risk += 1;
      else if (status === 'watch' || status === 'low') acc.watch += 1;
      else acc.normal += 1;
      return acc;
    },
    { normal: 0, watch: 0, risk: 0 },
  );
}
