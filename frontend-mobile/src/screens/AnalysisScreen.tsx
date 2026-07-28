import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { AnimatedScore, DirectionalBar, Eyebrow, FadeIn, FadeInUp, T } from '../components/UI';
import { WhatIfSimulator } from '../components/WhatIfSimulator';
import { computeGroupsForReport, directionLabel, metricsForReport, metricDirection, SCORE_PENALTY } from '../data';
import type { MetricDefinition, Report } from '../data';
import type { RealRecommendations, RealEgfr, RealComboAnalysis, RealCalcItem } from '../health';

/** 도메인 섹션 헤더 — 분석 카드를 신장/간/대사·지질/심혈관/통계참고로 묶어 읽히게 한다.
 *  카드를 부수지 않고 헤더만 얹는 가벼운 그룹핑. 해당 카드가 없으면 헤더도 그리지 않는다. */
function DomainHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 16, marginTop: 16, marginBottom: 6 }}>
      <Text style={{ fontSize: 15 }}>{icon}</Text>
      <Text style={{ fontSize: 15, fontWeight: '800', color: T.text1 }}>{title}</Text>
    </View>
  );
}

// 계산기 level → 상태색 (info=중립 회색, 나머지는 구간색)
const calcLevelColor = (level: string) => level === 'info' ? T.text3 : level === 'low' ? T.success : (level === 'high' || level === 'very_high') ? T.danger : T.warn;
const calcLevelBg = (level: string) => level === 'info' ? T.cardAlt : level === 'low' ? T.successBg : (level === 'high' || level === 'very_high') ? T.dangerBg : T.warnBg;

/** 계산기 item 리스트를 공통 행으로 렌더 — 값·상태뱃지·공식·기준·비고. 30년 위험 함께 표기. */
function CalcRows({ items }: { items: RealCalcItem[] }) {
  if (!items.length) return null;
  return (
    <>
      {items.map((it, i) => (
        <View key={it.key} style={[{ paddingVertical: 12 }, i > 0 && { borderTopWidth: 1, borderTopColor: T.divider }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: T.text1, flex: 1 }}>{it.title}</Text>
            <View style={{ backgroundColor: calcLevelBg(it.level), paddingHorizontal: 8, paddingVertical: 3, borderRadius: T.radiusPill }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: calcLevelColor(it.level) }}>{it.interpretation}</Text>
            </View>
          </View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: T.text1 }}>
            {it.value}{it.unit ?? ''}{it.value_30yr != null ? `  ·  30년 ${it.value_30yr}%` : ''}
          </Text>
          {!!it.peer_label && (
            <View style={{ alignSelf: 'flex-start', marginTop: 6, backgroundColor: T.text1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: T.radiusPill }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>또래비교 · {it.peer_label}</Text>
            </View>
          )}
          {!!it.formula && <Text style={{ fontSize: 11, color: T.text3, marginTop: 3 }}>{it.formula}</Text>}
          {!!it.cutoffs && <Text style={{ fontSize: 11, color: T.text3, marginTop: 3 }}>기준: {it.cutoffs}</Text>}
          {!!it.note && <Text style={{ fontSize: 11, color: T.text3, marginTop: 3 }}>{it.note}</Text>}
        </View>
      ))}
    </>
  );
}

export default function AnalysisScreen({ reports, metricDefinitions, usingRealData, recommendations, egfr, comboAnalysis }: {
  reports: Report[];
  metricDefinitions: MetricDefinition[];
  usingRealData?: boolean;
  recommendations?: RealRecommendations | null;
  egfr?: RealEgfr | null;
  comboAnalysis?: RealComboAnalysis | null;
}) {
  // 조합 그룹은 07 마이그레이션 이후 분석에만 있다 — 없으면 카드 자체를 그리지 않는다.
  const comboGroups = comboAnalysis?.combo_groups ?? null;
  const fattyLiver = comboAnalysis?.fatty_liver ?? null;
  // FLI/HSI·단일그룹·ASCVD는 그 이후(08) 분석부터 담겨 온다 — 마찬가지로 없으면 그리지 않는다.
  const flIndices = fattyLiver?.indices ?? null;
  const singleGroups = comboAnalysis?.single_groups ?? null;
  // 집단군 개수 요약 — 백엔드 주입(2026-07-28) 이후 저장분에만 있다.
  const rarity = comboAnalysis?.rarity ?? null;
  const ascvd = comboAnalysis?.ascvd_simulation ?? null;
  const ldlTarget = comboAnalysis?.ldl_target && !comboAnalysis.ldl_target.error ? comboAnalysis.ldl_target : null;
  // 계산기 items를 도메인 카테고리로 나눠 각 섹션에 배치한다.
  const calcItems = comboAnalysis?.calculators?.items ?? [];
  const calcOf = (cats: string[]) => calcItems.filter((it) => cats.includes(it.category));
  const metabolicCalcs = calcOf(['lipid', 'insulin', 'adiposity', 'bp']);
  // D(상관구조): 대사·지질 지표는 사실상 3개 축으로 압축된다.
  //  ① 인슐린저항성·내장지방(TyG·METS-IR·AIP·LAP·VAI, 서로 r 0.64~0.96) → 대표 TyG
  //  ② 콜레스테롤(Non-HDL·Castelli-I·II, r 0.79~0.94) → 대표 Non-HDL / ③ 혈압(MAP) 고유
  // 대표(TyG·Non-HDL·MAP)만 펼치고 강상관 중복은 접어 인지부하를 줄인다.
  const METAB_PRIMARY = ['tyg', 'non_hdl_c', 'map'];
  const metabolicPrimary = metabolicCalcs.filter((it) => METAB_PRIMARY.includes(it.key));
  const metabolicRedundant = metabolicCalcs.filter((it) => !METAB_PRIMARY.includes(it.key));
  const liverCalcs = calcOf(['liver']);
  const cvCalcs = calcOf(['cardiovascular']);
  const calcDisclaimer = comboAnalysis?.calculators?.disclaimer;
  // FLI/HSI level → 상태색 (백엔드 interpretation 문구를 그대로 쓰고, 색만 구간에 맞춘다)
  const levelColor = (level: string) => level === 'low' ? T.success : (level === 'high' || level === 'very_high') ? T.danger : T.warn;
  const levelBg = (level: string) => level === 'low' ? T.successBg : (level === 'high' || level === 'very_high') ? T.dangerBg : T.warnBg;
  const [yearIdx, setYearIdx] = useState(reports.length - 1);
  const [showRedundant, setShowRedundant] = useState(false);
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
        <Text style={{ fontSize: 26, fontWeight: '800', fontFamily: T.fontDisplay, color: T.text1, letterSpacing: -0.5, marginTop: 6 }}>건강분석</Text>
        <Text style={{ fontSize: 13, color: T.text3, lineHeight: 19, marginTop: 6 }}>내 수치, 정상 기준, 연령대 평균을 비교합니다.</Text>
      </View>
      </FadeInUp>

      {/* 안내 — 박스 대신 구분선과 텍스트만으로 */}
      <FadeInUp delay={50}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 20, paddingVertical: 12, marginBottom: 4 }}>
        <Text style={{ fontSize: 13, color: T.text2, fontWeight: '700' }}>!</Text>
        <Text style={{ fontSize: 13, color: T.text2, lineHeight: 20, flex: 1 }}>
          이 화면은 건강검진 수치를 이해하기 위한 참고 정보입니다. 질병 진단이나 치료 판단을 대체하지 않습니다.
        </Text>
      </View>
      </FadeInUp>

      {/* ① 참고 점수 */}
      <FadeInUp delay={100}>
      <View style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20, marginBottom: 12 }}>
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
      <View style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, marginBottom: 12 }}>
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

      {/* 🩺 신장 — eGFR·CrCl */}
      {egfr && <DomainHeader icon="🩺" title="신장 기능" />}
      {/* ③ 신장 기능(eGFR) — 그 해 혈청 크레아티닌이 실제로 측정된 경우에만 백엔드 계산 결과를 보여준다 */}
      {egfr && (
        <FadeInUp delay={180}>
        <View style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20, marginBottom: 12 }}>
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
          {/* CrCl — 그 해 검진에 체중이 기록된 경우에만 백엔드가 함께 계산해 준다(약물 용량 참고용) */}
          {egfr.crcl != null && (
            <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: T.divider }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: T.text1, marginBottom: 4 }}>약물 용량 참고 (CrCl)</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: T.text1 }}>{egfr.crcl}</Text>
                <Text style={{ fontSize: 12, color: T.text3 }}>mL/min · {egfr.crcl_method ?? 'Cockcroft-Gault'}</Text>
                {!!egfr.crcl_label && (
                  <Text style={{ fontSize: 11, fontWeight: '700', color: T.text2, backgroundColor: T.cardAlt, paddingHorizontal: 7, paddingVertical: 3, borderRadius: T.radiusPill }}>{egfr.crcl_label}</Text>
                )}
              </View>
              {!!egfr.crcl_note && (
                <Text style={{ fontSize: 12, color: T.text3, lineHeight: 18 }}>{egfr.crcl_note}</Text>
              )}
            </View>
          )}
        </View>
        </FadeInUp>
      )}

      {/* 🫁 간 — FLI/HSI 보조지표 + 간 계산기(BARD·De Ritis) */}
      {((flIndices && (flIndices.fli || flIndices.hsi)) || liverCalcs.length > 0) && <DomainHeader icon="🫁" title="간" />}
      {/* ③-3 지방간 보조지표(FLI·HSI) — 검진 수치로 계산되는 선별용 지표.
          값·구간·해석 문구 전부 백엔드가 만들어 보내준 것을 그대로 보여준다. */}
      {flIndices && (flIndices.fli || flIndices.hsi) && (
        <FadeInUp delay={215}>
        <View style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20, marginBottom: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: T.text1, marginBottom: 4 }}>지방간 보조지표</Text>
          <Text style={{ fontSize: 13, color: T.text2, marginBottom: 14 }}>검진 수치만으로 지방간 가능성을 가늠해 보는 선별용 지표예요.</Text>
          {([
            { title: 'FLI', idx: flIndices.fli },
            { title: 'HSI', idx: flIndices.hsi },
          ] as const).filter((r) => r.idx).map((r, i) => (
            <View key={r.title} style={[{ paddingVertical: 12 }, i > 0 && { borderTopWidth: 1, borderTopColor: T.divider }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: T.text1 }}>{r.title}</Text>
                  {!!r.idx!.formula && <Text style={{ fontSize: 11, color: T.text3, flexShrink: 1 }}>{r.idx!.formula}</Text>}
                </View>
                <View style={{ backgroundColor: levelBg(r.idx!.level), paddingHorizontal: 8, paddingVertical: 3, borderRadius: T.radiusPill }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: levelColor(r.idx!.level) }}>{r.idx!.interpretation}</Text>
                </View>
              </View>
              <Text style={{ fontSize: 22, fontWeight: '800', color: T.text1 }}>{r.idx!.value}</Text>
              {!!r.idx!.cutoffs && <Text style={{ fontSize: 11, color: T.text3, marginTop: 3 }}>기준: {r.idx!.cutoffs}</Text>}
            </View>
          ))}
          {!!flIndices.unavailable?.length && (
            <Text style={{ fontSize: 11, color: T.text3, lineHeight: 17, marginTop: 6 }}>· 계산 불가: {flIndices.unavailable.join(' / ')}</Text>
          )}
          {!!flIndices.disclaimer && (
            <Text style={{ fontSize: 11, color: T.text3, lineHeight: 17, marginTop: 10 }}>{flIndices.disclaimer}</Text>
          )}
        </View>
        </FadeInUp>
      )}

      {/* 간 계산기 (BARD·De Ritis) — FLI/HSI(지방증)에 이어 섬유화·유형 지표 */}
      {liverCalcs.length > 0 && (
        <FadeInUp delay={217}>
        <View style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20, marginBottom: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: T.text1, marginBottom: 4 }}>간 계산기</Text>
          <CalcRows items={liverCalcs} />
        </View>
        </FadeInUp>
      )}

      {/* ⚖️ 대사·지질 — 검증된 수치 계산기(지질비·인슐린저항성·내장지방·혈압) */}
      {metabolicCalcs.length > 0 && <DomainHeader icon="⚖️" title="대사·지질" />}
      {metabolicCalcs.length > 0 && (
        <FadeInUp delay={216}>
        <View style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20, marginBottom: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: T.text1, marginBottom: 4 }}>대사·지질 계산기</Text>
          <Text style={{ fontSize: 13, color: T.text2, marginBottom: 14 }}>검진 기본검사 수치만으로 산출하는 검증된 참고 지표예요.</Text>
          <CalcRows items={metabolicPrimary} />
          {metabolicRedundant.length > 0 && (
            <>
              <Pressable
                onPress={() => setShowRedundant((v) => !v)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 11, borderTopWidth: 1, borderTopColor: T.divider, marginTop: 2 }}
              >
                <Ionicons name={showRedundant ? 'chevron-up' : 'chevron-down'} size={16} color={T.text2} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: T.text2 }}>
                  {showRedundant ? '관련 지표 접기' : `관련 지표 ${metabolicRedundant.length}종 더보기`}
                </Text>
                <Text style={{ fontSize: 12, color: T.text3 }}>(대표 지표와 강한 상관)</Text>
              </Pressable>
              {showRedundant && <CalcRows items={metabolicRedundant} />}
            </>
          )}
          {!!calcDisclaimer && (
            <Text style={{ fontSize: 11, color: T.text3, lineHeight: 17, marginTop: 10 }}>{calcDisclaimer}</Text>
          )}
        </View>
        </FadeInUp>
      )}

      {/* LDL 개인 목표 — 같은 LDL이라도 위험군에 따라 목표가 다르다(초고위험<55 … 저위험<160). */}
      {ldlTarget && (
        <FadeInUp delay={205}>
        <View style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20, marginBottom: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: T.text1, marginBottom: 4 }}>LDL 콜레스테롤 개인 목표</Text>
          <Text style={{ fontSize: 13, color: T.text2, marginBottom: 14 }}>같은 LDL 수치라도 위험군에 따라 목표가 달라져요. 내 위험군 기준 목표예요.</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: T.text1 }}>{ldlTarget.target_text}</Text>
            {ldlTarget.achieved != null && (
              <View style={{ backgroundColor: ldlTarget.achieved ? T.successBg : T.warnBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: T.radiusPill }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: ldlTarget.achieved ? T.success : T.warn }}>
                  {ldlTarget.achieved ? '목표 달성' : `목표 초과${ldlTarget.gap != null ? ` +${ldlTarget.gap}` : ''}`}
                </Text>
              </View>
            )}
            {/* 중성지방이 높으면 LDL 계산값을 믿기 어려워 달성 여부를 단정하지 않는다. */}
            {ldlTarget.ldl_reliable === false && (
              <View style={{ backgroundColor: T.cardAlt, paddingHorizontal: 10, paddingVertical: 4, borderRadius: T.radiusPill }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: T.text3 }}>판정 보류</Text>
              </View>
            )}
          </View>
          {ldlTarget.current_ldl != null && (
            <Text style={{ fontSize: 13, color: T.text2, marginBottom: 4 }}>현재 LDL {ldlTarget.current_ldl}mg/dL · 위험군: {ldlTarget.label}</Text>
          )}
          {ldlTarget.ldl_reliable === false && !!ldlTarget.reliability_note && (
            <View style={{ backgroundColor: T.warnBg, borderRadius: 10, padding: 12, marginTop: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: T.warn, marginBottom: 4 }}>⚠️ LDL 수치 신뢰도 확인 필요</Text>
              <Text style={{ fontSize: 12, color: T.text2, lineHeight: 18 }}>{ldlTarget.reliability_note}</Text>
            </View>
          )}
          {!!ldlTarget.risk_factors?.length && (
            <Text style={{ fontSize: 12, color: T.text3, lineHeight: 18 }}>반영된 위험인자: {ldlTarget.risk_factors.join(' · ')}</Text>
          )}
          {!!ldlTarget.limitations?.length && (
            <Text style={{ fontSize: 11, color: T.text3, lineHeight: 17, marginTop: 8 }}>· {ldlTarget.limitations[0]}</Text>
          )}
          <Text style={{ fontSize: 11, color: T.text3, lineHeight: 17, marginTop: 4 }}>기준: {ldlTarget.reference}</Text>
        </View>
        </FadeInUp>
      )}

      {/* 이 수치가 바뀌면? — 검진값을 바꿔 넣고 공식을 다시 계산(예측 아님).
          ⚠️ 서버는 '가장 최근' 저장 검진값을 기준선으로 쓴다. 그래서 위 연도 선택과
          무관하게 최신 회차를 넘겨야 스테퍼에 보이는 값과 계산 기준이 어긋나지 않는다. */}
      {reports.length > 0 && (
        <FadeInUp delay={215}>
          <WhatIfSimulator
            latest={reports[reports.length - 1]}
            disabled={!usingRealData}
            disabledReason="데모 계정은 저장된 검진값이 없어 재계산을 할 수 없어요. 실제 결과지를 업로드하면 사용할 수 있어요."
          />
        </FadeInUp>
      )}

      {/* 📊 함께 나타나는 패턴 · 집단군 (통계 참고) — 위험 정량이 아닌 동반·판정 통계 묶음 */}
      {((comboGroups && comboGroups.matched_count > 0) || !!singleGroups?.length) && (
        <DomainHeader icon="📊" title="함께 나타나는 패턴 · 집단군 (통계 참고)" />
      )}
      {/* ③-2 함께 나타나는 조합(조합 그룹) — 공단 표본 기준 '동반 경향(기술통계)'이며 위험도가 아니다.
          O/E비는 "각각이 따로 논다면 기대되는 동반 빈도" 대비 실제 관찰 빈도. 위험 정량은 계산기가 담당. */}
      {comboGroups && comboGroups.matched_count > 0 && (
        <FadeInUp delay={210}>
        <View style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20, marginBottom: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: T.text1, marginBottom: 4 }}>함께 나타나는 조합 (동반 경향)</Text>
          <Text style={{ fontSize: 13, color: T.text2, marginBottom: 14 }}>
            여러 요인이 함께 나타나는 조합이에요. 같은 조합인 분들이 국민건강보험공단 표본
            {comboGroups.population.total_n ? ` ${(comboGroups.population.total_n / 10000).toFixed(0)}만명` : ''} 중 얼마나 되는지 비교한 동반 경향(통계)이며, 위험도 자체는 아니에요. 위험 정량은 위 계산기(ASCVD 등)를 참고하세요.
          </Text>

          {comboGroups.matched.slice(0, 4).map((c, i) => (
            <View key={c.combo_name} style={[{ paddingVertical: 12 }, i > 0 && { borderTopWidth: 1, borderTopColor: T.divider }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: T.text1, flex: 1 }}>{c.combo_name}</Text>
                {c.is_ascvd_risk && (
                  <Text style={{ fontSize: 10, fontWeight: '700', color: T.text3, backgroundColor: T.cardAlt, paddingHorizontal: 7, paddingVertical: 3, borderRadius: T.radiusPill }}>
                    심혈관 지표 참고
                  </Text>
                )}
              </View>
              <Text style={{ fontSize: 12, color: T.text2, lineHeight: 19, marginBottom: 6 }}>{c.meaning}</Text>
              {c.population && (
                <Text style={{ fontSize: 12, color: T.text3, lineHeight: 19 }}>
                  같은 조합 {c.population.n_in_combo.toLocaleString()}명 (표본의 {c.population.pct_of_total}%)
                  {c.population.observed_to_expected >= 1.2 && (
                    <Text style={{ color: T.warn, fontWeight: '700' }}>
                      {'  ·  '}따로 나타날 때보다 {c.population.observed_to_expected}배 자주 동반
                    </Text>
                  )}
                </Text>
              )}
            </View>
          ))}

          {comboGroups.matched.length > 4 && (
            <Text style={{ fontSize: 12, color: T.text3, marginTop: 10 }}>
              외 {comboGroups.matched.length - 4}개 조합에 더 해당해요.
            </Text>
          )}

          {/* 판정 불가 조합 — 입력값이 없어 판정 못 한 조합을 지어내지 않고 그대로 밝힌다(정직성). */}
          {!!comboGroups.not_evaluable?.length && (
            <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.divider }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: T.text2, marginBottom: 2 }}>판정 불가 (데이터 부족)</Text>
              <Text style={{ fontSize: 12, color: T.text3, lineHeight: 18, marginBottom: 8 }}>입력값이 없어 지어내지 않고 '판정 불가'로 둔 조합이에요.</Text>
              {comboGroups.not_evaluable.map((n, i) => (
                <View key={n.combo_name} style={[{ paddingVertical: 8 }, i > 0 && { borderTopWidth: 1, borderTopColor: T.divider }]}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: T.text1, marginBottom: 2 }}>{n.combo_name}</Text>
                  <Text style={{ fontSize: 12, color: T.text3, lineHeight: 18 }}>
                    {n.reason}{n.missing?.length ? ` (부족: ${n.missing.join('·')})` : ''}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* 지방간 유형 — 음주량이 없으면 잠정 분류임을 반드시 밝힌다 */}
          {fattyLiver?.applicable && fattyLiver.type && (
            <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: T.divider }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: T.text1, marginBottom: 4 }}>
                지방간 유형 {fattyLiver.provisional ? '(잠정)' : ''}
              </Text>
              <Text style={{ fontSize: 13, color: T.text2, lineHeight: 20 }}>{fattyLiver.type}</Text>
              <Text style={{ fontSize: 12, color: T.text3, lineHeight: 18, marginTop: 4 }}>{fattyLiver.basis}</Text>
              {!!fattyLiver.note && (
                <Text style={{ fontSize: 11, color: T.text3, lineHeight: 17, marginTop: 4 }}>{fattyLiver.note}</Text>
              )}
            </View>
          )}

          {/* 해석의 한계 — 숨기지 않고 그대로 노출한다 */}
          {!!comboGroups.caveats?.length && (
            <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.divider }}>
              {comboGroups.caveats.map((c, i) => (
                <Text key={i} style={{ fontSize: 11, color: T.text3, lineHeight: 17, marginBottom: 3 }}>· {c}</Text>
              ))}
            </View>
          )}
        </View>
        </FadeInUp>
      )}

      {/* ③-4 집단군 판정(13개) — 백엔드가 검진 수치·약물로 판정한 단일 집단군 목록.
          판정 불가(그 해 입력값 없음)한 그룹은 지어내지 않고 '판정 불가'로 표시한다. */}
      {!!singleGroups?.length && (
        <FadeInUp delay={218}>
        <View style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, marginBottom: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: T.text1, marginBottom: 4 }}>집단군 판정</Text>
          <Text style={{ fontSize: 13, color: T.text2, marginBottom: 6 }}>검진 수치와 복용 약물을 함께 반영해 판정한 결과예요.</Text>

          {/* 요약 줄 — 아래 13줄을 다 읽지 않아도 "몇 개에 해당하는지"가 먼저 보이게 한다.
              백엔드 필드명은 rarity지만 희귀도가 아니라 '해당 집단군 개수 + 해석'이다.
              구버전 저장 분석에는 이 값이 없다 → 그때는 요약 없이 상세 목록만 보인다. */}
          {rarity && (
            <View style={{ backgroundColor: T.cardAlt, borderRadius: T.radiusSm, padding: 14, marginTop: 8, marginBottom: 2 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: T.text1 }}>
                임상 {rarity.clinical_count}개 · 생활습관 {rarity.lifestyle_count}개에 해당
              </Text>
              <Text style={{ fontSize: 13, color: T.text2, lineHeight: 19, marginTop: 4 }}>{rarity.interpretation}</Text>
            </View>
          )}

          {(['임상', '생활습관'] as const).map((cat) => {
            const rows = singleGroups.filter((g) => g.category === cat);
            if (!rows.length) return null;
            return (
              <View key={cat} style={{ marginTop: 10 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: T.text3, marginBottom: 4 }}>{cat}</Text>
                {rows.map((g, i) => (
                  <View key={g.key} style={[{ paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }, i > 0 && { borderTopWidth: 1, borderTopColor: T.divider }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: T.text1 }}>{g.name}</Text>
                      {!!g.desc && <Text style={{ fontSize: 11, color: T.text3, lineHeight: 16, marginTop: 2 }}>{g.desc}</Text>}
                    </View>
                    <View style={{ backgroundColor: g.applies == null ? T.cardAlt : g.applies ? T.dangerBg : T.successBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: T.radiusPill }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: g.applies == null ? T.text3 : g.applies ? T.danger : T.success }}>
                        {g.applies == null ? '판정 불가' : g.applies ? '해당' : '비해당'}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            );
          })}
        </View>
        </FadeInUp>
      )}

      {/* 🫀 심혈관 — ASCVD 위험 계산기 */}
      {((ascvd?.available && ascvd.risk_percent != null) || cvCalcs.length > 0) && <DomainHeader icon="🫀" title="심혈관" />}
      {/* ③-5 ASCVD 10년 위험도 — 참고용 시뮬레이션(한국인 미검증, 진단 아님).
          계산 불가(available=false)면 카드를 그리지 않는다 — 값을 지어내 보여주지 않는다. */}
      {ascvd?.available && ascvd.risk_percent != null && (
        <FadeInUp delay={221}>
        <View style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20, marginBottom: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: T.text1, marginBottom: 4 }}>심혈관 위험 참고 시뮬레이션</Text>
          <Text style={{ fontSize: 13, color: T.text2, marginBottom: 14 }}>10년 내 죽상경화성 심혈관질환(ASCVD) 위험을 가늠해 보는 참고용 계산이에요.</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
            <Text style={{ fontSize: 28, fontWeight: '800', color: T.text1 }}>{ascvd.risk_percent}%</Text>
            {!!ascvd.risk_label && (
              <View style={{ marginLeft: 2, backgroundColor: ascvd.risk_level === 'low' ? T.successBg : ascvd.risk_level === 'high' ? T.dangerBg : T.warnBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: T.radiusPill }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: ascvd.risk_level === 'low' ? T.success : ascvd.risk_level === 'high' ? T.danger : T.warn }}>{ascvd.risk_label}</Text>
              </View>
            )}
          </View>
          {!!ascvd.how_to_read && (
            <Text style={{ fontSize: 12, color: T.text2, lineHeight: 19, marginBottom: 10 }}>{ascvd.how_to_read}</Text>
          )}
          {/* what-if — 절대값보다 "무엇을 바꾸면 얼마나 달라지는가"를 보여준다 */}
          {!!ascvd.scenarios?.length && (
            <View style={{ paddingTop: 10, borderTopWidth: 1, borderTopColor: T.divider, gap: 8 }}>
              {ascvd.scenarios.map((s) => (
                <View key={s.name} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 13, color: T.text1, flex: 1 }}>{s.name}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: T.text1 }}>
                    {s.risk_percent}%{' '}
                    <Text style={{ color: s.delta < 0 ? T.success : T.text3, fontSize: 12 }}>({s.delta > 0 ? '+' : ''}{s.delta}%p)</Text>
                  </Text>
                </View>
              ))}
            </View>
          )}
          {!!ascvd.limitations?.length && (
            <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: T.divider }}>
              {ascvd.limitations.map((l, i) => (
                <Text key={i} style={{ fontSize: 11, color: T.text3, lineHeight: 17, marginBottom: 3 }}>· {l}</Text>
              ))}
            </View>
          )}
        </View>
        </FadeInUp>
      )}

      {/* ④ 개인화 권장사항 — 백엔드가 그 해 분석 결과를 바탕으로 실제로 생성해 보내준 문구만 그대로 보여준다 */}
      {recommendations && (recommendations.priority_messages?.length || recommendations.recommendations) && (
        <FadeInUp delay={220}>
        <View style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20, marginBottom: 12 }}>
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
        <Text style={{ fontSize: 11, color: T.text3, fontWeight: '600' }}>{dirInfo.icon} {dirInfo.text}</Text>
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
            <View style={{ backgroundColor: T.cardAlt, paddingHorizontal: 8, paddingVertical: 3, borderRadius: T.radiusPill }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: T.text2 }}>약으로 관리 중인 항목</Text>
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
