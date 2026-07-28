import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { Eyebrow, FadeInUp, FieldInput, SecondaryBtn, T } from '../components/UI';
import { LifestyleForm, type Lifestyle } from '../components/LifestyleForm';
import { birthDateFromProfile, metricsForReport, profileBirthFromDate } from '../data';
import type { MetricDefinition, Report, UserProfile, UserSettings } from '../data';
import { cancelCheckupReminder, getScheduledCheckupReminder, scheduleCheckupReminder } from '../notifications';
import { exportReportPdf } from '../reportExport';

type EditState = 'locked' | 'verifying' | 'unlocked';

export default function ProfileScreen({
  profile,
  settings,
  onSave,
  onSaveSettings,
  nextExamYear,
  onLogout,
  onDeleteAccount,
  reports,
  metricDefinitions,
}: {
  profile: UserProfile;
  settings: UserSettings;
  onSave: (p: UserProfile) => void;
  onSaveSettings: (s: UserSettings) => void;
  // 검진 알림을 언제 띄울지 정하는 근거. 백엔드 insight.next_exam_year(없으면 undefined).
  nextExamYear?: number | null;
  onLogout: () => void;
  onDeleteAccount?: () => void;
  onOpenAuth?: () => void;
  // 검진 결과 PDF 내보내기용 — 없으면(비로그인/기록 없음) 카드 자체를 숨긴다.
  reports?: Report[] | null;
  metricDefinitions?: MetricDefinition[] | null;
}) {
  const [editState, setEditState] = useState<EditState>('locked');
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState('');
  const [form, setForm] = useState({
    name: profile.name,
    birth_date: birthDateFromProfile(profile),
    gender: String(profile.gender),
  });
  const [localSettings, setLocalSettings] = useState(settings);
  const [lifestyle, setLifestyle] = useState<Lifestyle>({ smoking: profile.smoking ?? null, drinking: profile.drinking ?? null, alcohol_weekly_g: profile.alcohol_weekly_g ?? 0 });

  const verifyPassword = () => {
    if (!pwInput.trim()) { setPwError('비밀번호를 입력해주세요.'); return; }
    if (pwInput === '1234' || pwInput.length >= 6) {
      setEditState('unlocked');
      setPwInput('');
      setPwError('');
    } else {
      setPwError('비밀번호가 올바르지 않습니다.');
    }
  };

  const handleSave = () => {
    const birth = profileBirthFromDate(form.birth_date);
    onSave({
      ...profile,
      name: form.name.trim() || profile.name,
      gender: Number(form.gender) === 2 ? 2 : 1,
      birth_year: birth.birth_year ?? profile.birth_year,
      birth_md: birth.birth_md ?? profile.birth_md,
      smoking: lifestyle.smoking,
      drinking: lifestyle.drinking,
      alcohol_weekly_g: lifestyle.drinking === 'yes' ? lifestyle.alcohol_weekly_g : 0,
    });
    setEditState('locked');
    Alert.alert('저장 완료', '프로필이 업데이트되었습니다.');
  };

  // 검진 알림은 토글이 곧 실제 예약이다 — 예약된 시각을 화면에 보여줘서
  // "켜 놓았는데 아무 일도 안 일어나는" 상태가 생기지 않게 한다.
  const [reminderAt, setReminderAt] = useState<Date | null>(null);
  useEffect(() => { getScheduledCheckupReminder().then(setReminderAt).catch(() => {}); }, []);

  const handleSettingChange = async (key: keyof UserSettings, value: boolean) => {
    if (key === 'checkupReminder') {
      if (value) {
        const at = await scheduleCheckupReminder(nextExamYear);
        if (!at) {
          // 권한 거부 또는 권장 연도를 알 수 없음 → 켠 척하지 않고 토글을 되돌린다.
          Alert.alert(
            '알림을 켤 수 없어요',
            nextExamYear
              ? '기기 설정에서 알림 권한을 허용해주세요.'
              : '검진 기록이 있어야 다음 검진 시기를 알 수 있어요. 결과지를 먼저 등록해주세요.',
          );
          return;
        }
        setReminderAt(at);
      } else {
        await cancelCheckupReminder();
        setReminderAt(null);
      }
    }
    const next = { ...localSettings, [key]: value };
    setLocalSettings(next);
    onSaveSettings(next);
  };

  // 검진 결과 PDF 내보내기 — RecordsScreen에서 옮겨온 로직 그대로(새 판단 로직 추가 없음).
  const [pdfYear, setPdfYear] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const pdfReport = reports?.find((r) => r.year === (pdfYear ?? reports[reports.length - 1]?.year));
  const handleExport = async () => {
    if (exporting || !pdfReport || !metricDefinitions) return;
    setExporting(true);
    try {
      await exportReportPdf(pdfReport, metricsForReport(pdfReport, metricDefinitions), profile.name);
    } catch (e) {
      Alert.alert('내보내기 실패', e instanceof Error ? e.message : 'PDF를 만들지 못했습니다.');
    } finally { setExporting(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false} style={{ backgroundColor: T.bg }}>

        {/* 프로필 헤더 — 화면에 들어오면 살짝 떠오르며 나타난다 */}
        <FadeInUp delay={0}>
        <View style={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 20, marginHorizontal: 16, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: T.divider, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: T.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="person" size={30} color={T.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Eyebrow>PROFILE</Eyebrow>
            <Text style={{ fontSize: 26, fontWeight: '800', fontFamily: T.fontDisplay, color: T.text1, letterSpacing: -0.5, marginTop: 4 }}>{profile.name}</Text>
            {profile.email ? <Text style={{ fontSize: 13, color: T.text3, marginTop: 2 }}>{profile.email}</Text> : null}
          </View>
        </View>
        </FadeInUp>

        {/* 내 정보 — 박스 없이 구분선 목록으로 */}
        <FadeInUp delay={70}>
        <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: T.text1 }}>내 정보</Text>
            {editState === 'locked' ? (
              <Pressable
                onPress={() => setEditState('verifying')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: T.primaryLight, paddingHorizontal: 14, paddingVertical: 8, borderRadius: T.radiusPill }}
              >
                <Ionicons name="lock-closed-outline" size={13} color={T.primary} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: T.primary }}>수정하기</Text>
              </Pressable>
            ) : editState === 'unlocked' ? (
              <Pressable
                onPress={() => setEditState('locked')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: T.successBg, paddingHorizontal: 14, paddingVertical: 8, borderRadius: T.radiusPill }}
              >
                <Ionicons name="lock-open-outline" size={13} color={T.success} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: T.success }}>수정 중</Text>
              </Pressable>
            ) : null}
          </View>

          {/* 이메일 — 항상 읽기 전용 */}
          <View style={[rowStyle, { borderBottomWidth: 1, borderBottomColor: T.divider }]}>
            <Text style={labelStyle}>이메일</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={valueStyle}>{profile.email || '이메일 없음'}</Text>
              <View style={{ backgroundColor: T.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: T.radiusPill }}>
                <Text style={{ fontSize: 10, color: T.text3, fontWeight: '600' }}>고정</Text>
              </View>
            </View>
          </View>

          {editState === 'locked' ? (
            <>
              <InfoRow label="이름" value={profile.name} />
              <InfoRow label="성별" value={profile.gender === 1 ? '남성' : '여성'} />
              <InfoRow label="생년월일" value={birthDateFromProfile(profile)} />
              <InfoRow label="흡연" value={smokingLabel(profile.smoking)} />
              <InfoRow label="음주" value={drinkingLabel(profile.drinking, profile.alcohol_weekly_g)} last />
            </>
          ) : (
            <View style={{ paddingTop: 14 }}>
              <FieldInput label="이름" value={form.name} onChangeText={(v) => setForm((s) => ({ ...s, name: v }))} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: T.text2, marginBottom: 10 }}>성별</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 18 }}>
                {(['1', '2'] as const).map((g) => (
                  <Pressable
                    key={g}
                    onPress={() => setForm((s) => ({ ...s, gender: g }))}
                    style={{
                      flex: 1, height: 48, borderRadius: T.radiusPill,
                      borderWidth: 1.5,
                      borderColor: form.gender === g ? T.primary : T.border,
                      backgroundColor: form.gender === g ? T.primaryLight : T.white,
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontWeight: '700', color: form.gender === g ? T.primary : T.text2, fontSize: 15 }}>
                      {g === '1' ? '남성' : '여성'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <FieldInput
                label="생년월일"
                value={form.birth_date}
                onChangeText={(v) => setForm((s) => ({ ...s, birth_date: v }))}
                placeholder="1980-01-01"
                hint="YYYY-MM-DD 형식으로 입력해주세요."
                keyboardType="numbers-and-punctuation"
              />
              <Text style={{ fontSize: 15, fontWeight: '700', color: T.text1, marginTop: 8, marginBottom: 14 }}>생활습관</Text>
              <LifestyleForm value={lifestyle} onChange={setLifestyle} gender={Number(form.gender) === 2 ? 2 : 1} />
              <Pressable
                style={{ height: 54, backgroundColor: T.primary, borderRadius: T.radiusPill, alignItems: 'center', justifyContent: 'center', marginTop: 16 }}
                onPress={handleSave}
              >
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>저장하기</Text>
              </Pressable>
            </View>
          )}
        </View>
        </FadeInUp>

        {/* 알림·표시 설정 — 박스 없이 구분선 목록으로 */}
        <FadeInUp delay={140}>
        <View style={{ paddingHorizontal: 20, marginBottom: 8, borderTopWidth: 1, borderTopColor: T.divider, paddingTop: 18 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: T.text1, marginBottom: 16 }}>알림 및 표시 설정</Text>
          {([
            { key: 'checkupReminder' as const, title: '검진 일정 알림', desc: '다음 검진 시기를 놓치지 않도록 알려줍니다.' },
            { key: 'medicationReminder' as const, title: '복약 자료 알림', desc: '내가 먹는 약 자료를 정기적으로 확인하도록 안내합니다.' },
            { key: 'simpleWords' as const, title: '쉬운 설명 우선 표시', desc: '검사항목 설명을 어려운 의학 용어보다 쉽게 보여줍니다.' },
          ]).map((item, i, arr) => (
            <View key={item.key} style={[{ paddingVertical: 14 }, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: T.divider }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, marginRight: 14 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: T.text1, marginBottom: 3 }}>{item.title}</Text>
                  <Text style={{ fontSize: 13, color: T.text3, lineHeight: 18 }}>{item.desc}</Text>
                </View>
                <Switch
                  value={localSettings[item.key]}
                  onValueChange={(v) => handleSettingChange(item.key, v)}
                  trackColor={{ false: T.border, true: T.primary }}
                  thumbColor="#fff"
                />
              </View>
              {item.key === 'checkupReminder' && localSettings.checkupReminder && (
                <Text style={{ fontSize: 12, color: reminderAt ? T.success : T.text3, marginTop: 8, lineHeight: 18 }}>
                  {reminderAt
                    ? `예약됨 · ${reminderAt.getFullYear()}년 ${reminderAt.getMonth() + 1}월 ${reminderAt.getDate()}일 ${String(reminderAt.getHours()).padStart(2, '0')}:${String(reminderAt.getMinutes()).padStart(2, '0')}`
                    : '아직 예약된 알림이 없어요. 검진 기록을 등록하면 다음 검진 시기에 맞춰 알려드려요.'}
                </Text>
              )}
            </View>
          ))}
        </View>
        </FadeInUp>

        {/* 앱 정보 — 박스 없이 구분선 목록으로 */}
        <FadeInUp delay={210}>
        <View style={{ paddingHorizontal: 20, marginBottom: 8, borderTopWidth: 1, borderTopColor: T.divider, paddingTop: 18 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: T.text1, marginBottom: 16 }}>앱 정보</Text>
          {[
            { label: '앱 이름', value: '헬스에이지' },
            { label: '버전', value: '1.0.0' },
            { label: '문의', value: 'support@healthage.kr' },
          ].map((item, i, arr) => (
            <View key={item.label} style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 }, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: T.divider }]}>
              <Text style={{ fontSize: 15, color: T.text2 }}>{item.label}</Text>
              <Text style={{ fontSize: 14, color: T.text3, fontWeight: '500' }}>{item.value}</Text>
            </View>
          ))}
        </View>
        </FadeInUp>

        {/* 검진 결과 내보내기 — reports가 없거나 비어 있으면(비로그인/기록 없음) 카드 전체를 숨긴다 */}
        {reports && reports.length > 0 && (
        <FadeInUp delay={245}>
        <View style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20, marginBottom: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: T.text1, marginBottom: 4 }}>검진 결과 내보내기</Text>
          <Text style={{ fontSize: 13, color: T.text3, lineHeight: 19, marginBottom: 14 }}>병원 지참·가족 공유용 PDF로 저장해요.</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {[...reports].reverse().map((r) => {
              const active = (pdfYear ?? reports[reports.length - 1]?.year) === r.year;
              return (
                <Pressable key={r.year} onPress={() => setPdfYear(r.year)}
                  style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: T.radiusPill, backgroundColor: active ? T.primary : T.cardAlt }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: active ? '#fff' : T.text2 }}>{r.year}년</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <SecondaryBtn label={exporting ? 'PDF를 만드는 중...' : 'PDF로 내보내기'} onPress={handleExport} />
        </View>
        </FadeInUp>
        )}

        {/* 로그아웃 */}
        <FadeInUp delay={280}>
        <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
          <Pressable
            onPress={onLogout}
            style={{ height: 54, backgroundColor: T.white, borderRadius: T.radiusPill, borderWidth: 1, borderColor: T.danger, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 16, fontWeight: '700', color: T.danger }}>로그아웃</Text>
          </Pressable>
        </View>
        </FadeInUp>

        {/* 회원탈퇴 — 되돌릴 수 없는 작업이라 로그아웃보다 눈에 덜 띄게 두고, 실제 확인은 상위의 경고 다이얼로그에서 받는다 */}
        {onDeleteAccount ? (
          <FadeInUp delay={340}>
          <View style={{ alignItems: 'center', marginTop: 4, marginBottom: 12 }}>
            <Pressable onPress={onDeleteAccount} hitSlop={8} style={{ paddingVertical: 10, paddingHorizontal: 16 }}>
              <Text style={{ fontSize: 13, color: T.text3, fontWeight: '600', textDecorationLine: 'underline' }}>회원탈퇴</Text>
            </Pressable>
          </View>
          </FadeInUp>
        ) : null}
      </ScrollView>
  
      {/* 비밀번호 확인 바텀시트 */}
      <Modal transparent visible={editState === 'verifying'} animationType="slide" onRequestClose={() => setEditState('locked')}>
        {/* height 모드는 키보드가 뜰 때마다 레이아웃을 다시 계산해 버벅이므로 padding 모드로 통일 */}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
          onPress={() => { setEditState('locked'); setPwInput(''); setPwError(''); }}
        >
          <Pressable
            style={{ backgroundColor: T.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: Platform.OS === 'ios' ? 48 : 32 }}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ width: 36, height: 4, backgroundColor: T.border, borderRadius: 2, alignSelf: 'center', marginBottom: 24 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: T.primaryLight, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="shield-checkmark-outline" size={22} color={T.primary} />
              </View>
              <View>
                <Text style={{ fontSize: 18, fontWeight: '700', color: T.text1 }}>본인 확인</Text>
                <Text style={{ fontSize: 13, color: T.text3, marginTop: 2 }}>정보 수정을 위해 비밀번호를 입력해주세요.</Text>
              </View>
            </View>
            <TextInput
              style={{
                height: 54,
                borderWidth: 1,
                borderColor: pwError ? T.danger : T.border,
                borderRadius: T.radiusSm,
                paddingHorizontal: 16,
                fontSize: 16,
                color: T.text1,
                backgroundColor: T.white,
                letterSpacing: 2,
                marginBottom: pwError ? 6 : 16,
              }}
              secureTextEntry
              placeholder="현재 비밀번호"
              placeholderTextColor={T.text3}
              value={pwInput}
              onChangeText={(v) => { setPwInput(v); setPwError(''); }}
              autoFocus
              onSubmitEditing={verifyPassword}
            />
            {pwError ? <Text style={{ fontSize: 13, color: T.danger, fontWeight: '600', marginBottom: 16 }}>{pwError}</Text> : null}
            <Pressable
              style={{ height: 54, backgroundColor: T.primary, borderRadius: T.radiusPill, alignItems: 'center', justifyContent: 'center' }}
              onPress={verifyPassword}
            >
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>확인</Text>
            </Pressable>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const rowStyle = { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingVertical: 14 };
const labelStyle = { fontSize: 14, color: T.text3, fontWeight: '500' as const };
const valueStyle = { fontSize: 15, color: T.text1, fontWeight: '600' as const };

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[rowStyle, !last && { borderBottomWidth: 1, borderBottomColor: T.divider }]}>
      <Text style={labelStyle}>{label}</Text>
      <Text style={valueStyle}>{value}</Text>
    </View>
  );
}

function smokingLabel(s?: string | null) {
  return s === 'never' ? '비흡연' : s === 'former' ? '과거 흡연' : s === 'current' ? '현재 흡연' : '미입력';
}
function drinkingLabel(d?: string | null, g?: number | null) {
  if (d === 'yes') return `주당 약 ${g ?? 0}g`;
  if (d === 'no') return '안 마심';
  return '미입력';
}
