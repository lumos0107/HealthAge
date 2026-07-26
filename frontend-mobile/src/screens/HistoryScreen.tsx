import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Pressable, ScrollView, Text, View } from 'react-native';
import { Circle, G, Line, Path, Svg, Text as SvgText } from 'react-native-svg';
import { Collapsible, Eyebrow, T } from '../components/UI';
import { isBadStatus, metricsForReport } from '../data';
import type { MetricDefinition, MetricKey, Report } from '../data';
import type { RealTimeseries } from '../health';

type Highlight = NonNullable<RealTimeseries['highlights']>[number];
type Insight = NonNullable<RealTimeseries['insight']>;
type ChangePace = NonNullable<RealTimeseries['change_pace']>[number];

// 백엔드 시계열은 내부 검진항목 키를 그대로 쓴다(non_HDL, 식전혈당(공복혈당) 등).
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
const metricLabel = (m: string) => METRIC_LABEL[m] ?? m;

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

const chartGroups: { title: string; keys: MetricKey[] }[] = [
  { title: '혈압', keys: ['sbp', 'dbp'] },
  { title: '혈당·체중', keys: ['glucose', 'bmi', 'waist'] },
  { title: '지질', keys: ['ldl', 'hdl', 'triglyceride'] },
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

      {/* 페이지 헤더 — 박스 없이 큰 제목과 설명만 배경 위에 바로 둔다 */}
      <View style={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 8 }}>
        <Eyebrow>HISTORY</Eyebrow>
        <Text style={{ fontSize: 34, fontWeight: '800', fontFamily: T.fontDisplay, color: T.text1, letterSpacing: -0.5, marginTop: 6 }}>히스토리</Text>
        <Text style={{ fontSize: 13, color: T.text3, lineHeight: 19, marginTop: 6 }}>검진 항목별 연도 변화 추이를 확인합니다.</Text>
      </View>

      {/* 안내 — 박스 대신 구분선과 텍스트만으로 */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, paddingVertical: 14, marginBottom: 4, gap: 10, borderBottomWidth: 1, borderBottomColor: T.divider, marginHorizontal: 16 }}>
        <Text style={{ fontSize: 14, color: T.primary, fontWeight: '700' }}>!</Text>
        <Text style={{ flex: 1, fontSize: 13, color: T.text2, lineHeight: 20 }}>
          수치 변화는 생활습관, 복용 약, 검사 당시 상태에 따라 달라질 수 있습니다. 같은 항목이 반복해서 기준을 벗어나면 의료진과 상담해 보세요.
        </Text>
      </View>

      {/* 종합 인사이트 — 여러 해 기록을 종합한 요약 + 주요 우려 Top 3 (insight_generator) */}
      {!!insight?.summary && (
        <View style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16, marginBottom: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: T.text1, marginBottom: 6 }}>한눈에 요약</Text>
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
        </View>
      )}

      {/* 또래 대비 변화 '속도' — 공단 표본의 같은 성별·연령대 평균 변화량과 내 변화 폭을 배수로 비교.
          배수는 또래 변화가 뚜렷할 때만(±0.5 이상) 나온다 — 0에 가까운 값으로 나누면 배수가 발산하므로. */}
      {!!changePace?.length && (
        <FadeInUp delay={15}>
        <View style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16, marginBottom: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: T.text1, marginBottom: 4 }}>또래 대비 변화 속도</Text>
          <Text style={{ fontSize: 13, color: T.text2, marginBottom: 12 }}>같은 성별·연령대의 평균 변화와 내 변화 폭을 비교했어요. 악화 방향만 모았어요.</Text>
          <View style={{ gap: 8 }}>
            {changePace!.map((p, i) => {
              // 2배 이상이면 빨강, 그 아래는 주황. 배수를 못 낸 항목은 중립 회색으로 둔다.
              const strong = (p.pace.ratio ?? 0) >= 2;
              const badgeColor = p.pace.ratio == null ? T.text3 : strong ? T.danger : T.warn;
              const badgeBg = p.pace.ratio == null ? '#EFEFEF' : strong ? T.dangerBg : T.warnBg;
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
        </View>
        </FadeInUp>
      )}

      {/* 시계열 분석 하이라이트 — 백엔드가 연도별 추세를 분석해 실제로 짚어준 변화만 보여준다(2년 미만 기록이면 비어있음) */}
      {!!highlights?.length && (
        <FadeInUp delay={20}>
        <View style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16, marginBottom: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: T.text1, marginBottom: 4 }}>주목할 만한 변화</Text>
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
        </View>
        </FadeInUp>
      )}

      {/* 차트 카드들 — 살짝 떠오르며 순서대로 나타나서 화면이 한 번에 딱딱하게 뜨지 않도록 한다 */}
      {chartGroups.map((group, i) => (
        <FadeInUp key={group.title} delay={i * 90}>
          <ChartCard group={group} reports={reports} metricDefinitions={metricDefinitions} />
        </FadeInUp>
      ))}

      {/* 항목 설명 — 기본 접힘, 필요할 때만 펼쳐서 본다. 박스 없이 구분선으로만 영역 구분 */}
      <View style={{ marginHorizontal: 16, paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: T.divider, marginTop: 4 }}>
        <Collapsible title="항목별 쉬운 설명" badge={`${metricDefinitions.length}개`}>
          {metricDefinitions.map((metric, i) => (
            <View
              key={metric.key}
              style={[{ paddingVertical: 14 }, i < metricDefinitions.length - 1 && { borderBottomWidth: 1, borderBottomColor: T.divider }]}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: T.text1, marginBottom: 3 }}>{metric.name}</Text>
              <Text style={{ fontSize: 13, lineHeight: 20, color: T.text2 }}>{metric.description}</Text>
              <Text style={{ fontSize: 12, lineHeight: 18, color: T.text3, marginTop: 4 }}>{metric.note}</Text>
            </View>
          ))}
        </Collapsible>
      </View>
    </ScrollView>
  );
}

/** 카드가 부드럽게 떠오르며 나타나는 등장 애니메이션 */
function FadeInUp({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 480, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);
  return (
    <Animated.View style={{ opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>
      {children}
    </Animated.View>
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

function ChartCard({ group, reports, metricDefinitions }: { group: { title: string; keys: MetricKey[] }; reports: Report[]; metricDefinitions: MetricDefinition[] }) {
  const [selIdx, setSelIdx] = useState(reports.length - 1);
  const r = reports[selIdx];
  // 선택한 연도 기준으로 항목 상태를 다시 계산한다 — 연도를 바꾸면 "주의 포함" 표시도 함께 바뀐다.
  const yearMetrics = useMemo(() => metricsForReport(r, metricDefinitions), [r, metricDefinitions]);
  const metricByKeyForYear = (k: MetricKey) => yearMetrics.find((m) => m.key === k);
  // 이 그룹의 항목 중 그 해에 실제로 측정된 것만 추린다 — 검사하지 않은 항목을 측정한 것처럼
  // 그래프나 범례에 끼워 넣으면 사실과 다른 정보가 된다.
  const presentKeys = group.keys.filter((k) => !!metricByKeyForYear(k));
  const hasBad = presentKeys.some((k) => isBadStatus(metricByKeyForYear(k)!.status));
  // 항상 빨간 테두리는 과하다 — 원래대로 전체 테두리를 쓰되, 색만 상태에 맞춘다(위험=빨강/주의=주황).
  const hasDanger = presentKeys.some((k) => metricByKeyForYear(k)!.status === '위험');
  const accent = hasDanger ? T.danger : T.warn;

  return (
    <View style={[
      { backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16, marginBottom: 8 },
      hasBad && { borderWidth: 1.5, borderColor: accent },
    ]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: T.text1 }}>{group.title}</Text>
        {hasBad && (
          <View style={{ backgroundColor: T.cardAlt, paddingHorizontal: 10, paddingVertical: 4, borderRadius: T.radiusPill }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: accent }}>{hasDanger ? '위험 포함' : '주의 포함'}</Text>
          </View>
        )}
      </View>
      {presentKeys.length === 0 ? (
        // 이 그룹에 속한 항목 중 그 해에 측정된 것이 하나도 없을 때 — 빈 그래프나 가짜 수치 대신
        // 측정하지 않았다는 사실을 그대로 안내한다.
        <Text style={{ fontSize: 13, color: T.text3, textAlign: 'center', paddingVertical: 28 }}>
          {r.year}년 검진에서는 이 항목들을 측정하지 않았어요.
        </Text>
      ) : (
        <>
          <LineChart keys={presentKeys} selIdx={selIdx} onSelect={setSelIdx} reports={reports} />
          <Text style={{ fontSize: 11, color: T.text3, marginTop: 6, marginBottom: 4 }}>그래프를 눌러 해당 연도의 수치를 확인하세요.</Text>

          {/* 선택한 연도의 상세 수치 — 연도를 바꾸면 슬쩍 페이드되며 갱신되어 변화가 자연스럽게 보인다 */}
          <FadeSwap swapKey={selIdx}>
            <View style={{ borderTopWidth: 1, borderTopColor: T.divider, paddingTop: 12, marginTop: 4, marginBottom: 2 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: T.text1, marginBottom: 8 }}>{r.year}년 검진 수치</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
                {presentKeys.map((k, i) => {
                  // 그 해 실제 측정값을 가진 항목 정의를 그대로 쓴다 — 더미로 폴백하지 않아 항상 실제 정보만 보여준다.
                  const metric = metricByKeyForYear(k)!;
                  const color = LINE_COLORS[i % LINE_COLORS.length];
                  return (
                    <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
                      <Text style={{ fontSize: 12, color: T.text2 }}>{metric.shortName}</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: T.text1 }}>{r.values[k]}{metric.unit}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </FadeSwap>

          <ChartLegend keys={presentKeys} report={r} metricDefinitions={metricDefinitions} />
        </>
      )}
    </View>
  );
}

function LineChart({ keys, selIdx, onSelect, reports }: { keys: MetricKey[]; selIdx: number; onSelect: (i: number) => void; reports: Report[] }) {
  // 일부 해에는 이 항목을 측정하지 않았을 수 있다 — 그런 해의 값(undefined)을 그래프 범위 계산에
  // 끼워 넣으면 축이 왜곡되거나 잘못된 값이 그려질 수 있으므로, 실제로 측정된 값만 사용한다.
  const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const allVals = keys.flatMap((k) => reports.map((r) => r.values[k]).filter(isFiniteNum));
  const rawMin = Math.min(...allVals);
  const rawMax = Math.max(...allVals);
  const margin = (rawMax - rawMin) * 0.25 || 5;
  const minVal = rawMin - margin;
  const maxVal = rawMax + margin;
  const range = maxVal - minVal || 1;

  const xPos = (i: number) => reports.length === 1 ? PLOT_W / 2 : (i / (reports.length - 1)) * PLOT_W;
  const yPos = (val: number) => PLOT_H - ((val - minVal) / range) * PLOT_H;

  const gridCount = 4;
  const gridVals = Array.from({ length: gridCount }, (_, i) => minVal + (i / (gridCount - 1)) * (maxVal - minVal));

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

        {keys.map((k, ki) => {
          const color = LINE_COLORS[ki % LINE_COLORS.length];
          // 측정하지 않은 해는 점/선을 그리지 않는다 — 0이나 보간값으로 채우면 검사한 것처럼
          // 보여 사실과 다른 정보가 된다. 실제로 측정된 연도끼리만 선으로 잇는다.
          const pts = reports
            .map((r, i) => ({ idx: i, x: xPos(i), y: yPos(r.values[k]), v: r.values[k] }))
            .filter((p): p is { idx: number; x: number; y: number; v: number } => isFiniteNum(p.v));
          const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

          return (
            <G key={k}>
              <Path d={d} stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              {pts.map((p) => (
                <G key={p.idx}>
                  <Circle cx={p.x} cy={p.y} r={p.idx === selIdx ? 6.5 : 5} fill={p.idx === selIdx ? color : T.white} stroke={color} strokeWidth={2.5} />
                  {p.idx === selIdx && (
                    <SvgText x={p.x} y={p.y - 12} fontSize={11} fill={color} textAnchor="middle" fontWeight="700">
                      {p.v}
                    </SvgText>
                  )}
                </G>
              ))}
            </G>
          );
        })}
      </G>
    </Svg>
    </Pressable>
  );
}

function ChartLegend({ keys, report, metricDefinitions }: { keys: MetricKey[]; report: Report; metricDefinitions: MetricDefinition[] }) {
  // 선택한 연도의 statusByKey를 반영 — 연도를 바꾸면 "주의/위험" 표시도 함께 바뀐다.
  const yearMetrics = useMemo(() => metricsForReport(report, metricDefinitions), [report, metricDefinitions]);
  return (
    <FadeSwap swapKey={report.year}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
        {keys.map((k, i) => {
          // keys는 그 해에 실제로 측정된 항목(presentKeys)만 들어오므로 항상 찾을 수 있다 —
          // 더미로 폴백하면 검사하지 않은 해에 가짜 상태를 보여줄 수 있어 폴백을 쓰지 않는다.
          const metric = yearMetrics.find((m) => m.key === k);
          if (!metric) return null;
          const color = LINE_COLORS[i % LINE_COLORS.length];
          const textColor = metric.status === '주의' ? T.warn : metric.status === '위험' ? T.danger : T.text2;
          const bad = isBadStatus(metric.status);
          return (
            <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 14, height: 3, backgroundColor: color, borderRadius: 2 }} />
              <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: color }} />
              <Text style={{ fontSize: 12, color: textColor, fontWeight: bad ? '700' : '500' }}>
                {metric.shortName}{bad ? ` (${metric.status})` : ''}
              </Text>
            </View>
          );
        })}
      </View>
    </FadeSwap>
  );
}
