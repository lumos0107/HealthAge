import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { categoryVisual, MiniRangeBar, SquircleIcon } from '../components/v2';
import { Eyebrow, FadeIn, FadeInUp, StatusBadge, T } from '../components/UI';
import { medicationDosageText, medicationPeriodText, medicationTemplate, metricGloss, metricsForReport } from '../data';
import type { MedicationItem, MetricDefinition, MetricKey, Report } from '../data';
import { deleteReport } from '../health';
import { formatMetricValue, sortByAttention, statusCounts } from '../interpret';
import { exportReportPdf } from '../reportExport';
import type { PdfExtras } from '../reportExport';
import { useGridCell, useLayout } from '../responsive';

export default function RecordsScreen({ reports, metricDefinitions, usingRealData, userId, userName, onDeleted, medications, onOpenDetail, onUpload, pdfExtras }: {
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
  // 복약자료 올리기 카드(태블릿)에서 업로드 탭으로 간다.
  onUpload?: () => void;
  // PDF 2·3쪽(히스토리·분석)용 자료 — 없으면 검사항목 1쪽만(design-d).
  pdfExtras?: PdfExtras | null;
}) {
  const { isTablet, itemCols, isLandscape } = useLayout();
  // 약 카드 격자 칸 폭 — calc()는 APK에서 칸이 접혀서 잰 값으로(useGridCell, 시안대로 2열).
  const medGrid = useGridCell(2);
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
      await exportReportPdf(detailReport, metricDefinitions, userName ?? '', pdfExtras);
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

  // ── 태블릿: 제목 → 선택 막대 → (연도 칩 → 상태 칩 → 항목 카드 격자) 또는 (복약 카드 2열 → 올리기 카드)
  if (isTablet) {
    const statusChips = ([['정상', counts.정상, T.success, T.successBg, '■'], ['주의', counts.주의, T.warn, T.warnBg, '●'], ['위험', counts.위험, T.danger, T.dangerBg, '▲']] as const);
    // 열 우선 정렬 — 먼저 확인할 위험·주의가 왼쪽 열에 모이도록 위에서 아래로 채운다.
    const perCol = Math.ceil(rows.length / itemCols);
    const columns = Array.from({ length: itemCols }, (_, c) => rows.slice(c * perCol, (c + 1) * perCol));
    // 태블릿 시안은 세로·가로 모두 효능군 카드를 2열로 배치한다.
    const medCols = 2;
    const medFlat = medGroups.flatMap(({ category, items }) => items.map((item) => ({ category, count: items.length, item })));

    return (
      <ScrollView contentContainerStyle={{ paddingHorizontal: 28, paddingTop: 28, paddingBottom: 40, gap: 12 }} showsVerticalScrollIndicator={false} style={{ backgroundColor: T.bg, ...({ wordBreak: 'keep-all' } as any) }}>
        {/* 오른쪽 위 내 정보 버튼(App) 자리를 비운다 */}
        <View style={{ paddingRight: 64 }}>
          <Text style={{ fontSize: T.fs.title, fontWeight: '800', color: T.text1, lineHeight: 32 }}>검사항목</Text>
          <Text style={{ fontSize: T.fs.body, color: T.text2, marginTop: 2 }}>연도를 고르고 항목을 누르면 자세한 설명을 볼 수 있어요.</Text>
        </View>

        {/* 검사 항목 | 복용약 정보 — 연도와 무관한 복용약을 같은 선에 두지 않도록 맨 위에서 먼저 고른다. */}
        <View style={{ flexDirection: 'row', backgroundColor: T.white, borderRadius: 16, padding: 4, gap: 4 }}>
          {([
            { key: 'metrics' as const, label: '검사 항목', icon: 'document-text-outline' as const },
            { key: 'medications' as const, label: '복용약 정보', icon: 'medkit-outline' as const },
          ]).map((tab) => {
            const active = view === tab.key;
            return (
              <Pressable key={tab.key} onPress={() => setView(tab.key)} accessibilityRole="button" accessibilityState={{ selected: active }}
                style={{ flex: 1, minHeight: 48, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: active ? T.primary : 'transparent' }}>
                <Ionicons name={tab.icon} size={20} color={active ? T.onPrimary : T.text2} />
                <Text style={{ fontSize: T.fs.strong, fontWeight: '700', color: active ? T.onPrimary : T.text2 }}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {view === 'metrics' ? (
          <FadeIn key={`tab-metrics-${detailReport.year}`}>
            {/* 연도 칩 */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
              {[...reports].reverse().map((r) => {
                const active = r.year === selectedYear;
                return (
                  <Pressable key={r.year} onPress={() => setSelectedYear(r.year)} accessibilityRole="button" accessibilityState={{ selected: active }}
                    style={{ minHeight: 48, paddingHorizontal: 18, borderRadius: T.radiusPill, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? T.text1 : T.white }}>
                    <Text style={{ fontSize: T.fs.caption, fontWeight: active ? '700' : '500', color: active ? '#fff' : T.text1 }}>{r.year}년</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* 정상·주의·위험 칩 — 색 + 모양 + 글자 */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              {statusChips.map(([label, n, color, bg, mark]) => (
                <View key={label} style={{ minHeight: 48, paddingHorizontal: 18, borderRadius: T.radiusPill, backgroundColor: bg, flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color }}>{mark} {label} {n}</Text>
                </View>
              ))}
            </View>

            {/* 제목 줄 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, paddingHorizontal: 4 }}>
              <Text style={{ flex: 1, fontSize: T.fs.h3, fontWeight: '800', color: T.text1 }}>{detailReport.year}년 · {detailReport.hospital}</Text>
              <Pressable onPress={handleExport} disabled={exporting} accessibilityRole="button" accessibilityLabel="PDF로 내보내기"
                style={{ minHeight: 48, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4, opacity: exporting ? 0.4 : 1 }}>
                <Ionicons name="document-text-outline" size={18} color={T.text2} />
                <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text2 }}>PDF</Text>
              </Pressable>
              {usingRealData && !!userId && (
                <Pressable onPress={confirmDelete} accessibilityRole="button" accessibilityLabel="이 연도 기록 삭제" style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="trash-outline" size={20} color={T.text2} />
                </Pressable>
              )}
              <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.primaryText }}>항목을 눌러 자세히 보기</Text>
            </View>
            <Text style={{ fontSize: T.fs.caption, color: T.text2, paddingHorizontal: 4, marginTop: 2, marginBottom: 10 }}>먼저 확인하면 좋은 순서로 정렬했어요.</Text>

            {/* 항목마다 개별 카드 버튼 — 열 우선 정렬 */}
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              {columns.map((col, ci) => (
                <View key={ci} style={{ flex: 1, minWidth: 0, gap: 10 }}>
                  {col.map((metric) => {
                    const visual = categoryVisual(metric.category);
                    const { color } = getStatusStyle(metric.status);
                    return (
                      // 위아래 두 줄 카드(design-d 1안) — 한 줄에 아이콘·이름·수치+배지·화살표를 다 넣으면
                      // 이름 칸이 80~100px만 남아 「체질량지수 (BMI)」「혈청 크레아티닌」이 두 줄로 꺾였다.
                      // 윗줄: 아이콘·이름·상태 배지·화살표 / 아랫줄: 수치(오른쪽, 예전 배지 자리).
                      <Pressable key={metric.key} onPress={() => onOpenDetail?.(metric.key, selectedYear)} accessibilityRole="button" accessibilityLabel={`${metric.name} 자세히 보기`}
                        style={{ gap: 8, paddingTop: 12, paddingBottom: 12, paddingLeft: 14, paddingRight: 12, borderRadius: 16, backgroundColor: T.white }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <SquircleIcon icon={visual.icon} color={visual.color} bg={visual.bg} />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text numberOfLines={2} style={{ fontSize: T.fs.body, fontWeight: '700', color: T.text1, lineHeight: 22, ...({ wordBreak: 'keep-all' } as any) }}>{metric.name}</Text>
                            {!!metricGloss[metric.key] && (
                              <Text style={{ fontSize: T.fs.caption, color: T.text2 }} numberOfLines={2}>{metricGloss[metric.key]}</Text>
                            )}
                          </View>
                          {metric.infoOnly ? (
                            <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: T.radiusPill, backgroundColor: T.cardAlt }}>
                              <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text2 }}>○ 참고</Text>
                            </View>
                          ) : <StatusBadge status={metric.status} />}
                          <Ionicons name="chevron-forward" size={20} color={T.text3} />
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingTop: 8, borderTopWidth: 1, borderTopColor: T.divider }}>
                          {/* 아랫줄 왼쪽 = 기준 막대(design-d C안, 글자 없이 막대만). 숫자 기준이 없는 항목은 짧은 안내로 대신한다. */}
                          {(() => {
                            const v = detailReport.values[metric.key];
                            const numericRange = /\d/.test(metric.normalText ?? '');
                            if (!metric.infoOnly && typeof v === 'number' && numericRange) return <MiniRangeBar metric={metric} value={v} />;
                            const note = metric.infoOnly ? '판정 없는 참고값'
                              : metric.normalText === '기관 기준 확인' ? '기준은 기관마다 달라요'
                              : `정상 ${metric.normalText}`;
                            return <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: T.fs.caption, color: T.text2 }}>{note}</Text>;
                          })()}
                          <Text style={{ fontSize: T.fs.h3, fontWeight: '800', color: metric.infoOnly ? T.text1 : color }}>
                            {formatMetricValue(metric, detailReport.values[metric.key])}
                            {metric.unit ? <Text style={{ fontSize: T.fs.caption, fontWeight: '500', color: T.text2 }}> {metric.unit}</Text> : null}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          </FadeIn>
        ) : (
          <FadeIn key="tab-medications">
            {usingRealData && medGroups.length === 0 ? (
              <View style={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 40, backgroundColor: T.white, borderRadius: T.radius }}>
                <View style={{ width: 60, height: 60, borderRadius: 18, backgroundColor: T.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  <Ionicons name="medkit-outline" size={26} color={T.primary} />
                </View>
                <Text style={{ fontSize: T.fs.strong, fontWeight: '700', color: T.text1, marginBottom: 6, textAlign: 'center' }}>등록된 복약 정보가 없어요</Text>
                <Text style={{ fontSize: T.fs.body, color: T.text2, textAlign: 'center', lineHeight: 24, marginBottom: 16 }}>
                  "내가 먹는 약! 한눈에" 엑셀 파일을 올리면{'\n'}복용 중인 약이 여기에 정리돼요.
                </Text>
                {!!onUpload && (
                  <Pressable onPress={onUpload} accessibilityRole="button" style={{ minHeight: 48, paddingHorizontal: 20, borderRadius: T.radiusMd, backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: T.fs.strong, fontWeight: '700', color: T.onPrimary }}>복약자료 올리기</Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                {/* 안내 배너 */}
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16, paddingHorizontal: 20, borderRadius: T.radius, backgroundColor: T.primaryLight }}>
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: T.primaryText, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: T.fs.body, fontWeight: '800', color: '#fff' }}>!</Text>
                  </View>
                  <Text style={{ flex: 1, fontSize: T.fs.body, color: T.text1, lineHeight: 24 }}>
                    {usingRealData
                      ? '"내가 먹는 약! 한눈에" 자료를 효능군별로 정리했어요. 검사 수치가 약 복용의 영향을 받을 수 있으니 함께 확인해보세요.'
                      : '예시 복약 정보입니다. "내가 먹는 약! 한눈에" 자료를 올리면 본인의 복약 정보가 효능군별로 정리돼요.'}
                  </Text>
                </View>
                {/* 약 카드 격자 — 약 하나가 카드 하나 */}
                <View onLayout={medGrid.onLayout} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                  {medFlat.map(({ category, count, item }) => (
                    <View key={`${item.drug_code ?? item.product_name}-${item.dispensed_date}`}
                      style={{ ...medGrid.cell, backgroundColor: T.white, borderRadius: T.radius, padding: 20, gap: 6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ backgroundColor: T.primaryLight, paddingHorizontal: 14, paddingVertical: 6, borderRadius: T.radiusPill }}>
                          <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.primaryText }}>{category}</Text>
                        </View>
                        <Text style={{ fontSize: T.fs.caption, color: T.text2 }}>{count}개</Text>
                      </View>
                      <Text style={{ fontSize: T.fs.h3, fontWeight: '800', color: T.text1, marginTop: 8 }}>{item.product_name}</Text>
                      <Text style={{ fontSize: T.fs.body, color: T.text2 }}>성분: {item.ingredient_en}</Text>
                      <Text style={{ fontSize: T.fs.body, fontWeight: '700', color: T.text1 }}>{medicationDosageText(item)}</Text>
                      <Text style={{ fontSize: T.fs.caption, color: T.text2 }}>복용 기간: {medicationPeriodText(item)}</Text>
                      {item.safety_alert ? <Text style={{ fontSize: T.fs.caption, color: T.danger }}>⚠ {item.safety_alert}</Text> : null}
                    </View>
                  ))}
                </View>
                {/* 복약자료 올리기 카드 — 태블릿 시안에서 새로 넣은 제안 */}
                {!!onUpload && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20, backgroundColor: T.white, borderRadius: T.radius, paddingHorizontal: 24, paddingVertical: 20 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: T.fs.h3, fontWeight: '800', color: T.text1 }}>내 복약 정보를 올려 보세요</Text>
                      <Text style={{ fontSize: T.fs.caption, color: T.text2, marginTop: 4 }}>처방전이나 복약자료를 올리면 내가 먹는 약이 효능군별로 정리돼요.</Text>
                    </View>
                    <Pressable onPress={onUpload} accessibilityRole="button" style={{ minHeight: 48, paddingHorizontal: 20, borderRadius: T.radiusMd, backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: T.fs.strong, fontWeight: '700', color: T.onPrimary }}>복약자료 올리기</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )}
          </FadeIn>
        )}
        <Text style={{ fontSize: T.fs.caption, color: T.text3, textAlign: 'center', marginTop: 4 }}>참고용이에요. 걱정되면 의료진과 상담해 보세요.</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false} style={{ backgroundColor: T.bg }}>

      {/* 페이지 헤더 — 화면에 들어오면 살짝 떠오르며 나타난다 */}
      <FadeInUp delay={0}>
      <View style={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 14 }}>
        <Eyebrow>METRICS</Eyebrow>
        <Text style={{ fontSize: T.fs.title, fontWeight: '800', fontFamily: T.fontDisplay, color: T.text1, letterSpacing: -0.5, marginTop: 6 }}>검사항목</Text>
        <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginTop: 6 }}>연도를 고르고 항목을 누르면 자세한 설명을 볼 수 있어요.</Text>
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
              <Ionicons name={tab.icon} size={15} color={active ? T.onPrimary : T.text3} />
              <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: active ? T.onPrimary : T.text3 }}>{tab.label}</Text>
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
                  <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: active ? T.onPrimary : T.text2 }}>{r.year}년</Text>
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
              <Text style={{ flex: 1, fontSize: T.fs.strong, fontWeight: '800', color: T.text1 }}>
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
                <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.text3 }}>PDF</Text>
              </Pressable>
              {usingRealData && !!userId && (
                <Pressable hitSlop={8} onPress={confirmDelete}>
                  <Ionicons name="trash-outline" size={17} color={T.text3} />
                </Pressable>
              )}
            </View>
            <View style={{ flexDirection: 'row', gap: 14, marginTop: 10 }}>
              {([['정상', counts.정상, T.successFill], ['주의', counts.주의, T.warnFill], ['위험', counts.위험, T.dangerFill]] as const).map(([label, n, color]) => (
                <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: color }} />
                  <Text style={{ fontSize: T.fs.caption, color: T.text2 }}>{label} <Text style={{ fontWeight: '700', color: T.text1 }}>{n}</Text></Text>
                </View>
              ))}
            </View>
            {/* 정렬 기준을 화면이 말한다(§2-1 축 4) — 네 탭 중 여기만 침묵하고 있었다.
                순서가 눈에 보이는 홈 TOP3(「가장 먼저 확인하면 좋은 항목」)와 달리, 목록이
                길어 «왜 이 순서인지»를 스스로 알아내야 했다. */}
            <Text style={{ fontSize: T.fs.caption, color: T.text3, marginTop: 8 }}>먼저 확인하면 좋은 순서로 정렬했어요.</Text>
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
                  <Text style={{ fontSize: T.fs.body, fontWeight: '700', color: T.text1 }}>{metric.name}</Text>
                  {/* 이름만으로 모를 항목에만 짧은 뜻풀이. 카테고리는 왼쪽 아이콘 색이 이미 말해주고,
                      상태는 오른쪽 값·배지가 말해주므로 여기서 반복하지 않는다. 자세한 정의는 2뎁스. */}
                  {!!metricGloss[metric.key] && (
                    <Text style={{ fontSize: T.fs.caption, color: T.text3, marginTop: 2 }} numberOfLines={1}>
                      {metricGloss[metric.key]}
                    </Text>
                  )}
                </View>
                <Text style={{ fontSize: T.fs.body, fontWeight: '700', color: metric.infoOnly ? T.text1 : color }}>{formatMetricValue(metric, detailReport.values[metric.key])}{metric.unit ? <Text style={{ fontSize: T.fs.caption, fontWeight: '500', color: T.text3 }}>{metric.unit}</Text> : null}</Text>
                {metric.infoOnly ? (
                  <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: T.radiusPill, backgroundColor: T.cardAlt }}>
                    <Text style={{ fontSize: T.fs.caption, fontWeight: '600', color: T.text3 }}>참고</Text>
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
            <Text style={{ fontSize: T.fs.body, fontWeight: '700', color: T.text1, marginBottom: 6, textAlign: 'center' }}>등록된 복약 정보가 없어요</Text>
            <Text style={{ fontSize: T.fs.caption, color: T.text3, textAlign: 'center', lineHeight: 20 }}>
              업로드 화면의 "처방전·복약자료" 탭에서{'\n'}"내가 먹는 약! 한눈에" 엑셀 파일을 올리면{'\n'}복용 중인 약이 여기에 정리돼요.
            </Text>
          </View>
        ) : (
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginHorizontal: 16, paddingVertical: 12, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: T.divider }}>
            <Text style={{ fontSize: T.fs.caption, color: T.primaryText, fontWeight: '700' }}>!</Text>
            <Text style={{ flex: 1, fontSize: T.fs.caption, color: T.text2, lineHeight: 20 }}>
              {usingRealData
                ? '"내가 먹는 약! 한눈에" 자료를 효능군별로 정리했어요. 검사 수치가 약 복용의 영향을 받을 수 있으니 함께 확인해보세요.'
                : '예시 복약 정보입니다. "내가 먹는 약! 한눈에" 자료를 올리면 본인의 복약 정보가 효능군별로 정리돼요.'}
            </Text>
          </View>
          {medGroups.map(({ category, items }) => (
            <View key={category} style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 6, marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <View style={{ backgroundColor: T.primaryLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: T.radiusPill }}>
                  <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: T.primaryText }}>{category}</Text>
                </View>
                <Text style={{ fontSize: T.fs.caption, color: T.text3 }}>{items.length}개</Text>
              </View>
              {items.map((item, i) => (
                <View key={`${item.drug_code ?? item.product_name}-${item.dispensed_date}`} style={[{ paddingBottom: 14 }, i < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: T.divider, marginBottom: 14 }]}>
                  <Text style={{ fontSize: T.fs.body, fontWeight: '700', color: T.text1, marginBottom: 4 }}>{item.product_name}</Text>
                  <Text style={{ fontSize: T.fs.caption, color: T.text3, marginBottom: 6 }}>성분: {item.ingredient_en}</Text>
                  <Text style={{ fontSize: T.fs.caption, color: T.text2, lineHeight: 20 }}>{medicationDosageText(item)}</Text>
                  <Text style={{ fontSize: T.fs.caption, color: T.text3, marginTop: 3 }}>복용 기간: {medicationPeriodText(item)}</Text>
                  {item.safety_alert ? (
                    <Text style={{ fontSize: T.fs.caption, color: T.danger, marginTop: 3 }}>⚠ {item.safety_alert}</Text>
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
