import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Circle, G, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { Eyebrow, FadeInUp, MeasuredChart, StatusBadge, T, useChartW } from '../components/UI';
import { categoryVisual, ScoreCalcNote, scoreTone, SquircleIcon } from '../components/v2';
import { computeScore } from '../data';
import type { MetricDefinition, MetricKey, Report, TabKey } from '../data';
import { headline, scoreSeries, statusCounts, top3Alerts } from '../interpret';
import { useLayout } from '../responsive';
import { scoreConclusion } from './HistoryScreen';

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
  color: string; url: string | null;
}[] = [
  // 유틸리티 이동 링크는 '상태'가 아니므로 상태색(빨강/초록/주황)을 쓰지 않는다.
  // 빠른 접근 아이콘은 앱 브랜드 색상(초록)을 사용한다. (근처 병원은 병원 느낌의 medkit 아이콘)
  { label: '검진기관\n찾기', icon: 'search-outline', color: T.primary, url: 'https://www.nhis.or.kr/nhis/healthin/retrieveMdcAdminSknsClinic.do' },
  { label: '근처\n병원', icon: 'medkit-outline', color: T.primary, url: 'https://www.e-gen.or.kr/egen/search_hospital.do' },
  { label: '약국\n찾기', icon: 'bandage-outline', svgPill: true, color: T.primary, url: 'https://www.hira.or.kr/ra/hosp/getHealthMap.do?pgmid=HIRAA030002010000' },
  { label: '결과지\n업로드', icon: 'cloud-upload-outline', color: T.primary, url: null },
];

// 점수 변화 미리보기(태블릿 홈) — 구간 띠(70↑ 양호 · 40↑ 주의 · 그 아래 관리 필요) 위에 선 하나,
// 처음·바닥·지금만 연도를 단다. 폭은 카드에서 잰 값을 쓴다.
function ScoreMiniChart({ series }: { series: { year: number; score: number }[] }) {
  const w = useChartW(300);
  const H = 130;
  const pad = 6;
  const n = series.length;
  const plotW = w - pad * 2;
  const x = (i: number) => pad + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => 4 + (1 - v / 100) * (H - 4 - 26);
  let trough = 0;
  for (let i = 1; i < n; i++) if (series[i].score <= series[trough].score) trough = i;
  const idx = Array.from(new Set([0, trough, n - 1]));
  const anchor = (i: number) => (i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle');
  const desc = `점수 추이: ${series.map((p) => `${p.year}년 ${p.score}점`).join(', ')}`;
  return (
    <Svg width={w} height={H} accessible accessibilityLabel={desc}>
      <Rect x={pad} y={y(100)} width={plotW} height={y(70) - y(100)} fill={T.successBg} />
      <Rect x={pad} y={y(70)} width={plotW} height={y(40) - y(70)} fill={T.warnBg} />
      <Rect x={pad} y={y(40)} width={plotW} height={y(0) - y(40)} fill={T.dangerBg} />
      <Polyline points={series.map((p, i) => `${x(i)},${y(p.score)}`).join(' ')} fill="none" stroke={T.text1} strokeWidth={2.6} strokeLinejoin="round" />
      {idx.map((i) => <Circle key={i} cx={x(i)} cy={y(series[i].score)} r={i === n - 1 ? 5.5 : 4} fill={i === n - 1 ? T.warnFill : T.text1} />)}
      {idx.map((i) => <SvgText key={`t${i}`} x={x(i)} y={H - 6} fontSize={T.fs.caption} fill={T.text2} textAnchor={anchor(i) as any}>{series[i].year}</SvgText>)}
    </Svg>
  );
}

export default function DashboardScreen({ onTab, reports, metricDefinitions, usingRealData, isPreview, onRequireLogin, onOpenDetail }: {
  onTab: (tab: TabKey) => void;
  reports: Report[];
  metricDefinitions: MetricDefinition[];
  usingRealData?: boolean;
  // 로그인 전 프리뷰 — 가짜 점수 대신 로그인 유도 카드를 보여주고, 빠른 이동만 사용 가능하게 한다.
  isPreview?: boolean;
  onRequireLogin?: () => void;
  onOpenDetail?: (key: MetricKey, year: number) => void;
}) {
  const { isTablet } = useLayout();
  const latest = reports[reports.length - 1];
  const top3 = top3Alerts(metricDefinitions);
  // 검사항목 탭과 같은 기준(statusCounts) — 판정 대상이 아닌 참고 항목(키·몸무게)은 세지 않는다.
  const counts = statusCounts(metricDefinitions);
  const { score, manageCount, trackCount } = computeScore(metricDefinitions);
  const { color: scoreColor, fill: scoreFill, bg: scoreBg, label: scoreLabel } = scoreTone(score);

  // 카드 바깥 여백 — 모바일은 좌우 16, 태블릿은 본문 패딩(28)이 대신하므로 0.
  const mh = isTablet ? 0 : 16;
  const series = scoreSeries(reports);

  // ── 카드들 — 모바일(1열)과 태블릿(2열)이 같은 카드를 다른 자리에 놓는다.
  const previewCard = (
    <View style={{ backgroundColor: T.white, marginHorizontal: mh, borderRadius: T.radius, padding: isTablet ? 24 : 20, marginBottom: 12, marginTop: isTablet ? 0 : 10 }}>
      <Eyebrow>헬스에이지</Eyebrow>
      <Text style={{ fontSize: T.fs.title, fontWeight: '800', fontFamily: T.fontDisplay, color: T.text1, letterSpacing: -0.5, marginTop: 8, lineHeight: 34 }}>
        내 건강검진 결과를{'\n'}한눈에 관리해요
      </Text>
      <Text style={{ fontSize: T.fs.caption, color: T.text3, lineHeight: 21, marginTop: 10, marginBottom: 20 }}>
        검진 결과지를 올리면 건강 점수와 연도별 변화, 맞춤 안내를 확인할 수 있어요. 로그인하고 시작해보세요.
      </Text>
      <Pressable hitSlop={8} onPress={onRequireLogin} style={{ height: 52, borderRadius: T.radiusPill, backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
        <Ionicons name="log-in-outline" size={19} color="#fff" />
        <Text style={{ fontSize: T.fs.strong, fontWeight: '700', color: T.onPrimary }}>로그인 / 회원가입</Text>
      </Pressable>
      <Text style={{ fontSize: T.fs.caption, color: T.text3, textAlign: 'center', marginTop: 12 }}>
        로그인 없이도 아래 <Text style={{ fontWeight: '700', color: T.text2 }}>검진기관·병원·약국 찾기</Text>는 이용할 수 있어요.
      </Text>
    </View>
  );

  const heroCard = (
    <View style={{ backgroundColor: T.white, marginHorizontal: mh, borderRadius: T.radius, paddingHorizontal: isTablet ? 24 : 20, paddingVertical: 24, marginBottom: isTablet ? 0 : 12, marginTop: isTablet ? 0 : 10, flex: isTablet ? 1 : undefined }}>
      {/* 히어로 다이어트 — 판단 1번(배지)·정량 1번(점수)·구성 1번(범례)만. */}
      {/* 태블릿은 제목 줄(위)이 연도·병원을 말하므로 카드 안에서는 뺀다. */}
      {!isTablet && (
        <Text style={{ fontSize: T.fs.strong, fontWeight: '800', color: T.text1 }}>
          {latest.year}년 · {latest.hospital}
        </Text>
      )}

      {/* 무슨 점수인지부터 — 점수를 처음 만나는 화면인데 라벨 없이 큰 숫자만 있었다(분석 탭에는 있었다). */}
      <Text style={{ fontSize: isTablet ? T.fs.body : T.fs.caption, color: isTablet ? T.text2 : T.text3, fontWeight: '500', marginTop: isTablet ? 0 : 14 }}>참고 점수</Text>

      {/* 점수 + 판단 배지 한 행 */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 4, marginBottom: 18 }}>
        <Text style={{ fontSize: 72, fontWeight: '800', fontFamily: T.fontDisplay, color: scoreFill, lineHeight: 76, letterSpacing: -1 }}>{score}</Text>
        <Text style={{ fontSize: T.fs.body, color: T.text3, marginBottom: 12, marginLeft: 6 }}>/ 100점</Text>
        <View style={{ backgroundColor: scoreBg, paddingHorizontal: 12, paddingVertical: 5, borderRadius: T.radiusPill, marginLeft: 12, marginBottom: 12 }}>
          <Text style={{ fontSize: T.fs.caption, fontWeight: '700', color: scoreColor }}>{scoreLabel}</Text>
        </View>
      </View>

      {/* 점수 바 — 22/100의 위치감. 그래프는 이거 하나만, 분포는 문장으로만 말한다. */}
      <View style={{ height: 10, backgroundColor: T.cardAlt, borderRadius: 5, overflow: 'hidden', marginBottom: 18 }}>
        <View style={{ width: `${score}%`, height: 10, borderRadius: 5, backgroundColor: scoreFill }} />
        {/* 구간 눈금 — 배지 기준(40 미만 관리 필요 · 70 이상 양호)의 경계 */}
        {[40, 70].map((t) => (
          <View key={t} style={{ position: 'absolute', left: `${t}%`, top: 0, bottom: 0, width: 3, backgroundColor: T.white }} />
        ))}
      </View>

      {/* 구성 — 검사항목 카드 헤더와 같은 점 범례 한 줄 */}
      <View style={{ flexDirection: 'row', gap: 14 }}>
        {[
          { label: '정상', count: counts.정상, color: T.successFill },
          { label: '주의', count: counts.주의, color: T.warnFill },
          { label: '위험', count: counts.위험, color: T.dangerFill },
        ].map((c) => (
          <View key={c.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: c.color }} />
            <Text style={{ fontSize: T.fs.caption, color: T.text2 }}>{c.label} <Text style={{ fontWeight: '700', color: T.text1 }}>{c.count}</Text></Text>
          </View>
        ))}
      </View>

      {/* 계산 방법 — 분석 탭과 같은 블록. 점수를 보여주는 화면은 모두 설명을 단다. */}
      <View style={{ marginTop: 18 }}>
        <ScoreCalcNote score={score} manageCount={manageCount} trackCount={trackCount} />
      </View>
    </View>
  );

  // 빠른 이동 — 다른 섹션과 같은 흰 카드로.
  // ⚠️ 모바일에서는 점수와 TOP 3 «사이»에 둔다. 한 번 위로 올려봤다가 되돌린 자리다(2026-08-02).
  //   축 4의 «홈은 심각도 순»은 판단 요소끼리(점수 → TOP 3)의 순서를 말하는 것이지,
  //   도구 카드까지 뒤로 밀라는 뜻이 아니다. 태블릿은 점수·TOP 3가 나란히 서므로 그 아래 한 줄로 둔다.
  const quickCard = (
    <View style={{ backgroundColor: T.white, borderRadius: T.radius, paddingHorizontal: 20, paddingVertical: 18, marginHorizontal: mh, marginBottom: 12 }}>
      <Text style={{ fontSize: isTablet ? T.fs.h3 : T.fs.body, fontWeight: isTablet ? '800' : '700', color: T.text1, marginBottom: 16 }}>빠른 이동</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: isTablet ? 12 : 0 }}>
        {QUICK_LINKS.map((link) => (
          <Pressable hitSlop={8}
            key={link.label}
            accessibilityRole="button"
            accessibilityLabel={link.label.replace('\n', '')}
            style={isTablet
              ? { flex: 1, minHeight: 104, borderRadius: T.radiusMd, backgroundColor: T.cardAlt, alignItems: 'center', justifyContent: 'center', gap: 8 }
              : { alignItems: 'center', gap: 8, flex: 1 }}
            onPress={() => {
              if (link.url) openExternalUrl(link.url);
              else if (isPreview) onRequireLogin?.();
              else onTab('upload');
            }}
          >
            <View style={{ width: 54, height: 54, borderRadius: 18, backgroundColor: isTablet ? 'transparent' : T.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
              {link.svgPill
                ? <PillIcon size={26} />
                : <Ionicons name={link.icon} size={26} color={link.color} />}
            </View>
            <Text style={{ fontSize: isTablet ? T.fs.body : T.fs.caption, color: isTablet ? T.text1 : T.text2, fontWeight: isTablet ? '700' : '500', textAlign: 'center', lineHeight: 20 }}>
              {isTablet ? link.label.replace('\n', ' ') : link.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  // 지금 주의할 항목 TOP 3 — 1뎁스에는 수치를 두지 않는다. 탭하면 바로 항목 상세(2뎁스).
  const top3Card = (
    <View style={{ backgroundColor: T.white, marginHorizontal: mh, borderRadius: T.radius, paddingHorizontal: isTablet ? 24 : 20, paddingTop: 20, paddingBottom: 8, marginBottom: isTablet ? 0 : 12, flex: isTablet ? 1 : undefined }}>
      <Text style={{ fontSize: isTablet ? T.fs.h3 : T.fs.strong, fontWeight: isTablet ? '800' : '700', color: T.text1, marginBottom: 4 }}>지금 주의할 항목 TOP 3</Text>
      <Text style={{ fontSize: T.fs.caption, color: isTablet ? T.text2 : T.text3, marginBottom: 8 }}>가장 먼저 확인하면 좋은 항목이에요.</Text>
      {top3.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 20 }}>
          <Ionicons name="checkmark-circle" size={36} color={T.success} />
          <Text style={{ fontSize: T.fs.body, fontWeight: '700', color: T.success, marginTop: 8 }}>모두 정상이에요</Text>
          <Text style={{ fontSize: T.fs.caption, color: T.text3, marginTop: 3 }}>지금의 생활습관을 유지해보세요.</Text>
        </View>
      ) : top3.map((m, i) => {
        const visual = categoryVisual(m.category);
        return (
          <Pressable
            key={m.key}
            onPress={() => onOpenDetail?.(m.key, latest.year)}
            accessibilityRole="button"
            style={[{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12, minHeight: 64 },
                    i < top3.length - 1 && { borderBottomWidth: 1, borderBottomColor: T.divider }]}
          >
            <Text style={{ width: 16, fontSize: T.fs.body, fontWeight: '700', color: T.text3 }}>{i + 1}</Text>
            {!isTablet && <SquircleIcon icon={visual.icon} color={visual.color} bg={visual.bg} />}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: T.fs.body, fontWeight: '700', color: T.text1 }}>{m.name}</Text>
              <Text style={{ fontSize: T.fs.caption, color: T.text2, marginTop: 2 }}>{headline(m, latest.values[m.key])}</Text>
            </View>
            <StatusBadge status={m.status} />
            <Ionicons name="chevron-forward" size={18} color={T.text3} />
          </Pressable>
        );
      })}
      {/* 전체 보기 — 하단 탭 '검사항목'으로 이동 */}
      <Pressable onPress={() => onTab('records')} accessibilityRole="button" style={{ minHeight: 56, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: T.divider }}>
        <Text style={{ fontSize: isTablet ? T.fs.strong : T.fs.caption, fontWeight: isTablet ? '700' : '600', color: T.primaryText }}>전체 항목 보기</Text>
      </Pressable>
    </View>
  );

  // 점수 변화 미리보기 — 태블릿 시안에서 새로 넣은 카드. 기록이 2회 이상일 때만 의미가 있다.
  const changeCard = series.length >= 2 ? (() => {
    const concl = scoreConclusion(series);
    const first = series[0];
    const last = series[series.length - 1];
    let trough = 0;
    for (let i = 1; i < series.length; i++) if (series[i].score <= series[trough].score) trough = i;
    const mid = trough !== 0 && trough !== series.length - 1 ? ` → ${series[trough].year}년 ${series[trough].score}점` : '';
    return (
      <View style={{ backgroundColor: T.white, borderRadius: T.radius, paddingHorizontal: 24, paddingVertical: 22, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 24 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: T.fs.h3, fontWeight: '800', color: T.text1 }}>점수 변화</Text>
          <Text style={{ fontSize: T.fs.strong, fontWeight: '800', color: T.text1, marginTop: 10, lineHeight: 27 }}>
            {concl.lead}<Text style={{ color: concl.ink }}>{concl.main}</Text>
          </Text>
          <Text style={{ fontSize: T.fs.caption, color: T.text2, marginTop: 4, lineHeight: 21 }}>
            {first.year}년 {first.score}점{mid} → {last.year}년 {last.score}점
          </Text>
          <Pressable onPress={() => onTab('history')} accessibilityRole="button" style={{ alignSelf: 'flex-start', minHeight: 48, paddingHorizontal: 20, borderRadius: T.radiusMd, backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center', marginTop: 14 }}>
            <Text style={{ fontSize: T.fs.strong, fontWeight: '700', color: T.onPrimary }}>히스토리 보기</Text>
          </Pressable>
        </View>
        <View style={{ flex: 1, minWidth: 0, maxWidth: 360 }}>
          <MeasuredChart><ScoreMiniChart series={series} /></MeasuredChart>
        </View>
      </View>
    );
  })() : null;

  // ── 태블릿: 제목 줄 → (점수 | TOP 3) → 빠른 이동 → 점수 변화
  if (isTablet) {
    return (
      <ScrollView contentContainerStyle={{ paddingHorizontal: 28, paddingTop: 28, paddingBottom: 40, gap: 12 }} showsVerticalScrollIndicator={false} style={{ backgroundColor: T.bg, ...({ wordBreak: 'keep-all' } as any) }}>
        {/* 오른쪽 위에는 내 정보 버튼(App)이 떠 있어서 그 자리를 비워 둔다. */}
        <View style={{ paddingRight: 64 }}>
          <Text style={{ fontSize: T.fs.title, fontWeight: '800', color: T.text1, lineHeight: 32 }}>
            {isPreview ? '헬스에이지' : `${latest.year}년 건강검진`}
          </Text>
          <Text style={{ fontSize: T.fs.body, color: T.text2, marginTop: 2 }}>
            {isPreview ? '건강검진 관리 서비스' : latest.hospital}
          </Text>
        </View>
        {isPreview ? (
          <View style={{ gap: 0 }}>{previewCard}{quickCard}</View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'stretch' }}>
              {heroCard}
              {top3Card}
            </View>
            {quickCard}
            {changeCard}
            <Text style={{ fontSize: T.fs.caption, color: T.text3, textAlign: 'center', marginTop: 4 }}>참고용이에요. 걱정되면 의료진과 상담해 보세요.</Text>
          </>
        )}
      </ScrollView>
    );
  }

  // ── 모바일(기존 그대로)
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false} style={{ backgroundColor: T.bg }}>
      {/* 히어로 섹션 — 로그인 전에는 가짜 점수 대신 로그인 유도 카드를 보여준다. */}
      <FadeInUp delay={0}>{isPreview ? previewCard : heroCard}</FadeInUp>
      <FadeInUp delay={90}>{quickCard}</FadeInUp>
      {!isPreview && <FadeInUp delay={180}>{top3Card}</FadeInUp>}
    </ScrollView>
  );
}
