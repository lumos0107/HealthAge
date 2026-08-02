import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Eyebrow, FadeIn, FadeInUp, T } from '../components/UI';
import { FixedCTA } from '../components/v2';
import { LifestyleForm, type Lifestyle } from '../components/LifestyleForm';
import { medicationDosageText, medicationPeriodText, medicationTemplate, ocrTemplate } from '../data';
import type { MedicationItem, OcrField, TabKey, UserProfile } from '../data';
import { analyzeCheckup, fieldsToOcrResult, ocrFlagText, ocrResultToFields, OCR_LOW_CONFIDENCE, uploadCheckupImage, uploadMedicationFile } from '../health';
import type { RealOcrResult } from '../health';

const HIRA_URL = 'https://www.hira.or.kr/rb/dur/form.do?pgmid=HIRAA050300000100';

// 외부 링크를 안전하게 연다 — 실패해도 조용히 죽지 않고 안내를 띄운다.
async function openExternalUrl(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('링크를 열 수 없어요', '브라우저에서 아래 주소를 직접 입력해 주세요.\n\n' + url);
  }
}

export default function UploadScreen({ profile, onTab, onSaved, onSaveLifestyle }: { profile: UserProfile; onTab: (tab: TabKey) => void; onSaved?: () => void; onSaveLifestyle?: (ls: Lifestyle) => void }) {
  const [mode, setMode] = useState<'checkup' | 'medication'>('checkup');
  const [fields, setFields] = useState<OcrField[]>([]);
  const [source, setSource] = useState('');
  const [touched, setTouched] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [isError, setIsError] = useState(false);
  const [medItems, setMedItems] = useState<MedicationItem[]>([]);
  const [medUsingExample, setMedUsingExample] = useState(false);
  const [medUploading, setMedUploading] = useState(false);
  const [medResult, setMedResult] = useState<{ inserted: number; persisted: boolean } | null>(null);
  // 생일 재입력이 필요할 때 방금 고른 파일을 붙잡아 둔다 — 다시 고르게 하지 않고 그대로 재시도한다.
  const [medBirthdayAsk, setMedBirthdayAsk] = useState<{ uri: string; name: string } | null>(null);
  const [medBirthdayInput, setMedBirthdayInput] = useState('');
  // 실제 OCR 응답 원본 — 사용자가 검수한 값을 다시 같은 모양으로 합쳐서 /analyze로 보낼 때 필요하다.
  const [ocrRaw, setOcrRaw] = useState<RealOcrResult['ocr'] | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [usingExample, setUsingExample] = useState(false);
  // 검진지 없이 직접 입력하는 모드. 빈 폼으로 시작하므로 필수항목이 비어 있는 게
  // 아직 오류가 아니다 — 저장을 시도(touched)하기 전에는 "확인 필요" 경고를 띄우지 않는다.
  const [manualEntry, setManualEntry] = useState(false);
  // 방금 저장한 분석이 복약 정보를 반영했는지 여부 — false면 "약을 안 드시는 것으로 가정"했다는 뜻이라 안내를 띄운다.
  const [medsKnown, setMedsKnown] = useState<boolean | null>(null);
  // 문진(생활습관) — 프로필값을 prefill. 여기서 바꾸면 저장 시 프로필도 갱신된다.
  const [lifestyle, setLifestyle] = useState<Lifestyle>({ smoking: profile.smoking ?? null, drinking: profile.drinking ?? null, alcohol_weekly_g: profile.alcohol_weekly_g ?? 0 });

  const loadMedExample = () => {
    setMedItems(medicationTemplate.map((m) => ({ ...m })));
    setMedUsingExample(true);
    setMedResult(null);
    setStatusMsg('예시 복약 정보입니다. 실제로 저장하려면 "복약자료 파일 업로드"로 본인의 HIRA 엑셀 파일을 올려주세요.');
    setIsError(false);
  };

  // 실제 HIRA 복약이력 엑셀(xls/xlsx) 업로드 → 백엔드 파싱 + 저장(POST /medication/upload)
  //
  // HIRA 파일은 생년월일이 열기 비밀번호다. 백엔드는 프로필에 저장된 생일로 먼저 열어보고,
  // 없으면 400, 안 맞으면 401을 준다. 두 경우 모두 사용자가 생일을 직접 넣으면 풀리므로
  // (백엔드가 manual_birthday를 받도록 이미 열어 뒀다) 에러로 끝내지 않고 다시 물어본다.
  const runMedUpload = async (uri: string, name: string, birthday?: string) => {
    setMedUploading(true);
    setMedUsingExample(false);
    setIsError(false);
    setMedResult(null);
    setStatusMsg('복약자료 파일을 분석하는 중이에요...');
    try {
      const res = await uploadMedicationFile(uri, name, birthday);
      setMedItems(res.items as unknown as MedicationItem[]);
      setMedResult({ inserted: res.inserted, persisted: res.persisted });
      setIsError(false);
      setMedBirthdayAsk(null);
      setStatusMsg(
        res.persisted
          ? `복약 정보 ${res.count}건을 확인했고, ${res.inserted}건을 저장했습니다. 이후 검진 결과 분석에 "복용 중인 약" 정보로 활용됩니다.`
          : `복약 정보 ${res.count}건을 확인했습니다. (이미 저장되어 있어 추가로 저장된 건수는 없어요)`
      );
      // 저장이 되었으면 상위(App)에서 복약 목록을 다시 불러오게 해 기록화면에 바로 반영한다.
      if (res.persisted) onSaved?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      // 400 = 생일 정보 자체가 없음 / 401 = 생일이 파일과 안 맞음. 둘 다 재입력으로 풀 수 있다.
      if (/^(400|401)\b/.test(msg)) {
        setMedBirthdayAsk({ uri, name });
        setMedBirthdayInput('');
        setIsError(true);
        setStatusMsg(
          birthday
            ? '입력하신 생년월일로도 파일이 열리지 않았어요. 숫자 8자리를 다시 확인해주세요.'
            : 'HIRA 파일은 생년월일이 비밀번호예요. 파일 주인의 생년월일을 입력해주세요.'
        );
        return;
      }
      setIsError(true);
      setStatusMsg(msg ? `복약자료 업로드에 실패했습니다: ${msg}` : '복약자료 업로드에 실패했습니다.');
    } finally {
      setMedUploading(false);
    }
  };

  const pickMedicationFile = async () => {
    let result: DocumentPicker.DocumentPickerResult;
    try {
      result = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        copyToCacheDirectory: true,
      });
    } catch {
      Alert.alert('파일 선택 실패', '파일을 선택하는 중 문제가 발생했습니다.');
      return;
    }
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    await runMedUpload(asset.uri, asset.name ?? 'medication.xlsx');
  };

  // 효능군(category)별로 묶어서 보여준다 — 어떤 약을 왜 먹는지 한눈에 파악하기 쉽도록.
  const medGroups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, MedicationItem[]>();
    for (const item of medItems) {
      const category = item.efficacy_class || '기타';
      if (!map.has(category)) { map.set(category, []); order.push(category); }
      map.get(category)!.push(item);
    }
    return order.map((category) => ({ category, items: map.get(category)! }));
  }, [medItems]);

  const missing = fields.filter((f) => f.required && !f.value.trim());
  // OCR이 스스로 확신하지 못한 항목 — 사진 인식으로 채운 경우에만 값이 있다.
  // 멘토 3차 자문("100% 자동저장 대신 검수")에 따라 눈에 띄게 표시해 사용자가 직접 확인하게 한다.
  const lowConf = fields.filter((f) => f.confidence != null && f.confidence < OCR_LOW_CONFIDENCE);

  // 예시 결과 — 실제 OCR을 호출하지 않고 화면 형태만 미리 보여줄 때 사용한다(더미 데이터임을 명확히 표시).
  const loadExample = (src = 'sample-checkup-photo.jpg') => {
    setFields(ocrTemplate.map((f) => ({ ...f })));
    setOcrRaw(null); setUsingExample(true); setManualEntry(false); setMedsKnown(null);
    setSource(src); setTouched(false); setSaved(false); setIsError(false);
    setStatusMsg('예시 결과입니다. 실제 사진은 "카메라 촬영" 또는 "갤러리 선택"으로 업로드해 주세요.');
  };

  // 검진지 사진 없이 값을 직접 입력하는 경로.
  // 저장 흐름은 OCR과 완전히 같다 — 빈 ocr 골격을 만들어 두면 fieldsToOcrResult가
  // 사용자가 채운 값으로 measurements를 구성하므로 분석·저장 코드를 새로 쓸 필요가 없다.
  const startManualEntry = () => {
    setFields(ocrTemplate.map((f) => ({ ...f, value: '', confidence: undefined, flags: undefined })));
    setOcrRaw({ meta: {}, measurements: {}, lifestyle: {} });
    setUsingExample(false); setManualEntry(true); setMedsKnown(null);
    setSource('직접 입력'); setTouched(false); setSaved(false); setIsError(false);
    setStatusMsg('검진표를 보면서 값을 직접 입력하세요. 별표(*) 항목만 채워도 분석할 수 있어요.');
  };

  // 실제 검진지 사진 → 백엔드 OCR(POST /uploads) 호출 → 인식 결과로 항목을 채운다.
  const runOcr = async (asset: ImagePicker.ImagePickerAsset) => {
    setOcrLoading(true); setIsError(false); setUsingExample(false); setMedsKnown(null);
    setStatusMsg('사진에서 검진 결과를 읽는 중이에요...');
    try {
      const fileName = asset.fileName ?? asset.uri.split('/').pop() ?? 'checkup.jpg';
      const mimeType = asset.mimeType ?? 'image/jpeg';
      const result = await uploadCheckupImage(asset.uri, fileName, mimeType);
      setOcrRaw(result.ocr);
      setFields(ocrResultToFields(result.ocr));
      setSource(fileName);
      setTouched(false); setSaved(false);
      const warn = result.warnings?.length ? ` ${result.warnings.join(' ')}` : '';
      setIsError(!!result.warnings?.length);
      setStatusMsg(`사진에서 읽은 결과가 준비되었습니다. 검진표와 다른 값이 있으면 수정한 뒤 저장하세요.${warn}`);
    } catch (e) {
      setIsError(true);
      setStatusMsg(e instanceof Error ? `결과지 인식에 실패했습니다: ${e.message}` : '결과지 인식에 실패했습니다.');
    } finally {
      setOcrLoading(false);
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled) await runOcr(result.assets[0]);
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('카메라 권한 필요', '설정에서 카메라 권한을 허용해주세요.'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled) await runOcr(result.assets[0]);
  };

  // 사용자가 직접 고친 값에는 OCR 확신도가 더 이상 해당되지 않으므로 confidence·flags를 지운다
  // (고쳐 놓고도 "확신 62%"가 계속 붙어 있으면 잘못된 근거가 된다).
  const updateField = (id: string, value: string) =>
    setFields((p) => p.map((f) => f.id === id ? { ...f, value, confidence: undefined, flags: undefined } : f));

  const requestSave = () => {
    setTouched(true);
    if (!fields.length) { Alert.alert('결과지 선택', '먼저 결과지를 촬영하거나 선택해주세요.'); return; }
    if (missing.length) { setIsError(true); setStatusMsg('필수 항목이 비어 있습니다. 빨간 표시 항목을 채워주세요.'); return; }
    if (usingExample || !ocrRaw) {
      Alert.alert('예시 데이터입니다', '지금 보이는 항목은 예시 데이터예요. 실제로 저장하려면 "카메라 촬영" 또는 "갤러리 선택"으로 본인의 검진지 사진을 업로드해 주세요.');
      return;
    }
    setIsError(false); setStatusMsg(''); setConfirmOpen(true);
  };

  // 검수 완료된 값을 실제 분석 서버(POST /analyze)로 보내 분석 + 저장까지 진행한다.
  const confirmSave = async () => {
    if (!ocrRaw) { setConfirmOpen(false); return; }
    setConfirmOpen(false);
    setAnalyzeLoading(true);
    setIsError(false);
    setStatusMsg('검진 결과를 분석하고 저장하는 중이에요...');
    try {
      const base = fieldsToOcrResult(fields, ocrRaw);
      const ls: Record<string, any> = { ...(base.lifestyle ?? {}) };
      if (lifestyle.smoking) ls.smoking = lifestyle.smoking;
      if (lifestyle.drinking) ls.drinking = lifestyle.drinking;
      if (lifestyle.drinking === 'yes') ls.alcohol_weekly_g = lifestyle.alcohol_weekly_g;
      const ocrToSend = { ...base, lifestyle: ls };
      const result = await analyzeCheckup(ocrToSend, true);
      onSaveLifestyle?.(lifestyle); // 업로드에서 바꾼 생활습관을 프로필에도 반영
      setSaved(true);
      // 백엔드가 이 분석에 복약 정보를 반영했는지 — false면 아래에서 복약자료 업로드를 안내한다.
      setMedsKnown(result.medications_known ?? null);
      const warn = result.warnings?.length ? ` (${result.warnings.join(' ')})` : '';
      setStatusMsg(`확인한 검진표 값이 저장되었습니다.${warn}`);
      onSaved?.();
    } catch (e) {
      setIsError(true);
      setStatusMsg(e instanceof Error ? `저장에 실패했습니다: ${e.message}` : '저장에 실패했습니다.');
    } finally {
      setAnalyzeLoading(false);
    }
  };

  const changeMode = (m: 'checkup' | 'medication') => {
    setMode(m); setFields([]); setSource(''); setTouched(false); setSaved(false); setStatusMsg(''); setIsError(false);
    setMedItems([]); setMedUsingExample(false); setMedResult(null); setOcrRaw(null); setUsingExample(false); setManualEntry(false); setMedsKnown(null);
  };

  const getPlaceholder = (field: OcrField) => {
    if (field.id === 'exam_date') return '예: 2024-03-15';
    if (field.id === 'hospital') return '예: 서울대병원 강남센터';
    if (field.required) return '필수 입력';
    return '미측정 또는 직접 입력';
  };

  return (
    <View style={{ flex: 1 }}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingBottom: 110 }} showsVerticalScrollIndicator={false} style={{ backgroundColor: T.bg }}>

        {/* 페이지 헤더 — 화면에 들어오면 살짝 떠오르며 나타난다 */}
        <FadeInUp delay={0}>
        <View style={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 14 }}>
          <Eyebrow>UPLOAD</Eyebrow>
          <Text style={{ fontSize: 34, fontWeight: '800', fontFamily: T.fontDisplay, color: T.text1, letterSpacing: -0.5, marginTop: 6 }}>결과지 업로드</Text>
          <Text style={{ fontSize: 13, color: T.text3, lineHeight: 19, marginTop: 6 }}>자료 종류를 선택한 뒤 내용을 확인하고 저장합니다.</Text>
        </View>
        </FadeInUp>

        {/* 모드 탭 — 카드로 감싸지 않고 구분선 위에 탭만 둔다 */}
        <FadeInUp delay={70}>
        <View style={{ flexDirection: 'row', marginHorizontal: 16, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: T.divider }}>
          {(['checkup', 'medication'] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => changeMode(m)}
              style={[
                { flex: 1, paddingVertical: 13, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -1 },
                mode === m && { borderBottomColor: T.primary },
              ]}
            >
              <Text style={{ fontSize: 14, fontWeight: mode === m ? '700' : '500', color: mode === m ? T.text1 : T.text3 }}>
                {m === 'checkup' ? '건강검진 결과지' : '처방전·복약자료'}
              </Text>
            </Pressable>
          ))}
        </View>
        </FadeInUp>

        {/* 선택한 모드에 맞는 내용 — 모드를 바꾸면 살짝 페이드되며 갱신된다 */}
        <FadeIn key={mode}>
        {mode === 'checkup' && (
          <>
            <View style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 18, marginBottom: 8 }}>
              {/* 회원 정보 안내 — 박스 안에 박스를 두지 않고, 카드 안에서 아이콘+텍스트로 평평하게 표시 */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 16, marginBottom: 18, borderBottomWidth: 1, borderBottomColor: T.divider }}>
                <Ionicons name="person-circle-outline" size={20} color={T.primary} />
                <Text style={{ fontSize: 13, color: T.text2, flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: T.text1 }}>{profile.name}</Text> / <Text style={{ fontWeight: '700', color: T.text1 }}>{profile.gender === 1 ? '남성' : '여성'}</Text> 정보가 자동 적용됩니다.
                </Text>
              </View>

              {/* 업로드 버튼 */}
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                <UploadTile title={ocrLoading ? '인식하는 중...' : '카메라 촬영'} icon="camera" primary onPress={takePhoto} disabled={ocrLoading} />
                <UploadTile title={ocrLoading ? '인식하는 중...' : '갤러리 선택'} icon="images" onPress={pickImage} disabled={ocrLoading} />
              </View>
              {/* 사진이 없거나 인식이 안 될 때 — 검진표를 보며 직접 입력. 저장 경로는 OCR과 동일하다. */}
              <Pressable
                onPress={startManualEntry}
                disabled={ocrLoading}
                style={{ paddingVertical: 14, borderRadius: T.radiusSm, alignItems: 'center', borderWidth: 1, borderColor: T.border, marginBottom: 8, opacity: ocrLoading ? 0.5 : 1 }}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: T.text1 }}>검진지 없이 직접 입력</Text>
              </Pressable>
              <Pressable
                onPress={() => loadExample()}
                disabled={ocrLoading}
                style={{ paddingVertical: 14, borderRadius: T.radiusSm, alignItems: 'center', backgroundColor: T.bg, opacity: ocrLoading ? 0.5 : 1 }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: T.text2 }}>예시 결과 미리보기 (참고용 더미 데이터)</Text>
              </Pressable>
            </View>

            {ocrLoading && <View style={{ marginHorizontal: 16 }}><AnalyzingCard /></View>}

            {fields.length > 0 && (
              <>
                {missing.length > 0 && (!manualEntry || touched) && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 14, marginHorizontal: 16, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: T.divider }}>
                    <Ionicons name="alert-circle-outline" size={20} color={T.danger} />
                    <Text style={{ fontSize: 13, color: T.danger, fontWeight: '700' }}>확인 필요 {missing.length}개 항목이 있습니다.</Text>
                  </View>
                )}

                {/* OCR이 확신하지 못한 항목 안내 — 사진으로 읽은 경우에만 뜬다(직접 입력·예시엔 확신도가 없음). */}
                {lowConf.length > 0 && (
                  <View style={{ backgroundColor: T.warnBg, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 18, paddingVertical: 14, marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Ionicons name="eye-outline" size={18} color={T.warn} />
                      <Text style={{ fontSize: 13, fontWeight: '800', color: T.warn }}>사진에서 흐릿하게 읽힌 항목 {lowConf.length}개</Text>
                    </View>
                    <Text style={{ fontSize: 12, color: T.text2, lineHeight: 18 }}>
                      {lowConf.map((f) => f.label).join(' · ')} — 검진표와 같은지 꼭 확인해주세요. 자동 저장하지 않고 확인을 받는 이유예요.
                    </Text>
                  </View>
                )}

                {(['기본 정보', '검사 수치'] as OcrField['section'][]).map((section) => (
                  <View key={section} style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8, marginBottom: 8 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: T.text1, marginBottom: 16 }}>{section}</Text>
                    {fields.filter((f) => f.section === section).map((field, fi, arr) => {
                      const bad = touched && !!field.required && !field.value.trim();
                      // 확신도가 낮은 항목은 주의색 테두리로 눈에 띄게 한다(필수 누락은 여전히 빨강이 우선).
                      const uncertain = field.confidence != null && field.confidence < OCR_LOW_CONFIDENCE;
                      const flagText = ocrFlagText(field.flags);
                      return (
                        <View key={field.id} style={[{ paddingBottom: 14 }, fi < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: T.divider, marginBottom: 14 }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <Text style={{ fontSize: 14, fontWeight: '600', color: bad ? T.danger : T.text2 }}>
                              {field.label}{field.required ? <Text style={{ color: T.danger }}> *</Text> : null}
                            </Text>
                            {bad ? (
                              <Text style={{ fontSize: 12, color: T.danger, fontWeight: '600' }}>확인 필요</Text>
                            ) : uncertain ? (
                              <View style={{ backgroundColor: T.warnBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: T.radiusPill }}>
                                <Text style={{ fontSize: 11, fontWeight: '800', color: T.warn }}>확신 {Math.round(field.confidence! * 100)}%</Text>
                              </View>
                            ) : null}
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <TextInput
                              style={{
                                flex: 1, height: 50,
                                borderWidth: 1,
                                borderColor: bad ? T.danger : uncertain ? T.warn : T.border,
                                borderRadius: T.radiusSm,
                                paddingHorizontal: 14,
                                fontSize: 15, color: T.text1, backgroundColor: T.white,
                              }}
                              value={field.value}
                              onChangeText={(v) => updateField(field.id, v)}
                              placeholder={getPlaceholder(field)}
                              placeholderTextColor={T.text3}
                            />
                            {field.unit ? <Text style={{ fontSize: 13, color: T.text3, fontWeight: '500', width: 48 }}>{field.unit}</Text> : null}
                          </View>
                          {uncertain && flagText && (
                            <Text style={{ fontSize: 11, color: T.warn, marginTop: 5, lineHeight: 16 }}>· {flagText}</Text>
                          )}
                          {field.id === 'exam_date' && (
                            <Text style={{ fontSize: 11, color: T.text3, marginTop: 5 }}>YYYY-MM-DD 형식으로 입력 (예: 2024-03-15)</Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ))}

                {/* 생활습관 — 내정보(회원가입) 값을 prefill. 여기서 바꾸면 저장 시 내정보에도 반영된다 */}
                <View style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 18, marginBottom: 8 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: T.text1, marginBottom: 4 }}>생활습관</Text>
                  <Text style={{ fontSize: 12, color: T.text3, lineHeight: 18, marginBottom: 18 }}>회원가입 때 입력한 값입니다. 바뀌었으면 여기서 수정하세요(내정보에도 반영됩니다).</Text>
                  <LifestyleForm value={lifestyle} onChange={setLifestyle} gender={profile.gender} />
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginHorizontal: 16, paddingVertical: 12, marginBottom: 10, borderTopWidth: 1, borderTopColor: T.divider }}>
                  <Text style={{ fontSize: 13, color: T.primary, fontWeight: '700' }}>!</Text>
                  <Text style={{ fontSize: 13, color: T.text2, lineHeight: 20, flex: 1 }}>저장하기 전에 측정값과 검진기관, 검진일이 실제 검진표와 같은지 다시 확인해주세요.</Text>
                </View>
                <View style={{ paddingHorizontal: 16 }}>
                  {saved && (
                    <Pressable hitSlop={8}
                      style={{ height: 54, backgroundColor: T.white, borderRadius: T.radiusPill, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center', marginTop: 10 }}
                      onPress={() => onTab('records')}
                    >
                      <Text style={{ fontSize: 15, fontWeight: '700', color: T.text2 }}>검진기록에서 확인하기</Text>
                    </Pressable>
                  )}
                  {/* 복약 정보 없이 분석된 경우 — 더 정확한 분석을 위해 복약자료 업로드를 안내한다 */}
                  {saved && medsKnown === false && (
                    <Pressable
                      onPress={() => changeMode('medication')}
                      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 12, padding: 14, backgroundColor: T.primaryLight, borderRadius: T.radiusSm }}
                    >
                      <Ionicons name="information-circle-outline" size={18} color={T.primary} style={{ marginTop: 1 }} />
                      <Text style={{ flex: 1, fontSize: 13, color: T.text2, lineHeight: 20 }}>
                        복약 정보가 없어 <Text style={{ fontWeight: '700', color: T.text1 }}>약을 복용하지 않는 것으로 가정</Text>하고 분석했어요. '처방전·복약자료' 탭에서 복약자료를 올리면 약 복용을 감안한 더 정확한 분석을 받을 수 있어요.
                      </Text>
                    </Pressable>
                  )}
                </View>
              </>
            )}
          </>
        )}

        {mode === 'medication' && (
          <>
            {/* HIRA 링크 카드 */}
            <Pressable
              onPress={() => openExternalUrl(HIRA_URL)}
              style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingVertical: 18, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 16 }}
            >
              <View style={{ width: 50, height: 50, borderRadius: 16, backgroundColor: T.primaryLight, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="open-outline" size={24} color={T.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: T.text1, fontSize: 15, marginBottom: 3 }}>복약자료 발급 방법 안내</Text>
                <Text style={{ fontSize: 12, color: T.text3, lineHeight: 18 }}>건강보험심사평가원에서 내 복약정보 조회</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 5 }}>
                  <Text style={{ fontSize: 12, color: T.primary, fontWeight: '700' }}>브라우저에서 열기</Text>
                  <Ionicons name="arrow-forward" size={11} color={T.primary} />
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={T.text3} />
            </Pressable>

            {/* 단계 안내 */}
            <View style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 18, marginBottom: 8 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: T.text1, marginBottom: 16 }}>이렇게 진행하세요</Text>
              {['건강보험심사평가원 접속', '내가 먹는 약! 한눈에 메뉴 선택', '공동인증서 또는 간편인증 로그인', '복약정보 조회 후 엑셀 파일 저장', '아래 파일 선택으로 업로드'].map((step, i) => (
                <View key={i} style={[{ flexDirection: 'row', gap: 14, paddingVertical: 12, alignItems: 'flex-start' }, i < 4 && { borderBottomWidth: 1, borderBottomColor: T.divider }]}>
                  <View style={{ width: 26, height: 26, borderRadius: T.radiusPill, backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                    <Text style={{ fontSize: 12, color: '#fff', fontWeight: '700' }}>{i + 1}</Text>
                  </View>
                  <Text style={{ fontSize: 14, color: T.text2, flex: 1, lineHeight: 21 }}>{step}</Text>
                </View>
              ))}
            </View>

            {/* 예시 미리보기 — 실제 파일 없이 화면 형태만 먼저 확인할 때 */}
            <Pressable
              onPress={loadMedExample}
              disabled={medUploading}
              style={{ marginHorizontal: 16, paddingVertical: 14, borderRadius: T.radiusSm, alignItems: 'center', backgroundColor: T.bg, marginBottom: medItems.length ? 8 : 0, opacity: medUploading ? 0.5 : 1 }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: T.text2 }}>예시 결과 미리보기 (참고용 더미 데이터)</Text>
            </Pressable>

            {/* 정리된 결과 — OCR/파싱 후 "효능군별로" 묶어서 보여준다.
                약이 많아질수록 무슨 약을 왜 먹는지 한눈에 알기 어려우므로,
                고혈압약/당뇨약/이상지질혈증약처럼 효능군 단위로 묶고
                각 약의 성분·용법·복용 기간을 함께 표시해 맥락을 이해하기 쉽게 한다. */}
            {medGroups.map(({ category, items }) => (
              <View key={category} style={{ backgroundColor: T.white, marginHorizontal: 16, borderRadius: T.radius, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 6, marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <View style={{ backgroundColor: T.primaryLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: T.radiusPill }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: T.primary }}>{category}</Text>
                  </View>
                  <Text style={{ fontSize: 12, color: T.text3 }}>{items.length}개</Text>
                </View>
                {items.map((item, i) => (
                  <View key={`${item.drug_code ?? item.product_name}-${item.dispensed_date}`} style={[{ paddingBottom: 14 }, i < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: T.divider, marginBottom: 14 }]}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: T.text1, marginBottom: 4 }}>{item.product_name}</Text>
                    <Text style={{ fontSize: 12, color: T.text3, marginBottom: 6 }}>성분: {item.ingredient_en}</Text>
                    <Text style={{ fontSize: 13, color: T.text2, lineHeight: 19 }}>{medicationDosageText(item)}</Text>
                    <Text style={{ fontSize: 12, color: T.text3, marginTop: 3 }}>복용 기간: {medicationPeriodText(item)}</Text>
                    {item.safety_alert ? (
                      <Text style={{ fontSize: 12, color: T.danger, marginTop: 3 }}>⚠ {item.safety_alert}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ))}

            {medItems.length > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginHorizontal: 16, paddingVertical: 12, marginBottom: 10, borderTopWidth: 1, borderTopColor: T.divider }}>
                <Text style={{ fontSize: 13, color: T.primary, fontWeight: '700' }}>!</Text>
                <Text style={{ fontSize: 13, color: T.text2, lineHeight: 20, flex: 1 }}>
                  {medUsingExample
                    ? '지금 보이는 내용은 형태를 보여주기 위한 예시 데이터로, 실제로 저장되지는 않습니다. 실제로 저장하려면 위의 "복약자료 파일 업로드"로 본인의 HIRA 엑셀 파일을 올려주세요.'
                    : medResult
                      ? '저장된 복약 정보는 앞으로 검진 결과 분석 시 "복용 중인 약" 정보로 함께 활용되어, 약을 먹어서 정상 범위로 보이는 항목도 정확히 안내해 드릴 수 있어요.'
                      : '파일을 업로드하면 검진 결과 분석 시 "복용 중인 약" 정보로 함께 활용되어, 약을 먹어서 정상 범위로 보이는 항목도 정확히 안내해 드릴 수 있어요.'}
                </Text>
              </View>
            )}
          </>
        )}
        </FadeIn>

        {statusMsg ? (
          <View style={{ marginHorizontal: 16, marginTop: 8, paddingVertical: 12, borderTopWidth: 1, borderTopColor: T.divider, flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <Ionicons name={isError ? 'alert-circle-outline' : 'checkmark-circle-outline'} size={18} color={isError ? T.danger : T.primary} style={{ marginTop: 1 }} />
            <Text style={{ fontSize: 13, color: isError ? T.danger : T.primary, fontWeight: '600', flex: 1, lineHeight: 20 }}>{statusMsg}</Text>
          </View>
        ) : null}
      </ScrollView>
  
      {/* 저장 확인 모달 */}
      <Modal transparent visible={confirmOpen} animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: T.white, borderRadius: T.radiusMd, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 }}>
            <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: T.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Ionicons name="save-outline" size={24} color={T.primary} />
            </View>
            <Text style={{ fontSize: 20, fontWeight: '700', color: T.text1, marginBottom: 8 }}>이 값으로 저장할까요?</Text>
            <Text style={{ fontSize: 14, lineHeight: 22, color: T.text2, marginBottom: 24 }}>
              검진일, 검진기관, 주요 측정값이 실제 검진표와 같은지 마지막으로 확인해주세요.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable hitSlop={8}
                style={{ flex: 1, height: 52, backgroundColor: T.bg, borderRadius: T.radiusPill, alignItems: 'center', justifyContent: 'center' }}
                onPress={() => setConfirmOpen(false)}
              >
                <Text style={{ fontWeight: '600', color: T.text2, fontSize: 15 }}>다시 확인</Text>
              </Pressable>
              <Pressable hitSlop={8}
                style={{ flex: 1, height: 52, backgroundColor: T.primary, borderRadius: T.radiusPill, alignItems: 'center', justifyContent: 'center' }}
                onPress={confirmSave}
              >
                <Text style={{ fontWeight: '700', color: '#fff', fontSize: 15 }}>저장하기</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 생년월일 재입력 — HIRA 파일이 프로필 생일로 안 열릴 때. 파일을 다시 고르지 않고 그대로 재시도한다. */}
      <Modal transparent visible={!!medBirthdayAsk} animationType="fade" onRequestClose={() => setMedBirthdayAsk(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: T.white, borderRadius: T.radiusMd, padding: 24 }}>
            <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: T.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Ionicons name="lock-closed-outline" size={24} color={T.primary} />
            </View>
            <Text style={{ fontSize: 20, fontWeight: '700', color: T.text1, marginBottom: 8 }}>생년월일을 입력해주세요</Text>
            <Text style={{ fontSize: 14, lineHeight: 22, color: T.text2, marginBottom: 16 }}>
              HIRA 복약이력 파일은 생년월일이 열기 비밀번호예요. 파일 주인의 생년월일 8자리를 넣어주세요.
            </Text>
            <TextInput
              value={medBirthdayInput}
              onChangeText={(t) => setMedBirthdayInput(t.replace(/[^0-9]/g, '').slice(0, 8))}
              placeholder="19740101"
              placeholderTextColor={T.text3}
              keyboardType="number-pad"
              maxLength={8}
              style={{ backgroundColor: T.bg, borderRadius: T.radiusSm, paddingHorizontal: 16, height: 52, fontSize: 17, color: T.text1, letterSpacing: 2, marginBottom: 20 }}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable hitSlop={8}
                style={{ flex: 1, height: 52, backgroundColor: T.bg, borderRadius: T.radiusPill, alignItems: 'center', justifyContent: 'center' }}
                onPress={() => { setMedBirthdayAsk(null); setStatusMsg(''); setIsError(false); }}
              >
                <Text style={{ fontWeight: '600', color: T.text2, fontSize: 15 }}>취소</Text>
              </Pressable>
              <Pressable hitSlop={8}
                disabled={medBirthdayInput.length !== 8 || medUploading}
                style={{ flex: 1, height: 52, backgroundColor: medBirthdayInput.length === 8 ? T.primary : T.cardAlt, borderRadius: T.radiusPill, alignItems: 'center', justifyContent: 'center' }}
                onPress={() => { const a = medBirthdayAsk!; setMedBirthdayAsk(null); runMedUpload(a.uri, a.name, medBirthdayInput); }}
              >
                <Text style={{ fontWeight: '700', color: medBirthdayInput.length === 8 ? '#fff' : T.text3, fontSize: 15 }}>다시 시도</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {mode === 'checkup' && fields.length > 0 && (
        <FixedCTA label="확인한 값 저장하기" onPress={requestSave} disabled={analyzeLoading} loading={analyzeLoading} />
      )}
      {mode === 'medication' && (
        <FixedCTA label="복약자료 파일 업로드하기" onPress={pickMedicationFile} disabled={medUploading} loading={medUploading} />
      )}
    </KeyboardAvoidingView>
    </View>
  );
}

function AnalyzingCard() {
  return (
    <View style={{ backgroundColor: T.white, borderRadius: T.radius, padding: 24, alignItems: 'center', marginBottom: 12 }}>
      <ActivityIndicator size="large" color={T.primary} style={{ marginBottom: 16 }} />
      <Text style={{ fontSize: 17, fontWeight: '700', color: T.text1, marginBottom: 6 }}>결과지를 읽고 있어요</Text>
      <Text style={{ fontSize: 14, color: T.text3, textAlign: 'center', lineHeight: 21 }}>
        사진에서 검사 수치를 찾아 정리하는 중이에요.{'\n'}보통 10~30초 정도 걸려요.
      </Text>
    </View>
  );
}

function UploadTile({ title, icon, primary, onPress, disabled }: { title: string; icon: keyof typeof Ionicons.glyphMap; primary?: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1,
        backgroundColor: primary ? T.primary : T.bg,
        borderRadius: T.radiusSm,
        padding: 18,
        alignItems: 'center',
        gap: 8,
        minHeight: 88,
        justifyContent: 'center',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Ionicons name={icon} size={28} color={primary ? '#fff' : T.text2} />
      <Text style={{ fontSize: 13, fontWeight: '700', color: primary ? '#fff' : T.text1 }}>{title}</Text>
    </Pressable>
  );
}

