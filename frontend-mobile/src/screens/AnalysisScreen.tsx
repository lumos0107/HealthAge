import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { AnimatedScore, DirectionalBar, Eyebrow, FadeIn, FadeInUp, T } from '../components/UI';
import { computeGroupsForReport, directionLabel, metricsForReport, metricDirection, SCORE_PENALTY } from '../data';
import type { MetricDefinition, Report } from '../data';
import type { RealRecommendations, RealEgfr } from '../health';

export default function AnalysisScreen({ reports, metricDefinitions, usingRealData, recommendations, egfr }: {
  reports: Report[];
  metricDefinitions: MetricDefinition[];
  usingRealData?: boolean;
  recommendations?: RealRecommendations | null;
  egfr?: RealEgfr | null;
}) {
  const [yearIdx, setYearIdx] = useState(reports.length - 1);
  const report = reports[yearIdx];

  // 참고 점수: 그 해 검진 결과에 기록된 값을 그대로 보여준다(대시보드·기록 화면과 항상 일치).
  // 감점 근거(주의/위험 개수)도 그 해 기록과 함께 저장해 둔 값을 그대로 쓴다 — 연도가 바뀌어도 항상 점수와 일치한다.
  const scorePct = report.score;
  const scoreColor = scorePct >= 70 ? T.success : scorePct >= 40 ? T.warn : T.danger;

  // 관리 참고군: 선택한 연도의 실제 측정값을 기준으로 매번 다시 계산한다 — 연도를 바꾸면 그 해 기준으로 갱신된다.
  // (단, 정렬은 매칭 개수 기준이라 1순위 그룹이 자연히 상단에 오게 되고, 보통 연도가 바뀌어도 같은 그룹이 1순위를 유지한다)
  const groups = useMemo(() => computeGroupsForReport(report, metricDefinitions), [report, metricDefinitions]);
  const topGroup = groups[0];
  // 그 해 기준 항목 상태 — 점수·뱃지·그룹 매칭이 모두 이 데이터 하나에서 파생되어 항상 일치한다.
  const yearMetrics = useMemo(() => metricsForReport(report, metricDefinitions), [report, metricDefinitions]);
  // 그 해에 실제로 측정된 항목만 골라 보여준다 — 검사하지 않은 항목까지 끼워 넣으면
  // 사용자에게 사실과 다른 정보를 전달하게 되므로, yearMetrics(그 해 측정 항목)에 없는 키는 제외한다.
  const metricsByKeys = (keys: typeof topGroup.keys) =>
    keys.map((k) => yearMetrics.find((m) => m.key === k)).filter((m): m is MetricDefinition => !!m);
  // 펼쳐진 참고군 이름 — 카드를 누르면 그 그룹의 관련 항목들이 카드 바로 아래에 펼쳐진다.
  const [expandedGroup, setExpandedGroup] = useState<string | null>(topGroup.name);
  // 연도를 바꾸면 그 해의 1순위 그룹을 기본으로 펼쳐서 보여준다.
  useEffect(() => { setExpandedGroup(topGroup.name); }, [report.year]);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false} style={{ backgroundColor: T.bg }}>

      {/* 페이지 헤더 — 화면에 들어오면 살짝 떠오르며 나타난다 */}
      <FadeInUp delay={0}>
      <View style={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 14 }}>
        <Eyebrow>ANALYSIS</Eyebrow>
        <Text style={{ fontSize: 34, fontWeight: '800', fontFamily: T.fontDisplay, color: T.text1, letterSpacing: -0.5, marginTop: 6 }}>건강분석</Text>
        <Text style={{ fontSize: 13, color: T.text3, lineHeight: 19, marginTop: 6 }}>내 수치, 정상 기준, 연령대 평균을 비교합니다.</Text>
      </View>
      </FadeInUp>

      {/* 안내 — 박스 대신 구분선과 텍스트만으로 */}
      <FadeInUp delay={50}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginHorizontal: 16, paddingVertical: 12, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: T.divider }}>
        <Text style={{ fontSize: 13, color: T.primary, fontWeight: '700' }}>!</Text>
        <Text style={{ fontSize: 13, color: T.text2, lineHeight: 20, flex: 1 }}>
          이 화면은 건강검진 수치를 이해하기 위한 참고 정보입니다. 질병 진단이나 치료 판단을 대체하지 않습니다.
        </Text>
      </View>
      </FadeInUp>

      {/* ① 참고 점수 */}
      <FadeInUp delay={100}>
      <View style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20, marginBottom: 8 }}>
        <Text style={{ fontSize: 14, color: T.text3, fontWeight: '500', marginBottom: 8 }}>참고 점수</Text>
        {/* 연도 선택 — 기록이 늘어나도 가로 스크롤로 자유롭게 비교 */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }} contentContainerStyle={{ gap: 8 }}>
          {reports.map((r, i) => (
            <Pressable
              key={r.year}
              onPress={() => setYearIdx(i)}
              style={{
                paddingHorizontal: 16, paddingVertical: 9, borderRadius: T.radiusPill,
                backgroundColor: i === yearIdx ? T.primary : T.bg,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: i === yearIdx ? '#fff' : T.text3 }}>{r.year}년</Text>
            </Pressable>
          ))}
        </ScrollView>
        {/* 연도를 바꿀 때마다 점수가 0에서부터 채워지며 그려져, 변화가 자연스럽게 느껴진다 */}
        <View style={{ marginBottom: 16 }}>
          <AnimatedScore score={scorePct} color={scoreColor} />
        </View>
        <Text style={{ fontSize: 13, color: T.text2, lineHeight: 20, marginBottom: 16 }}>
          100점에서 시작해 주의 항목은 {SCORE_PENALTY.manage}점, 위험 항목은 {SCORE_PENALTY.track}점씩 빼서 계산해요.{'\n'}
          100 − ({SCORE_PENALTY.manage}×주의 {report.manageCount}개) − ({SCORE_PENALTY.track}×위험 {report.trackCount}개) = {scorePct}점
        </Text>
        {/* 감점 기준 — 옅은 색칠 박스 없이, 색은 글자에만 사용해 구분선으로 나열 */}
        <View style={{ flexDirection: 'row' }}>
          {[
            { label: '정상', note: '감점 없음', color: T.success },
            { label: '주의', note: '-6점', color: T.warn },
            { label: '위험', note: '-12점', color: T.danger },
          ].map((item, i) => (
            <View key={item.label} style={[{ flex: 1, alignItems: 'center', paddingVertical: 10 }, i > 0 && { borderLeftWidth: 1, borderLeftColor: T.divider }]}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: item.color, textAlign: 'center', marginBottom: 4 }}>{item.label}</Text>
              <Text style={{ fontSize: 15, fontWeight: '700', color: T.text1 }}>{item.note}</Text>
            </View>
          ))}
        </View>
      </View>
      </FadeInUp>

      {/* ② 관리 참고군 — 카드를 누르면 그 그룹에 해당하는 검사 항목들이 바로 아래에 펼쳐진다.
          연도를 바꾸면 살짝 페이드되며 갱신되어 변화가 자연스럽게 보인다 */}
      <FadeInUp delay={150}>
      <FadeIn key={`groups-${report.year}`}>
      <View style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, marginBottom: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: T.text1, marginBottom: 4 }}>나의 관리 참고군 · {report.year}년 기준</Text>
        <Text style={{ fontSize: 13, color: T.text2, marginBottom: 16 }}>그룹을 눌러보면 관련 검사 항목을 자세히 비교할 수 있어요.</Text>
        <View style={{ gap: 8 }}>
          {groups.map((group) => {
            const isOpen = expandedGroup === group.name;
            const groupMetrics = metricsByKeys(group.keys);
            return (
              <View
                key={group.name}
                style={{
                  borderWidth: 1,
                  borderColor: isOpen ? T.primary : T.border,
                  backgroundColor: T.white,
                  borderRadius: T.radiusMd,
                  overflow: 'hidden',
                }}
              >
                <Pressable onPress={() => setExpandedGroup(isOpen ? null : group.name)} style={{ padding: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontWeight: '700', color: T.text1, fontSize: 14, flex: 1 }}>{group.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ backgroundColor: group.matches > 0 ? T.dangerBg : T.cardAlt, paddingHorizontal: 8, paddingVertical: 3, borderRadius: T.radiusPill }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: group.matches > 0 ? T.danger : T.text3 }}>{group.matches}개 해당</Text>
                      </View>
                      <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={T.text3} />
                    </View>
                  </View>
                  <Text style={{ fontSize: 12, color: T.text2, lineHeight: 18 }}>{group.meaning}</Text>
                  {group.metrics.length > 0 && (
                    <Text style={{ fontSize: 12, color: T.text3, marginTop: 3 }}>해당: {group.metrics.join(', ')}</Text>
                  )}
                </Pressable>
                {isOpen && (
                  <View style={{ paddingHorizontal: 14, paddingBottom: 6, backgroundColor: T.white, borderTopWidth: 1, borderTopColor: T.divider }}>
                    {groupMetrics.length === 0 ? (
                      <Text style={{ fontSize: 12, color: T.text3, paddingVertical: 14 }}>이 그룹에 해당하는 검사 항목이 없습니다.</Text>
                    ) : (
                      groupMetrics.map((metric, i) => (
                        <View
                          key={metric.key}
                          style={[{ paddingVertical: 14 }, i < groupMetrics.length - 1 && { borderBottomWidth: 1, borderBottomColor: T.divider }]}
                        >
                          <CompareRow metric={metric} value={report.values[metric.key]} />
                        </View>
                      ))
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </View>
      </FadeIn>
      </FadeInUp>

      {/* ③ 신장 기능(eGFR) — 그 해 혈청 크레아티닌이 실제로 측정된 경우에만 백엔드 계산 결과를 보여준다 */}
      {egfr && (
        <FadeInUp delay={180}>
        <View style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20, marginBottom: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: T.text1, marginBottom: 4 }}>신장 기능 (eGFR)</Text>
          <Text style={{ fontSize: 13, color: T.text2, marginBottom: 14 }}>혈청 크레아티닌 수치를 바탕으로 추정한 신장 여과 기능이에요.</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
            <Text style={{ fontSize: 28, fontWeight: '800', color: T.text1 }}>{egfr.egfr}</Text>
            <Text style={{ fontSize: 13, color: T.text3 }}>{egfr.unit}</Text>
            <View style={{ marginLeft: 6, backgroundColor: egfr.severity === 'normal' ? T.successBg : egfr.severity === 'high' ? T.dangerBg : T.warnBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: T.radiusPill }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: egfr.severity === 'normal' ? T.success : egfr.severity === 'high' ? T.danger : T.warn }}>{egfr.stage} · {egfr.label}</Text>
            </View>
          </View>
          <Text style={{ fontSize: 13, color: T.text2, lineHeight: 20 }}>{egfr.description}</Text>
        </View>
        </FadeInUp>
      )}

      {/* ④ 개인화 권장사항 — 백엔드가 그 해 분석 결과를 바탕으로 실제로 생성해 보내준 문구만 그대로 보여준다 */}
      {recommendations && (recommendations.priority_messages?.length || recommendations.recommendations) && (
        <FadeInUp delay={220}>
        <View style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20, marginBottom: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: T.text1, marginBottom: 4 }}>맞춤 권장사항</Text>
          <Text style={{ fontSize: 13, color: T.text2, marginBottom: 14 }}>내 검진 결과를 바탕으로 분석 시스템이 안내하는 참고 정보예요.</Text>

          {!!recommendations.priority_messages?.length && (
            <View style={{ gap: 6, marginBottom: 14 }}>
              {recommendations.priority_messages!.map((msg, i) => (
                <Text key={i} style={{ fontSize: 13, color: T.text1, fontWeight: '700', lineHeight: 20 }}>{msg}</Text>
              ))}
            </View>
          )}

          {recommendations.recommendations?.common?.map((c, i) => (
            <View key={`common-${i}`} style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: T.text1, marginBottom: 4 }}>{c.category}</Text>
              {c.items.map((item, j) => (
                <Text key={j} style={{ fontSize: 12, color: T.text2, lineHeight: 19 }}>· {item}</Text>
              ))}
            </View>
          ))}

          {recommendations.recommendations?.metabolic_factors?.map((f, i) => (
            <View key={`mf-${i}`} style={{ marginBottom: 12, borderTopWidth: 1, borderTopColor: T.divider, paddingTop: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: T.text1, marginBottom: 2 }}>{f.title}{f.target ? ` · 목표 ${f.target}` : ''}</Text>
              {f.details.map((d, j) => (
                <Text key={j} style={{ fontSize: 12, color: T.text2, lineHeight: 19 }}>· {d}</Text>
              ))}
              {f.by_medication && f.reason && (
                <Text style={{ fontSize: 11, color: T.text3, marginTop: 4 }}>※ {f.reason}</Text>
              )}
            </View>
          ))}

          {recommendations.recommendations?.group_specific?.map((g, i) => (
            <View key={`gs-${i}`} style={{ marginBottom: 12, borderTopWidth: 1, borderTopColor: T.divider, paddingTop: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: T.text1, marginBottom: 2 }}>{g.title}</Text>
              {g.details.map((d, j) => (
                <Text key={j} style={{ fontSize: 12, color: T.text2, lineHeight: 19 }}>· {d}</Text>
              ))}
            </View>
          ))}

          {!!recommendations.recommendations?.medication_notes?.length && (
            <View style={{ marginBottom: 12, borderTopWidth: 1, borderTopColor: T.divider, paddingTop: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: T.text1, marginBottom: 4 }}>복용 약 관련 안내</Text>
              {recommendations.recommendations!.medication_notes!.map((m, i) => (
                <Text key={i} style={{ fontSize: 12, color: T.text2, lineHeight: 19 }}>· [{m.medication}] {m.note}</Text>
              ))}
            </View>
          )}

          {!!recommendations.recommendations?.elderly_notes?.length && (
            <View style={{ borderTopWidth: 1, borderTopColor: T.divider, paddingTop: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: T.text1, marginBottom: 4 }}>고령 기준 추가 안내</Text>
              {recommendations.recommendations!.elderly_notes!.map((n, i) => (
                <Text key={i} style={{ fontSize: 12, color: T.text2, lineHeight: 19 }}>· {n}</Text>
              ))}
            </View>
          )}

          {recommendations._meta?.disclaimer && (
            <Text style={{ fontSize: 11, color: T.text3, marginTop: 14, lineHeight: 17 }}>{recommendations._meta.disclaimer}</Text>
          )}
        </View>
        </FadeInUp>
      )}
    </ScrollView>
  );
}


function CompareRow({ metric, value }: { metric: MetricDefinition; value: number }) {
  const [showInfo, setShowInfo] = useState(false);
  const mine = value;
  const max = Math.max(mine, metric.normalValue, metric.peerMean ?? 0, 1);
  const statusColor = metric.status === '정상' ? T.success : metric.status === '주의' ? T.warn : T.danger;
  const statusBg = metric.status === '정상' ? T.successBg : metric.status === '주의' ? T.warnBg : T.dangerBg;
  const dir = metricDirection(metric);
  const dirInfo = directionLabel(dir);

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <Pressable onPress={() => setShowInfo((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 10 }}>
          <Text style={{ fontWeight: '700', color: T.text1, fontSize: 15 }}>{metric.name}</Text>
          <Ionicons name={showInfo ? 'chevron-up' : 'information-circle-outline'} size={15} color={T.text3} />
        </Pressable>
        <View style={{ backgroundColor: statusBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: T.radiusPill }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: statusColor }}>{metric.status}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 }}>
        <Text style={{ fontSize: 11, color: T.primaryDark, fontWeight: '600' }}>{dirInfo.icon} {dirInfo.text}</Text>
      </View>
      {/* 또래 비교(백분위) · 약물 복용 중 · 고령 주의 — 실제 분석 데이터에 있을 때만 표시한다(추정해서 만들어 보여주지 않음) */}
      {(metric.percentile != null || metric.onMedication || metric.isElderlyWarning) && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12, marginTop: -6 }}>
          {metric.percentile != null && (
            <View style={{ backgroundColor: T.cardAlt, paddingHorizontal: 8, paddingVertical: 3, borderRadius: T.radiusPill }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: T.text2 }}>또래 중 상위 {Math.round(metric.percentile)}%</Text>
            </View>
          )}
          {metric.onMedication && (
            <View style={{ backgroundColor: T.primaryLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: T.radiusPill }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: T.primaryDark }}>약으로 관리 중인 항목</Text>
            </View>
          )}
          {metric.isElderlyWarning && (
            <View style={{ backgroundColor: T.dangerBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: T.radiusPill }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: T.danger }}>고령 기준 추가 주의</Text>
            </View>
          )}
        </View>
      )}
      {showInfo && (
        <Text style={{ fontSize: 12, color: T.text2, lineHeight: 18, marginBottom: 12, marginTop: -6 }}>{metric.description}  {metric.note}</Text>
      )}
      <DirectionalBar
        myValue={mine}
        normalValue={metric.normalValue}
        peerMean={metric.peerMean}
        max={max}
        color={statusColor}
        valueText={`내 ${mine}${metric.unit} · 기준 ${metric.normalText}`}
        direction={dir}
      />
    </>
  );
}
