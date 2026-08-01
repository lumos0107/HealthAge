import { describe, expect, it } from 'vitest';
import { yearsWithMetric } from './data';
import type { Report } from './data';

/** 검사 항목은 해마다 다 재지 않는다. L2 상세의 연도 칩은 «그 항목을 실제로 잰 해»만 내놓아야 한다 —
 *  안 잰 해를 고를 수 있게 두면 그 해의 MetricDefinition이 없어 상세 화면이 통째로 사라진다. */
function report(year: number, measured: Partial<Record<string, number>>): Report {
  const statusByKey: Record<string, string> = {};
  for (const k of Object.keys(measured)) statusByKey[k] = '정상';
  return {
    year, date: `${year}-03-01`, hospital: 'X', status: '정상', summary: '',
    score: 100, manageCount: 0, trackCount: 0,
    values: measured as Report['values'],
    statusByKey: statusByKey as Report['statusByKey'],
  };
}

describe('yearsWithMetric', () => {
  it('그 항목을 잰 해만 오름차순으로 돌려준다', () => {
    const reports = [
      report(2018, { bmi: 23.9, ldl: 120 }),
      report(2020, { bmi: 24.4 }),
      report(2024, { bmi: 26.3, ldl: 150 }),
    ];
    expect(yearsWithMetric(reports, 'bmi')).toEqual([2018, 2020, 2024]);
    expect(yearsWithMetric(reports, 'ldl')).toEqual([2018, 2024]);
  });

  it('한 해도 재지 않은 항목이면 빈 배열', () => {
    expect(yearsWithMetric([report(2024, { bmi: 26.3 })], 'ggt')).toEqual([]);
  });

  it('기록이 없으면 빈 배열', () => {
    expect(yearsWithMetric([], 'bmi')).toEqual([]);
  });

  it('값이 0이어도 «측정했다»로 센다 — 0은 결측이 아니다', () => {
    expect(yearsWithMetric([report(2024, { ggt: 0 })], 'ggt')).toEqual([2024]);
  });
});
