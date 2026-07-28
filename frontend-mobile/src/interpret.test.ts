import { describe, expect, it } from 'vitest';
import { metricDefinitions, reports } from './data';
import type { MetricDefinition } from './data';
import { deltaText, headline, normalBounds, rankFromPercentile, sortByAttention, statusCounts, top3Alerts, yearDelta } from './interpret';

const by = (key: string) => metricDefinitions.find((m) => m.key === key)!;
const withStatus = (m: MetricDefinition, status: MetricDefinition['status']): MetricDefinition => ({ ...m, status });

describe('headline', () => {
  it('주의 + 높은 방향이면 "살짝 높아요"', () => {
    // glucose: normalText '70-99', 2024년 값 112 → 살짝 높아요
    expect(headline(withStatus(by('glucose'), '주의'), 112)).toBe('공복혈당이 살짝 높아요');
  });
  it('위험이면 "많이 높아요"', () => {
    expect(headline(withStatus(by('waist'), '위험'), 93)).toBe('허리둘레가 많이 높아요');
  });
  it('정상이면 "정상 범위예요"', () => {
    expect(headline(withStatus(by('ast'), '정상'), 34)).toBe('AST가 정상 범위예요');
  });
  it('낮은 방향(HDL)이 주의면 "살짝 낮아요"', () => {
    expect(headline(withStatus(by('hdl'), '주의'), 39)).toBe('HDL-C가 살짝 낮아요');
  });
});

describe('yearDelta / deltaText', () => {
  it('직전 검진 연도와의 차이를 계산한다', () => {
    // glucose 2024=112, 2022=107 → diff +5
    expect(yearDelta(reports, 'glucose', 2024)).toEqual({ diff: 5, prevYear: 2022 });
  });
  it('첫 검진(이전 기록 없음)이면 null', () => {
    expect(yearDelta(reports, 'glucose', 2014)).toBeNull();
  });
  it('문장으로 만든다', () => {
    expect(deltaText({ diff: 5, prevYear: 2022 }, 'mg/dL')).toBe('2022년보다 5mg/dL 올랐어요');
    expect(deltaText({ diff: -3.5, prevYear: 2022 }, 'kg/m²')).toBe('2022년보다 3.5kg/m² 내렸어요');
    expect(deltaText({ diff: 0, prevYear: 2022 }, 'mg/dL')).toBe('2022년과 같아요');
  });
});

describe('top3Alerts / sortByAttention / statusCounts', () => {
  it('위험이 주의보다 먼저, 최대 3개', () => {
    const top = top3Alerts(metricDefinitions);
    expect(top).toHaveLength(3);
    expect(top[0].status).toBe('위험'); // bmi
    expect(top[1].status).toBe('위험'); // waist
    expect(top[2].status).toBe('주의');
  });
  it('정상만 있으면 빈 배열', () => {
    expect(top3Alerts(metricDefinitions.map((m) => withStatus(m, '정상')))).toHaveLength(0);
  });
  it('sortByAttention은 위험→주의→정상, 같은 상태끼리는 원래 순서 유지', () => {
    const sorted = sortByAttention(metricDefinitions);
    expect(sorted[0].status).toBe('위험');
    expect(sorted[sorted.length - 1].status).toBe('정상');
  });
  it('statusCounts', () => {
    const c = statusCounts(metricDefinitions);
    expect(c.정상 + c.주의 + c.위험).toBe(metricDefinitions.length);
    expect(c.위험).toBe(2);
  });
});

describe('normalBounds / rankFromPercentile', () => {
  it('범위형("70-99")은 양쪽 경계', () => {
    expect(normalBounds(by('glucose'))).toEqual({ low: 70, high: 99 });
  });
  it('상한형("<120")은 high만', () => {
    expect(normalBounds(by('sbp'))).toEqual({ high: 120 });
  });
  it('하한형(HDL "남 ≥40 / 여 ≥50")은 normalValue를 low로', () => {
    expect(normalBounds(by('hdl'))).toEqual({ low: 40 });
  });
  it('rank는 1~100으로 clamp', () => {
    expect(rankFromPercentile(0)).toBe(1);
    expect(rankFromPercentile(30.4)).toBe(30);
    expect(rankFromPercentile(150)).toBe(100);
  });
});
