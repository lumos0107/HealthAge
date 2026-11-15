import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Chip, T } from './UI';

// 술 종류별 1잔 순알코올(g) 근사 — 순알코올 g ≈ 용량(ml) × 도수 × 0.789
//   소주  50ml × 17%  = 6.7 → 7      맥주 200ml × 4.5% = 7.1 → 7
//   막걸리 200ml × 6%  = 9.5 → 9      와인 150ml × 12%  = 14.2 → 14
//   양주   40ml × 40%  = 12.6 → 13
export const GRAMS_PER_GLASS: Record<string, number> = { 소주: 7, 맥주: 7, 막걸리: 9, 와인: 14, 양주: 13 };
export const DRINK_TYPES = ['소주', '맥주', '막걸리', '와인', '양주'] as const;

/** 칩에 함께 적는 «한 잔»의 크기. 술 이름만 두면 같은 "3잔"인데 와인을 고를 때
 *  주당 g이 두 배로 뛰는 이유를 알 수 없다 — 소주잔(50ml)이 와인잔(150ml)의 1/3이라서다.
 *  도수는 소주가 높지만 잔이 작아 순알코올은 와인이 두 배다. 그 사실이 화면에 있어야 한다. */
export const GLASS_SIZE: Record<string, string> = { 소주: '50ml', 맥주: '200ml', 막걸리: '200ml', 와인: '150ml', 양주: '40ml' };

export type Lifestyle = {
  smoking: 'never' | 'former' | 'current' | null;
  drinking: 'no' | 'yes' | null;
  alcohol_weekly_g: number;
};

export const EMPTY_LIFESTYLE: Lifestyle = { smoking: null, drinking: null, alcohol_weekly_g: 0 };

const stepBtn = { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: T.border, alignItems: 'center' as const, justifyContent: 'center' as const };

export function Stepper({ label, value, min, max, onChange, suffix, step = 1 }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; suffix: string; step?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <Text style={{ fontSize: T.fs.caption, color: T.text2, fontWeight: '600' }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Pressable hitSlop={8} onPress={() => onChange(Math.max(min, Math.round((value - step) * 10) / 10))} style={stepBtn}><Ionicons name="remove" size={18} color={T.text2} /></Pressable>
        <Text style={{ fontSize: T.fs.body, fontWeight: '700', color: T.text1, minWidth: 46, textAlign: 'center' }}>{value}{suffix}</Text>
        <Pressable hitSlop={8} onPress={() => onChange(Math.min(max, Math.round((value + step) * 10) / 10))} style={stepBtn}><Ionicons name="add" size={18} color={T.text2} /></Pressable>
      </View>
    </View>
  );
}

/** 흡연/음주/음주량 문진 폼 — 회원가입·내정보·업로드에서 공용. 최종값은 {smoking,drinking,alcohol_weekly_g}. */
export function LifestyleForm({ value, onChange, gender }: { value: Lifestyle; onChange: (v: Lifestyle) => void; gender: 1 | 2 }) {
  // 음주량 세부(주횟수/잔수/술종류)는 로컬. 프로필엔 최종 g만 저장하므로, 기존 g가 있으면 대략 역산해 초기값을 잡는다.
  const [freq, setFreq] = useState(() => (value.alcohol_weekly_g > 0 ? Math.min(7, Math.max(1, Math.round(value.alcohol_weekly_g / 21))) : 2));
  const [glasses, setGlasses] = useState(3);
  const [type, setType] = useState<(typeof DRINK_TYPES)[number]>('소주');
  const limit = gender === 2 ? 140 : 210;

  const emit = (patch: Partial<Lifestyle>) => onChange({ ...value, ...patch });
  const recalc = (f: number, g: number, t: string) => emit({ alcohol_weekly_g: Math.round(f * g * GRAMS_PER_GLASS[t]) });
  const grams = value.drinking === 'yes' ? value.alcohol_weekly_g : 0;

  return (
    <View>
      <Text style={{ fontSize: T.fs.caption, fontWeight: '600', color: T.text2, marginBottom: 10 }}>흡연</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        <Chip active={value.smoking === 'never'} label="비흡연" onPress={() => emit({ smoking: 'never' })} />
        <Chip active={value.smoking === 'former'} label="과거 흡연" onPress={() => emit({ smoking: 'former' })} />
        <Chip active={value.smoking === 'current'} label="현재 흡연" onPress={() => emit({ smoking: 'current' })} />
      </View>

      <Text style={{ fontSize: T.fs.caption, fontWeight: '600', color: T.text2, marginBottom: 10 }}>음주</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Chip active={value.drinking === 'no'} label="안 마심" onPress={() => emit({ drinking: 'no', alcohol_weekly_g: 0 })} />
        <Chip active={value.drinking === 'yes'} label="마심" onPress={() => emit({ drinking: 'yes', alcohol_weekly_g: Math.round(freq * glasses * GRAMS_PER_GLASS[type]) })} />
      </View>

      {value.drinking === 'yes' && (
        <View style={{ marginTop: 18, borderTopWidth: 1, borderTopColor: T.divider, paddingTop: 16 }}>
          <Stepper label="주 몇 회" value={freq} min={1} max={7} suffix="회" onChange={(v) => { setFreq(v); recalc(v, glasses, type); }} />
          <Stepper label="1회 몇 잔" value={glasses} min={1} max={20} suffix="잔" onChange={(v) => { setGlasses(v); recalc(freq, v, type); }} />
          <Text style={{ fontSize: T.fs.caption, fontWeight: '600', color: T.text2, marginTop: 4, marginBottom: 10 }}>주로 마시는 술</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {DRINK_TYPES.map((t) => <Chip key={t} active={type === t} label={`${t} ${GLASS_SIZE[t]}`} onPress={() => { setType(t); recalc(freq, glasses, t); }} />)}
          </View>
          {/* 고른 술의 한 잔이 몇 g인지 밝힌다 — 아래 «주당 순알코올»이 어떻게 나온 숫자인지
              보이지 않으면, 술 종류만 바꿨는데 g이 두 배가 되는 것이 오류처럼 읽힌다. */}
          <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginTop: -8, marginBottom: 14 }}>
            {type} 한 잔({GLASS_SIZE[type]})은 순알코올 약 {GRAMS_PER_GLASS[type]}g이에요. 잔이 클수록 도수가 낮아도 알코올은 많아요.
          </Text>
          <View style={{ backgroundColor: T.bg, borderRadius: T.radiusSm, padding: 14 }}>
            <Text style={{ fontSize: T.fs.caption, color: T.text2, lineHeight: 20 }}>
              주당 순알코올 약 <Text style={{ fontWeight: '700', color: grams > limit ? T.danger : T.text1 }}>{grams}g</Text>
              <Text style={{ color: T.text3 }}>  · 지방간 기준 {gender === 2 ? '여성' : '남성'} {limit}g</Text>
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
