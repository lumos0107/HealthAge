import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import type { MetricDefinition, Report } from '../data';
import { metricContent, yearsWithMetric } from '../data';
import { deltaText, formatMetricValue, headline, metricPeerRank, positionTitle, yearDelta } from '../interpret';
import { StatusBadge, T, WebFrame } from '../components/UI';
import { categoryVisual, MetricTrendChart, PeerRankBlock, RangeBar, SquircleIcon } from '../components/v2';

// L2 항목 상세 — 이야기 순서로 읽힌다: 판단 → 이 항목이 뭔지(정의, 펼치면 심화) → 내 위치 → 근거 → 그래서 뭘 하면 되는지.
// 화면 전환은 이 오버레이 한 번만. 심화 설명만 2.5뎁스(펼치기)로 접어둔다 — 기본 설명으로 충분한 사람에게는 안 보여도 되는 층.
export default function MetricDetailScreen({ metric, report, reports, onYear, onClose }: {
  metric: MetricDefinition;
  report: Report;
  reports: Report[];
  /** 있으면 화면 안에서 해를 바꿀 수 있다 — 값·배지·헤드라인·전년 대비·등수·차트가 전부 따라간다. */
  onYear?: (year: number) => void;
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
  // 이 항목을 실제로 잰 해만 고를 수 있게 한다 — 안 잰 해에는 그 해의 판정이 없어
  // 상세 화면을 만들 수 없고, 고르는 순간 화면이 통째로 사라진다.
  const years = yearsWithMetric(reports, metric.key);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <WebFrame>
      <View style={{ flex: 1, backgroundColor: T.bg }}>
        {/* 헤더 — 뒤로가기 + 항목명 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 54, paddingBottom: 10, backgroundColor: T.white }}>
          <Pressable onPress={onClose} hitSlop={10} style={{ padding: 8 }}>
            <Ionicons name="chevron-back" size={24} color={T.text1} />
          </Pressable>
          <Text style={{ fontSize: 17, fontWeight: '700', color: T.text1 }}>{metric.name}</Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
          {/* 연도 — 분석 탭과 같은 방식으로 여기서도 해를 바꾼다. 예전에는 들어올 때의 해로 고정이라
              다른 해를 보려면 목록으로 나갔다 다시 들어와야 했다. */}
          {onYear && years.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
              {[...years].reverse().map((y) => {
                const active = y === report.year;
                return (
                  <Pressable
                    key={y}
                    onPress={() => onYear(y)}
                    style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: T.radiusPill, backgroundColor: active ? T.primary : T.white }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '700', color: active ? '#fff' : T.text2 }}>{y}년</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

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
            <Text style={{ fontSize: 14, fontWeight: '700', color: T.text1, marginBottom: 4 }}>이 지표는요</Text>
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
              등수 문장·근거 배지는 PeerRankBlock 한 곳에 모아 두어 분석·히스토리와 같은 모양으로 말한다. */}
          {!metric.infoOnly && (
          <View style={{ backgroundColor: T.white, borderRadius: T.radius, padding: 20, marginBottom: 12 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: T.text1 }}>정상 범위와 비교하면 여기예요</Text>
            <RangeBar metric={metric} value={value} />
            {(() => {
              const peer = metricPeerRank(metric, value);
              if (!peer) return null;
              return (
                <View style={{ marginTop: 16, paddingTop: 18, borderTopWidth: 1, borderTopColor: T.divider }}>
                  <PeerRankBlock subject={metric.name} color={statusColor} {...peer} />
                </View>
              );
            })()}
          </View>
          )}

          {/* 원본 수치·정상범위 표 + 추이 차트 — 접지 않고 바로 보여준다(내용이 한 카드 분량)
              이 카드도 ③「나의 위치」다(time 축). 제목이 없어 위 카드의 꼬리처럼 보였는데,
              위는 기준·또래로 «지금»을 말하고 여기는 «흐름»을 말하는 다른 비교다.
              제목은 규격대로 축에서 뽑는다(§2-1) — 두 화면이 같은 함수를 쓴다. */}
          <View style={{ backgroundColor: T.white, borderRadius: T.radius, padding: 20, marginBottom: 12 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: T.text1, marginBottom: 14 }}>{positionTitle(['time'])}</Text>
            <View style={{ flexDirection: 'row', gap: 24, marginBottom: 16 }}>
              <DetailCell label="내 수치" value={`${formatMetricValue(metric, value)}${metric.unit}`} color={metric.infoOnly ? T.text1 : statusColor} />
              <DetailCell label="정상 기준" value={metric.normalText} />
              {metric.peerMean != null && <DetailCell label="또래 평균" value={`${metric.peerMean}${metric.unit}`} />}
            </View>
            <MetricTrendChart metric={metric} reports={reports} highlightYear={report.year} onSelectYear={onYear} />
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
      </WebFrame>
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
