import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { T } from './UI';
import { simulateCheckup } from '../health';
import { simulateDemo } from '../dummyAnalysis';
import type { RealSimulation, SimulateChanges } from '../health';
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

// 한국 지침 원문 기준 1잔 순알코올 g(소주·맥주). 잔 수 환산에만 쓴다.
const GRAMS_PER_DRINK = 7;

type EffectKey = keyof SimulateChanges;

/** 한 행동이 한 수치에 주는 변화 — 항상 범위다(점추정은 개인차를 감춘다). 음수 = 감소. */
type Effect = { key: EffectKey; label: string; unit: string; lo: number; hi: number };

type Ctx = {
  values: Report['values'];
  gender: 1 | 2;
  weightKg: number | null;
  smoking?: 'never' | 'former' | 'current' | null;
  alcoholWeeklyG: number;
  /** 저염·절주 효과크기는 고혈압군 기준이라, 정상혈압이면 그대로 쓰면 과대평가가 된다. */
  hypertensive: boolean;
};

type ActionDef = {
  id: string;
  /** 행동 그 자체. "혈당을 낮추기"가 아니라 "체중 3.5kg 줄이기"처럼 사람이 할 수 있는 것. */
  title: (c: Ctx) => string;
  detail: (c: Ctx) => string;
  applies: (c: Ctx) => boolean;
  effects: (c: Ctx) => Effect[];
  /** "이건 안 움직입니다"도 정보다(근거문서 §6-9). */
  noEffect?: string[];
  /** 이 행동에 반드시 따라붙어야 하는 경고. 빠뜨리면 화면이 위험한 조언이 된다. */
  caution?: string;
  source: string;
  grade: 'A' | 'B';
};

const round1 = (n: number) => Math.round(n * 10) / 10;

const ACTIONS: ActionDef[] = [
  {
    id: 'weight',
    // 체중 감량은 8개 수치를 동시에 움직이는 가장 넓은 지렛대다(근거문서 §3-1).
    title: (c) => `체중 ${round1(c.weightKg! * 0.05)}kg 줄이기 (5%)`,
    detail: (c) => `지금 ${c.weightKg}kg에서 ${round1(c.weightKg! * 0.95)}kg으로. 대한고혈압학회는 최소 4~5kg를 1차 목표로 제시해요.`,
    applies: (c) => c.weightKg != null && c.weightKg > 40,
    effects: (c) => {
      const kg = c.weightKg! * 0.05;
      const e: Effect[] = [];
      // KSH 2026 표14: 1kg당 수축기 −1.1 / 이완기 −0.9. 다만 5kg 미만 감량은 효과가
      // 작아(−2.70 vs −6.63) 그대로 곱하면 과대평가라, 범위의 아래쪽을 넉넉히 잡는다.
      if (c.values.sbp != null) e.push({ key: 'sbp', label: '수축기 혈압', unit: '', lo: -kg * 1.1, hi: -kg * 0.7 });
      if (c.values.dbp != null) e.push({ key: 'dbp', label: '이완기 혈압', unit: '', lo: -kg * 0.9, hi: -kg * 0.6 });
      // 일본인 코호트(n=2,635) — A등급 중 유일한 동아시아인 표본. 성별로 계수가 다르다.
      if (c.values.waist != null) {
        const per = c.gender === 2 ? 0.94 : 1.15;
        e.push({ key: 'waist', label: '허리둘레', unit: 'cm', lo: -kg * per, hi: -kg * per * 0.7 });
      }
      // 한국지질·동맥경화학회 2022: 1kg당 중성지방 −1.5mg/dL(또는 −1.9%).
      if (c.values.triglyceride != null) e.push({ key: 'tg', label: '중성지방', unit: '', lo: -kg * 1.9, hi: -kg * 1.1 });
      // 같은 지침: 3~5% 감량에 HDL +2~3(총량이며 kg당이 아니다).
      if (c.values.hdl != null) e.push({ key: 'hdl', label: 'HDL 콜레스테롤', unit: '', lo: 2, hi: 3 });
      return e;
    },
    noEffect: [
      'LDL 콜레스테롤은 체중을 줄여도 거의 안 움직여요. 5% 감량에 −5mg/dL 수준입니다 — LDL은 체중보다 포화지방 비중이 좌우해요.',
      '공복혈당은 한국 지침에 감량 1kg당 계수가 없어 여기에 넣지 않았어요.',
    ],
    caution: '주 1kg 넘게 빼지 마세요. 급격한 감량은 간 염증·섬유화를 악화시킬 수 있고 급성 간부전 사례도 보고됐어요(대한간학회 2021).',
    source: '대한고혈압학회 2026 표14 · 한국지질·동맥경화학회 2022 · 일본인 코호트 n=2,635',
    grade: 'A',
  },
  {
    id: 'aerobic',
    title: () => '유산소 운동 주 150분 이상',
    detail: () => '빠르게 걷기·자전거 같은 유산소를 회차당 30분 넘게, 주 5일 이상.',
    applies: () => true,
    effects: (c) => {
      const e: Effect[] = [];
      // KSH 2018 지침 Table 10 — 30~50분 · 주 5일 이상 기준.
      if (c.values.sbp != null) e.push({ key: 'sbp', label: '수축기 혈압', unit: '', lo: -4.9, hi: -3.0 });
      if (c.values.dbp != null) e.push({ key: 'dbp', label: '이완기 혈압', unit: '', lo: -3.7, hi: -2.0 });
      // Kodama 메타분석 — 주 120분 이상 & 회당 30분 초과일 때만 나온 값이라 조건을 detail에 적었다.
      if (c.values.hdl != null) e.push({ key: 'hdl', label: 'HDL 콜레스테롤', unit: '', lo: 1.5, hi: 2.5 });
      if (c.values.triglyceride != null) {
        const tg = c.values.triglyceride;
        e.push({ key: 'tg', label: '중성지방', unit: '', lo: -tg * 0.05, hi: -tg * 0.02 });
      }
      return e;
    },
    noEffect: [
      '공복혈당은 유산소 단독으로는 유의한 변화가 없었어요. 저항운동이나 유산소+저항 병행이 필요합니다.',
      '간 수치(ALT·AST)도 운동만으로는 안 내려가요. 식이를 함께 바꿔야 합니다(식이 단독 −4.5 / 운동 병행 −13.3 U/L).',
    ],
    source: '대한고혈압학회 2018 Table 10 · Kodama 메타분석(HDL)',
    grade: 'A',
  },
  {
    id: 'sodium',
    title: () => '소금 하루 3g 줄이기',
    detail: () => '한국인 평균 8g에서 지침 목표 5g(나트륨 2,000mg)까지. 국·찌개 국물과 김치가 절반을 차지해요.',
    // 정상혈압에서는 효과가 훨씬 작아 이 계수를 쓸 수 없다 — 고혈압군에만 제시한다.
    applies: (c) => c.hypertensive,
    effects: (c) => {
      const e: Effect[] = [];
      if (c.values.sbp != null) e.push({ key: 'sbp', label: '수축기 혈압', unit: '', lo: -6, hi: -4 });
      if (c.values.dbp != null) e.push({ key: 'dbp', label: '이완기 혈압', unit: '', lo: -3, hi: -2 });
      return e;
    },
    source: '대한고혈압학회 2026 제6판 (고혈압군 기준)',
    grade: 'A',
  },
  {
    id: 'alcohol',
    title: (c) => `술 끊거나 주 ${Math.max(1, Math.round(c.alcoholWeeklyG / GRAMS_PER_DRINK / 2))}잔 이하로 줄이기`,
    detail: (c) => `지금 주 ${Math.round(c.alcoholWeeklyG / GRAMS_PER_DRINK)}잔(순알코올 ${c.alcoholWeeklyG}g) 수준이에요.`,
    // ⚠️ 근거문서 §6-4: 하루 2잔 이하 음주자에게 "절주하면 혈압이 내려간다"고 말하면 안 된다.
    //    메타분석에서 ≤2잔 군은 효과가 없었다. 여기서 걸러야 없는 효과를 약속하지 않는다.
    applies: (c) => c.alcoholWeeklyG / 7 / GRAMS_PER_DRINK > 2,
    effects: (c) => {
      const perDay = c.alcoholWeeklyG / 7 / GRAMS_PER_DRINK;
      // 하루 잔수 층별 효과(메타분석). 층을 뭉개면 소량 음주자를 과대평가한다.
      const [sLo, sHi] = perDay >= 6 ? [-5.5, -3.0] : perDay >= 4 ? [-3.0, -1.5] : [-1.2, -0.6];
      const [dLo, dHi] = perDay >= 6 ? [-3.97, -2.0] : perDay >= 4 ? [-1.88, -1.0] : [-1.09, -0.5];
      const e: Effect[] = [];
      if (c.values.sbp != null) e.push({ key: 'sbp', label: '수축기 혈압', unit: '', lo: sLo, hi: sHi });
      if (c.values.dbp != null) e.push({ key: 'dbp', label: '이완기 혈압', unit: '', lo: dLo, hi: dHi });
      // 1일 알코올 1g당 중성지방 −0.2mg/dL.
      if (c.values.triglyceride != null) {
        const g = c.alcoholWeeklyG / 7;
        e.push({ key: 'tg', label: '중성지방', unit: '', lo: -g * 0.2, hi: -g * 0.1 });
      }
      return e;
    },
    noEffect: ['감마-GTP는 여기 수치로 세지 않았지만, 술을 끊으면 4~8주에 걸쳐 정상화되는 것으로 알려져 있어요(반감기 26일).'],
    source: '음주-혈압 메타분석(잔수 층별) · 한국지질·동맥경화학회 2022',
    grade: 'A',
  },
  {
    id: 'quit_smoking',
    // ⚠️ "담배를 줄이기"는 절대 제시하지 않는다 — 한국지질 2022: 흡연량을 줄이는 것은
    //    향후 금연 가능성을 높이지 못하고 오히려 금연을 어렵게 하여 권장되지 않는다.
    title: () => '담배 끊기',
    detail: () => '줄이는 것 말고 끊는 것이에요. 흡연량을 줄이는 방식은 금연을 오히려 어렵게 해 권장되지 않아요.',
    applies: (c) => c.smoking === 'current',
    effects: (c) => {
      const e: Effect[] = [];
      // 금연 3~6주에 최대, 이후 감쇠.
      if (c.values.hdl != null) e.push({ key: 'hdl', label: 'HDL 콜레스테롤', unit: '', lo: 2.3, hi: 4.1 });
      return e;
    },
    noEffect: [
      '금연의 가장 큰 이득은 검진 수치가 아니라 심혈관 사건·사망 위험 감소예요. 이 표에 안 나온다고 효과가 작은 게 아닙니다.',
    ],
    // 한국 지침 3종이 금연 후 체중 증가를 명시한다. 이 경고 없이 수치만 보여주면
    // 금연이 "살 찌는 행동"으로 읽힌다.
    caution: '금연 후 12개월에 평균 4.7kg 늘어납니다. 체중 관리를 함께 하지 않으면 허리둘레·혈당·중성지방이 오히려 나빠질 수 있어요.',
    source: 'Forey 메타분석(HDL) · 한국 진료지침 3종(체중 증가)',
    grade: 'B',
  },
];

/** 기준을 벗어난 항목 — "① 지금 뭐가 걸리나". 판정은 그 해 기록에 저장된 것을 그대로 쓴다. */
const WATCH: { key: keyof Report['values']; label: string; unit: string }[] = [
  { key: 'waist', label: '허리둘레', unit: 'cm' },
  { key: 'sbp', label: '수축기 혈압', unit: '' },
  { key: 'dbp', label: '이완기 혈압', unit: '' },
  { key: 'glucose', label: '공복혈당', unit: '' },
  { key: 'triglyceride', label: '중성지방', unit: '' },
  { key: 'hdl', label: 'HDL 콜레스테롤', unit: '' },
  { key: 'ldl', label: 'LDL 콜레스테롤', unit: '' },
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

  const actions = useMemo(() => ACTIONS.filter((a) => a.applies(ctx) && a.effects(ctx).length > 0), [ctx]);
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
        const base = e.key === 'fbs' ? latest.values.glucose : e.key === 'tg' ? latest.values.triglyceride : latest.values[e.key as keyof Report['values']];
        if (typeof base !== 'number') continue;
        // hi가 '변화가 작은 쪽'이 되도록 각 effect에서 lo=큰 변화, hi=작은 변화로 넣어 두었다.
        (changes as any)[e.key] = round1(base + e.hi);
      }
      if (!Object.keys(changes).length) { setError('이 행동으로 움직이는 검진 항목이 이번 회차에 없어요.'); return; }
      setResult(demoMode ? simulateDemo(latest, changes) : await simulateCheckup(changes));
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
        <Pressable
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
                하나만 골라주세요. 여러 행동의 효과는 그대로 더할 수 없어요 — 대부분 체중을 통해 겹쳐서 작용하거든요.
              </Text>
              {actions.length === 0 ? (
                <Text style={{ fontSize: 13, color: T.text3, lineHeight: 19 }}>
                  지금 정보로 제시할 수 있는 행동이 없어요. 내정보에서 몸무게·흡연·음주를 입력하면 더 정확해집니다.
                </Text>
              ) : actions.map((a) => {
                const on = a.id === picked;
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
                    <Text style={{ fontSize: 14, fontWeight: '700', color: on ? T.primary : T.text1 }}>{a.title(ctx)}</Text>
                    <Text style={{ fontSize: 12, color: T.text3, lineHeight: 18, marginTop: 3 }}>{a.detail(ctx)}</Text>
                  </Pressable>
                );
              })}
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
                    const base = e.key === 'fbs' ? latest.values.glucose : e.key === 'tg' ? latest.values.triglyceride : latest.values[e.key as keyof Report['values']];
                    // lo/hi는 '변화가 큰 쪽/작은 쪽'이라 부호에 따라 대소가 뒤집힌다. 읽을 때는 늘 작은 수부터.
                    const dMin = Math.min(e.lo, e.hi), dMax = Math.max(e.lo, e.hi);
                    return (
                      <View key={e.key} style={{ paddingVertical: 9, borderTopWidth: 1, borderTopColor: T.divider }}>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: T.text1 }}>{e.label}</Text>
                          <Text style={{ fontSize: 14, color: T.text2 }}>
                            {base}{e.unit} → <Text style={{ fontWeight: '800', color: T.text1 }}>
                              {round1((base as number) + dMin)}~{round1((base as number) + dMax)}{e.unit}
                            </Text>
                          </Text>
                        </View>
                        <Text style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>{fmt(dMin)} ~ {fmt(dMax)}{e.unit}</Text>
                      </View>
                    );
                  })}
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
                  <Pressable
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
