import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { categoryVisual, SquircleIcon } from '../components/v2';
import { Eyebrow, FadeIn, FadeInUp, StatusBadge, T } from '../components/UI';
import { medicationDosageText, medicationPeriodText, medicationTemplate, metricsForReport } from '../data';
import type { MedicationItem, MetricDefinition, MetricKey, Report, Status } from '../data';
import { deleteReport } from '../health';
import { sortByAttention, statusCounts } from '../interpret';

export default function RecordsScreen({ reports, metricDefinitions, usingRealData, userId, onDeleted, medications, onOpenDetail }: {
  reports: Report[];
  metricDefinitions: MetricDefinition[];
  usingRealData?: boolean;
  userId?: string;
  onDeleted?: (year: number) => void;
  // 실제 저장된 복약 정보 — 있으면 이걸, 없으면(데모/프리뷰) 예시 템플릿을 보여준다.
  medications?: MedicationItem[];
  // 항목을 탭하면 그 항목의 상세(L2/L3)로 이동한다.
  onOpenDetail?: (key: MetricKey, year: number) => void;
}) {
  const [selectedYear, setSelectedYear] = useState<number>(reports[reports.length - 1].year);
  // 검사 항목 / 복용약 — 같은 연도 기록 안에서 전환해서 볼 수 있게 한다.
  const [view, setView] = useState<'metrics' | 'medications'>('metrics');
  const [filter, setFilter] = useState<Status | null>(null);

  const detailReport = reports.find((r) => r.year === selectedYear) ?? reports[reports.length - 1];
  // 그 해 검진의 실제 상태(statusByKey)를 그대로 반영한 항목 목록 — 점수와 항상 일치한다.
  const yearMetrics = useMemo(() => metricsForReport(detailReport, metricDefinitions), [detailReport, metricDefinitions]);
  const counts = statusCounts(yearMetrics);
  const rows = sortByAttention(yearMetrics).filter((m) => (filter ? m.status === filter : true));

  const confirmDelete = () => {
    const year = detailReport.year;
    Alert.alert(
      '기록 삭제',
      `${year}년 검진 기록을 삭제할까요?\n삭제하면 복구할 수 없습니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteReport(userId!, year);
              if (year === selectedYear && reports.length > 1) {
                const others = reports.filter((r) => r.year !== year);
                setSelectedYear(others[0].year);
              }
              onDeleted?.(year);
            } catch (e) {
              Alert.alert('오류', '기록 삭제에 실패했습니다. 다시 시도해주세요.');
            }
          },
        },
      ],
    );
  };

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
        <Eyebrow>METRICS</Eyebrow>
        <Text style={{ fontSize: 26, fontWeight: '800', fontFamily: T.fontDisplay, color: T.text1, letterSpacing: -0.5, marginTop: 6 }}>검사항목</Text>
        <Text style={{ fontSize: 13, color: T.text3, lineHeight: 19, marginTop: 6 }}>연도를 고르고 항목을 누르면 자세한 설명을 볼 수 있어요.</Text>
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
        /* 검사 항목을 볼 때만 연도 선택기를 보여준다 — 복용약 정보는 연도 구분 없이 현재 복용 중인 약 전체이므로 필요 없다 */
        <FadeInUp delay={140}>
        <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {[...reports].reverse().map((r) => {
              const active = r.year === selectedYear;
              return (
                <Pressable key={r.year} onPress={() => setSelectedYear(r.year)}
                  style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: T.radiusPill, backgroundColor: active ? T.primary : T.white }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: active ? '#fff' : T.text2 }}>{r.year}년</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {/* 선택 연도 메타 + 삭제(기능 보존) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 }}>
            <Text style={{ flex: 1, fontSize: 13, color: T.text3 }}>{detailReport.date} · {detailReport.hospital} · {detailReport.score}점</Text>
            {usingRealData && !!userId && (
              <Pressable hitSlop={8} onPress={confirmDelete}>
                <Ionicons name="trash-outline" size={17} color={T.text3} />
              </Pressable>
            )}
          </View>
        </View>
        </FadeInUp>
      )}

      {view === 'metrics' && (
        <View style={{ flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 12 }}>
          {([['전체', null], [`정상 ${counts.정상}`, '정상'], [`주의 ${counts.주의}`, '주의'], [`위험 ${counts.위험}`, '위험']] as const).map(([label, val]) => {
            const active = filter === val;
            return (
              <Pressable key={label} onPress={() => setFilter(val as Status | null)}
                style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: T.radiusPill, backgroundColor: active ? T.primary : T.white }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : T.text2 }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {view === 'metrics' ? (
        /* 상세 항목 — 선택한 연도의 statusByKey를 그대로 반영해, 위 점수와 항상 일치한다.
           연도를 바꾸면 살짝 페이드되며 갱신되어 변화가 자연스럽게 보인다 */
        <FadeIn key={`metrics-${detailReport.year}`}>
        <View style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, marginBottom: 12 }}>
          {rows.map((metric, i) => {
            const visual = categoryVisual(metric.category);
            const { color } = getStatusStyle(metric.status);
            return (
              <Pressable key={metric.key} onPress={() => onOpenDetail?.(metric.key, selectedYear)}
                style={[{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
                        i < rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: T.divider }]}>
                <SquircleIcon icon={visual.icon} color={visual.color} bg={visual.bg} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: T.text1 }}>{metric.name}</Text>
                  <Text style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>{metric.category}</Text>
                </View>
                <Text style={{ fontSize: 16, fontWeight: '700', color }}>{detailReport.values[metric.key]}<Text style={{ fontSize: 12, fontWeight: '500', color: T.text3 }}>{metric.unit}</Text></Text>
                <StatusBadge status={metric.status} />
                <Ionicons name="chevron-forward" size={16} color={T.text3} />
              </Pressable>
            );
          })}
          {rows.length === 0 && <Text style={{ fontSize: 13, color: T.text3, textAlign: 'center', paddingVertical: 24 }}>해당 상태의 항목이 없어요.</Text>}
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
