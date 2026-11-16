import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, Text, View } from 'react-native';
import { ClipPath, Circle, Defs, G, Line, Path, Rect, Svg, Text as SvgText } from 'react-native-svg';
import { FadeIn, FadeInUp, MeasuredChart, T, useChartReveal, useChartW, W } from '../components/UI';
import { useLayout } from '../responsive';
import { A11Y, BAND_TEXT, Expandable, LINE, LINE_TEXT, NORMAL_BAND, PeerRankBlock, StatusChip, SummaryCard, useChartTouchX } from '../components/v2';
import { cardContent, cardContentFor, metricDirection, metricLabel, metricPlainName, metricsForReport } from '../data';
import { metricPeerRank, normalBounds, scoreGrade, scoreSeries, subjectJosa, topicJosa, trendDirection } from '../interpret';
import type { MetricDefinition, MetricKey, Report, Status } from '../data';
import type { RealTimeseries } from '../health';

type Highlight = NonNullable<RealTimeseries['highlights']>[number];
type Insight = NonNullable<RealTimeseries['insight']>;
type ChangePace = NonNullable<RealTimeseries['change_pace']>[number];

// 히스토리 탭 — 시니어 기준 개선안(히스토리탭-개선안-확정.md)대로 다시 짰다.
//   1뎁스: 점수 → 한 줄 결론 → 단순한 추이 → 먼저 확인(2행) → 항목별 5행 → 링크 2행 → 안내
//   2뎁스: ① 결론 · 값 영역 · ② 이 지표는요 · ③ 또래와 견주면 · ④ 의미 · ⑤ 행동 (SummaryCard 모달)
// 상태는 색 + 모양 + 글자로 함께 말한다(StatusChip). 글자색은 A11Y 값(대비 4.5:1 이상)을 쓴다.

// 묶음의 '대표 항목'을 고르는 순서 — 가장 나쁜 상태를 대표로 삼는다.
const ATTENTION: Record<string, number> = { 위험: 0, 주의: 1, 정상: 2 };

const CHART_W0 = W - 32 - 40; // 16px 카드 여백 + 20px 카드 패딩, 양쪽
const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const statusFill = (s: Status | undefined) => (s === '정상' ? T.successFill : s === '주의' ? T.warnFill : s === '위험' ? T.dangerFill : A11Y.sub);
const statusInk = (s: Status | undefined) => (s === '정상' ? A11Y.success : s === '주의' ? A11Y.warn : s === '위험' ? A11Y.danger : A11Y.sub);

// ⚠️ keys의 순서에 의미가 있다 — 1뎁스 대표 항목은 상태(위험>주의>정상)로 뽑는데 정렬이 안정적이라,
// 같은 상태가 여럿이면 이 배열에서 앞선 항목이 이긴다. 지질 4개가 전부 '주의'면 LDL이 대표가 되어
// "LDL이 33 올랐어요"라고 말한다. 순서를 바꾸면 그 문장의 주어가 조용히 바뀐다.
const chartGroups: { title: string; keys: MetricKey[] }[] = [
  { title: '혈압', keys: ['sbp', 'dbp'] },
  { title: '혈당·체중', keys: ['glucose', 'bmi', 'waist'] },
  { title: '지질', keys: ['ldl', 'hdl', 'triglyceride', 'totalCholesterol'] },
  { title: '간 기능', keys: ['ast', 'alt', 'ggt'] },
  { title: '혈액·신장', keys: ['hemoglobin', 'creatinine'] },
];
type Group = (typeof chartGroups)[number];

// ─── 항목 이름·문장 도우미 ─────────────────────────────────

/** 쉬운 이름 — "나쁜 콜레스테롤(LDL)"에서 괄호를 뗀 것. 없으면 약칭. */
function plainShort(m: MetricDefinition): string {
  const t = metricPlainName[m.key]?.text;
  return t ? t.replace(/\(.*?\)/g, '').trim() : m.shortName;
}
// 조사는 «화면에 나오는 말»의 끝 글자로 정한다 — 괄호를 뗀 이름에 원래 이름의 조사를 붙이면 어긋난다(이완기이).
const josaSub = (_m: MetricDefinition, word: string) => subjectJosa(word);
const josaTop = (_m: MetricDefinition, word: string) => topicJosa(word);

/** 변화량을 말로 — 1보다 작은 단위(크레아티닌 0.17)는 비율로 말한다. */
function changeAmount(first: number, last: number): string {
  const amount = Math.round(Math.abs(last - first) * 10) / 10;
  if (amount >= 1) return `${amount}`;
  const rel = Math.abs(last - first) / (Math.abs(first) || 1);
  return `${Math.round(rel * 100)}%`;
}

function seriesOf(key: MetricKey, reports: Report[]) {
  return reports.map((r) => ({ year: r.year, v: r.values[key] })).filter((p): p is { year: number; v: number } => isFiniteNum(p.v));
}

/** 1뎁스 한 줄 — "LDL이 33 올랐어요". 항목이 같은 말을 두 번 하지 않게 이름 + 변화만. */
function rowSummary(lead: MetricDefinition | null, reports: Report[]): string | null {
  if (!lead) return null;
  const pts = seriesOf(lead.key, reports);
  if (pts.length < 2) return null;
  const dir = trendDirection(pts.map((p) => p.v));
  if (dir === 'flat' || dir == null) return '변화가 거의 없어요';
  // 영문 약어(LDL·BMI)는 받침을 알 수 없어 조사가 틀린다 — 쉬운 이름으로 말한다.
  const name = /[A-Za-z]/.test(lead.shortName) ? plainShort(lead) : lead.shortName;
  return `${name}${josaSub(lead, name)} ${changeAmount(pts[0].v, pts[pts.length - 1].v)} ${dir === 'up' ? '올랐어요' : '내렸어요'}`;
}

/** 2뎁스 ① 결론 — "나쁜 콜레스테롤이 12년 동안 33 올랐어요." */
function detailHeadline(m: MetricDefinition | undefined, reports: Report[]): string | null {
  if (!m) return null;
  const pts = seriesOf(m.key, reports);
  if (pts.length < 2) return null;
  const span = pts[pts.length - 1].year - pts[0].year;
  if (span <= 0) return null;
  const name = plainShort(m);
  const dir = trendDirection(pts.map((p) => p.v));
  if (dir === 'flat' || dir == null) return `${name}${josaTop(m, name)} ${span}년 동안 큰 변화가 없어요.`;
  return `${name}${josaSub(m, name)} ${span}년 동안 ${changeAmount(pts[0].v, pts[pts.length - 1].v)} ${dir === 'up' ? '올랐어요' : '내렸어요'}.`;
}

/** 정상 범위를 사람 말로 — "130 미만" / "40 이상" / "13~17". 숫자가 없으면 원문. */
function normalPhrase(m: MetricDefinition): string {
  const t = m.normalText ?? '';
  if (!/\d/.test(t)) return t;
  const dir = metricDirection(m);
  if (dir === 'high') return `${m.normalValue} ${t.includes('≤') ? '이하' : '미만'}`;
  if (dir === 'low') return `${m.normalValue} ${t.includes('>') && !t.includes('≥') ? '초과' : '이상'}`;
  const b = normalBounds(m);
  return b.low != null && b.high != null ? `${b.low}~${b.high}` : t;
}

/** 값이 정상 범위의 어느 쪽으로 벗어났는지 */
function side(m: MetricDefinition, v: number): 'high' | 'low' | 'in' {
  const b = normalBounds(m);
  if (b.high != null && v > b.high) return 'high';
  if (b.low != null && b.low > 0 && v < b.low) return 'low';
  return 'in';
}

/** 2.5뎁스 「왜 그럴까요?」 — 기준 / 내 값 / 근거 */
function whyLinesFor(m: MetricDefinition, v: number): { label: string; text: string }[] {
  const hasNum = /\d/.test(m.normalText ?? '');
  const dir = metricDirection(m);
  const U = m.unit ? ` ${m.unit}` : '';
  const nb = normalBounds(m);
  const std = !hasNum
    ? '기준은 검사 기관마다 조금씩 달라요.'
    : dir === 'high'
      ? `${m.normalValue}${U} ${m.normalText.includes('≤') ? '이하' : '미만'}이면 정상으로 봐요.`
      : dir === 'low'
        ? `${m.normalValue}${U} ${m.normalText.includes('>') && !m.normalText.includes('≥') ? '초과' : '이상'}이면 정상으로 봐요.`
        : `${nb.low}~${nb.high}${U}이면 정상으로 봐요.`;
  const b = normalBounds(m);
  const sd = side(m, v);
  const mine = !hasNum
    ? `${v}예요.`
    : sd === 'high' && b.high != null
      ? `${v}로, 기준보다 ${Math.round((v - b.high) * 10) / 10} 높아요.`
      : sd === 'low' && b.low != null
        ? `${v}로, 기준보다 ${Math.round((b.low - v) * 10) / 10} 낮아요.`
        : `${v}로, 기준 안에 있어요.`;
  // 근거 문구는 아직 정하지 않았다(개선안 §5) — 항목에 이미 있는 참고 설명을 그대로 쓴다.
  return [
    { label: '기준', text: std },
    { label: '내 값', text: mine },
    ...(m.note ? [{ label: '근거', text: m.note }] : []),
  ];
}

// ─── 묶음 정보(대표 항목·상태) — 1뎁스 행과 «먼저 확인하세요»가 같이 쓴다 ───────────

function pickLead(metrics: MetricDefinition[], reports: Report[]): MetricDefinition | null {
  const rel = (key: MetricKey) => {
    const vs = seriesOf(key, reports).map((p) => p.v);
    if (vs.length < 2) return 0;
    return Math.abs(vs[vs.length - 1] - vs[0]) / (Math.abs(vs[0]) || 1);
  };
  return [...metrics].sort((a, b) => (ATTENTION[a.status] - ATTENTION[b.status]) || (rel(b.key) - rel(a.key)))[0] ?? null;
}

type GroupInfo = { group: Group; lead: MetricDefinition | null; order: number };

function buildInfos(reports: Report[], defs: MetricDefinition[]): GroupInfo[] {
  const latest = reports[reports.length - 1];
  if (!latest) return [];
  const metrics = metricsForReport(latest, defs);
  return chartGroups.map((group, order) => {
    const present = group.keys.map((k) => metrics.find((m) => m.key === k)).filter((m): m is MetricDefinition => !!m);
    return { group, lead: pickLead(present, reports), order };
  });
}

const rank = (i: GroupInfo) => (i.lead ? ATTENTION[i.lead.status] : 3);

// ─── 화면 ─────────────────────────────────────────────────

function H2({ children }: { children: string }) {
  return <Text style={{ fontSize: T.fs.h3, fontWeight: '800', color: T.text1, letterSpacing: -0.4, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 }}>{children}</Text>;
}

function Chevron() {
  return (
    <Svg width={22} height={22} viewBox="0 0 20 20">
      <Path d="M7 4l6 6-6 6" stroke="#6B7684" strokeWidth={2} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

export default function HistoryScreen({ reports, metricDefinitions, highlights, insight, changePace }: {
  reports: Report[];
  metricDefinitions: MetricDefinition[];
  usingRealData?: boolean;
  highlights?: Highlight[] | null;
  insight?: Insight | null;
  changePace?: ChangePace[] | null;
}) {
  const { isTablet } = useLayout();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const infos = useMemo(() => buildInfos(reports, metricDefinitions), [reports, metricDefinitions]);
  // 먼저 확인 — 기준을 벗어난 묶음 중 가장 급한 2개.
  const attention = useMemo(
    () => infos.filter((i) => i.lead && i.lead.status !== '정상')
      .sort((a, b) => (rank(a) - rank(b)) || (a.order - b.order)).slice(0, 2),
    [infos],
  );
  // 항목별 — 주의가 먼저, 같은 상태끼리는 원래 순서.
  const ordered = useMemo(() => [...infos].sort((a, b) => (rank(a) - rank(b)) || (a.order - b.order)), [infos]);

  const paceCard = !!changePace?.length ? (
    <SummaryCard
            tabletResponsive
            variant="link"
            flush={isTablet}
            title="또래보다 빨리 변한 항목"
            summary={`${changePace[0]?.span_years ?? ''}년을 통틀어 ${changePace.length}개 항목이 또래보다 크게 변했어요.`}
            definition={cardContent['또래보다 빠르게 변한 항목'].definition}
            detail={cardContent['또래보다 빠르게 변한 항목'].detail}
            meaning={cardContent['또래보다 빠르게 변한 항목'].meaning}
            tips={cardContent['또래보다 빠르게 변한 항목'].tips}
            axes={['peer']}
          >
            <Text style={{ fontSize: T.fs.body, color: A11Y.sub, marginBottom: 10 }}>악화 방향만 모았어요.</Text>
            {/* ⚠️ 이 값은 «첫 회차와 마지막 회차»만 빼서 만든다. 중간에 바닥을 찍고 돌아섰어도 그 반등은 담기지 않는다.
                문구의 "악화 중"은 백엔드가 만든 문장이라 고치지 않고, 무엇을 비교한 값인지만 밝힌다. */}
            <Text style={{ fontSize: T.fs.caption, color: A11Y.sub, lineHeight: 21, marginBottom: 12 }}>
              첫 회차와 마지막 회차를 비교한 값이에요. 중간에 좋아진 구간이 있어도 여기엔 담기지 않아요 — 최근 흐름은 위 점수 추이를 보세요.
            </Text>
            <Expandable label={`항목 ${changePace.length}개 보기`}>
              <View style={{ gap: 8 }}>
                {changePace.map((p, i) => {
                  const strong = (p.pace.ratio ?? 0) >= 2;
                  const ink = p.pace.ratio == null ? A11Y.sub : strong ? A11Y.danger : A11Y.warn;
                  const bg = p.pace.ratio == null ? T.cardAlt : strong ? T.dangerBg : T.warnBg;
                  return (
                    <View key={i} style={[{ paddingVertical: 12 }, i < changePace.length - 1 && { borderBottomWidth: 1, borderBottomColor: T.divider }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
                        <View style={{ backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 3, borderRadius: T.radiusPill }}>
                          <Text style={{ fontSize: T.fs.caption, fontWeight: '800', color: ink }}>
                            {p.pace.ratio != null ? `또래의 ${p.pace.ratio}배` : '또래와 다른 방향'}
                          </Text>
                        </View>
                        <Text style={{ fontSize: T.fs.body, fontWeight: '700', color: T.text1 }}>{metricLabel(p.metric)}</Text>
                        {p.span_years != null && <Text style={{ fontSize: T.fs.caption, color: A11Y.sub }}>{p.span_years}년간</Text>}
                      </View>
                      <Text style={{ fontSize: T.fs.body, color: A11Y.sub, lineHeight: 23 }}>{p.pace.text}</Text>
                    </View>
                  );
                })}
              </View>
              <Text style={{ fontSize: T.fs.caption, color: A11Y.sub, lineHeight: 20, marginTop: 10 }}>
                기준: 건강보험공단 검진 표본의 성별·연령대별 평균 변화량. 위험도 예측이 아니라 변화 폭 비교예요.
              </Text>
            </Expandable>
          </SummaryCard>
  ) : null;

  const highlightCard = !!highlights?.length ? (
    <SummaryCard
            tabletResponsive
            variant="link"
            flush={isTablet}
            title="그 밖의 변화 보기"
            summary={insight?.top_concerns?.length
              ? `우려할 만한 변화 ${insight.top_concerns.length}건을 포함해 ${highlights.length}건을 짚었어요.`
              : `변화 ${highlights.length}건을 짚었고, 우려할 만한 건 없어요.`}
            definition={cardContent['주목할 만한 변화'].definition}
            detail={cardContent['주목할 만한 변화'].detail}
            meaning={cardContent['주목할 만한 변화'].meaning}
            axes={['time']}
          >
            {/* insight.summary(긴 서사)는 접힌 곳으로 내렸다 — 첫 화면은 «가장 먼저 볼 것»이어야 한다. */}
            {!!insight?.top_concerns?.length && (
              <View style={{ marginBottom: 16, paddingBottom: 4 }}>
                <Text style={{ fontSize: T.fs.body, fontWeight: '700', color: T.text1, marginBottom: 6 }}>가장 먼저 볼 것</Text>
                {insight.top_concerns.map((c, i) => {
                  const high = c.level === 'high';
                  return (
                    <View key={i} style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: T.divider }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <StatusChip status={high ? '위험' : '주의'} label={`${high ? '위험' : '주의'} ${i + 1}`} />
                        <Text style={{ fontSize: T.fs.body, fontWeight: '700', color: T.text1, flex: 1 }}>{c.title}</Text>
                      </View>
                      {!!c.current_value && <Text style={{ fontSize: T.fs.caption, color: A11Y.sub, marginBottom: 2 }}>{c.current_value}</Text>}
                      <Text style={{ fontSize: T.fs.body, color: A11Y.sub, lineHeight: 23 }}>{c.details}</Text>
                    </View>
                  );
                })}
              </View>
            )}
            <Expandable label={`16년 요약과 변화 ${highlights.length}건 보기`}>
              {!!insight?.summary && (
                <Text style={{ fontSize: T.fs.body, color: A11Y.sub, lineHeight: 25, marginTop: 4, marginBottom: 14 }}>{insight.summary}</Text>
              )}
              <Text style={{ fontSize: T.fs.body, color: A11Y.sub, marginBottom: 12 }}>여러 해의 기록을 비교해 짚어낸 변화 {highlights.length}건이에요.</Text>
              <View style={{ gap: 8 }}>
                {highlights.map((h, i) => (
                  <View key={i} style={[{ paddingVertical: 12 }, i < highlights.length - 1 && { borderBottomWidth: 1, borderBottomColor: T.divider }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <StatusChip status={h.severity === 'high' ? '위험' : '주의'} label={h.type} />
                      <Text style={{ fontSize: T.fs.body, fontWeight: '700', color: T.text1 }}>{metricLabel(h.metric)}</Text>
                    </View>
                    <Text style={{ fontSize: T.fs.body, color: A11Y.sub, lineHeight: 23 }}>{h.message}</Text>
                  </View>
                ))}
              </View>
            </Expandable>
            {insight?.next_exam_year != null && (
              <Text style={{ fontSize: T.fs.caption, color: A11Y.sub, marginTop: 12 }}>다음 검진 권장: {insight.next_exam_year}년</Text>
            )}
          </SummaryCard>
  ) : null;

  // ── 태블릿: 제목 → 점수+그래프 한 카드 → 먼저 확인하세요(2열) → 항목별로 보기(2열 카드 격자)
  if (isTablet) {
    const gridStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: 12 } as const;
    // 마지막 홀수 타일도 두 칸 폭을 유지한다. flexGrow: 1이면 마지막 타일이 한 줄 전체로 늘어난다.
    const cell = { flexBasis: 'calc(50% - 6px)', flexGrow: 0, minWidth: 0 } as any;
    const tiles = [
      ...ordered.map((info) => (
        <View key={info.group.title} style={[cell, { backgroundColor: T.white, borderRadius: T.radius, overflow: 'hidden' }]}>
          <ChartCard
            first
            group={info.group}
            lead={info.lead}
            reports={reports}
            metricDefinitions={metricDefinitions}
            open={openGroup === info.group.title}
            onOpenChange={(v) => setOpenGroup(v ? info.group.title : null)}
          />
        </View>
      )),
      ...(paceCard ? [<View key="pace" style={cell}>{paceCard}</View>] : []),
      ...(highlightCard ? [<View key="hl" style={cell}>{highlightCard}</View>] : []),
    ];
    return (
      <ScrollView contentContainerStyle={{ paddingHorizontal: 28, paddingTop: 28, paddingBottom: 40, gap: 12 }} showsVerticalScrollIndicator={false} style={{ backgroundColor: T.bg, ...({ wordBreak: 'keep-all' } as any) }}>
        <View style={{ paddingRight: 64 }}>
          <Text style={{ fontSize: T.fs.title, fontWeight: '800', color: T.text1, lineHeight: 32 }}>히스토리</Text>
          <Text style={{ fontSize: T.fs.body, color: A11Y.sub, marginTop: 2 }}>해마다 어떻게 달라졌는지 봐요.</Text>
        </View>

        <ScoreHero reports={reports} tablet />

        {attention.length > 0 && (
          <>
            <Text style={{ fontSize: T.fs.h3, fontWeight: '800', color: T.text1, marginTop: 6 }}>먼저 확인하세요</Text>
            <View style={gridStyle}>
              {attention.map((info) => {
                const m = info.lead!;
                const pts = seriesOf(m.key, reports);
                const dir = trendDirection(pts.map((p) => p.v));
                const name = plainShort(m);
                const title = dir === 'up' || dir === 'down'
                  ? `${name}${josaSub(m, name)} ${dir === 'up' ? '올랐어요' : '내렸어요'}`
                  : `${name}${josaTop(m, name)} 기준 밖이에요`;
                const latestV = reports[reports.length - 1].values[m.key];
                const sd = isFiniteNum(latestV) ? side(m, latestV) : 'in';
                const sub = sd === 'low' ? '기준에 못 미쳐요' : '기준을 넘었어요';
                return (
                  <Pressable
                    key={info.group.title}
                    onPress={() => setOpenGroup(info.group.title)}
                    accessibilityRole="button"
                    style={[cell, { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, paddingHorizontal: 18, paddingVertical: 16, backgroundColor: T.white, borderRadius: T.radius }]}
                  >
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: m.status === '위험' ? T.dangerBg : T.warnBg, alignItems: 'center', justifyContent: 'center' }}>
                      <Svg width={22} height={22} viewBox="0 0 22 22">
                        <Path d={dir === 'down' ? 'M3 7l5 5 4-3 7 8' : 'M3 15l5-5 4 3 7-8'} stroke={statusFill(m.status)} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: T.fs.strong, fontWeight: '800', color: T.text1 }}>{title}</Text>
                      <Text style={{ fontSize: T.fs.body, color: A11Y.sub, lineHeight: 24 }}>{sub}</Text>
                    </View>
                    <Chevron />
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        <Text style={{ fontSize: T.fs.h3, fontWeight: '800', color: T.text1, marginTop: 6 }}>항목별로 보기</Text>
        <View style={gridStyle}>{tiles}</View>

        <Text style={{ fontSize: T.fs.caption, color: A11Y.sub, textAlign: 'center', marginTop: 4 }}>참고용이에요. 걱정되면 의료진과 상담해 보세요.</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false} style={{ backgroundColor: T.bg }}>
      {/* 등장 애니메이션은 홈·분석·검사 기록 탭과 같다 — 카드가 살짝 떠오르며(FadeInUp) 위에서부터 순서대로 나타난다. */}
      <FadeInUp delay={0}>
        <View style={{ paddingHorizontal: 20, paddingTop: 32, paddingBottom: 16 }}>
          <Text style={{ fontSize: 30, fontWeight: '800', color: T.text1, letterSpacing: -0.6 }}>히스토리</Text>
          <Text style={{ fontSize: T.fs.strong, color: A11Y.sub, lineHeight: 25, marginTop: 6 }}>해마다 어떻게 달라졌는지 봐요.</Text>
        </View>
      </FadeInUp>

      <FadeInUp delay={0}>
        <ScoreHero reports={reports} />
      </FadeInUp>

      {attention.length > 0 && (
        <FadeInUp delay={90}>
          <H2>먼저 확인하세요</H2>
          <View style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, overflow: 'hidden', marginBottom: 12 }}>
            {attention.map((info, i) => {
              const m = info.lead!;
              const pts = seriesOf(m.key, reports);
              const dir = trendDirection(pts.map((p) => p.v));
              const name = plainShort(m);
              const title = dir === 'up' || dir === 'down'
                ? `${name}${josaSub(m, name)} ${dir === 'up' ? '올랐어요' : '내렸어요'}`
                : `${name}${josaTop(m, name)} 기준 밖이에요`;
              const latestV = reports[reports.length - 1].values[m.key];
              const sd = isFiniteNum(latestV) ? side(m, latestV) : 'in';
              const sub = sd === 'low' ? '기준에 못 미쳐요' : '기준을 넘었어요';
              return (
                <Pressable
                  key={info.group.title}
                  onPress={() => setOpenGroup(info.group.title)}
                  accessibilityRole="button"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 18, minHeight: 84, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: T.divider }}
                >
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: m.status === '위험' ? T.dangerBg : T.warnBg, alignItems: 'center', justifyContent: 'center' }}>
                    <Svg width={22} height={22} viewBox="0 0 22 22">
                      <Path d={dir === 'down' ? 'M3 7l5 5 4-3 7 8' : 'M3 15l5-5 4 3 7-8'} stroke={statusFill(m.status)} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </Svg>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: T.fs.strong, fontWeight: '800', color: T.text1 }}>{title}</Text>
                    <Text style={{ fontSize: T.fs.body, color: A11Y.sub, lineHeight: 24 }}>{sub}</Text>
                  </View>
                  <Chevron />
                </Pressable>
              );
            })}
          </View>
        </FadeInUp>
      )}

      <FadeInUp delay={180}>
      <H2>항목별로 보기</H2>
      <View style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, overflow: 'hidden', marginBottom: 8 }}>
        {ordered.map((info, i) => (
          <ChartCard
            key={info.group.title}
            first={i === 0}
            group={info.group}
            lead={info.lead}
            reports={reports}
            metricDefinitions={metricDefinitions}
            open={openGroup === info.group.title}
            onOpenChange={(v) => setOpenGroup(v ? info.group.title : null)}
          />
        ))}
      </View>
      </FadeInUp>

      <FadeInUp delay={270}>
      <View style={{ paddingTop: 8 }}>
        {/* 또래 대비 변화 '속도' — 공단 표본의 같은 성별·연령대 평균 변화량과 내 변화 폭을 배수로 비교.
            배수는 또래 변화가 뚜렷할 때만(±0.5 이상) 나온다 — 0에 가까운 값으로 나누면 배수가 발산하므로. */}
        {paceCard}

        {highlightCard}
      </View>

      <Text style={{ fontSize: T.fs.caption, color: A11Y.sub, lineHeight: 21, paddingHorizontal: 20, paddingTop: 12 }}>
        참고용이에요. 걱정되면 의료진과 상담해 보세요.
      </Text>
      </FadeInUp>
    </ScrollView>
  );
}

// ─── 점수 히어로 ──────────────────────────────────────────

const GRADE_LABEL: Record<Status, string> = { 정상: '양호', 주의: '주의 필요', 위험: '관리 필요' };

/** 점수 추이 한 줄 결론 — «바닥 이후»를 먼저 말한다("2020년 이후 점수가 오르고 있어요."). */
export function scoreConclusion(series: { year: number; score: number }[]): { lead: string; main: string; ink: string } {
  const last = series[series.length - 1];
  let trough = 0;
  for (let i = 1; i < series.length; i++) if (series[i].score <= series[trough].score) trough = i;
  if (series.length < 2) return { lead: '', main: '이번 검진 점수예요.', ink: T.text1 };
  if (trough < series.length - 1 && last.score > series[trough].score) {
    return { lead: `${series[trough].year}년 이후 `, main: '점수가 오르고 있어요.', ink: A11Y.success };
  }
  const diff = last.score - series[0].score;
  if (diff < 0) return { lead: '', main: '점수가 내려가고 있어요.', ink: A11Y.danger };
  if (diff > 0) return { lead: '', main: '점수가 오르고 있어요.', ink: A11Y.success };
  return { lead: '', main: '점수가 그대로예요.', ink: T.text1 };
}

/** 점수 숫자가 0에서 올라온다 — 분석 탭 AnimatedScore와 같은 값(700ms, easeOutCubic). */
function useCountUp(target: number): number {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    anim.setValue(0);
    const id = anim.addListener(({ value }) => setDisplay(Math.round(value)));
    Animated.timing(anim, { toValue: target, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => anim.removeListener(id);
  }, [target]);
  return display;
}

/** 점수 추이 — 큰 점수 + 배지 + 한 줄 결론 + 단순한 그래프(처음·바닥·지금 세 숫자만).
 *
 * 검사 항목이 빠진 해는 점선 원으로 그린다. 참고 점수는 판정된 항목만 감점하므로 검사가 적은 해는
 * 점수가 높게 나와, 표시가 없으면 "검사를 안 받아서 좋아진 것처럼" 읽힌다. 범례는 문장 대신
 * 그래프의 점과 같은 모양의 아이콘 + 짧은 말이다. */
function ScoreHero({ reports, tablet = false }: { reports: Report[]; tablet?: boolean }) {
  const series = useMemo(() => scoreSeries(reports), [reports]);
  const lastScore = series.length ? series[series.length - 1].score : 0;
  const shown = useCountUp(lastScore);   // 훅은 early return 앞에서 부른다
  if (series.length < 1) return null;
  const last = series[series.length - 1];
  const grade = scoreGrade(last.score);
  const ink = statusInk(grade);
  const concl = scoreConclusion(series);
  const hasGap = series.some((p) => !p.complete);

  if (tablet) {
    // 태블릿 — 왼쪽에 점수·배지·한 줄 결론, 오른쪽에 추이 그래프를 한 카드로 묶는다.
    return (
      <View style={{ backgroundColor: T.white, borderRadius: T.radius, padding: 22, flexDirection: 'row', alignItems: 'stretch', gap: 20 }}>
        <View style={{ width: 188 }}>
          <Text style={{ fontSize: 64, fontWeight: '800', lineHeight: 70, color: statusFill(grade), letterSpacing: -1 }}>
            {shown}<Text style={{ fontSize: T.fs.h3, fontWeight: '800' }}>점</Text>
          </Text>
          <View style={{ alignSelf: 'flex-start', marginTop: 6 }}><StatusChip status={grade} label={GRADE_LABEL[grade]} /></View>
          <Text style={{ fontSize: T.fs.strong, fontWeight: '800', lineHeight: 27, marginTop: 14, color: T.text1 }}>
            {concl.lead}<Text style={{ color: concl.ink }}>{concl.main}</Text>
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
          {series.length >= 2 && <MeasuredChart><ScoreChart series={series} /></MeasuredChart>}
          {series.length >= 2 && hasGap && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <Svg width={20} height={20} viewBox="0 0 20 20">
                <Circle cx={10} cy={10} r={7.5} fill="#fff" stroke="#191F28" strokeWidth={2.5} strokeDasharray="3.5 3" />
              </Svg>
              <Text style={{ fontSize: T.fs.body, color: A11Y.sub, lineHeight: 22 }}>일부 검사가 빠진 해예요</Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, padding: 20, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
        <Text style={{ fontSize: 60, fontWeight: '800', lineHeight: 64, color: statusFill(grade), letterSpacing: -1 }}>
          {shown}<Text style={{ fontSize: T.fs.title, fontWeight: '700' }}>점</Text>
        </Text>
        <View style={{ marginBottom: 10 }}><StatusChip status={grade} label={GRADE_LABEL[grade]} /></View>
      </View>
      <Text style={{ fontSize: T.fs.h3, fontWeight: '800', lineHeight: 30, marginTop: 10, color: T.text1, letterSpacing: -0.3 }}>
        {concl.lead}<Text style={{ color: concl.ink }}>{concl.main}</Text>
      </Text>
      {series.length >= 2 && <ScoreChart series={series} />}
      {series.length >= 2 && hasGap && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <Svg width={20} height={20} viewBox="0 0 20 20">
            <Circle cx={10} cy={10} r={7.5} fill="#fff" stroke="#191F28" strokeWidth={2.5} strokeDasharray="3.5 3" />
          </Svg>
          <Text style={{ fontSize: T.fs.body, color: A11Y.sub, lineHeight: 22 }}>일부 검사가 빠진 해예요</Text>
        </View>
      )}
    </View>
  );
}

function ScoreChart({ series }: { series: { year: number; score: number; complete: boolean }[] }) {
  const reveal = useChartReveal(series.length, 1000, 150);
  const CHART_W = useChartW(CHART_W0);
  const H = 190;
  const pad = { top: 22, right: 8, bottom: 34, left: 8 };
  const plotW = CHART_W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const n = series.length;
  const x = (i: number) => pad.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (s: number) => pad.top + (1 - s / 100) * plotH;
  const lastI = n - 1;
  let trough = 0;
  for (let i = 1; i < n; i++) if (series[i].score <= series[trough].score) trough = i;
  const last = series[lastI];
  const lastGrade = scoreGrade(last.score);

  // 숫자·연도 라벨은 처음 · 바닥 · 지금 셋만. 바닥이 처음/끝에 붙어 있으면 겹치므로 뺀다.
  const near = (a: number, b: number) => Math.abs(x(a) - x(b)) < 44;
  const keyIdx = [0, ...(trough !== 0 && trough !== lastI && !near(trough, 0) && !near(trough, lastI) ? [trough] : []), lastI];
  const anchorOf = (i: number) => (i === 0 ? 'start' : i === lastI ? 'end' : 'middle');
  const desc = `점수 추이: ${series.map((p) => `${p.year}년 ${p.score}점`).join(', ')}`;

  // 구간 색 띠 — 70↑ 양호, 40↑ 주의, 그 아래 관리 필요. 현재 구간 이름만 그림 안에 적는다.
  const zones: { from: number; to: number; bg: string; name: Status }[] = [
    { from: 100, to: 70, bg: T.successBg, name: '정상' },
    { from: 70, to: 40, bg: T.warnBg, name: '주의' },
    { from: 40, to: 0, bg: T.dangerBg, name: '위험' },
  ];

  return (
    <View accessible accessibilityLabel={desc} style={{ marginTop: 14 }}>
      <Svg width={CHART_W} height={H}>
        {zones.map((z) => (
          <G key={z.name}>
            <Rect x={pad.left - 2} y={y(z.from)} width={plotW + 4} height={y(z.to) - y(z.from)} fill={z.bg} />
            {z.name === lastGrade && (
              <SvgText x={pad.left + 6} y={y(z.to) - 8} fontSize={T.fs.caption} fontWeight="700" fill={statusInk(z.name)}>{GRADE_LABEL[z.name]}</SvgText>
            )}
          </G>
        ))}
        <Defs>
          <ClipPath id="score-reveal">
            <Rect x={0} y={0} width={CHART_W * reveal} height={H} />
          </ClipPath>
        </Defs>
        <G clipPath="url(#score-reveal)">
        <Path
          d={series.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.score)}`).join(' ')}
          stroke={LINE} strokeWidth={3.5} fill="none" strokeLinecap="round" strokeLinejoin="round"
        />
        {/* 검사가 빠진 해 — 점선 원 */}
        {series.map((p, i) => !p.complete && (
          <Circle key={`gap${p.year}`} cx={x(i)} cy={y(p.score)} r={8} fill="#fff" stroke={LINE} strokeWidth={2.5} strokeDasharray="3.5 3" />
        ))}
        {/* 처음·바닥·지금 점 */}
        {keyIdx.filter((i) => series[i].complete).map((i) => (
          <Circle key={`dot${i}`} cx={x(i)} cy={y(series[i].score)} r={i === lastI ? 8 : 6} fill={i === lastI ? LINE : '#fff'} stroke={i === lastI ? '#fff' : LINE} strokeWidth={i === lastI ? 2.5 : 3} />
        ))}
        {keyIdx.map((i) => {
          const p = series[i];
          const below = i === trough && i !== 0 && i !== lastI;       // 바닥 숫자는 점 아래에
          const ty = below ? y(p.score) + 26 : Math.max(16, y(p.score) - 14);
          return (
            <SvgText
              key={`v${i}`}
              x={i === 0 ? x(i) + 14 : i === lastI ? x(i) - 12 : x(i)}
              y={ty}
              fontSize={T.fs.body}
              fontWeight="800"
              textAnchor={i === 0 ? 'start' : i === lastI ? 'end' : 'middle'}
              fill={LINE_TEXT}
            >
              {p.score}
            </SvgText>
          );
        })}
        {keyIdx.map((i) => (
          <SvgText key={`y${i}`} x={x(i)} y={H - 8} fontSize={T.fs.body} fill={A11Y.sub} textAnchor={anchorOf(i)}>{series[i].year}</SvgText>
        ))}
        </G>
      </Svg>
    </View>
  );
}

// ─── 묶음 한 행 + 2뎁스 상세 ──────────────────────────────

function ChartCard({ group, lead, reports, metricDefinitions, first, open, onOpenChange }: {
  group: Group; lead: MetricDefinition | null; reports: Report[]; metricDefinitions: MetricDefinition[];
  first?: boolean; open: boolean; onOpenChange: (v: boolean) => void;
}) {
  const defByKey = (k: MetricKey) => metricDefinitions.find((d) => d.key === k);
  const measuredIdx = (k: MetricKey) => reports.map((r, i) => (isFiniteNum(r.values[k]) ? i : -1)).filter((i) => i >= 0);
  // 탭에는 이 묶음에서 한 번이라도 잰 항목만 — 연도를 옮겨도 탭이 사라지지 않게 연도와 무관하게 정한다.
  const tabKeys = group.keys.filter((k) => !!defByKey(k) && measuredIdx(k).length > 0);

  // 보기 상태: 항목(pick)과 연도(selIdx). 고른 항목을 안 잰 해에 있으면 가장 가까운 잰 해로 붙는다.
  const [pick, setPick] = useState<MetricKey | null>(null);
  const [selIdx, setSelIdx] = useState(reports.length - 1);
  // 기본 항목은 «최신 연도로 고정한 대표 항목» — 연도를 옮긴다고 기준이 갈아타면 안 된다.
  const focusKey: MetricKey | undefined =
    pick && tabKeys.includes(pick) ? pick : lead && tabKeys.includes(lead.key) ? lead.key : tabKeys[0];

  const snap = (i: number, k: MetricKey | undefined) => {
    if (!k) return i;
    const ms = measuredIdx(k);
    if (!ms.length || ms.includes(i)) return i;
    return ms.reduce((best, m) => (Math.abs(m - i) < Math.abs(best - i) ? m : best), ms[0]);
  };
  const idx = snap(selIdx, focusKey);
  const r = reports[idx];

  const yearMetrics = useMemo(() => (r ? metricsForReport(r, metricDefinitions) : []), [r, metricDefinitions]);
  const focus = focusKey ? yearMetrics.find((m) => m.key === focusKey) ?? defByKey(focusKey) : undefined;
  const value = focus && r ? r.values[focus.key] : undefined;
  const focusStatus: Status | undefined = focus?.status;

  // 1뎁스 한 줄·배지는 «최신 연도 대표» 기준 — 모달에서 연도를 보고 나와도 행이 바뀌면 안 된다.
  const summary = useMemo(() => rowSummary(lead, reports), [lead, reports]);
  const badge = lead ? <StatusChip status={lead.status} /> : undefined;

  const trend = useMemo(() => trendDirection(focus ? seriesOf(focus.key, reports).map((p) => p.v) : []), [focus, reports]);
  const c = cardContentFor(group.title, trend, focusStatus);
  const headline = detailHeadline(focus, reports);
  const peer = focus && isFiniteNum(value) ? metricPeerRank(focus, value) : null;

  const labelOf = (k: MetricKey) => {
    const m = defByKey(k)!;
    const short = plainShort(m);
    // 간 수치(AST/ALT/감마-GTP)처럼 쉬운 이름이 같으면 용어를 붙여 구분한다.
    const dup = tabKeys.some((o) => o !== k && plainShort(defByKey(o)!) === short);
    return dup ? (metricPlainName[k]?.text ?? m.shortName) : short;
  };

  const measured = focus ? measuredIdx(focus.key) : [];
  const prevIdx = [...measured].reverse().find((i) => i < idx);
  const nextIdx = measured.find((i) => i > idx);
  const inkNow = statusInk(focusStatus);

  const sd = focus && isFiniteNum(value) ? side(focus, value) : 'in';
  const statusText = focusStatus === '정상' ? '정상이에요' : sd === 'low' ? '정상보다 낮아요' : '정상보다 높아요';
  const dirHint = focus
    ? metricDirection(focus) === 'high' ? '낮을수록 좋아요.' : metricDirection(focus) === 'low' ? '높을수록 좋아요.' : '정상 범위 안에 있으면 좋아요.'
    : '';

  const valueArea = !focus || !r ? (
    <Text style={{ fontSize: T.fs.body, color: A11Y.sub, textAlign: 'center', paddingVertical: 16 }}>이 항목들은 기록된 검진에서 측정하지 않았어요.</Text>
  ) : (
    <View>
      {/* 항목 탭 — 2열, 52px */}
      {tabKeys.length > 1 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
          {tabKeys.map((k) => {
            const on = k === focus.key;
            return (
              <Pressable
                key={k}
                onPress={() => setPick(k)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={{ width: '48.5%', minHeight: 52, borderRadius: T.radiusMd, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, backgroundColor: on ? T.text1 : T.cardAlt }}
              >
                <Text style={{ fontSize: T.fs.body, fontWeight: '700', color: on ? '#fff' : A11Y.sub, textAlign: 'center' }}>{labelOf(k)}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <LineChart
        metricKey={focus.key}
        selIdx={idx}
        onSelect={(i) => setSelIdx(snap(i, focus.key))}
        reports={reports}
        band={normalBounds(focus)}
        bandLabel={/\d/.test(focus.normalText ?? '') ? `정상 (${normalPhrase(focus)})` : undefined}
        desc={`${labelOf(focus.key)} 추이`}
      />

      {/* 이전 해 / 다음 해 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 }}>
        <StepButton label="이전 해" dir="prev" disabled={prevIdx == null} onPress={() => prevIdx != null && setSelIdx(prevIdx)} />
        <Text style={{ width: 96, textAlign: 'center', fontSize: T.fs.h3, fontWeight: '800', color: T.text1 }}>{r.year}년</Text>
        <StepButton label="다음 해" dir="next" disabled={nextIdx == null} onPress={() => nextIdx != null && setSelIdx(nextIdx)} />
      </View>

      {/* 값 + 배지 */}
      {isFiniteNum(value) && (
        <FadeIn key={`${focus.key}-${idx}`} duration={260}>
        <View style={{ backgroundColor: '#F7F8FA', borderRadius: 16, padding: 16, marginTop: 16 }}>
          <Text style={{ fontSize: 34, fontWeight: '800', color: T.text1, letterSpacing: -0.5 }}>
            {value}
            {!!focus.unit && <Text style={{ fontSize: T.fs.strong, fontWeight: '500', color: A11Y.sub }}> {focus.unit}</Text>}
          </Text>
          <View style={{ marginTop: 8 }}><StatusChip status={focusStatus ?? '정상'} label={statusText} /></View>
          {!!dirHint && <Text style={{ fontSize: T.fs.body, color: A11Y.sub, lineHeight: 24, marginTop: 10 }}>{dirHint}</Text>}
        </View>
        </FadeIn>
      )}
    </View>
  );

  return (
    <SummaryCard
      tabletResponsive
      variant="row"
      first={first}
      open={open}
      onOpenChange={onOpenChange}
      title={group.title}
      summary={summary}
      badge={badge}
      detailSummary={headline}
      definition={c?.definition}
      whyLines={focus && isFiniteNum(value) ? whyLinesFor(focus, value) : undefined}
      detail={c?.detail}
      meaning={c?.meaning}
      tips={c?.tips}
      valueArea={valueArea}
      axes={focus && peer ? ['peer'] : []}
      positionExtra={focus && peer ? (
        <PeerRankBlock subject={labelOf(focus.key)} color={inkNow} {...peer} />
      ) : undefined}
    />
  );
}

function StepButton({ label, dir, disabled, onPress }: { label: string; dir: 'prev' | 'next'; disabled: boolean; onPress: () => void }) {
  const ink = disabled ? '#B0B8C1' : T.text1;
  const arrow = (
    <Svg width={18} height={18} viewBox="0 0 20 20">
      <Path d={dir === 'prev' ? 'M13 4l-6 6 6 6' : 'M7 4l6 6-6 6'} stroke={ink} strokeWidth={2.2} fill="none" strokeLinecap="round" />
    </Svg>
  );
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={{ flex: 1, minHeight: 52, borderRadius: T.radiusMd, backgroundColor: T.cardAlt, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
    >
      {dir === 'prev' && arrow}
      <Text style={{ fontSize: T.fs.body, fontWeight: '700', color: ink }}>{label}</Text>
      {dir === 'next' && arrow}
    </Pressable>
  );
}

// ─── 항목 그래프 — 한 항목, 정상 띠, 선택한 해의 값만 크게 ─────────────────

const CH = 190;
const PAD = { top: 34, right: 12, bottom: 34, left: 12 };
const PLOT_H = CH - PAD.top - PAD.bottom;

function LineChart({ metricKey, selIdx, onSelect, reports, band, bandLabel, desc }: {
  metricKey: MetricKey; selIdx: number; onSelect: (i: number) => void; reports: Report[];
  band?: { low?: number; high?: number } | null;
  bandLabel?: string;
  desc: string;
}) {
  const reveal = useChartReveal(metricKey, 900);
  const CHART_W = useChartW(CHART_W0);
  const PLOT_W = CHART_W - PAD.left - PAD.right;   // 항목 탭을 바꿀 때만 다시 그린다 — 연도를 고를 때는 아니다
  const pts = reports
    .map((rep, i) => ({ idx: i, v: rep.values[metricKey], year: rep.year }))
    .filter((p): p is { idx: number; v: number; year: number } => isFiniteNum(p.v));
  // 밴드 경계도 범위에 넣는다 — 축 밖으로 밀리면 정작 기준선이 안 보인다. (low:0은 «하한 없음»)
  const edges = [band?.low, band?.high].filter((v): v is number => v != null && v > 0);
  const all = [...pts.map((p) => p.v), ...edges];
  const mn = Math.min(...all);
  const mx = Math.max(...all);
  const padV = (mx - mn || Math.abs(mx) * 0.1 || 1) * 0.15;
  const lo = mn - padV;
  const hi = mx + padV;
  const y = (v: number) => PLOT_H - ((v - lo) / (hi - lo)) * PLOT_H;
  const cy = (v: number) => Math.max(0, Math.min(PLOT_H, y(v)));
  const n = reports.length;
  const x = (i: number) => (n === 1 ? PLOT_W / 2 : (i / (n - 1)) * PLOT_W);

  const { ref: chartRef, onLayout: onChartLayout, localX } = useChartTouchX();
  const handleTouch = (evt: any) => {
    const raw = localX(evt);
    if (raw == null || n <= 1) return;
    const ratio = Math.min(1, Math.max(0, (raw - PAD.left) / PLOT_W));
    onSelect(Math.round(ratio * (n - 1)));
  };

  // 정상 띠: 위·아래 경계를 값으로 잡아 그린다(경계가 없는 쪽은 그래프 끝까지).
  const bandTop = band?.high != null ? cy(Math.min(band.high, hi)) : 0;
  const bandBottom = band?.low != null && band.low > 0 ? cy(Math.max(band.low, lo)) : PLOT_H;
  const showBand = !!band && bandBottom - bandTop > 1;
  const bandAtTop = !!band && band.high == null;   // «이상» 기준이면 띠가 위쪽

  const labelY = bandAtTop ? bandTop + 20 : bandBottom - 8;
  const labelRight = pts.length > 1 && Math.abs(y(pts[pts.length - 1].v) - labelY) > Math.abs(y(pts[0].v) - labelY);

  const sel = pts.find((p) => p.idx === selIdx);
  const firstP = pts[0];
  const lastP = pts[pts.length - 1];
  // 연도 눈금 — 잰 해마다 눈금과 연도를 단다. 자리가 모자라면(라벨 폭 약 44px) 건너뛰되
  // 처음·끝·고른 해는 항상 남기고, 그 곁의 이웃 라벨은 겹치지 않게 뺀다.
  const LABEL_GAP = 44;
  const minGap = pts.length > 1 ? Math.min(...pts.slice(1).map((p, i) => x(p.idx) - x(pts[i].idx))) : LABEL_GAP;
  const stride = Math.max(1, Math.ceil(LABEL_GAP / Math.max(minGap, 1)));
  const must = new Set<number>([firstP.idx, lastP.idx, ...(sel ? [sel.idx] : [])]);
  const tickPts = pts.filter((p, i) => {
    if (must.has(p.idx)) return true;
    if (i % stride !== 0) return false;
    return [...must].every((m) => Math.abs(x(p.idx) - x(m)) >= LABEL_GAP);
  });

  return (
    <Pressable ref={chartRef} onLayout={onChartLayout} hitSlop={8} onPress={handleTouch} onTouchMove={handleTouch} accessible accessibilityLabel={desc}>
      <Svg width={CHART_W} height={CH}>
        <G x={PAD.left} y={PAD.top}>
          {showBand && (
            <G>
              <Rect x={0} y={bandTop} width={PLOT_W} height={bandBottom - bandTop} fill={NORMAL_BAND} />
              {!!bandLabel && (
                // 라벨이 선과 겹치지 않게 — 선이 더 먼 쪽(처음/끝)에 붙인다.
                <SvgText
                  x={labelRight ? PLOT_W - 6 : 6}
                  y={labelY}
                  fontSize={T.fs.body}
                  fontWeight="700"
                  fill={BAND_TEXT}
                  textAnchor={labelRight ? 'end' : 'start'}
                >{bandLabel}</SvgText>
              )}
            </G>
          )}
          <Defs>
            <ClipPath id="line-reveal">
              <Rect x={-PAD.left} y={-PAD.top} width={(PLOT_W + PAD.left + PAD.right) * reveal} height={CH} />
            </ClipPath>
          </Defs>
          <G clipPath="url(#line-reveal)">
          <Path
            d={pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.idx)},${y(p.v)}`).join(' ')}
            stroke={LINE} strokeWidth={3.5} fill="none" strokeLinecap="round" strokeLinejoin="round"
          />
          {pts.map((p) => p.idx !== selIdx && <Circle key={p.idx} cx={x(p.idx)} cy={y(p.v)} r={5} fill="#fff" stroke={LINE} strokeWidth={2.5} />)}
          {sel && (
            <G>
              <Circle cx={x(sel.idx)} cy={y(sel.v)} r={12} fill={LINE} opacity={0.2} />
              <Circle cx={x(sel.idx)} cy={y(sel.v)} r={8} fill={LINE} stroke="#fff" strokeWidth={2.5} />
              {/* 숫자는 고른 해 하나만 크게 — 나머지는 아래 값 영역이 말한다. 가장자리에선 안쪽으로 붙인다. */}
              <SvgText
                x={sel.idx === 0 ? x(sel.idx) - 4 : sel.idx === n - 1 ? x(sel.idx) + 4 : x(sel.idx)}
                y={y(sel.v) - 18 < -14 ? y(sel.v) + 32 : y(sel.v) - 18}
                fontSize={T.fs.strong}
                fontWeight="800"
                fill={LINE_TEXT}
                textAnchor={sel.idx === 0 ? 'start' : sel.idx === n - 1 ? 'end' : 'middle'}
              >
                {sel.v}
              </SvgText>
            </G>
          )}
          </G>
          {/* 고른 해 안내선 — 점에서 연도 눈금까지 */}
          {sel && <Line x1={x(sel.idx)} y1={y(sel.v)} x2={x(sel.idx)} y2={PLOT_H} stroke={LINE} strokeWidth={1.5} strokeDasharray="3 3" opacity={0.5} />}
          {/* 연도 눈금 + 라벨 — 잰 해마다 */}
          <Line x1={0} y1={PLOT_H} x2={PLOT_W} y2={PLOT_H} stroke="#D9DCE1" strokeWidth={1} />
          {tickPts.map((p) => {
            const isSel = !!sel && p.idx === sel.idx;
            return (
              <G key={`yr${p.idx}`}>
                <Line x1={x(p.idx)} y1={PLOT_H} x2={x(p.idx)} y2={PLOT_H + (isSel ? 7 : 5)} stroke={isSel ? T.text1 : '#8B95A1'} strokeWidth={isSel ? 2 : 1} />
                <SvgText
                  x={x(p.idx)}
                  y={PLOT_H + 26}
                  fontSize={T.fs.body}
                  fontWeight={isSel ? '800' : '500'}
                  fill={isSel ? T.text1 : A11Y.sub}
                  textAnchor={p.idx === 0 ? 'start' : p.idx === n - 1 ? 'end' : 'middle'}
                >{p.year}</SvgText>
              </G>
            );
          })}
        </G>
      </Svg>
    </Pressable>
  );
}
