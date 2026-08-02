import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Pressable, ScrollView, Text, View } from 'react-native';
import { Circle, G, Line, Path, Rect, Svg, Text as SvgText } from 'react-native-svg';
import { Eyebrow, FadeInUp, T } from '../components/UI';
import { Expandable, NORMAL_BAND, PeerRankBlock, Sparkline, scoreTone, SummaryCard } from '../components/v2';
import { cardContent, cardContentFor, directionLabel, isBadStatus, metricDirection, metricLabel, metricPlainName, metricsForReport } from '../data';
import { metricPeerRank, normalBounds, normalRangeText, scoreGapNote, scoreSeries, scoreTrendText, subjectJosa, topicJosa, trendDirection } from '../interpret';
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
// 몸무게도 제외한다 — 성인은 키가 고정이라 BMI = 몸무게 ÷ 키²가 상수배 관계이고, 그래서 두 선의
// 모양이 완전히 같다(데모: 몸무게 +17.0% / BMI +16.9%). 한 축에 겹친 4개 선 중 하나가 순수한 중복이었다.
// 게다가 infoOnly라 판정이 없고 keys의 마지막이어서 대표 항목이 될 수도 없었다 — 1뎁스 문장과
// 스파크라인에는 애초에 등장하지 못하고 모달 차트의 중복 선으로만 남아 있었다.
// (몸무게 자체는 metricDefinitions에 그대로 있어 검사항목 탭에서 자기 추이를 갖는다.)
//
// ⚠️ keys의 순서에 의미가 있다 — 무해한 정리처럼 보이지만 화면 문장을 바꾼다.
// 1뎁스의 대표 항목은 상태(위험>주의>정상)로 뽑는데 그 정렬이 안정적이라, 같은 상태가
// 여럿이면 이 배열에서 앞선 항목이 이긴다. 지금 2024년 지질 4개는 전부 '주의'라 동점이고,
// LDL이 첫 번째여서 카드가 "LDL이 33mg/dL 올랐어요"라고 말한다. data.ts의 category 순서
// (총콜레스테롤이 먼저)로 되돌리면 문장의 주어가 총콜레스테롤로 조용히 바뀐다.
// 순서를 바꿀 때는 그 카드가 무슨 문장을 말하게 되는지 함께 확인할 것.
const chartGroups: { title: string; keys: MetricKey[] }[] = [
  { title: '혈압', keys: ['sbp', 'dbp'] },
  { title: '혈당·체중', keys: ['glucose', 'bmi', 'waist'] },
  { title: '지질', keys: ['ldl', 'hdl', 'triglyceride', 'totalCholesterol'] },
  { title: '간 기능', keys: ['ast', 'alt', 'ggt'] },
  { title: '혈액·신장', keys: ['hemoglobin', 'creatinine'] },
];

/** 구획 머리말 — 이 탭의 카드는 성격이 둘로 갈린다.
 *  «여러 해를 종합한 해석»(백엔드 시계열 산출)과 «항목 묶음별 추이»(연도별 값 그래프)다.
 *  그동안 여덟 장이 평평하게 나열돼 어디서 성격이 바뀌는지 화면에 없었다.
 *  아래 다섯 장에만 주의/위험 배지가 붙는 것도 «판정 대상이 아니라서»인데,
 *  구획이 없으면 "배지 없는 카드는 정상인가?"로 읽힌다.
 *  분석 탭 LayerHeader와 같은 문법을 쓴다 — 앱 안에서 새로 배울 것이 없어야 한다. */
function SectionHeader({ title, sub, first }: { title: string; sub: string; first?: boolean }) {
  return (
    <View style={first
      ? { marginHorizontal: 16, marginTop: 18, marginBottom: 6 }
      : { marginHorizontal: 16, marginTop: 26, marginBottom: 6, paddingTop: 18, borderTopWidth: 1, borderTopColor: T.divider }}>
      <Text style={{ fontSize: 17, fontWeight: '800', color: T.text1, letterSpacing: -0.3 }}>{title}</Text>
      <Text style={{ fontSize: 12, color: T.text3, lineHeight: 18, marginTop: 3 }}>{sub}</Text>
    </View>
  );
}

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

      {/* 페이지 헤더 — 「히스토리」만으로는 «무엇의» 히스토리인지, 다른 탭과 무엇이 다른지
          알 수 없어 한 줄을 붙인다. 검사항목 탭이 «그 해 한 장»을 보는 곳이라면
          여기는 «여러 해를 이어 붙여» 보는 곳이라는 것이 이 탭의 존재 이유다. */}
      <View style={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 12 }}>
        <Eyebrow>HISTORY</Eyebrow>
        <Text style={{ fontSize: 26, fontWeight: '800', fontFamily: T.fontDisplay, color: T.text1, letterSpacing: -0.5, marginTop: 6 }}>히스토리</Text>
        <Text style={{ fontSize: 13, color: T.text3, lineHeight: 19, marginTop: 6 }}>
          여러 해 기록을 이어 붙여 어떻게 달라졌는지 봅니다.
        </Text>
      </View>

      {/* 점수 추이 히어로 — "추이" 탭의 첫 화면에 그림이 하나도 없던 문제를 여기서 해결한다. */}
      <ScoreTrendHero reports={reports} />

      <SectionHeader
        first
        title="항목별로 보면"
        sub="검사 항목을 묶어 연도별로 그립니다. 카드를 열면 연도를 골라 그해 수치를 볼 수 있어요."
      />

      {/* 차트 카드들 — 살짝 떠오르며 순서대로 나타나서 화면이 한 번에 딱딱하게 뜨지 않도록 한다 */}
      {chartGroups.map((group, i) => (
        <FadeInUp key={group.title} delay={i * 60}>
          <ChartCard group={group} reports={reports} metricDefinitions={metricDefinitions} />
        </FadeInUp>
      ))}

      <SectionHeader
        title="여러 해를 종합하면"
        sub="위 그래프들을 시스템이 대신 읽은 결과예요 — 또래와 견주고, 구간이 바뀐 순간을 짚습니다."
      />

      {/* 또래 대비 변화 '속도' — 공단 표본의 같은 성별·연령대 평균 변화량과 내 변화 폭을 배수로 비교.
          배수는 또래 변화가 뚜렷할 때만(±0.5 이상) 나온다 — 0에 가까운 값으로 나누면 배수가 발산하므로. */}
      {!!changePace?.length && (
        <FadeInUp delay={330}>
        <SummaryCard
          title="또래보다 빠르게 변한 항목"
          summary={`${changePace[0]?.span_years ?? ''}년을 통틀어 ${changePace.length}개 항목이 또래보다 크게 변했어요.`}
          definition={cardContent['또래보다 빠르게 변한 항목'].definition}
          detail={cardContent['또래보다 빠르게 변한 항목'].detail}
          meaning={cardContent['또래보다 빠르게 변한 항목'].meaning}
          tips={cardContent['또래보다 빠르게 변한 항목'].tips}
          axes={['peer']}
        >
          {/* 앞 절("같은 성별·연령대의 평균 변화와 내 변화 폭을 비교했어요")은 ②가 그대로 말한다.
              «악화 방향만 모았다»는 것만 ②에 없는 정보라 남긴다. */}
          <Text style={{ fontSize: 13, color: T.text2, marginBottom: 12 }}>악화 방향만 모았어요.</Text>
          {/* ⚠️ 이 값은 «첫 회차와 마지막 회차»만 빼서 만든다. 중간에 바닥을 찍고 돌아섰어도
              그 반등은 담기지 않는다. 아래 문구에 "악화 중"이 그대로 남아 있는데, 그건
              백엔드가 만든 문장이라 여기서 고쳐 쓰지 않는다 — 대신 무엇을 비교한 값인지
              밝혀 위쪽 점수 추이("2020년 이후로는 올랐어요")와 어긋나 보이지 않게 한다. */}
          <Text style={{ fontSize: 12, color: T.text3, lineHeight: 18, marginBottom: 12 }}>
            첫 회차와 마지막 회차를 비교한 값이에요. 중간에 좋아진 구간이 있어도 여기엔 담기지 않아요 — 최근 흐름은 위 「참고 점수 추이」를 보세요.
          </Text>
          <Expandable label={`항목 ${changePace!.length}개 보기`}>
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
          </Expandable>
        </SummaryCard>
        </FadeInUp>
      )}

      {/* 시계열 분석 하이라이트 — 백엔드가 연도별 추세를 분석해 실제로 짚어준 변화만 보여준다(2년 미만 기록이면 비어있음)
          1뎁스 결론은 «판단»을 담는다(§2-1). 예전에는 「짚어낸 변화 5건 · 우려 3건 · 다음 검진 2026년」처럼
          개수만 세 개 나열해서, 5건이 많은 건지 적은 건지도 우려가 있다는 건지도 읽히지 않았다.
          우려 유무가 곧 판단이라 그것을 문장으로 만든다.
          다음 검진 연도는 판단이 아니라 예정 정보라 뺐다 — 2뎁스 맨 아래에 그대로 있다(§1-1②). */}
      {!!highlights?.length && (
        <FadeInUp delay={360}>
        <SummaryCard
          title="주목할 만한 변화"
          summary={insight?.top_concerns?.length
            ? `우려할 만한 변화 ${insight.top_concerns.length}건을 포함해 ${highlights.length}건을 짚었어요.`
            : `변화 ${highlights.length}건을 짚었고, 우려할 만한 건 없어요.`}
          definition={cardContent['주목할 만한 변화'].definition}
          detail={cardContent['주목할 만한 변화'].detail}
          meaning={cardContent['주목할 만한 변화'].meaning}
          axes={['time']}
        >
          {/* 「한눈에 요약」 카드를 여기로 합쳤다(2026-08-02).
              뺀 이유: 1뎁스 요약이 "우려 3건 · 다음 검진 2026년"뿐인데 우려는 이 카드가
              자세히 말하고, 자연어 전문은 분석 탭 ④층 「맞춤 권장사항」과 성격이 겹쳤다.
              같은 모양의 카드 셋이 연달아 있어 무엇이 다른지도 알 수 없었다.
              **버린 것은 없다** — summary·top_concerns·next_exam_year 전부 아래에 있다.
              (스펙 §1-1② — 무엇을 왜 뺐고 어디서 볼 수 있는지 기록한다) */}
          {/* ⚠️ insight.summary(16년 서사 한 문단)는 아래 펼침으로 내렸다(2026-08-02).
              2뎁스 첫 화면은 «가장 먼저 볼 것»이어야 하는데, 긴 서사가 그 위에 앉아
              우려 3건을 화면 밖으로 밀고 있었다. 버리지 않고 접기 안에 있다(§1-1②). */}
          {!!insight?.top_concerns?.length && (
            <View style={{ marginBottom: 16, paddingBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: T.text1, marginBottom: 6 }}>가장 먼저 볼 것</Text>
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
          <Expandable label={`16년 요약과 변화 ${highlights!.length}건 보기`}>
          {!!insight?.summary && (
            <Text style={{ fontSize: 14, color: T.text2, lineHeight: 22, marginTop: 4, marginBottom: 14 }}>{insight.summary}</Text>
          )}
          <Text style={{ fontSize: 13, color: T.text2, marginBottom: 12 }}>여러 해의 기록을 비교해 시스템이 짚어낸 변화 {highlights!.length}건이에요.</Text>
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
          </Expandable>
          {insight?.next_exam_year != null && (
            <Text style={{ fontSize: 12, color: T.text3, marginTop: 12 }}>다음 검진 권장: {insight.next_exam_year}년</Text>
          )}
        </SummaryCard>
        </FadeInUp>
      )}

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
  // 선 색은 **현재 점수**를 따라간다(scoreTone: 70↑ 초록 · 40↑ 앰버 · 그 아래 빨강).
  // 예전에 이 선이 브랜드 초록이었을 때는 점수와 무관한 색이어서, 100→22로 내려가는 선이
  // "좋아지는 중"으로 읽히고 같은 22점을 홈은 빨강 배지로 말해 색이 서로 반대였다.
  // 색을 점수에서 파생시키면 그 모순이 생기지 않는다 — 홈 배지·점수와 언제나 같은 색이다.
  // 기울기(좋아지는지 나빠지는지)는 선의 모양이 말하고, 색은 지금 어디에 있는지를 말한다.
  const lineColor = scoreTone(last.score).color;
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
              // 미완 구간은 같은 색 점선 + 흐리게 — 색을 바꾸면 다른 계열로 보인다.
              // 점선·투명도만으로 "이 구간은 값이 온전하지 않다"를 말한다.
              stroke={lineColor}
              opacity={partial ? 0.4 : 1}
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
            // 점도 선과 같은 색. 마지막 점은 크기와 흰 테두리로 구분한다(색으로는 이미 구분이 안 된다).
            fill={p.complete ? lineColor : '#fff'}
            stroke={p.complete ? '#fff' : lineColor}
            strokeWidth={p.complete ? 1.5 : 2}
          />
        ))}
        {/* 마지막 점 값만 적는다 — 나머지는 축 라벨로 위치를 짐작하게 둔다. */}
        <SvgText x={x(series.length - 1) - 6} y={y(last.score) - 12} fontSize={15} fontWeight="800" fill={lineColor} textAnchor="end">
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
  // 주어는 `쉬운 말(실제 용어)`로 — 1뎁스는 검진 수치를 모르는 사람이 읽는 자리다.
  // "LDL가 33mg/dL"는 LDL을 모르면 문장 전체가 버려진다.
  const plain = metricPlainName[m.key];
  const subject = plain?.text ?? m.shortName;
  const josaSub = plain?.sub ?? subjectJosa(subject);
  const josaTop = plain?.top ?? topicJosa(subject);

  const rel = Math.abs(delta) / (Math.abs(pts[0].v) || 1);
  // 방향 판정은 interpret.trendDirection 하나에서만 한다 — 2뎁스 해설(cardContentFor)이
  // 같은 함수를 쓰므로, 이 문장이 "비슷한 수준"이라 할 때 아래 해설도 «유지» 갈래가 된다.
  const dir = trendDirection(pts.map((p) => p.v));
  if (dir === 'flat') return `${subject}${josaTop} 큰 변화 없이 비슷한 수준이에요.`;

  // 단위를 붙인다 — 숫자만 있으면 "74 올랐어요"가 무엇의 74인지 안 걸려서, 결과지와
  // 맞춰 보는 사람이 확인할 수 없다.
  // 단, 단위가 작아 절대 변화량이 1도 안 되는 항목(크레아티닌 0.17)은 그대로 두면
  // 사소해 보인다. 20% 오른 것을 "0.2mg/dL 올랐어요"로 말하면 실제 크기를 놓친다.
  // 이때만 단위 대신 비율로 말한다(%는 그 자체가 단위다).
  const amount = Math.round(Math.abs(delta) * 10) / 10;
  const change = amount < 1 ? `${Math.round(rel * 100)}%` : `${amount}${m.unit}`;
  return `${pts[0].year}년 이후 ${subject}${josaSub} ${change} ${dir === 'up' ? '올랐어요' : '내렸어요'}.`;
}

/** 첫 회차 대비 상대 변화폭(부호 없음). 대표 항목 동점을 가르는 데 쓴다.
 *  같은 상태끼리는 배열 순서 대신 이걸로 정렬한다 — 순서로 뽑으면 실제로 움직인 항목을
 *  놓친다. 데모의 혈액·신장이 그랬다: 혈색소(+3.4%)와 크레아티닌(+20.2%)이 둘 다 정상인데
 *  배열 첫 번째인 혈색소가 대표가 되어 카드가 "큰 변화 없이 비슷한 수준"이라고 말했다.
 *  상태 등급 안에서만 순서를 바꾸므로 배지(위험 포함/주의 포함/모두 정상)는 그대로다. */
function relChange(key: MetricKey, reports: Report[]): number {
  const vs = reports.map((r) => r.values[key]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (vs.length < 2) return 0;
  return Math.abs(vs[vs.length - 1] - vs[0]) / (Math.abs(vs[0]) || 1);
}

/** 대표 항목 = 가장 주의가 필요한 항목, 동점이면 가장 많이 변한 항목. */
function pickLead(metrics: MetricDefinition[], reports: Report[]): MetricDefinition | null {
  return [...metrics].sort((a, b) =>
    (ATTENTION[a.status] - ATTENTION[b.status]) || (relChange(b.key, reports) - relChange(a.key, reports))
  )[0] ?? null;
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
  // 선 색은 '그리는 순서'가 아니라 '항목'에 고정한다 — 그래프는 한 번에 한 항목만 그리므로
  // 순서로 색을 뽑으면 어떤 항목을 골라도 늘 첫 번째 색이 되어 아래 범례의 색 표식과 어긋난다.
  const colorOf = (k: MetricKey) => LINE_COLORS[Math.max(0, presentKeys.indexOf(k)) % LINE_COLORS.length];

  // 1뎁스(요약 문장 + 스파크라인)는 **항상 최신 연도** 기준으로 고른다.
  // 2뎁스에서 연도 칩을 바꾸면 selIdx가 남아 있어, 그걸 쓰면 모달을 닫은 뒤 1뎁스 문장의
  // 주어가 슬며시 바뀐다(2018년을 보고 나오면 "LDL" → "총콜레스테롤"). 1뎁스엔 연도 표시가
  // 없으니 사용자에게는 이유 없는 변화로 보인다. "지금은 …"이라는 문장도 최신 연도가 맞다.
  const latestLead = useMemo(() => {
    const latest = reports[reports.length - 1];
    const metrics = metricsForReport(latest, metricDefinitions);
    const present = group.keys.map((k) => metrics.find((m) => m.key === k)).filter((m): m is MetricDefinition => !!m);
    const lead = pickLead(present, reports);
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
  // 2뎁스 해설은 이 사람의 추세·상태에 맞는 갈래를 고른다.
  // ⚠️ 예전에는 카드마다 문장이 하나뿐이라, 혈압이 내려간 사람도 "혈압이 해마다 조금씩
  //    올라가는 흐름은…"을 봤다. 바로 위 요약이 "18mmHg 내렸어요"라고 말하는데 아래는
  //    올라간다고 말하는 상태였다. 대표 항목·5% 경계를 요약 문장(groupSummary)과 똑같이
  //    쓰므로 두 문장이 갈릴 수 없다.
  const trend = useMemo(() => trendDirection(sparkValues ?? []), [sparkValues]);
  // 해설·팁의 상태는 **선택한 연도**를 따른다. 2018년을 보고 있는데 "지금은 정상이니
  // 이대로 유지하세요"가 떠 있으면, 바로 위 「2018년 검진 수치」와 한 화면에서 다른 해를 말한다.
  // 항목은 latestLead에 고정한다 — 추세(trend)도 그 항목의 연도별 값으로 계산하므로,
  // 항목만 선택을 따라가게 하면 한 문장 안에서 추세와 상태가 서로 다른 항목을 가리킨다.
  // 그 해에 대표 항목을 측정하지 않았으면 undefined가 되어 상태와 무관한 기본 팁으로 돌아간다.
  const contentStatus = latestLead.lead ? metricByKeyForYear(latestLead.lead.key)?.status : undefined;
  const c = cardContentFor(group.title, trend, contentStatus);

  // 보기 상태 두 가지. 서로 독립이다.
  //   pick    = 기준 항목(초록 띠·등수·헤드라인·값 라벨의 주인). null이면 대표 항목을 따른다.
  //   showAll = 나머지 항목 선을 배경에 같이 깔지. 기본은 켬 — 이 카드는 '묶음'이 단위라
  //             먼저 항목들이 같이 어떻게 움직였는지 보고 궁금한 하나를 파고드는 순서가 자연스럽다.
  const [pick, setPick] = useState<MetricKey | null>(null);
  const [showAll, setShowAll] = useState(true);
  // 그 해에 측정되지 않은 항목이 골라져 있으면 대표 항목으로 돌아간다 — 없는 값을 기준 삼을 수는 없다.
  const pickedMetric = pick && presentKeys.includes(pick) ? metricByKeyForYear(pick) : null;
  // 전체보기에서도 밴드·등수는 하나를 골라야 한다(항목마다 정상범위가 달라 전부 깔면 못 읽는다).
  // 그때의 기준은 대표 항목인데, **최신 연도로 고정한 대표**(latestLead)를 쓴다.
  // ⚠️ 선택 연도로 대표를 다시 뽑으면 연도를 누를 때마다 기준이 갈아탄다 — 혈당·체중은
  // 2014년엔 허리가 주의라 허리가, 2024년엔 BMI가 위험이라 BMI가 대표가 되어서
  // 초록 띠·값 라벨·등수·헤드라인이 통째로 다른 항목으로 바뀌었다. 연도만 눌렀을 뿐인
  // 사용자에게는 이유 없는 변화이고, 연도끼리 수치를 비교할 수도 없다.
  // 1뎁스에서 latestLead로 막아 둔 것과 같은 결함이다(위 주석 참고).
  const leadKey = latestLead.lead?.key;
  const leadMetric = leadKey && presentKeys.includes(leadKey)
    ? metricByKeyForYear(leadKey)
    // 최신 대표 항목을 그 해에 측정하지 않았을 때만 그 해에 있는 항목으로 대신한다.
    : pickLead(presentKeys.map((k) => metricByKeyForYear(k)!), reports) ?? undefined;
  const focusMetric = pickedMetric ?? leadMetric;
  const focusRank = focusMetric ? metricPeerRank(focusMetric, r.values[focusMetric.key]) : null;

  // 2뎁스 헤드라인은 '기준 항목' 칩을 따라간다 — 칩을 바꾸면 아래 차트·밴드·등수가 전부 그
  // 항목으로 바뀌는데 맨 위 문장만 그대로면 한 화면이 서로 다른 항목을 말한다.
  // 1뎁스 문장(summary)은 최신 연도 대표에 고정한다 — 모달에서 칩을 만지고 나온 뒤 카드
  // 문장이 바뀌어 있으면 사용자에게는 이유 없는 변화로 보인다(배지를 최신 연도로 옮긴 것과 같은 이유).
  const detailSummary = useMemo(
    () => groupSummary(focusMetric?.key ?? null, reports, metricDefinitions),
    [focusMetric, reports, metricDefinitions],
  );

  // ③ 비교축 — 또래 등수 블록(positionExtra)은 focusRank가 있을 때만 그려지므로 축도 그때만
  // 선언한다. 없는 해에는 축이 time 하나라 「나의 위치 — 연도별 흐름」이 제목이 된다.
  return (
    <SummaryCard
      title={group.title}
      summary={summary}
      detailSummary={detailSummary}
      definition={c?.definition}
      detail={c?.detail}
      meaning={c?.meaning}
      tips={c?.tips}
      axes={focusMetric && focusRank ? ['peer', 'time'] : ['time']}
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
      positionExtra={focusMetric && focusRank ? (
        <View style={{ marginBottom: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: T.divider }}>
          <PeerRankBlock
            subject={focusMetric.name}
            color={focusMetric.status === '정상' ? T.success : focusMetric.status === '주의' ? T.warn : T.danger}
            {...focusRank}
          />
        </View>
      ) : undefined}
    >
      {/* ⚠️ 연도 칩을 뒀다가 뺐다(2026-08-02). 회차가 9개가 되면서 칩이 두 줄을 차지해
             정작 보러 온 그래프를 아래로 밀어냈다. 연도는 그래프를 눌러 고르고, 고른 해는
             점선 세로선·값 라벨·「N년 검진 수치」 제목 셋이 이미 말한다.
             누를 수 있다는 것은 그래프 아래 안내 한 줄이 맡는다. */}
      {presentKeys.length === 0 ? (
        // 이 그룹에 속한 항목 중 그 해에 측정된 것이 하나도 없을 때 — 빈 그래프나 가짜 수치 대신
        // 측정하지 않았다는 사실을 그대로 안내한다.
        // 이때는 그래프가 사라져 «연도를 바꿀 손잡이»도 함께 없어지므로, 돌아갈 버튼을 둔다.
        <View style={{ alignItems: 'center', paddingVertical: 24 }}>
          <Text style={{ fontSize: 13, color: T.text3, textAlign: 'center' }}>
            {r.year}년 검진에서는 이 항목들을 측정하지 않았어요.
          </Text>
          <Pressable
            onPress={() => setSelIdx(reports.length - 1)}
            style={{ marginTop: 12, backgroundColor: T.cardAlt, paddingHorizontal: 14, paddingVertical: 8, borderRadius: T.radiusPill }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: T.text2 }}>{reports[reports.length - 1].year}년으로 돌아가기</Text>
          </Pressable>
        </View>
      ) : (
        <View>
          {/* 컨트롤 두 줄. 한 칩이 '기준 바꾸기'와 '단독으로 보기'를 겸하면 전체보기를 유지한 채
              기준만 옮길 방법이 없어서 둘을 갈라 놓았다.
                칩   = 기준 항목 — 초록 띠·등수·헤드라인·값 라벨의 주인
                체크 = 나머지 항목 선을 배경에 같이 깔지 */}
          {presentKeys.length > 1 && (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                <Text style={{ fontSize: 11, color: T.text3, alignSelf: 'center', marginRight: 2 }}>기준 항목</Text>
                {presentKeys.map((k) => {
                  const m = metricByKeyForYear(k)!;
                  // 아무것도 안 고른 기본 상태에서도 대표 항목 칩이 켜져 있어야 한다 —
                  // 지금 무엇을 기준으로 보고 있는지가 화면에 늘 드러나야 하기 때문이다.
                  const on = k === focusMetric?.key;
                  return (
                    <Pressable
                      key={k}
                      onPress={() => setPick(k)}
                      style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: T.radiusPill, backgroundColor: on ? T.text1 : T.cardAlt }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: on ? '#fff' : T.text3 }}>{m.shortName}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Pressable
                onPress={() => setShowAll((v) => !v)}
                hitSlop={6}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}
              >
                <View style={{
                  width: 15, height: 15, borderRadius: 4, borderWidth: 1.5,
                  borderColor: showAll ? T.text1 : T.text3, backgroundColor: showAll ? T.text1 : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {showAll && <Text style={{ fontSize: 10, lineHeight: 12, color: '#fff', fontWeight: '700' }}>✓</Text>}
                </View>
                <Text style={{ fontSize: 11, color: T.text3 }}>다른 항목도 함께 보기</Text>
              </Pressable>
            </>
          )}
          {/* 함께 보기를 끄면 기준 항목 하나만 남는다 — 축이 그 항목 전용이 되어, 겹쳐 그릴 때
              눌리던 변화 폭이 그대로 보인다(항목마다 단위가 달라 한 축에 겹치면 폭이 좁은 쪽이 눌린다). */}
          <LineChart
            keys={showAll ? presentKeys : focusMetric ? [focusMetric.key] : []}
            color={showAll || !focusMetric ? undefined : colorOf(focusMetric.key)}
            selIdx={selIdx}
            onSelect={setSelIdx}
            reports={reports}
            band={focusMetric ? normalBounds(focusMetric) : null}
            focusKey={showAll && presentKeys.length > 1 ? focusMetric?.key ?? null : null}
          />
          <Text style={{ fontSize: 11, color: T.text3, marginTop: 6, marginBottom: 4, lineHeight: 16 }}>
            {!focusMetric
              ? '그래프를 눌러 그해 수치를 확인하세요.'
              : showAll && presentKeys.length > 1
                ? `초록 띠 = ${focusMetric.shortName} 정상 ${normalRangeText(focusMetric)}. 진한 선만 이 띠로 판단하세요. 그래프를 누르면 그해 수치를 봐요.`
                : `${focusMetric.name} 하나만 그린 그래프예요. 초록 띠 = 정상 ${normalRangeText(focusMetric)}. 그래프를 누르면 그해 수치를 봐요.`}
          </Text>

          {/* 선택한 연도의 수치 = 그래프 범례. 예전에는 "검진 수치" 줄과 "범례" 줄이
              같은 항목을 두 번 나열해 화면이 두 배로 복잡했다 — 한 줄에 색·이름·값·상태를 모두 담는다. */}
          <FadeSwap swapKey={selIdx}>
            <View style={{ borderTopWidth: 1, borderTopColor: T.divider, paddingTop: 12, marginTop: 4, marginBottom: 2 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: T.text1, marginBottom: 8 }}>{r.year}년 검진 수치</Text>
              {presentKeys.map((k) => {
                // 그 해 실제 측정값을 가진 항목 정의를 그대로 쓴다 — 더미로 폴백하지 않아 항상 실제 정보만 보여준다.
                const metric = metricByKeyForYear(k)!;
                const color = colorOf(k);
                const bad = isBadStatus(metric.status);
                // 함께 보기를 끈 상태에서는 그려지지 않은 항목의 선 표식을 흐리게 둔다 —
                // 진하게 두면 화면에 없는 선이 있는 것처럼 읽힌다. 켜져 있으면 전부 그려지므로 전부 진하게.
                // 줄을 눌러도 그 항목이 기준이 된다(칩과 같은 동작).
                const on = showAll || k === focusMetric?.key;
                return (
                  <Pressable hitSlop={8}
                    key={k}
                    onPress={() => setPick(k)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 }}
                  >
                    <View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: color, opacity: on ? 1 : 0.3 }} />
                    <Text style={{ flex: 1, fontSize: 13, color: on ? T.text2 : T.text3, fontWeight: !showAll && on ? '700' : '400' }}>
                      {metric.shortName}
                      {/* 방향 표시 — HDL처럼 '높을수록 좋음'인 항목은 선이 내려가는 게 나빠지는 것이다.
                          표시가 없으면 같은 목록에서 위로 갈수록 나빠지는 LDL과 나란히 놓여 거꾸로
                          읽힌다. 기호 뜻은 아래 한 줄에서 풀어준다. */}
                      <Text style={{ fontSize: 10, color: T.text3 }}>  {directionLabel(metricDirection(metric)).icon}</Text>
                    </Text>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: T.text1 }}>{r.values[k]}{metric.unit}</Text>
                    {bad && (
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: metric.status === '주의' ? T.warn : T.danger }} />
                    )}
                  </Pressable>
                );
              })}
              {/* 이 그룹에 실제로 나온 방향만 풀어 쓴다 — 전부 같은 방향이면 한 가지만 남는다. */}
              <Text style={{ fontSize: 11, color: T.text3, marginTop: 8, lineHeight: 16 }}>
                {[...new Map(presentKeys.map((k) => {
                  const d = directionLabel(metricDirection(metricByKeyForYear(k)!));
                  return [d.icon, d];
                })).values()].map((d) => `${d.icon} ${d.text}`).join('  ·  ')}
              </Text>
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

function LineChart({ keys, selIdx, onSelect, reports, band, focusKey, color: colorProp }: {
  keys: MetricKey[]; selIdx: number; onSelect: (i: number) => void; reports: Report[];
  /** 정상범위 밴드를 그릴 항목의 경계. 여러 항목의 밴드가 겹치면 읽을 수 없어 한 번에 하나만 그린다. */
  band?: { low?: number; high?: number } | null;
  /** 밴드의 주인 항목. 밴드는 이 항목에만 해당하는데 다른 선까지 띠 안에 들어가면
   *  그 선들도 정상인 것처럼 보인다(HDL 39가 LDL 밴드에 들어가는 식). 그래서
   *  주인 선만 진하게 두고 나머지는 배경으로 흐리게 깐다. */
  focusKey?: MetricKey | null;
  /** 선 색을 바깥에서 지정한다. keys가 한 항목뿐일 때 순서로 색을 뽑으면 어떤 항목이든
   *  늘 첫 번째 색이 되어, 항목에 색을 고정해 둔 아래 범례와 어긋난다. */
  color?: string;
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
  const rawRange = rawMax - rawMin || 1;

  // ---- 축 구간 나누기 (물결 = 빈 칸 생략) ----
  // 항목마다 단위 크기가 달라(BMI 22~26 vs 혈당 86~112) 축 중간에 데이터가 하나도 없는
  // 넓은 빈 칸이 생긴다. 그 빈 칸이 화면 높이를 먹어 폭이 좁은 항목의 변화가 눌렸다 —
  // 혈당·체중은 26.3~80 사이 53.7단위가 비어서 BMI의 3.8 변화가 4.5px밖에 안 됐고,
  // 혈액·신장은 크레아티닌(폭 0.17)이 혈색소(폭 0.5) 옆에서 1.3px로 사라졌다.
  //
  // 빈 칸을 잘라내고 남은 구간에 화면 높이를 균등하게 나눠 준다. 구간마다 px/단위가
  // 달라지지만, 이 차트는 애초에 kg/m²·cm·mg/dL를 한 축에 놓고 있어서 구간 사이의
  // '같은 배율'이 보존하는 의미가 없다(1kg/m²와 1mg/dL는 같은 거리가 아니다).
  // 판단 근거는 선끼리의 기울기 비교가 아니라 각 항목의 정상범위 밴드다.
  const seriesSpans = keys
    .map((k) => reports.map((r) => r.values[k]).filter(isFiniteNum))
    .filter((vs) => vs.length > 0)
    .map((vs) => ({ lo: Math.min(...vs), hi: Math.max(...vs) }));
  // 쪼개는 조건: 그냥 그렸을 때 가장 폭이 좁은 계열이 6px도 못 차지할 때만.
  // (계열의 폭 = 그 항목이 세로로 차지하는 높이 = 변화가 보이는 정도)
  //   BMI        3.8 / 115.9 * 138 =  4.5px → 자른다
  //   크레아티닌 0.17 /  18.1 * 138 =  1.3px → 자른다
  //   HDL         15  / 224.4 * 138 =  9.2px → 자르지 않는다
  //   이완기 혈압 14  /  79.4 * 138 = 24.3px → 자르지 않는다
  // 지질(HDL)이 경계다. 9px면 하강이 이미 읽히는데, 선이 4개인 데다 초록 밴드가 구간
  // 아래쪽을 채우고 있어서 그 밑에 물결까지 얹으면 가로 요소가 하나 더 늘어 오히려
  // 읽기 어려워진다. 비율(전체 폭의 몇 %)이 아니라 실제 픽셀로 재야 이 구분이 된다.
  const narrowest = seriesSpans.length ? Math.min(...seriesSpans.map((s) => s.hi - s.lo)) : rawRange;
  const rangeNoBreak = rawRange + (rawRange * 0.12 || 5) * 2;
  const wantBreak = seriesSpans.length > 1 && (narrowest / rangeNoBreak) * PLOT_H < 6;

  // 계열 하나하나가 원자 — 원자는 쪼개지지 않으므로 어떤 선도 물결을 넘어가지 않는다.
  const atoms = [...seriesSpans, ...bandEdges.map((v) => ({ lo: v, hi: v }))].sort((a, b) => a.lo - b.lo);
  const segs: { lo: number; hi: number }[] = [];
  if (!wantBreak || atoms.length === 0) {
    segs.push({ lo: rawMin, hi: rawMax });
  } else {
    for (const a of atoms) {
      const cur = segs[segs.length - 1];
      if (cur && a.lo - cur.hi <= rawRange * 0.15) cur.hi = Math.max(cur.hi, a.hi);
      else segs.push({ lo: a.lo, hi: a.hi });
    }
  }

  const BREAK_PX = 12;   // 물결이 들어갈 빈 띠 — 얇게 잡아 구간에 높이를 더 준다
  // 각 구간에 자기 데이터 폭의 12%씩 여유를 둬 점이 경계에 붙지 않게 한다. 값이 작은 구간이 아래.
  const padded = segs.map((g) => {
    const pad = ((g.hi - g.lo) || rawRange * 0.05) * 0.12;
    return { lo: g.lo - pad, hi: g.hi + pad };
  });
  const totalSpan = padded.reduce((s, g) => s + (g.hi - g.lo), 0) || 1;
  // 높이 배분 = 데이터 폭 비례 70% + 균등 30%.
  // 순수 비례면 폭이 좁은 구간이 다시 눌린다(BMI 9.7 vs 혈당·허리 39.7 → BMI가 25px 높이).
  // 순수 균등이면 반대로 좁은 구간이 과하게 부풀어, BMI의 3.8 변화가 원래 4.5px에서 25px로
  // 5.5배 커지면서 실제보다 극적으로 보이고 위쪽 두 항목이 그만큼 눌린다. 그 사이를 택했다.
  const PROP_WEIGHT = 0.7;
  const usable = PLOT_H - BREAK_PX * (padded.length - 1);
  let cum = 0;
  const layout = padded.map((g) => {
    const h = usable * (PROP_WEIGHT * ((g.hi - g.lo) / totalSpan) + (1 - PROP_WEIGHT) / padded.length);
    const yBottom = PLOT_H - cum;
    cum += h + BREAK_PX;
    return { lo: g.lo, hi: g.hi, span: (g.hi - g.lo) || 1, h, yBottom, yTop: yBottom - h };
  });

  const xPos = (i: number) => reports.length === 1 ? PLOT_W / 2 : (i / (reports.length - 1)) * PLOT_W;
  const yPos = (val: number) => {
    for (const s of layout) if (val >= s.lo && val <= s.hi) return s.yBottom - ((val - s.lo) / s.span) * s.h;
    // 구간 밖이면 가장 가까운 경계에 붙인다 — 생략된 빈 칸 안에는 아무것도 그리지 않는다.
    if (val < layout[0].lo) return layout[0].yBottom;
    const last = layout[layout.length - 1];
    if (val > last.hi) return last.yTop;
    for (let i = 0; i < layout.length - 1; i++) {
      if (val > layout[i].hi && val < layout[i + 1].lo) return layout[i].yTop;
    }
    return PLOT_H;
  };
  const clampY = (v: number) => Math.max(0, Math.min(PLOT_H, yPos(v)));

  // 눈금은 구간마다 따로 — 구간별로 배율이 다르니 전체를 한 간격으로 자를 수 없다.
  // 개수는 구간의 화면 높이로 정한다(약 30px에 하나) — 구간이 나뉘면 각 구간이 낮아지므로
  // 같은 간격을 쓰면 눈금이 하나만 남거나 반대로 빽빽해진다.
  const gridTicks: { v: number; y: number }[] = [];
  for (const s of layout) {
    const step = niceStep(s.span / Math.max(2, Math.round(s.h / 30)));
    for (let v = Math.ceil(s.lo / step) * step; v <= s.hi + 1e-9; v += step) gridTicks.push({ v, y: yPos(v) });
  }

  const handleTouch = (evt: any) => {
    const x = evt.nativeEvent.locationX - PAD.left;
    if (reports.length <= 1) { onSelect(0); return; }
    const ratio = Math.min(1, Math.max(0, x / PLOT_W));
    const idx = Math.round(ratio * (reports.length - 1));
    onSelect(idx);
  };

  return (
    <Pressable hitSlop={8} onPress={handleTouch} onTouchStart={handleTouch} onTouchMove={handleTouch}>
    <Svg width={CHART_W} height={CHART_H}>
      <G x={PAD.left} y={PAD.top}>
        {/* 정상범위 밴드 — 축 눈금만으로는 "이 값이 괜찮은지"를 알 수 없어서,
            검사항목 상세의 RangeBar와 같은 초록 띠를 배경에 깔아 선이 띠를 벗어나는 순간이 보이게 한다.
            격자·선보다 먼저 그려 배경으로 깔린다. */}
        {band && (() => {
          // 밴드는 자기 구간 안에서만 그린다 — 하한이 0("하한 없음")일 때 화면 바닥까지
          // 늘리면 물결 아래 다른 항목의 구간까지 초록으로 덮어 그 선들도 정상처럼 보인다.
          const inSeg = (v: number | undefined) => v != null && v > 0
            ? layout.find((s) => v >= s.lo && v <= s.hi) ?? null : null;
          const seg = inSeg(band.high) ?? inSeg(band.low) ?? layout[0];
          const top = clampY(band.high != null && band.high < seg.hi ? band.high : seg.hi);
          const bottom = clampY(band.low != null && band.low > seg.lo ? band.low : seg.lo);
          if (bottom - top < 1) return null;
          return (
            <G>
              <Rect x={0} y={top} width={PLOT_W} height={bottom - top} fill={NORMAL_BAND} opacity={0.5} />
              {/* 경계는 선으로만 표시한다 — 경계 숫자는 그래프 밖 캡션이 맡는다.
                  그래프 안에 글자가 하나 늘 때마다 선과 점이 그만큼 안 보인다. */}
              {band.high != null && band.high < seg.hi && (
                <Line x1={0} y1={top} x2={PLOT_W} y2={top} stroke={T.success} strokeWidth={1} strokeDasharray="4,3" opacity={0.8} />
              )}
              {band.low != null && band.low > seg.lo && band.low > 0 && (
                <Line x1={0} y1={bottom} x2={PLOT_W} y2={bottom} stroke={T.success} strokeWidth={1} strokeDasharray="4,3" opacity={0.8} />
              )}
            </G>
          );
        })()}
        {/* 선택한 연도를 가리키는 세로 기준선 */}
        <Line x1={xPos(selIdx)} y1={0} x2={xPos(selIdx)} y2={PLOT_H} stroke={T.text3} strokeWidth={1} strokeDasharray="3,4" opacity={0.5} />
        {gridTicks.map((t, i) => (
          <G key={i}>
            <Line x1={0} y1={t.y} x2={PLOT_W} y2={t.y} stroke={T.divider} strokeWidth={1} />
            <SvgText x={-6} y={t.y + 4} fontSize={10} fill={T.text3} textAnchor="end">{t.v % 1 === 0 ? t.v : Math.round(t.v * 10) / 10}</SvgText>
          </G>
        ))}

        {/* 물결(축 생략 기호) — 여기서 축이 끊겼다는 표시. 없으면 위아래 구간이 이어진
            하나의 축으로 읽혀 두 묶음 사이 거리가 실제보다 가까워 보인다.
            ⚠️ 그래프 폭 전체에 걸쳐 그린다. 이 차트에는 y축 세로선이 없어서, 축 라벨 칸에만
            작게 그리면 아무것도 끊지 않은 채 왼쪽에 떠 있는 낙서로 보인다. 폭을 가로지르면
            두 구간이 시각적으로도 갈라져 "잘렸다"가 바로 읽힌다. */}
        {layout.slice(0, -1).map((s, i) => {
          const y = s.yTop - BREAK_PX / 2;
          // 한 마디씩 위아래로 번갈아 휜다. t(반사) 대신 마디마다 q를 써서 끝이 잘려도 모양이 유지된다.
          // x는 그래프 영역(0~PLOT_W) 안에서만 — 축 라벨 칸까지 나가면 눈금 숫자 왼쪽으로
          // 삐져나와 차트 밖에 걸친 선처럼 보인다.
          const wave = (dy: number) => {
            const seg = 13;      // 마디 폭 — 좁을수록 잔물결이 되어 선처럼 가늘게 읽힌다
            let d = `M0,${y + dy}`;
            let up = true;
            for (let x = 0; x < PLOT_W; x += seg) {
              const w = Math.min(seg, PLOT_W - x);
              d += ` q${w / 2},${up ? -2 : 2} ${w},0`;
              up = !up;
            }
            return d;
          };
          return (
            <G key={`brk${i}`}>
              {/* 끊긴 자리를 카드 배경색으로 덮어 격자선·연도 기준선이 지나가지 않게 한다.
                  눈금선과 같은 폭만 덮는다 — 라벨 칸까지 덮을 이유가 없다(그 자리에 눈금이 놓이지도 않는다). */}
              <Rect x={0} y={y - BREAK_PX / 2} width={PLOT_W} height={BREAK_PX} fill={T.white} />
              {/* 두 줄 — 한 줄이면 초록 밴드 경계선 같은 '기준선'으로 오인된다 */}
              <Path d={wave(-1.5)} stroke={T.text3} strokeWidth={0.8} fill="none" opacity={0.4} />
              <Path d={wave(1.5)} stroke={T.text3} strokeWidth={0.8} fill="none" opacity={0.4} />
            </G>
          );
        })}

        {reports.map((r, i) => (
          <SvgText key={r.year} x={xPos(i)} y={PLOT_H + 20} fontSize={11} fill={T.text3} textAnchor="middle" fontWeight="500">{r.year}</SvgText>
        ))}

        {/* 포커스 항목을 마지막에 그려 다른 선 위로 올린다 */}
        {[...keys].sort((a, b) => (a === focusKey ? 1 : 0) - (b === focusKey ? 1 : 0)).map((k) => {
          const ki = keys.indexOf(k);
          const color = colorProp ?? LINE_COLORS[ki % LINE_COLORS.length];
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
                // 값이 구간 위쪽 끝에 있으면 라벨(점보다 10px 위)이 물결 띠에 얹힌다 — 그러면
                // 숫자도 물결도 읽기 나빠진다. 겹칠 때만 점 아래로 내린다.
                const above = p.y - 10;
                const onWave = layout.slice(0, -1).some((s) => above - 8 <= s.yTop && above + 2 >= s.yTop - BREAK_PX);
                const labelY = onWave ? p.y + 16 : above;
                return (
                  <G key={p.idx}>
                    <Circle cx={p.x} cy={p.y} r={4.5} fill={color} stroke={T.white} strokeWidth={2} />
                    {!dim && (
                      <SvgText
                        // 마지막 해는 라벨을 왼쪽으로 붙여야 오른쪽 밖으로 잘리지 않는다.
                        x={p.idx === reports.length - 1 ? p.x - 2 : p.x}
                        y={labelY}
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

