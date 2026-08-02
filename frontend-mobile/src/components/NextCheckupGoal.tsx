import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { T } from './UI';
import { simulateCheckup } from '../health';
import { simulateDemo } from '../dummyAnalysis';
import { ACTIONS, GRAMS_PER_DRINK, rankActions, round1 } from '../lifestyleActions';
import type { RealSimulation, SimulateChanges } from '../health';
import type { Ctx } from '../lifestyleActions';
import type { Report } from '../data';

/**
 * 다음 검진 목표 세우기 — 문제 → 행동 → 결과.
 *
 * ⚠️ 예전 화면("이 수치가 바뀌면?")은 **출력을 입력처럼 다뤘다.** 공복혈당 112를 90으로
 * "정하는" 사람은 없고 HDL 39를 45로 올리는 버튼도 없다. 사람이 조작할 수 있는 건
 * 체중·술·담배·운동·식사뿐이고 저 수치들은 그것의 출력이다. 그래서 허리를 60까지 밀면
 * 다 초록이 되는, "당신이 더 건강했다면 더 건강했을 것" 화면이 됐다.
 *
 * 그래서 입력을 행동으로 바꿨다. 계산은 두 층으로 나뉜다:
 *   ① 행동 → 수치 : 앱이 계산할 수 없다. **문헌 값을 인용하는 것뿐**이라 범위로 쓰고 출처를 단다.
 *   ② 수치 → 판정 : 정확히 계산된다. 백엔드 what_if.py가 이미 하고 있던 일.
 *
 * 계수 출처는 docs/evidence/2026-07-30-생활습관-효과크기-근거.md (§2·§3). 그 문서의
 * 사용 규칙(§6)을 여기서 지킨다 — 범위로 쓴다 / 출처를 병기한다 / 효과가 없는 조합을
 * 솔직히 말한다 / 하루 2잔 이하 음주자에게 절주 효과를 말하지 않는다 / 성별을 반영한다.
 */

// 행동 정의(ACTIONS)와 효과크기·우선순위 계산은 ../lifestyleActions.ts로 옮겼다.
// 이 파일은 react-native를 import해 vitest가 읽지 못하는데, 그 안에 있으면 순서를
// 매기는 계산을 검증할 수 없었다. 여기 남은 것은 화면(JSX)뿐이다.

/** 기준을 벗어난 항목 — "① 지금 뭐가 걸리나". 판정은 그 해 기록에 저장된 것을 그대로 쓴다. */
const WATCH: { key: keyof Report['values']; label: string; unit: string }[] = [
  { key: 'waist', label: '허리둘레', unit: 'cm' },
  { key: 'sbp', label: '수축기 혈압', unit: '' },
  { key: 'dbp', label: '이완기 혈압', unit: '' },
  { key: 'glucose', label: '공복혈당', unit: '' },
  { key: 'triglyceride', label: '중성지방', unit: '' },
  { key: 'hdl', label: 'HDL 콜레스테롤', unit: '' },
  { key: 'ldl', label: 'LDL 콜레스테롤', unit: '' },
  // 간 수치 — 지방간 유형(MASLD/MetALD/ALD) 판정의 근거 항목이면서 행동으로 움직일 수 있다.
  { key: 'ast', label: 'AST', unit: 'IU/L' },
  { key: 'alt', label: 'ALT', unit: 'IU/L' },
  { key: 'ggt', label: '감마-GTP', unit: 'IU/L' },
];

const fmt = (n: number) => `${n > 0 ? '+' : ''}${round1(n)}`;

export function NextCheckupGoal({ latest, gender, smoking, alcoholWeeklyG, demoMode, demoNote }: {
  latest: Report;
  gender: 1 | 2;
  smoking?: 'never' | 'former' | 'current' | null;
  alcoholWeeklyG?: number | null;
  /** 데모 계정 — 서버 재계산을 쓸 수 없어 앱 안에서 다시 센다(simulateDemo 주석 참고). */
  demoMode?: boolean;
  demoNote?: string;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [result, setResult] = useState<RealSimulation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const ctx: Ctx = useMemo(() => ({
    values: latest.values,
    gender,
    weightKg: typeof latest.values.weight === 'number' ? latest.values.weight : null,
    smoking,
    alcoholWeeklyG: alcoholWeeklyG ?? 0,
    hypertensive: (latest.values.sbp ?? 0) >= 140 || (latest.values.dbp ?? 0) >= 90,
  }), [latest, gender, smoking, alcoholWeeklyG]);

  // 순서를 배열 선언 순서가 아니라 «기준 이탈도가 얼마나 줄어드는가»로 매긴다.
  // 나열만 하면 화면이 "아무거나 하나 고르세요"가 되는데, 효과크기와 이 사람의 값이
  // 둘 다 있으니 어느 것부터 하면 되는지는 계산할 수 있는 판단이다(lifestyleActions.rankActions).
  const ranks = useMemo(() => rankActions(ACTIONS, ctx), [ctx]);
  const actions = useMemo(() => ranks.map((r) => ACTIONS.find((a) => a.id === r.id)!), [ranks]);
  const rankById = useMemo(() => new Map(ranks.map((r) => [r.id, r])), [ranks]);
  const action = actions.find((a) => a.id === picked) ?? null;
  const effects = action ? action.effects(ctx) : [];

  // 기준을 벗어난 항목 — 그 해 저장된 판정(statusByKey)을 그대로 읽는다. 새로 판정하지 않는다.
  const problems = WATCH
    .filter((w) => latest.values[w.key] != null && latest.statusByKey?.[w.key] && latest.statusByKey[w.key] !== '정상')
    .map((w) => ({ ...w, value: latest.values[w.key], status: latest.statusByKey[w.key] }));

  const openModal = () => { setPicked(null); setResult(null); setError(''); setOpen(true); };

  /** 판정 재계산 — 범위의 **보수적인 끝**(변화가 작은 쪽)으로 돌린다. 잘 됐을 때의 값으로
   *  판정까지 뒤집어 보여주면 화면이 과대약속이 된다. */
  const run = async () => {
    if (!action) return;
    setLoading(true); setError('');
    try {
      const changes: SimulateChanges = {};
      for (const e of effects) {
        // sim이 없는 항목(간 수치)은 어느 판정식에도 안 들어간다 — 보내면 서버가 거절한다.
        if (!e.sim) continue;
        const base = latest.values[e.from];
        if (typeof base !== 'number') continue;
        // hi가 '변화가 작은 쪽'이 되도록 각 effect에서 lo=큰 변화, hi=작은 변화로 넣어 두었다.
        changes[e.sim] = round1(base + e.hi);
      }
      if (!Object.keys(changes).length) {
        setError('이 행동이 움직이는 값은 대사증후군·LDL 목표 판정식에 들어가지 않아, 다시 셀 판정이 없어요. 위 수치 변화까지가 이 행동으로 말할 수 있는 전부입니다.');
        return;
      }
      setResult(demoMode ? simulateDemo(latest, changes, gender) : await simulateCheckup(changes));
    } catch (e) {
      setError(e instanceof Error ? `재계산에 실패했어요: ${e.message}` : '재계산에 실패했어요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <View style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingVertical: 20, marginBottom: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: T.text1, marginBottom: 4 }}>다음 검진 목표 세우기</Text>
        <Text style={{ fontSize: 13, color: T.text2, lineHeight: 20, marginBottom: 14 }}>
          지금 걸리는 것부터 짚고, 그걸 움직이는 행동을 고르면, 다음 검진에서 판정이 어떻게 달라지는지 보여드려요.
          {'\n'}
          <Text style={{ color: T.text3 }}>기준은 가장 최근 검진인 {latest.year}년 값이에요.</Text>
        </Text>
        <Pressable hitSlop={8}
          onPress={openModal}
          style={{ height: 50, borderRadius: T.radiusPill, alignItems: 'center', justifyContent: 'center', backgroundColor: T.primary }}
        >
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>목표 세우기</Text>
        </Pressable>
        {demoMode && !!demoNote && (
          <Text style={{ fontSize: 11, color: T.text3, marginTop: 8, lineHeight: 16 }}>{demoNote}</Text>
        )}
      </View>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: T.bg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 52, paddingBottom: 14, backgroundColor: T.white, borderBottomWidth: 1, borderBottomColor: T.divider }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: T.text1 }}>다음 검진 목표 세우기</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={12}><Ionicons name="close" size={24} color={T.text2} /></Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
            {/* ① 지금 뭐가 걸리나 */}
            <View style={{ backgroundColor: T.white, marginHorizontal: 16, marginTop: 12, borderRadius: T.radius, paddingHorizontal: 20, paddingVertical: 18 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: T.primary, marginBottom: 4 }}>① 지금 걸리는 것</Text>
              {problems.length === 0 ? (
                <Text style={{ fontSize: 14, color: T.text2, lineHeight: 21 }}>
                  {latest.year}년 검진에서 대사 관련 항목은 모두 기준 안이에요. 지금 상태를 유지하는 것이 목표예요.
                </Text>
              ) : (
                <>
                  <Text style={{ fontSize: 14, color: T.text2, lineHeight: 21, marginBottom: 10 }}>
                    {latest.year}년 검진에서 {problems.length}개 항목이 기준을 벗어났어요.
                  </Text>
                  {problems.map((p) => (
                    <View key={p.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <View style={{ backgroundColor: p.status === '위험' ? T.dangerBg : T.warnBg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: T.radiusPill }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: p.status === '위험' ? T.danger : T.warn }}>{p.status}</Text>
                      </View>
                      <Text style={{ fontSize: 14, color: T.text1, fontWeight: '600' }}>{p.label}</Text>
                      <Text style={{ fontSize: 14, color: T.text2 }}>{p.value}{p.unit}</Text>
                    </View>
                  ))}
                </>
              )}
            </View>

            {/* ② 뭘 하면 되나 — 한 번에 하나만. 효과크기는 더할 수 없다(대부분 체중을 통해 작용). */}
            <View style={{ backgroundColor: T.white, marginHorizontal: 16, marginTop: 8, borderRadius: T.radius, paddingHorizontal: 20, paddingVertical: 18 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: T.primary, marginBottom: 4 }}>② 그러려면 뭘 하면 되나</Text>
              <Text style={{ fontSize: 12, color: T.text3, lineHeight: 18, marginBottom: 12 }}>
                효과가 큰 것부터 차례로 놓았어요. 하나만 골라주세요 — 여러 행동의 효과는 그대로 더할 수 없어요.
                대부분 체중을 통해 겹쳐서 작용하거든요.
              </Text>
              {actions.length === 0 ? (
                <Text style={{ fontSize: 13, color: T.text3, lineHeight: 19 }}>
                  지금 정보로 제시할 수 있는 행동이 없어요. 내정보에서 몸무게·흡연·음주를 입력하면 더 정확해집니다.
                </Text>
              ) : actions.map((a, i) => {
                const on = a.id === picked;
                const rank = rankById.get(a.id);
                const pct = Math.round((rank?.reductionRatio ?? 0) * 1000) / 10;
                return (
                  <Pressable
                    key={a.id}
                    onPress={() => { setPicked(a.id); setResult(null); setError(''); }}
                    style={{
                      borderWidth: 1.5, borderColor: on ? T.primary : T.border, borderRadius: 12,
                      paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
                      backgroundColor: on ? T.primaryLight : T.white,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: on ? T.primary : T.text3 }}>{i + 1}</Text>
                      <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: on ? T.primary : T.text1 }}>{a.title(ctx)}</Text>
                    </View>
                    <Text style={{ fontSize: 12, color: T.text3, lineHeight: 18, marginTop: 3 }}>{a.detail(ctx)}</Text>
                    {/* 왜 이 순서인지를 숫자로 밝힌다. 근거 없이 1·2·3만 붙이면 앱이 정한 취향으로 읽힌다. */}
                    {pct > 0 ? (
                      <Text style={{ fontSize: 11, color: T.success, lineHeight: 17, marginTop: 5, fontWeight: '600' }}>
                        기준까지의 거리가 {pct}% 줄어요 — {rank!.movedFactors.join(' · ')}
                      </Text>
                    ) : (
                      <Text style={{ fontSize: 11, color: T.text3, lineHeight: 17, marginTop: 5 }}>
                        대사증후군 5기준을 움직이지는 않아요. 이 행동이 겨냥하는 건 다른 수치예요.
                      </Text>
                    )}
                  </Pressable>
                );
              })}
              {/* 이 순서가 무엇으로 매겨졌는지 — 안 밝히면 "앱이 정한 우선순위"로 읽힌다. */}
              {actions.some((a) => (rankById.get(a.id)?.reductionRatio ?? 0) > 0) && (
                <Text style={{ fontSize: 11, color: T.text3, lineHeight: 17, marginTop: 6 }}>
                  · 순서는 대사증후군 5기준에서 지금 얼마나 벗어나 있는지를 재고, 각 행동이 그 거리를 몇 %
                  좁히는지로 매겼어요. 범위 중 <Text style={{ fontWeight: '700' }}>변화가 작은 쪽</Text>으로 계산해
                  아래 판정 재계산과 같은 기준을 씁니다.
                </Text>
              )}
              {/* 목록에서 뺀 행동은 왜 뺐는지 밝힌다 — 조용히 빼면 "그건 상관없다"로 읽힌다. */}
              {ctx.alcoholWeeklyG > 0 && ctx.alcoholWeeklyG / 7 / GRAMS_PER_DRINK <= 2 && (
                <Text style={{ fontSize: 11, color: T.text3, lineHeight: 17, marginTop: 4 }}>
                  · 절주는 목록에 없어요. 지금 음주량(하루 2잔 이하)에서는 줄여도 혈압이 내려간다는 근거가 없습니다.
                </Text>
              )}
              {!ctx.hypertensive && ((ctx.values.sbp ?? 0) >= 130 || (ctx.values.dbp ?? 0) >= 80) && (
                <Text style={{ fontSize: 11, color: T.text3, lineHeight: 17, marginTop: 4 }}>
                  · 저염(하루 소금 3g 줄이기)은 목록에 없어요. 지침이 주는 효과크기가 고혈압군(140/90 이상) 기준이라,
                  지금 혈압에서 얼마나 내려가는지는 수치로 말할 수 없습니다. 저염 자체는 여전히 권장돼요.
                </Text>
              )}
            </View>

            {/* ③ 그러면 어떻게 되나 */}
            {action && (
              <>
                <View style={{ backgroundColor: T.white, marginHorizontal: 16, marginTop: 8, borderRadius: T.radius, paddingHorizontal: 20, paddingVertical: 18 }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: T.primary, marginBottom: 4 }}>③ 그러면 이렇게 됩니다</Text>
                  {/* ⚠️ 문구는 "되면"이지 "하면"이 아니다. 문헌 계수는 그 변화가 실제로 일어났을 때의
                      값이고, 일으키고 유지할 확률은 훨씬 낮다(근거문서 §7-4). */}
                  <Text style={{ fontSize: 12, color: T.text3, lineHeight: 18, marginBottom: 12 }}>
                    아래는 <Text style={{ fontWeight: '700' }}>그 변화가 실제로 일어났을 때</Text>의 문헌 평균 범위예요. 내 몸에 대한 예측이 아닙니다.
                  </Text>
                  {effects.map((e) => {
                    const base = latest.values[e.from] as number;
                    // lo/hi는 '변화가 큰 쪽/작은 쪽'이라 부호에 따라 대소가 뒤집힌다. 읽을 때는 늘 작은 수부터.
                    const dMin = Math.min(e.lo, e.hi), dMax = Math.max(e.lo, e.hi);
                    return (
                      <View key={e.from} style={{ paddingVertical: 9, borderTopWidth: 1, borderTopColor: T.divider }}>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: T.text1 }}>{e.label}</Text>
                          <Text style={{ fontSize: 14, color: T.text2 }}>
                            {base}{e.unit} → <Text style={{ fontWeight: '800', color: T.text1 }}>
                              {round1(base + dMin)}~{round1(base + dMax)}{e.unit}
                            </Text>
                          </Text>
                        </View>
                        <Text style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>
                          {fmt(dMin)} ~ {fmt(dMax)}{e.unit}{e.note ? ` · ${e.note}` : ''}
                        </Text>
                      </View>
                    );
                  })}
                  {/* 판정 재계산에 못 들어가는 항목을 밝힌다 — 안 밝히면 아래 '대사증후군 5→4'가
                      간 수치까지 반영한 결과로 읽힌다. */}
                  {effects.some((e) => !e.sim) && (
                    <Text style={{ fontSize: 11, color: T.text3, lineHeight: 17, marginTop: 10 }}>
                      · {effects.filter((e) => !e.sim).map((e) => e.label).join('·')}는 대사증후군 5기준·LDL 목표 어느 판정식에도 들어가지 않아, 아래 판정 재계산에는 반영되지 않아요.
                    </Text>
                  )}
                  {!!action.noEffect?.length && (
                    <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.divider }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: T.text2, marginBottom: 4 }}>이건 안 움직여요</Text>
                      {action.noEffect.map((n, i) => (
                        <Text key={i} style={{ fontSize: 12, color: T.text3, lineHeight: 19, marginBottom: 3 }}>· {n}</Text>
                      ))}
                    </View>
                  )}
                  {!!action.caution && (
                    <View style={{ marginTop: 12, backgroundColor: T.warnBg, borderRadius: 10, padding: 12 }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: T.warn, marginBottom: 4 }}>⚠️ 함께 지킬 것</Text>
                      <Text style={{ fontSize: 12, color: T.text2, lineHeight: 18 }}>{action.caution}</Text>
                    </View>
                  )}
                  <Text style={{ fontSize: 11, color: T.text3, lineHeight: 17, marginTop: 12 }}>
                    근거: {action.source} · 등급 {action.grade}
                  </Text>
                </View>

                <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
                  <Pressable hitSlop={8}
                    onPress={loading ? undefined : run}
                    style={{ height: 54, borderRadius: T.radiusPill, alignItems: 'center', justifyContent: 'center', backgroundColor: T.primary, opacity: loading ? 0.6 : 1 }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>{loading ? '다시 계산하는 중...' : '이 수치가 되면 판정은?'}</Text>
                  </Pressable>
                </View>
              </>
            )}

            {!!error && (
              <Text style={{ fontSize: 13, color: T.danger, marginHorizontal: 20, marginTop: 14, lineHeight: 19 }}>{error}</Text>
            )}

            {result && !result.error && (
              <>
                <View style={{ backgroundColor: T.white, marginHorizontal: 16, marginTop: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingVertical: 20 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: T.text1, marginBottom: 2 }}>대사증후군 기준 충족</Text>
                  {/* 여기부터는 추정이 아니다 — 위에서 나온 수치를 넣고 학회 기준으로 정확히 다시 센 결과다. */}
                  <Text style={{ fontSize: 12, color: T.text3, lineHeight: 18, marginBottom: 12 }}>
                    범위 중 <Text style={{ fontWeight: '700' }}>변화가 작은 쪽</Text>으로 계산했어요. 이 층은 추정이 아니라 학회 기준으로 정확히 다시 센 값이에요.
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Text style={{ fontSize: 30, fontWeight: '800', color: T.text3 }}>{result.metabolic_syndrome.before.count ?? '—'}</Text>
                    <Ionicons name="arrow-forward" size={20} color={T.text3} />
                    <Text style={{
                      fontSize: 34, fontWeight: '800',
                      color: (result.metabolic_syndrome.after.count ?? 0) < (result.metabolic_syndrome.before.count ?? 0) ? T.success : T.text1,
                    }}>
                      {result.metabolic_syndrome.after.count ?? '—'}
                    </Text>
                    <Text style={{ fontSize: 14, color: T.text2, marginTop: 8 }}>/ 5개 기준</Text>
                  </View>
                  {result.metabolic_syndrome.before.is_metabolic_syndrome && !result.metabolic_syndrome.after.is_metabolic_syndrome && (
                    <View style={{ alignSelf: 'flex-start', marginTop: 12, backgroundColor: T.successBg, paddingHorizontal: 12, paddingVertical: 6, borderRadius: T.radiusPill }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: T.success }}>3개 미만이 되어 대사증후군 기준에서 벗어나요</Text>
                    </View>
                  )}
                  {!!result.metabolic_syndrome.after.met_factors.length && (
                    <Text style={{ fontSize: 12, color: T.text3, marginTop: 10, lineHeight: 18 }}>
                      남는 항목: {result.metabolic_syndrome.after.met_factors.join(' · ')}
                    </Text>
                  )}
                </View>

                {/* LDL 개인 목표 — 위험군마다 목표선이 달라, 같은 LDL이라도 달성 여부가 다르다. */}
                {result.ldl_target?.target_ldl != null && result.ldl_target.after_ldl != null && (
                  <View style={{ backgroundColor: T.white, marginHorizontal: 16, marginTop: 8, borderRadius: T.radius, paddingHorizontal: 20, paddingVertical: 20 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: T.text1, marginBottom: 4 }}>LDL 개인 목표</Text>
                    <Text style={{ fontSize: 12, color: T.text3, marginBottom: 12 }}>
                      {result.ldl_target.label ? `${result.ldl_target.label} 기준 ` : ''}목표 {result.ldl_target.target_ldl}mg/dL 미만이에요.
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <Text style={{ fontSize: 26, fontWeight: '800', color: T.text3 }}>{result.ldl_target.before_ldl ?? '—'}</Text>
                      <Ionicons name="arrow-forward" size={20} color={T.text3} />
                      <Text style={{ fontSize: 30, fontWeight: '800', color: result.ldl_target.after_achieved ? T.success : T.text1 }}>
                        {result.ldl_target.after_ldl}
                      </Text>
                      <Text style={{ fontSize: 13, color: T.text2, marginTop: 6 }}>mg/dL</Text>
                    </View>
                    {result.ldl_target.after_achieved != null && (
                      <View style={{ alignSelf: 'flex-start', marginTop: 12, backgroundColor: result.ldl_target.after_achieved ? T.successBg : T.warnBg, paddingHorizontal: 12, paddingVertical: 6, borderRadius: T.radiusPill }}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: result.ldl_target.after_achieved ? T.success : T.warn }}>
                          {result.ldl_target.after_achieved
                            ? (result.ldl_target.before_achieved ? '목표 달성 유지' : '목표를 달성해요')
                            : `목표까지 ${round1(result.ldl_target.after_ldl - result.ldl_target.target_ldl)}mg/dL 남아요`}
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {(!!result.groups.resolved.length || !!result.groups.added.length) && (
                  <View style={{ backgroundColor: T.white, marginHorizontal: 16, marginTop: 8, borderRadius: T.radius, paddingHorizontal: 20, paddingVertical: 18 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: T.text1, marginBottom: 10 }}>집단군 변화</Text>
                    {!!result.groups.resolved.length && (
                      <Text style={{ fontSize: 13, color: T.success, lineHeight: 20, fontWeight: '600' }}>벗어남: {result.groups.resolved.join(' · ')}</Text>
                    )}
                    {!!result.groups.added.length && (
                      <Text style={{ fontSize: 13, color: T.warn, lineHeight: 20, fontWeight: '600', marginTop: 4 }}>새로 해당: {result.groups.added.join(' · ')}</Text>
                    )}
                  </View>
                )}

                {(() => {
                  const changed = (result.calculators ?? []).filter((c) => c.changed);
                  if (!changed.length) return null;
                  return (
                    <View style={{ backgroundColor: T.white, marginHorizontal: 16, marginTop: 8, borderRadius: T.radius, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 }}>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: T.text1, marginBottom: 4 }}>달라지는 지표 {changed.length}종</Text>
                      <Text style={{ fontSize: 12, color: T.text3, marginBottom: 12 }}>또래 백분위가 있는 지표는 내 위치가 어디로 움직이는지도 함께 볼 수 있어요.</Text>
                      {changed.map((c, i) => {
                        const moved = c.before_percentile != null && c.after_percentile != null;
                        const better = moved && c.after_percentile! < c.before_percentile!;
                        return (
                          <View key={c.key} style={[{ paddingVertical: 11 }, i > 0 && { borderTopWidth: 1, borderTopColor: T.divider }]}>
                            <Text style={{ fontSize: 14, fontWeight: '700', color: T.text1, marginBottom: 3 }}>{c.title}</Text>
                            <Text style={{ fontSize: 15, color: T.text2 }}>
                              {c.before} → <Text style={{ fontWeight: '800', color: T.text1 }}>{c.after}</Text>
                            </Text>
                            {moved && (
                              <Text style={{ fontSize: 12, color: better ? T.success : T.warn, marginTop: 3, fontWeight: '600' }}>
                                또래 상위 {c.before_percentile}% → 상위 {c.after_percentile}%
                              </Text>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  );
                })()}

                {/* 그대로인 지표 — 위 ③의 "이건 안 움직여요"와 다른 층이다. 저건 문헌 근거상
                    효과가 없다는 뜻이고, 이건 바꾼 값이 그 지표의 계산식에 아예 안 들어간다는 뜻이다.
                    조용히 빼면 "안 보이니 상관없나 보다"가 된다. */}
                {!!result.unchanged.length && (
                  <View style={{ backgroundColor: T.white, marginHorizontal: 16, marginTop: 8, borderRadius: T.radius, paddingHorizontal: 20, paddingVertical: 18 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: T.text1, marginBottom: 6 }}>그대로인 지표 {result.unchanged.length}종</Text>
                    <Text style={{ fontSize: 12, color: T.text3, lineHeight: 18 }}>
                      {result.unchanged.join(' · ')} — 이 행동으로 달라지는 값이 이 지표의 계산식에 들어가지 않아서예요.
                    </Text>
                  </View>
                )}

                <View style={{ marginHorizontal: 16, marginTop: 12, paddingHorizontal: 4 }}>
                  {/* 유지 확률 — 계산으로는 옳지만 2년 뒤에도 남아 있을 확률은 절반 이하다.
                      "다음 검진 목표"라는 틀 자체가 이 한계에 맞춰 고른 것이므로 문구로도 밝힌다. */}
                  <Text style={{ fontSize: 11, color: T.text3, lineHeight: 17, marginBottom: 4 }}>
                    · 이건 다음 한 번의 검진을 위한 목표예요. 체중 감량은 2년 안에 절반 이상이 되돌아온다는 보고가 있습니다 — 평생 유지된다는 뜻이 아닙니다.
                  </Text>
                  {result.limitations.map((l, i) => (
                    <Text key={i} style={{ fontSize: 11, color: T.text3, lineHeight: 17, marginBottom: 4 }}>· {l}</Text>
                  ))}
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
