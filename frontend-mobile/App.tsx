import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
// RN 내장 SafeAreaView는 iOS 전용(안드로이드에선 no-op) — 상태바/제스처바 겹침 방지를 위해 safe-area-context 사용
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { apiFetch, getAccessToken, supabase, supabaseConfigured } from './src/api';
import { C, Chip, ChipRow, FieldInput, PrimaryBtn, T } from './src/components/UI';
import { EMPTY_LIFESTYLE, LifestyleForm, type Lifestyle } from './src/components/LifestyleForm';
import { initialProfile, initialSettings, profileBirthFromDate, reports as dummyReports, metricDefinitions as dummyMetricDefinitions, metricsForReport } from './src/data';
import type { UserProfile, UserSettings, Report, MetricDefinition, MedicationItem, MetricKey } from './src/data';
import { dummyComboAnalysis, dummyRecommendations, dummyInsight, dummyHighlights, dummyChangePace } from './src/dummyAnalysis';
import { fetchAllReports, latestEvaluationsAsMetricDefinitions, fetchTimeseries, latestRecommendations, latestComboAnalysis, fetchEgfr, refreshTimeseries, fetchMedications, deleteAccount as deleteAccountApi } from './src/health';
import type { RealTimeseries, RealRecommendations, RealEgfr, RealComboAnalysis } from './src/health';
import AnalysisScreen from './src/screens/AnalysisScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import MetricDetailScreen from './src/screens/MetricDetailScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import RecordsScreen from './src/screens/RecordsScreen';
import UploadScreen from './src/screens/UploadScreen';

type AppTab = 'dashboard' | 'records' | 'analysis' | 'upload' | 'profile';

const TABS: Array<{ key: AppTab; label: string; icon: keyof typeof Ionicons.glyphMap; activeIcon: keyof typeof Ionicons.glyphMap }> = [
  { key: 'dashboard', label: '홈', icon: 'home-outline', activeIcon: 'home' },
  { key: 'records', label: '검사항목', icon: 'list-outline', activeIcon: 'list' },
  { key: 'analysis', label: '분석', icon: 'pulse-outline', activeIcon: 'pulse' },
  { key: 'upload', label: '업로드', icon: 'cloud-upload-outline', activeIcon: 'cloud-upload' },
];

// 모든 Text 의 기본 글꼴을 Pretendard 로 주입 (입력 style 단계에서 최하위로 넣어 web/native 모두 안전.
// 명시적 fontFamily 는 그대로 우선, 폰트 미로드 시 시스템 폰트로 폴백)
const AnyText = Text as any;
if (AnyText.render && !AnyText.__pretendardPatched) {
  const _origRender = AnyText.render;
  AnyText.render = function (props: any, ref: any) {
    return _origRender.call(this, { ...props, style: [{ fontFamily: 'Pretendard' }, props?.style] }, ref);
  };
  AnyText.__pretendardPatched = true;
}

export default function App() {
  // 전체 글꼴을 Pretendard(가변)로 통일. 아래 Text 패치가 모든 텍스트에 기본 적용한다.
  const [fontsLoaded] = useFonts({ Pretendard: require('./assets/fonts/PretendardVariable.ttf') });

  const [loggedIn, setLoggedIn] = useState(false);
  // root/1234 데모(개발자) 계정 여부 — Supabase 설정과 무관하게 더미 데이터로 시연할 때 쓴다.
  const [demoMode, setDemoMode] = useState(false);
  const [tab, setTab] = useState<AppTab>('dashboard');
  const [profile, setProfile] = useState<UserProfile>(initialProfile);
  const [settings, setSettings] = useState<UserSettings>(initialSettings);
  const [authOpen, setAuthOpen] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [lifestylePrompt, setLifestylePrompt] = useState(false);
  const [lsDraft, setLsDraft] = useState<Lifestyle>(EMPTY_LIFESTYLE);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [detail, setDetail] = useState<{ key: MetricKey; year: number } | null>(null);
  const openDetail = (key: MetricKey, year: number) => setDetail({ key, year });

  // 실제 백엔드에서 받아온 검진 기록 — 로그인하고 데이터가 있으면 이 값을, 없으면 더미 데이터를 화면에 내려준다.
  const [realReports, setRealReports] = useState<Report[] | null>(null);
  const [realMetricDefinitions, setRealMetricDefinitions] = useState<MetricDefinition[] | null>(null);
  const [healthDataLoading, setHealthDataLoading] = useState(false);
  // 시계열 분석(연도별 추세 하이라이트) — 2년 이상 기록이 있을 때만 백엔드가 내려준다.
  const [timeseries, setTimeseries] = useState<RealTimeseries | null>(null);
  // 개인화 권장사항 — 최신 연도 분석 결과에 백엔드가 실제로 생성해 보내준 내용 그대로.
  const [recommendations, setRecommendations] = useState<RealRecommendations | null>(null);
  // 조합 그룹(복합 위험 패턴) — 구버전 분석에는 없어 null이 정상이다.
  const [comboAnalysis, setComboAnalysis] = useState<RealComboAnalysis | null>(null);
  // 신장 기능(eGFR) — 그 해 혈청 크레아티닌이 실제로 측정된 경우에만 백엔드 계산 결과를 받아온다.
  const [egfr, setEgfr] = useState<RealEgfr | null>(null);
  // 저장된 복약 정보 — 업로드한 HIRA 복약이력을 조회해 기록화면 복약탭에 실제로 표시한다.
  const [medications, setMedications] = useState<MedicationItem[]>([]);

  const loadHealthData = async (userId?: string) => {
    if (!userId) {
      setRealReports(null); setRealMetricDefinitions(null);
      setTimeseries(null); setRecommendations(null); setEgfr(null); setComboAnalysis(null);
      setMedications([]);
      return;
    }
    setHealthDataLoading(true);
    // 복약 정보는 검진 기록과 독립적으로(약만 있고 검진이 없을 수도) 불러온다.
    fetchMedications(userId).then(setMedications).catch(() => setMedications([]));
    try {
      const { reports: fetchedReports, raw } = await fetchAllReports(userId);
      if (fetchedReports.length > 0) {
        setRealReports(fetchedReports);
        setRealMetricDefinitions(latestEvaluationsAsMetricDefinitions(raw));
        setRecommendations(latestRecommendations(raw));
        setComboAnalysis(latestComboAnalysis(raw));

        // 시계열 하이라이트 — 기록이 2년 이상일 때만 의미가 있다(백엔드도 그 미만이면 비워서 내려줌).
        let ts = await fetchTimeseries(userId);
        // 연도 기록을 삭제하면 백엔드가 시계열 캐시를 무효화만 하므로 GET이 404(→null)가 날 수 있다.
        // 남은 기록이 2년 이상이면 강제 재생성한 뒤 다시 조회해 하이라이트를 복구한다.
        if (!ts && fetchedReports.length >= 2) {
          await refreshTimeseries(userId);
          ts = await fetchTimeseries(userId);
        }
        setTimeseries(ts);

        // eGFR — 최신 연도에 혈청 크레아티닌이 "실제로" 측정된 경우에만 계산을 요청한다.
        // (측정되지 않은 값으로 추정해서 보여주면 사실과 다른 정보를 전달하게 되므로 호출 자체를 하지 않는다)
        const latestRaw = raw[raw.length - 1];
        const cr = latestRaw?.comprehensive?.all_evaluations?.find((e) => e.metric === '혈청크레아티닌' || e.metric === '혈청 크레아티닌')?.value;
        if (typeof cr === 'number' && profile.birth_year) {
          const age = latestRaw.year - profile.birth_year;
          const sex: 1 | 2 = profile.gender === 2 ? 2 : 1;
          // 체중이 그 해 검진에 기록돼 있으면 함께 보내 약물 용량 참고용 CrCl도 받아온다.
          const weight = latestRaw?.checkup?.weight_kg;
          setEgfr(await fetchEgfr(cr, age, sex, typeof weight === 'number' ? weight : null));
        } else {
          setEgfr(null);
        }
      } else {
        setRealReports(null);
        setRealMetricDefinitions(null);
        setTimeseries(null); setRecommendations(null); setEgfr(null); setComboAnalysis(null);
      }
    } catch {
      // 검진 기록이 아직 없거나 서버 호출에 실패하면 더미 데이터로 화면을 보여준다.
      setRealReports(null);
      setRealMetricDefinitions(null);
      setTimeseries(null); setRecommendations(null); setEgfr(null); setComboAnalysis(null);
    } finally {
      setHealthDataLoading(false);
    }
  };

  // 실제 데이터가 있으면 그걸, 없으면 더미 데이터를 화면에 내려준다 — 화면 컴포넌트는 그대로 둔다.
  // 주의: 실제 항목 목록에 더미 항목을 끼워 넣지 않는다 — 검사하지 않은 항목을 검사한 것처럼
  // 보여주면 사용자에게 사실과 다른 정보를 전달하게 된다. 화면들은 각자 "그 해에 실제로 측정된
  // 항목"만 추려서 보여주도록 별도로 손봤다(metricsForReport 등).
  const usingRealData = Boolean(realReports && realReports.length > 0);
  // root/1234 데모 계정 — 백엔드(Supabase) 미설정일 때만 로그인되는 시연용 계정이다.
  // 실제 서비스(Supabase 설정됨)에서는 이 값이 항상 false → 더미가 실사용자에게 절대 노출되지 않는다.
  const isDemoAccount = loggedIn && demoMode;
  // 더미 데이터를 화면에 써도 되는 경우: (1) 미로그인 랜딩 프리뷰, (2) 데모 계정.
  const allowDummy = !loggedIn || isDemoAccount;
  // 실제 사용자로 로그인했는데 검진 기록이 아직 없는 경우 — 더미 대신 "빈 상태"를 보여준다.
  const needEmptyState = loggedIn && !usingRealData && !isDemoAccount;
  const reportsForScreens = usingRealData ? realReports! : dummyReports;
  const metricDefinitionsForScreens = usingRealData ? realMetricDefinitions! : dummyMetricDefinitions;

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3000);
  };

  const loadProfile = async (quiet = false) => {
    const token = await getAccessToken();
    if (!token) { if (!quiet) showToast('로그인 세션이 없습니다.'); return; }
    try {
      const users = await apiFetch('/users');
      const first = Array.isArray(users) ? users[0] : null;
      if (first) {
        const id = first.id ?? first.user_id;
        setProfile({ id, email: first.email, name: first.name ?? initialProfile.name, gender: Number(first.gender) === 2 ? 2 : 1, birth_year: Number(first.birth_year) || initialProfile.birth_year, birth_md: Number(first.birth_md) || initialProfile.birth_md, smoking: first.smoking ?? null, drinking: first.drinking ?? null, alcohol_weekly_g: first.alcohol_weekly_g ?? null });
        if (!quiet) showToast('프로필 정보를 불러왔습니다.');
        await loadHealthData(id);
      }
    } catch { if (!quiet) showToast('프로필을 불러오지 못했습니다.'); }
  };

  const saveProfile = async (next: UserProfile) => {
    try {
      const token = await getAccessToken();
      const payload = { name: next.name, gender: next.gender, birth_year: next.birth_year, birth_md: next.birth_md, smoking: next.smoking ?? null, drinking: next.drinking ?? null, alcohol_weekly_g: next.alcohol_weekly_g ?? null };
      if (token && next.id) {
        const saved = await apiFetch(`/users/${next.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        setProfile({ ...next, id: saved.id ?? next.id, name: saved.name ?? next.name });
      } else { setProfile(next); }
      showToast('프로필이 저장되었습니다.');
    } catch { setProfile(next); showToast('프로필이 저장되었습니다.'); }
  };

  const [authError, setAuthError] = useState('');

  const login = async (email: string, password: string) => {
    setAuthError('');
    // root/1234 = 데모(개발자) 계정 — Supabase 미설정 환경에서만 활성.
    // 실서비스(Supabase 설정됨)에서 시연이 필요하면 EXPO_PUBLIC_ENABLE_DEMO=1 로 명시 활성화.
    const demoEnabled = !supabaseConfigured || process.env.EXPO_PUBLIC_ENABLE_DEMO === '1';
    if (demoEnabled && email === 'root' && password === '1234') {
      // 직전에 실계정으로 로그인했다면 그 사람의 이름·성별·생년이 남아 있다.
      // 데모는 홍길동 기준 더미를 보여주므로 프로필도 함께 초기화한다
      // (안 하면 업로드 화면 안내·내보낸 PDF에 남의 이름이 찍힌다).
      setProfile(initialProfile);
      setDemoMode(true); setLoggedIn(true); setAuthOpen(false);
      loadHealthData(); // 실제 데이터 초기화(더미로 표시되도록)
      showToast('데모 계정으로 로그인되었습니다.'); return;
    }
    if (!supabaseConfigured) {
      setAuthError('이메일 또는 비밀번호가 올바르지 않습니다.'); return;
    }
    setAuthLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setDemoMode(false); setLoggedIn(true); setAuthOpen(false); setAuthError(''); showToast('로그인되었습니다.');
      await loadProfile(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '로그인에 실패했습니다.';
      // Supabase 영문 에러 → 한국어 변환
      if (msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('credentials')) {
        setAuthError('이메일 또는 비밀번호가 올바르지 않습니다.');
      } else if (msg.toLowerCase().includes('email not confirmed')) {
        setAuthError('이메일 인증이 완료되지 않았습니다. 메일함을 확인해주세요.');
      } else if (msg.toLowerCase().includes('too many')) {
        setAuthError('로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.');
      } else {
        setAuthError(msg);
      }
    }
    finally { setAuthLoading(false); }
  };

  const signup = async (input: { email: string; name: string; birth_date: string; gender: 1 | 2; password: string }) => {
    if (!supabaseConfigured) {
      const birth = profileBirthFromDate(input.birth_date);
      setProfile({ email: input.email, name: input.name, gender: input.gender, birth_year: birth.birth_year ?? initialProfile.birth_year, birth_md: birth.birth_md });
      setLoggedIn(true); setAuthOpen(false); showToast('가입이 완료되었습니다.'); return;
    }
    setAuthLoading(true);
    try {
      const birth = profileBirthFromDate(input.birth_date);
      const { data, error } = await supabase.auth.signUp({ email: input.email, password: input.password, options: { data: { name: input.name, birth_date: input.birth_date, gender: input.gender } } });
      if (error) throw error;
      const next: UserProfile = { id: data.user?.id, email: input.email, name: input.name, gender: input.gender, birth_year: birth.birth_year ?? initialProfile.birth_year, birth_md: birth.birth_md };
      if (data.session) {
        try {
          const saved = await apiFetch('/users', { method: 'POST', body: JSON.stringify({ name: next.name, gender: next.gender, birth_year: next.birth_year, birth_md: next.birth_md }) });
          setProfile({ ...next, id: saved.id ?? data.user?.id, name: saved.name ?? next.name });
        } catch { setProfile(next); }
        showToast('회원가입이 완료되었습니다.');
        setLsDraft(EMPTY_LIFESTYLE); setLifestylePrompt(true);
      } else { setProfile(next); showToast('이메일 인증 후 로그인해주세요.'); }
      setLoggedIn(true); setAuthOpen(false);
    } catch (e) {
      // Supabase 영문 에러를 상황별 한국어로 번역 (로그인 쪽과 동일한 방식)
      const msg = e instanceof Error ? e.message : '';
      if (/already registered|already been registered/i.test(msg)) showToast('이미 가입된 이메일입니다. 로그인해주세요.');
      else if (/at least 6|password should be/i.test(msg)) showToast('비밀번호는 6자 이상이어야 해요.');
      else if (/invalid.*email|email.*invalid/i.test(msg)) showToast('올바른 이메일 형식이 아니에요.');
      else if (/rate limit/i.test(msg)) showToast('요청이 너무 많아요. 잠시 후 다시 시도해주세요.');
      else showToast(msg || '회원가입에 실패했습니다.');
    }
    finally { setAuthLoading(false); }
  };

  const logout = async () => {
    Alert.alert('로그아웃', '로그아웃하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃', style: 'destructive', onPress: async () => {
          if (supabaseConfigured) await supabase.auth.signOut().catch(() => undefined);
          setLoggedIn(false); setDemoMode(false); setProfile(initialProfile); setTab('dashboard');
          setRealReports(null); setRealMetricDefinitions(null);
          showToast('로그아웃되었습니다.');
        }
      },
    ]);
  };

  // 회원탈퇴 — 계정과 모든 연관 데이터를 영구 삭제한다. 되돌릴 수 없으므로 한 번 더 확인한다.
  const handleDeleteAccount = async () => {
    Alert.alert(
      '회원탈퇴',
      '계정과 모든 검진·복약·분석 기록이 영구 삭제되며 되돌릴 수 없습니다.\n정말 탈퇴하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '탈퇴하기', style: 'destructive', onPress: async () => {
            try {
              if (profile?.id) await deleteAccountApi(profile.id);
              if (supabaseConfigured) await supabase.auth.signOut().catch(() => undefined);
              setLoggedIn(false); setDemoMode(false); setProfile(initialProfile); setTab('dashboard');
              setRealReports(null); setRealMetricDefinitions(null);
              setTimeseries(null); setRecommendations(null); setEgfr(null); setComboAnalysis(null);
              showToast('회원탈퇴가 완료되었습니다.');
            } catch (e) {
              showToast(e instanceof Error ? `회원탈퇴에 실패했습니다: ${e.message}` : '회원탈퇴에 실패했습니다.');
            }
          }
        },
      ],
    );
  };

  useEffect(() => { loadProfile(true); }, []);

  const handleTab = (t: AppTab) => setTab(t);
  const requireLogin = () => setAuthOpen(true);

  if (!fontsLoaded) {
    return <View style={[s.safe, { alignItems: 'center', justifyContent: 'center' }]} />;
  }

  return (
    <SafeAreaProvider>
    <SafeAreaView style={s.safe}>
      <StatusBar style="dark" />

      {/* 헤더 */}
      <View style={[s.header, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
        <Pressable onPress={() => handleTab('dashboard')} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={s.logoIcon}>
            <Ionicons name="pulse" size={14} color="#fff" />
          </View>
          <View>
            <Text style={s.brand}>헬스에이지</Text>
            <Text style={s.brandSub}>건강검진 관리 서비스</Text>
          </View>
        </Pressable>
        {/* 프로필 아이콘 — 누르면 프로필 화면(수정 포함)으로 이동 */}
        <Pressable
          onPress={() => (loggedIn ? handleTab('profile') : requireLogin())}
          style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: tab === 'profile' ? T.primaryLight : T.bg }}
        >
          <Ionicons name={tab === 'profile' ? 'person' : 'person-outline'} size={20} color={tab === 'profile' ? T.primary : T.text3} />
        </Pressable>
      </View>

      {/* 콘텐츠 — 대시보드는 항상 미리보기로 보여주고, 그 외 화면은 로그인 후에만 */}
      <View style={{ flex: 1, backgroundColor: T.bg }}>
        {tab === 'dashboard' && (needEmptyState
          ? <EmptyDataState onUpload={() => handleTab('upload')} />
          : <DashboardScreen onTab={handleTab} reports={reportsForScreens} metricDefinitions={metricDefinitionsForScreens} usingRealData={usingRealData} isPreview={!loggedIn} onRequireLogin={requireLogin} onOpenDetail={openDetail} />)}
        {tab !== 'dashboard' && !loggedIn && <LockedNotice onPress={requireLogin} />}
        {tab === 'records' && loggedIn && (needEmptyState
          ? <EmptyDataState onUpload={() => handleTab('upload')} />
          : <RecordsScreen reports={reportsForScreens} metricDefinitions={metricDefinitionsForScreens} usingRealData={usingRealData} userId={profile?.id} onDeleted={() => loadHealthData(profile.id)} medications={medications} onOpenDetail={openDetail} />)}
        {tab === 'analysis' && loggedIn && (needEmptyState
          ? <EmptyDataState onUpload={() => handleTab('upload')} />
          : <AnalysisScreen reports={reportsForScreens} metricDefinitions={metricDefinitionsForScreens} usingRealData={usingRealData} recommendations={usingRealData ? recommendations : (isDemoAccount ? dummyRecommendations : null)} egfr={usingRealData ? egfr : null} comboAnalysis={usingRealData ? comboAnalysis : (isDemoAccount ? dummyComboAnalysis : null)} highlights={usingRealData ? timeseries?.highlights ?? null : (isDemoAccount ? dummyHighlights : null)} insight={usingRealData ? timeseries?.insight ?? null : (isDemoAccount ? dummyInsight : null)} changePace={usingRealData ? timeseries?.change_pace ?? null : (isDemoAccount ? dummyChangePace : null)} />)}
        {tab === 'upload' && loggedIn && <UploadScreen profile={profile} onTab={handleTab} onSaved={() => loadHealthData(profile.id)} onSaveLifestyle={(ls) => saveProfile({ ...profile, ...ls })} />}
        {tab === 'profile' && loggedIn && (
          <ProfileScreen
            profile={profile}
            settings={settings}
            onSave={saveProfile}
            onSaveSettings={setSettings}
            nextExamYear={usingRealData ? timeseries?.insight?.next_exam_year ?? null : (isDemoAccount ? dummyInsight.next_exam_year : null)}
            onLogout={logout}
            onDeleteAccount={handleDeleteAccount}
            onOpenAuth={() => setAuthOpen(true)}
            reports={loggedIn && !needEmptyState ? reportsForScreens : null}
            metricDefinitions={loggedIn && !needEmptyState ? metricDefinitionsForScreens : null}
          />
        )}
      </View>

      {/* 하단 탭바 */}
      <View style={s.nav}>
        {TABS.map((item) => {
          const active = tab === item.key;
          return (
            <Pressable key={item.key} style={s.navItem} onPress={() => handleTab(item.key)}>
              <View style={[s.navIconWrap, active && s.navIconWrapActive]}>
                <Ionicons name={active ? item.activeIcon : item.icon} size={22} color={active ? T.primary : T.text3} />
              </View>
              <Text style={[s.navLabel, active && { color: T.primary, fontWeight: '700' }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* L2 상세 오버레이 */}
      {detail && (() => {
        const rep = reportsForScreens.find((r) => r.year === detail.year) ?? reportsForScreens[reportsForScreens.length - 1];
        const m = metricsForReport(rep, metricDefinitionsForScreens).find((x) => x.key === detail.key);
        return m ? <MetricDetailScreen metric={m} report={rep} reports={reportsForScreens} onClose={() => setDetail(null)} /> : null;
      })()}

      {/* 토스트 */}
      {toast ? (
        <View style={s.toast} pointerEvents="none">
          <Ionicons name="checkmark-circle" size={16} color={T.primary} />
          <Text style={s.toastText}>{toast}</Text>
        </View>
      ) : null}

      {/* 인증 모달 (바텀시트) */}
      <Modal transparent visible={authOpen} animationType="slide" onRequestClose={() => { setAuthOpen(false); setAuthError(''); }}>
        {/* height 모드는 키보드가 올라올 때마다 컨테이너 전체를 다시 레이아웃해서 버벅이므로,
            두 플랫폼 모두 padding 모드로 통일해 부드럽게 따라 올라오도록 한다 */}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}>
          <Pressable style={s.modalOverlay} onPress={() => setAuthOpen(false)}>
            <Pressable style={s.modalSheet} onPress={(e) => e.stopPropagation()}>
              <View style={s.modalHandle} />
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={{ fontSize: 22, fontWeight: '700', color: T.text1, marginBottom: 20 }}>로그인 / 회원가입</Text>
                <AuthForm loading={authLoading} onLogin={login} onSignup={signup} onClose={() => setAuthOpen(false)} errorMessage={authError} />
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* 회원가입 후 생활습관 문진 — 건너뛰기 가능. 나중에 내정보/업로드에서 수정 가능 */}
      <Modal transparent visible={lifestylePrompt} animationType="slide" onRequestClose={() => setLifestylePrompt(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <Pressable style={s.modalOverlay} onPress={() => setLifestylePrompt(false)}>
            <Pressable style={s.modalSheet} onPress={(e) => e.stopPropagation()}>
              <View style={s.modalHandle} />
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={{ fontSize: 22, fontWeight: '700', color: T.text1, marginBottom: 6 }}>생활습관 문진</Text>
                <Text style={{ fontSize: 13, color: T.text3, lineHeight: 19, marginBottom: 20 }}>흡연·음주는 검진 수치로 알 수 없어 한 번만 확인합니다. 나중에 내정보에서 바꿀 수 있어요.</Text>
                <LifestyleForm value={lsDraft} onChange={setLsDraft} gender={profile.gender} />
                <Pressable
                  style={{ height: 54, backgroundColor: T.primary, borderRadius: T.radiusPill, alignItems: 'center', justifyContent: 'center', marginTop: 20 }}
                  onPress={() => { saveProfile({ ...profile, ...lsDraft }); setLifestylePrompt(false); }}
                >
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>저장</Text>
                </Pressable>
                <Pressable style={{ height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8 }} onPress={() => setLifestylePrompt(false)}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: T.text3 }}>나중에 하기 (건너뛰기)</Text>
                </Pressable>
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
    </SafeAreaProvider>
  );
}

// ──────────────────────────────────────────────
// 로그인 화면 (비로그인)
// ──────────────────────────────────────────────
function LockedNotice({ onPress }: { onPress: () => void }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
      <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: T.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
        <Ionicons name="lock-closed" size={28} color={T.primary} />
      </View>
      <Text style={{ fontSize: 17, fontWeight: '700', color: T.text1, marginBottom: 6, textAlign: 'center' }}>로그인 후 확인 가능해요</Text>
      <Text style={{ fontSize: 14, color: T.text3, textAlign: 'center', lineHeight: 21, marginBottom: 24 }}>
        이 화면은 로그인하면 바로 볼 수 있어요.{'\n'}지금 로그인하고 내 건강기록을 확인해보세요.
      </Text>
      <Pressable onPress={onPress} style={{ height: 50, paddingHorizontal: 28, borderRadius: T.radiusPill, backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>로그인 / 회원가입</Text>
      </Pressable>
    </View>
  );
}

// 로그인한 실제 사용자인데 검진 기록이 아직 없을 때 — 더미 데이터 대신 업로드를 유도하는 빈 상태.
function EmptyDataState({ onUpload }: { onUpload: () => void }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
      <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: T.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
        <Ionicons name="document-text-outline" size={28} color={T.primary} />
      </View>
      <Text style={{ fontSize: 17, fontWeight: '700', color: T.text1, marginBottom: 6, textAlign: 'center' }}>아직 검진 기록이 없어요</Text>
      <Text style={{ fontSize: 14, color: T.text3, textAlign: 'center', lineHeight: 21, marginBottom: 24 }}>
        건강검진 결과지를 올리면{'\n'}분석 결과와 건강 점수를 확인할 수 있어요.
      </Text>
      <Pressable onPress={onUpload} style={{ height: 50, paddingHorizontal: 28, borderRadius: T.radiusPill, backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>결과지 업로드하기</Text>
      </Pressable>
    </View>
  );
}

function AuthScreen({ loading, onLogin, onSignup }: {
  loading: boolean;
  onLogin: (email: string, password: string) => void;
  onSignup: (input: { email: string; name: string; birth_date: string; gender: 1 | 2; password: string }) => void;
}) {
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: T.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 60, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {/* 로고 */}
        <View style={{ alignItems: 'center', marginBottom: 48 }}>
          <View style={s.authLogoWrap}>
            <Ionicons name="pulse" size={36} color="#fff" />
          </View>
          <Text style={s.authBrand}>헬스에이지</Text>
          <Text style={s.authTagline}>내 건강을 한눈에</Text>
        </View>
        <AuthForm loading={loading} onLogin={onLogin} onSignup={onSignup} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ──────────────────────────────────────────────
// 공통 인증 폼
// ──────────────────────────────────────────────
function AuthForm({ loading, onLogin, onSignup, onClose, errorMessage }: {
  loading: boolean;
  onLogin: (email: string, password: string) => void;
  onSignup: (input: { email: string; name: string; birth_date: string; gender: 1 | 2; password: string }) => void;
  onClose?: () => void;
  errorMessage?: string;
}) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [form, setForm] = useState({ email: '', name: '', birth_date: '1980-01-01', gender: '1', password: '' });
  // 제출 전 검증 실패 메시지 — 서버까지 가기 전에 조건을 한국어로 안내한다.
  const [localError, setLocalError] = useState('');

  // 가입 조건을 서버(Supabase)에 보내기 전에 클라이언트에서 먼저 검사한다.
  // 비밀번호 6자는 Supabase 기본 정책과 동일한 값.
  const validate = (): string => {
    const email = form.email.trim();
    if (!email || !form.password) return '이메일과 비밀번호를 입력해주세요.';
    // 데모 계정(root/1234)은 이메일 형식이 아니므로 형식 검사를 건너뛴다.
    if (email === 'root') return '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return '올바른 이메일 형식이 아니에요. (예: name@example.com)';
    if (mode === 'login') return '';
    if (form.password.length < 6) return '비밀번호는 6자 이상이어야 해요.';
    if (!form.name.trim()) return '이름을 입력해주세요.';
    const bd = form.birth_date.trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bd);
    const d = m ? new Date(`${bd}T00:00:00`) : null;
    if (!m || !d || Number.isNaN(d.getTime()) || d.getMonth() + 1 !== Number(m[2]) || d.getDate() !== Number(m[3])) {
      return '생년월일을 YYYY-MM-DD 형식으로 입력해주세요. (예: 1980-01-01)';
    }
    if (d > new Date()) return '생년월일이 미래 날짜일 수 없어요.';
    return '';
  };

  const submit = () => {
    const problem = validate();
    setLocalError(problem);
    if (problem) return;
    if (mode === 'login') { onLogin(form.email.trim(), form.password); return; }
    onSignup({ email: form.email.trim(), name: form.name.trim(), birth_date: form.birth_date.trim(), gender: Number(form.gender) === 2 ? 2 : 1, password: form.password });
  };

  return (
    <View style={{ backgroundColor: T.white, borderRadius: T.radius, padding: 20, ...T.shadow }}>
      {/* 로그인 / 회원가입 탭 */}
      <View style={{ flexDirection: 'row', backgroundColor: T.bg, borderRadius: T.radiusSm, padding: 4, marginBottom: 20 }}>
        {(['login', 'signup'] as const).map((m) => (
          <Pressable
            key={m}
            style={[{ flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: T.radiusSm - 2 }, mode === m && { backgroundColor: T.white, ...T.shadow }]}
            onPress={() => { setMode(m); setLocalError(''); }}
          >
            <Text style={{ fontWeight: mode === m ? '700' : '500', fontSize: 15, color: mode === m ? T.text1 : T.text3 }}>
              {m === 'login' ? '로그인' : '회원가입'}
            </Text>
          </Pressable>
        ))}
      </View>

      <FieldInput label="이메일" value={form.email} onChangeText={(v) => setForm((s) => ({ ...s, email: v }))} keyboardType="email-address" placeholder="name@example.com" />
      {mode === 'signup' && (
        <>
          <FieldInput label="이름" value={form.name} onChangeText={(v) => setForm((s) => ({ ...s, name: v }))} placeholder="홍길동" />
          <FieldInput label="생년월일 (YYYY-MM-DD)" value={form.birth_date} onChangeText={(v) => setForm((s) => ({ ...s, birth_date: v }))} placeholder="1980-01-01" keyboardType="numbers-and-punctuation" />
          <Text style={{ fontSize: 14, fontWeight: '600', color: T.text2, marginBottom: 8 }}>성별</Text>
          <ChipRow>
            <Chip active={form.gender === '1'} label="남성" onPress={() => setForm((s) => ({ ...s, gender: '1' }))} />
            <Chip active={form.gender === '2'} label="여성" onPress={() => setForm((s) => ({ ...s, gender: '2' }))} />
          </ChipRow>
        </>
      )}
      <FieldInput label="비밀번호" value={form.password} onChangeText={(v) => setForm((s) => ({ ...s, password: v }))} secureTextEntry placeholder="••••••••" />
      {mode === 'signup' && (
        <Text style={{ fontSize: 12, color: T.text3, marginTop: -6, marginBottom: 12 }}>6자 이상 입력해주세요.</Text>
      )}
      <PrimaryBtn label={loading ? '처리 중...' : mode === 'login' ? '로그인' : '회원가입'} onPress={submit} loading={loading} />

      {!!localError && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: T.dangerBg, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginTop: 12 }}>
          <Ionicons name="alert-circle" size={16} color={T.danger} />
          <Text style={{ fontSize: 13, color: T.danger, fontWeight: '600', flex: 1 }}>{localError}</Text>
        </View>
      )}
      {!!errorMessage && !localError && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: T.dangerBg, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginTop: 12 }}>
          <Ionicons name="alert-circle" size={16} color={T.danger} />
          <Text style={{ fontSize: 13, color: T.danger, fontWeight: '600', flex: 1 }}>{errorMessage}</Text>
        </View>
      )}

      {!supabaseConfigured && mode === 'login' && (
        <Text style={{ fontSize: 12, color: T.text3, textAlign: 'center', marginTop: 12 }}>
          개발 모드: 아이디 root / 비밀번호 1234
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  header: {
    height: 60,
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: T.white,
    borderBottomWidth: 0,
    borderBottomColor: T.border,
  },
  logoIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: T.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { fontSize: 17, fontWeight: '700', fontFamily: T.fontDisplay, color: T.text1 },
  brandSub: { fontSize: 10, color: T.text3, fontWeight: '500', marginTop: 1 },
  nav: {
    flexDirection: 'row',
    backgroundColor: T.white,
    borderTopWidth: 0,
    borderTopColor: T.border,
    paddingBottom: Platform.OS === 'ios' ? 24 : 6,
    paddingTop: 8,
  },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  navIconWrap: { width: 44, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  navIconWrapActive: { backgroundColor: T.primaryLight },
  navLabel: { fontSize: 10, fontWeight: '500', color: T.text3 },
  toast: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 100 : 84,
    left: 24,
    right: 24,
    backgroundColor: T.white,
    borderRadius: T.radiusSm,
    paddingHorizontal: 16,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...T.shadow,
  },
  toastText: { fontSize: 14, fontWeight: '600', color: T.text1, flex: 1 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    backgroundColor: T.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 44 : 28,
    paddingTop: 16,
    maxHeight: '92%',
  },
  modalHandle: { width: 36, height: 4, backgroundColor: T.border, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  authLogoWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: T.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  authBrand: { fontSize: 26, fontWeight: '700', fontFamily: T.fontDisplay, color: T.text1, marginBottom: 6 },
  authTagline: { fontSize: 15, color: T.text2, fontWeight: '500' },
});
