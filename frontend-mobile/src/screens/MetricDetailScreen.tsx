import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import type { MetricDefinition, Report } from '../data';
import { deltaText, formatMetricValue, headline, rankFromPercentile, yearDelta } from '../interpret';
import { Collapsible, StatusBadge, T } from '../components/UI';
import { categoryVisual, MetricTrendChart, PeerRankSlider, RangeBar, SquircleIcon } from '../components/v2';

// L2 항목 상세 — 화면 전환은 이 오버레이 한 번만. 안에서는 펼침(L3)으로만 더 들어간다.
export default function MetricDetailScreen({ metric, report, reports, onClose }: {
  metric: MetricDefinition;
  report: Report;
  reports: Report[];
  onClose: () => void;
}) {
  const value = report.values[metric.key];
  const statusColor = metric.status === '정상' ? T.success : metric.status === '주의' ? T.warn : T.danger;
  const delta = yearDelta(reports, metric.key, report.year);
  const visual = categoryVisual(metric.category);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: T.bg }}>
        {/* 헤더 — 뒤로가기 + 항목명 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 54, paddingBottom: 10, backgroundColor: T.white }}>
          <Pressable onPress={onClose} hitSlop={10} style={{ padding: 8 }}>
            <Ionicons name="chevron-back" size={24} color={T.text1} />
          </Pressable>
          <Text style={{ fontSize: 17, fontWeight: '700', color: T.text1 }}>{metric.name}</Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
          {/* L2 상단 — 판단 먼저: 배지 → 쉬운 문장 → 값·전년 대비 */}
          <View style={{ backgroundColor: T.white, borderRadius: T.radius, padding: 20, marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <SquircleIcon icon={visual.icon} color={visual.color} bg={visual.bg} />
              {metric.infoOnly ? (
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: T.radiusPill, backgroundColor: T.cardAlt }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: T.text3 }}>참고</Text>
                </View>
              ) : (
                <StatusBadge status={metric.status} />
              )}
            </View>
            <Text style={{ fontSize: 24, fontWeight: '800', color: T.text1, lineHeight: 33 }}>{headline(metric, value)}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 12 }}>
              <Text style={{ fontSize: 40, fontWeight: '800', color: metric.infoOnly ? T.text1 : statusColor, lineHeight: 44 }}>{formatMetricValue(metric, value)}</Text>
              {metric.unit ? <Text style={{ fontSize: 14, color: T.text3, marginLeft: 4, marginBottom: 5 }}>{metric.unit}</Text> : null}
            </View>
            {delta && <Text style={{ fontSize: 15, color: T.text2, marginTop: 6 }}>{deltaText(delta, metric.unit)}</Text>}
          </View>

          {/* 또래 비교 — percentile 있을 때만 등수, 없으면 정상범위 위치 바. infoOnly는 판정 대상이 아니라 등수·정상범위 비교가 의미 없어 카드 자체를 렌더하지 않는다. */}
          {!metric.infoOnly && (
          <View style={{ backgroundColor: T.white, borderRadius: T.radius, padding: 20, marginBottom: 12 }}>
            {metric.percentile != null ? (
              <>
                <Text style={{ fontSize: 17, fontWeight: '700', color: T.text1, lineHeight: 25 }}>
                  같은 나이대 100명이라면,{'\n'}그중 <Text style={{ color: statusColor }}>{rankFromPercentile(metric.percentile)}등</Text>이에요
                </Text>
                <PeerRankSlider rank={rankFromPercentile(metric.percentile)} color={statusColor} />
              </>
            ) : (
              <>
                <Text style={{ fontSize: 17, fontWeight: '700', color: T.text1 }}>정상 범위와 비교하면 여기예요</Text>
                <RangeBar metric={metric} value={value} />
              </>
            )}
          </View>
          )}

          {/* L3 — 자세히 보기 펼침: 원본 수치·정상범위 표, 추이 차트, 용어 설명 */}
          <View style={{ backgroundColor: T.white, borderRadius: T.radius, paddingHorizontal: 20, marginBottom: 12 }}>
            <Collapsible title="자세히 보기">
              <View style={{ flexDirection: 'row', gap: 24, marginBottom: 16 }}>
                <DetailCell label="내 수치" value={`${formatMetricValue(metric, value)}${metric.unit}`} color={metric.infoOnly ? T.text1 : statusColor} />
                <DetailCell label="정상 기준" value={metric.normalText} />
                {metric.peerMean != null && <DetailCell label="또래 평균" value={`${metric.peerMean}${metric.unit}`} />}
              </View>
              <MetricTrendChart metric={metric} reports={reports} />
              <View style={{ marginTop: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: T.text1, marginBottom: 4 }}>이 항목은요</Text>
                <Text style={{ fontSize: 15, color: T.text2, lineHeight: 22 }}>{metric.description}</Text>
                <Text style={{ fontSize: 13, color: T.text3, lineHeight: 19, marginTop: 6 }}>{metric.note}</Text>
              </View>
            </Collapsible>
          </View>

          <Text style={{ fontSize: 12, color: T.text3, textAlign: 'center' }}>참고용이며 진단이 아닙니다</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

function DetailCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View>
      <Text style={{ fontSize: 12, color: T.text3, marginBottom: 3 }}>{label}</Text>
      <Text style={{ fontSize: 15, fontWeight: '700', color: color ?? T.text1 }}>{value}</Text>
    </View>
  );
}
