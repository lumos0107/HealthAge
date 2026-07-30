import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { categoryVisual, SquircleIcon } from '../components/v2';
import { Eyebrow, FadeIn, FadeInUp, StatusBadge, T } from '../components/UI';
import { medicationDosageText, medicationPeriodText, medicationTemplate, metricGloss, metricsForReport } from '../data';
import type { MedicationItem, MetricDefinition, MetricKey, Report } from '../data';
import { deleteReport } from '../health';
import { formatMetricValue, sortByAttention, statusCounts } from '../interpret';
import { exportReportPdf } from '../reportExport';

export default function RecordsScreen({ reports, metricDefinitions, usingRealData, userId, userName, onDeleted, medications, onOpenDetail }: {
  reports: Report[];
  metricDefinitions: MetricDefinition[];
  usingRealData?: boolean;
  userId?: string;
  /** PDF 표지에 넣을 이름. 없으면 이름 없이 만든다(내보내기 자체는 막지 않는다). */
  userName?: string;
  onDeleted?: (year: number) => void;
  // 실제 저장된 복약 정보 — 있으면 이걸, 없으면(데모/프리뷰) 예시 템플릿을 보여준다.
  medications?: MedicationItem[];
  // 항목을 탭하면 그 항목의 상세(L2/L3)로 이동한다.
  onOpenDetail?: (key: MetricKey, year: number) => void;
}) {
  const [selectedYear, setSelectedYear] = useState<number>(reports[reports.length - 1].year);
  // 검사 항목 / 복용약 — 같은 연도 기록 안에서 전환해서 볼 수 있게 한다.
  const [view, setView] = useState<'metrics' | 'medications'>('metrics');

  const detailReport = reports.find((r) => r.year === selectedYear) ?? reports[reports.length - 1];
  // 그 해 검진의 실제 상태(statusByKey)를 그대로 반영한 항목 목록 — 점수와 항상 일치한다.
  const yearMetrics = useMemo(() => metricsForReport(detailReport, metricDefinitions), [detailReport, metricDefinitions]);
  const counts = statusCounts(yearMetrics);
  // 필터 없이 주의 순 정렬만 — 목록이 짧고 이미 심각한 것부터 정렬돼 있어 필터는 과한 도구다.
  const rows = sortByAttention(yearMetrics);

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
                const others = [...reports].reverse().filter((r) => r.year !== year);
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

  // 지금 보고 있는 연도를 그대로 PDF로 — 프로필의 내보내기와 같은 함수를 쓴다(판단 로직 없음).
  // 연도 선택기가 이미 이 화면 위에 있어서, 프로필처럼 연도를 다시 고르게 하지 않는다.
  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await exportReportPdf(detailReport, yearMetrics, userName ?? '');
    } catch (e) {
      Alert.alert('내보내기 실패', e instanceof Error ? e.message : 'PDF를 만들지 못했습니다.');
    } finally {
      setExporting(false);
    }
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
        </View>
        </FadeInUp>
      )}

      {view === 'metrics' ? (
        /* 상세 항목 — 선택한 연도의 statusByKey를 그대로 반영해, 위 점수와 항상 일치한다.
           연도를 바꾸면 살짝 페이드되며 갱신되어 변화가 자연스럽게 보인다 */
        <FadeIn key={`metrics-${detailReport.year}`}>
        <View style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, marginBottom: 12 }}>
          {/* 카드 헤더 — 이 카드가 어느 검진인지(연도·병원, 월일 생략)와 상태 요약. 배경 위에 띄우지 않고 결과 카드에 소속시킨다. */}
          <View style={{ paddingTop: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: T.divider }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ flex: 1, fontSize: 18, fontWeight: '800', color: T.text1 }}>
                {detailReport.year}년 · {detailReport.hospital}
              </Text>
              {/* 이 검진을 PDF로 — 병원 지참·가족 공유용. 아이콘만 두면 무슨 기능인지 모호해서
                  'PDF' 글자를 함께 둔다. 데모 계정도 눌러볼 수 있게 usingRealData로 막지 않는다. */}
              <Pressable
                hitSlop={8}
                onPress={handleExport}
                disabled={exporting}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 3, opacity: exporting ? 0.4 : 1 }}
              >
                <Ionicons name="document-text-outline" size={16} color={T.text3} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: T.text3 }}>PDF</Text>
              </Pressable>
              {usingRealData && !!userId && (
                <Pressable hitSlop={8} onPress={confirmDelete}>
                  <Ionicons name="trash-outline" size={17} color={T.text3} />
                </Pressable>
              )}
            </View>
            <View style={{ flexDirection: 'row', gap: 14, marginTop: 10 }}>
              {([['정상', counts.정상, T.success], ['주의', counts.주의, T.warn], ['위험', counts.위험, T.danger]] as const).map(([label, n, color]) => (
                <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: color }} />
                  <Text style={{ fontSize: 13, color: T.text2 }}>{label} <Text style={{ fontWeight: '700', color: T.text1 }}>{n}</Text></Text>
                </View>
              ))}
            </View>
          </View>
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
                  {/* 이름만으로 모를 항목에만 짧은 뜻풀이. 카테고리는 왼쪽 아이콘 색이 이미 말해주고,
                      상태는 오른쪽 값·배지가 말해주므로 여기서 반복하지 않는다. 자세한 정의는 2뎁스. */}
                  {!!metricGloss[metric.key] && (
                    <Text style={{ fontSize: 12, color: T.text3, marginTop: 2 }} numberOfLines={1}>
                      {metricGloss[metric.key]}
                    </Text>
                  )}
                </View>
                <Text style={{ fontSize: 16, fontWeight: '700', color: metric.infoOnly ? T.text1 : color }}>{formatMetricValue(metric, detailReport.values[metric.key])}{metric.unit ? <Text style={{ fontSize: 12, fontWeight: '500', color: T.text3 }}>{metric.unit}</Text> : null}</Text>
                {metric.infoOnly ? (
                  <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: T.radiusPill, backgroundColor: T.cardAlt }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: T.text3 }}>참고</Text>
                  </View>
                ) : (
                  <StatusBadge status={metric.status} />
                )}
                <Ionicons name="chevron-forward" size={16} color={T.text3} />
              </Pressable>
            );
          })}
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
