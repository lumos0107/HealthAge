import { describe, expect, it } from 'vitest';
import { applyGender, metricDefinitions, reports } from './data';
import type { MetricDefinition } from './data';
import { deltaText, estimateRank, formatMetricValue, headline, metricPeerRank, normalBounds, positionTitle, rankFromPercentile, scoreGapNote, scoreGrade, scoreSeries, scoreTrendText, sortByAttention, statusCounts, top3Alerts, yearDelta } from './interpret';

const by = (key: string) => metricDefinitions.find((m) => m.key === key)!;
const withStatus = (m: MetricDefinition, status: MetricDefinition['status']): MetricDefinition => ({ ...m, status });

describe('headline', () => {
  // 호출처(홈 TOP3·검사항목 상세)가 바로 위에 항목명을 띄우므로 문장에 주어를 넣지 않는다.
  it('항목명을 넣지 않는다 — 제목과 두 줄 연속으로 겹치기 때문', () => {
    expect(headline(withStatus(by('bmi'), '위험'), 26.3)).not.toContain('체질량지수');
  });
  it('주의 + 높은 방향이면 "살짝 높아요"', () => {
    // glucose: normalText '70-99', 2024년 값 112 → 살짝 높아요
    expect(headline(withStatus(by('glucose'), '주의'), 112)).toBe('살짝 높아요');
  });
  it('위험이면 "많이 높아요"', () => {
    expect(headline(withStatus(by('waist'), '위험'), 93)).toBe('많이 높아요');
  });
  it('정상이면 "정상 범위예요"', () => {
    expect(headline(withStatus(by('ast'), '정상'), 34)).toBe('정상 범위예요');
  });
  it('낮은 방향(HDL)이 주의면 "살짝 낮아요"', () => {
    expect(headline(withStatus(by('hdl'), '주의'), 39)).toBe('살짝 낮아요');
  });
  it('참고 항목(infoOnly)은 참고용 문구', () => {
    expect(headline(by('height'), 172)).toBe('참고용 수치예요');
  });
});

describe('yearDelta / deltaText', () => {
  it('직전 검진 연도와의 차이를 계산한다', () => {
    // glucose 2024=110, 2022=113 → diff −3 (2020년 바닥 이후 내려가는 중이라 음수다)
    expect(yearDelta(reports, 'glucose', 2024)).toEqual({ diff: -3, prevYear: 2022 });
  });
  it('첫 검진(이전 기록 없음)이면 null', () => {
    // reports의 첫 회차. 앞에 비교할 기록이 없으므로 변화량을 만들지 않는다.
    expect(yearDelta(reports, 'glucose', reports[0].year)).toBeNull();
  });
  it('문장으로 만든다', () => {
    expect(deltaText({ diff: 5, prevYear: 2022 }, 'mg/dL')).toBe('2022년보다 5mg/dL 올랐어요');
    expect(deltaText({ diff: -3.5, prevYear: 2022 }, 'kg/m²')).toBe('2022년보다 3.5kg/m² 내렸어요');
    expect(deltaText({ diff: 0, prevYear: 2022 }, 'mg/dL')).toBe('2022년과 같아요');
  });
});

describe('positionTitle — 2뎁스 ③칸 제목은 비교축에서 파생된다', () => {
  // 규격: 위치는 언제나 «무엇에 대한» 위치다. 제목을 자유 문자열로 두었더니
  // 「이렇게 판정했어요」·「짚어낸 변화」·「남성 50대 · 2009 vs 2024」처럼
  // 서로 다른 종류의 것이 같은 칸에 들어왔다. 축에서 제목을 뽑아 그 갈래를 막는다.
  it('기준 축 하나면 «기준과 비교»', () => {
    expect(positionTitle(['standard'])).toBe('나의 위치 — 기준과 비교');
  });
  it('또래 축 하나면 «또래와 비교»', () => {
    expect(positionTitle(['peer'])).toBe('나의 위치 — 또래와 비교');
  });
  it('연도 축 하나면 «연도별 흐름»', () => {
    expect(positionTitle(['time'])).toBe('나의 위치 — 연도별 흐름');
  });
  it('축이 둘 이상이면 부제 없이 «나의 위치»만', () => {
    // 축을 다 나열하면 제목이 아니라 문장이 된다. 무엇과 비교했는지는 칸 안의
    // 그림이 이미 말하고 있으므로, 제목은 여러 축임을 감추지 않고 침묵한다.
    expect(positionTitle(['standard', 'peer'])).toBe('나의 위치');
    expect(positionTitle(['standard', 'peer', 'time'])).toBe('나의 위치');
  });
  it('축이 없으면 «나의 위치» — 다만 이때 화면은 ③칸 자체를 그리지 않는다', () => {
    // 축이 하나도 없다 = 비교 대상이 없다 = ③이 아니다. 그 내용은 ②나 ④·⑤로 간다.
    expect(positionTitle([])).toBe('나의 위치');
  });
});

describe('metricDefinitions의 status는 최신 회차에서 파생된다', () => {
  // 홈 탭만 metricDefinitions의 status를 «그대로» 쓴다(다른 탭은 metricsForReport로
  // 그 해 statusByKey를 덮어쓴다). 그래서 이 둘이 갈리면 홈에서만 옛 판정이 남아,
  // 데모 수치를 바꿨을 때 홈 TOP3가 조용히 틀린 항목을 가리킨다.
  it('모든 항목이 최신 회차의 statusByKey와 같다', () => {
    const latest = reports[reports.length - 1];
    for (const m of metricDefinitions) {
      expect([m.key, m.status]).toEqual([m.key, latest.statusByKey[m.key]]);
    }
  });
});

describe('top3Alerts / sortByAttention / statusCounts', () => {
  it('위험이 주의보다 먼저, 최대 3개', () => {
    // 2024년 회차의 위험은 BMI 하나뿐이다(허리 88은 기준 안). 나머지 둘은 주의에서 채운다.
    const top = top3Alerts(metricDefinitions);
    expect(top).toHaveLength(3);
    expect(top[0].status).toBe('위험'); // bmi 25.2
    expect(top[1].status).toBe('주의');
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
    // infoOnly(키·체중)는 카운트에서 빠지므로 전체 개수가 아니라 판정 대상 개수와 맞아야 한다.
    expect(c.정상 + c.주의 + c.위험).toBe(metricDefinitions.filter((m) => !m.infoOnly).length);
    expect(c.위험).toBe(1);   // 2024년 위험은 BMI 하나 — 허리둘레는 2020년 바닥 이후 기준 안으로 돌아왔다
  });
});

describe('infoOnly / 등급 표시', () => {
  it('키·체중은 상태 카운트에서 빠진다', () => {
    const c = statusCounts(metricDefinitions);
    expect(c.정상 + c.주의 + c.위험).toBe(metricDefinitions.filter((m) => !m.infoOnly).length);
  });
  it('infoOnly 항목은 TOP3에 오르지 않는다', () => {
    expect(top3Alerts(metricDefinitions).some((m) => m.infoOnly)).toBe(false);
  });
  it('요단백 값은 등급 라벨로 바뀐다', () => {
    const up = metricDefinitions.find((m) => m.key === 'urineProtein')!;
    expect(formatMetricValue(up, 1)).toBe('음성');
    expect(formatMetricValue(up, 3)).toBe('1+');
  });
  it('라벨이 없는 항목은 숫자 그대로', () => {
    const g = metricDefinitions.find((m) => m.key === 'glucose')!;
    expect(formatMetricValue(g, 112)).toBe('112');
  });
});

describe('scoreGrade — 점수 색 경계', () => {
  // 70/40 경계가 홈·분석·히스토리 세 곳에 흩어져 있었다. 한 곳으로 모은 뒤 경계값을 고정한다.
  it('70 이상은 정상, 40~69는 주의, 그 아래는 위험', () => {
    expect([100, 70].map(scoreGrade)).toEqual(['정상', '정상']);
    expect([69, 40].map(scoreGrade)).toEqual(['주의', '주의']);
    expect([39, 22, 0].map(scoreGrade)).toEqual(['위험', '위험', '위험']);
  });
});

describe('scoreSeries / scoreTrendText / scoreGapNote', () => {
  // 점수 추이 히어로용. 검사 항목이 빠진 해를 구분하지 못하면 "검사를 안 받아서
  // 좋아진 것처럼" 보이는 위쪽 꺾임이 생긴다(참고 점수는 판정된 항목만 감점하므로).
  const rep = (year: number, score: number, keys: string[]) => ({
    year, score, date: '', hospital: '', status: '주의' as const, summary: '',
    manageCount: 0, trackCount: 0, values: {} as any,
    statusByKey: Object.fromEntries(keys.map((k) => [k, '정상'])) as any,
  });
  const full = ['sbp', 'dbp', 'ldl', 'hdl'];

  it('연도순으로 정렬하고 항목 수가 최대인 해만 complete', () => {
    const s = scoreSeries([rep(2024, 22, ['sbp', 'dbp']), rep(2020, 70, full), rep(2022, 60, full)]);
    expect(s.map((p) => p.year)).toEqual([2020, 2022, 2024]);
    expect(s.map((p) => p.complete)).toEqual([true, true, false]);
    expect(s[2].judged).toBe(2);
  });

  it('기간은 회차 수가 아니라 첫 해~마지막 해로 센다', () => {
    // 6회차지만 2014~2024 = 10년이다.
    const years = [2014, 2016, 2018, 2020, 2022, 2024];
    const s = scoreSeries(years.map((y, i) => rep(y, 100 - i * 15.6, full)));
    expect(scoreTrendText(s)).toBe('10년간 78점 내려갔어요.');
  });

  it('점수가 올랐으면 올라갔다고 말한다', () => {
    const s = scoreSeries([rep(2022, 40, full), rep(2024, 64, full)]);
    expect(scoreTrendText(s)).toBe('2년간 24점 올라갔어요.');
  });

  it('한 해뿐이면 추이 문장이 없다', () => {
    expect(scoreTrendText(scoreSeries([rep(2024, 22, full)]))).toBeNull();
  });

  // 첫 해와 마지막 해만 비교하면 «내려갔다가 올라온» 흐름을 못 말한다.
  // 데모 페르소나가 정확히 그 모양이다(100 → 22 → 58): 그래프는 V자인데
  // 문장은 "42점 내려갔어요"만 말해, 화면 위아래가 서로 다른 이야기를 했다.
  it('바닥을 찍고 올라왔으면 반등도 함께 말한다', () => {
    const s = scoreSeries([rep(2018, 100, full), rep(2020, 22, full), rep(2022, 40, full), rep(2024, 58, full)]);
    expect(scoreTrendText(s)).toBe('6년간 42점 내려갔지만, 2020년 이후로는 36점 올랐어요.');
  });

  it('바닥이 마지막 해면 반등을 말하지 않는다', () => {
    const s = scoreSeries([rep(2020, 100, full), rep(2022, 60, full), rep(2024, 22, full)]);
    expect(scoreTrendText(s)).toBe('4년간 78점 내려갔어요.');
  });

  it('반등이 1점이면 말하지 않는다 — 흔들림을 추세로 부풀리지 않는다', () => {
    const s = scoreSeries([rep(2020, 100, full), rep(2022, 40, full), rep(2024, 41, full)]);
    expect(scoreTrendText(s)).toBe('4년간 59점 내려갔어요.');
  });

  it('항목이 빠진 해가 있으면 그 사실을 문구로 알린다', () => {
    const s = scoreSeries([rep(2020, 70, full), rep(2022, 82, ['sbp', 'dbp']), rep(2024, 58, full)]);
    expect(scoreGapNote(s)).toContain('2022년은 검사한 항목이 적어');
  });

  it('모든 해가 온전하면 문구가 없다', () => {
    const s = scoreSeries([rep(2022, 70, full), rep(2024, 58, full)]);
    expect(scoreGapNote(s)).toBeNull();
  });
});

describe('normalBounds / rankFromPercentile', () => {
  it('범위형("70-99")은 양쪽 경계', () => {
    expect(normalBounds(by('glucose'))).toEqual({ low: 70, high: 99 });
  });
  it('상한형(허리둘레 "<90")은 결과지 관행대로 하한 0을 채운다', () => {
    expect(normalBounds(by('waist'))).toEqual({ low: 0, high: 90 });
  });
  it('혈압은 저혈압 하한까지 양쪽 경계(수축기 90-119)', () => {
    expect(normalBounds(by('sbp'))).toEqual({ low: 90, high: 119 });
  });
  it('하한형(HDL "남 ≥40")은 normalValue를 low로', () => {
    expect(normalBounds(by('hdl'))).toEqual({ low: 40 });
  });
  it('여성은 applyGender로 치환한 정의를 써야 정상범위가 맞는다', () => {
    const f = (key: string) => applyGender(metricDefinitions, 2).find((m) => m.key === key)!;
    expect(normalBounds(f('waist'))).toEqual({ low: 0, high: 85 });   // 남 90 → 여 85
    expect(normalBounds(f('hdl'))).toEqual({ low: 50 });              // 남 40 → 여 50
    expect(normalBounds(f('ggt'))).toEqual({ low: 8, high: 35 });     // 남 11-63 → 여 8-35
    expect(normalBounds(f('hemoglobin'))).toEqual({ low: 12, high: 16 });
  });
  it('applyGender(남)은 정의를 그대로 둔다', () => {
    expect(applyGender(metricDefinitions, 1)).toBe(metricDefinitions);
  });
  it('성별 기준이 없는 항목은 여성도 그대로', () => {
    const f = applyGender(metricDefinitions, 2).find((m) => m.key === 'glucose')!;
    expect(normalBounds(f)).toEqual({ low: 70, high: 99 });
  });
  it('rank는 1~100으로 clamp', () => {
    expect(rankFromPercentile(0)).toBe(1);
    expect(rankFromPercentile(30.4)).toBe(30);
    expect(rankFromPercentile(150)).toBe(100);
  });
});

describe('estimateRank — percentile 없을 때의 추정 등수', () => {
  it('또래 평균과 같으면 딱 중간(50등)', () => {
    expect(estimateRank(by('bmi'), 24.2)).toBe(50);
  });
  it('높을수록 나쁜 항목은 평균보다 높으면 등수가 뒤로 간다', () => {
    expect(estimateRank(by('bmi'), 26.3)!).toBeGreaterThan(50);
  });
  it('HDL(높을수록 좋음)은 값이 낮을수록 등수가 뒤로 간다', () => {
    expect(estimateRank(by('hdl'), 39)!).toBeGreaterThan(estimateRank(by('hdl'), 60)!);
  });
  it('peerMean 없는 항목(크레아티닌)은 추정하지 않는다', () => {
    expect(estimateRank(by('creatinine'), 1.0)).toBeNull();
  });
});

describe('metricPeerRank — 등수를 말하는 네 화면이 같은 판단을 쓰게 하는 단일 지점', () => {
  it('percentile이 있으면 그걸 쓰고 모집단 분포임을 밝힌다', () => {
    const m = { ...by('bmi'), percentile: 72.4 };
    expect(metricPeerRank(m, 26.3)).toEqual({
      rank: 72,
      measured: true,
      basis: '공단 표본에서 같은 성별·연령대의 분포와 비교한 값이에요.',
    });
  });
  it('percentile이 없으면 추정으로 떨어지고 measured가 false가 된다', () => {
    const r = metricPeerRank(by('bmi'), 24.2);
    expect(r?.rank).toBe(50);
    expect(r?.measured).toBe(false);
    // 근거 문구에 '어림'이 들어가야 추정임이 배지 밖에서도 읽힌다.
    expect(r?.basis).toContain('어림');
  });
  it('추정도 못 하는 항목(peerMean 없음)은 등수를 지어내지 않는다', () => {
    expect(metricPeerRank(by('creatinine'), 1.0)).toBeNull();
  });
});
