import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { Eyebrow, FadeInUp, T } from '../components/UI';
import { computeScore } from '../data';
import type { MetricDefinition, Report, TabKey } from '../data';

// 외부 링크를 안전하게 연다 — 실패해도 조용히 죽지 않고 안내를 띄운다.
async function openExternalUrl(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('링크를 열 수 없어요', '브라우저에서 아래 주소를 직접 입력해 주세요.\n\n' + url);
  }
}

// 약국 아이콘: 아래 반쪽은 검정으로 채우고 위 반쪽은 흰색인 투톤 캡슐(알약).
// 단색 폰트 아이콘으로는 두 색을 못 내서 SVG로 직접 그린다.
function PillIcon({ size = 26, fill = T.primary, outline = T.primary }: { size?: number; fill?: string; outline?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G rotation={-45} originX={12} originY={12}>
        {/* 좌하 반쪽 — 초록 채움 */}
        <Path d="M12 8 L7 8 A4 4 0 0 0 7 16 L12 16 Z" fill={fill} stroke={outline} strokeWidth={1.6} strokeLinejoin="round" />
        {/* 우상 반쪽 — 흰색 */}
        <Path d="M12 8 L17 8 A4 4 0 0 1 17 16 L12 16 Z" fill="#fff" stroke={outline} strokeWidth={1.6} strokeLinejoin="round" />
      </G>
    </Svg>
  );
}

// svgPill이면 위 PillIcon(투톤 알약)을 렌더한다.
const QUICK_LINKS: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  svgPill?: boolean;
  color: string; bg: string; url: string | null;
}[] = [
  // 유틸리티 이동 링크는 '상태'가 아니므로 상태색(빨강/초록/주황)을 쓰지 않고
  // 앱의 무채색 원칙대로 아이콘을 검정 톤으로 통일한다. (근처 병원은 병원 느낌의 medkit 아이콘)
  { label: '검진기관\n찾기', icon: 'search-outline', color: T.primary, bg: T.primaryLight, url: 'https://www.nhis.or.kr/nhis/healthin/retrieveMdcAdminSknsClinic.do' },
  { label: '근처\n병원', icon: 'medkit-outline', color: T.primary, bg: T.primaryLight, url: 'https://www.e-gen.or.kr/egen/search_hospital.do' },
  { label: '약국\n찾기', icon: 'bandage-outline', svgPill: true, color: T.primary, bg: T.primaryLight, url: 'https://www.hira.or.kr/ra/hosp/getHealthMap.do?pgmid=HIRAA030002010000' },
  { label: '결과지\n업로드', icon: 'cloud-upload-outline', color: T.primary, bg: T.primaryLight, url: null },
];

export default function DashboardScreen({ onTab, reports, metricDefinitions, usingRealData, isPreview, onRequireLogin }: {
  onTab: (tab: TabKey) => void;
  reports: Report[];
  metricDefinitions: MetricDefinition[];
  usingRealData?: boolean;
  // 로그인 전 프리뷰 — 가짜 점수 대신 로그인 유도 카드를 보여주고, 빠른 이동만 사용 가능하게 한다.
  isPreview?: boolean;
  onRequireLogin?: () => void;
}) {
  const latest = reports[reports.length - 1];
  const abnormal = metricDefinitions.filter((m) => m.status !== '정상');
  const topAlerts = abnormal.slice(0, 4);
  const normalCount = metricDefinitions.filter((m) => m.status === '정상').length;
  const warnCount = metricDefinitions.filter((m) => m.status === '주의').length;
  const dangerCount = metricDefinitions.filter((m) => m.status === '위험').length;
  const { score } = computeScore(metricDefinitions);
  const scoreColor = score >= 70 ? T.success : score >= 40 ? T.warn : T.danger;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false} style={{ backgroundColor: T.bg }}>

      {/* 히어로 섹션 — 로그인 전에는 가짜 점수 대신 로그인 유도 카드를 보여준다. */}
      {isPreview ? (
        <FadeInUp delay={0}>
        <View style={{ backgroundColor: T.white, marginHorizontal: 16, marginTop: 12, marginBottom: 12, borderRadius: T.radius, padding: 20 }}>
          <Eyebrow>헬스에이지</Eyebrow>
          <Text style={{ fontSize: 26, fontWeight: '800', fontFamily: T.fontDisplay, color: T.text1, letterSpacing: -0.5, marginTop: 8, lineHeight: 34 }}>
            내 건강검진 결과를{'\n'}한눈에 관리해요
          </Text>
          <Text style={{ fontSize: 14, color: T.text3, lineHeight: 21, marginTop: 10, marginBottom: 20 }}>
            검진 결과지를 올리면 건강 점수와 연도별 변화, 맞춤 안내를 확인할 수 있어요. 로그인하고 시작해보세요.
          </Text>
          <Pressable onPress={onRequireLogin} style={{ height: 52, borderRadius: T.radiusMd, backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
            <Ionicons name="log-in-outline" size={19} color="#fff" />
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>로그인 / 회원가입</Text>
          </Pressable>
          <Text style={{ fontSize: 12, color: T.text3, textAlign: 'center', marginTop: 12 }}>
            로그인 없이도 아래 <Text style={{ fontWeight: '700', color: T.text2 }}>검진기관·병원·약국 찾기</Text>는 이용할 수 있어요.
          </Text>
        </View>
        </FadeInUp>
      ) : (
      <FadeInUp delay={0}>
      <View style={{ backgroundColor: T.white, marginHorizontal: 16, marginTop: 12, marginBottom: 12, borderRadius: T.radius, padding: 20 }}>
        <Eyebrow>최근 건강검진 · {latest.hospital}</Eyebrow>
        <Text style={{ fontSize: 12, color: T.text3, marginTop: 6, marginBottom: 22 }}>{latest.date}</Text>

        {/* 점수 대형 표시 — 숫자는 아주 크게, 캡션은 아주 작게 둬서 대비를 강하게 준다 */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10 }}>
          <Text style={{ fontSize: 64, fontWeight: '800', fontFamily: T.fontDisplay, color: scoreColor, lineHeight: 66, letterSpacing: -1 }}>{score}</Text>
          <Text style={{ fontSize: 15, color: T.text3, marginBottom: 14, marginLeft: 6 }}>/ 100점</Text>
        </View>

        {/* 점수 바 */}
        <View style={{ height: 6, backgroundColor: T.cardAlt, borderRadius: 3, overflow: 'hidden', marginBottom: 16 }}>
          <View style={{ width: `${score}%`, height: 6, borderRadius: 3, backgroundColor: scoreColor }} />
        </View>

        {/* 현황 3개 — 옅은 색칠 박스 없이, 색은 글자에만 사용해 구분선으로 나열 */}
        <View style={{ flexDirection: 'row' }}>
          {[
            { label: '정상', count: normalCount, color: T.success },
            { label: '주의', count: warnCount, color: T.warn },
            { label: '위험', count: dangerCount, color: T.danger },
          ].map((c, i) => (
            <View key={c.label} style={[{ flex: 1, alignItems: 'center', paddingVertical: 10 }, i > 0 && { borderLeftWidth: 1, borderLeftColor: T.divider }]}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: c.color }}>{c.count}</Text>
              <Text style={{ fontSize: 11, color: c.color, fontWeight: '500', marginTop: 2 }}>{c.label}</Text>
            </View>
          ))}
        </View>
      </View>
      </FadeInUp>
      )}

      {/* 빠른 이동 — 흰 카드 안 아이콘 행 */}
      <FadeInUp delay={90}>
      <View style={{ backgroundColor: T.white, paddingHorizontal: 20, paddingVertical: 18, marginHorizontal: 16, borderRadius: T.radius, marginBottom: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: T.text1, marginBottom: 16 }}>빠른 이동</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {QUICK_LINKS.map((link) => (
            <Pressable
              key={link.label}
              style={{ alignItems: 'center', gap: 8, flex: 1 }}
              onPress={() => {
                if (link.url) openExternalUrl(link.url);
                else if (isPreview) onRequireLogin?.();
                else onTab('upload');
              }}
            >
              <View style={{ width: 54, height: 54, borderRadius: 18, backgroundColor: T.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
                {link.svgPill
                  ? <PillIcon size={26} />
                  : <Ionicons name={link.icon} size={26} color={link.color} />}
              </View>
              <Text style={{ fontSize: 11, color: T.text2, fontWeight: '500', textAlign: 'center', lineHeight: 15 }}>{link.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      </FadeInUp>

      {/* 지금 확인할 항목 — 로그인 전(프리뷰)에는 가짜 알림을 숨긴다. */}
      {!isPreview && topAlerts.length > 0 && (
        <FadeInUp delay={180}>
        <View style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: T.text1 }}>지금 확인할 항목</Text>
            <View style={{ backgroundColor: T.dangerBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: T.radiusPill }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: T.danger }}>{abnormal.length}개 항목</Text>
            </View>
          </View>
          <Text style={{ fontSize: 12, color: T.text3, marginBottom: 12 }}>
            정상 기준을 벗어난 항목이에요. 자세한 비교는 분석 탭에서 확인할 수 있어요.
          </Text>
          {topAlerts.map((m, i) => {
            const isWarn = m.status === '주의';
            const c = isWarn ? T.warn : T.danger;
            const bg = isWarn ? T.warnBg : T.dangerBg;
            const val = latest.values[m.key];
            return (
              <View
                key={m.key}
                style={[
                  { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 14 },
                  i < topAlerts.length - 1 && { borderBottomWidth: 1, borderBottomColor: T.divider },
                ]}
              >
                <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={isWarn ? 'warning-outline' : 'alert-circle-outline'} size={20} color={c} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: T.text1 }}>{m.name}</Text>
                  <Text style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>{m.normalText}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: c }}>{val}<Text style={{ fontSize: 12, fontWeight: '500' }}>{m.unit}</Text></Text>
                  <View style={{ backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: T.radiusPill, marginTop: 4 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: c }}>{m.status}</Text>
                  </View>
                </View>
              </View>
            );
          })}
          {abnormal.length > topAlerts.length && (
            <Pressable onPress={() => onTab('analysis')} style={{ paddingVertical: 14, alignItems: 'center', borderTopWidth: 1, borderTopColor: T.divider }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: T.primary }}>나머지 {abnormal.length - topAlerts.length}개 항목 분석에서 보기 →</Text>
            </Pressable>
          )}
        </View>
        </FadeInUp>
      )}

    </ScrollView>
  );
}
