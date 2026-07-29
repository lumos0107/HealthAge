import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import type { Status } from '../data';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── 디자인 시스템 v2: 토스 구조 × 뱅샐 그린 ─────────────────
// - 연회색 배경(#F3F5F7) 위 흰 카드(radius 20, 무테두리·무그림자)로 영역 구분
// - 브랜드 그린(#00C073)은 "누를 수 있는 것" 전용. '정상' 상태는 #3CB371로 분리
// - 상태 배지는 틴트 배경 + 상태색 텍스트 병기 (색만으로 구분 금지)
export const T = {
  // Primary = 브랜드 그린. 버튼·링크·활성 탭 등 인터랙션 전용.
  primary: '#00C073',
  primaryPressed: '#00A862',
  primaryLight: '#E6F9F1',
  primaryDark: '#00A862',

  // Backgrounds — 연회색 화면 배경, 카드만 흰색
  bg: '#F3F5F7',
  white: '#FFFFFF',
  cardAlt: '#F2F4F6',

  // Text hierarchy
  text1: '#191F28',
  text2: '#4E5968',
  text3: '#8B95A1',

  // 테두리는 원칙적으로 안 쓴다 — 남은 사용처를 위해 구분선과 같은 색으로.
  border: '#F2F4F6',
  divider: '#F2F4F6',

  // Semantic colors — 상태 전용(인터랙션 그린과 분리).
  // 채도는 백업본 톤(#3CB371/#FF8A3D/#F44336)을 따른다 — 낮춘 버전(#1F8A5D/#D97706/#F04452)은 흐릿하다는 피드백.
  success: '#3CB371',
  successBg: '#EAF7F1',
  warn: '#FF8A3D',
  warnBg: '#FFF3E7',
  danger: '#F44336',
  dangerBg: '#FEE9EB',

  // Radius — 카드 20 · 버튼 14 · 입력 12 · 칩 999
  radius: 20,
  radiusMd: 14,
  radiusSm: 12,
  radiusPill: 999,

  // 그림자 없음 — 배경 대비로만 구분
  shadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },

  fontDisplay: 'Pretendard',

  eyebrow: { fontSize: 11, fontWeight: '700' as const, color: '#8B95A1', letterSpacing: 1.6, textTransform: 'uppercase' as const },
} as const;

export const W = Dimensions.get('window').width;

// ─── Status helpers ──────────────────────────────────────
export function statusColor(status: Status) {
  if (status === '정상') return { color: T.success, bg: T.successBg };
  if (status === '주의') return { color: T.warn, bg: T.warnBg };
  return { color: T.danger, bg: T.dangerBg };
}

// ─── Components ──────────────────────────────────────────

/** Collapsible section — hides secondary content behind a tap, keeping screens uncluttered */
export function Collapsible({ title, children, defaultOpen, badge }: { title: string; children: React.ReactNode; defaultOpen?: boolean; badge?: string }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => !v);
  };
  return (
    <View>
      <Pressable onPress={toggle} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: T.text1 }}>{title}</Text>
          {badge ? (
            <View style={{ backgroundColor: T.primaryLight, paddingHorizontal: 8, paddingVertical: 2, borderRadius: T.radiusPill }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: T.primary }}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={T.text3} />
      </Pressable>
      {open ? <View style={{ paddingBottom: 14 }}>{children}</View> : null}
    </View>
  );
}

export function StatusBadge({ status }: { status: Status }) {
  const { color, bg } = statusColor(status);
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: T.radiusPill, backgroundColor: bg }}>
      <Text style={{ fontSize: 11, fontWeight: '600', color }}>{status}</Text>
    </View>
  );
}

export const Badge = StatusBadge;

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[ui.card, style]}>{children}</View>;
}

export const Panel = Card;

export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={ui.pageTitle}>{title}</Text>
      {subtitle ? <Text style={ui.pageSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export const PageTitle = SectionHeader;

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <Text style={T.eyebrow}>{children}</Text>;
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginTop: 8 }}>
      <Text style={{ fontSize: 18, fontWeight: '700', color: T.text1 }}>{title}</Text>
      {action ? (
        <Pressable onPress={onAction}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: T.primary }}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Board({ title, children, attention, style }: { title: string; children: React.ReactNode; attention?: boolean; style?: ViewStyle }) {
  return (
    <View style={[ui.card, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Text style={{ fontSize: 17, fontWeight: '700', color: T.text1 }}>{title}</Text>
        {attention && (
          <View style={{ backgroundColor: T.dangerBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: T.radiusPill }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: T.danger }}>주의 포함</Text>
          </View>
        )}
      </View>
      {children}
    </View>
  );
}

export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <View style={ui.notice}>
      <Ionicons name="information-circle" size={18} color={T.text2} style={{ marginRight: 8, marginTop: 1 }} />
      <Text style={ui.noticeText}>{typeof children === 'string' ? children : ''}</Text>
      {typeof children !== 'string' ? children : null}
    </View>
  );
}

export function PageTitle2({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={ui.pageTitle}>{title}</Text>
      {subtitle ? <Text style={ui.pageSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function PrimaryBtn({ label, onPress, disabled, loading }: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean }) {
  return (
    <Pressable
      style={[ui.primaryBtn, (disabled || loading) && { backgroundColor: T.text3 }]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={ui.primaryBtnText}>{label}</Text>}
    </Pressable>
  );
}

export function SecondaryBtn({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable style={[ui.secondaryBtn, danger && { backgroundColor: T.dangerBg }]} onPress={onPress}>
      <Text style={[ui.secondaryBtnText, danger && { color: T.danger }]}>{label}</Text>
    </Pressable>
  );
}

export function GhostBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={ui.ghostBtn} onPress={onPress}>
      <Text style={ui.ghostBtnText}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable style={[ui.chip, active && ui.chipActive]} onPress={onPress}>
      <Text style={[ui.chipText, active && ui.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>{children}</View>;
}

export function FieldInput({ label, required, error, hint, ...props }: TextInputProps & { label: string; required?: boolean; error?: boolean; hint?: string }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={ui.fieldLabel}>
        {label}
        {required ? <Text style={{ color: T.danger }}> *</Text> : null}
      </Text>
      <TextInput
        style={[ui.fieldInput, error && { borderColor: T.danger, borderWidth: 1.5 }]}
        placeholderTextColor={T.text3}
        autoCapitalize="none"
        {...props}
      />
      {hint ? <Text style={{ fontSize: 12, color: T.text3, marginTop: 5 }}>{hint}</Text> : null}
      {error ? <Text style={{ fontSize: 12, color: T.danger, marginTop: 4, fontWeight: '600' }}>확인 필요</Text> : null}
    </View>
  );
}

export function FieldDisplay({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={ui.fieldLabel}>{label}</Text>
      <View style={[ui.fieldInput, { backgroundColor: T.cardAlt, justifyContent: 'center' }]}>
        <Text style={{ fontSize: 15, color: T.text2 }}>{value || '—'}</Text>
      </View>
    </View>
  );
}

export function Divider({ style }: { style?: ViewStyle }) {
  return <View style={[{ height: 1, backgroundColor: T.divider }, style]} />;
}

export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>;
}

export function SpaceBetween({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, style]}>{children}</View>;
}

export function ListRow({ children, last, style }: { children: React.ReactNode; last?: boolean; style?: ViewStyle }) {
  return (
    <View style={[{ paddingVertical: 15 }, !last && { borderBottomWidth: 1, borderBottomColor: T.divider }, style]}>
      {children}
    </View>
  );
}

export function MetricBar({ label, value, width, color, valueText }: {
  label: string; value: number; width: number; color: string; valueText: string;
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Row style={{ marginBottom: 5 }}>
        <Text style={{ width: 72, fontSize: 12, color: T.text3, fontWeight: '500' }}>{label}</Text>
        <View style={{ flex: 1, height: 6, backgroundColor: T.divider, borderRadius: 3, overflow: 'hidden' }}>
          <View style={{ width: `${Math.min(100, Math.max(3, width))}%`, height: 6, backgroundColor: color, borderRadius: 3 }} />
        </View>
        <Text style={{ width: 90, fontSize: 12, color: T.text1, fontWeight: '700', textAlign: 'right' }}>{valueText}</Text>
      </Row>
    </View>
  );
}

/**
 * 방향성 막대 그래프 — 정상 기준선을 가운데 기준점으로 두고
 * 내 수치가 그 기준에서 어느 방향으로, 얼마나 떨어져 있는지 보여준다.
 * 화살표(▲낮으면/▼높으면/◆범위) 로 "어느 방향이 위험한지"를 함께 알려준다.
 */
/**
 * 점수를 0에서부터 채워 올라가며 보여주고, 점수 바도 함께 그려지듯 차오르게 한다.
 * 연도를 바꿀 때마다 다시 처음부터 채워져서, 딱딱하게 숫자만 바뀌는 것보다 변화가 잘 느껴진다.
 */
/** 화면 진입 시 카드가 살짝 떠오르며 나타나는 등장 애니메이션 — 여러 화면에서 공통으로 쓴다 */
export function FadeInUp({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 480, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);
  return (
    <Animated.View style={{ opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>
      {children}
    </Animated.View>
  );
}

/** 단순히 옅게 사라졌다 나타나는 페이드 — 탭 전환이나 새로고침처럼 위치 이동 없이 갱신될 때 쓴다 */
export function FadeIn({ children, delay = 0, duration = 420 }: { children: React.ReactNode; delay?: number; duration?: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);
  return <Animated.View style={{ opacity: anim }}>{children}</Animated.View>;
}

export function AnimatedScore({ score, color, max = 100 }: { score: number; color: string; max?: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    anim.setValue(0);
    const id = anim.addListener(({ value }) => setDisplay(Math.round(value)));
    Animated.timing(anim, {
      toValue: score,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => anim.removeListener(id);
  }, [score]);

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10 }}>
        <Text style={{ fontSize: 64, fontWeight: '700', color, lineHeight: 68 }}>{display}</Text>
        <Text style={{ fontSize: 18, color: T.text3, marginBottom: 10, marginLeft: 4 }}>/ {max}</Text>
      </View>
      <View style={{ height: 8, backgroundColor: T.bg, borderRadius: 4, overflow: 'hidden' }}>
        <Animated.View
          style={{
            width: anim.interpolate({ inputRange: [0, max], outputRange: ['0%', '100%'], extrapolate: 'clamp' }),
            height: 8, backgroundColor: color, borderRadius: 4,
          }}
        />
      </View>
    </View>
  );
}

/**
 * 한 줄짜리 슬라이더형 막대 대신, "내 수치 / 정상 기준 / 또래 평균"을 각각 자기 줄에 막대로 나란히 그려서
 * 비교한다. 글자와 마커가 한 트랙 위에서 겹칠 일이 없어 누구나 한눈에 비교할 수 있다.
 */
export function DirectionalBar({
  myValue, normalValue, peerMean, max, color, valueText, direction,
}: {
  myValue: number; normalValue: number; peerMean?: number | null; max: number; color: string; valueText: string;
  direction: 'high' | 'low' | 'range';
}) {
  const dirIcon = direction === 'high' ? '▼ 낮을수록 안전' : direction === 'low' ? '▲ 높을수록 안전' : '◆ 기준 범위가 안전';
  const safeMax = Math.max(myValue, normalValue, peerMean ?? 0, max, 1) * 1.08;
  const pct = (v: number) => Math.min(100, Math.max(0, (v / safeMax) * 100));

  // 정상 기준·또래 평균은 흐릿한 톤 대신 분명히 구분되는 색을 써서, 한눈에 봐도 세 막대가 또렷이 비교되도록 한다.
  const rows: { label: string; value: number; barColor: string; borderColor?: string; textColor: string; bold?: boolean }[] = [
    { label: '내 수치', value: myValue, barColor: color, textColor: color, bold: true },
    { label: '정상 기준', value: normalValue, barColor: T.success, textColor: T.success },
    ...(peerMean != null ? [{ label: '또래 평균', value: peerMean, barColor: T.text3, textColor: T.text2 }] : []),
  ];

  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <Text style={{ fontSize: 11, color: T.text3, fontWeight: '500' }}>{dirIcon}</Text>
        <Text style={{ fontSize: 13, fontWeight: '700', color }}>{valueText}</Text>
      </View>
      <View style={{ gap: 7 }}>
        {rows.map((row, i) => (
          <AnimatedBarRow key={row.label} row={row} pct={Math.max(3, pct(row.value))} delay={i * 110} />
        ))}
      </View>
    </View>
  );
}

/** 막대가 0에서 목표 길이까지 그려지는 애니메이션 — 화면이 굳어 보이지 않도록 부드럽게 채워진다. */
function AnimatedBarRow({ row, pct, delay }: {
  row: { label: string; value: number; barColor: string; textColor: string; bold?: boolean };
  pct: number;
  delay: number;
}) {
  const widthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    widthAnim.setValue(0);
    Animated.timing(widthAnim, {
      toValue: pct,
      duration: 650,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // width(%) 애니메이션은 레이아웃 속성이라 네이티브 드라이버를 쓸 수 없다
    }).start();
  }, [pct, delay]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text style={{ width: 56, fontSize: 11, color: T.text3, fontWeight: '600' }}>{row.label}</Text>
      <View style={{ flex: 1, height: 10, backgroundColor: T.bg, borderRadius: 5, overflow: 'hidden' }}>
        <Animated.View
          style={{
            width: widthAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
            height: 10, borderRadius: 5,
            backgroundColor: row.barColor,
          }}
        />
      </View>
      <Text style={{ width: 64, textAlign: 'right', fontSize: 12, fontWeight: row.bold ? '700' : '600', color: row.textColor }}>
        {row.value}
      </Text>
    </View>
  );
}

const ui = StyleSheet.create({
  card: {
    backgroundColor: T.white,
    borderRadius: T.radius,
    padding: 20,
    marginBottom: 12,
  },
  pageTitle: { fontSize: 34, fontWeight: '800', fontFamily: T.fontDisplay, color: T.text1, letterSpacing: -0.5, marginTop: 6 },
  pageSubtitle: { fontSize: 13, color: T.text3, lineHeight: 19, marginTop: 6 },
  notice: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: T.cardAlt, borderRadius: T.radiusSm,
    padding: 14, marginBottom: 14,
  },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 20, color: T.text2, fontWeight: '500' },
  primaryBtn: {
    backgroundColor: T.primary,
    height: 52,
    borderRadius: T.radiusMd,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryBtn: {
    backgroundColor: T.cardAlt,
    height: 54,
    borderRadius: T.radiusMd,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  secondaryBtnText: { color: T.primary, fontWeight: '700', fontSize: 15 },
  ghostBtn: { height: 48, borderRadius: T.radiusMd, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  ghostBtnText: { color: T.text3, fontWeight: '600', fontSize: 15 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: T.radiusPill,
    backgroundColor: T.cardAlt,
  },
  chipActive: { backgroundColor: T.primaryLight },
  chipText: { fontSize: 14, fontWeight: '500', color: T.text3 },
  chipTextActive: { color: T.primary, fontWeight: '700' },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: T.text2, marginBottom: 8 },
  fieldInput: {
    height: 52,
    borderWidth: 0,
    borderRadius: T.radiusSm,
    paddingHorizontal: 16,
    fontSize: 15,
    color: T.text1,
    backgroundColor: T.cardAlt,
  },
});
