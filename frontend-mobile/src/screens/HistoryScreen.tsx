import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Pressable, ScrollView, Text, View } from 'react-native';
import { Circle, G, Line, Path, Rect, Svg, Text as SvgText } from 'react-native-svg';
import { Eyebrow, FadeInUp, T } from '../components/UI';
import { NORMAL_BAND, PeerRankSlider, Sparkline, scoreTone, SummaryCard } from '../components/v2';
import { cardContent, isBadStatus, metricLabel, metricsForReport } from '../data';
import { estimateRank, normalBounds, rankFromPercentile, scoreGapNote, scoreSeries, scoreTrendText, subjectJosa, topicJosa } from '../interpret';
import type { MetricDefinition, MetricKey, Report } from '../data';
import type { RealTimeseries } from '../health';

type Highlight = NonNullable<RealTimeseries['highlights']>[number];
type Insight = NonNullable<RealTimeseries['insight']>;
type ChangePace = NonNullable<RealTimeseries['change_pace']>[number];


// 묶음의 '대표 항목'을 고르는 순서 — 가장 나쁜 상태를 대표로 삼는다.
const ATTENTION: Record<string, number> = { 위험: 0, 주의: 1, 정상: 2 };

const SCREEN_W = Dimensions.get('window').width;
const CHART_W = SCREEN_W - 32 - 40; // 16px card margin + 20px card padding, each side
const CHART_H = 180;
const PAD = { top: 12, right: 16, bottom: 30, left: 44 };
const PLOT_W = CHART_W - PAD.left - PAD.right;
const PLOT_H = CHART_H - PAD.top - PAD.bottom;

// 그래프 라인 컬러 — 정상/주의/위험(초록/주황/빨강)과 절대 겹치지 않도록,
// 그 세 가지 상태색과는 무관한 톤(블루·퍼플·인디고·틸·브라운 — Material 팔레트의 실제 색)만 골라 썼다.
// 그래야 그래프 색이 상태색으로 오인되지 않고, 항목 구분 색이라는 것이 한눈에 분명해진다.
const LINE_COLORS = ['#1E88E5', '#8E24AA', '#3949AB', '#00897B', '#6D4C41'];

// 키는 성인에서 사실상 변하지 않는 참고값, 요단백은 등급형(음성/1+…)이라 선그래프가 어울리지 않아 제외한다.
const chartGroups: { title: string; keys: MetricKey[] }[] = [
  { title: '혈압', keys: ['sbp', 'dbp'] },
  { title: '혈당·체중', keys: ['glucose', 'bmi', 'waist', 'weight'] },
  { title: '지질', keys: ['ldl', 'hdl', 'triglyceride', 'totalCholesterol'] },
  { title: '간 기능', keys: ['ast', 'alt', 'ggt'] },
  { title: '혈액·신장', keys: ['hemoglobin', 'creatinine'] },
];

export default function HistoryScreen({ reports, metricDefinitions, usingRealData, highlights, insight, changePace }: {
  reports: Report[];
  metricDefinitions: MetricDefinition[];
  usingRealData?: boolean;
  highlights?: Highlight[] | null;
  insight?: Insight | null;
  changePace?: ChangePace[] | null;
}) {
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false} style={{ backgroundColor: T.bg }}>

      {/* 페이지 헤더 — 제목이 이미 말하는 설명문은 두지 않는다(첫 화면을 텍스트로 막지 않기 위해). */}
      <View style={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 12 }}>
        <Eyebrow>HISTORY</Eyebrow>
        <Text style={{ fontSize: 26, fontWeight: '800', fontFamily: T.fontDisplay, color: T.text1, letterSpacing: -0.5, marginTop: 6 }}>히스토리</Text>
      </View>

      {/* 점수 추이 히어로 — "추이" 탭의 첫 화면에 그림이 하나도 없던 문제를 여기서 해결한다. */}
      <ScoreTrendHero reports={reports} />

      {/* 종합 인사이트 — 1뎁스는 생성한 한 줄, 백엔드 자연어 전문과 우려 Top3는 2뎁스로.
          (다른 카드들과 같은 방식으로 요약을 만든다 — 자연어를 잘라 "…"를 붙이지 않는다.) */}
      {!!insight?.summary && (
        <FadeInUp delay={10}>
        <SummaryCard
          title="한눈에 요약"
          summary={[
            insight.top_concerns?.length ? `우려 ${insight.top_concerns.length}건` : null,
            insight.next_exam_year != null ? `다음 검진 ${insight.next_exam_year}년` : null,
          ].filter(Boolean).join(' · ') || '여러 해 기록을 종합했어요.'}
          definition="여러 해의 검진 기록을 한꺼번에 읽어 가장 먼저 볼 것을 골라낸 요약이에요."
          positionTitle="종합 요약"
        >
          <Text style={{ fontSize: 14, color: T.text2, lineHeight: 22 }}>{insight.summary}</Text>
          {!!insight.top_concerns?.length && (
            <View style={{ marginTop: 12 }}>
              {insight.top_concerns.map((c, i) => {
                const col = c.level === 'high' ? T.danger : T.warn;
                const bg = c.level === 'high' ? T.dangerBg : T.warnBg;
                return (
                  <View key={i} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: T.divider }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <View style={{ backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: T.radiusPill }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: col }}>주의 {i + 1}</Text>
                      </View>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: T.text1, flex: 1 }}>{c.title}</Text>
                      {!!c.current_value && <Text style={{ fontSize: 12, color: T.text3 }}>{c.current_value}</Text>}
                    </View>
                    <Text style={{ fontSize: 13, color: T.text2, lineHeight: 19 }}>{c.details}</Text>
                  </View>
                );
              })}
            </View>
          )}
          {insight.next_exam_year != null && (
            <Text style={{ fontSize: 12, color: T.text3, marginTop: 10 }}>다음 검진 권장: {insight.next_exam_year}년</Text>
          )}
        </SummaryCard>
        </FadeInUp>
      )}

      {/* 또래 대비 변화 '속도' — 공단 표본의 같은 성별·연령대 평균 변화량과 내 변화 폭을 배수로 비교.
          배수는 또래 변화가 뚜렷할 때만(±0.5 이상) 나온다 — 0에 가까운 값으로 나누면 배수가 발산하므로. */}
      {!!changePace?.length && (
        <FadeInUp delay={15}>
        <SummaryCard
          title="또래 대비 변화 속도"
          summary={`${changePace.length}개 항목이 또래 평균보다 빠르게 나빠지고 있어요.`}
          definition={cardContent['또래 대비 변화 속도'].definition}
          detail={cardContent['또래 대비 변화 속도'].detail}
          meaning={cardContent['또래 대비 변화 속도'].meaning}
          tips={cardContent['또래 대비 변화 속도'].tips}
          positionTitle="나의 위치 — 또래 평균과 비교"
        >
          <Text style={{ fontSize: 13, color: T.text2, marginBottom: 12 }}>같은 성별·연령대의 평균 변화와 내 변화 폭을 비교했어요. 악화 방향만 모았어요.</Text>
          <View style={{ gap: 8 }}>
            {changePace!.map((p, i) => {
              // 2배 이상이면 빨강, 그 아래는 주황. 배수를 못 낸 항목은 중립 회색으로 둔다.
              const strong = (p.pace.ratio ?? 0) >= 2;
              const badgeColor = p.pace.ratio == null ? T.text3 : strong ? T.danger : T.warn;
              const badgeBg = p.pace.ratio == null ? T.cardAlt : strong ? T.dangerBg : T.warnBg;
              return (
                <View key={i} style={[{ paddingVertical: 10 }, i < changePace!.length - 1 && { borderBottomWidth: 1, borderBottomColor: T.divider }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <View style={{ backgroundColor: badgeBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: T.radiusPill }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: badgeColor }}>
                        {p.pace.ratio != null ? `또래의 ${p.pace.ratio}배` : '또래와 다른 방향'}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: T.text1 }}>{metricLabel(p.metric)}</Text>
                    {p.span_years != null && (
                      <Text style={{ fontSize: 11, color: T.text3 }}>{p.span_years}년간</Text>
                    )}
                  </View>
                  <Text style={{ fontSize: 13, color: T.text2, lineHeight: 19 }}>{p.pace.text}</Text>
                </View>
              );
            })}
          </View>
          <Text style={{ fontSize: 11, color: T.text3, lineHeight: 17, marginTop: 10 }}>
            기준: 건강보험공단 검진 표본의 성별·연령대별 평균 변화량. 위험도 예측이 아니라 변화 폭 비교예요.
            배수는 <Text style={{ fontWeight: '700' }}>평균과의 비교</Text>라서 또래 안에서도 개인차가 큰 점은 담기지 않아요.
          </Text>
        </SummaryCard>
        </FadeInUp>
      )}

      {/* 시계열 분석 하이라이트 — 백엔드가 연도별 추세를 분석해 실제로 짚어준 변화만 보여준다(2년 미만 기록이면 비어있음) */}
      {!!highlights?.length && (
        <FadeInUp delay={20}>
        <SummaryCard
          title="주목할 만한 변화"
          summary={`여러 해 기록에서 짚어낸 변화가 ${highlights.length}건 있어요.`}
          definition={cardContent['주목할 만한 변화'].definition}
          detail={cardContent['주목할 만한 변화'].detail}
          meaning={cardContent['주목할 만한 변화'].meaning}
          positionTitle="짚어낸 변화"
        >
          <Text style={{ fontSize: 13, color: T.text2, marginBottom: 12 }}>여러 해의 기록을 비교해 시스템이 짚어낸 변화예요.</Text>
          <View style={{ gap: 8 }}>
            {highlights!.map((h, i) => {
              const sevColor = h.severity === 'high' ? T.danger : T.warn;
              const sevBg = h.severity === 'high' ? T.dangerBg : T.warnBg;
              return (
                <View key={i} style={[{ paddingVertical: 10 }, i < highlights!.length - 1 && { borderBottomWidth: 1, borderBottomColor: T.divider }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <View style={{ backgroundColor: sevBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: T.radiusPill }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: sevColor }}>{h.type}</Text>
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: T.text1 }}>{metricLabel(h.metric)}</Text>
                  </View>
                  <Text style={{ fontSize: 13, color: T.text2, lineHeight: 19 }}>{h.message}</Text>
                </View>
              );
            })}
          </View>
        </SummaryCard>
        </FadeInUp>
      )}

      {/* 차트 카드들 — 살짝 떠오르며 순서대로 나타나서 화면이 한 번에 딱딱하게 뜨지 않도록 한다 */}
      {chartGroups.map((group, i) => (
        <FadeInUp key={group.title} delay={i * 90}>
          <ChartCard group={group} reports={reports} metricDefinitions={metricDefinitions} />
        </FadeInUp>
      ))}

      {/* 면책 — 첫 화면을 막지 않도록 맨 아래에 회색 한 줄로 둔다.
          (항목별 설명은 검사항목 탭 상세와 완전히 겹쳐 삭제했다 — description·note는 거기에 그대로 있다.) */}
      <Text style={{ fontSize: 12, color: T.text3, lineHeight: 18, paddingHorizontal: 20, paddingTop: 16 }}>
        수치 변화는 생활습관, 복용 약, 검사 당시 상태에 따라 달라질 수 있습니다. 같은 항목이 반복해서 기준을 벗어나면 의료진과 상담해 보세요.
      </Text>
    </ScrollView>
  );
}

/** 점수 추이 히어로 — 히스토리 첫 화면의 그림. 격자·Y축 없이 선과 끝점만.
 *
 * 검사 항목이 빠진 해는 점선 + 빈 동그라미로 그린다. 참고 점수는 판정된 항목만 감점하므로
 * 지질검사가 없던 해는 점수가 높게 나오는데, 각주만으로는 선의 기울기를 되돌릴 수 없다.
 * 기울기 자체가 단서를 갖게 해야 "검사를 안 받아서 좋아진 것처럼" 읽히지 않는다.
 */
function ScoreTrendHero({ reports }: { reports: Report[] }) {
  const series = useMemo(() => scoreSeries(reports), [reports]);
  if (series.length < 2) return null;   // 한 해뿐이면 추이가 아니다 — 홈 히어로가 이미 그 해를 말한다

  const H = 120;
  const pad = { top: 14, right: 18, bottom: 26, left: 18 };
  const plotW = CHART_W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  // Y축은 항상 0~100 고정 — 점수는 절대 척도라 데이터에 맞춰 줌하면 낙폭이 과장된다.
  const x = (i: number) => pad.left + (i / (series.length - 1)) * plotW;
  const y = (s: number) => pad.top + (1 - s / 100) * plotH;

  const last = series[series.length - 1];
  // 선은 중립 회색, 판단은 마지막 점에만 — 추이는 사실이고 판단은 현재값이다.
  // 브랜드 초록으로 그렸을 때 100->22로 내려가는 선이 "좋아지는 중"으로 읽혔고,
  // 같은 22점을 홈은 빨강 배지로 말해 색 메시지가 서로 반대였다.
  const lastColor = scoreTone(last.score).color;
  const trend = scoreTrendText(series);
  const gapNote = scoreGapNote(series);

  return (
    <FadeInUp delay={0}>
    <View style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16, marginBottom: 8 }}>
      <Text style={{ fontSize: 16, fontWeight: '700', color: T.text1 }}>참고 점수 추이</Text>
      <Svg width={CHART_W} height={H}>
        {/* 구간별로 선을 그린다 — 한쪽이라도 항목이 빠진 해면 점선으로. */}
        {series.slice(1).map((p, i) => {
          const prev = series[i];
          const partial = !p.complete || !prev.complete;
          return (
            <Line
              key={p.year}
              x1={x(i)} y1={y(prev.score)} x2={x(i + 1)} y2={y(p.score)}
              // 실선은 진한 회색, 미완 구간은 연한 회색 점선 — 회색끼리도 톤이 갈려야 구분된다.
              stroke={partial ? T.text3 : T.text2}
              strokeWidth={2.5}
              strokeDasharray={partial ? '4 4' : undefined}
              strokeLinecap="round"
            />
          );
        })}
        {series.map((p, i) => (
          <Circle
            key={p.year}
            cx={x(i)} cy={y(p.score)} r={i === series.length - 1 ? 5 : 3.5}
            // 항목이 빠진 해는 빈 동그라미 — 값이 온전하지 않다는 표시.
            // 상태색은 마지막 점에만 준다(과거 점까지 칠하면 그 해의 판단으로 읽힌다).
            fill={p.complete ? (i === series.length - 1 ? lastColor : T.text2) : '#fff'}
            stroke={p.complete ? '#fff' : T.text3}
            strokeWidth={p.complete ? 1.5 : 2}
          />
        ))}
        {/* 마지막 점 값만 적는다 — 나머지는 축 라벨로 위치를 짐작하게 둔다. */}
        <SvgText x={x(series.length - 1) - 6} y={y(last.score) - 12} fontSize={15} fontWeight="800" fill={lastColor} textAnchor="end">
          {last.score}
        </SvgText>
        {/* X축은 첫 해·마지막 해만 — 중간 라벨은 숫자만 늘리고 읽히지 않는다. */}
        <SvgText x={x(0)} y={H - 6} fontSize={11} fill={T.text3} textAnchor="start">{series[0].year}</SvgText>
        <SvgText x={x(series.length - 1)} y={H - 6} fontSize={11} fill={T.text3} textAnchor="end">{last.year}</SvgText>
      </Svg>
      {!!trend && <Text style={{ fontSize: 13, color: T.text2, lineHeight: 19 }}>{trend}</Text>}
      {!!gapNote && <Text style={{ fontSize: 11, color: T.text3, lineHeight: 17, marginTop: 6 }}>{gapNote}</Text>}
    </View>
    </FadeInUp>
  );
}

/** swapKey가 바뀔 때마다 살짝 사라졌다 나타나며 내용이 갱신된다 — 값이 뚝 끊겨 바뀌는 느낌을 없앤다 */
function FadeSwap({ children, swapKey }: { children: React.ReactNode; swapKey: number | string }) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    anim.setValue(0.35);
    Animated.timing(anim, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [swapKey]);
  return <Animated.View style={{ opacity: anim }}>{children}</Animated.View>;
}

/** 1뎁스 요약 한 줄 — 여기서 끝내도 되는 '답'이어야 한다.
 * 검진 수치를 모르는 라이트 유저 기준으로 ① 뭘 보는 묶음인지 ② 어떻게 변했는지 ③ 지금 상태가 뭔지를 한 문장에 담는다.
 * (①은 카드 제목이 이미 말해주므로 문장에는 ②+③만 넣는다 — 제목과 겹쳐 읽히면 장황해진다.) */
function groupSummary(leadKey: MetricKey | null, reports: Report[], metricDefinitions: MetricDefinition[]): string | null {
  const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  // '대표 항목'(=1뎁스 스파크라인이 그리는 항목)의 변화만 말한다.
  // 예전에는 상대 변화폭이 가장 큰 항목을 골랐는데, 그러면 문장은 A 항목을 말하고
  // 배지·스파크라인·2뎁스 밴드는 B 항목을 가리켜 카드 하나가 서로 다른 걸 말했다.
  //
  // "지금은 주의가 필요한 항목이 있어요" 같은 현재 상태 문장은 붙이지 않는다 —
  // 오른쪽 배지가 이미 같은 말을 하고, 그 때문에 카드 5장이 전부 2줄이 되어
  // 위쪽 한 줄 카드들과 스캔 리듬이 끊겼다. 상태는 배지가 담당한다(정상도 배지로).
  if (!leadKey) return null;
  const pts = reports.map((r) => ({ year: r.year, v: r.values[leadKey] })).filter((p) => isFiniteNum(p.v));
  const m = metricDefinitions.find((d) => d.key === leadKey);
  if (pts.length < 2 || !m) return null;   // 비교할 해가 없으면 배지만 남긴다

  const delta = pts[pts.length - 1].v - pts[0].v;
  const rel = Math.abs(delta) / (Math.abs(pts[0].v) || 1);
  if (rel < 0.05) return `${m.shortName}${topicJosa(m.shortName)} 큰 변화 없이 비슷한 수준이에요.`;
  const amount = Math.round(Math.abs(delta) * 10) / 10;
  return `${pts[0].year}년 이후 ${m.shortName}${subjectJosa(m.shortName)} ${amount}${m.unit} ${delta > 0 ? '올랐어요' : '내렸어요'}.`;
}

function ChartCard({ group, reports, metricDefinitions }: { group: { title: string; keys: MetricKey[] }; reports: Report[]; metricDefinitions: MetricDefinition[] }) {
  const [selIdx, setSelIdx] = useState(reports.length - 1);
  const r = reports[selIdx];
  // 선택한 연도 기준으로 항목 상태를 다시 계산한다 — 연도를 바꾸면 "주의 포함" 표시도 함께 바뀐다.
  const yearMetrics = useMemo(() => metricsForReport(r, metricDefinitions), [r, metricDefinitions]);
  const metricByKeyForYear = (k: MetricKey) => yearMetrics.find((m) => m.key === k);
  // 이 그룹의 항목 중 그 해에 실제로 측정된 것만 추린다 — 검사하지 않은 항목을 측정한 것처럼
  // 그래프나 범례에 끼워 넣으면 사실과 다른 정보가 된다.
  const presentKeys = group.keys.filter((k) => !!metricByKeyForYear(k));
  // 이 묶음의 대표 항목 = 가장 주의가 필요한 항목. 2뎁스의 밴드·등수 기본값이 된다(선택 연도 기준).
  const leadMetric = presentKeys.map((k) => metricByKeyForYear(k)!).sort((a, b) => ATTENTION[a.status] - ATTENTION[b.status])[0];

  // 1뎁스(요약 문장 + 스파크라인)는 **항상 최신 연도** 기준으로 고른다.
  // 2뎁스에서 연도 칩을 바꾸면 selIdx가 남아 있어, 그걸 쓰면 모달을 닫은 뒤 1뎁스 문장의
  // 주어가 슬며시 바뀐다(2018년을 보고 나오면 "LDL" → "총콜레스테롤"). 1뎁스엔 연도 표시가
  // 없으니 사용자에게는 이유 없는 변화로 보인다. "지금은 …"이라는 문장도 최신 연도가 맞다.
  const latestLead = useMemo(() => {
    const latest = reports[reports.length - 1];
    const metrics = metricsForReport(latest, metricDefinitions);
    const present = group.keys.map((k) => metrics.find((m) => m.key === k)).filter((m): m is MetricDefinition => !!m);
    const lead = [...present].sort((a, b) => ATTENTION[a.status] - ATTENTION[b.status])[0] ?? null;
    // 배지도 최신 연도 기준으로 만든다 — 선택 연도로 만들면 모달에서 2018년을 보고 나온 뒤
    // 배지만 바뀌고 문장·스파크라인은 그대로여서 1뎁스 안에서 기준이 갈린다.
    // 정상일 때도 배지를 달아 슬롯을 항상 채운다: 그래야 요약 문장에서 "지금은 …" 뒷문장을
    // 빼도 상태 정보가 사라지지 않고, 카드마다 줄 수가 달라지지도 않는다.
    const badge = lead
      ? (lead.status === '위험' ? { text: '위험 포함', color: T.danger, bg: T.dangerBg }
        : lead.status === '주의' ? { text: '주의 포함', color: T.warn, bg: T.warnBg }
        : { text: '모두 정상', color: T.success, bg: T.successBg })
      : null;
    return { metrics, lead, badge };
  }, [reports, metricDefinitions, group.keys]);

  // 요약 먼저 원칙 — 차트(근거)를 읽기 전에 결론 문장을 한 줄 보여준다.
  const summary = useMemo(
    () => groupSummary(latestLead.lead?.key ?? null, reports, metricDefinitions),
    [latestLead, reports, metricDefinitions],
  );

  // 1뎁스 스파크라인 — 요약 문장이 말하는 그 항목의 연도별 값. 측정 안 한 해는 null로 둬 선을 끊는다.
  const sparkValues = useMemo(() => {
    const key = latestLead.lead?.key;
    if (!key) return null;
    return reports.map((rep) => {
      const v = rep.values[key];
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    });
  }, [latestLead, reports]);
  const c = cardContent[group.title];

  // 지금 보고 있는 항목 — 사용자가 칩으로 바꾸기 전까지는 대표(가장 주의가 필요한) 항목을 따라간다.
  // 이 하나가 밴드·포커스·"나의 위치" 등수를 전부 결정한다. 예전에는 칩이 밴드만 바꾸고
  // 등수는 대표 항목에 고정돼 있어서, 기준을 바꿔도 위쪽 등수가 그대로라 서로 다른 항목을 가리켰다.
  const [bandPick, setBandPick] = useState<MetricKey | null>(null);
  const bandKey = bandPick ?? leadMetric?.key ?? null;
  const setBandKey = (k: MetricKey) => setBandPick(k);
  // 그 해에 측정되지 않은 항목이 선택돼 있으면 밴드를 그리지 않는다(없는 기준을 그릴 수는 없다).
  const bandMetric = bandKey && presentKeys.includes(bandKey) ? metricByKeyForYear(bandKey) : null;
  const focusMetric = bandMetric ?? leadMetric;
  const focusRank = focusMetric
    ? (focusMetric.percentile != null ? rankFromPercentile(focusMetric.percentile) : estimateRank(focusMetric, r.values[focusMetric.key]))
    : null;

  return (
    <SummaryCard
      title={group.title}
      summary={summary}
      definition={c?.definition}
      detail={c?.detail}
      meaning={c?.meaning}
      tips={c?.tips}
      positionTitle="나의 위치 — 연도별 흐름"
      preview={sparkValues && latestLead.lead ? (
        <Sparkline
          values={sparkValues}
          color={latestLead.lead.status === '정상' ? T.success : latestLead.lead.status === '주의' ? T.warn : T.danger}
        />
      ) : undefined}
      badge={latestLead.badge ? (
        <View style={{ backgroundColor: latestLead.badge.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: T.radiusPill }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: latestLead.badge.color }}>{latestLead.badge.text}</Text>
        </View>
      ) : undefined}
      positionExtra={focusMetric && focusRank != null ? (
        <View style={{ marginBottom: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: T.divider }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: T.text1, lineHeight: 23 }}>
            {focusMetric.name} 기준, 같은 나이대 100명 중{' '}
            <Text style={{ color: focusMetric.status === '정상' ? T.success : focusMetric.status === '주의' ? T.warn : T.danger }}>
              {focusRank}등
            </Text>
            {focusMetric.percentile != null ? '이에요' : '쯤이에요'}
          </Text>
          <PeerRankSlider rank={focusRank} color={focusMetric.status === '정상' ? T.success : focusMetric.status === '주의' ? T.warn : T.danger} />
          {focusMetric.percentile == null && focusMetric.peerMean != null && (
            <Text style={{ fontSize: 12, color: T.text3, lineHeight: 17, marginTop: 8 }}>
              또래 평균({focusMetric.peerMean}{focusMetric.unit})과 정상범위 폭으로 어림한 추정 등수예요.
            </Text>
          )}
        </View>
      ) : undefined}
    >
      {presentKeys.length === 0 ? (
        // 이 그룹에 속한 항목 중 그 해에 측정된 것이 하나도 없을 때 — 빈 그래프나 가짜 수치 대신
        // 측정하지 않았다는 사실을 그대로 안내한다.
        <Text style={{ fontSize: 13, color: T.text3, textAlign: 'center', paddingVertical: 28 }}>
          {r.year}년 검진에서는 이 항목들을 측정하지 않았어요.
        </Text>
      ) : (
        <View>
          {/* 정상범위 밴드를 어느 항목 기준으로 깔지 고르는 줄. 항목마다 정상범위가 달라
              전부 겹쳐 깔면 아무것도 읽히지 않으므로 한 번에 하나만 그린다.
              기본값은 가장 주의가 필요한 항목 — 대개 그게 보고 싶은 항목이다. */}
          {presentKeys.length > 1 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              <Text style={{ fontSize: 11, color: T.text3, alignSelf: 'center', marginRight: 2 }}>기준 항목</Text>
              {presentKeys.map((k) => {
                const m = metricByKeyForYear(k)!;
                const on = k === bandKey;
                return (
                  <Pressable
                    key={k}
                    onPress={() => setBandKey(k)}
                    style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: T.radiusPill, backgroundColor: on ? T.text1 : T.cardAlt }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: on ? '#fff' : T.text3 }}>{m.shortName}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          <LineChart
            keys={presentKeys}
            selIdx={selIdx}
            onSelect={setSelIdx}
            reports={reports}
            band={bandMetric ? normalBounds(bandMetric) : null}
            focusKey={presentKeys.length > 1 ? bandMetric?.key ?? null : null}
          />
          <Text style={{ fontSize: 11, color: T.text3, marginTop: 6, marginBottom: 4, lineHeight: 16 }}>
            {bandMetric
              ? `초록 띠 = ${bandMetric.shortName} 정상 ${bandMetric.normalText}${bandMetric.unit}. 진한 선만 이 띠로 판단하세요.`
              : '그래프를 눌러 해당 연도의 수치를 확인하세요.'}
          </Text>

          {/* 선택한 연도의 수치 = 그래프 범례. 예전에는 "검진 수치" 줄과 "범례" 줄이
              같은 항목을 두 번 나열해 화면이 두 배로 복잡했다 — 한 줄에 색·이름·값·상태를 모두 담는다. */}
          <FadeSwap swapKey={selIdx}>
            <View style={{ borderTopWidth: 1, borderTopColor: T.divider, paddingTop: 12, marginTop: 4, marginBottom: 2 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: T.text1, marginBottom: 8 }}>{r.year}년 검진 수치</Text>
              {presentKeys.map((k, i) => {
                // 그 해 실제 측정값을 가진 항목 정의를 그대로 쓴다 — 더미로 폴백하지 않아 항상 실제 정보만 보여준다.
                const metric = metricByKeyForYear(k)!;
                const color = LINE_COLORS[i % LINE_COLORS.length];
                const bad = isBadStatus(metric.status);
                return (
                  <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 }}>
                    <View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: color }} />
                    <Text style={{ flex: 1, fontSize: 13, color: T.text2 }}>{metric.shortName}</Text>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: T.text1 }}>{r.values[k]}{metric.unit}</Text>
                    {bad && (
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: metric.status === '주의' ? T.warn : T.danger }} />
                    )}
                  </View>
                );
              })}
            </View>
          </FadeSwap>
        </View>
      )}
    </SummaryCard>
  );
}

/** 눈금을 사람이 읽는 수(1·2·5·10의 배수)로 맞춘다 — 154·122·90처럼 계산에서 떨어진 값은
 *  축을 읽는 데 아무 도움이 안 되고, 정상 기준(120·140)과도 어긋나 보인다. */
function niceStep(rough: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const n = rough / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

function LineChart({ keys, selIdx, onSelect, reports, band, focusKey }: {
  keys: MetricKey[]; selIdx: number; onSelect: (i: number) => void; reports: Report[];
  /** 정상범위 밴드를 그릴 항목의 경계. 여러 항목의 밴드가 겹치면 읽을 수 없어 한 번에 하나만 그린다. */
  band?: { low?: number; high?: number } | null;
  /** 밴드의 주인 항목. 밴드는 이 항목에만 해당하는데 다른 선까지 띠 안에 들어가면
   *  그 선들도 정상인 것처럼 보인다(HDL 39가 LDL 밴드에 들어가는 식). 그래서
   *  주인 선만 진하게 두고 나머지는 배경으로 흐리게 깐다. */
  focusKey?: MetricKey | null;
}) {
  // 일부 해에는 이 항목을 측정하지 않았을 수 있다 — 그런 해의 값(undefined)을 그래프 범위 계산에
  // 끼워 넣으면 축이 왜곡되거나 잘못된 값이 그려질 수 있으므로, 실제로 측정된 값만 사용한다.
  const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const allVals = keys.flatMap((k) => reports.map((r) => r.values[k]).filter(isFiniteNum));
  // 밴드 경계도 범위에 넣는다 — 축 밖으로 밀려나면 정작 기준선이 화면에 안 보인다.
  // (low:0은 "하한 없음"의 표현이라 축을 0까지 늘리지 않도록 제외한다)
  const bandEdges = [band?.low, band?.high].filter((v): v is number => v != null && v > 0);
  const spanVals = [...allVals, ...bandEdges];
  const rawMin = Math.min(...spanVals);
  const rawMax = Math.max(...spanVals);
  const margin = (rawMax - rawMin) * 0.12 || 5;
  // 축 끝은 데이터에 밀착시키고(예전엔 눈금 배수로 잘라 0~300까지 늘어나 데이터가 가운데 뭉쳤다),
  // 눈금선만 그 안쪽의 '읽기 좋은 수'에 놓는다.
  const minVal = rawMin - margin;
  const maxVal = rawMax + margin;
  const range = maxVal - minVal || 1;
  const step = niceStep(range / 5);

  const xPos = (i: number) => reports.length === 1 ? PLOT_W / 2 : (i / (reports.length - 1)) * PLOT_W;
  const yPos = (val: number) => PLOT_H - ((val - minVal) / range) * PLOT_H;
  const clampY = (v: number) => Math.max(0, Math.min(PLOT_H, yPos(v)));

  const gridVals: number[] = [];
  for (let v = Math.ceil(minVal / step) * step; v <= maxVal + 1e-9; v += step) gridVals.push(v);

  const handleTouch = (evt: any) => {
    const x = evt.nativeEvent.locationX - PAD.left;
    if (reports.length <= 1) { onSelect(0); return; }
    const ratio = Math.min(1, Math.max(0, x / PLOT_W));
    const idx = Math.round(ratio * (reports.length - 1));
    onSelect(idx);
  };

  return (
    <Pressable onPress={handleTouch} onTouchStart={handleTouch} onTouchMove={handleTouch}>
    <Svg width={CHART_W} height={CHART_H}>
      <G x={PAD.left} y={PAD.top}>
        {/* 정상범위 밴드 — 축 눈금만으로는 "이 값이 괜찮은지"를 알 수 없어서,
            검사항목 상세의 RangeBar와 같은 초록 띠를 배경에 깔아 선이 띠를 벗어나는 순간이 보이게 한다.
            격자·선보다 먼저 그려 배경으로 깔린다. */}
        {band && (() => {
          const top = clampY(band.high ?? maxVal);
          const bottom = clampY(band.low != null && band.low > 0 ? band.low : minVal);
          if (bottom - top < 1) return null;
          return (
            <G>
              <Rect x={0} y={top} width={PLOT_W} height={bottom - top} fill={NORMAL_BAND} opacity={0.5} />
              {/* 경계는 선으로만 표시한다 — 경계 숫자는 그래프 밖 캡션이 맡는다.
                  그래프 안에 글자가 하나 늘 때마다 선과 점이 그만큼 안 보인다. */}
              {band.high != null && band.high < maxVal && (
                <Line x1={0} y1={top} x2={PLOT_W} y2={top} stroke={T.success} strokeWidth={1} strokeDasharray="4,3" opacity={0.8} />
              )}
              {band.low != null && band.low > minVal && band.low > 0 && (
                <Line x1={0} y1={bottom} x2={PLOT_W} y2={bottom} stroke={T.success} strokeWidth={1} strokeDasharray="4,3" opacity={0.8} />
              )}
            </G>
          );
        })()}
        {/* 선택한 연도를 가리키는 세로 기준선 */}
        <Line x1={xPos(selIdx)} y1={0} x2={xPos(selIdx)} y2={PLOT_H} stroke={T.text3} strokeWidth={1} strokeDasharray="3,4" opacity={0.5} />
        {gridVals.map((v, i) => {
          const y = yPos(v);
          return (
            <G key={i}>
              <Line x1={0} y1={y} x2={PLOT_W} y2={y} stroke={T.divider} strokeWidth={1} />
              <SvgText x={-6} y={y + 4} fontSize={10} fill={T.text3} textAnchor="end">{Math.round(v)}</SvgText>
            </G>
          );
        })}

        {reports.map((r, i) => (
          <SvgText key={r.year} x={xPos(i)} y={PLOT_H + 20} fontSize={11} fill={T.text3} textAnchor="middle" fontWeight="500">{r.year}</SvgText>
        ))}

        {/* 포커스 항목을 마지막에 그려 다른 선 위로 올린다 */}
        {[...keys].sort((a, b) => (a === focusKey ? 1 : 0) - (b === focusKey ? 1 : 0)).map((k) => {
          const ki = keys.indexOf(k);
          const color = LINE_COLORS[ki % LINE_COLORS.length];
          // focusKey가 없으면(항목 1개짜리 그룹 등) 전부 진하게 — 흐릴 이유가 없다.
          const dim = !!focusKey && k !== focusKey;
          // 측정하지 않은 해는 점/선을 그리지 않는다 — 0이나 보간값으로 채우면 검사한 것처럼
          // 보여 사실과 다른 정보가 된다. 실제로 측정된 연도끼리만 선으로 잇는다.
          const pts = reports
            .map((r, i) => ({ idx: i, x: xPos(i), y: yPos(r.values[k]), v: r.values[k] }))
            .filter((p): p is { idx: number; x: number; y: number; v: number } => isFiniteNum(p.v));
          const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

          return (
            <G key={k} opacity={dim ? 0.3 : 1}>
              <Path d={d} stroke={color} strokeWidth={dim ? 1.5 : 2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              {pts.map((p) => {
                const sel = p.idx === selIdx;
                // 숫자는 선택한 해의 포커스 계열 하나만. 연도별 값은 아래 목록이 이미 보여주므로
                // 그래프 위에 여러 개를 얹으면 선을 가리기만 한다.
                // 점도 작게 — 값이 붙어 있는 해에는 큰 원끼리 겹쳐 선이 끊겨 보였다.
                if (!sel) return <Circle key={p.idx} cx={p.x} cy={p.y} r={dim ? 2 : 2.8} fill={color} />;
                return (
                  <G key={p.idx}>
                    <Circle cx={p.x} cy={p.y} r={4.5} fill={color} stroke={T.white} strokeWidth={2} />
                    {!dim && (
                      <SvgText
                        // 마지막 해는 라벨을 왼쪽으로 붙여야 오른쪽 밖으로 잘리지 않는다.
                        x={p.idx === reports.length - 1 ? p.x - 2 : p.x}
                        y={p.y - 10}
                        fontSize={11}
                        fill={color}
                        textAnchor={p.idx === reports.length - 1 ? 'end' : 'middle'}
                        fontWeight="700"
                      >
                        {p.v}
                      </SvgText>
                    )}
                  </G>
                );
              })}
            </G>
          );
        })}
      </G>
    </Svg>
    </Pressable>
  );
}

