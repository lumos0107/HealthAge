import { useGridCell, useLayout } from '../responsive';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { AnimatedScore, Eyebrow, FadeIn, FadeInUp, GridCellContext, T } from '../components/UI';
import { Expandable, PeerRankBlock, ScoreCalcNote, scoreTone, SummaryCard } from '../components/v2';
import { formatMetricValue, metricPeerRank, rankFromPercentile, sortByAttention } from '../interpret';
import type { PositionAxis } from '../interpret';
import { NextCheckupGoal } from '../components/NextCheckupGoal';
import { calcGloss, cardContent, computeGroupsForReport, FATTY_LIVER_TYPE_CRITERIA, metricLabel, metricsForReport } from '../data';
import type { MetricDefinition, Report } from '../data';
import type { RealRecommendations, RealEgfr, RealComboAnalysis, RealCalcItem, RealComboGroup, RealSingleGroup, RealAscvdSimulation } from '../health';
import { ACTIONS, rankActions } from '../lifestyleActions';
import { analysisSummary, levelSummary, worstInterpretation } from '../analysisSummary';
import type { Ctx } from '../lifestyleActions';

/** 장기 구획 — ②층 카드 6장을 신장/간/대사·지질/심혈관으로 나누는 «덩어리 표시».
 *
 *  ⚠️ 한 번 지웠다가 되살렸다(2026-08-02). 카드 이름을 질문형으로 바꾸고 나니
 *  「신장 / 콩팥이 잘 거르고 있나」가 같은 말을 두 번 하는 것처럼 보여 지웠는데,
 *  머리말이 하던 일은 이름표만이 아니라 **덩어리 나누기**였다. 지우니 6장이 균일한
 *  목록이 되어 어디까지가 간이고 어디부터 대사인지 눈으로 잡을 게 없어졌다.
 *
 *  무게를 낮춰(11pt 회색) 보기도, 가운데로 옮겨 보기도 했는데 둘 다 원래만 못했다.
 *  작은 회색은 카드에 눌려 구획이 안 잡히고, 가운데 정렬은 카드 제목과 세로선이
 *  어긋나 화면이 흔들린다. 왼쪽·크게·진하게가 «덩어리의 시작»을 가장 잘 말한다.
 *  중복 걱정(「신장 / 콩팥이 잘 거르고 있나」)은 실제로는 거슬리지 않았다 —
 *  머리말은 구획을 말하고 카드는 질문을 말해서 읽는 층위가 다르다. */
/** 태블릿 2뎁스(design-d) — 한 층의 카드들을 히스토리 태블릿 «항목별로 보기»처럼 2열 카드 격자로 놓는다.
 *  on이 아니면(폰·태블릿 전체 보기) 아무것도 감싸지 않고 원래 세로 흐름 그대로 둔다.
 *  ⚠️ 자식은 Fragment로 묶지 말고 바로 넘긴다 — Children.toArray는 Fragment를 펼치지 않아 한 칸이 된다. */
function LayerGrid({ on, children }: { on: boolean; children: React.ReactNode }) {
  // 마지막 홀수 칸도 반 폭을 유지한다. 칸 폭은 잰 값으로(useGridCell — calc()는 APK에서 안 됨).
  const { onLayout, cell } = useGridCell(2);
  if (!on) return <>{children}</>;
  return (
    <GridCellContext.Provider value>
      <View onLayout={onLayout} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginHorizontal: 16, marginTop: 8 }}>
        {React.Children.toArray(children).map((child, i) => <View key={i} style={cell}>{child}</View>)}
      </View>
    </GridCellContext.Provider>
  );
}

function DomainHeader({ title }: { title: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 16, marginTop: 16, marginBottom: 6 }}>
      <Text style={{ fontSize: T.fs.body, fontWeight: '800', color: T.text1 }}>{title}</Text>
    </View>
  );
}

/** 층 머리말 — 이 화면은 네 층으로 읽힌다: ① 판정 → ② 파생 → ③ 위치 → ④ 행동.
 *  그동안 머리말이 장기별(신장/간/대사지질/심혈관)뿐이라 네 층과 직교했고, 그래서
 *  "이 카드는 지금 무슨 일을 하고 있나"가 화면에 드러나지 않았다. 장기 머리말은
 *  ②층 안의 소제목으로 남기고, 층은 그 위에 얹는다. */
function LayerHeader({ step, title, sub, first }: { step: string; title: string; sub: string; first?: boolean }) {
  return (
    // 첫 층은 위 구분선과 큰 여백을 두지 않는다 — 바로 위가 페이지 헤더라 «층과 층 사이»가
    // 아니고, 그대로 두면 제목과 ①층이 60px 넘게 벌어져 화면 위쪽이 비어 보인다.
    <View style={first
      ? { marginHorizontal: 16, marginTop: 18, marginBottom: 4 }
      : { marginHorizontal: 16, marginTop: 26, marginBottom: 4, paddingTop: 18, borderTopWidth: 1, borderTopColor: T.divider }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <Text style={{ fontSize: T.fs.body, fontWeight: '800', color: T.primaryText }}>{step}</Text>
        <Text style={{ fontSize: T.fs.strong, fontWeight: '800', color: T.text1, letterSpacing: -0.3 }}>{title}</Text>
      </View>
      <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginTop: 4 }}>{sub}</Text>
    </View>
  );
}

/** 분석 탭의 네 층 — **이름은 여기 한 곳에만 둔다.**
 *  층 머리말(LayerHeader)과 상단 자기소개(TabIntroNote)가 같은 값을 참조하므로,
 *  이름을 바꿔도 두 곳이 조용히 갈라지지 않는다(A4에서 ③층 이름을 한 번 바꿨다).
 *  intro는 '이 탭이 무엇을 하나'를 말하는 문장이라, 구획을 표시하는 머리말 sub와 따로 둔다. */
const LAYERS = [
  { step: '①', title: '기준을 벗어났나', intro: '그 해 검진 수치가 학회 기준 안에 있는지 가립니다.' },
  { step: '②', title: '검진지에 없는 값을 만들어요', intro: '여러 수치를 묶어 결과지에 없던 지표를 계산합니다. 크레아티닌·나이·성별을 묶으면 신장 여과율이 되는 식이에요.' },
  { step: '③', title: '같은 또래는 어떤가', intro: '공단 표본 1,596만 건에서 같은 성별·연령대를 골라 견줍니다.' },
  { step: '④', title: '그래서 뭘 하면 되나', intro: '①~③에서 나온 것을 행동과 다음 검진 목표로 옮깁니다.' },
];

/** 탭 자기소개 — 네 층이 각각 무슨 일을 하는지. 제목 바로 아래 왼쪽 버튼으로 둔다.
 *
 *  ⚠️ 예전에는 «가운데 정렬 + 위쪽 구분선»이었다. 그때는 바로 위에 결론 문장이 있어서
 *  구분선이 «결론과 부가설명»을 가르는 역할을 했는데, 결론을 점수 카드로 내리고 나니
 *  구분선이 제목과 버튼을 가르는 모양이 되고 가운데 정렬된 글자만 여백에 떠 있었다.
 *  버튼은 왼쪽 정렬이 기본이다 — 제목·층 머리말과 같은 세로선에 선다. */
function TabIntroNote({ title }: { title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Text style={{ fontSize: 34, fontWeight: '800', fontFamily: T.fontDisplay, color: T.text1, letterSpacing: -0.5, marginTop: 6 }}>{title}</Text>
      {/* 설명 줄 «자체»가 버튼이다. 알약 버튼을 따로 두면 한 줄을 통째로 차지해 세로 여백이
          늘고, 오른쪽 끝에 붙은 「보는 법」은 제목과 무관한 조각처럼 읽힌다.
          히스토리 탭도 제목 아래 같은 회색 한 줄을 두므로 두 탭의 머리 모양이 같아진다.
          차이는 여기만 누를 수 있다는 것이고, 그건 끝의 화살표가 말한다. */}
      <Pressable
        onPress={() => setOpen((v) => !v)}
        hitSlop={6}
        style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 6 }}
      >
        {/* 설명 뒤에 «누를 말»을 붙인다. 설명문만 두면 읽는 글로만 보여서 아무도 안 누른다 —
            화살표 하나로는 약하다. 진한 글씨가 여기가 누르는 자리라고 말한다. */}
        <Text style={{ flex: 1, fontSize: T.fs.caption, color: T.text3, lineHeight: 20 }}>
          검진 수치를 네 단계로 나눠 읽습니다.{'  '}
          <Text style={{ color: T.text2, fontWeight: '700' }}>{open ? '접기' : '분석 탭 보는 법'}</Text>
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={15} color={T.text3} style={{ marginTop: 2 }} />
      </Pressable>
      {open && (
        <View style={{ marginTop: 14 }}>
          {LAYERS.map((l) => (
            <View key={l.step} style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              <Text style={{ fontSize: T.fs.caption, fontWeight: '800', color: T.primaryText }}>{l.step}</Text>
              <Text style={{ flex: 1, fontSize: T.fs.caption, color: T.text2, lineHeight: 20 }}>
                <Text style={{ fontWeight: '700', color: T.text1 }}>{l.title}</Text> — {l.intro}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// 계산기 level → 상태색 (info=중립 회색, 나머지는 구간색)
const calcLevelColor = (level: string) => level === 'info' ? T.text3 : level === 'low' ? T.success : (level === 'high' || level === 'very_high') ? T.danger : T.warn;
const calcLevelBg = (level: string) => level === 'info' ? T.cardAlt : level === 'low' ? T.successBg : (level === 'high' || level === 'very_high') ? T.dangerBg : T.warnBg;

/** 계산기 item 리스트를 공통 행으로 렌더 — 값·상태뱃지·공식·기준·비고. 30년 위험 함께 표기. */
function CalcRows({ items }: { items: RealCalcItem[] }) {
  if (!items.length) return null;
  return (
    <>
      {items.map((it, i) => (
        <View key={it.key} style={[{ paddingVertical: 12 }, i > 0 && { borderTopWidth: 1, borderTopColor: T.divider }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 8 }}>
            <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text1, flex: 1 }}>{it.title}</Text>
            <View style={{ backgroundColor: calcLevelBg(it.level), paddingHorizontal: 8, paddingVertical: 3, borderRadius: T.radiusPill }}>
              <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: calcLevelColor(it.level) }}>{it.interpretation}</Text>
            </View>
          </View>
          {/* 뜻풀이 — 제목이 「AIP 죽상형성지수」·「METS-IR」처럼 전부 전문용어라 이게 없으면
              숫자가 무엇을 뜻하는지 알 수 없다. 신장·간은 카드가 지표 하나를 다뤄 ②가
              설명을 맡지만, 대사·지질 9종과 심혈관 4종은 한 카드에 여러 지표가 들어와
              ② 한 문장으로 덮이지 않는다. 값보다 «위»에 둔다 — 무엇인지 알고 숫자를 본다. */}
          {!!calcGloss[it.key] && (
            <Text style={{ fontSize: T.fs.caption, color: T.text2, lineHeight: 20, marginBottom: 4 }}>{calcGloss[it.key]}</Text>
          )}
          <Text style={{ fontSize: T.fs.h3, fontWeight: '800', color: T.text1 }}>
            {it.value}{it.unit ?? ''}{it.value_30yr != null ? `  ·  30년 ${it.value_30yr}%` : ''}
          </Text>
          {!!it.peer_label && (
            <View style={{ alignSelf: 'flex-start', marginTop: 6, backgroundColor: T.text1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: T.radiusPill }}>
              <Text style={{ fontSize: T.fs.caption, fontWeight: '800', color: '#fff' }}>또래비교 · {it.peer_label}</Text>
            </View>
          )}
          {!!it.cutoffs && <Text style={{ fontSize: T.fs.caption, color: T.text3, marginTop: 3 }}>기준: {it.cutoffs}</Text>}
          {/* 어느 입력이 끌어올렸나 — 계산기가 «내 값»으로 말해주는 유일한 자리다.
              값·기준 바로 아래에 둔다: 숫자를 보고 «왜 이렇게 나왔지»가 이어지는 순서다.
              끌어올린 것이 없으면 백엔드가 안 내려보내므로 여기서 빈칸이 생기지 않는다. */}
          {!!it.driver && (
            <Text style={{ fontSize: T.fs.caption, color: T.text2, lineHeight: 20, marginTop: 6 }}>{it.driver}</Text>
          )}
        </View>
      ))}
    </>
  );
}

/** 2.5뎁스 — 공식과 논문 인용. CalcRows에서 갈라 나온 짝이다.
 *
 *  축 2는 2뎁스에 공식을 금지한다(`De Ritis = AST / ALT`,
 *  `BARD = BMI≥28(1) + … [Harrison 2008]`). 그래서 예전에는 행을 통째로 접었는데,
 *  그러면 값과 판정까지 같이 숨어 «내 수치가 얼마인지»를 보려고 접기를 열어야 했다.
 *  가르는 선은 기록 39가 세운 그대로다 — **공식·학회 인용은 2.5뎁스, 컷오프는 값의
 *  «눈금»이라 2뎁스에 남긴다.** 눈금이 없으면 숫자를 읽을 수 없다(§7). */
function CalcFormulas({ items }: { items: RealCalcItem[] }) {
  const withText = items.filter((it) => it.formula || it.note);
  if (!withText.length) return null;
  return (
    <>
      {withText.map((it, i) => (
        <View key={it.key} style={{ marginTop: i === 0 ? 4 : 10 }}>
          <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text2 }}>{it.title}</Text>
          {!!it.formula && <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginTop: 2 }}>{it.formula}</Text>}
          {!!it.note && <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginTop: 2 }}>{it.note}</Text>}
        </View>
      ))}
    </>
  );
}

/** 2-2 나의 위치 — "같은 나이대 100명 중 N등". 백엔드 percentile은 누적분포(내 아래 몇 %)라
 *  값이 클수록 나쁜 계산기 지표에서는 그대로 등수가 된다(1등 = 가장 좋음).
 *  percentile이 있는 항목이 하나도 없으면 아무것도 그리지 않는다 — 등수를 지어내지 않는다.
 *  문장·근거 배지는 PeerRankBlock에 모아 두어 네 화면이 같은 모양으로 말한다. */
/** 기준을 벗어난 항목 중 «펼쳐 두는» 개수. 나머지는 「나머지 N개 보기」로 접는다.
 *  4로 잡은 이유: 홈 TOP 3보다 하나 많게 두어 «분석 탭이 더 자세하다»가 드러나되,
 *  아래 「상태로 보면」이 한 화면 안에 함께 보이는 선이다. */
const OFF_RANGE_HEAD = 4;

/** 기준을 벗어난 항목 한 줄 — 이름 · 값+단위 · 상태 배지 · 또래 등수.
 *
 *  또래 한 줄을 붙이는 이유 — 분석 탭 ③층 이름이 「같은 또래는 어떤가」인데, 정작
 *  **단순 검진 수치의 또래 비교는 검사항목 탭에만** 있었다. 그래서 「분석 탭이 또래와
 *  비교해준다」가 절반만 참이었다. 바로 아래 「상태로 보면」이 단일그룹마다
 *  「같은 또래는 100명 중 N명이 해당해요」를 붙이고 있으므로, 항목 쪽도 같은 모양으로 맞춘다.
 *
 *  ⚠️ 판정이 «주», 또래는 «보조»다. 등수는 배지 아래 작은 회색 줄로만 둔다 —
 *  기준을 벗어난 항목에 등수를 나란히 크게 쓰면 「또래 평균 근처면 괜찮다」로 읽히는데,
 *  그건 ③층 「또래 자체가 나빠졌나」가 경고하는 오독이다(기준선이 내려앉은 집단의 순위).
 *  어림값(estimateRank)이면 그 사실을 문장에 밝힌다 — 지어낸 등수로 보이면 안 된다. */
function OffRangeRow({ metric, report, first }: { metric: MetricDefinition; report: Report; first?: boolean }) {
  const bad = metric.status === '위험';
  const value = report.values[metric.key];
  const peer = typeof value === 'number' ? metricPeerRank(metric, value) : null;
  return (
    <View style={[{ paddingVertical: 9 }, !first && { borderTopWidth: 1, borderTopColor: T.divider }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: T.fs.caption, fontWeight: '600', color: T.text1, flex: 1 }}>{metric.name}</Text>
        <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: bad ? T.danger : T.warn }}>
          {formatMetricValue(metric, value)}
          <Text style={{ fontSize: T.fs.caption, fontWeight: '500', color: T.text3 }}>{metric.unit}</Text>
        </Text>
        <View style={{ backgroundColor: bad ? T.dangerBg : T.warnBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: T.radiusPill }}>
          <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: bad ? T.danger : T.warn }}>{metric.status}</Text>
        </View>
      </View>
      {!!peer && (
        <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginTop: 3 }}>
          같은 또래 100명 중 {peer.rank}등{peer.measured ? '' : ' (어림)'}이에요
        </Text>
      )}
    </View>
  );
}

/** 계산기 카드의 ③ 비교축 — 기준(구간 배지)은 항상 있고, 또래 등수는 표본이 있는 항목에만 붙는다.
 *  ⚠️ 정적으로 ['standard','peer']를 적으면 CalcRankBlock이 null인 해에도 «또래»를 선언한 셈이 된다.
 *  실제로 그려진 것만 담는다 — 안 그러면 제목이 화면에 없는 비교를 말하게 된다. */
const calcAxes = (items: RealCalcItem[]): PositionAxis[] =>
  items.some((x) => x.percentile != null) ? ['standard', 'peer'] : ['standard'];

/** 등수로 말할 지표를 고르는 순서. 백분위는 «컷오프가 확립되지 않은» 5종에만 붙는데
 *  (TyG·METS-IR·AIP·LAP·VAI), 배열 순서대로 집으면 lipid이 먼저라 늘 AIP가 뽑혔다.
 *  정작 카드가 대표로 내세운 지표(부제 `TyG·Non-HDL`)는 밀려서, 2뎁스에서 「AIP 기준
 *  77등」을 읽는데 AIP가 무엇인지는 접힌 안에 있었다. 대표를 먼저 본다. */
const RANK_PREFERRED = ['tyg', 'non_hdl_c', 'map'];

function CalcRankBlock({ items }: { items: RealCalcItem[] }) {
  const ranked = items.filter((x) => x.percentile != null);
  const it = RANK_PREFERRED.map((k) => ranked.find((x) => x.key === k)).find(Boolean) ?? ranked[0];
  if (!it) return null;
  return (
    <View style={{ marginBottom: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: T.divider }}>
      <PeerRankBlock
        subject={it.title}
        rank={rankFromPercentile(it.percentile!)}
        color={calcLevelColor(it.level)}
        measured
        basis={[
          it.peer_label,
          it.peer_n ? `표본 ${it.peer_n.toLocaleString()}명` : null,
          it.peer_year ? `${it.peer_year}년 국가검진` : null,
        ].filter(Boolean).join(' · ')}
      />
    </View>
  );
}

/** ④-0 무엇부터 하면 되나 — 흩어진 행동을 한 줄로 세운다.
 *
 *  ⚠️ 같은 행동이 네 군데서 따로 나오고 있었다. 「금연」 하나가 분석 탭에서 다섯 번:
 *    ④ 맞춤 권장사항 「흡연은 모든 대사증후군 인자를 악화시킵니다」
 *    ② 심혈관 ⑤     「금연이 단일 항목 중 가장 크게 위험을 낮춰요」
 *    ③ 조합 ⑤       「대사 쪽과 혈관 쪽이 겹쳐 위험이 곱해져요…」
 *    ② 심혈관 ③     「금연했다면 8.9% (−6.8%p)」
 *    ④ 목표 세우기   quit_smoking 행동
 *  다섯 번 말하는데 **«그래서 금연부터 하라»고는 아무도 말하지 않았다.**
 *  ④층 이름이 「그래서 뭘 하면 되나」인데 정작 «뭘 먼저»가 없었다.
 *
 *  여기서 하는 일은 **행동을 새로 만드는 것이 아니라 모아서 순서를 매기는 것**이다.
 *  문구는 전부 기존 것을 그대로 쓴다(§2-1). 순서는 `rankActions` — 「기준 이탈도가
 *  얼마나 줄어드나」로 이미 계산하고 있었고, 지금까지 「목표 세우기」 모달 안에서만 쓰였다. */
const ACTION_KEYWORD: { re: RegExp; id: string }[] = [
  { re: /금연|담배|흡연/, id: 'quit_smoking' },
  { re: /절주|음주|술/, id: 'alcohol' },
  { re: /체중|허리|감량|비만/, id: 'weight' },
  { re: /운동/, id: 'aerobic' },
  { re: /나트륨|저염|소금/, id: 'sodium' },
  { re: /식단|탄수화물/, id: 'diet_liver' },
];
const actionIdFor = (text: string) => ACTION_KEYWORD.find((k) => k.re.test(text))?.id ?? null;

/** driver가 지목한 수치 이름 → 그 수치를 실제로 움직이는 행동을 찾기 위한 MetricKey.
 *  ⚠️ 백엔드 `_driver`가 쓰는 라벨과 짝이다. 한쪽을 바꾸면 다른 쪽도 바꿔야 한다. */
const DRIVER_TO_KEY: Record<string, string> = {
  '중성지방': 'triglyceride', '공복혈당': 'glucose', '총콜레스테롤': 'totalCholesterol',
  '낮은 HDL': 'hdl', '수축기혈압': 'sbp', '이완기혈압': 'dbp',
};

function ActionRoundup({ ranks, ctx, combos, ascvd, calcs }: {
  ranks: { id: string; reductionRatio: number; movedFactors: string[] }[];
  ctx: Ctx;
  combos: RealComboGroup[];
  ascvd: RealAscvdSimulation | null;
  calcs: RealCalcItem[];
}) {
  const why = new Map<string, { text: string; from: string }[]>();
  const add = (id: string | null, text: string, from: string) => {
    if (!id || !text) return;
    const arr = why.get(id) ?? [];
    if (!arr.some((x) => x.text === text)) arr.push({ text, from });
    why.set(id, arr);
  };

  // ① 조합 — 「둘을 같이 볼 때만 할 수 있는 말」
  for (const c of combos) {
    if (!c.action || (c.population?.observed_to_expected ?? 0) < COMBO_SYNERGY_MIN) continue;
    add(actionIdFor(c.action), c.action, `조합 · ${c.combo_name}`);
  }
  // ② 심혈관 what-if — 행동을 가정한 시나리오만. 「수축기혈압이 120이라면」은 수치 가정이라 뺀다.
  for (const s of ascvd?.scenarios ?? []) {
    const id = actionIdFor(s.name);
    if (!id || !/금연|절주|운동|체중/.test(s.name)) continue;
    add(id, `심혈관 10년 위험이 ${ascvd!.risk_percent}% → ${s.risk_percent}%로 내려가요`, '심혈관 시뮬레이션');
  }
  // ③ 계산기 driver — **1순위로 끌어올린 수치**를 움직이는 행동에만 붙인다.
  //
  // ⚠️ 처음엔 driver_metrics 전부를 대상으로 했더니 근거가 헐겁게 붙었다. 「담배 끊기」
  // 아래에 Non-HDL이 붙는 식인데, 금연이 그 수치를 조금 움직이는 것과 「총콜레스테롤이
  // 이 값을 끌어올렸다」는 별개다. 관련이 약한 것까지 딸려오면 목록이 길어지고
  // «왜 이게 여기 있지»가 된다. 1순위 하나로 좁힌다.
  for (const c of calcs) {
    if (!c.driver || !c.driver_metrics?.length) continue;
    const key = DRIVER_TO_KEY[c.driver_metrics[0]];
    if (!key) continue;
    for (const a of ACTIONS) {
      if (!ranks.some((r) => r.id === a.id)) continue;
      if (a.effects(ctx).some((e) => (e.from as string) === key)) {
        add(a.id, `${c.title} — ${c.driver}`, '계산 지표');
      }
    }
  }

  const rows = ranks.map((r) => ({ r, a: ACTIONS.find((x) => x.id === r.id)!, ev: why.get(r.id) ?? [] }))
    .filter((x) => x.a && x.ev.length > 0);
  if (!rows.length) return null;

  return (
    <FadeInUp delay={224}>
      {/* ②·④ 칸을 두지 않는다 — 제목이 곧 설명이고, 이 카드에서 읽을 것은 «순서와 근거»뿐이다.
          ⚠️ ④에 있던 오해 차단은 버리지 않고 맨 밑 회색 줄(footer)로 옮겼다. 1번에
          「유산소 운동」이 뜨는데 그걸 «의학적으로 가장 급한 것»으로 읽으면 위험하다.
          심혈관 카드의 한계를 footer로 내린 것과 같은 처리다(§2-1). */}
      <SummaryCard
        title="무엇부터 하면 되나"
        summary={`${rows[0].a.title(ctx)}부터가 가장 크게 움직여요`}
        axes={[]}
        footer={
          <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20 }}>
            여기 순서는 «수치를 얼마나 움직이나»로 매긴 것이지 의학적 우선순위가 아니에요. 복용 중인 약이나 진료 계획이 있으면 그쪽이 먼저입니다.
          </Text>
        }
        tipsExtra={
          <>
            {rows.map(({ r, a, ev }, i) => (
              <View key={a.id} style={[{ paddingTop: 12 }, i > 0 && { marginTop: 12, borderTopWidth: 1, borderTopColor: T.divider }]}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                  <Text style={{ fontSize: T.fs.body, fontWeight: '800', color: T.primaryText }}>{i + 1}</Text>
                  <Text style={{ fontSize: T.fs.body, fontWeight: '700', color: T.text1, flex: 1 }}>{a.title(ctx)}</Text>
                  {r.reductionRatio > 0 && (
                    <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.success }}>−{Math.round(r.reductionRatio * 100)}%</Text>
                  )}
                </View>
                {r.movedFactors.length > 0 && (
                  <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginTop: 2 }}>움직이는 기준: {r.movedFactors.join(' · ')}</Text>
                )}
                {/* 근거는 3개까지 — 넘으면 «왜 이걸 하나»가 아니라 목록 읽기가 된다.
                    조합·심혈관이 앞에 오도록 담는 순서를 지킨다. */}
                {ev.slice(0, 3).map((e, j) => (
                  <View key={j} style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                    <Text style={{ fontSize: T.fs.caption, color: T.text3 }}>·</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: T.fs.caption, color: T.text2, lineHeight: 20 }}>{e.text}</Text>
                      <Text style={{ fontSize: T.fs.caption, color: T.text3, marginTop: 1 }}>{e.from}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ))}
            <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginTop: 12 }}>
              −%는 대사증후군 5기준에서 벗어난 정도가 얼마나 줄어드는지예요. 효과 크기는 문헌값의 보수적인 끝을 씁니다.
            </Text>
          </>
        }
      />
    </FadeInUp>
  );
}

/** ③-0 또래 순위 모아 보기 — 「내가 또래 중 어디쯤인가」를 한 화면에서.
 *
 *  항목·그룹·계산기의 또래 비교가 각각 ①·①·②에 흩어져 있어, 「같은 또래는 어떤가」라는
 *  ③층에 정작 또래 비교가 없었다. 여기 모아 «가장 뒤처진 것»부터 세운다.
 *
 *  ⚠️ 원래 자리의 한 줄은 지우지 않는다 — 판정 옆의 것은 그 판정을 읽는 «맥락»이고,
 *  여기는 「어디쯤인가」라는 다른 질문이다. 읽는 목적이 달라 겹쳐도 중복이 아니다.
 *  ⚠️ 실측이 없으면(어림) 그 사실을 줄에 밝힌다 — 지어낸 등수로 보이면 안 된다. */
function PeerRankRoundup({ metrics, report, groups, prevalence, calcs }: {
  metrics: MetricDefinition[];
  report: Report;
  groups: RealSingleGroup[] | null;
  prevalence?: Record<string, { name: string; pct: number; n_eval: number }>;
  calcs: RealCalcItem[];
}) {
  // 항목 — 등수가 낮을수록(=100등에 가까울수록) 또래 중 나쁜 쪽이다.
  const metricRows = metrics
    .filter((m) => !m.infoOnly && typeof report.values[m.key] === 'number')
    .map((m) => ({ m, peer: metricPeerRank(m, report.values[m.key] as number) }))
    .filter((r) => r.peer)
    .sort((a, b) => b.peer!.rank - a.peer!.rank);
  const calcRows = calcs.filter((c) => c.percentile != null && c.peer_label)
    .sort((a, b) => (b.percentile ?? 0) - (a.percentile ?? 0));
  const groupRows = (groups ?? []).filter((g) => g.applies === true && prevalence?.[g.key])
    .map((g) => ({ g, p: prevalence![g.key] }))
    .sort((a, b) => a.p.pct - b.p.pct);   // 드문 것부터 = 또래 중 튀는 것부터

  if (!metricRows.length && !calcRows.length && !groupRows.length) return null;
  const worst = metricRows[0];

  return (
    <FadeInUp delay={202}>
      <SummaryCard
        title="또래 중 어디쯤인가"
        summary={worst
          ? `${worst.m.shortName ?? worst.m.name}이 또래 100명 중 ${worst.peer!.rank}등으로 가장 뒤예요`
          : '또래와 견줄 수 있는 항목을 모았어요'}
        definition="같은 성별·연령대 사람들 사이에서 내가 어디쯤인지를 검진 항목·상태 기준·계산 지표별로 모았어요. 등수가 클수록 또래 중 나쁜 쪽이에요."
        meaning="또래 중 앞쪽이라고 안심할 근거는 아니에요. 기준선이 되는 또래 집단 자체가 나빠졌을 수 있어서, 판정은 아래 「또래 자체가 나빠졌나」와 함께 봐야 합니다."
        axes={['peer']}
      >
        {metricRows.length > 0 && (
          <>
            <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text2, marginBottom: 6 }}>검진 항목 {metricRows.length}개</Text>
            {metricRows.slice(0, 5).map(({ m, peer }, i) => (
              <View key={m.key} style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 }, i > 0 && { borderTopWidth: 1, borderTopColor: T.divider }]}>
                <Text style={{ fontSize: T.fs.caption, color: T.text1, flex: 1 }}>{m.shortName ?? m.name}</Text>
                <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: peer!.rank >= 75 ? T.warn : T.text2 }}>{peer!.rank}등</Text>
                {!peer!.measured && <Text style={{ fontSize: T.fs.caption, color: T.text3 }}>어림</Text>}
              </View>
            ))}
            {metricRows.length > 5 && (
              <Expandable label={`나머지 항목 ${metricRows.length - 5}개`}>
                {metricRows.slice(5).map(({ m, peer }) => (
                  <View key={m.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderTopWidth: 1, borderTopColor: T.divider }}>
                    <Text style={{ fontSize: T.fs.caption, color: T.text1, flex: 1 }}>{m.shortName ?? m.name}</Text>
                    <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text2 }}>{peer!.rank}등</Text>
                    {!peer!.measured && <Text style={{ fontSize: T.fs.caption, color: T.text3 }}>어림</Text>}
                  </View>
                ))}
              </Expandable>
            )}
          </>
        )}
        {groupRows.length > 0 && (
          <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.divider }}>
            <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text2, marginBottom: 6 }}>해당하는 상태 {groupRows.length}개</Text>
            {groupRows.map(({ g, p }, i) => (
              <View key={g.key} style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 }, i > 0 && { borderTopWidth: 1, borderTopColor: T.divider }]}>
                <Text style={{ fontSize: T.fs.caption, color: T.text1, flex: 1 }}>{g.name}</Text>
                <Text style={{ fontSize: T.fs.caption, color: T.text2 }}>또래 100명 중 {Math.round(p.pct)}명</Text>
              </View>
            ))}
          </View>
        )}
        {calcRows.length > 0 && (
          <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.divider }}>
            <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text2, marginBottom: 6 }}>계산 지표 {calcRows.length}개</Text>
            {calcRows.map((c, i) => (
              <View key={c.key} style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 }, i > 0 && { borderTopWidth: 1, borderTopColor: T.divider }]}>
                <Text style={{ fontSize: T.fs.caption, color: T.text1, flex: 1 }}>{c.title}</Text>
                <Text style={{ fontSize: T.fs.caption, color: T.text2 }}>{c.peer_label?.replace(/^한국인 \d+세 (남성|여성) 중 /, '')}</Text>
              </View>
            ))}
            {/* 기준연도가 지표마다 다르다 — 지질은 2017 고정이고 전수 측정은 검진 연도다. */}
            <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginTop: 8 }}>
              기준 연도 {[...new Set(calcRows.map((c) => c.peer_year).filter(Boolean))].sort().join('·')}년 국가검진. 지질 지표는 전수 측정된 2017년으로 견줍니다.
            </Text>
          </View>
        )}
      </SummaryCard>
    </FadeInUp>
  );
}

/** ⑤ 조합에서 나오는 «순서» — 조합 카드의 행동 칸.
 *
 *  ⚠️ 개별 그룹 권장(맞춤 권장사항)과 겹치지 않는다. 그쪽은 「고혈압이니 저염」처럼
 *  **판정 하나**에서 나오는 말이고, 여기는 **둘을 같이 볼 때만** 할 수 있는 말이다 —
 *  같은 원인이면 하나만 잡아도 둘이 움직이고, 다른 축이면 따로 잡아야 한다.
 *  그동안 이 칸이 비어 있어서, ③층이 「조합 4개」를 알려주고도 «그래서 뭘»이 없었다.
 *
 *  문구는 백엔드 것을 그대로 쓴다(§2-1) — 프론트에서 다시 쓰면 지어내는 것이 된다. */
/** 동반경향을 «뚜렷하다»고 말할 최소 O/E.
 *
 *  1.5 = 우연히 겹칠 때보다 1.5배. 이보다 낮은 것은 재현성은 있어도(16년 변동폭이
 *  ±0.1 안쪽) 효과가 작아 «같이 다닌다»고 내세우기 민망하다 — 음주+지방간 1.15는
 *  우연보다 15% 더 붙을 뿐이다. 12개 중 8개가 이 선을 넘는다.
 *  ⚠️ 지우는 게 아니라 «행동으로 내세우지 않는» 것이다. 약한 조합도 ③의 근거 목록에는
 *  O/E와 함께 그대로 남아 사용자가 직접 볼 수 있다(§1-1 조항 2). */
const COMBO_SYNERGY_MIN = 1.5;

const strongCombos = (combos: RealComboGroup[]) =>
  combos.filter((c) => c.action && (c.population?.observed_to_expected ?? 0) >= COMBO_SYNERGY_MIN);

/** 1뎁스 결론 — 조합이 «더해주는 것»을 말한다.
 *
 *  예전 결론은 「조합 4개 · 같은 조합인 사람은 100명 중 10명이에요」였다. 그건 모집단
 *  이야기지 «내가 뭘 해야 하나»가 아니고, 바로 위 「나 같은 사람이 얼마나 되나」와
 *  같은 질문으로 읽혔다. 조합만이 줄 수 있는 것은 «둘을 같이 볼 때의 순서»다. */
function comboSummary(combos: RealComboGroup[]): string {
  const strong = strongCombos(combos);
  if (!strong.length) return `조합 ${combos.length}개에 해당하지만, 동반경향이 뚜렷한 것은 없어요`;
  const together = strong.filter((c) => c.relation === 'same_cause' || c.relation === 'shared_criterion').length;
  return together > 0
    ? `${strong.length}개 조합 중 ${together}개는 하나를 잡으면 함께 움직여요`
    : `함께 봐야 할 조합이 ${strong.length}개 있어요`;
}

function ComboActions({ combos }: { combos: RealComboGroup[] }) {
  const strong = strongCombos(combos);
  const weak = combos.filter((c) => c.action && !strong.includes(c));
  if (!strong.length && !weak.length) return null;
  return (
    <>
      {strong.map((c, i) => (
        <View key={c.combo_name} style={[{ paddingTop: 10 }, i > 0 && { marginTop: 10, borderTopWidth: 1, borderTopColor: T.divider }]}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text1 }}>{c.combo_name}</Text>
            {!!c.population?.observed_to_expected && (
              <Text style={{ fontSize: T.fs.caption, color: T.text3 }}>{c.population.observed_to_expected}배 동반</Text>
            )}
          </View>
          <Text style={{ fontSize: T.fs.caption, color: T.text2, lineHeight: 21, marginTop: 3 }}>{c.action}</Text>
        </View>
      ))}
      {/* 출처가 둘이라는 것을 밝힌다 — 배수는 실측이고 «왜»는 임상 지식이다(§1-1 조항 3). */}
      {!!strong.length && (
        <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginTop: 12 }}>
          «몇 배 동반»은 공단 표본에서 센 값이고, «왜 같이 나타나는지»는 임상 지식에 따른 설명이에요.
        </Text>
      )}
      {weak.length > 0 && (
        <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginTop: 6 }}>
          나머지 {weak.length}개({weak.map((c) => c.combo_name).join(' · ')})는 동반경향이 {COMBO_SYNERGY_MIN}배에 못 미쳐 행동으로 내세우지 않았어요. 위 목록에서 값은 볼 수 있어요.
        </Text>
      )}
    </>
  );
}

/** 관리 참고군 묶음의 '벗어난 항목 수' 또래 분포 막대 — ③층 '같은 또래 분포' 카드
 *  (1뎁스 preview + 2뎁스)가 유일한 사용처다. 참고군 카드 5장은 A3에서 제거됐다
 *  — 묶음 판정은 집단군 판정(A2'), 또래 분포는 이 카드가 이어받았다. */
function CareDistBars({ dist, mine, height = 46 }: { dist: { hits: number; pct: number }[]; mine: number; height?: number }) {
  const peak = Math.max(...dist.map((x) => x.pct), 1);
  return (
    <View style={{ flexDirection: 'row', gap: 4, alignItems: 'flex-end' }}>
      {dist.map((x) => {
        const isMine = x.hits === mine;
        return (
          <View key={x.hits} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: T.fs.caption, fontWeight: isMine ? '800' : '500', color: isMine ? T.danger : T.text3, marginBottom: 3 }}>{x.pct}%</Text>
            <View style={{ height, width: '100%', justifyContent: 'flex-end' }}>
              <View style={{
                width: '100%', height: Math.max(3, (x.pct / peak) * height), borderRadius: 3,
                backgroundColor: isMine ? T.dangerFill : T.cardAlt,
              }} />
            </View>
            <Text style={{ fontSize: T.fs.caption, fontWeight: isMine ? '800' : '500', color: isMine ? T.danger : T.text3, marginTop: 4 }}>
              {x.hits}개
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** 조합의 '그래서 뭐가 다른가' — 같은 조합인 사람들과 아닌 사람들의 검진 수치 평균 비교.
 *  O/E비(얼마나 자주 같이 나타나는지)만으로는 조합이 무슨 의미인지 와닿지 않는다.
 *  차이가 가장 큰 항목을 백엔드가 골라 보내주므로(top_metrics) 그대로 나란히 놓는다.
 *  ⚠️ 공단 표본의 집단 평균이며 내 수치가 아니다 — 문구에서 반드시 구분한다. */
function ComboMeanCompare({ combo }: { combo: RealComboGroup }) {
  const rows = combo.population?.top_metrics ?? [];
  if (!rows.length) return null;
  return (
    <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: T.divider }}>
      <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text1, marginBottom: 2 }}>같은 조합인 분들은 뭐가 다를까요</Text>
      <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20 }}>
        '{combo.combo_name}'에 해당하는 분들과 그렇지 않은 분들의 평균 차이가 가장 큰 항목이에요. 공단 표본의 집단 평균이라 내 수치와는 다릅니다.
      </Text>
      {rows.slice(0, 3).map((m) => {
        const max = Math.max(m.combo_mean, m.non_combo_mean) || 1;
        return (
          <View key={m.metric} style={{ marginTop: 14 }}>
            <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text1, marginBottom: 6 }}>{metricLabel(m.metric)}</Text>
            {([
              { label: '같은 조합', value: m.combo_mean, color: T.warn },
              { label: '아닌 분들', value: m.non_combo_mean, color: T.text3 },
            ] as const).map((r) => (
              <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <Text style={{ fontSize: T.fs.caption, color: T.text3, width: 52 }}>{r.label}</Text>
                <View style={{ flex: 1, height: 8, backgroundColor: T.cardAlt, borderRadius: 4, overflow: 'hidden' }}>
                  <View style={{ width: `${(r.value / max) * 100}%`, height: '100%', backgroundColor: r.color, borderRadius: 4 }} />
                </View>
                <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text1, width: 52, textAlign: 'right' }}>{r.value}</Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

// worstInterpretation·levelSummary(1뎁스 결론 문장)는 ../analysisSummary.ts로 옮겼다 — 결과 요약 PDF와 같이 쓴다(design-d).

/** 「내 LDL 목표를 넘었나」의 1뎁스 결론.
 *
 *  이 카드가 답할 것은 «LDL이 높나»가 아니라 «**나에게** 높나»다. 검진지에도 LDL
 *  정상범위가 찍혀 나오므로, 목표 숫자만 말하면 그것과 구분이 안 되어 카드가 존재하는
 *  이유가 사라진다. 그래서 **목표를 말하기 전에 그 목표가 나온 이유**를 세운다.
 *
 *  위험 요인이 없으면(저위험군) 「위험 요인이 없어서」로 말한다 — 그때도 «내 목표가
 *  따로 계산됐다»는 사실은 같고, 오히려 «그래서 기준이 느슨하다»가 정보다. */
function ldlSummary(t: { target_text: string; achieved: boolean | null; gap: number | null; current_ldl: number | null; risk_factors: string[] }): string {
  const n = t.risk_factors?.length ?? 0;
  const why = n > 0 ? `위험 요인 ${n}개라` : '위험 요인이 없어';
  const goal = `내 목표는 ${t.target_text}`;
  if (t.achieved == null) return `${why} ${goal}이에요`;   // TG≥400 — 판정 보류
  const now = t.current_ldl != null ? `지금 ${t.current_ldl}로 ` : '';
  return t.achieved
    ? `${why} ${goal} · ${now}지키고 있어요`
    : `${why} ${goal} · ${now}${t.gap != null ? `${t.gap} ` : ''}넘었어요`;
}

/** 1뎁스 판정 배지 — 카드를 열지 않고도 «이 카드가 나쁜가»를 알 수 있게 한다.
 *
 *  ⚠️ 이 배지가 없을 때는 카드 13장의 제목이 전부 같은 검정, 요약문이 전부 같은 회색이라
 *  「지표 2개 모두 양호」와 「7개 중 6개가 주의 이상」이 시각적으로 완전히 같았다.
 *  맨 위 결론이 "신장 기능부터 보세요"라고 말해도 아래에서 그 카드를 색으로 찾을 수 없었다.
 *  검사항목 탭에는 있는 배지가 여기만 없던 것이다.
 *
 *  ⚠️ **판정이 아닌 카드에는 달지 않는다** — 집단군 판정·같은 또래 분포·함께 나타나는 조합·
 *  16년 변화는 관찰이지 판정이 아니다. 관찰에 배지를 달면 없는 판단을 만들어내는 것이다.
 *  지방간 «유형»(MASLD/MetALD/ALD)도 분류이지 강도가 아니라 달지 않는다. */
type Verdict = 'good' | 'watch' | 'bad';

const VERDICT: Record<Verdict, { text: string; color: string; bg: string }> = {
  good: { text: '양호', color: T.success, bg: T.successBg },
  watch: { text: '주의', color: T.warn, bg: T.warnBg },
  // '위험'이 아니라 '높음' — 선별용 참고 지표라 진단 강도의 낱말을 쓰지 않는다(§7 진단 단정 금지).
  bad: { text: '높음', color: T.danger, bg: T.dangerBg },
};

function VerdictBadge({ v }: { v: Verdict | null }) {
  if (!v) return null;
  const s = VERDICT[v];
  return (
    <View style={{ backgroundColor: s.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: T.radiusPill }}>
      <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: s.color }}>{s.text}</Text>
    </View>
  );
}

/** 계산기 여러 개를 배지 하나로 접는다 — 가장 나쁜 것이 카드를 대표한다.
 *  'info'(판정 없는 참고값)는 세지 않는다. 전부 info면 배지 없음. */
function worstVerdict(levels: string[]): Verdict | null {
  const judged = levels.filter((l) => l !== 'info');
  if (!judged.length) return null;
  if (judged.some((l) => l === 'high' || l === 'very_high')) return 'bad';
  return judged.every((l) => l === 'low') ? 'good' : 'watch';
}

/** 1뎁스 요약은 우선 안내의 «머리»만 쓴다 — 전문을 그대로 두면 이 카드만 세 줄이 되어
 *  한 줄짜리 다른 카드들과 스캔 리듬이 끊긴다. 전문은 2뎁스에 그대로 있다. */
function priorityHead(messages: string[] | undefined): string | null {
  const first = messages?.[0];
  if (!first) return null;
  const dash = first.indexOf('—');
  const head = (dash > 0 ? first.slice(0, dash) : first.split('. ')[0]).trim();
  const rest = (messages?.length ?? 0) - 1;
  return rest > 0 ? `${head} 외 ${rest}건` : head;
}

export default function AnalysisScreen({ reports, metricDefinitions, usingRealData, recommendationsByYear, egfrByYear, comboAnalysisByYear, gender, smoking, alcoholWeeklyG }: {
  reports: Report[];
  metricDefinitions: MetricDefinition[];
  usingRealData?: boolean;
  // ④층 '다음 검진 목표'는 행동을 입력으로 받는다 — 어떤 행동을 제시할 수 있는지가
  // 성별·흡연·음주량에 달려 있어(허리 계수는 성별로 다르고, 하루 2잔 이하면 절주를 권할 근거가 없다)
  // 프로필의 이 세 값이 필요하다.
  gender: 1 | 2;
  smoking?: 'never' | 'former' | 'current' | null;
  alcoholWeeklyG?: number | null;
  // 상세 분석은 **연도별**로 받는다. 예전엔 최신 연도 것 하나만 받아, 위쪽 연도 칩을 눌러도
  // 아래 카드(신장·간·대사·심혈관·권장사항)는 그대로여서 2018년 점수 옆에 2024년 분석이 놓였다.
  recommendationsByYear?: Record<number, RealRecommendations>;
  egfrByYear?: Record<number, RealEgfr>;
  comboAnalysisByYear?: Record<number, RealComboAnalysis>;
}) {
  const { isTablet } = useLayout();
  const [yearIdx, setYearIdx] = useState(reports.length - 1);
  // design-d: 태블릿은 1뎁스 = 네 층 2×2 요약, 카드를 누르면 2뎁스 = 그 층만(아래 긴 화면에서 해당 층 부분),
  // 그 안의 카드를 누르면 3뎁스 = 기존 SummaryCard 상세. null이면 1뎁스.
  const [openLayer, setOpenLayer] = useState<number | null>(null);
  // 1뎁스 2×2 타일 칸 폭 — 훅이라 태블릿 분기 «밖»에서 부른다.
  const tileGrid = useGridCell(2);
  const layerMode = isTablet && openLayer !== null;
  const showLayer = (i: number) => !layerMode || openLayer === i;
  // 태블릿에서 ①은 참고 점수를 품고 있어(design-d) 이름을 바꿨다. 폰·「분석 탭 보는 법」은 아직 LAYERS 그대로.
  const tabletLayer0Title = '내 건강 점수는';
  // 점수 계산 방법은 2.5뎁스 — 점수 자체가 요약이고, 산식은 궁금한 사람만 펼쳐 본다.
  // 심혈관 위험엔진 3종 비교는 2.5뎁스 — 기본은 ASCVD 하나만 보여준다.
  const report = reports[yearIdx];

  // 아래 모든 상세 분석은 **선택한 연도의 것**이다. 그 해에 저장된 분석이 없으면 null이고,
  // 그때는 카드를 조용히 지우는 대신 "이 연도엔 상세 분석이 없다"고 밝힌다(아래 noDetail 안내).
  const recommendations = recommendationsByYear?.[report.year] ?? null;
  const egfr = egfrByYear?.[report.year] ?? null;
  const comboAnalysis = comboAnalysisByYear?.[report.year] ?? null;

  // 조합 그룹은 07 마이그레이션 이후 분석에만 있다 — 없으면 카드 자체를 그리지 않는다.
  const comboGroups = comboAnalysis?.combo_groups ?? null;
  // 16년(1,596만 건) 모집단 통계 — 최신 분석부터 담겨 온다. 구버전 저장분에는 없다.
  const pop16 = comboAnalysis?.population_16yr ?? null;
  // 수치 비교를 보여줄 대표 조합 — 우연 대비 가장 강하게 뭉쳐 나타난 것(O/E 최대)을 고른다.
  const leadCombo = useMemo(() => {
    const withPop = (comboGroups?.matched ?? []).filter((c) => c.population?.top_metrics?.length);
    if (!withPop.length) return null;
    return withPop.reduce((a, b) => (b.population!.observed_to_expected > a.population!.observed_to_expected ? b : a));
  }, [comboGroups]);
  const fattyLiver = comboAnalysis?.fatty_liver ?? null;
  // 지방간 유형(MASLD/MetALD/ALD)은 조합 그룹 매칭과 무관한 독립 판정이다.
  // 예전엔 조합 카드 안에 있어서, 해당 조합이 0개인 사람에게는 유형·근거가 통째로 사라졌다.
  const fattyLiverType = fattyLiver?.applicable && fattyLiver.type ? fattyLiver : null;
  // FLI/HSI·단일그룹·ASCVD는 그 이후(08) 분석부터 담겨 온다 — 마찬가지로 없으면 그리지 않는다.
  const flIndices = fattyLiver?.indices ?? null;
  const singleGroups = comboAnalysis?.single_groups ?? null;
  // 집단군 개수 요약 — 백엔드 주입(2026-07-28) 이후 저장분에만 있다.
  const rarity = comboAnalysis?.rarity ?? null;
  // 대사증후군 5인자 세부 — 판정 근거. 계산·전송은 되고 있었으나 화면에 그리지 않던 값.
  const msDetail = comboAnalysis?.metabolic_syndrome_detail ?? null;
  const ascvd = comboAnalysis?.ascvd_simulation ?? null;
  const ldlTarget = comboAnalysis?.ldl_target && !comboAnalysis.ldl_target.error ? comboAnalysis.ldl_target : null;
  // 계산기 items를 도메인 카테고리로 나눠 각 섹션에 배치한다.
  const calcItems = comboAnalysis?.calculators?.items ?? [];
  const calcOf = (cats: string[]) => calcItems.filter((it) => cats.includes(it.category));
  // ④-0 「무엇부터 하면 되나」가 쓰는 순서. 「목표 세우기」 모달과 같은 계산을 쓴다 —
  // 한 화면에서 두 곳이 다른 순서를 말하면 안 된다.
  const actionCtx: Ctx = useMemo(() => ({
    values: report.values,
    gender,
    weightKg: typeof report.values.weight === 'number' ? report.values.weight : null,
    smoking,
    alcoholWeeklyG: alcoholWeeklyG ?? 0,
    hypertensive: (report.values.sbp ?? 0) >= 140 || (report.values.dbp ?? 0) >= 90,
  }), [report, gender, smoking, alcoholWeeklyG]);
  const actionRanks = useMemo(() => rankActions(ACTIONS, actionCtx), [actionCtx]);
  const metabolicCalcs = calcOf(['lipid', 'insulin', 'adiposity', 'bp']);
  // D(상관구조): 대사·지질 지표는 사실상 3개 축으로 압축된다.
  //  ① 인슐린저항성·내장지방(TyG·METS-IR·AIP·LAP·VAI, 서로 r 0.64~0.96) → 대표 TyG
  //  ② 콜레스테롤(Non-HDL·Castelli-I·II, r 0.79~0.94) → 대표 Non-HDL / ③ 혈압(MAP) 고유
  // 대표(TyG·Non-HDL·MAP)만 펼치고 강상관 중복은 접어 인지부하를 줄인다.
  // 지질에서 둘을 편다 — 서로 다른 것을 재기 때문이다.
  //   Non-HDL-C = 총콜레스테롤 − HDL  → 죽상형성 지단백의 «총량» (NCEP ATP III 컷오프)
  //   AIP       = log(TG / HDL)       → 중성지방과 HDL의 «균형»
  // Castelli I(TC/HDL)·II(LDL/HDL)는 Non-HDL을 비율로 다시 쓴 것에 가까워 접는다.
  const METAB_PRIMARY = ['tyg', 'non_hdl_c', 'aip', 'map'];
  const metabolicPrimary = metabolicCalcs.filter((it) => METAB_PRIMARY.includes(it.key));
  const metabolicRedundant = metabolicCalcs.filter((it) => !METAB_PRIMARY.includes(it.key));
  const liverCalcs = calcOf(['liver']);
  // 1뎁스 결론은 BARD만 맡는다. De Ritis·ALT/GGT는 «간이 굳어가나»가 아니라
  // «손상 원인이 술이냐»를 말하는 지표라, 카드 제목의 질문에 답하지 않는다.
  // (게다가 둘은 서로 반대 방향을 가리켜 결론 한 줄로 세우면 어긋난다.)
  // 사라지지는 않는다 — 2뎁스 행으로 값·판정이 그대로 보인다.
  const liverBard = liverCalcs.filter((it) => it.key === 'bard');
  const liverOthers = liverCalcs.filter((it) => it.key !== 'bard');
  const cvCalcs = calcOf(['cardiovascular']);
  const calcDisclaimer = comboAnalysis?.calculators?.disclaimer;
  // 입력값이 없어 만들지 못한 계산기 — FLI/HSI가 '계산 불가'를 밝히듯 계산기도 침묵하지 않는다.
  // 백엔드가 카테고리 없이 한 목록으로 주므로(지표명 + 필요 항목 문구) 계산기 대표 카드에 한 번만 싣는다.
  const calcUnavailable = comboAnalysis?.calculators?.unavailable ?? [];
  // FLI/HSI level → 상태색 (백엔드 interpretation 문구를 그대로 쓰고, 색만 구간에 맞춘다)
  const levelColor = (level: string) => level === 'low' ? T.success : (level === 'high' || level === 'very_high') ? T.danger : T.warn;
  const levelBg = (level: string) => level === 'low' ? T.successBg : (level === 'high' || level === 'very_high') ? T.dangerBg : T.warnBg;

  // 참고 점수: 그 해 검진 결과에 기록된 값을 그대로 보여준다(대시보드·기록 화면과 항상 일치).
  // 감점 근거(주의/위험 개수)도 그 해 기록과 함께 저장해 둔 값을 그대로 쓴다 — 연도가 바뀌어도 항상 점수와 일치한다.
  const scorePct = report.score;
  const { color: scoreColor, fill: scoreFill, bg: scoreBg, label: scoreLabel } = scoreTone(scorePct);

  // 점수 밖에 있는 신호 — 참고 점수는 '검사 항목 하나하나의 주의/위험 개수'만 감점한다.
  // 심혈관 10년 위험·대사증후군·지방간 지표·LDL 개인 목표·신장 기능은 이 점수에 전혀 들어가지 않아
  // "점수는 양호한데 아래 카드는 빨간" 상태가 구조적으로 생긴다.
  // ⚠️ 산식은 건드리지 않는다 — 점수는 그 해 기록에 저장된 값이라 바꾸면 홈·기록·히스토리와 어긋난다.
  // 대신 점수가 못 세는 것을 점수 바로 아래 모아 보여 단절을 감추지 않는다.
  // 1뎁스 요약(점수 밖 신호·② 계산 지표·③ 또래·④ 행동)은 결과 요약 PDF와 같은 함수로 계산한다(design-d).
  const summary = useMemo(() => analysisSummary({ report, metricDefinitions, recommendations, egfr, combo: comboAnalysis, gender, smoking, alcoholWeeklyG }),
    [report, metricDefinitions, recommendations, egfr, comboAnalysis, gender, smoking, alcoholWeeklyG]);
  const outsideScore = summary.outsideScore;

  // 관리 참고군 묶음: 선택한 연도의 실제 측정값 기준으로 매번 다시 계산한다.
  // 카드 5장은 A3에서 제거됐지만 이 계산은 ③층 '같은 또래 분포' 카드가
  // 대표 묶음을 고르고 묶음별 분포를 그리는 데 그대로 쓴다 — 삭제 금지.
  const groups = useMemo(() => computeGroupsForReport(report, metricDefinitions), [report, metricDefinitions]);

  /** 그 해 «기준을 벗어난» 검사 항목만, 위험 → 주의 순. 「항목으로 보면」이 쓴다.
   *  점수와 같은 출처(metricsForReport)를 쓰므로 개수가 어긋날 수 없다 —
   *  「위험 1 · 주의 8」이라 해놓고 목록이 7줄인 일이 생기지 않는다.
   *  infoOnly(키·몸무게)는 판정 대상이 아니라 statusByKey에서 이미 빠져 있다. */
  const offRangeMetrics = useMemo(
    () => sortByAttention(metricsForReport(report, metricDefinitions).filter((m) => !m.infoOnly && m.status !== '정상')),
    [report, metricDefinitions],
  );
  const normalCount = useMemo(
    () => metricsForReport(report, metricDefinitions).filter((m) => !m.infoOnly && m.status === '정상').length,
    [report, metricDefinitions],
  );

  /** 실제로 «해당»한 상태만. 임상이 먼저 오도록 원래 순서를 지킨다(백엔드 GROUP_INFO 순).
   *  applies가 null인 것(판정 불가)은 해당이 아니므로 뺀다 — 지어내지 않는다. */
  const appliedGroups = useMemo(() => (singleGroups ?? []).filter((g) => g.applies === true), [singleGroups]);

  /** 펼치기 «밖»에 이미 보여준 그룹 키 — 펼침 안 목록에서 빼서 같은 줄이 두 번 나오지 않게 한다. */
  const shownGroupKeys = useMemo(
    () => new Set(appliedGroups.slice(0, OFF_RANGE_HEAD).map((g) => g.key)),
    [appliedGroups],
  );

  // 태블릿 첫 화면(1뎁스)은 시안처럼 네 층을 2×2 요약 카드로 보여준다. 카드를 누르면
  // 아래 긴 화면 중 그 층만 열리고(2뎁스), 그 안 카드의 상세가 3뎁스다(design-d).
  if (isTablet && openLayer === null) {
    const layer2Rows = summary.computed;
    const tileStyle = tileGrid.cell;
    const summaryText = { fontSize: T.fs.body, color: T.text2, lineHeight: 24 } as const;
    // 카드 전체가 눌려 그 층의 2뎁스로 들어간다. 맨 아래 「자세히 보기 ›」는 누를 수 있다는 표시.
    const renderTile = (step: string, title: string, subtitle: string, body: React.ReactNode) => (
      <Pressable key={step} onPress={() => setOpenLayer(Number(step) - 1)} accessibilityRole="button" accessibilityLabel={`${step}. ${title} 자세히 보기`} style={[tileStyle, { backgroundColor: T.white, borderRadius: T.radius, padding: 20, gap: 10 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: T.text1 }}>
            <Text style={{ fontSize: T.fs.body, fontWeight: '800', color: T.white }}>{step}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: T.fs.h3, lineHeight: 27, fontWeight: '800', color: T.text1 }}>{title}</Text>
            <Text style={{ fontSize: T.fs.caption, lineHeight: 20, color: T.text3, marginTop: 2 }}>{subtitle}</Text>
          </View>
        </View>
        {body}
        <View style={{ flex: 1 }} />
        <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, borderTopWidth: 1, borderTopColor: T.divider, marginTop: 4 }}>
          <Text style={{ fontSize: T.fs.body, fontWeight: '700', color: T.primaryText }}>자세히 보기</Text>
          <Ionicons name="chevron-forward" size={18} color={T.primaryText} />
        </View>
      </Pressable>
    );

    return (
      <ScrollView key="tablet-summary" contentContainerStyle={{ paddingHorizontal: 28, paddingTop: 28, paddingBottom: 40, gap: 12, maxWidth: 1280, width: '100%', alignSelf: 'center' }} showsVerticalScrollIndicator={false} style={{ backgroundColor: T.bg, ...({ wordBreak: 'keep-all' } as any) }}>
        <View style={{ paddingRight: 64 }}>
          <Eyebrow>ANALYSIS</Eyebrow>
          <TabIntroNote title="건강분석" />
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {reports.map((r, i) => ({ r, i })).reverse().map(({ r, i }) => (
            <Pressable key={r.year} onPress={() => setYearIdx(i)} style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 16, borderRadius: T.radiusPill, backgroundColor: i === yearIdx ? T.primary : T.white }}>
              <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: i === yearIdx ? T.onPrimary : T.text3 }}>{r.year}년</Text>
            </Pressable>
          ))}
        </View>

        {/* 참고 점수는 따로 카드를 두지 않고 ① 안에 넣는다(design-d) — 점수가 «기준을 벗어난 개수»로
            깎이는 값이라 ①과 같은 말을 두 번 하고 있었다(위험 1 · 주의 8, 별도 신호 4가지). */}
        <View onLayout={tileGrid.onLayout} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'stretch' }}>
          {renderTile('1', tabletLayer0Title, `${report.year}년 검진 수치가 학회 기준 안에 있는지 봅니다.`, <>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                <Text style={{ fontSize: T.fs.caption, color: T.text3, fontWeight: '600' }}>참고 점수</Text>
                <View style={{ backgroundColor: scoreBg, paddingHorizontal: 12, paddingVertical: 5, borderRadius: T.radiusPill }}>
                  <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: scoreColor }}>{scoreLabel}</Text>
                </View>
              </View>
              <AnimatedScore score={scorePct} color={scoreFill} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {([
                ['■ 정상', normalCount, T.success, T.successBg],
                ['● 주의', report.manageCount, T.warn, T.warnBg],
                ['▲ 위험', report.trackCount, T.danger, T.dangerBg],
              ] as const).map(([label, count, color, bg]) => (
                <View key={label} style={{ backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 6, borderRadius: T.radiusPill }}>
                  <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color }}>{label} {count}</Text>
                </View>
              ))}
            </View>
            <Text style={summaryText}>{offRangeMetrics.length ? `먼저 확인할 항목 ${offRangeMetrics.slice(0, 3).map((m) => m.shortName ?? m.name).join(' · ')}` : '모든 검사 항목이 기준 안이에요.'}</Text>
            {!!outsideScore.length && <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20 }}>점수에 포함되지 않는 신호가 {outsideScore.length}가지 있어요.</Text>}
          </>)}

          {renderTile('2', LAYERS[1].title, '검진 수치를 묶어 결과지에 없는 지표를 계산합니다.', layer2Rows.length ? <View style={{ gap: 8 }}>{layer2Rows.map(([label, value]) => <View key={label} style={{ paddingTop: 8, borderTopWidth: 1, borderTopColor: T.divider }}><Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text1 }}>{label}</Text><Text style={summaryText}>{value}</Text></View>)}</View> : <Text style={summaryText}>이 연도에 저장된 추가 분석이 없어요.</Text>)}

          {renderTile('3', LAYERS[2].title, '같은 성별·연령대 안에서 내 위치를 확인합니다.', <>
            {summary.peers.length ? summary.peers.map((peer) => <View key={peer.key} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 7, borderTopWidth: 1, borderTopColor: T.divider }}><Text style={{ flex: 1, fontSize: T.fs.body, color: T.text1 }}>{peer.name}</Text><Text style={{ fontSize: T.fs.body, fontWeight: '800', color: peer.rank >= 75 ? T.warn : T.text2 }}>{peer.rank}등</Text></View>) : <Text style={summaryText}>비교할 수 있는 또래 자료가 없어요.</Text>}
            <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20 }}>등수가 높을수록 또래 중 관리가 더 필요한 쪽이에요.</Text>
          </>)}

          {renderTile('4', LAYERS[3].title, '앞에서 확인한 결과를 실천과 다음 검진 목표로 옮깁니다.', <>
            <Text style={summaryText}>{summary.topAction ? `${summary.topAction}부터 시작하면 현재 지표를 가장 크게 움직여요.` : '현재 조건에 맞는 우선 행동을 계산할 수 없어요.'}</Text>
            {!!summary.priorityMessage && <View style={{ backgroundColor: T.cardAlt, borderRadius: T.radiusSm, padding: 12 }}><Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text1 }}>{summary.priorityMessage}</Text></View>}
            {reports.length > 0 && <NextCheckupGoal
              latest={reports[reports.length - 1]}
              gender={gender}
              smoking={smoking}
              alcoholWeeklyG={alcoholWeeklyG}
              demoMode={!usingRealData}
              compact
            />}
          </>)}
        </View>

        <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, textAlign: 'center' }}>참고용이에요. 걱정되면 의료진과 상담해 보세요.</Text>
      </ScrollView>
    );
  }

  return (
    // 태블릿: 레일을 뺀 본문 안에서 읽기 편한 폭(820)으로 가운데 모은다. 카드는 아직 1열 그대로다
    // (태블릿 시안의 «네 층 2×2»는 이 화면이 하나의 긴 흐름이라 별도 작업으로 남긴다).
    // key: 1뎁스 ↔ 2뎁스(층마다)를 오갈 때 스크롤 위치를 물려받지 않고 맨 위에서 시작한다.
    <ScrollView key={`analysis-${openLayer ?? 'all'}`} contentContainerStyle={isTablet ? { paddingBottom: 40, alignSelf: 'center', width: '100%', maxWidth: 820 } : { paddingBottom: 40 }} showsVerticalScrollIndicator={false} style={{ backgroundColor: T.bg, ...(isTablet ? { wordBreak: 'keep-all' as const } : {}) }}>

      {/* 페이지 헤더 — 화면에 들어오면 살짝 떠오르며 나타난다 */}
      <FadeInUp delay={0}>
      {/* paddingBottom을 줄인다 — 아래 LayerHeader가 이미 marginTop 26 + paddingTop 18을
          갖고 있어, 헤더까지 여백을 두면 제목과 ①층 사이가 60px 넘게 벌어진다. */}
      <View style={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 2, paddingRight: isTablet ? 84 : 20 }}>
        <Eyebrow>ANALYSIS</Eyebrow>
        {/* 네 층을 나열하던 부제는 지웠다 — 바로 아래 「이 화면은 무엇을 하나요?」가 같은 LAYERS를
            펼쳐 보여주고, 스크롤하면 층 머리말로 세 번째 나왔다. 같은 말을 첫 화면에서 두 번 하는
            자리라, 정작 내 수치가 첫 화면 밖으로 밀려나 있었다. */}
        <TabIntroNote title="건강분석" />
      </View>
      </FadeInUp>
      {/* 2뎁스(태블릿) — 돌아가기 + 어느 해 기준인지. 연도는 1뎁스에서 고르므로 여기엔 칩을 두지 않는다. */}
      {layerMode && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 8 }}>
          <Pressable onPress={() => setOpenLayer(null)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 48, paddingHorizontal: 16, borderRadius: T.radiusPill, backgroundColor: T.white }}>
            <Ionicons name="chevron-back" size={18} color={T.primaryText} />
            <Text style={{ fontSize: T.fs.body, fontWeight: '700', color: T.primaryText }}>네 단계 요약으로</Text>
          </Pressable>
          <Text style={{ fontSize: T.fs.caption, color: T.text3 }}>{report.year}년 검진 기준</Text>
        </View>
      )}

      {showLayer(0) && (<>
      <LayerHeader
        first
        step={LAYERS[0].step}
        title={layerMode ? tabletLayer0Title : LAYERS[0].title}
        sub={`${report.year}년 검진 수치가 학회 기준 안에 있는지 봅니다.`}
      />

      {/* 연도 선택 — 기록이 늘어나도 가로 스크롤로 자유롭게 비교.
          최신이 왼쪽에 온다(검사항목 탭 선택기와 같은 순서). 기본 선택이 최신 회차라
          오름차순이면 선택된 칩을 보려고 끝까지 스크롤해야 했다.
          reports 자체는 오래된 순이므로, 표시만 뒤집고 인덱스(i)는 원래 것을 그대로 넘긴다.
          ⚠️ 카드 «밖»에 둔다(2026-08-02). 아래 카드는 전체가 눌리는 SummaryCard라,
          안에 두면 연도 칩을 눌러도 상세 모달이 함께 열린다. */}
      {!layerMode && (
      <FadeInUp delay={80}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12, marginBottom: 10 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
        {reports.map((r, i) => ({ r, i })).reverse().map(({ r, i }) => (
          <Pressable
            key={r.year}
            onPress={() => setYearIdx(i)}
            style={{
              paddingHorizontal: 16, paddingVertical: 9, borderRadius: T.radiusPill,
              backgroundColor: i === yearIdx ? T.primary : T.white,
            }}
          >
            <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: i === yearIdx ? T.onPrimary : T.text3 }}>{r.year}년</Text>
          </Pressable>
        ))}
      </ScrollView>
      </FadeInUp>
      )}

      {/* 카드 1 — 점수 히어로. **점수만** 말한다.
          여기서 결론 문장·신호 목록까지 떠안으면 «이 탭의 얼굴»이 텍스트 벽이 된다.
          "그래서 무엇이 나쁜가"는 바로 아래 카드가 맡는다. */}
      <LayerGrid on={layerMode}>
      <FadeInUp delay={100}>
      <View style={[{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingVertical: 20, marginBottom: 8 }, layerMode && { marginHorizontal: 0, marginBottom: 0, flexGrow: 1 }]}>
        <Text style={{ fontSize: T.fs.caption, color: T.text3, fontWeight: '500', marginBottom: 6 }}>참고 점수</Text>
        {/* 연도를 바꿀 때마다 0에서부터 채워지며 그려져, 변화가 자연스럽게 느껴진다 */}
        <AnimatedScore score={scorePct} color={scoreFill} />
        <View style={{ alignSelf: 'flex-start', backgroundColor: scoreBg, paddingHorizontal: 12, paddingVertical: 5, borderRadius: T.radiusPill, marginTop: 10, marginBottom: 4 }}>
          <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: scoreColor }}>{scoreLabel}</Text>
        </View>
        {/* 점수가 세지 않는 것 — 「이 점수에」로 시작하는 말이라 점수 옆에 있어야 한다.
            아래 카드로 내려봤다가 되돌렸다(2026-08-02): 점수만 보고 "괜찮다"고 덮지 않게
            막는 것이 목적인데, 카드를 열어야 보이면 그 목적을 잃는다.
            점수가 양호할 때가 특히 중요하다. */}
        {outsideScore.length > 0 && (
          <View style={{ borderTopWidth: 1, borderTopColor: T.divider, paddingTop: 14, marginTop: 10 }}>
            {/* 접되, «펼치게 유도하는» 한 줄을 밖에 둔다(§2-1 규칙 3 — 안에 무엇이 얼마나 있는지 알린다).
                이 블록의 목적은 점수만 보고 "괜찮다"고 덮지 않게 막는 것이라, 접어놓고 아무 말도
                안 하면 목적을 잃는다. 유도 문장이 그 일을 대신한다.
                ⚠️ «위험»이라는 낱말은 쓰지 않는다 — 앱에서 위험은 상태 등급 이름(정상/주의/위험)인데
                여기 항목들의 등급은 제각각이다(G2 경도 감소 · 중간 구간 …). */}
            <Text style={{ fontSize: T.fs.caption, color: T.text2, lineHeight: 20 }}>
              점수만 보고 넘기면 놓치는 신호가 {outsideScore.length}가지 있어요.
            </Text>
            <Expandable label={`신호 ${outsideScore.length}가지 보기`}>
              <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginTop: 4, marginBottom: 10 }}>
                점수는 검사 항목별 주의·위험 개수만 셉니다. 아래는 여러 수치를 조합해 따로 판정한 것이라 점수에 반영되지 않지만, 그렇다고 가벼운 건 아니에요.
              </Text>
              {outsideScore.map((o) => (
                <View key={o.label} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                  <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: T.warnFill, marginTop: 7 }} />
                  <Text style={{ fontSize: T.fs.caption, color: T.text2, lineHeight: 20, flex: 1 }}>
                    <Text style={{ fontWeight: '700', color: T.text1 }}>{o.label}</Text> — {o.detail}
                  </Text>
                </View>
              ))}
              {/* 계산 방법은 이 안에 둔다 — 접기 버튼 두 개가 나란히 서 있으면
                  무엇이 다른지 알 수 없고, 히어로가 «버튼 두 줄»로 끝난다.
                  둘 다 «점수를 더 알고 싶은 사람»이 찾는 것이라 한 번만 펼치게 한다.
                  bare — 이 노트의 자기 토글은 끈다. 안 그러면 「접기」가 두 줄 연달아 선다. */}
              <View style={{ marginTop: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.divider }}>
                <ScoreCalcNote bare score={scorePct} manageCount={report.manageCount} trackCount={report.trackCount} />
              </View>
            </Expandable>
          </View>
        )}
        {/* 신호가 하나도 없으면 위 펼침 자체가 없다 — 그때는 계산 방법이 사라지지 않도록 여기 둔다. */}
        {outsideScore.length === 0 && (
          <ScoreCalcNote score={scorePct} manageCount={report.manageCount} trackCount={report.trackCount} />
        )}
      </View>
      </FadeInUp>

      {/* 카드 2 — 히어로가 «점수»만 말하고 «무엇이» 나쁜지는 말하지 않는다. 그 일을 여기가 맡는다.
          답은 두 단위로 나온다: 항목으로 보면 어느 검사가 벗어났나, 상태로 보면 무엇에 해당하나.
          예전에는 뒤쪽 단위만 「집단군 판정」이라는 이름으로 따로 있었고 앞쪽은 아무 데도 없었다. */}
      <FadeInUp delay={140}>
      <SummaryCard
        title="나는 어떤 상태인가"
        definition={cardContent['나는 어떤 상태인가']?.definition}
        detail={cardContent['나는 어떤 상태인가']?.detail}
        meaning={cardContent['나는 어떤 상태인가']?.meaning}
        tips={cardContent['나는 어떤 상태인가']?.tips}
        summary={[
          report.trackCount ? `위험 ${report.trackCount}` : null,
          report.manageCount ? `주의 ${report.manageCount}` : null,
          rarity ? `상태 기준 ${rarity.clinical_count + rarity.lifestyle_count}개 해당` : null,
        ].filter(Boolean).join(' · ') || `${report.year}년 검진은 모두 기준 안이에요.`}
        badge={
          <View style={{ backgroundColor: scoreBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: T.radiusPill }}>
            <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: scoreColor }}>{scoreLabel}</Text>
          </View>
        }
        axes={['standard']}
      >
        {/* ── 항목으로 보면 ─────────────────────────────────
            검사 항목 하나하나가 정상범위 안인지. 점수가 세는 단위가 이것이다.
            ⚠️ 개수만 세지 않고 **어느 항목인지** 이름과 값까지 적는다 — 히어로가 40점만
            말하고 «무엇이» 나쁜지는 말하지 않아서, 그 답이 앱 어디에도 없었다.
            정상 항목은 적지 않는다: 벗어난 것만 보여주는 게 이 층의 질문이다. */}
        <Text style={{ fontSize: T.fs.body, fontWeight: '800', color: T.text1, marginBottom: 6 }}>항목으로 보면</Text>
        <Text style={{ fontSize: T.fs.body, color: T.text2, lineHeight: 23, marginBottom: 12 }}>
          {report.trackCount + report.manageCount === 0
            ? `${report.year}년 검진은 검사 항목이 모두 기준 안이에요.`
            : `${report.year}년 검진에서 ${[
                report.trackCount ? `위험 ${report.trackCount}개` : null,
                report.manageCount ? `주의 ${report.manageCount}개` : null,
              ].filter(Boolean).join(' · ')}가 나왔어요.`}
        </Text>
        {offRangeMetrics.length > 0 && (
          <View style={{ marginBottom: 14 }}>
            {/* 위험 → 주의 순으로 앞 4개만 편다. 9줄이 통째로 펼쳐지면 2뎁스가 다시 목록이 되고,
                정작 아래 「상태로 보면」이 화면 밖으로 밀린다(§2-1 「2뎁스는 요약이다」).
                가장 급한 것이 위에 오므로 4개만 봐도 우선순위는 다 읽힌다. */}
            {offRangeMetrics.slice(0, OFF_RANGE_HEAD).map((m, i) => (
              <OffRangeRow key={m.key} metric={m} report={report} first={i === 0} />
            ))}
            {offRangeMetrics.length > OFF_RANGE_HEAD && (
              <Expandable label={`나머지 ${offRangeMetrics.length - OFF_RANGE_HEAD}개 보기`}>
                {offRangeMetrics.slice(OFF_RANGE_HEAD).map((m) => (
                  <OffRangeRow key={m.key} metric={m} report={report} />
                ))}
                {/* 이 안내는 «목록을 다 본 사람»에게만 필요하다. 접힌 채로 밖에 두면
                    4개만 보고 있는 사람에게 "적지 않았어요"부터 읽히는 셈이라 순서가 거꾸로다. */}
                <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginTop: 10 }}>
                  기준 안에 있는 항목은 적지 않았어요. 전체 목록과 항목별 설명은 검사항목 탭에 있어요.
                </Text>
              </Expandable>
            )}
          </View>
        )}

      {/* 관리 참고군 카드 5장은 A3에서 제거했다(§1-1② — 무엇을 왜 뺐는지 기록).
          하던 일과 간 곳: 묶음 판정("N개 중 M개") → 집단군 판정 카드(A2'가 또래 유병률까지 병합),
          또래 분포 → ③층 '같은 또래 분포' 카드(A1'), 패널별 상태 요약 → ②층 계산기 카드들,
          항목별 수치·판정 → 검사항목 탭. 상세 분석이 없는 연도에서 묶음 시각이 사라지는 손실은
          감수하기로 결정(2026-07-31). 약·고령 배지(CompareRow)는 참고군과 함께 내려갔다. */}

      {/* 여기부터는 그 해 검진 수치로 따로 계산해 저장해 둔 상세 분석이다.
          예전엔 최신 연도 것만 내려받아, 위에서 연도를 바꿔도 아래는 그대로였다.
          이제 연도를 따라가므로 어느 해 기준인지 한 줄로 못 박아 둔다. */}
      <FadeIn key={`detail-${report.year}`}>
      {/* 그 해 분석이 통째로 없는 경우 — 카드를 조용히 지우면 "원래 그런 해"로 읽힌다.
          왜 없는지(예전 방식으로 저장된 회차) 밝히고, 최신 회차를 보라고 안내한다. */}
      {!comboAnalysis && !egfr && !recommendations && (
        <View style={{ backgroundColor: T.white, marginHorizontal: 16, marginTop: 8, borderRadius: T.radius, paddingHorizontal: 20, paddingVertical: 18, marginBottom: 8 }}>
          <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text1, marginBottom: 4 }}>
            {report.year}년은 상세 분석이 저장돼 있지 않아요
          </Text>
          <Text style={{ fontSize: T.fs.caption, color: T.text2, lineHeight: 20 }}>
            상세 분석(신장·간·대사·심혈관·권장사항)은 검진 회차마다 따로 계산해 저장돼요.
            이 회차는 예전 방식으로 저장돼 있어 보여드릴 내용이 없습니다.
            {reports.length > 1 && ' 위에서 최근 연도를 선택해 주세요.'}
          </Text>
        </View>
      )}
      </FadeIn>

        {/* ── 상태로 보면 ─────────────────────────────────
            같은 수치를 «항목»이 아니라 «상태»(고혈압·당뇨·대사증후군·비만·흡연 등 13개) 단위로
            가른 결과. 검진 수치에 복용 약물까지 반영하므로, 수치가 정상이어도 약을 먹고 있으면
            해당으로 본다 — 점수만으로는 알 수 없는 것이다.
            판정 불가(그 해 입력값 없음)한 그룹은 지어내지 않고 '판정 불가'로 표시한다. */}
        {!!singleGroups?.length && (
          <View style={{ marginTop: 20, paddingTop: 18, borderTopWidth: 1, borderTopColor: T.divider }}>
          <Text style={{ fontSize: T.fs.body, fontWeight: '800', color: T.text1, marginBottom: 6 }}>상태로 보면</Text>

          {/* 요약 줄 — 아래 13줄을 다 읽지 않아도 "몇 개에 해당하는지"가 먼저 보이게 한다.
              백엔드 필드명은 rarity지만 희귀도가 아니라 '해당 집단군 개수 + 해석'이다.
              구버전 저장 분석에는 이 값이 없다 → 그때는 요약 없이 상세 목록만 보인다.
              ⚠️ 2026-08-02에 이 박스를 목록 «위»로 올렸다. 요약이 상세 뒤에 있으면
              요약이 아니다 — 이미 다 읽은 사람에게만 보인다. */}
          {rarity && (
            <View style={{ backgroundColor: T.cardAlt, borderRadius: T.radiusSm, padding: 14, marginTop: 8, marginBottom: 2 }}>
              <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text1 }}>
                임상 {rarity.clinical_count}개 · 생활습관 {rarity.lifestyle_count}개에 해당
              </Text>
              <Text style={{ fontSize: T.fs.caption, color: T.text2, lineHeight: 20, marginTop: 4 }}>{rarity.interpretation}</Text>
            </View>
          )}

          {/* «해당»한 것만 먼저 편다 — 「임상 5개」라는 개수만으로는 무엇에 해당하는지 알 수 없다.
              13줄을 통째로 펼치면 비해당 8줄이 해당 5줄을 묻어버린다. 앞 4개까지만 두고
              나머지와 판정 근거는 접는다(§2-1 「2뎁스는 요약이다」). */}
          {appliedGroups.length > 0 && (
            <View style={{ marginTop: 10 }}>
              {appliedGroups.slice(0, OFF_RANGE_HEAD).map((g, i) => (
                <View key={g.key} style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9 }, i > 0 && { borderTopWidth: 1, borderTopColor: T.divider }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: T.fs.caption, fontWeight: '600', color: T.text1 }}>{g.name}</Text>
                    {!!g.desc && <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginTop: 2 }}>{g.desc}</Text>}
                  </View>
                  <View style={{ backgroundColor: T.dangerBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: T.radiusPill }}>
                    <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.danger }}>해당</Text>
                  </View>
                </View>
              ))}
              {appliedGroups.length > OFF_RANGE_HEAD && (
                <Text style={{ fontSize: T.fs.caption, color: T.text3, marginTop: 8 }}>
                  외 {appliedGroups.length - OFF_RANGE_HEAD}개에 더 해당해요 — 아래에서 전부 볼 수 있어요.
                </Text>
              )}
            </View>
          )}

          <Expandable label={`나머지 ${singleGroups.length - shownGroupKeys.size}개와 판정 근거 보기`}>
          {/* 대사증후군 5인자 세부 — "해당/비해당"만으로는 왜 그렇게 판정됐는지 알 수 없다.
              각 인자가 수치 때문인지 약 복용 때문인지까지 백엔드가 이미 보내주므로 그대로 보여준다. */}
          {msDetail && (
            <View style={{ marginTop: 12, marginBottom: 6, backgroundColor: T.bg, borderRadius: T.radiusSm, padding: 14 }}>
              <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text1, marginBottom: 2 }}>
                대사증후군 5개 기준 중 {msDetail.count}개 충족
                {msDetail.evaluable < 5 ? ` (판정 가능 ${msDetail.evaluable}개)` : ''}
              </Text>
              <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginBottom: 8 }}>
                3개 이상이면 대사증후군으로 봐요. {msDetail.is_metabolic_syndrome ? '지금은 해당해요.' : '지금은 해당하지 않아요.'}
              </Text>
              {Object.entries(msDetail.factors).map(([name, f], i) => (
                <View key={name} style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }, i > 0 && { borderTopWidth: 1, borderTopColor: T.divider }]}>
                  <Ionicons
                    name={f.met ? 'checkmark-circle' : 'ellipse-outline'}
                    size={16}
                    color={f.met ? T.danger : T.text3}
                  />
                  <Text style={{ fontSize: T.fs.caption, fontWeight: f.met ? '700' : '500', color: f.met ? T.text1 : T.text3, width: 76 }}>{name}</Text>
                  <Text style={{ flex: 1, fontSize: T.fs.caption, color: T.text2, lineHeight: 20 }}>{f.reason}</Text>
                  {/* 약으로 충족된 인자는 따로 표시 — 수치가 정상이어도 관리 중이라 충족된 것이다 */}
                  {f.by_medication && (
                    <View style={{ backgroundColor: T.primaryLight, paddingHorizontal: 7, paddingVertical: 2, borderRadius: T.radiusPill }}>
                      <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.primaryDark }}>약</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* ⚠️ 밖에 이미 편 «해당» 항목은 여기서 뺀다 — 안 그러면 고혈압 전단계·당뇨 전단계·
              대사증후군·비만이 한 카드 안에 두 번씩 나온다. 대사증후군 5인자 세부(위 박스)는
              성격이 다른 «판정 근거»라 그대로 둔다. */}
          {(['임상', '생활습관'] as const).map((cat) => {
            const rows = singleGroups.filter((g) => g.category === cat && !shownGroupKeys.has(g.key));
            if (!rows.length) return null;
            return (
              <View key={cat} style={{ marginTop: 10 }}>
                <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text3, marginBottom: 4 }}>{cat}</Text>
                {rows.map((g, i) => {
                  // A2' — 같은 키 공간(g_*)의 또래 유병률(peer_prevalence)을 줄에 병합.
                  // 유병률이 없는 그룹(전단계·흡연 등 6/13)은 줄 자체를 생략한다 — 빈칸을 만들지 않는다.
                  const pp = pop16?.peer_prevalence?.[g.key];
                  return (
                    <View key={g.key} style={[{ paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }, i > 0 && { borderTopWidth: 1, borderTopColor: T.divider }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: T.fs.caption, fontWeight: '600', color: T.text1 }}>{g.name}</Text>
                        {!!g.desc && <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginTop: 2 }}>{g.desc}</Text>}
                        {!!pp && (
                          <Text style={{ fontSize: T.fs.caption, color: T.text2, lineHeight: 20, marginTop: 2 }}>
                            같은 또래는 100명 중 {Math.round(pp.pct)}명이 해당해요
                          </Text>
                        )}
                      </View>
                      <View style={{ backgroundColor: g.applies == null ? T.cardAlt : g.applies ? T.dangerBg : T.successBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: T.radiusPill }}>
                        <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: g.applies == null ? T.text3 : g.applies ? T.danger : T.success }}>
                          {g.applies == null ? '판정 불가' : g.applies ? '해당' : '비해당'}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })}
          {singleGroups.some((g) => pop16?.peer_prevalence?.[g.key]) && (
            <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginTop: 10 }}>
              '같은 또래 100명 중 N명'은 공단 표본에서 나와 같은 성별·연령대를 수치 기준으로 센 유병률이에요. 원자료에 약 복용 정보가 없어 앱 판정보다 좁게 잡힙니다.
            </Text>
          )}
          </Expandable>
          </View>
        )}
      </SummaryCard>
      </FadeInUp>
      </LayerGrid>
      </>)}

      {/* 연도 기준 안내 — ①층이 «끝난 뒤»에 둔다(2026-08-02).
          예전에는 층 머리말과 집단군 판정 카드 «사이»에 끼어 있어서, 한 층의 답인
          점수 카드와 집단군 판정을 갈라놓았다. 두 카드는 「기준을 벗어났나」라는 같은 질문의
          두 답이라 붙어 있어야 한다. 문구도 "여기부터 아래"에서 화면 전체로 바꿨다 —
          아래로 내려온 이상 위 두 카드도 같은 연도 기준이기 때문이다. */}
      {!layerMode && (
      <View style={{ paddingHorizontal: 20, marginTop: 10, marginBottom: 2 }}>
        <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20 }}>
          이 화면의 카드는 모두 {report.year}년 수치로 계산했어요. 위에서 연도를 바꾸면 함께 바뀝니다.
        </Text>
      </View>
      )}

      {showLayer(1) && (<>
      <LayerHeader first={layerMode} step={LAYERS[1].step} title={LAYERS[1].title} sub="크레아티닌 하나로는 알 수 없던 것이 나이·성별·다른 수치와 묶이면 신장 여과율이 됩니다. 이 층이 분석 탭의 존재 이유예요." />
      {/* 2뎁스(태블릿)에서는 장기 소제목을 빼고 카드 6장을 한 격자에 놓는다 — 카드 제목이 이미 장기를 말한다. */}
      <LayerGrid on={layerMode}>

      {/* 신장 — eGFR·CrCl */}
      {/* 소제목은 장기 이름으로 통일한다(간·대사·지질·심혈관과 같은 층위).
          「신장 기능」이면 바로 아래 카드 「신장 기능 (eGFR)」과 같은 말을 두 번 한다. */}
      {/* ③ 신장 기능(eGFR) — 그 해 혈청 크레아티닌이 실제로 측정된 경우에만 백엔드 계산 결과를 보여준다 */}
      {!layerMode && egfr && <DomainHeader title="신장" />}
      {egfr && (
        <FadeInUp delay={180}>
        <SummaryCard title="콩팥이 잘 거르고 있나" term="eGFR" definition={cardContent['콩팥이 잘 거르고 있나']?.definition} detail={cardContent['콩팥이 잘 거르고 있나']?.detail} meaning={cardContent['콩팥이 잘 거르고 있나']?.meaning} tips={cardContent['콩팥이 잘 거르고 있나']?.tips} summary={`1분에 ${egfr.egfr}mL를 걸러요`}
          axes={['standard']}
          badge={<VerdictBadge v={egfr.severity === 'normal' ? 'good' : egfr.severity === 'high' ? 'bad' : 'watch'} />}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
            <Text style={{ fontSize: 28, fontWeight: '800', color: T.text1 }}>{egfr.egfr}</Text>
            <Text style={{ fontSize: T.fs.caption, color: T.text3 }}>{egfr.unit}</Text>
            <View style={{ marginLeft: 6, backgroundColor: egfr.severity === 'normal' ? T.successBg : egfr.severity === 'high' ? T.dangerBg : T.warnBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: T.radiusPill }}>
              <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: egfr.severity === 'normal' ? T.success : egfr.severity === 'high' ? T.danger : T.warn }}>{egfr.stage} · {egfr.label}</Text>
            </View>
          </View>
          {/* ③은 카드를 열자마자 보이는 칸이라 «89.4 mL/min/1.73㎡»만 있으면 그 숫자가
              무엇인지 알 수 없다. ②를 읽고 내려온 사람만 이해하는 화면이 되면 안 된다.
              단위를 풀어 쓴 한 줄과 눈금을 붙인다 — 계산기 행이 «값 + 기준:»을 쓰는 것과
              같은 모양이고, §7 「수치엔 항상 해석 한 줄」이 요구하는 것이다.
              컷오프 숫자는 값의 눈금이라 2뎁스에 남긴다(§2-1). */}
          <Text style={{ fontSize: T.fs.caption, color: T.text2, lineHeight: 20 }}>
            1분에 {egfr.egfr}mL의 피를 걸러내고 있어요.
          </Text>
          <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginTop: 3, marginBottom: 5 }}>
            기준: 90 이상 정상 / 60~89 경도 감소 / 60 미만이 3개월 이상이면 만성 신장질환 범위
          </Text>
          <Text style={{ fontSize: T.fs.caption, color: T.text2, lineHeight: 20 }}>{egfr.description}</Text>
          {/* CrCl — 그 해 검진에 체중이 기록된 경우에만 백엔드가 함께 계산해 준다(약물 용량 참고용).
              ⚠️ 접는다: 이건 «약을 처방받을 때 쓰는 값»이라 검진 결과를 보러 온 사람에게는 부차적이다.
              내 신장이 어떤지는 위 89.4와 구간 배지가 이미 말했다(§2-1 「2뎁스는 요약이다」). */}
          {egfr.crcl != null && (
            <Expandable label="약 먹을 때 쓰는 값도 보기">
            <View style={{ marginTop: 4 }}>
              <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text1, marginBottom: 4 }}>약물 용량 참고 (CrCl)</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                <Text style={{ fontSize: T.fs.h3, fontWeight: '800', color: T.text1 }}>{egfr.crcl}</Text>
                <Text style={{ fontSize: T.fs.caption, color: T.text3 }}>mL/min · {egfr.crcl_method ?? 'Cockcroft-Gault'}</Text>
                {!!egfr.crcl_label && (
                  <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text2, backgroundColor: T.cardAlt, paddingHorizontal: 7, paddingVertical: 3, borderRadius: T.radiusPill }}>{egfr.crcl_label}</Text>
                )}
              </View>
              {!!egfr.crcl_note && (
                <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20 }}>{egfr.crcl_note}</Text>
              )}
            </View>
            </Expandable>
          )}
        </SummaryCard>
        </FadeInUp>
      )}

      {/* 간 — FLI/HSI 보조지표 + 지방간 유형 + 간 계산기(BARD·De Ritis) */}
      {/* fattyLiverType은 이제 「지방간」 카드 «안»의 한 칸이라 구획 조건에서 뺐다 —
          유형만 있고 FLI·HSI가 없는 경우는 없다(둘 다 같은 검진 수치에서 나온다). */}
      {/* 지방간 — 「보조지표(FLI·HSI)」와 「유형(MASLD/MetALD/ALD)」을 한 카드로 합쳤다(2026-08-02).
          둘은 같은 질문의 앞뒤다: «지방간일 가능성이 있나» → «그렇다면 왜 그런가».
          갈라 두니 유형 카드가 조건(ALT>40 또는 GGT>75)을 못 맞추는 해에 아무 말 없이 사라져,
          «원래 없는 기능»으로 읽혔다. 합치면 그 자리에서 왜 지금은 대상이 아닌지 말할 수 있다.
          값·구간·해석 문구는 전부 백엔드가 만들어 보내준 것을 그대로 쓴다. */}
      {!layerMode && flIndices && (flIndices.fli || flIndices.hsi) && <DomainHeader title="간" />}
      {flIndices && (flIndices.fli || flIndices.hsi) && (
        <FadeInUp delay={215}>
        <SummaryCard title="간에 지방이 꼈나" term="FLI·HSI" definition={cardContent['간에 지방이 꼈나']?.definition} detail={cardContent['간에 지방이 꼈나']?.detail} meaning={cardContent['간에 지방이 꼈나']?.meaning} tips={cardContent['간에 지방이 꼈나']?.tips}
          summary={[
            fattyLiverType ? `${fattyLiverType.type}${fattyLiverType.provisional ? ' (잠정)' : ''}` : null,
            worstInterpretation([flIndices.fli, flIndices.hsi].filter(Boolean) as { level: string; interpretation?: string | null }[]),
          ].filter(Boolean).join(' · ')}
          axes={['standard']}
          badge={<VerdictBadge v={worstVerdict([flIndices.fli, flIndices.hsi].filter(Boolean).map((x) => x!.level))} />}>
          {/* ── 가능성은 어느 정도인가 ─────────────────── */}
          <Text style={{ fontSize: T.fs.body, fontWeight: '800', color: T.text1, marginBottom: 4 }}>가능성은 어느 정도인가</Text>
          {([
            { title: 'FLI', idx: flIndices.fli },
            { title: 'HSI', idx: flIndices.hsi },
          ] as const).filter((r) => r.idx).map((r, i) => (
            <View key={r.title} style={[{ paddingVertical: 12 }, i > 0 && { borderTopWidth: 1, borderTopColor: T.divider }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                {/* 영문 원명(formula)은 아래 펼침으로 내렸다 — 「Fatty Liver Index (Bedogni 2006)」이
                    값 옆에 붙어 있으면 정작 57.3과 구간 배지가 안 읽힌다(§2-1 축 2). */}
                <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text1, flex: 1 }}>{r.title}</Text>
                <View style={{ backgroundColor: levelBg(r.idx!.level), paddingHorizontal: 8, paddingVertical: 3, borderRadius: T.radiusPill }}>
                  <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: levelColor(r.idx!.level) }}>{r.idx!.interpretation}</Text>
                </View>
              </View>
              <Text style={{ fontSize: T.fs.h3, fontWeight: '800', color: T.text1 }}>{r.idx!.value}</Text>
              {!!r.idx!.cutoffs && <Text style={{ fontSize: T.fs.caption, color: T.text3, marginTop: 3 }}>기준: {r.idx!.cutoffs}</Text>}
            </View>
          ))}
          <Expandable label="계산식과 한계 보기">
            {([{ title: 'FLI', idx: flIndices.fli }, { title: 'HSI', idx: flIndices.hsi }] as const)
              .filter((r) => r.idx?.formula)
              .map((r) => (
                <Text key={r.title} style={{ fontSize: T.fs.caption, color: T.text2, lineHeight: 20, marginTop: 4 }}>
                  <Text style={{ fontWeight: '700' }}>{r.title}</Text> — {r.idx!.formula}
                </Text>
              ))}
            {!!flIndices.unavailable?.length && (
              <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginTop: 8 }}>· 계산 불가: {flIndices.unavailable.join(' / ')}</Text>
            )}
            {!!flIndices.disclaimer && (
              <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginTop: 8 }}>{flIndices.disclaimer}</Text>
            )}
          </Expandable>

          {/* ── 원인은 무엇인가 ─────────────────────────
              MASLD/MetALD/ALD — 지방간이 의심될 때 원인이 대사인지 음주인지 가른다.
              ⚠️ 대상이 아닌 해에도 «칸을 지우지 않는다». 예전에는 카드가 통째로 사라져
              「원래 없는 기능」으로 읽혔다. 왜 지금은 판정하지 않는지 밝히는 것이
              §1-1②(무엇을 왜 뺐고 어디서 볼 수 있는지)를 지키는 방법이다. */}
          <View style={{ marginTop: 20, paddingTop: 18, borderTopWidth: 1, borderTopColor: T.divider }}>
            <Text style={{ fontSize: T.fs.body, fontWeight: '800', color: T.text1, marginBottom: 6 }}>원인은 무엇인가</Text>
            {fattyLiverType ? (
              <>
                <Text style={{ fontSize: T.fs.body, fontWeight: '700', color: T.text1, marginBottom: 6 }}>
                  {fattyLiverType.type}{fattyLiverType.provisional ? ' (잠정)' : ''}
                </Text>
                <Text style={{ fontSize: T.fs.caption, color: T.text2, lineHeight: 20 }}>{fattyLiverType.basis}</Text>
                {/* 판정 근거인 심장대사 위험인자 — 결론(유형)만 있고 근거가 없으면 왜 그렇게 나뉘었는지 알 수 없다.
                    2025 MASLD 지침의 5종 중 실제로 해당한 것만 백엔드가 담아 보낸다. */}
                {!!fattyLiverType.cardiometabolic_factors?.length && (
                  <View style={{ marginTop: 14 }}>
                    <Text style={{ fontSize: T.fs.caption, color: T.text3, marginBottom: 6 }}>해당하는 심장대사 위험인자</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {fattyLiverType.cardiometabolic_factors.map((f) => (
                        <View key={f} style={{ backgroundColor: T.warnBg, paddingHorizontal: 9, paddingVertical: 4, borderRadius: T.radiusPill }}>
                          <Text style={{ fontSize: T.fs.caption, fontWeight: '600', color: T.warn }}>{f}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
                {!!fattyLiverType.note && (
                  <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginTop: 10 }}>{fattyLiverType.note}</Text>
                )}
              </>
            ) : (
              <Text style={{ fontSize: T.fs.caption, color: T.text2, lineHeight: 20 }}>
                간 수치(ALT·감마-GTP)가 모두 기준 안이라 {report.year}년은 유형을 가릴 대상이 아니에요.
                기준을 넘은 해를 위에서 고르면 그 해의 유형이 나옵니다.
              </Text>
            )}
            {/* 유형 카드에 있던 2.5뎁스(2025 MASLD 지침)를 여기로 옮겼다.
                ②의 detail은 FLI·HSI 설명이 이미 쓰고 있어, 둘을 합치면 6줄 상한을 넘는다. */}
            <Expandable label="유형을 어떻게 나누나">
              <Text style={{ fontSize: T.fs.caption, color: T.text2, lineHeight: 20, marginTop: 4 }}>
                {FATTY_LIVER_TYPE_CRITERIA}
              </Text>
            </Expandable>
          </View>
        </SummaryCard>
        </FadeInUp>
      )}

      {/* 간 계산기 (BARD·De Ritis) — FLI/HSI(지방증)에 이어 섬유화·유형 지표 */}
      {liverCalcs.length > 0 && (
        <FadeInUp delay={217}>
        <SummaryCard title="간이 굳어가고 있나" term="BARD·De Ritis" definition={cardContent['간이 굳어가고 있나']?.definition} detail={cardContent['간이 굳어가고 있나']?.detail} meaning={cardContent['간이 굳어가고 있나']?.meaning} tips={cardContent['간이 굳어가고 있나']?.tips} positionExtra={<CalcRankBlock items={liverCalcs} />} axes={calcAxes(liverCalcs)} summary={worstInterpretation(liverBard)}
          badge={<VerdictBadge v={worstVerdict(liverCalcs.map((it) => it.level))} />}>
          {/* 카드 제목의 질문에 답하는 BARD만 2뎁스에 편다. De Ritis·ALT/GGT는
              «굳어가나»가 아니라 «손상 원인이 술이냐»를 보므로 접힌 채로 둔다 —
              결론을 BARD가 맡는 것과 같은 이유다.
              ⚠️ 예전에는 셋을 통째로 접었는데, 그러면 «내 수치가 얼마인지»를 보려고도
              접기를 열어야 했다. 축 2가 막는 것은 공식이지 값·컷오프가 아니다. */}
          <CalcRows items={liverBard} />
          <Expandable label={liverOthers.length > 0 ? `손상 원인 지표 ${liverOthers.length}종 · 공식과 근거` : '공식과 근거'}>
            {liverOthers.length > 0 && (
              <>
                <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text2, marginTop: 4 }}>
                  손상 원인 지표 {liverOthers.length}종 <Text style={{ fontSize: T.fs.caption, fontWeight: '500', color: T.text3 }}>(굳기가 아니라 «왜»를 본다)</Text>
                </Text>
                <CalcRows items={liverOthers} />
              </>
            )}
            <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text2, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.divider }}>
              공식과 근거
            </Text>
            <CalcFormulas items={liverCalcs} />
          </Expandable>
        </SummaryCard>
        </FadeInUp>
      )}

      {/* 대사·지질 — 검증된 수치 계산기(지질비·인슐린저항성·내장지방·혈압) */}
      {!layerMode && metabolicCalcs.length > 0 && <DomainHeader title="대사·지질" />}
      {metabolicCalcs.length > 0 && (
        <FadeInUp delay={216}>
        <SummaryCard title="혈당·지질에 이상이 있나" term="TyG·Non-HDL" definition={cardContent['혈당·지질에 이상이 있나']?.definition} detail={cardContent['혈당·지질에 이상이 있나']?.detail} meaning={cardContent['혈당·지질에 이상이 있나']?.meaning} tips={cardContent['혈당·지질에 이상이 있나']?.tips} positionExtra={<CalcRankBlock items={metabolicCalcs} />} axes={calcAxes(metabolicCalcs)} summary={levelSummary(metabolicCalcs.map((it) => it.level))}
          badge={<VerdictBadge v={worstVerdict(metabolicCalcs.map((it) => it.level))} />}>
          {/* 대표 3종(TyG·Non-HDL·MAP)만 2뎁스에 편다. 9종을 다 펴면 스크롤이 길어지고,
              나머지 6종은 대표와 r 0.79~0.94로 강상관이라 같은 말을 여섯 번 하는 셈이다.
              ⚠️ 여기 있던 「관련 지표 N종 더보기」는 Expandable과 **모양이 다른 접기**였다
              (chevron이 왼쪽, 좌측 정렬). 한 카드 안에 접는 방법이 둘이면 사용자가 다른
              기능으로 읽는다 — 접기는 하나로 유지하고 대표/관련은 소제목으로만 나눈다. */}
          <CalcRows items={metabolicPrimary} />
          <Expandable label={metabolicRedundant.length > 0 ? `관련 지표 ${metabolicRedundant.length}종 · 공식과 근거` : '공식과 근거'}>
            {metabolicRedundant.length > 0 && (
              <>
                <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text2, marginTop: 4 }}>
                  관련 지표 {metabolicRedundant.length}종 <Text style={{ fontSize: T.fs.caption, fontWeight: '500', color: T.text3 }}>(대표 지표와 강한 상관)</Text>
                </Text>
                <CalcRows items={metabolicRedundant} />
              </>
            )}
            <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text2, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.divider }}>
              공식과 근거
            </Text>
            <CalcFormulas items={metabolicCalcs} />
          </Expandable>
          {/* 계산하지 못한 지표 — 값이 없는 걸 조용히 빼면 '원래 그런 개수'로 읽힌다.
              무엇이 왜 빠졌는지(어떤 검사가 필요한지) 백엔드 문구를 그대로 밝힌다. */}
          {calcUnavailable.length > 0 && (
            <View style={{ marginTop: 4, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.divider }}>
              <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text2, marginBottom: 2 }}>
                계산하지 못한 지표 {calcUnavailable.length}종
              </Text>
              <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginBottom: 6 }}>
                이번 검진에 필요한 값이 없어 만들지 못했어요(간·심혈관 지표 포함).
              </Text>
              {calcUnavailable.map((u) => (
                <Text key={u} style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20 }}>· {u}</Text>
              ))}
            </View>
          )}
          {!!calcDisclaimer && (
            <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginTop: 10 }}>{calcDisclaimer}</Text>
          )}
        </SummaryCard>
        </FadeInUp>
      )}

      {/* LDL 개인 목표 — 같은 LDL이라도 위험군에 따라 목표가 다르다(초고위험<55 … 저위험<160).
          배지: achieved가 null이면 판정 보류다(TG≥400이면 Friedewald LDL의 신뢰도가 떨어진다).
          그때는 배지를 달지 않는다 — 모르는 것을 양호나 주의로 말하지 않는다.
          1뎁스 결론은 ldlSummary()가 만든다 — 목표 «숫자»가 아니라 그 숫자가 나온
          «이유»를 앞에 세운다. 숫자만 말하면 검진지의 LDL 판정과 구분이 안 되어
          이 카드가 존재하는 이유(«정상 범위는 모두에게 같지 않다»)가 사라진다. */}
      {ldlTarget && (
        <FadeInUp delay={205}>
        <SummaryCard
          title="내 LDL 목표를 넘었나"
          definition={cardContent['내 LDL 목표를 넘었나']?.definition}
          detail={cardContent['내 LDL 목표를 넘었나']?.detail}
          meaning={cardContent['내 LDL 목표를 넘었나']?.meaning}
          tips={cardContent['내 LDL 목표를 넘었나']?.tips}
          summary={ldlSummary(ldlTarget)}
          badge={<VerdictBadge v={ldlTarget.achieved == null ? null : ldlTarget.achieved ? 'good' : 'watch'} />}
          axes={['standard']}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Text style={{ fontSize: T.fs.h3, fontWeight: '800', color: T.text1 }}>{ldlTarget.target_text}</Text>
            {ldlTarget.achieved != null && (
              <View style={{ backgroundColor: ldlTarget.achieved ? T.successBg : T.warnBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: T.radiusPill }}>
                <Text style={{ fontSize: T.fs.caption, fontWeight: '800', color: ldlTarget.achieved ? T.success : T.warn }}>
                  {ldlTarget.achieved ? '목표 달성' : `목표 초과${ldlTarget.gap != null ? ` +${ldlTarget.gap}` : ''}`}
                </Text>
              </View>
            )}
            {/* 중성지방이 높으면 LDL 계산값을 믿기 어려워 달성 여부를 단정하지 않는다. */}
            {ldlTarget.ldl_reliable === false && (
              <View style={{ backgroundColor: T.cardAlt, paddingHorizontal: 10, paddingVertical: 4, borderRadius: T.radiusPill }}>
                <Text style={{ fontSize: T.fs.caption, fontWeight: '800', color: T.text3 }}>판정 보류</Text>
              </View>
            )}
          </View>
          {ldlTarget.current_ldl != null && (
            <Text style={{ fontSize: T.fs.caption, color: T.text2, marginBottom: 4 }}>현재 LDL {ldlTarget.current_ldl}mg/dL · 위험군: {ldlTarget.label}</Text>
          )}
          {ldlTarget.ldl_reliable === false && !!ldlTarget.reliability_note && (
            <View style={{ backgroundColor: T.warnBg, borderRadius: 10, padding: 12, marginTop: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: T.fs.caption, fontWeight: '800', color: T.warn, marginBottom: 4 }}>⚠️ LDL 수치 신뢰도 확인 필요</Text>
              <Text style={{ fontSize: T.fs.caption, color: T.text2, lineHeight: 20 }}>{ldlTarget.reliability_note}</Text>
            </View>
          )}
          {/* 위험인자는 2뎁스에 둔다 — 「왜 내 목표가 이 숫자인가」가 이 카드에서 가장
              궁금한 것인데, 접어 두면 2뎁스가 「위험군: 중등도위험군」이라는 결과만 말하고
              근거는 안 보인다. 흡연·고혈압·나이는 쉽고 중요하니 축 1대로 위로 온다.
              «어떻게» 정했는지의 한계·출처만 2.5뎁스에 남긴다. */}
          {!!ldlTarget.risk_factors?.length && (
            <View style={{ marginTop: 8, backgroundColor: T.cardAlt, borderRadius: 10, padding: 12 }}>
              <Text style={{ fontSize: T.fs.caption, color: T.text2, lineHeight: 20 }}>
                내 목표가 {ldlTarget.target_ldl ?? ldlTarget.target_text}인 이유 — 위험 요인 {ldlTarget.risk_factors.length}개가 있어요.
              </Text>
              <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text1, lineHeight: 20, marginTop: 4 }}>
                {ldlTarget.risk_factors.join(' · ')}
              </Text>
            </View>
          )}
          <Expandable label="위험군을 어떻게 정했나">
            {!!ldlTarget.limitations?.length && (
              <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginTop: 8 }}>· {ldlTarget.limitations[0]}</Text>
            )}
            <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginTop: 4 }}>기준: {ldlTarget.reference}</Text>
          </Expandable>
        </SummaryCard>
        </FadeInUp>
      )}

      {/* 심혈관 — ASCVD 위험 계산기 */}
      {/* 한계는 ③이 아니라 카드 맨 밑(footer)이다 — 「미국 코호트라 한국인에게 과대추정」은
          ③「나의 위치」에 대한 한계가 아니라 이 카드가 내놓은 «모든 숫자»에 걸린다.
          ③ 안에 있으면 시나리오 표와 다른 계산법 사이에 끼어 그 범위가 흐려졌다.
          ⚠️ 접지 않는다. 접기는 «길어서 감추는» 장치인데 이건 11pt 회색 4줄이라 감출
          부피가 아니고, 무엇보다 열어야 보이면 «이 %를 그대로 믿지 말라»는 말이
          안 읽힌 채로 화면을 떠날 수 있다. 고지문과 같은 층위로 그냥 펴 둔다. */}
      {/* ③-5 ASCVD 10년 위험도 — 참고용 시뮬레이션(한국인 미검증, 진단 아님).
          계산 불가(available=false)면 카드를 그리지 않는다 — 값을 지어내 보여주지 않는다.
          배지는 2뎁스 안 배지(아래)와 같은 갈래를 쓴다 — 한 카드가 겉과 속에서 다른 색을 말하면 안 된다. */}
      {/* ⚠️ 괄호가 필요하다. `A || B && <X/>`는 `A || (B && <X/>)`로 묶여서,
          A가 참이면 식 전체가 true가 되고 React는 true를 아무것도 그리지 않는다 —
          ascvd가 있는 해에는 「심혈관」 구획이 조용히 사라졌다. */}
      {!layerMode && ((ascvd?.available && ascvd.risk_percent != null) || cvCalcs.length > 0) && <DomainHeader title="심혈관" />}
      {ascvd?.available && ascvd.risk_percent != null && (
        <FadeInUp delay={221}>
        <SummaryCard
          title="심혈관 위험이 얼마나 되나" term="ASCVD"
          definition={cardContent['심혈관 위험이 얼마나 되나']?.definition}
          detail={cardContent['심혈관 위험이 얼마나 되나']?.detail}
          meaning={cardContent['심혈관 위험이 얼마나 되나']?.meaning}
          tips={cardContent['심혈관 위험이 얼마나 되나']?.tips} positionExtra={<CalcRankBlock items={cvCalcs} />} axes={calcAxes(cvCalcs)}
          summary={`10년 위험 ${ascvd.risk_percent}%${ascvd.risk_label ? ` · ${ascvd.risk_label}` : ''}`}
          badge={<VerdictBadge v={ascvd.risk_level === 'low' ? 'good' : ascvd.risk_level === 'high' ? 'bad' : 'watch'} />}
          footer={!!ascvd.limitations?.length && (
            <>
              {ascvd.limitations.map((l, i) => (
                <Text key={i} style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginTop: i === 0 ? 0 : 3 }}>· {l}</Text>
              ))}
            </>
          )}
        >
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
            <Text style={{ fontSize: 28, fontWeight: '800', color: T.text1 }}>{ascvd.risk_percent}%</Text>
            {!!ascvd.risk_label && (
              <View style={{ marginLeft: 2, backgroundColor: ascvd.risk_level === 'low' ? T.successBg : ascvd.risk_level === 'high' ? T.dangerBg : T.warnBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: T.radiusPill }}>
                <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: ascvd.risk_level === 'low' ? T.success : ascvd.risk_level === 'high' ? T.danger : T.warn }}>{ascvd.risk_label}</Text>
              </View>
            )}
          </View>
          {!!ascvd.how_to_read && (
            <Text style={{ fontSize: T.fs.caption, color: T.text2, lineHeight: 20, marginBottom: 10 }}>{ascvd.how_to_read}</Text>
          )}
          {/* what-if — 절대값보다 "무엇을 바꾸면 얼마나 달라지는가"를 보여준다 */}
          {!!ascvd.scenarios?.length && (
            <View style={{ paddingTop: 10, borderTopWidth: 1, borderTopColor: T.divider, gap: 8 }}>
              {ascvd.scenarios.map((s) => (
                <View key={s.name} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: T.fs.caption, color: T.text1, flex: 1 }}>{s.name}</Text>
                  <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text1 }}>
                    {s.risk_percent}%{' '}
                    <Text style={{ color: s.delta < 0 ? T.success : T.text3, fontSize: T.fs.caption }}>({s.delta > 0 ? '+' : ''}{s.delta}%p)</Text>
                  </Text>
                </View>
              ))}
            </View>
          )}
          {/* 다른 위험엔진 3종(PREVENT·Framingham·SCORE2) — 계산은 되고 있었으나 그리지 않던 값.
              엔진마다 코호트·공식이 달라 값이 조금씩 다르다. 그 차이를 보여주는 것 자체가
              "절대값을 그대로 믿지 말라"는 메시지라, 숨기지 않고 2.5뎁스로 펼쳐 볼 수 있게 둔다. */}
          {/* ⚠️ 자체 Pressable로 만든 접기였다 — chevron이 왼쪽, 좌측 정렬이라 바로 위
              「자세히 알아보기」(가운데, chevron 오른쪽)와 모양이 달랐다. 한 화면에 접는
              방법이 둘이면 사용자가 다른 기능으로 읽는다. Expandable로 통일한다. */}
          {cvCalcs.length > 0 && (
            <Expandable label={`다른 계산법 ${cvCalcs.length}종으로도 계산해보기`}>
              <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginBottom: 4 }}>
                같은 위험을 다른 공식으로 계산한 값이에요. 서로 비슷하면 그만큼 믿을 만하고,
                많이 다르면 절대값보다 구간으로 이해하는 게 맞아요.
              </Text>
              <CalcRows items={cvCalcs} />
              {/* 이 블록은 통째로 2.5뎁스(접힌 안)라 공식을 함께 둔다 — CalcRows가
                  공식을 더 이상 그리지 않으므로 여기서 이어 붙인다. */}
              <CalcFormulas items={cvCalcs} />
            </Expandable>
          )}
        </SummaryCard>
        </FadeInUp>
      )}
      </LayerGrid>
      </>)}

      {/* ③층 이름은 "같은 또래는 어떤가" — "나만 그런가"였을 때 '또래 자체가 나빠졌나'(집단 추세)가
          층 이름(내 위치)과 안 맞았다. 또래 분포·16년 변화·내 위치를 모두 덮는 이름으로. */}
      {showLayer(2) && (<>
      <LayerHeader first={layerMode} step={LAYERS[2].step} title={LAYERS[2].title} sub="같은 성별·연령대 사람들은 어떤 상태인지, 그 안에서 나는 어디쯤인지 봅니다." />

      {/* ③-0 또래 순위 모아 보기.
       *
       *  ⚠️ 층 이름이 「같은 또래는 어떤가」인데 정작 또래 비교는 ①(항목·그룹)과
       *  ②(계산기)에 흩어져 있었다. 층을 «기능»으로 나눠 놓고 그 기능을 다른 층에서
       *  하면 층이 장식이 된다 — 사용자가 「또래와 견준 걸 보고 싶다」고 ③에 오면
       *  집단 통계 두 장밖에 없었다.
       *
       *  ⚠️ 판정 옆의 한 줄은 **지우지 않는다.** 「고혈압 해당」 바로 밑의
       *  「또래 100명 중 32명」은 그 판정을 읽는 «맥락»이고, 여기 모아 보기는
       *  「내가 또래 중 어디쯤인가」라는 **다른 질문**이다. 읽는 목적이 달라
       *  겹쳐도 «같은 말 두 번»이 되지 않는다(기록 39의 장기 구획과 같은 판단). */}
      <LayerGrid on={layerMode}>
      <PeerRankRoundup
        metrics={metricsForReport(report, metricDefinitions)}
        report={report}
        groups={singleGroups}
        prevalence={pop16?.peer_prevalence}
        calcs={calcItems}
      />

      {/* ③-1 같은 또래 분포 (A1') — "나 같은 사람은 100명 중 N명"은 쉬운 문장이라 1뎁스에 둔다.
          A3에서 참고군 카드 5장이 제거되어 지금은 이 카드가 care_distribution의 유일한 표시이고,
          묶음 근거(basis, A7)도 여기 2뎁스에서 밝힌다. */}
      {(() => {
        const cd = pop16?.care_distribution;
        if (!cd) return null;
        const withDist = groups.filter((g) => cd[g.name]);
        if (!withDist.length) return null;
        const samePct = (g: (typeof groups)[number]) => cd[g.name]!.dist.find((x) => x.hits === g.matches)?.pct ?? 0;
        // 대표 = 걸린 항목이 가장 많은 참고군, 동수면 같은 상태가 더 드문 쪽 — 가장 할 말이 많은 분포를 앞세운다.
        const lead = [...withDist].sort((a, b) => (b.matches - a.matches) || (samePct(a) - samePct(b)))[0];
        const dLead = cd[lead.name]!;
        const p = samePct(lead);
        const fmtN = (v: number) => (v >= 10 ? String(Math.round(v)) : String(Math.max(0.1, Math.round(v * 10) / 10)));
        return (
          <FadeInUp delay={205}>
            <SummaryCard
              title="나 같은 사람이 얼마나 되나"
              summary={`또래 100명 중 ${fmtN(p)}명이에요`}
              definition="검사 항목 묶음(관리 참고군)마다 '기준을 벗어난 항목 수'가 같은 성별·연령대에서 어떻게 분포하는지 본 거예요. 빨간 막대가 지금 나의 자리예요."
              meaning="막대가 낮을수록 같은 또래에서 드문 상태라는 뜻이에요. 드물다고 곧 더 위험한 것은 아니고, 위험이 얼마나 되는지는 위 ②층 계산기(심혈관 위험 등)가 따로 맡아요."
              axes={['peer']}
              preview={
                <View style={{ marginTop: 12 }}>
                  <CareDistBars dist={dLead.dist} mine={lead.matches} height={36} />
                </View>
              }
            >
              {/* 대표 묶음의 분포는 1뎁스 preview에 이미 그려져 있다. 여기 나머지 묶음까지
                  전부 펼치면 막대가 다섯 벌이라 카드가 한 화면을 넘는다 — 접는다(§2-1). */}
              <Text style={{ fontSize: T.fs.caption, color: T.text2, lineHeight: 20 }}>
                묶음 {withDist.length}개마다 «기준을 벗어난 항목 수»가 또래에서 어떻게 퍼져 있는지 봤어요.
              </Text>
              <Expandable label={`묶음 ${withDist.length}개 분포 보기`}>
              {withDist.map((g, i) => {
                const d = cd[g.name]!;
                const gp = samePct(g);
                return (
                  <View key={g.name} style={[{ paddingVertical: 14 }, i > 0 && { borderTopWidth: 1, borderTopColor: T.divider }]}>
                    <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text1, marginBottom: 2 }}>{g.name}</Text>
                    <Text style={{ fontSize: T.fs.caption, color: T.text2, lineHeight: 20, marginBottom: 10 }}>
                      {g.matches > 0 ? `${g.keys.length}개 중 ${g.matches}개 해당 — 나 같은 사람은 100명 중 ${fmtN(gp)}명` : `해당 없음 — 나 같은 사람은 100명 중 ${fmtN(gp)}명`}
                    </Text>
                    <CareDistBars dist={d.dist} mine={g.matches} />
                    <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginTop: 8 }}>
                      같은 성별·연령대 {d.total.toLocaleString()}명 기준
                    </Text>
                    {/* 묶음 근거(A7·§1-1③) — 참고군 카드가 제거된 뒤 이 묶음이 노출되는 유일한 자리라 근거도 여기서 밝힌다. */}
                    <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginTop: 4 }}>
                      {g.basis}
                    </Text>
                  </View>
                );
              })}
              <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginTop: 6 }}>
                공단 표본 1,596만 건에서 나와 같은 성별·연령대만 골라 센 값이에요. 모집단은 학회 기준 수치로만 세어 앱 판정과 조금 다를 수 있어요.
              </Text>
              </Expandable>
            </SummaryCard>
          </FadeInUp>
        );
      })()}

      {/* ④-0 함께 봐야 할 조합 — 예전에는 ③층 「이 조합이 흔한가」였다. 두 가지가 어긋나 옮겼다.
       *
       *  1) 카드가 답하던 질문이 행동을 바꾸지 않았다. 「내 조합은 100명 중 10명」을 지워도
       *     축 0의 «열지 말지»가 흔들리지 않고, 바로 위 「나 같은 사람이 얼마나 되나」가
       *     이미 «나의 드묾»을 말해 사용자에게 같은 질문으로 읽혔다.
       *  2) 정작 쓸모 있는 것(관계 → 순서)은 또래 이야기가 아니라 «행동» 이야기다.
       *     ③층 이름이 「같은 또래는 어떤가」인데 「허리둘레 하나가 둘을 같이 움직입니다」가
       *     거기 있었다. 층이 틀렸다.
       *
       *  ⚠️ O/E는 사라지지 않는다 — 결론에서 «근거»로 자리를 옮겼다(§1-1 자산은 죽이지 않는다).
       *  「왜 이 둘을 같이 보라는 건가」의 답이 되어 오히려 제 역할을 한다.
       *  ⚠️ 근거의 출처가 둘이다. 동반빈도(O/E)는 공단 표본 실측이고, «왜 같이 나타나는가»
       *  (relation·action)는 임상 지식이다. 화면이 그 차이를 밝혀야 한다(§1-1 조항 3). */}
      {comboGroups && comboGroups.matched_count > 0 && (
        <FadeInUp delay={210}>
        <SummaryCard title="함께 움직이는 게 있나"
          definition={cardContent['함께 움직이는 게 있나']?.definition}
          detail={cardContent['함께 움직이는 게 있나']?.detail}
          meaning={cardContent['함께 움직이는 게 있나']?.meaning}
          summary={comboSummary(comboGroups.matched)}
          axes={['peer']} meaningExtra={leadCombo ? <ComboMeanCompare combo={leadCombo} /> : undefined}
          tipsExtra={<ComboActions combos={comboGroups.matched} />}>
          <Text style={{ fontSize: T.fs.caption, color: T.text2, marginBottom: 14 }}>
            국민건강보험공단 표본{comboGroups.population.total_n ? ` ${(comboGroups.population.total_n / 10000).toFixed(0)}만명` : ''}과 견줬어요.
          </Text>

          <Expandable label={`조합 ${Math.min(comboGroups.matched.length, 4)}개 보기`}>
          {comboGroups.matched.slice(0, 4).map((c, i) => (
            <View key={c.combo_name} style={[{ paddingVertical: 12 }, i > 0 && { borderTopWidth: 1, borderTopColor: T.divider }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text1, flex: 1 }}>{c.combo_name}</Text>
                {c.is_ascvd_risk && (
                  <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text3, backgroundColor: T.cardAlt, paddingHorizontal: 7, paddingVertical: 3, borderRadius: T.radiusPill }}>
                    심혈관 지표 참고
                  </Text>
                )}
              </View>
              <Text style={{ fontSize: T.fs.caption, color: T.text2, lineHeight: 20, marginBottom: 6 }}>{c.meaning}</Text>
              {/* 관계 유형 — 이 조합이 «개별 판정에 더해» 말해주는 것. 두 항목이 같은
                  원인에서 나오는지, 하나가 다른 하나를 미는지, 서로 다른 축인지에 따라
                  «무엇부터 잡아야 하나»가 달라진다. 그 순서가 ⑤의 행동이 된다. */}
              {!!c.relation_label && (
                <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginBottom: 6 }}>
                  두 항목은 {c.relation_label}
                </Text>
              )}
              {c.population && (
                <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20 }}>
                  같은 조합 {c.population.n_in_combo.toLocaleString()}명 (표본의 {c.population.pct_of_total}%)
                  {c.population.observed_to_expected >= 1.2 && (
                    <Text style={{ color: T.warn, fontWeight: '700' }}>
                      {'  ·  '}따로 나타날 때보다 {c.population.observed_to_expected}배 자주 동반
                    </Text>
                  )}
                </Text>
              )}
              {/* 16년 재현성 — 한 해 값 하나는 "그 해만 그랬나?"라는 반문을 받는다.
                  16년 중앙값과 범위를 함께 보여 우연이 아님을 밝힌다(28번 문서 §3-B). */}
              {(() => {
                const o = pop16?.combo_oe?.[c.combo_name];
                if (!o) return null;
                return (
                  <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginTop: 4 }}>
                    {o.year_from}~{o.year_to}년 {o.n_years}개 연도에서도 {o.min}~{o.max}배로 꾸준했어요 (중앙값 {o.median}배).
                    {o.lipid_era_only ? ' 지질검사를 전원 받던 시기만 세어 기준을 맞췄습니다.' : ''}
                  </Text>
                );
              })()}
            </View>
          ))}

          {comboGroups.matched.length > 4 && (
            <Text style={{ fontSize: T.fs.caption, color: T.text3, marginTop: 10 }}>
              외 {comboGroups.matched.length - 4}개 조합에 더 해당해요.
            </Text>
          )}

          {/* 판정 불가 조합 — 입력값이 없어 판정 못 한 조합을 지어내지 않고 그대로 밝힌다(정직성). */}
          {!!comboGroups.not_evaluable?.length && (
            <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.divider }}>
              <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text2, marginBottom: 2 }}>판정 불가 (데이터 부족)</Text>
              <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginBottom: 8 }}>입력값이 없어 지어내지 않고 '판정 불가'로 둔 조합이에요.</Text>
              {comboGroups.not_evaluable.map((n, i) => (
                <View key={n.combo_name} style={[{ paddingVertical: 8 }, i > 0 && { borderTopWidth: 1, borderTopColor: T.divider }]}>
                  <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text1, marginBottom: 2 }}>{n.combo_name}</Text>
                  <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20 }}>
                    {n.reason}{n.missing?.length ? ` (부족: ${n.missing.join('·')})` : ''}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* 해석의 한계 — 숨기지 않고 그대로 노출한다 */}
          {!!comboGroups.caveats?.length && (
            <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.divider }}>
              {comboGroups.caveats.map((c, i) => (
                <Text key={i} style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginBottom: 3 }}>· {c}</Text>
              ))}
            </View>
          )}
          </Expandable>
        </SummaryCard>
        </FadeInUp>
      )}

      {/* 같은 나이대의 16년 변화 — 유병률 상승이 고령화 때문인지 아닌지를 가르는 분석.
          나이를 고정했으므로 "또래 집단 자체가 나빠졌다"는 뜻이고, 그래서 위쪽 '100명 중 N등'이
          기준선이 내려앉은 집단 안에서의 순위임을 알려준다. 근거: 28번 문서 §4.
          ⚠️ axes=[] — 이 카드에는 «나»가 없다. 2009년과 2024년 집단을 견준 것이라
          기준·또래·과거의 나 어느 축과도 «내 위치»를 만들지 않는다. 그래서 ③칸을 없애고
          막대를 ④「그래서 이게 의미하는 건」의 근거(meaningExtra)로 내렸다 —
          이 카드가 하는 말은 위치가 아니라 "평균이라는 자리가 안심할 근거가 아니다"이다. */}
      {!!pop16?.age_fixed_trend?.items?.length && (
        <FadeInUp delay={219}>
        <SummaryCard
          title="또래 자체가 나빠졌나"
          definition={cardContent['또래 자체가 나빠졌나']?.definition}
          detail={cardContent['또래 자체가 나빠졌나']?.detail}
          meaning={cardContent['또래 자체가 나빠졌나']?.meaning}
          tips={cardContent['또래 자체가 나빠졌나']?.tips}
          summary={(() => {
            const top = pop16.age_fixed_trend!.items[0];
            if (!top) return null;
            const band = pop16.age_fixed_trend!.age_band;
            return top.diff > 0
              ? `16년 새 ${band} ${top.name}이 ${top.y2009}%에서 ${top.y2024}%로 늘었어요`
              : `16년 새 ${band} ${top.name}이 ${top.y2009}%에서 ${top.y2024}%로 줄었어요`;
          })()}
          axes={[]}
          meaningExtra={<>
          <Text style={{ fontSize: T.fs.caption, color: T.text2, lineHeight: 20, marginTop: 12, marginBottom: 14 }}>
            {pop16.age_fixed_trend.sex} {pop16.age_fixed_trend.age_band} · 2009년 vs 2024년. 나와 같은 성별·연령대만 뽑아 16년 전과 비교했어요. 나이를 고정했기 때문에 고령화로 생기는 착시가 없어요.
          </Text>
          <Expandable label={`항목 ${pop16.age_fixed_trend.items.length}개 변화 보기`}>
          {pop16.age_fixed_trend.items.map((it, i) => {
            const worse = it.diff > 0;
            const max = Math.max(it.y2009, it.y2024, 1);
            return (
              <View key={it.group} style={[{ paddingVertical: 12 }, i > 0 && { borderTopWidth: 1, borderTopColor: T.divider }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text1 }}>{it.name}</Text>
                  <Text style={{ fontSize: T.fs.caption, fontWeight: '800', color: worse ? T.danger : T.success }}>
                    {worse ? '+' : ''}{it.diff}%p{it.ratio >= 1.5 ? ` · ${it.ratio}배` : ''}
                  </Text>
                </View>
                {([{ y: '2009년', v: it.y2009, c: T.text3 }, { y: '2024년', v: it.y2024, c: worse ? T.danger : T.success }] as const).map((r) => (
                  <View key={r.y} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <Text style={{ fontSize: T.fs.caption, color: T.text3, width: 44 }}>{r.y}</Text>
                    <View style={{ flex: 1, height: 8, backgroundColor: T.cardAlt, borderRadius: 4, overflow: 'hidden' }}>
                      <View style={{ width: `${(r.v / max) * 100}%`, height: '100%', backgroundColor: r.c, borderRadius: 4 }} />
                    </View>
                    <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text1, width: 46, textAlign: 'right' }}>{r.v}%</Text>
                  </View>
                ))}
              </View>
            );
          })}
          <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginTop: 10 }}>{pop16.disclaimer}</Text>
          </Expandable>
          </>}
        />
        </FadeInUp>
      )}
      </LayerGrid>
      </>)}

      {showLayer(3) && (<>
      <LayerHeader first={layerMode} step={LAYERS[3].step} title={LAYERS[3].title} sub="①~③에서 나온 것을 행동과 다음 검진 목표로 옮깁니다." />

      {/* ④-0 흩어진 행동을 한 줄로. 맞춤 권장사항보다 «앞»에 둔다 —
          「무엇부터」를 읽고 나서 「그래서 각각 어떻게」를 읽는 순서다. */}
      <LayerGrid on={layerMode}>
      <ActionRoundup
        ranks={actionRanks}
        ctx={actionCtx}
        combos={comboGroups?.matched ?? []}
        ascvd={ascvd}
        calcs={calcItems}
      />

      {/* ④ 개인화 권장사항 — 백엔드가 그 해 분석 결과를 바탕으로 실제로 생성해 보내준 문구만 그대로 보여준다.
          ⚠️ axes=[] — 이 묶음 전체가 «뭘 하면 되는지»라서 ⑤ 자리다. 예전에는 이것들이
          ③「나의 위치」 아래에 통째로 들어 있었다. 한 칸이 다른 칸의 내용을 삼킨 상태였고,
          그래서 「나의 위치」라는 제목 밑에서 복약 안내·고령 안내를 읽게 됐다. */}
      {recommendations && (recommendations.priority_messages?.length || recommendations.recommendations) && (
        <FadeInUp delay={220}>
        {/* ②·④ 칸을 두지 않는다. ②「내 검진 결과를 바탕으로 만든 안내예요」는 제목이 곧
            같은 말이고, ④「일반 수칙이 아니라 내 수치에 맞춘 것」은 바로 아래
            「목표까지 얼마나 남았나」가 수치로 이미 보여준다 — 말로 다시 할 필요가 없다. */}
        <SummaryCard
          title="맞춤 권장사항"
          summary={priorityHead(recommendations.priority_messages) ?? '내 검진 결과 기반 생활습관·검진 참고 안내예요.'}
          axes={[]}
          tipsExtra={<>
          {/* ⚠️ 여기 있던 "내 검진 결과를 바탕으로 분석 시스템이 안내하는 참고 정보예요."는 지웠다.
              ③에서 ⑤로 옮기고 나서야 ②「이 지표는요」가 이미 같은 말을 하고 있는 게 드러났다
              (에뮬레이터로 눈으로 보고 잡았다 — 코드만 봐서는 두 칸이 떨어져 있어 안 보였다). */}

          {!!recommendations.priority_messages?.length && (
            <View style={{ gap: 6, marginBottom: 10 }}>
              {recommendations.priority_messages!.map((msg, i) => (
                <Text key={i} style={{ fontSize: T.fs.caption, color: T.text1, fontWeight: '700', lineHeight: 20 }}>{msg}</Text>
              ))}
            </View>
          )}

          {/* ── 2뎁스 = «목표까지 얼마나 남았나» ─────────────────────────────
              예전에는 이 칸이 통짜 글이었다. 「권장사항 전체 보기」를 열면 공통 5묶음 +
              항목별 조언이 12pt 불릿으로 30줄 가까이 쏟아졌고, 정작 **내 값과 목표의 거리**는
              그 사이에 묻혀 있었다. 「글밖에 없어 보기 힘들다」는 지적이 정확했다.

              가르는 기준은 §2-1 그대로다 — 2뎁스는 «나는 어떤데»(수치와 거리), 2.5뎁스는
              «원문»(생활습관 조언 문장 전부). 거리는 읽으면 바로 행동을 정할 수 있고,
              조언 문장은 그 뒤에 읽어도 된다. */}
          {(() => {
            const r = recommendations.recommendations;
            const gaps = [
              ...(r?.metabolic_factors ?? []).map((f) => ({ title: f.title, target: f.target, gap: f.gap_note, by_med: f.by_medication, reason: f.reason })),
              ...(r?.group_specific ?? []).map((g) => ({ title: g.title, target: undefined, gap: g.gap_note, by_med: false, reason: undefined })),
            ].filter((x) => x.gap);
            if (!gaps.length) return null;
            return (
              <View style={{ marginTop: 4 }}>
                <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text2, marginBottom: 4 }}>목표까지 얼마나 남았나 {gaps.length}가지</Text>
                {gaps.map((x, i) => (
                  <View key={i} style={[{ paddingVertical: 9 }, i > 0 && { borderTopWidth: 1, borderTopColor: T.divider }]}>
                    {/* ⚠️ 목표를 제목과 «같은 줄»에 두었더니 「HDL 콜레스테롤 관 / 리」로
                        제목이 잘렸다(목표 문구가 「남 ≥40mg/dL, 여 ≥50mg/dL (이상적: ≥60)」로 길다).
                        제목이 먼저 온전히 읽혀야 하므로 목표는 아래 줄로 내린다. */}
                    <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text1 }}>{x.title}</Text>
                    {!!x.target && <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginTop: 1 }}>목표 {x.target}</Text>}
                    {/* 거리는 굵기를 낮춘다 — 제목보다 세게 읽히면 위계가 뒤집힌다. */}
                    <Text style={{ fontSize: T.fs.caption, color: T.text2, lineHeight: 20, marginTop: 4 }}>{x.gap}</Text>
                    {x.by_med && !!x.reason && (
                      <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginTop: 3 }}>※ {x.reason}</Text>
                    )}
                  </View>
                ))}
              </View>
            );
          })()}

          {/* ── 2.5뎁스 = 원문(조언 문장 전부) ───────────────────────────────
              접기 전에 «무엇이 얼마나 들어 있는지» 한 줄로 알린다. 개수는 목록에서 센다. */}
          <Expandable label={(() => {
            const r = recommendations.recommendations;
            const n = (r?.common ?? []).reduce((s, c) => s + c.items.length, 0)
              + (r?.metabolic_factors ?? []).reduce((s, f) => s + f.details.length, 0)
              + (r?.group_specific ?? []).reduce((s, g) => s + g.details.length, 0);
            return n ? `무엇을 하면 되는지 ${n}가지` : '권장사항 전체 보기';
          })()}>
          {recommendations.recommendations?.common?.map((c, i) => (
            <View key={`common-${i}`} style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text1, marginBottom: 4 }}>{c.category}</Text>
              {c.items.map((item, j) => (
                <Text key={j} style={{ fontSize: T.fs.caption, color: T.text2, lineHeight: 20 }}>· {item}</Text>
              ))}
            </View>
          ))}

          {recommendations.recommendations?.metabolic_factors?.map((f, i) => (
            <View key={`mf-${i}`} style={{ marginBottom: 12, borderTopWidth: 1, borderTopColor: T.divider, paddingTop: 12 }}>
              <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text1, marginBottom: 4 }}>{f.title}</Text>
              {f.details.map((d, j) => (
                <Text key={j} style={{ fontSize: T.fs.caption, color: T.text2, lineHeight: 20 }}>· {d}</Text>
              ))}
            </View>
          ))}

          {recommendations.recommendations?.group_specific?.map((g, i) => (
            <View key={`gs-${i}`} style={{ marginBottom: 12, borderTopWidth: 1, borderTopColor: T.divider, paddingTop: 12 }}>
              <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text1, marginBottom: 4 }}>{g.title}</Text>
              {g.details.map((d, j) => (
                <Text key={j} style={{ fontSize: T.fs.caption, color: T.text2, lineHeight: 20 }}>· {d}</Text>
              ))}
            </View>
          ))}

          {!!recommendations.recommendations?.medication_notes?.length && (
            <View style={{ marginBottom: 12, borderTopWidth: 1, borderTopColor: T.divider, paddingTop: 12 }}>
              <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text1, marginBottom: 4 }}>복용 약 관련 안내</Text>
              {recommendations.recommendations!.medication_notes!.map((m, i) => (
                <Text key={i} style={{ fontSize: T.fs.caption, color: T.text2, lineHeight: 20 }}>· [{m.medication}] {m.note}</Text>
              ))}
            </View>
          )}

          {!!recommendations.recommendations?.elderly_notes?.length && (
            <View style={{ borderTopWidth: 1, borderTopColor: T.divider, paddingTop: 12 }}>
              <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text1, marginBottom: 4 }}>고령 기준 추가 안내</Text>
              {recommendations.recommendations!.elderly_notes!.map((n, i) => (
                <Text key={i} style={{ fontSize: T.fs.caption, color: T.text2, lineHeight: 20 }}>· {n}</Text>
              ))}
            </View>
          )}

          {/* 조건에 안 맞아 뺀 권장 — 조용히 빼면 "나한테는 해당 없음"으로 읽히는데, 실제로는
              "문진을 안 해서 못 붙임"인 경우가 섞인다. ④층 「다음 검진 목표」가 목록에서 뺀
              행동의 이유를 밝히는 것과 같은 규칙이다. */}
          {!!recommendations.recommendations?.omitted?.length && (
            <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.divider }}>
              <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text2, marginBottom: 4 }}>넣지 않은 항목</Text>
              {recommendations.recommendations!.omitted!.map((o, i) => (
                <Text key={i} style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginBottom: 3 }}>· [{o.category}] {o.reason}</Text>
              ))}
            </View>
          )}

          {recommendations._meta?.disclaimer && (
            <Text style={{ fontSize: T.fs.caption, color: T.text3, marginTop: 14, lineHeight: 20 }}>{recommendations._meta.disclaimer}</Text>
          )}
          </Expandable>
          </>}
        />
        </FadeInUp>
      )}

      </LayerGrid>
      {layerMode && <View style={{ height: 12 }} />}

      {/* 다음 검진 목표 세우기 — 문제 → 행동 → 결과. 권장사항 바로 뒤에 둔다(같은 ④층).
          ⚠️ 서버는 '가장 최근' 저장 검진값을 기준선으로 쓴다. 그래서 위 연도 선택과
          무관하게 최신 회차를 넘겨야 화면에 보이는 값과 계산 기준이 어긋나지 않는다. */}
      {reports.length > 0 && (
        <FadeInUp delay={222}>
          <NextCheckupGoal
            latest={reports[reports.length - 1]}
            gender={gender}
            smoking={smoking}
            alcoholWeeklyG={alcoholWeeklyG}
            demoMode={!usingRealData}
            demoNote="데모 계정은 앱 안에서 대사증후군 기준·LDL 목표만 다시 셉니다. 실제 결과지를 올리면 나머지 계산기까지 함께 갱신돼요."
          />
        </FadeInUp>
      )}
      </>)}

      {/* 면책 — 히스토리 탭과 같이 맨 아래 회색 한 줄로 둔다.
          예전에는 헤더 바로 아래에 경고 기호 + 두 줄이라, 첫 화면에서 내 수치보다 먼저 읽혔다.
          내용은 그대로다 — 위치만 옮긴다(스펙 §7 "첫 화면을 텍스트로 막지 않는다"). */}
      <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, paddingHorizontal: 20, paddingTop: 20 }}>
        이 화면은 건강검진 수치를 이해하기 위한 참고 정보입니다. 질병 진단이나 치료 판단을 대체하지 않습니다.
      </Text>

    </ScrollView>
  );
}


// CompareRow(항목별 비교 행)는 관리 참고군 카드에서만 쓰여 A3와 함께 제거됐다.
// 안에 있던 약·고령 배지(onMedication·isElderlyWarning)도 같이 내려갔다 — 손실 감수 결정(2026-07-31).
