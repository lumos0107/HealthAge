import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { T } from './UI';
import { Stepper } from './LifestyleForm';
import { simulateCheckup } from '../health';
import { simulateDemo } from '../dummyAnalysis';
import type { RealSimulation, SimulateChanges } from '../health';
import type { Report } from '../data';

// 조정 가능한 항목 — 전부 최근 검진 리포트에 실제로 들어 있는 값이다.
// (체중은 백엔드가 지원하지만 앱 리포트에 신장·체중이 없어 화면에서는 다루지 않는다.)
// higherBetter: HDL만 올라가는 게 개선이다. 이 표시가 없으면 HDL을 올렸을 때
// 개선인데도 경고색으로 보인다.
const CONTROLS: { key: keyof SimulateChanges; label: string; from: keyof Report['values'];
                  min: number; max: number; step: number; suffix: string; higherBetter?: boolean }[] = [
  { key: 'waist', label: '허리둘레', from: 'waist', min: 60, max: 130, step: 1, suffix: 'cm' },
  { key: 'sbp', label: '수축기 혈압', from: 'sbp', min: 90, max: 200, step: 1, suffix: '' },
  { key: 'dbp', label: '이완기 혈압', from: 'dbp', min: 50, max: 130, step: 1, suffix: '' },
  { key: 'fbs', label: '공복혈당', from: 'glucose', min: 60, max: 250, step: 1, suffix: '' },
  { key: 'tg', label: '중성지방', from: 'triglyceride', min: 40, max: 600, step: 5, suffix: '' },
  { key: 'hdl', label: 'HDL 콜레스테롤', from: 'hdl', min: 20, max: 100, step: 1, suffix: '', higherBetter: true },
  { key: 'ldl', label: 'LDL 콜레스테롤', from: 'ldl', min: 40, max: 250, step: 5, suffix: '' },
];

/** 대사증후군 충족 개수 전/후 — 이 화면의 핵심 숫자. */
function MsDiff({ before, after }: { before: number | null; after: number | null }) {
  const improved = before != null && after != null && after < before;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Text style={{ fontSize: 30, fontWeight: '800', color: T.text3 }}>{before ?? '—'}</Text>
      <Ionicons name="arrow-forward" size={20} color={T.text3} />
      <Text style={{ fontSize: 34, fontWeight: '800', color: improved ? T.success : T.text1 }}>{after ?? '—'}</Text>
      <Text style={{ fontSize: 14, color: T.text2, marginTop: 8 }}>/ 5개 기준</Text>
    </View>
  );
}

export function WhatIfSimulator({ latest, disabled, disabledReason, demoMode }: {
  latest: Report;
  disabled?: boolean;
  disabledReason?: string;
  /** 데모 계정 — 서버 재계산을 쓸 수 없어 앱 안에서 다시 센다(simulateDemo 주석 참고). */
  demoMode?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, number>>({});
  const [result, setResult] = useState<RealSimulation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 모달을 열 때마다 최근 검진값으로 초기화한다 — 기준선이 화면에 보이는 값과 같아야 한다.
  const openModal = () => {
    const init: Record<string, number> = {};
    for (const c of CONTROLS) {
      const v = latest.values[c.from];
      if (typeof v === 'number') init[c.key] = v;
    }
    setValues(init); setResult(null); setError(''); setOpen(true);
  };

  const run = async () => {
    setLoading(true); setError('');
    try {
      // 바뀐 항목만 보낸다 — 그대로인 값은 서버가 최근 검진값을 쓴다.
      const changes: SimulateChanges = {};
      for (const c of CONTROLS) {
        const base = latest.values[c.from];
        if (values[c.key] != null && values[c.key] !== base) (changes as any)[c.key] = values[c.key];
      }
      if (!Object.keys(changes).length) { setError('바꾼 값이 없어요. 위 항목을 조정한 뒤 다시 계산해주세요.'); return; }
      setResult(demoMode ? simulateDemo(latest, changes) : await simulateCheckup(changes));
    } catch (e) {
      setError(e instanceof Error ? `재계산에 실패했어요: ${e.message}` : '재계산에 실패했어요.');
    } finally {
      setLoading(false);
    }
  };

  const changedCalcs = (result?.calculators ?? []).filter((c) => c.changed);

  return (
    <>
      <View style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingVertical: 20, marginBottom: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: T.text1, marginBottom: 4 }}>이 수치가 바뀌면?</Text>
        <Text style={{ fontSize: 13, color: T.text2, lineHeight: 20, marginBottom: 14 }}>
          다음 검진에서 값이 이렇게 나오면 지표가 어떻게 달라지는지 다시 계산해볼 수 있어요.
          공식으로 계산하는 것이라 예측이 아니에요.
          {'\n'}
          {/* 서버는 '가장 최근' 저장 검진값을 기준선으로 쓴다 — 위에서 다른 연도를 골라도 여기만 최신이라
              밖에서는 알 길이 없었다. 카드 겉면에 기준 연도를 못 박는다. */}
          <Text style={{ color: T.text3 }}>기준은 가장 최근 검진인 {latest.year}년 값이에요.</Text>
        </Text>
        <Pressable
          onPress={disabled ? undefined : openModal}
          style={{ height: 50, borderRadius: T.radiusPill, alignItems: 'center', justifyContent: 'center', backgroundColor: disabled ? T.bg : T.primary }}
        >
          <Text style={{ fontSize: 15, fontWeight: '700', color: disabled ? T.text3 : '#fff' }}>수치 바꿔보기</Text>
        </Pressable>
        {(disabled || demoMode) && !!disabledReason && (
          <Text style={{ fontSize: 11, color: T.text3, marginTop: 8, lineHeight: 16 }}>{disabledReason}</Text>
        )}
      </View>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: T.bg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 52, paddingBottom: 14, backgroundColor: T.white, borderBottomWidth: 1, borderBottomColor: T.divider }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: T.text1 }}>수치 바꿔보기</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={12}><Ionicons name="close" size={24} color={T.text2} /></Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
            <View style={{ backgroundColor: T.white, marginHorizontal: 16, marginTop: 12, borderRadius: T.radius, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 }}>
              <Text style={{ fontSize: 13, color: T.text2, marginBottom: 16 }}>
                기준은 {latest.year}년 검진값이에요. 바꾸고 싶은 항목만 조정하세요.
              </Text>
              {CONTROLS.map((c) => {
                const base = latest.values[c.from];
                const cur = values[c.key];
                if (typeof base !== 'number' || cur == null) return null;
                const diff = Math.round((cur - base) * 10) / 10;
                return (
                  <View key={c.key}>
                    <Stepper
                      label={c.label}
                      value={cur}
                      min={c.min}
                      max={c.max}
                      step={c.step}
                      suffix={c.suffix}
                      onChange={(v) => setValues((p) => ({ ...p, [c.key]: v }))}
                    />
                    {diff !== 0 && (
                      <Text style={{ fontSize: 11, color: (c.higherBetter ? diff > 0 : diff < 0) ? T.success : T.warn, marginTop: -8, marginBottom: 12 }}>
                        {latest.year}년 {base} → {cur} ({diff > 0 ? '+' : ''}{diff})
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>

            <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
              <Pressable
                onPress={loading ? undefined : run}
                style={{ height: 54, borderRadius: T.radiusPill, alignItems: 'center', justifyContent: 'center', backgroundColor: T.primary, opacity: loading ? 0.6 : 1 }}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>{loading ? '다시 계산하는 중...' : '다시 계산'}</Text>
              </Pressable>
            </View>

            {!!error && (
              <Text style={{ fontSize: 13, color: T.danger, marginHorizontal: 20, marginTop: 14, lineHeight: 19 }}>{error}</Text>
            )}

            {result && !result.error && (
              <>
                <View style={{ backgroundColor: T.white, marginHorizontal: 16, marginTop: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingVertical: 20 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: T.text1, marginBottom: 12 }}>대사증후군 기준 충족</Text>
                  <MsDiff before={result.metabolic_syndrome.before.count} after={result.metabolic_syndrome.after.count} />
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

                {/* LDL 개인 목표 — 백엔드도 데모(simulateDemo)도 계속 보내주고 타입에도 있었는데
                    그리는 코드가 없어 화면에 한 번도 나온 적이 없다. 결과가 '대사증후군만' 보이던
                    이유 중 하나다. 목표선을 넘었는지/넘겼는지가 LDL을 조정하는 유일한 이유이므로
                    대사증후군 바로 다음에 놓는다. */}
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
                            : `목표까지 ${result.ldl_target.after_ldl - result.ldl_target.target_ldl}mg/dL 남아요`}
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

                {!!changedCalcs.length && (
                  <View style={{ backgroundColor: T.white, marginHorizontal: 16, marginTop: 8, borderRadius: T.radius, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: T.text1, marginBottom: 4 }}>달라지는 지표 {changedCalcs.length}종</Text>
                    <Text style={{ fontSize: 12, color: T.text3, marginBottom: 12 }}>또래 백분위가 있는 지표는 내 위치가 어디로 움직이는지도 함께 볼 수 있어요.</Text>
                    {changedCalcs.map((c, i) => {
                      const pctMoved = c.before_percentile != null && c.after_percentile != null;
                      const better = pctMoved && c.after_percentile! < c.before_percentile!;
                      return (
                        <View key={c.key} style={[{ paddingVertical: 11 }, i > 0 && { borderTopWidth: 1, borderTopColor: T.divider }]}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: T.text1, marginBottom: 3 }}>{c.title}</Text>
                          <Text style={{ fontSize: 15, color: T.text2 }}>
                            {c.before} → <Text style={{ fontWeight: '800', color: T.text1 }}>{c.after}</Text>
                          </Text>
                          {pctMoved && (
                            <Text style={{ fontSize: 12, color: better ? T.success : T.warn, marginTop: 3, fontWeight: '600' }}>
                              또래 상위 {c.before_percentile}% → 상위 {c.after_percentile}%
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}

                {!!result.unchanged.length && (
                  <View style={{ backgroundColor: T.white, marginHorizontal: 16, marginTop: 8, borderRadius: T.radius, paddingHorizontal: 20, paddingVertical: 18 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: T.text1, marginBottom: 6 }}>그대로인 지표 {result.unchanged.length}종</Text>
                    <Text style={{ fontSize: 12, color: T.text3, lineHeight: 18 }}>
                      {result.unchanged.join(' · ')} — 바꾼 값이 이 지표의 계산식에 들어가지 않아서예요.
                    </Text>
                  </View>
                )}

                <View style={{ marginHorizontal: 16, marginTop: 12, paddingHorizontal: 4 }}>
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
