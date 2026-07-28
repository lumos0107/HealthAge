// 디자인 시스템 v2에서 새로 도입한 컴포넌트 모음.
// 상태색(그린/앰버/레드)과 절대 겹치지 않는 카테고리 색을 쓴다 — 상태로 오인 방지.
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import type { MetricDefinition, Report } from '../data';
import { normalBounds } from '../interpret';
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
  return (
    <View style={{ marginTop: 6 }}>
      <View style={{ height: 26 }}>
        <View style={{ position: 'absolute', left: `${pct}%`, transform: [{ translateX: -16 }], alignItems: 'center' }}>
          <View style={{ backgroundColor: color, paddingHorizontal: 9, paddingVertical: 3, borderRadius: T.radiusPill }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>나</Text>
          </View>
          <View style={{ width: 2, height: 5, backgroundColor: color }} />
        </View>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: T.cardAlt, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', left: `${pct}%`, transform: [{ translateX: -5 }], top: -1, width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
        <Text style={{ fontSize: 12, color: T.text3 }}>1등</Text>
        <Text style={{ fontSize: 12, color: T.text3 }}>100등</Text>
      </View>
    </View>
  );
}

// 정상범위 밴드 전용 색 — T.successBg(#EAF7F1)는 흰 카드 위에서 너무 연해 구분이 안 돼 한 단계 진하게 쓴다.
// (배지·칩 배경은 기존 T.successBg 유지 — 글자가 올라가는 배경이라 연해야 한다.)
const NORMAL_BAND = '#C9EDDC';

/** percentile이 없는 항목용 — 정상범위 밴드 위에 내 수치 위치만 보여준다(추정 등수를 지어내지 않는다). */
export function RangeBar({ metric, value }: { metric: MetricDefinition; value: number }) {
  const { low, high } = normalBounds(metric);
  // 축 범위: 정상 경계와 내 값이 모두 들어가게 잡고 양쪽 15% 여유
  const lo = Math.min(value, low ?? value, high ?? value);
  const hi = Math.max(value, low ?? value, high ?? value);
  const pad = (hi - lo) * 0.3 || Math.abs(hi) * 0.15 || 1;
  const min = lo - pad;
  const max = hi + pad;
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
    </View>
  );
}

function statusTone(metric: MetricDefinition) {
  if (metric.status === '정상') return { color: T.success, bg: T.successBg };
  if (metric.status === '주의') return { color: T.warn, bg: T.warnBg };
  return { color: T.danger, bg: T.dangerBg };
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

export function MetricTrendChart({ metric, reports }: { metric: MetricDefinition; reports: Report[] }) {
  const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const pts0 = reports
    .map((r, i) => ({ i, year: r.year, v: r.values[metric.key] }))
    .filter((p): p is { i: number; year: number; v: number } => isNum(p.v));
  if (pts0.length === 0) {
    return <Text style={{ fontSize: 13, color: T.text3, textAlign: 'center', paddingVertical: 24 }}>이 항목의 기록이 없어요.</Text>;
  }
  // infoOnly(키·체중)는 판정 대상이 아니라 정상범위 밴드가 없다 — 밴드 없이 값만 보여준다.
  const { low, high } = metric.infoOnly ? { low: undefined, high: undefined } : normalBounds(metric);
  const vals = [...pts0.map((p) => p.v), ...(low != null ? [low] : []), ...(high != null ? [high] : [])];
  const rawMin = Math.min(...vals);
  const rawMax = Math.max(...vals);
  const margin = (rawMax - rawMin) * 0.25 || 5;
  const minVal = rawMin - margin;
  const maxVal = rawMax + margin;
  const range = maxVal - minVal || 1;
  const xPos = (i: number) => (reports.length === 1 ? PLOT_W / 2 : (i / (reports.length - 1)) * PLOT_W);
  const yPos = (v: number) => PLOT_H - ((v - minVal) / range) * PLOT_H;
  const bandTop = yPos(high ?? maxVal);
  const bandBottom = yPos(low ?? minVal);
  const pts = pts0.map((p) => ({ ...p, x: xPos(p.i), y: yPos(p.v) }));
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const last = pts[pts.length - 1];
  const gridVals = Array.from({ length: 4 }, (_, i) => minVal + (i / 3) * (maxVal - minVal));

  return (
    <View>
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
            <Circle key={p.i} cx={p.x} cy={p.y} r={p.i === last.i ? 6.5 : 4.5} fill={p.i === last.i ? LINE : T.white} stroke={LINE} strokeWidth={2.5} />
          ))}
          {/* 최신 값 강조 라벨 */}
          <SvgText x={last.x} y={last.y - 12} fontSize={12} fill={LINE} textAnchor="middle" fontWeight="700">{last.v}</SvgText>
        </G>
      </Svg>
      <Text style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>초록 밴드가 정상 범위예요. 단위: {metric.unit}</Text>
    </View>
  );
}
