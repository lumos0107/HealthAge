import { Ionicons } from '@expo/vector-icons';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
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
// - 브랜드 그린(#00C073)은 "누를 수 있는 것" 전용. '정상' 상태는 success/successFill로 분리
// - 상태 배지는 틴트 배경 + 상태색 텍스트 병기 (색만으로 구분 금지)
export const T = {
  // Primary = 브랜드 그린. 버튼·링크·활성 탭 등 인터랙션 전용.
  primary: '#00C073',
  primaryPressed: '#00A862',
  primaryLight: '#E6F9F1',
  primaryDark: '#00A862',
  // 초록 *글자*·링크용(흰 카드 4.9:1, 앱 배경 4.5:1). 아이콘·선은 primaryDark(3.1:1).
  primaryText: '#00814D',
  // 초록 채움 버튼 위 글자. 흰색(디자인 선택) — #00C073 위 대비는 2.4:1이라 AA 미달(큰 글자 3:1도 미달).
  onPrimary: '#FFFFFF',

  // Backgrounds — 연회색 화면 배경, 카드만 흰색
  bg: '#F3F5F7',
  white: '#FFFFFF',
  cardAlt: '#F2F4F6',

  // Text hierarchy
  text1: '#191F28',
  text2: '#4E5968',
  text3: '#66717E', // 흰 5.0:1 · 앱 배경 4.5:1 (WCAG AA)

  // 테두리는 원칙적으로 안 쓴다 — 남은 사용처를 위해 구분선과 같은 색으로.
  border: '#F2F4F6',
  divider: '#F2F4F6',

  // Semantic colors — 상태 전용(인터랙션 그린과 분리). WCAG AA(4.5:1) 기준으로 명도만 낮춘 값.
  // 흰 카드·앱 배경·틴트 배지 위에서 모두 4.5:1 이상. 글자·아이콘·차트선 공용.
  success: '#1D7F56',
  successBg: '#EAF7F1',
  warn: '#A95D05',
  warnBg: '#FFF3E7',
  danger: '#D71121',
  // 글자가 아닌 것(막대·점·선·아이콘·24px 이상 큰 숫자)용 선명한 색 — 흰 카드 위 3:1 이상(WCAG 비텍스트 기준).
  // 작은 글자에는 쓰지 않는다(그건 위의 success/warn/danger).
  successFill: '#38A86A',
  warnFill: '#FD6400',
  dangerFill: '#F44336',
  dangerBg: '#FEE9EB',

  // 글자 크기 — 역할별 토큰 (px). 화면에서 숫자를 직접 쓰지 말고 이 토큰을 쓴다.
  // 하한은 시니어 기준(본문 16 / 캡션 14 / 버튼·메뉴 18 / 제목 20~24). 14 미만 금지.
  fs: {
    caption: 14, // 보조 글자·배지·칩·단위·출처
    body: 16,    // 읽는 문장
    strong: 18,  // 버튼·메뉴·소제목
    h3: 20,      // 카드·섹션 제목
    title: 24,   // 화면 제목
  },

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

  eyebrow: { fontSize: 14, fontWeight: '700' as const, color: '#66717E', letterSpacing: 1.6, textTransform: 'uppercase' as const },
} as const;

// 이 앱은 폰 화면 전용으로 만들어졌다 — 노트북 브라우저든 태블릿 실기기든,
// 화면이 폰보다 넓으면(430 초과) 카드·차트가 그 폭 그대로 늘어나 비율이 깨진다.
// 그래서 플랫폼이 아니라 "화면이 넓은지"로 판단해 항상 430으로 고정한다.
// 430(폰 폭)이 정석이지만, 큰 태블릿(예: 갤럭시탭 S10+ 세로 폭 약 970)에서
// 여백이 너무 크다는 요청으로 700까지 늘렸다. 카드·차트는 여전히 이 값을
// 고정폭으로 쓰므로, 700을 넘는 화면에서는 그만큼 좌우 여백이 남는다.
export const PHONE_WIDTH = 700;
export const W = Math.min(Dimensions.get('window').width, PHONE_WIDTH);

// RN의 Modal은 웹에서는 document.body로 별도 포탈되어 화면(App.tsx)에 씌운 폰 폭
// 래퍼 바깥으로 빠져나가고, 네이티브 태블릿에서는 애초에 래퍼 자체가 화면 전체 폭이라
// 마찬가지로 넓게 뜬다. 둘 다 이 프레임으로 한 번 더 감싸야 비율이 맞는다.
export function WebFrame({ children, backgroundColor = T.bg, wide = false }: { children: React.ReactNode; backgroundColor?: string; wide?: boolean }) {
  // wide: 태블릿 반응형 화면 — 폰 폭으로 가두지 않고 화면 전체를 쓴다.
  if (wide || Dimensions.get('window').width <= PHONE_WIDTH) return <>{children}</>;
  return (
    <View style={{ flex: 1, alignItems: 'center', backgroundColor: '#d9dce1', height: Platform.OS === 'web' ? ('100vh' as any) : '100%' }}>
      <View style={{ flex: 1, width: PHONE_WIDTH, maxWidth: '100%' as any, backgroundColor }}>
        {children}
      </View>
    </View>
  );
}

// 차트 폭 — 모바일은 기존처럼 폰 폭(W) 기준 고정값을 쓰고, 태블릿은 카드 안에서 실제로 잰 폭을 쓴다.
// 차트 컴포넌트는 useChartW(기본폭)로 폭을 받고, 태블릿 화면은 <MeasuredChart>로 감싸 실제 폭을 내려준다.
export const ChartWidthContext = createContext<number | null>(null);
export function useChartW(defaultW: number) {
  const w = useContext(ChartWidthContext);
  return w ?? defaultW;
}
export function MeasuredChart({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const [w, setW] = useState(0);
  return (
    <View style={[{ alignSelf: 'stretch' }, style]} onLayout={(e) => setW(Math.floor(e.nativeEvent.layout.width))}>
      {w > 0 ? <ChartWidthContext.Provider value={w}>{children}</ChartWidthContext.Provider> : null}
    </View>
  );
}

// ─── Status helpers ──────────────────────────────────────
export function statusColor(status: Status) {
  if (status === '정상') return { color: T.success, bg: T.successBg };
  if (status === '주의') return { color: T.warn, bg: T.warnBg };
  return { color: T.danger, bg: T.dangerBg };
}

// ─── Components ──────────────────────────────────────────

/** Collapsible section — hides secondary content behind a tap, keeping screens uncluttered
 *
 *  ⚠️ **새로 쓰지 말 것. 접는 것은 `v2.Expandable`을 쓴다.** (사용처 0건, 2026-08-03 확인)
 *  기록 39에서 「한 화면에 접는 방법이 둘이면 사용자가 다른 기능으로 읽는다」는 이유로
 *  앱 전체의 접기를 Expandable 한 모양으로 통일했다. 이건 그 이전 컴포넌트다.
 *  지우지 않는 이유는 내가 만든 것이 아니어서일 뿐이다 — 쓰면 통일이 깨진다. */
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
          <Text style={{ fontSize: T.fs.body, fontWeight: '700', color: T.text1 }}>{title}</Text>
          {badge ? (
            <View style={{ backgroundColor: T.primaryLight, paddingHorizontal: 8, paddingVertical: 2, borderRadius: T.radiusPill }}>
              <Text style={{ fontSize: T.fs.caption, fontWeight: '600', color: T.primaryText }}>{badge}</Text>
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
      <Text style={{ fontSize: T.fs.caption, fontWeight: '600', color }}>{status}</Text>
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
      <Text style={{ fontSize: T.fs.strong, fontWeight: '700', color: T.text1 }}>{title}</Text>
      {action ? (
        <Pressable hitSlop={8} onPress={onAction}>
          <Text style={{ fontSize: T.fs.caption, fontWeight: '600', color: T.primaryText }}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Board({ title, children, attention, style }: { title: string; children: React.ReactNode; attention?: boolean; style?: ViewStyle }) {
  return (
    <View style={[ui.card, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Text style={{ fontSize: T.fs.strong, fontWeight: '700', color: T.text1 }}>{title}</Text>
        {attention && (
          <View style={{ backgroundColor: T.dangerBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: T.radiusPill }}>
            <Text style={{ fontSize: T.fs.caption, fontWeight: '600', color: T.danger }}>주의 포함</Text>
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
    <Pressable hitSlop={8} style={[ui.secondaryBtn, danger && { backgroundColor: T.dangerBg }]} onPress={onPress}>
      <Text style={[ui.secondaryBtnText, danger && { color: T.danger }]}>{label}</Text>
    </Pressable>
  );
}

export function GhostBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable hitSlop={8} style={ui.ghostBtn} onPress={onPress}>
      <Text style={ui.ghostBtnText}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable hitSlop={8} style={[ui.chip, active && ui.chipActive]} onPress={onPress}>
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
      {hint ? <Text style={{ fontSize: T.fs.caption, color: T.text3, marginTop: 5 }}>{hint}</Text> : null}
      {error ? <Text style={{ fontSize: T.fs.caption, color: T.danger, marginTop: 4, fontWeight: '600' }}>확인 필요</Text> : null}
    </View>
  );
}

export function FieldDisplay({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={ui.fieldLabel}>{label}</Text>
      <View style={[ui.fieldInput, { backgroundColor: T.cardAlt, justifyContent: 'center' }]}>
        <Text style={{ fontSize: T.fs.body, color: T.text2 }}>{value || '—'}</Text>
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
        <Text style={{ width: 72, fontSize: T.fs.caption, color: T.text3, fontWeight: '500' }}>{label}</Text>
        <View style={{ flex: 1, height: 6, backgroundColor: T.divider, borderRadius: 3, overflow: 'hidden' }}>
          <View style={{ width: `${Math.min(100, Math.max(3, width))}%`, height: 6, backgroundColor: color, borderRadius: 3 }} />
        </View>
        <Text style={{ width: 90, fontSize: T.fs.caption, color: T.text1, fontWeight: '700', textAlign: 'right' }}>{valueText}</Text>
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
/** 태블릿 2열 격자 칸 안에 그려지는 중인지. 칸 안의 카드는 바깥 여백을 버리고 칸 높이를 채운다
 *  (분석 탭 2뎁스 격자 — 히스토리 태블릿 «항목별로 보기»와 같은 모양). */
export const GridCellContext = createContext(false);

export function FadeInUp({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  const inCell = useContext(GridCellContext);
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 480, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);
  return (
    <Animated.View style={[{ opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }, inCell && { flexGrow: 1 }]}>
      {children}
    </Animated.View>
  );
}

/** 단순히 옅게 사라졌다 나타나는 페이드 — 탭 전환이나 새로고침처럼 위치 이동 없이 갱신될 때 쓴다 */
/** 그래프 «그려지는» 애니메이션 진행도 0→1. key가 바뀌면 처음부터 다시 그린다(탭·항목 전환).
 *  연도를 고르는 것처럼 같은 그래프 안의 조작에는 key를 바꾸지 말 것 — 만질 때마다 다시 그려진다.
 *  SVG 속성은 네이티브 드라이버를 못 쓰므로 JS로 값을 받아 state로 돌린다(480~900ms, 프레임 수가 적다).
 *  쓰는 법: ClipPath의 Rect width = 전체 폭 × 진행도 → 선·점·값이 왼쪽부터 드러난다. */
export function useChartReveal(key: string | number, duration = 900, delay = 0): number {
  const anim = useRef(new Animated.Value(0)).current;
  const [p, setP] = useState(0);
  useEffect(() => {
    anim.setValue(0);
    const id = anim.addListener(({ value }) => setP(value));
    Animated.timing(anim, { toValue: 1, duration, delay, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => anim.removeListener(id);
  }, [key]);
  return p;
}

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
        {/* 홈 히어로와 같은 표기("/ 100점") — 같은 점수인데 화면마다 단위가 달랐다. */}
        <Text style={{ fontSize: T.fs.strong, color: T.text3, marginBottom: 10, marginLeft: 4 }}>/ {max}점</Text>
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
    { label: '정상 기준', value: normalValue, barColor: T.successFill, textColor: T.success },
    ...(peerMean != null ? [{ label: '또래 평균', value: peerMean, barColor: T.text3, textColor: T.text2 }] : []),
  ];

  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <Text style={{ fontSize: T.fs.caption, color: T.text3, fontWeight: '500' }}>{dirIcon}</Text>
        <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color }}>{valueText}</Text>
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
      <Text style={{ width: 56, fontSize: T.fs.caption, color: T.text3, fontWeight: '600' }}>{row.label}</Text>
      <View style={{ flex: 1, height: 10, backgroundColor: T.bg, borderRadius: 5, overflow: 'hidden' }}>
        <Animated.View
          style={{
            width: widthAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
            height: 10, borderRadius: 5,
            backgroundColor: row.barColor,
          }}
        />
      </View>
      <Text style={{ width: 64, textAlign: 'right', fontSize: T.fs.caption, fontWeight: row.bold ? '700' : '600', color: row.textColor }}>
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
  pageSubtitle: { fontSize: T.fs.caption, color: T.text3, lineHeight: 20, marginTop: 6 },
  notice: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: T.cardAlt, borderRadius: T.radiusSm,
    padding: 14, marginBottom: 14,
  },
  noticeText: { flex: 1, fontSize: T.fs.caption, lineHeight: 20, color: T.text2, fontWeight: '500' },
  primaryBtn: {
    backgroundColor: T.primary,
    height: 52,
    borderRadius: T.radiusMd,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  primaryBtnText: { color: T.onPrimary, fontWeight: '700', fontSize: T.fs.strong },
  secondaryBtn: {
    backgroundColor: T.cardAlt,
    height: 54,
    borderRadius: T.radiusMd,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  secondaryBtnText: { color: T.primaryText, fontWeight: '700', fontSize: T.fs.strong },
  ghostBtn: { height: 48, borderRadius: T.radiusMd, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  ghostBtnText: { color: T.text3, fontWeight: '600', fontSize: T.fs.strong },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: T.radiusPill,
    backgroundColor: T.cardAlt,
  },
  chipActive: { backgroundColor: T.primaryLight },
  chipText: { fontSize: T.fs.caption, fontWeight: '500', color: T.text3 },
  chipTextActive: { color: T.primaryText, fontWeight: '700' },
  fieldLabel: { fontSize: T.fs.caption, fontWeight: '600', color: T.text2, marginBottom: 8 },
  fieldInput: {
    height: 52,
    borderWidth: 0,
    borderRadius: T.radiusSm,
    paddingHorizontal: 16,
    fontSize: T.fs.body,
    color: T.text1,
    backgroundColor: T.cardAlt,
  },
});
