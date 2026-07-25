import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Pressable, ScrollView, Text, View } from 'react-native';
import { Circle, G, Line, Path, Svg, Text as SvgText } from 'react-native-svg';
import { Collapsible, Eyebrow, T } from '../components/UI';
import { isBadStatus, metricsForReport } from '../data';
import type { MetricDefinition, MetricKey, Report } from '../data';
import type { RealTimeseries } from '../health';

type Highlight = NonNullable<RealTimeseries['highlights']>[number];

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

export default function HistoryScreen({ reports, metricDefinitions, usingRealData, highlights }: {
  reports: Report[];
  metricDefinitions: MetricDefinition[];
  usingRealData?: boolean;
  highlights?: Highlight[] | null;
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
                    <Text style={{ fontSize: 13, fontWeight: '700', color: T.text1 }}>{h.metric}</Text>
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
