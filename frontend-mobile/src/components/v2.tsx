// 디자인 시스템 v2에서 새로 도입한 컴포넌트 모음.
// 상태색(그린/앰버/레드)과 절대 겹치지 않는 카테고리 색을 쓴다 — 상태로 오인 방지.
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { SCORE_PENALTY } from '../data';
import type { MetricDefinition, Report } from '../data';
import { formatMetricValue, normalBounds, scoreGrade } from '../interpret';
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

/** 1뎁스 요약 카드 + 2뎁스 상세 오버레이 — 탭에는 제목·결론 한 줄만 두고,
 *  누르면 검사항목 상세(MetricDetailScreen)와 같은 전체 화면 오버레이가 열린다.
 *  오버레이 안은 항상 같은 순서로 읽힌다:
 *    ① 결론  ② 이 지표는요(정의 + 2.5뎁스 '자세히 알아보기')  ③ 나의 위치(근거·차트)
 *    ④ 그래서 이게 의미하는 건  ⑤ 그럼 뭘 하면 좋을까
 *  definition/meaning/tips가 없으면 그 칸은 그리지 않는다(있는 정보만 보여준다). */
export function SummaryCard({ title, summary, detailSummary, badge, preview, definition, detail, meaning, meaningExtra, tips, positionTitle, positionExtra, children }: {
  title: string;
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
  /** ③ 근거 카드의 제목 — 기본 "나의 위치" */
  positionTitle?: string;
  /** ③ 근거 카드 맨 위에 얹는 요소 — 등수 슬라이더 등 */
  positionExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingVertical: 18, marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: T.text1, flex: 1 }}>{title}</Text>
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
            {/* ③ 나의 위치 — 근거(차트·지표 행) */}
            <View style={{ backgroundColor: T.white, borderRadius: T.radius, padding: 20, marginBottom: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: T.text1, marginBottom: 12 }}>{positionTitle ?? '나의 위치'}</Text>
              {positionExtra}
              {children}
            </View>
            {/* ④ 그래서 이게 의미하는 건 */}
            {(!!meaning || !!meaningExtra) && (
              <View style={{ backgroundColor: T.white, borderRadius: T.radius, padding: 20, marginBottom: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: T.text1, marginBottom: 4 }}>그래서 이게 의미하는 건</Text>
                {!!meaning && <Text style={{ fontSize: 15, color: T.text2, lineHeight: 22 }}>{meaning}</Text>}
                {meaningExtra}
              </View>
            )}
            {/* ⑤ 그럼 뭘 하면 좋을까 */}
            {!!tips?.length && (
              <View style={{ backgroundColor: T.white, borderRadius: T.radius, padding: 20, marginBottom: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: T.text1, marginBottom: 10 }}>그럼 뭘 하면 좋을까요</Text>
                {tips.map((tip, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 8, marginTop: i === 0 ? 0 : 8 }}>
                    <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: T.text3, marginTop: 8 }} />
                    <Text style={{ flex: 1, fontSize: 14, color: T.text2, lineHeight: 21 }}>{tip}</Text>
                  </View>
                ))}
              </View>
            )}
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
export function ScoreCalcNote({ score, manageCount, trackCount }: {
  score: number; manageCount: number; trackCount: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && (
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
      <Pressable
        onPress={() => setOpen((v) => !v)}
        hitSlop={8}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.divider }}
      >
        <Text style={{ fontSize: 13, fontWeight: '600', color: T.text3 }}>{open ? '접기' : '어떻게 계산했나요?'}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={15} color={T.text3} />
      </Pressable>
    </>
  );
}

/** 하단 고정 CTA — 다음 행동 버튼을 항상 같은 위치에. 스크롤 콘텐츠에는 paddingBottom 100 이상을 줄 것. */
export function FixedCTA({ label, onPress, disabled, loading }: {
  label: string; onPress: () => void; disabled?: boolean; loading?: boolean;
}) {
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: T.white, paddingHorizontal: 20, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 28 : 16 }}>
      <Pressable
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
  const handlePress = (evt: any) => {
    if (!onSelectYear) return;
    const x = evt.nativeEvent.locationX - PAD.left;
    const ratio = reports.length <= 1 ? 0 : Math.min(1, Math.max(0, x / PLOT_W));
    const idx = Math.round(ratio * (reports.length - 1));
    const nearest = pts.reduce((a, b) => (Math.abs(b.i - idx) < Math.abs(a.i - idx) ? b : a));
    onSelectYear(nearest.year);
  };

  return (
    <View>
      <Pressable onPress={handlePress} disabled={!onSelectYear}>
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
