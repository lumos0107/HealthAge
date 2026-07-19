import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Collapsible, Eyebrow, FadeIn, FadeInUp, T } from '../components/UI';
import { medicationDosageText, medicationPeriodText, medicationTemplate, metricsForReport } from '../data';
import type { MedicationItem, MetricDefinition, Report } from '../data';
import { deleteReport } from '../health';

export default function RecordsScreen({ reports, metricDefinitions, usingRealData, userId, onDeleted, medications }: {
  reports: Report[];
  metricDefinitions: MetricDefinition[];
  usingRealData?: boolean;
  userId?: string;
  onDeleted?: (year: number) => void;
  // 실제 저장된 복약 정보 — 있으면 이걸, 없으면(데모/프리뷰) 예시 템플릿을 보여준다.
  medications?: MedicationItem[];
}) {
  const [selectedYear, setSelectedYear] = useState<number>(reports[reports.length - 1].year);
  // 검사 항목 / 복용약 — 같은 연도 기록 안에서 전환해서 볼 수 있게 한다.
  const [view, setView] = useState<'metrics' | 'medications'>('metrics');

  const detailReport = reports.find((r) => r.year === selectedYear) ?? reports[reports.length - 1];
  // 그 해 검진의 실제 상태(statusByKey)를 그대로 반영한 항목 목록 — 점수와 항상 일치한다.
  const yearMetrics = useMemo(() => metricsForReport(detailReport, metricDefinitions), [detailReport, metricDefinitions]);
  // 실제 사용자면 저장된 복약 정보를, 아니면(데모/프리뷰) 예시 템플릿을 효능군별로 묶는다.
  const medSource = usingRealData ? (medications ?? []) : medicationTemplate;
  const medGroups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, MedicationItem[]>();
    for (const item of medSource) {
      const category = item.efficacy_class || '기타';
      if (!map.has(category)) { map.set(category, []); order.push(category); }
      map.get(category)!.push(item);
    }
    return order.map((category) => ({ category, items: map.get(category)! }));
  }, [medSource]);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false} style={{ backgroundColor: T.bg }}>

      {/* 페이지 헤더 — 화면에 들어오면 살짝 떠오르며 나타난다 */}
      <FadeInUp delay={0}>
      <View style={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 14 }}>
        <Eyebrow>RECORDS</Eyebrow>
        <Text style={{ fontSize: 34, fontWeight: '800', fontFamily: T.fontDisplay, color: T.text1, letterSpacing: -0.5, marginTop: 6 }}>검진·복약 기록</Text>
        <Text style={{ fontSize: 13, color: T.text3, lineHeight: 19, marginTop: 6 }}>연도별 건강검진 결과와 복용 중인 약 정보를 확인합니다.</Text>
      </View>
      </FadeInUp>

      {/* 무엇을 볼지 먼저 선택 — 검사 항목(연도별) vs 복용약 정보(연도와 무관, 현재 복용 중인 약 전체).
          목록보다 위에 둬서 "복용약 정보가 연도별 자료"라는 오해가 생기지 않도록 한다. */}
      <FadeInUp delay={70}>
      <View style={{ flexDirection: 'row', marginHorizontal: 16, marginBottom: 8, backgroundColor: T.white, borderRadius: T.radiusPill, padding: 4, gap: 4 }}>
        {([
          { key: 'metrics' as const, label: '검사 항목', icon: 'document-text-outline' as const },
          { key: 'medications' as const, label: '복용약 정보', icon: 'medkit-outline' as const },
        ]).map((tab) => {
          const active = view === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setView(tab.key)}
              style={{
                flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                paddingVertical: 11, borderRadius: T.radiusPill,
                backgroundColor: active ? T.primary : 'transparent',
              }}
            >
              <Ionicons name={tab.icon} size={15} color={active ? '#fff' : T.text3} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: active ? '#fff' : T.text3 }}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
      </FadeInUp>

      {view === 'metrics' && (
        /* 검사 항목을 볼 때만 연도 목록을 보여준다 — 복용약 정보는 연도 구분 없이 현재 복용 중인 약 전체이므로 목록이 필요 없다 */
        <FadeInUp delay={140}>
        <View style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8, marginBottom: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: T.text1, marginBottom: 4 }}>검진기록 목록</Text>
          <Text style={{ fontSize: 12, color: T.text3, marginBottom: 12 }}>연도를 누르면 아래에서 상세 항목을 볼 수 있어요.</Text>
          {[...reports].reverse().map((report, i, arr) => (
            <ReportRow
              key={report.year}
              report={report}
              last={i === arr.length - 1}
              selected={report.year === selectedYear}
              onPress={() => setSelectedYear(report.year)}
              canDelete={usingRealData && !!userId}
              onDelete={() => {
                Alert.alert(
                  '기록 삭제',
                  `${report.year}년 검진 기록을 삭제할까요?\n삭제하면 복구할 수 없습니다.`,
                  [
                    { text: '취소', style: 'cancel' },
                    {
                      text: '삭제',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          await deleteReport(userId!, report.year);
                          if (report.year === selectedYear && arr.length > 1) {
                            const others = arr.filter((r) => r.year !== report.year);
                            setSelectedYear(others[0].year);
                          }
                          onDeleted?.(report.year);
                        } catch (e) {
                          Alert.alert('오류', '기록 삭제에 실패했습니다. 다시 시도해주세요.');
                        }
                      },
                    },
                  ],
                );
              }}
            />
          ))}
        </View>
        </FadeInUp>
      )}

      {view === 'metrics' ? (
        /* 상세 항목 — 선택한 연도의 statusByKey를 그대로 반영해, 위 점수와 항상 일치한다.
           연도를 바꾸면 살짝 페이드되며 갱신되어 변화가 자연스럽게 보인다 */
        <FadeIn key={`metrics-${detailReport.year}`}>
        <View style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20 }}>
          <Collapsible
            title={`${detailReport.year}년 상세 항목`}
            badge={detailReport.year === reports[reports.length - 1].year ? '최근 검진' : undefined}
            defaultOpen
          >
          {yearMetrics.map((metric, i) => {
            const value = detailReport.values[metric.key];
            const isLast = i === yearMetrics.length - 1;
            const { color: statusColor, bg: statusBg } = getStatusStyle(metric.status);
            return (
              <View
                key={metric.key}
                style={[{ paddingVertical: 15 }, !isLast && { borderBottomWidth: 1, borderBottomColor: T.divider }]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: T.text1 }}>{metric.name}</Text>
                    <Text style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>{metric.category}</Text>
                  </View>
                  <View style={{ backgroundColor: statusBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: T.radiusPill }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: statusColor }}>{metric.status}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 20 }}>
                  <MetaItem label="내 수치" value={`${value}${metric.unit}`} highlight color={statusColor} />
                  <MetaItem label="정상 기준" value={metric.normalText} />
                  <MetaItem label="연령대 평균" value={metric.peerMean != null ? `${metric.peerMean}${metric.unit}` : '—'} />
                </View>
              </View>
            );
          })}
          </Collapsible>
        </View>
        </FadeIn>
      ) : (
        /* 복용약 정보 — 효능군(고혈압약/당뇨약 등)별로 묶어 한눈에 볼 수 있게, 업로드 화면과 같은 방식으로 표시.
           탭을 바꾸면 살짝 페이드되며 나타난다 */
        <FadeIn key="medications">
        {usingRealData && medGroups.length === 0 ? (
          /* 실제 사용자인데 저장된 복약 정보가 없을 때 — 더미 대신 업로드를 안내한다. */
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingTop: 60 }}>
            <View style={{ width: 60, height: 60, borderRadius: 18, backgroundColor: T.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Ionicons name="medkit-outline" size={26} color={T.primary} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '700', color: T.text1, marginBottom: 6, textAlign: 'center' }}>등록된 복약 정보가 없어요</Text>
            <Text style={{ fontSize: 13, color: T.text3, textAlign: 'center', lineHeight: 20 }}>
              업로드 화면의 "처방전·복약자료" 탭에서{'\n'}"내가 먹는 약! 한눈에" 엑셀 파일을 올리면{'\n'}복용 중인 약이 여기에 정리돼요.
            </Text>
          </View>
        ) : (
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginHorizontal: 16, paddingVertical: 12, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: T.divider }}>
            <Text style={{ fontSize: 13, color: T.primary, fontWeight: '700' }}>!</Text>
            <Text style={{ flex: 1, fontSize: 13, color: T.text2, lineHeight: 20 }}>
              {usingRealData
                ? '"내가 먹는 약! 한눈에" 자료를 효능군별로 정리했어요. 검사 수치가 약 복용의 영향을 받을 수 있으니 함께 확인해보세요.'
                : '예시 복약 정보입니다. "내가 먹는 약! 한눈에" 자료를 올리면 본인의 복약 정보가 효능군별로 정리돼요.'}
            </Text>
          </View>
          {medGroups.map(({ category, items }) => (
            <View key={category} style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 6, marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <View style={{ backgroundColor: T.primaryLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: T.radiusPill }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: T.primary }}>{category}</Text>
                </View>
                <Text style={{ fontSize: 12, color: T.text3 }}>{items.length}개</Text>
              </View>
              {items.map((item, i) => (
                <View key={`${item.drug_code ?? item.product_name}-${item.dispensed_date}`} style={[{ paddingBottom: 14 }, i < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: T.divider, marginBottom: 14 }]}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: T.text1, marginBottom: 4 }}>{item.product_name}</Text>
                  <Text style={{ fontSize: 12, color: T.text3, marginBottom: 6 }}>성분: {item.ingredient_en}</Text>
                  <Text style={{ fontSize: 13, color: T.text2, lineHeight: 19 }}>{medicationDosageText(item)}</Text>
                  <Text style={{ fontSize: 12, color: T.text3, marginTop: 3 }}>복용 기간: {medicationPeriodText(item)}</Text>
                  {item.safety_alert ? (
                    <Text style={{ fontSize: 12, color: T.danger, marginTop: 3 }}>⚠ {item.safety_alert}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          ))}
        </View>
        )}
        </FadeIn>
      )}

    </ScrollView>
  );
}

function getStatusStyle(status: string) {
  if (status === '정상') return { color: T.success, bg: T.successBg };
  if (status === '주의') return { color: T.warn, bg: T.warnBg };
  return { color: T.danger, bg: T.dangerBg };
}

function ReportRow({ report, last, selected, onPress, canDelete, onDelete }: {
  report: Report;
  last: boolean;
  selected?: boolean;
  onPress?: () => void;
  canDelete?: boolean;
  onDelete?: () => void;
}) {
  const scoreColor = report.score >= 70 ? T.success : report.score >= 40 ? T.warn : T.danger;
  const { color: statusColor, bg: statusBg } = getStatusStyle(report.status);
  return (
    <Pressable
      onPress={onPress}
      style={[
        { paddingVertical: 15, paddingHorizontal: 10, marginHorizontal: -10, borderRadius: T.radiusSm, flexDirection: 'row', alignItems: 'center', gap: 14 },
        selected && { backgroundColor: T.primaryLight },
        !last && { borderBottomWidth: 1, borderBottomColor: T.divider },
      ]}
    >
      <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: selected ? T.primary : T.primaryLight, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: selected ? '#fff' : T.primary }}>{report.year}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: T.text1, marginBottom: 2 }}>{report.hospital}</Text>
        <Text style={{ fontSize: 12, color: T.text3, marginBottom: 4 }}>{report.date}</Text>
        <View style={{ backgroundColor: statusBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: T.radiusPill, alignSelf: 'flex-start' }}>
          <Text style={{ fontSize: 10, fontWeight: '600', color: statusColor }}>{report.status}</Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ fontSize: 22, fontWeight: '700', color: scoreColor }}>{report.score}</Text>
        <Text style={{ fontSize: 10, color: T.text3 }}>/ 100점</Text>
      </View>
      <Ionicons name={selected ? 'chevron-up-circle' : 'chevron-down-circle-outline'} size={20} color={selected ? T.primary : T.text3} />
      {canDelete && (
        <Pressable
          onPress={(e) => { e.stopPropagation?.(); onDelete?.(); }}
          hitSlop={8}
          style={{ padding: 4 }}
        >
          <Ionicons name="trash-outline" size={18} color={T.danger} />
        </Pressable>
      )}
    </Pressable>
  );
}

function MetaItem({ label, value, highlight, color }: { label: string; value: string; highlight?: boolean; color?: string }) {
  return (
    <View>
      <Text style={{ fontSize: 11, color: T.text3, fontWeight: '500', marginBottom: 3 }}>{label}</Text>
      <Text style={{ fontSize: 14, color: highlight ? (color ?? T.text1) : T.text2, fontWeight: highlight ? '700' : '500' }}>{value}</Text>
    </View>
  );
}
