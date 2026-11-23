import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import type { MetricDefinition, Report } from '../data';
import { metricContent, yearsWithMetric } from '../data';
import { deltaText, formatMetricValue, headline, metricPeerRank, yearDelta } from '../interpret';
import { MeasuredChart, T, WebFrame } from '../components/UI';
import { useLayout } from '../responsive';
import { metricGloss } from '../data';
import { A11Y, MetricTrendChart, PeerRankBlock, RangeBar, StatusChip } from '../components/v2';

// L2 항목 상세 — 히스토리·분석 상세(SummaryCard)와 같은 순서·같은 규격으로 읽힌다:
// ① 결론(22px) → 값 영역(연도·값·추이) → ② 이 지표는요(+「왜 그럴까요?」) → ③ 또래와 견주면 → ⑤ 이렇게 해 보세요.
// 화면 전환은 이 오버레이 한 번만. 심화 설명만 접어둔다(2.5뎁스).
export default function MetricDetailScreen({ metric, report, reports, onYear, onClose, variant = 'modal' }: {
  metric: MetricDefinition;
  report: Report;
  reports: Report[];
  /** 있으면 화면 안에서 해를 바꿀 수 있다 — 값·배지·헤드라인·전년 대비·등수·차트가 전부 따라간다. */
  onYear?: (year: number) => void;
  /** 모달일 때 뒤로 가기. */
  onClose?: () => void;
  /** pane: 넓은 모니터의 검사항목 오른쪽 칸 — 모달·머리줄 없이 같은 카드를 1열로 쌓는다(칸 폭이 440~600이라 3열이 안 들어감). */
  variant?: 'modal' | 'pane';
}) {
  const { isTablet, isLandscape } = useLayout();
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

  // ── 카드들 — 모바일(1열)과 태블릿(2·3열)이 같은 카드를 다른 자리에 놓는다. 태블릿은 카드 간격을 grid가 맡는다.
  const cardStyle = isTablet ? { ...card, marginBottom: 0, paddingHorizontal: 24 } : card;

  const conclusionCard = isTablet ? (
    <View style={cardStyle}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {metric.infoOnly ? (
          <View style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: T.radiusPill, backgroundColor: T.cardAlt }}>
            <Text style={{ fontSize: T.fs.body, fontWeight: '700', color: A11Y.sub }}>○ 참고</Text>
          </View>
        ) : <StatusChip status={metric.status} />}
        <Text style={{ fontSize: T.fs.caption, color: A11Y.sub, flex: 1 }}>{metric.name}{metricGloss[metric.key] ? ` · ${metricGloss[metric.key]}` : ''}</Text>
      </View>
      <Text style={{ fontSize: T.fs.title, fontWeight: '800', color: T.text1, lineHeight: 34, marginTop: 8 }}>{headline(metric, value)}</Text>
    </View>
  ) : (
    <View style={card}>
      <Text style={{ fontSize: T.fs.h3, fontWeight: '800', color: T.text1, lineHeight: 32, letterSpacing: -0.3 }}>{headline(metric, value)}</Text>
    </View>
  );

  const valueCard = (
    <View style={cardStyle}>
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
                style={{ minHeight: 48, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', borderRadius: T.radiusPill, backgroundColor: active ? (isTablet ? T.text1 : T.primary) : T.cardAlt }}
              >
                <Text style={{ fontSize: T.fs.body, fontWeight: '700', color: active ? (isTablet ? '#fff' : T.onPrimary) : A11Y.sub }}>{y}년</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', flexShrink: 1 }}>
          <Text style={{ fontSize: isTablet ? 56 : 40, fontWeight: '800', color: metric.infoOnly ? T.text1 : statusFill, lineHeight: isTablet ? 64 : 44 }}>{formatMetricValue(metric, value)}</Text>
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
      {delta && <Text style={{ fontSize: T.fs.body, color: isTablet ? T.text1 : A11Y.sub, marginTop: 8 }}>{deltaText(delta, metric.unit)}</Text>}
      <View style={{ marginTop: 16 }}>
        {/* 태블릿은 열 폭이 달라서 카드 안에서 잰 폭으로 그린다 */}
        {isTablet
          ? <MeasuredChart><MetricTrendChart metric={metric} reports={reports} highlightYear={report.year} onSelectYear={onYear} /></MeasuredChart>
          : <MetricTrendChart metric={metric} reports={reports} highlightYear={report.year} onSelectYear={onYear} />}
      </View>
    </View>
  );

  const aboutCard = (
    <View style={cardStyle}>
      <Text style={h}>이 지표는요</Text>
      <Text style={body}>{metric.description}</Text>
      <Pressable
        onPress={() => setShowDetail((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: showDetail }}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: isTablet ? 'space-between' : 'center', paddingHorizontal: isTablet ? 20 : 0, gap: 6, minHeight: 52, marginTop: 14, borderRadius: T.radiusMd, backgroundColor: T.cardAlt }}
      >
        <Text style={{ fontSize: T.fs.strong, fontWeight: '700', color: T.text1 }}>왜 그럴까요?</Text>
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
  );

  // 정상범위 바 + «100명 중 N등». infoOnly는 판정 대상이 아니라 그리지 않는다.
  const peerCard = !metric.infoOnly ? (
    <View style={cardStyle}>
      <Text style={h}>또래와 견주면</Text>
      <RangeBar metric={metric} value={value} />
      {peer && (
        <View style={{ marginTop: 16, paddingTop: 18, borderTopWidth: 1, borderTopColor: T.divider }}>
          <PeerRankBlock subject={metric.name} color={statusColor} {...peer} />
        </View>
      )}
    </View>
  ) : null;

  // 번호 원 + 최대 3개. 참고값(infoOnly)이나 팁이 없는 항목은 카드를 그리지 않는다.
  const tipsCard = content.tips.length > 0 ? (
    <View style={cardStyle}>
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
  ) : null;

  const footnote = <Text style={{ fontSize: T.fs.caption, color: A11Y.sub, textAlign: 'center', marginTop: 4 }}>참고용이에요. 걱정되면 의료진과 상담해 보세요.</Text>;

  // 태블릿 열 구성 — 세로 2열(좌: 결론·값과 그래프·이 지표는요 / 우: 또래와 견주면·이렇게 해 보세요),
  // 가로 3열(결론·값 / 이 지표는요·또래와 견주면 / 이렇게 해 보세요). 시안 비율 408:300, 368:290:290.
  const colStyle = { gap: 12, minWidth: 0 } as const;
  const tabletCols = isLandscape
    ? [
        { flex: 368, items: [conclusionCard, valueCard] },
        { flex: 290, items: [aboutCard, peerCard] },
        { flex: 290, items: [tipsCard] },
      ]
    : [
        { flex: 408, items: [conclusionCard, valueCard, aboutCard] },
        { flex: 300, items: [peerCard, tipsCard] },
      ];

  if (variant === 'pane') {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40, gap: 12 }} showsVerticalScrollIndicator={false}>
        {[conclusionCard, valueCard, aboutCard, peerCard, tipsCard].map((node, i) => node ? <React.Fragment key={i}>{node}</React.Fragment> : null)}
        {footnote}
      </ScrollView>
    );
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <WebFrame wide={isTablet}>
      <View style={{ flex: 1, backgroundColor: T.bg }}>
        {/* 헤더 — 뒤로가기(48px) + 항목명 (+ 태블릿은 오른쪽에 연도·병원) */}
        {isTablet ? (
          <View style={{ height: 72, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, backgroundColor: T.white }}>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="뒤로 가기" style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: T.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="chevron-back" size={26} color={T.text1} />
            </Pressable>
            <View style={{ flexShrink: 1 }}>
              <Text style={{ fontSize: T.fs.h3, fontWeight: '800', color: T.text1 }} numberOfLines={1}>{metric.name}</Text>
              {!!metricGloss[metric.key] && <Text style={{ fontSize: T.fs.caption, color: A11Y.sub }} numberOfLines={1}>{metricGloss[metric.key]}</Text>}
            </View>
            <Text style={{ marginLeft: 'auto', fontSize: T.fs.caption, color: A11Y.sub }} numberOfLines={1}>{report.year}년 · {report.hospital}</Text>
          </View>
        ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 54, paddingBottom: 10, backgroundColor: T.white }}>
          <Pressable onPress={onClose} accessibilityLabel="뒤로" hitSlop={10} style={{ padding: 10 }}>
            <Ionicons name="chevron-back" size={26} color={T.text1} />
          </Pressable>
          <Text style={{ fontSize: T.fs.strong, fontWeight: '800', color: T.text1, flex: 1 }} numberOfLines={1}>{metric.name}</Text>
        </View>
        )}

        {isTablet ? (
          <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 48, gap: 12 }} showsVerticalScrollIndicator={false} style={{ ...({ wordBreak: 'keep-all' } as any) }}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              {tabletCols.map((col, ci) => (
                <View key={ci} style={[colStyle, { flex: col.flex }]}>
                  {col.items.map((node, ni) => node ? <React.Fragment key={ni}>{node}</React.Fragment> : null)}
                </View>
              ))}
            </View>
            {footnote}
          </ScrollView>
        ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
          {conclusionCard}
          {valueCard}
          {aboutCard}
          {peerCard}
          {tipsCard}
          {footnote}
        </ScrollView>
        )}
      </View>
      </WebFrame>
    </Modal>
  );
}
