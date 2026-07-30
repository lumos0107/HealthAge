import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import type { MetricDefinition, Report } from '../data';
import { metricContent } from '../data';
import { deltaText, estimateRank, formatMetricValue, headline, rankFromPercentile, yearDelta } from '../interpret';
import { StatusBadge, T } from '../components/UI';
import { categoryVisual, MetricTrendChart, PeerRankSlider, RangeBar, SquircleIcon } from '../components/v2';

// L2 항목 상세 — 이야기 순서로 읽힌다: 판단 → 이 항목이 뭔지(정의, 펼치면 심화) → 내 위치 → 근거 → 그래서 뭘 하면 되는지.
// 화면 전환은 이 오버레이 한 번만. 심화 설명만 2.5뎁스(펼치기)로 접어둔다 — 기본 설명으로 충분한 사람에게는 안 보여도 되는 층.
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
  // 실데이터 경로에서 키가 어긋나도 화면이 깨지지 않게 폴백을 둔다(심화=note, 팁 없음).
  const content = metricContent[metric.key] ?? { detail: '', tips: [] };
  // 2.5뎁스 — 심화 설명은 접어두고, 원하는 사람만 화살표로 연다.
  const [showDetail, setShowDetail] = useState(false);
  // 행동 카드 프레임 — 같은 습관 팁이라도 상태에 따라 읽히는 맥락이 다르다:
  // 정상은 유지, 주의는 개선 제안, 위험은 우선순위로 프레이밍한다.
  const tipsTitle = metric.status === '정상' ? '지금처럼 유지하려면' : metric.status === '주의' ? '이렇게 하면 좋아요' : '먼저 이것부터';

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

          {/* 정의 — 이 항목이 뭔지부터. 기본 설명 한 문장, 심화(기준 구간·용어)는 펼치기 뒤에 둔다. */}
          <View style={{ backgroundColor: T.white, borderRadius: T.radius, padding: 20, marginBottom: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: T.text1, marginBottom: 4 }}>이 항목은요</Text>
            <Text style={{ fontSize: 15, color: T.text2, lineHeight: 22 }}>{metric.description}</Text>
            {showDetail && (
              <>
                {!!content.detail && <Text style={{ fontSize: 14, color: T.text2, lineHeight: 21, marginTop: 10 }}>{content.detail}</Text>}
                <Text style={{ fontSize: 13, color: T.text3, lineHeight: 19, marginTop: 8 }}>{metric.note}</Text>
              </>
            )}
            <Pressable
              onPress={() => setShowDetail((v) => !v)}
              hitSlop={8}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.divider }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: T.text3 }}>{showDetail ? '접기' : '자세히 알아보기'}</Text>
              <Ionicons name={showDetail ? 'chevron-up' : 'chevron-down'} size={15} color={T.text3} />
            </Pressable>
          </View>

          {/* 나의 위치 — 위: 정상범위 바, 아래: "100명 중 N등" 또래 그래프(별도). infoOnly는 판정 대상이 아니라 카드 자체를 렌더하지 않는다.
              등수는 percentile(실데이터)이 있으면 실측, 없으면 또래 평균+정상범위 폭으로 어림한 추정치 — 추정임을 문구로 밝힌다. */}
          {!metric.infoOnly && (
          <View style={{ backgroundColor: T.white, borderRadius: T.radius, padding: 20, marginBottom: 12 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: T.text1 }}>정상 범위와 비교하면 여기예요</Text>
            <RangeBar metric={metric} value={value} />
            {(() => {
              const measured = metric.percentile != null;
              const rank = measured ? rankFromPercentile(metric.percentile!) : estimateRank(metric, value);
              if (rank == null) return null;
              return (
                <View style={{ marginTop: 16, paddingTop: 18, borderTopWidth: 1, borderTopColor: T.divider }}>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: T.text1, lineHeight: 25 }}>
                    같은 나이대 100명이라면,{'\n'}그중 <Text style={{ color: statusColor }}>{rank}등</Text>{measured ? '이에요' : '쯤이에요'}
                  </Text>
                  <PeerRankSlider rank={rank} color={statusColor} />
                  {!measured && (
                    <Text style={{ fontSize: 12, color: T.text3, lineHeight: 17, marginTop: 8 }}>
                      또래 평균({metric.peerMean}{metric.unit})과 정상범위 폭으로 어림한 추정 등수예요.
                    </Text>
                  )}
                </View>
              );
            })()}
          </View>
          )}

          {/* 원본 수치·정상범위 표 + 추이 차트 — 접지 않고 바로 보여준다(내용이 한 카드 분량) */}
          <View style={{ backgroundColor: T.white, borderRadius: T.radius, padding: 20, marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', gap: 24, marginBottom: 16 }}>
              <DetailCell label="내 수치" value={`${formatMetricValue(metric, value)}${metric.unit}`} color={metric.infoOnly ? T.text1 : statusColor} />
              <DetailCell label="정상 기준" value={metric.normalText} />
              {metric.peerMean != null && <DetailCell label="또래 평균" value={`${metric.peerMean}${metric.unit}`} />}
            </View>
            <MetricTrendChart metric={metric} reports={reports} />
          </View>

          {/* 행동 — 그래서 뭘 하면 되는지. 참고값(infoOnly)이나 팁이 없는 항목은 카드를 그리지 않는다. */}
          {content.tips.length > 0 && (
            <View style={{ backgroundColor: T.white, borderRadius: T.radius, padding: 20, marginBottom: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: T.text1, marginBottom: 10 }}>{tipsTitle}</Text>
              {content.tips.map((tip, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 8, marginTop: i === 0 ? 0 : 8 }}>
                  <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: T.text3, marginTop: 8 }} />
                  <Text style={{ flex: 1, fontSize: 14, color: T.text2, lineHeight: 21 }}>{tip}</Text>
                </View>
              ))}
              {metric.status === '위험' && (
                <Text style={{ fontSize: 13, color: T.text3, lineHeight: 19, marginTop: 10 }}>
                  수치가 반복해서 범위를 벗어난다면 의료기관 상담을 참고하세요.
                </Text>
              )}
            </View>
          )}

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
