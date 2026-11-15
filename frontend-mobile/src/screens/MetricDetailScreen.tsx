import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import type { MetricDefinition, Report } from '../data';
import { metricContent, yearsWithMetric } from '../data';
import { deltaText, formatMetricValue, headline, metricPeerRank, yearDelta } from '../interpret';
import { T, WebFrame } from '../components/UI';
import { A11Y, MetricTrendChart, PeerRankBlock, RangeBar, StatusChip } from '../components/v2';

// L2 항목 상세 — 히스토리·분석 상세(SummaryCard)와 같은 순서·같은 규격으로 읽힌다:
// ① 결론(22px) → 값 영역(연도·값·추이) → ② 이 지표는요(+「왜 그럴까요?」) → ③ 또래와 견주면 → ⑤ 이렇게 해 보세요.
// 화면 전환은 이 오버레이 한 번만. 심화 설명만 접어둔다(2.5뎁스).
export default function MetricDetailScreen({ metric, report, reports, onYear, onClose }: {
  metric: MetricDefinition;
  report: Report;
  reports: Report[];
  /** 있으면 화면 안에서 해를 바꿀 수 있다 — 값·배지·헤드라인·전년 대비·등수·차트가 전부 따라간다. */
  onYear?: (year: number) => void;
  onClose: () => void;
}) {
  const value = report.values[metric.key];
  const statusFill = metric.status === '정상' ? T.successFill : metric.status === '주의' ? T.warnFill : T.dangerFill;
  const statusColor = metric.status === '정상' ? T.success : metric.status === '주의' ? T.warn : T.danger;
  const delta = yearDelta(reports, metric.key, report.year);
  // 실데이터 경로에서 키가 어긋나도 화면이 깨지지 않게 폴백을 둔다(심화=note, 팁 없음).
  const content = metricContent[metric.key] ?? { detail: '', tips: [] };
  // 2.5뎁스 — 「왜 그럴까요?」는 접어두고, 원하는 사람만 연다.
  const [showDetail, setShowDetail] = useState(false);
  // 이 항목을 실제로 잰 해만 고를 수 있게 한다 — 안 잰 해에는 그 해의 판정이 없어
  // 상세 화면을 만들 수 없고, 고르는 순간 화면이 통째로 사라진다.
  const years = yearsWithMetric(reports, metric.key);
  const peer = metric.infoOnly ? null : metricPeerRank(metric, value);

  // SummaryCard와 같은 규격(카드·제목·본문)
  const card = { backgroundColor: T.white, borderRadius: T.radius, padding: 20, marginBottom: 12 } as const;
  const h = { fontSize: T.fs.strong, fontWeight: '800', color: T.text1, marginBottom: 6 } as const;
  const body = { fontSize: T.fs.strong, color: A11Y.sub, lineHeight: 27 } as const;
  const whyLines = [
    ...(metric.infoOnly ? [] : [{ label: '기준', text: metric.normalText }]),
    { label: '내 값', text: `${formatMetricValue(metric, value)}${metric.unit ?? ''}` },
    ...(metric.peerMean != null ? [{ label: '또래 평균', text: `${metric.peerMean}${metric.unit ?? ''}` }] : []),
    ...(content.detail ? [{ label: '설명', text: content.detail }] : []),
    ...(metric.note ? [{ label: '근거', text: metric.note }] : []),
  ];

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <WebFrame>
      <View style={{ flex: 1, backgroundColor: T.bg }}>
        {/* 헤더 — 뒤로가기(44px 이상) + 항목명 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 54, paddingBottom: 10, backgroundColor: T.white }}>
          <Pressable onPress={onClose} accessibilityLabel="뒤로" hitSlop={10} style={{ padding: 10 }}>
            <Ionicons name="chevron-back" size={26} color={T.text1} />
          </Pressable>
          <Text style={{ fontSize: T.fs.strong, fontWeight: '800', color: T.text1, flex: 1 }} numberOfLines={1}>{metric.name}</Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
          {/* ① 결론 — 22px */}
          <View style={card}>
            <Text style={{ fontSize: T.fs.h3, fontWeight: '800', color: T.text1, lineHeight: 32, letterSpacing: -0.3 }}>{headline(metric, value)}</Text>
          </View>

          {/* 값 영역 — 연도 · 상태 · 값 · 전년 대비 · 추이 */}
          <View style={card}>
            {onYear && years.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 14 }}>
                {[...years].reverse().map((y) => {
                  const active = y === report.year;
                  return (
                    <Pressable
                      key={y}
                      onPress={() => onYear(y)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={{ minHeight: 44, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', borderRadius: T.radiusPill, backgroundColor: active ? T.primary : T.cardAlt }}
                    >
                      <Text style={{ fontSize: T.fs.body, fontWeight: '700', color: active ? T.onPrimary : A11Y.sub }}>{y}년</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', flexShrink: 1 }}>
                <Text style={{ fontSize: 40, fontWeight: '800', color: metric.infoOnly ? T.text1 : statusFill, lineHeight: 44 }}>{formatMetricValue(metric, value)}</Text>
                {metric.unit ? <Text style={{ fontSize: T.fs.body, color: A11Y.sub, marginLeft: 6, marginBottom: 5 }}>{metric.unit}</Text> : null}
              </View>
              {metric.infoOnly ? (
                <View style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: T.radiusPill, backgroundColor: T.cardAlt }}>
                  <Text style={{ fontSize: T.fs.body, fontWeight: '700', color: A11Y.sub }}>참고</Text>
                </View>
              ) : (
                <StatusChip status={metric.status} />
              )}
            </View>
            {delta && <Text style={{ fontSize: T.fs.body, color: A11Y.sub, marginTop: 8 }}>{deltaText(delta, metric.unit)}</Text>}
            <View style={{ marginTop: 16 }}>
              <MetricTrendChart metric={metric} reports={reports} highlightYear={report.year} onSelectYear={onYear} />
            </View>
          </View>

          {/* ② 이 지표는요 — 정의, 접힌 「왜 그럴까요?」(2.5뎁스: 기준 / 내 값 / 근거) */}
          <View style={card}>
            <Text style={h}>이 지표는요</Text>
            <Text style={body}>{metric.description}</Text>
            <Pressable
              onPress={() => setShowDetail((v) => !v)}
              accessibilityRole="button"
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 52, marginTop: 14, borderRadius: T.radiusMd, backgroundColor: T.cardAlt }}
            >
              <Text style={{ fontSize: T.fs.body, fontWeight: '700', color: T.text1 }}>왜 그럴까요?</Text>
              <Ionicons name={showDetail ? 'chevron-up' : 'chevron-down'} size={18} color={T.text1} />
            </Pressable>
            {showDetail && (
              <View style={{ marginTop: 12, padding: 16, borderRadius: T.radiusMd, backgroundColor: '#F7F8FA', gap: 8 }}>
                {whyLines.map((l) => (
                  <Text key={l.label} style={{ fontSize: T.fs.body, color: A11Y.sub, lineHeight: 25 }}>
                    <Text style={{ fontWeight: '800', color: T.text1 }}>{l.label}  </Text>{l.text}
                  </Text>
                ))}
              </View>
            )}
          </View>

          {/* ③ 또래와 견주면 — 정상범위 바 + «100명 중 N등». infoOnly는 판정 대상이 아니라 그리지 않는다. */}
          {!metric.infoOnly && (
            <View style={card}>
              <Text style={h}>또래와 견주면</Text>
              <RangeBar metric={metric} value={value} />
              {peer && (
                <View style={{ marginTop: 16, paddingTop: 18, borderTopWidth: 1, borderTopColor: T.divider }}>
                  <PeerRankBlock subject={metric.name} color={statusColor} {...peer} />
                </View>
              )}
            </View>
          )}

          {/* ⑤ 이렇게 해 보세요 — 번호 원 + 최대 3개. 참고값(infoOnly)이나 팁이 없는 항목은 카드를 그리지 않는다. */}
          {content.tips.length > 0 && (
            <View style={card}>
              <Text style={{ ...h, marginBottom: 12 }}>이렇게 해 보세요</Text>
              {content.tips.slice(0, 3).map((tip, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, marginTop: i === 0 ? 0 : 6 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: T.primaryLight, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: T.fs.body, fontWeight: '800', color: '#007A49' }}>{i + 1}</Text>
                  </View>
                  <Text style={{ flex: 1, fontSize: T.fs.strong, color: T.text1, lineHeight: 26 }}>{tip}</Text>
                </View>
              ))}
              {metric.status === '위험' && (
                <Text style={{ fontSize: T.fs.body, color: A11Y.sub, lineHeight: 24, marginTop: 12 }}>
                  수치가 반복해서 범위를 벗어난다면 의료기관 상담을 참고하세요.
                </Text>
              )}
            </View>
          )}

          <Text style={{ fontSize: T.fs.caption, color: A11Y.sub, textAlign: 'center', marginTop: 4 }}>참고용이에요. 걱정되면 의료진과 상담해 보세요.</Text>
        </ScrollView>
      </View>
      </WebFrame>
    </Modal>
  );
}
