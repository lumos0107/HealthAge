// 디자인 시스템 v2에서 새로 도입한 컴포넌트 모음.
// 상태색(그린/앰버/레드)과 절대 겹치지 않는 카테고리 색을 쓴다 — 상태로 오인 방지.
import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { SCORE_PENALTY } from '../data';
import type { MetricDefinition, Report } from '../data';
import { formatMetricValue, normalBounds, positionTitle, scoreGrade } from '../interpret';
import type { PositionAxis } from '../interpret';
import { T, W } from './UI';

export const CATEGORY_VISUAL: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  '혈압': { icon: 'heart-outline', color: '#1E88E5', bg: '#E8F2FD' },
  '혈당': { icon: 'water-outline', color: '#8E24AA', bg: '#F6EBFA' },
  '체중·복부': { icon: 'body-outline', color: '#3949AB', bg: '#EDEFF9' },
  '지질': { icon: 'analytics-outline', color: '#00897B', bg: '#E6F4F2' },
  '간 기능': { icon: 'shield-checkmark-outline', color: '#6D4C41', bg: '#F1EBE9' },
  '혈액': { icon: 'pulse-outline', color: '#5E35B1', bg: '#EFEAF8' },
  '신장 기능': { icon: 'filter-outline', color: '#00ACC1', bg: '#E6F7FA' },
};

export function categoryVisual(category: string) {
  return CATEGORY_VISUAL[category] ?? { icon: 'ellipse-outline' as const, color: T.text2, bg: T.cardAlt };
}

/** 틴트 배경 스쿼클 + 아이콘 — L1 리스트 행, 홈 TOP3 카드 공용 */
export function SquircleIcon({ icon, color, bg, size = 42 }: {
  icon: keyof typeof Ionicons.glyphMap; color: string; bg: string; size?: number;
}) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 3, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={size * 0.5} color={color} />
    </View>
  );
}

/** "같은 나이대 100명이라면 그중 N등" 슬라이더 — 1등~100등 트랙 위 '나' 마커 */
export function PeerRankSlider({ rank, color }: { rank: number; color: string }) {
  const pct = ((rank - 1) / 99) * 100;
  // 10칸(10명 단위)으로 나눠 내가 몇 번째 구간인지 한눈에 보이게 한다 — 점 하나만 있으면
  // "어디쯤"이 눈대중이 되므로, 내가 속한 칸만 색으로 채워 위치를 셀 수 있게 만든다.
  const myBin = Math.min(9, Math.floor((rank - 1) / 10));
  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ height: 26 }}>
        <View style={{ position: 'absolute', left: `${pct}%`, transform: [{ translateX: -16 }], alignItems: 'center' }}>
          <View style={{ backgroundColor: color, paddingHorizontal: 9, paddingVertical: 3, borderRadius: T.radiusPill }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>나</Text>
          </View>
          <View style={{ width: 2, height: 5, backgroundColor: color }} />
        </View>
      </View>
      {/* 10칸 — 내가 속한 칸만 상태색, 나머지는 회색 */}
      <View style={{ flexDirection: 'row', gap: 3 }}>
        {Array.from({ length: 10 }, (_, i) => (
          <View
            key={i}
            style={{ flex: 1, height: 14, borderRadius: 3, backgroundColor: i === myBin ? color : T.cardAlt }}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
        <Text style={{ fontSize: 12, color: T.text3 }}>1등</Text>
        <Text style={{ fontSize: 12, fontWeight: '600', color: T.text2 }}>
          {myBin * 10 + 1}~{myBin * 10 + 10}등 구간
        </Text>
        <Text style={{ fontSize: 12, color: T.text3 }}>100등</Text>
      </View>
    </View>
  );
}

/**
 * "같은 나이대 100명 중 N등" 한 덩어리 — 앱에서 등수를 말하는 곳은 전부 이걸 쓴다.
 * (분석 계산기 · 분석 관리참고군 · 히스토리 · 검사항목 상세 — 네 군데)
 *
 * ⚠️ 등수의 출처가 세 가지인데 문장도 근거 표기도 화면마다 달랐다:
 *   ① 계산기 백분위 — calculator_percentiles_2017.parquet. 표본 수·연도까지 밝히고 있었다.
 *   ② 검사항목 백분위 — peer_stats.parquet(성별·5세 연령대별 분포 선형보간). 근거를 안 밝혔다.
 *   ③ 추정 등수 — 또래 평균 ± 정상범위 폭으로 정규분포를 가정한 계산(estimateRank).
 *      실제 분포 데이터가 아니다.
 * 셋 다 "100명 중 N등"이라는 같은 문장으로 나왔고, 실측인지 추정인지는 '이에요/쯤이에요'
 * 한 글자 차이에만 실려 있었다. 여기서 문장 모양과 근거 배지를 한곳에 고정한다.
 */
export function PeerRankBlock({ subject, rank, color, measured, basis }: {
  /** "{subject} 기준, …" — 어느 항목의 등수인지. */
  subject: string;
  rank: number;
  color: string;
  /** 모집단 분포에서 나온 값이면 true, 정규분포 가정으로 어림한 값이면 false. */
  measured: boolean;
  /** 근거 한 줄 — 어느 표본인지 / 무엇으로 어림했는지. */
  basis?: string;
}) {
  return (
    <>
      <Text style={{ fontSize: 15, fontWeight: '700', color: T.text1, lineHeight: 23 }}>
        {subject} 기준, 같은 나이대 100명 중 <Text style={{ color }}>{rank}등</Text>{measured ? '이에요' : '쯤이에요'}
      </Text>
      <PeerRankSlider rank={rank} color={color} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8 }}>
        <View style={{ backgroundColor: measured ? T.cardAlt : T.warnBg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: T.radiusPill }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: measured ? T.text2 : T.warn }}>
            {measured ? '모집단 분포' : '추정'}
          </Text>
        </View>
        {!!basis && <Text style={{ fontSize: 12, color: T.text3, lineHeight: 17, flex: 1 }}>{basis}</Text>}
      </View>
    </>
  );
}

/** 2뎁스 각 칸의 «원문»을 접는다 — **접힌 것이 곧 2.5뎁스다**(§2-1).
 *
 *  ⚠️ 2뎁스는 요약이어야 한다. 예전에는 권장사항 전체·집단군 13개·묶음별 분포가 전부
 *  펼쳐진 채로 있어서, 카드 하나를 열면 스크롤이 세 화면을 넘었다. 「1뎁스는 결론,
 *  2뎁스는 전부, 2.5뎁스는 정의 심화」가 되어 층이 둘밖에 없는 것과 같았다.
 *
 *  ②의 「자세히 알아보기」와 같은 모양을 쓴다 — 한 화면 안에서 접는 방법이 두 가지면
 *  사용자가 둘을 다른 기능으로 읽는다. label만 칸에 맞게 바꾼다. */
export function Expandable({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && <View>{children}</View>}
      <Pressable
        onPress={() => setOpen((v) => !v)}
        hitSlop={8}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.divider }}
      >
        <Text style={{ fontSize: 13, fontWeight: '600', color: T.text3 }}>{open ? '접기' : label}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={15} color={T.text3} />
      </Pressable>
    </>
  );
}

/** 1뎁스 요약 카드 + 2뎁스 상세 오버레이 — 탭에는 제목·결론 한 줄만 두고,
 *  누르면 검사항목 상세(MetricDetailScreen)와 같은 전체 화면 오버레이가 열린다.
 *  오버레이 안은 항상 같은 순서로 읽힌다:
 *    ① 결론  ② 이 지표는요(정의 + 2.5뎁스 '자세히 알아보기')  ③ 나의 위치(근거·차트)
 *    ④ 그래서 이게 의미하는 건  ⑤ 그럼 뭘 하면 좋을까
 *  definition/meaning/tips가 없으면 그 칸은 그리지 않는다(있는 정보만 보여준다).
 *  ③만은 «없음»을 문자열이 아니라 axes=[]로 선언한다 — 아래 axes 주석 참조. */
export function SummaryCard({ title, term, summary, detailSummary, badge, preview, definition, detail, meaning, meaningExtra, tips, tipsExtra, axes, positionExtra, children, footer }: {
  title: string;
  /** 제목 옆의 작은 회색 용어(eGFR·FLI·HSI 등). 제목은 쉬운 질문이라 «어떤 검사인지»가
   *  드러나지 않는다 — 결과지나 진료에서 들은 이름과 맞춰 보려면 이름표가 필요하다.
   *  검사항목 탭의 «항목명 + 작은 뜻풀이»와 같은 모양이고 방향만 반대다(쉬운 이름 + 용어).
   *  ⚠️ 여기 말고 제목에 용어를 넣으면 1뎁스 전문용어 금지(§2-1 축 2)에 걸린다. */
  term?: string;
  summary?: string | null;
  /** 2뎁스 ① 결론 자리에 쓸 문장. 없으면 summary를 그대로 쓴다.
   *  나누는 이유: 2뎁스에서 사용자가 보는 항목을 바꿀 수 있는 카드(히스토리)는 모달 안에서
   *  헤드라인이 따라가야 하는데, 그 문장을 1뎁스에도 쓰면 모달을 닫은 뒤 카드 문장이
   *  이유 없이 바뀌어 있게 된다. 1뎁스는 고정, 2뎁스는 따라가게 하려면 두 개가 필요하다. */
  detailSummary?: string | null;
  badge?: React.ReactNode;
  /** 1뎁스 요약 아래에 얹는 작은 그림 — 스파크라인 등. 열지 않고도 흐름이 보이게 하는 자리다.
   *  ⚠️ children은 2뎁스 모달로 들어가므로, 1뎁스에 그림을 두려면 반드시 이 prop을 써야 한다. */
  preview?: React.ReactNode;
  /** ② 이게 뭔지 한 문장 */
  definition?: string;
  /** ②의 2.5뎁스 — '자세히 알아보기'를 눌러야 보이는 심화 설명(용어 사용 가능) */
  detail?: string;
  /** ④ 그래서 이게 의미하는 것 */
  meaning?: string;
  /** ④에 덧붙이는 근거 — 설명만으로는 와닿지 않는 수치 비교 등 */
  meaningExtra?: React.ReactNode;
  /** ⑤ 그럼 뭘 하면 좋은지 */
  tips?: string[];
  /** ⑤에 덧붙이는 것 — 문장 목록으로 안 되는 행동 안내(권장사항 묶음 등) */
  tipsExtra?: React.ReactNode;
  /** ③「나의 위치」의 비교축. **선언이 필수다.**
   *  빈 배열이면 ③칸을 아예 그리지 않는다 — 비교 대상이 없는 것은 위치가 아니다.
   *  ⚠️ 예전에는 positionTitle에 아무 문자열이나 넣을 수 있었다. 그래서 「이렇게 판정했어요」
   *  (판정 근거=2.5뎁스)·「짚어낸 변화」·「남성 50대 · 2009 vs 2024」(집단 이야기라 «나»가 없다)가
   *  전부 같은 칸에 들어왔고, 「맞춤 권장사항」은 이 칸에 ⑤의 내용을 통째로 담고 있었다. */
  axes: PositionAxis[];
  /** ③ 근거 카드 맨 위에 얹는 요소 — 등수 슬라이더 등 */
  positionExtra?: React.ReactNode;
  /** ③ 본문. axes가 비면 넘기지 않는다. */
  children?: React.ReactNode;
  /** ⑤ 다음, 고지문 바로 위. **어느 칸에도 속하지 않는 «이 카드 전체의 한계»** 자리다.
   *  ③ 안에 두면 그 한계가 «내 위치»에 대한 것으로 읽히는데, 실제로는 카드가 내놓은
   *  모든 숫자에 걸린다(ASCVD의 «미국 코호트라 한국인에게 과대추정» 같은 것).
   *  ⚠️ 오해 차단은 ④가 맡는다. 여기는 ④가 말한 뒤에도 남는 «출처와 적용 한계»만 온다. */
  footer?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingVertical: 18, marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          {/* 용어는 제목과 «같은 줄, 다음 자리»에 둔다. 아래 줄로 내리면 결론과 헷갈리고,
              괄호로 제목에 넣으면 제목이 길어져 배지를 밀어낸다. baseline을 맞춰
              두 글자가 한 줄로 읽히게 한다. */}
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: T.text1, flexShrink: 1 }}>{title}</Text>
            {!!term && <Text style={{ fontSize: 12, fontWeight: '600', color: T.text3 }}>{term}</Text>}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {badge}
            <Ionicons name="chevron-forward" size={16} color={T.text3} />
          </View>
        </View>
        {!!summary && <Text style={{ fontSize: 13, color: T.text2, marginTop: 4, lineHeight: 19 }}>{summary}</Text>}
        {preview}
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: T.bg }}>
          {/* 헤더 — 검사항목 상세와 같은 규격(뒤로가기 + 제목) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 54, paddingBottom: 10, backgroundColor: T.white }}>
            <Pressable onPress={() => setOpen(false)} hitSlop={10} style={{ padding: 8 }}>
              <Ionicons name="chevron-back" size={24} color={T.text1} />
            </Pressable>
            <Text style={{ fontSize: 17, fontWeight: '700', color: T.text1, flex: 1 }} numberOfLines={1}>{title}</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
            {/* ① 결론 — 1뎁스에서 본 요약을 헤드라인으로(모달 안에서 항목을 바꾸는 카드는 detailSummary로 갈아끼운다) */}
            {!!(detailSummary ?? summary) && (
              <View style={{ backgroundColor: T.white, borderRadius: T.radius, padding: 20, marginBottom: 12 }}>
                <Text style={{ fontSize: 19, fontWeight: '800', color: T.text1, lineHeight: 28 }}>{detailSummary ?? summary}</Text>
              </View>
            )}
            {/* ② 이 지표는요 — 정의 한 문장, 심화는 2.5뎁스로 접어둔다 */}
            {!!definition && (
              <View style={{ backgroundColor: T.white, borderRadius: T.radius, padding: 20, marginBottom: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: T.text1, marginBottom: 4 }}>이 지표는요</Text>
                <Text style={{ fontSize: 15, color: T.text2, lineHeight: 22 }}>{definition}</Text>
                {showDetail && !!detail && (
                  <Text style={{ fontSize: 14, color: T.text2, lineHeight: 21, marginTop: 10 }}>{detail}</Text>
                )}
                {!!detail && (
                  <Pressable
                    onPress={() => setShowDetail((v) => !v)}
                    hitSlop={8}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.divider }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: T.text3 }}>{showDetail ? '접기' : '자세히 알아보기'}</Text>
                    <Ionicons name={showDetail ? 'chevron-up' : 'chevron-down'} size={15} color={T.text3} />
                  </Pressable>
                )}
              </View>
            )}
            {/* ③ 나의 위치 — 근거(차트·지표 행). 비교축이 없으면 칸 자체가 없다. */}
            {axes.length > 0 && (
              <View style={{ backgroundColor: T.white, borderRadius: T.radius, padding: 20, marginBottom: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: T.text1, marginBottom: 12 }}>{positionTitle(axes)}</Text>
                {positionExtra}
                {children}
              </View>
            )}
            {/* ④ 그래서 이게 의미하는 건 */}
            {(!!meaning || !!meaningExtra) && (
              <View style={{ backgroundColor: T.white, borderRadius: T.radius, padding: 20, marginBottom: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: T.text1, marginBottom: 4 }}>그래서 이게 의미하는 건</Text>
                {!!meaning && <Text style={{ fontSize: 15, color: T.text2, lineHeight: 22 }}>{meaning}</Text>}
                {meaningExtra}
              </View>
            )}
            {/* ⑤ 그럼 뭘 하면 좋을까 */}
            {(!!tips?.length || !!tipsExtra) && (
              <View style={{ backgroundColor: T.white, borderRadius: T.radius, padding: 20, marginBottom: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: T.text1, marginBottom: 10 }}>그럼 뭘 하면 좋을까요</Text>
                {tips?.map((tip, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 8, marginTop: i === 0 ? 0 : 8 }}>
                    <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: T.text3, marginTop: 8 }} />
                    <Text style={{ flex: 1, fontSize: 14, color: T.text2, lineHeight: 21 }}>{tip}</Text>
                  </View>
                ))}
                {tipsExtra}
              </View>
            )}
            {/* 카드 전체에 걸리는 한계 — 고지문과 «같은 층위»다.
                흰 카드로 감싸면 ①~⑤와 같은 무게로 읽혀 내용 칸처럼 보이는데, 이건 읽고
                행동할 것이 아니라 «이 숫자를 어디까지 믿을지»를 밝히는 회피 문구다.
                카드를 벗기고 고지문 바로 위에 회색으로 둔다. */}
            {!!footer && <View style={{ marginBottom: 10 }}>{footer}</View>}
            <Text style={{ fontSize: 12, color: T.text3, textAlign: 'center' }}>참고용이며 진단이 아닙니다</Text>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

/** 1뎁스 미리보기용 스파크라인 — 축·격자·범례·라벨 없이 선 하나와 마지막 점만.
 *
 * ⚠️ 반드시 단일 시리즈로 쓴다. 축을 공유한 다중 시리즈는 단위가 다른 항목을
 *    같은 높이로 보이게 해 오독을 만든다(LDL 밴드가 HDL을 정상처럼 덮은 건과 같은 구조).
 *    큰 차트에서는 focus·dimming으로 막지만 40px에는 그 장치를 둘 자리가 없다.
 * 선 색은 그 항목의 상태색을 쓴다 — 시리즈가 하나뿐이고 카드 배지와 같은 색이라
 * 색이 판정으로 읽혀도 어긋나지 않는다(큰 차트는 반대로 상태색을 피한다).
 */
export function Sparkline({ values, color, height = 40 }: {
  /** 연도순 값. 측정 안 된 해는 null로 두면 그 구간을 잇지 않고 끊는다. */
  values: (number | null)[];
  color: string;
  height?: number;
}) {
  const w = W - 32 - 40;  // 카드 폭 - 좌우 패딩
  const pad = 5;          // 점 반지름 + 선 굵기가 잘리지 않을 만큼만
  const pts = values.map((v, i) => ({ i, v }));
  const nums = pts.filter((p): p is { i: number; v: number } => p.v != null);
  if (nums.length < 2) return null;   // 점 하나로는 흐름이 아니다 — 아무것도 그리지 않는다

  const lo = Math.min(...nums.map((p) => p.v));
  const hi = Math.max(...nums.map((p) => p.v));
  // 자기 데이터 min~max에 딱 맞춰 늘리면 2% 변화도 화면 높이를 다 써서 급변처럼 보인다.
  // (혈색소 15.0→15.3이 요약문 "큰 변화 없음"과 정반대로 그려졌다.)
  // 그래서 값 크기의 12%를 최소 폭으로 두고, 그 안의 변화는 완만하게 눕힌다.
  const mid = (hi + lo) / 2;
  const span = Math.max(hi - lo, Math.abs(mid) * 0.12) || 1;
  const base = mid - span / 2;   // 선을 세로 가운데에 둔다
  const x = (i: number) => pad + (values.length === 1 ? 0 : (i / (values.length - 1)) * (w - pad * 2));
  const y = (v: number) => pad + (1 - (v - base) / span) * (height - pad * 2);

  // 결측으로 끊긴 구간마다 별도 path — 없는 값을 직선으로 이어 붙이지 않는다.
  const segs: string[] = [];
  let cur: string[] = [];
  for (const p of pts) {
    if (p.v == null) { if (cur.length > 1) segs.push(cur.join(' ')); cur = []; continue; }
    cur.push(`${cur.length ? 'L' : 'M'}${x(p.i)},${y(p.v)}`);
  }
  if (cur.length > 1) segs.push(cur.join(' '));

  const last = nums[nums.length - 1];
  return (
    <View style={{ marginTop: 10 }}>
      <Svg width={w} height={height}>
        {segs.map((d, i) => (
          <Path key={i} d={d} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {/* 회차 점 — 선만 있으면 몇 번 검진한 흐름인지 알 수 없다(6회차인지 2회차인지 구분 안 됨).
            측정된 해에만 찍으므로 끊긴 구간이 어디였는지도 점 간격으로 드러난다.
            마지막 회차는 아래에서 더 크게 다시 그리므로 여기서는 뺀다. */}
        {nums.slice(0, -1).map((p) => (
          <Circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={2} fill={color} />
        ))}
        <Circle cx={x(last.i)} cy={y(last.v)} r={3.5} fill={color} stroke="#fff" strokeWidth={1.5} />
      </Svg>
    </View>
  );
}

// 정상범위 밴드 전용 색 — T.successBg(#EAF7F1)는 흰 카드 위에서 너무 연해 구분이 안 돼 한 단계 진하게 쓴다.
// (배지·칩 배경은 기존 T.successBg 유지 — 글자가 올라가는 배경이라 연해야 한다.)
export const NORMAL_BAND = '#C9EDDC';

/** percentile이 없는 항목용 — 정상범위 밴드 위에 내 수치 위치만 보여준다(추정 등수를 지어내지 않는다). */
export function RangeBar({ metric, value }: { metric: MetricDefinition; value: number }) {
  const { low, high } = normalBounds(metric);
  // 축의 기준 폭은 값↔경계 거리가 아니라 정상범위 폭에 비례시킨다 — 살짝 벗어난 값이
  // 축 줌인 때문에 밴드에서 멀리 떨어져 보이는 왜곡을 막는다. 한쪽 경계만 있으면 경계값의 25%를 폭으로 삼는다.
  const bandSpan = (low != null && high != null ? high - low : Math.abs(low ?? high ?? 0) * 0.25) || 1;
  const bandLo = low ?? high! - bandSpan;
  const bandHi = high ?? low! + bandSpan;
  const pad = bandSpan * 0.15;
  const min = Math.min(value, bandLo) - pad;
  const max = Math.max(value, bandHi) + pad;
  const pct = (v: number) => Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100));
  const bandL = pct(low ?? min);
  const bandR = pct(high ?? max);
  const { color } = statusTone(metric);
  // 라벨을 바 전체가 아니라 밴드 위치에 붙인다 — 밴드가 한쪽으로 쏠려도 글자가 초록 영역을 정확히 가리키게.
  // width:0 컨테이너 + alignItems:center = 해당 % 지점을 중심으로 글자를 앉히는 RN 트릭.
  const anchor = (leftPct: number, children: React.ReactNode) => (
    <View style={{ position: 'absolute', left: `${leftPct}%`, width: 0, alignItems: 'center' }}>{children}</View>
  );
  return (
    <View style={{ marginTop: 6 }}>
      <View style={{ height: 20 }}>
        {anchor((bandL + bandR) / 2, <Text style={{ fontSize: 12, color: T.success, fontWeight: '600', width: 80, textAlign: 'center' }}>정상 범위</Text>)}
      </View>
      <View style={{ height: 10, borderRadius: 5, backgroundColor: T.cardAlt, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', left: `${bandL}%`, width: `${Math.max(2, bandR - bandL)}%`, top: 0, bottom: 0, backgroundColor: NORMAL_BAND }} />
        <View style={{ position: 'absolute', left: `${pct(value)}%`, transform: [{ translateX: -6 }], top: -1, width: 12, height: 12, borderRadius: 6, backgroundColor: color, borderWidth: 2, borderColor: '#fff' }} />
      </View>
      <View style={{ height: 20, marginTop: 4 }}>
        {low != null && anchor(bandL, <Text style={{ fontSize: 12, color: T.text3, width: 60, textAlign: 'center' }}>{low}</Text>)}
        {high != null && anchor(bandR, <Text style={{ fontSize: 12, color: T.text3, width: 60, textAlign: 'center' }}>{high}</Text>)}
      </View>
      {/* 내 수치 — 점만 있고 숫자가 없어서 위치를 읽을 수 없었다.
          점 위('정상 범위' 라벨 자리)에 두면 값이 밴드 안에 있을 때 글자가 겹친다(AST 34처럼).
          경계 라벨과 같은 줄에 두면 값이 경계 근처일 때 겹친다. 그래서 한 줄 더 내려
          점과 x를 맞추고, 색은 점과 같은 상태색으로 묶는다. */}
      <View style={{ height: 18 }}>
        {anchor(pct(value), (
          <Text style={{ fontSize: 12, fontWeight: '700', color, width: 76, textAlign: 'center' }}>
            {formatMetricValue(metric, value)}
          </Text>
        ))}
      </View>
    </View>
  );
}


function statusTone(metric: MetricDefinition) {
  if (metric.status === '정상') return { color: T.success, bg: T.successBg };
  if (metric.status === '주의') return { color: T.warn, bg: T.warnBg };
  return { color: T.danger, bg: T.dangerBg };
}

/** 참고 점수의 색·배경·라벨 — 홈·분석·히스토리가 같은 값을 쓰게 한 곳에 모았다.
 *  (70/40 경계 자체는 interpret.scoreGrade가 갖는다.) */
export function scoreTone(score: number) {
  const grade = scoreGrade(score);
  if (grade === '정상') return { color: T.success, bg: T.successBg, label: '양호해요' };
  if (grade === '주의') return { color: T.warn, bg: T.warnBg, label: '주의가 필요해요' };
  return { color: T.danger, bg: T.dangerBg, label: '관리가 필요해요' };
}

/** "어떻게 계산했나요?" 접이식 설명 — 점수를 보여주는 화면은 모두 이걸 단다.
 *  분석 탭에만 있어서, 점수를 처음 만나는 홈에는 정작 무슨 점수인지 설명이 없었다. */
export function ScoreCalcNote({ score, manageCount, trackCount, bare }: {
  score: number; manageCount: number; trackCount: number;
  /** 이미 다른 펼침 «안»에 놓일 때 true — 자기 토글을 그리지 않고 본문만 편다.
   *  분석 탭은 이 노트가 「신호 N가지 보기」 안에 들어가 있어, 토글을 그대로 두면
   *  「접기」 버튼이 두 줄 연달아 선다. 홈에서는 단독이라 토글이 필요하다. */
  bare?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {(open || bare) && (
        <>
          <Text style={{ fontSize: 13, color: T.text2, lineHeight: 20, marginBottom: 16 }}>
            100점에서 시작해 주의 항목은 {SCORE_PENALTY.manage}점, 위험 항목은 {SCORE_PENALTY.track}점씩 빼서 계산해요.{'\n'}
            100 − ({SCORE_PENALTY.manage}×주의 {manageCount}개) − ({SCORE_PENALTY.track}×위험 {trackCount}개) = {score}점
          </Text>
          {/* 점수의 범위를 여기서 못 박는다 — 이 점수는 '검사 항목 판정 개수'일 뿐인데,
              심혈관 위험·대사증후군·지방간처럼 여러 수치를 조합한 판정은 하나도 들어가지 않는다.
              그 사실을 밝히지 않으면 점수가 종합 건강 점수로 읽힌다. */}
          <Text style={{ fontSize: 12, color: T.text3, lineHeight: 18, marginBottom: 16 }}>
            검사 항목 하나하나의 판정만 셉니다. 여러 수치를 조합해 따로 판정하는 심혈관 10년 위험·대사증후군·지방간 지표는 이 점수에 들어가지 않아요 — 분석 탭에서 따로 확인하세요.
          </Text>
          {/* 감점 기준 — 옅은 색칠 박스 없이, 색은 글자에만 사용해 구분선으로 나열 */}
          <View style={{ flexDirection: 'row' }}>
            {[
              { label: '정상', note: '감점 없음', color: T.success },
              { label: '주의', note: `-${SCORE_PENALTY.manage}점`, color: T.warn },
              { label: '위험', note: `-${SCORE_PENALTY.track}점`, color: T.danger },
            ].map((item, i) => (
              <View key={item.label} style={[{ flex: 1, alignItems: 'center', paddingVertical: 10 }, i > 0 && { borderLeftWidth: 1, borderLeftColor: T.divider }]}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: item.color, textAlign: 'center', marginBottom: 4 }}>{item.label}</Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: T.text1 }}>{item.note}</Text>
              </View>
            ))}
          </View>
        </>
      )}
      {!bare && (
        <Pressable
          onPress={() => setOpen((v) => !v)}
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.divider }}
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: T.text3 }}>{open ? '접기' : '어떻게 계산했나요?'}</Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={15} color={T.text3} />
        </Pressable>
      )}
    </>
  );
}

/** 하단 고정 CTA — 다음 행동 버튼을 항상 같은 위치에. 스크롤 콘텐츠에는 paddingBottom 100 이상을 줄 것. */
export function FixedCTA({ label, onPress, disabled, loading }: {
  label: string; onPress: () => void; disabled?: boolean; loading?: boolean;
}) {
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: T.white, paddingHorizontal: 20, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 28 : 16 }}>
      <Pressable hitSlop={8}
        onPress={onPress}
        disabled={disabled || loading}
        style={({ pressed }) => ({
          height: 52, borderRadius: T.radiusMd, alignItems: 'center', justifyContent: 'center',
          backgroundColor: disabled || loading ? T.text3 : pressed ? T.primaryPressed : T.primary,
        })}
      >
        {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>{label}</Text>}
      </Pressable>
    </View>
  );
}

// ── 단일 지표 추이 차트 (L3) — 정상범위는 연한 배경 밴드, 최신 값 강조 ──
const CHART_W = W - 32 - 40;
const CHART_H = 170;
const PAD = { top: 16, right: 16, bottom: 28, left: 44 };
const PLOT_W = CHART_W - PAD.left - PAD.right;
const PLOT_H = CHART_H - PAD.top - PAD.bottom;
const LINE = '#1E88E5'; // 상태색과 겹치지 않는 추이선 색

/** @param highlightYear 지금 화면이 말하고 있는 해. 이 점을 크게·채워서 그리고 값을 적는다.
 *  ⚠️ 예전에는 무조건 마지막 점을 강조했다. 2018년 상세를 열면 "내 수치 23.9" 바로 아래에서
 *  차트만 26.3(2024)을 강조해, 한 카드가 서로 다른 해를 말했다. 화면이 고른 해를 받아 쓴다.
 *  @param onSelectYear 있으면 그래프를 눌러 해를 바꿀 수 있다. 없으면 읽기 전용.
 */
// 차트를 눌러 연도를 고르는 곳(MetricTrendChart·히스토리 차트)이 공통으로 쓰는 좌표 계산.
// evt.nativeEvent.locationX는 네이티브에만 있는 필드라 웹에서는 undefined → NaN으로 번져
// "항상 첫 해로 튕기거나"(reduce가 NaN 비교로 첫 값에 멈춤) "배열 밖 인덱스로 크래시"가 났다.
// pageX(모든 플랫폼에 있음)에서 컨테이너의 절대 x 좌표(최초 레이아웃 시 측정)를 빼서 구한다.
function extractPageX(nativeEvent: any): number | undefined {
  if (typeof nativeEvent.pageX === 'number') return nativeEvent.pageX;
  const touch = nativeEvent.touches?.[0] ?? nativeEvent.changedTouches?.[0];
  return typeof touch?.pageX === 'number' ? touch.pageX : undefined;
}

export function useChartTouchX() {
  const ref = useRef<View>(null);
  const pageXRef = useRef(0);
  const onLayout = () => {
    // measure는 비동기라 레이아웃 시 한 번만 재고 캐시해 둔다 — 드래그 중(onTouchMove)마다
    // 다시 재면 네이티브 브리지를 계속 타 버벅인다.
    (ref.current as any)?.measure?.((_x: number, _y: number, _w: number, _h: number, pageX: number) => {
      pageXRef.current = pageX;
    });
  };
  const localX = (evt: any): number | undefined => {
    const pageX = extractPageX(evt.nativeEvent);
    return pageX == null ? undefined : pageX - pageXRef.current;
  };
  return { ref, onLayout, localX };
}

export function MetricTrendChart({ metric, reports, highlightYear, onSelectYear }: {
  metric: MetricDefinition;
  reports: Report[];
  highlightYear: number;
  onSelectYear?: (year: number) => void;
}) {
  const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const pts0 = reports
    .map((r, i) => ({ i, year: r.year, v: r.values[metric.key] }))
    .filter((p): p is { i: number; year: number; v: number } => isNum(p.v));
  if (pts0.length === 0) {
    return <Text style={{ fontSize: 13, color: T.text3, textAlign: 'center', paddingVertical: 24 }}>이 항목의 기록이 없어요.</Text>;
  }
  // infoOnly(키·체중)는 판정 대상이 아니라 정상범위 밴드가 없다 — 밴드 없이 값만 보여준다.
  const { low, high } = metric.infoOnly ? { low: undefined, high: undefined } : normalBounds(metric);
  // 하한 0(상한형의 표시용 바닥)은 축 계산에서 빼서 라인이 위쪽에 눌리지 않게 한다. 밴드는 클램프로 바닥까지 채운다.
  const vals = [...pts0.map((p) => p.v), ...(low != null && low > 0 ? [low] : []), ...(high != null ? [high] : [])];
  const rawMin = Math.min(...vals);
  const rawMax = Math.max(...vals);
  const margin = (rawMax - rawMin) * 0.25 || 5;
  const minVal = rawMin - margin;
  const maxVal = rawMax + margin;
  const range = maxVal - minVal || 1;
  const xPos = (i: number) => (reports.length === 1 ? PLOT_W / 2 : (i / (reports.length - 1)) * PLOT_W);
  const yPos = (v: number) => PLOT_H - ((v - minVal) / range) * PLOT_H;
  const bandTop = Math.max(0, yPos(high ?? maxVal));
  const bandBottom = Math.min(PLOT_H, yPos(low ?? minVal));
  const pts = pts0.map((p) => ({ ...p, x: xPos(p.i), y: yPos(p.v) }));
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  // 그 해에 이 항목을 안 쟀으면 강조할 점이 없다 — 마지막 점으로 돌아간다(그 상태로는 상세가 열리지 않지만,
  // 차트만 따로 쓰이는 경우에도 빈 화면이 되지 않게 둔다).
  const focus = pts.find((p) => p.year === highlightYear) ?? pts[pts.length - 1];
  const gridVals = Array.from({ length: 4 }, (_, i) => minVal + (i / 3) * (maxVal - minVal));

  // 누른 x를 «측정한 해»로 스냅한다. 안 잰 해로는 못 가게 막는 것이 핵심이다 —
  // 그 해엔 이 항목의 판정이 없어 상세 화면이 통째로 사라진다.
  // 세로 스크롤 안에 있으므로 onPress만 쓴다(히스토리 차트처럼 onTouchMove까지 잡으면 스크롤을 뺏는다).
  const { ref: chartRef, onLayout: onChartLayout, localX } = useChartTouchX();
  const handlePress = (evt: any) => {
    if (!onSelectYear) return;
    const raw = localX(evt);
    if (raw == null) return;
    const x = raw - PAD.left;
    const ratio = reports.length <= 1 ? 0 : Math.min(1, Math.max(0, x / PLOT_W));
    const idx = Math.round(ratio * (reports.length - 1));
    const nearest = pts.reduce((a, b) => (Math.abs(b.i - idx) < Math.abs(a.i - idx) ? b : a));
    onSelectYear(nearest.year);
  };

  return (
    <View>
      <Pressable ref={chartRef} onLayout={onChartLayout} hitSlop={8} onPress={handlePress} disabled={!onSelectYear}>
      <Svg width={CHART_W} height={CHART_H}>
        <G x={PAD.left} y={PAD.top}>
          {/* 정상범위 밴드 — infoOnly는 판정 기준이 없으므로 그리지 않는다 */}
          {!metric.infoOnly && (
            <Rect x={0} y={bandTop} width={PLOT_W} height={Math.max(0, bandBottom - bandTop)} fill={NORMAL_BAND} />
          )}
          {gridVals.map((v, i) => (
            <G key={i}>
              <Line x1={0} y1={yPos(v)} x2={PLOT_W} y2={yPos(v)} stroke={T.divider} strokeWidth={1} />
              <SvgText x={-6} y={yPos(v) + 4} fontSize={10} fill={T.text3} textAnchor="end">{Math.round(v)}</SvgText>
            </G>
          ))}
          {reports.map((r, i) => (
            <SvgText key={r.year} x={xPos(i)} y={PLOT_H + 20} fontSize={11} fill={T.text3} textAnchor="middle">{r.year}</SvgText>
          ))}
          <Path d={d} stroke={LINE} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {pts.map((p) => (
            <Circle key={p.i} cx={p.x} cy={p.y} r={p.i === focus.i ? 6.5 : 4.5} fill={p.i === focus.i ? LINE : T.white} stroke={LINE} strokeWidth={2.5} />
          ))}
          {/* 지금 보고 있는 해의 값 라벨 */}
          <SvgText x={focus.x} y={focus.y - 12} fontSize={12} fill={LINE} textAnchor="middle" fontWeight="700">{focus.v}</SvgText>
        </G>
      </Svg>
      </Pressable>
      <Text style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
        초록 밴드가 정상 범위예요. 단위: {metric.unit}
        {onSelectYear && pts.length > 1 ? ' · 그래프를 눌러 그해 수치를 봅니다.' : ''}
      </Text>
    </View>
  );
}
