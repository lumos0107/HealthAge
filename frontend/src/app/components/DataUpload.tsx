import { AlertTriangle, BookOpen, CheckCircle2, FileText, FileUp, Pill, Save, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ApiHealthState, ApiUser } from '../../api/healthApi';
import { healthApi } from '../../api/healthApi';
import { Card, MedicalNotice, PageHeader, PrimaryButton, SecondaryButton } from './Common';

type Props = {
  apiState: ApiHealthState;
  onAction: (message: string) => void;
  onApiRefresh: () => void;
  onProfileSave: (profile: Pick<ApiUser, 'name' | 'gender' | 'birth_year'>) => Promise<void>;
};

type OcrForm = Record<string, string>;

const labels: Record<string, string> = {
  hospital: '의료기관',
  exam_date: '검진일',
  name: '이름',
  height_cm: '키',
  weight_kg: '몸무게',
  waist_cm: '허리둘레',
  sbp: '수축기 혈압',
  dbp: '이완기 혈압',
  fbs: '공복혈당',
  total_cholesterol: '총콜레스테롤',
  ldl: 'LDL-C',
  hdl: 'HDL-C',
  tg: '중성지방',
  ast: 'AST',
  alt: 'ALT',
  ggt: '감마-GTP',
  creatinine: '혈청 크레아티닌',
};

function flattenOcr(value: unknown): OcrForm {
  const root = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const checkup = root.checkup && typeof root.checkup === 'object' ? root.checkup as Record<string, unknown> : root;
  const result: OcrForm = {};
  Object.keys(labels).forEach((key) => {
    const raw = checkup[key] ?? checkup[key.replace('_cm', '')] ?? '';
    result[key] = raw === null || raw === undefined ? '' : String(raw);
  });
  return result;
}

function confidenceLow(key: string, value: string) {
  if (!value && !['total_cholesterol', 'ldl', 'hdl', 'tg'].includes(key)) return true;
  if (['sbp', 'dbp', 'fbs', 'ast', 'alt', 'ggt'].includes(key)) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && (parsed <= 0 || parsed > 500);
  }
  return false;
}

export function DataUpload({ apiState, onAction, onApiRefresh, onProfileSave }: Props) {
  const [uploadMode, setUploadMode] = useState<'checkup' | 'prescription'>('checkup');
  const [file, setFile] = useState<File | null>(null);
  const [prescriptionFile, setPrescriptionFile] = useState<File | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [prescriptionReady, setPrescriptionReady] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [ocrRaw, setOcrRaw] = useState<unknown>(null);
  const [form, setForm] = useState<OcrForm>({});
  const currentUser = apiState.users.find((user) => user.user_id === apiState.selectedUserId || user.id === apiState.selectedUserId);
  const needsProfile = !currentUser?.gender || !currentUser?.birth_year;
  const [profile, setProfile] = useState({ gender: String(currentUser?.gender ?? '1'), birth_year: String(currentUser?.birth_year ?? '') });

  const suspicious = useMemo(() => Object.entries(form).filter(([key, value]) => confidenceLow(key, value)).map(([key]) => key), [form]);

  const upload = async () => {
    if (!file) {
      onAction('업로드할 결과지를 선택해주세요.');
      return;
    }
    setLoading(true);
    try {
      const result = await healthApi.uploadFile(file);
      setOcrRaw(result.ocr);
      setForm(flattenOcr(result.ocr));
      setStep(2);
      onAction('OCR 분석이 완료되었습니다. 저장 전에 값을 확인해주세요.');
    } catch (error) {
      onAction(error instanceof Error ? error.message : 'OCR 업로드에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const saveProfile = async () => {
    await onProfileSave({ gender: Number(profile.gender), birth_year: Number(profile.birth_year) || undefined });
    onAction('성별/출생연도 정보가 저장되었습니다.');
  };

  const saveAnalysis = async () => {
    if (needsProfile) {
      onAction('분석 저장 전 성별과 출생연도를 먼저 저장해주세요.');
      return;
    }
    setLoading(true);
    try {
      const measurements = {
        height: form.height_cm,
        weight: form.weight_kg,
        waist: form.waist_cm,
        sbp: form.sbp,
        dbp: form.dbp,
        fbs: form.fbs,
        total_cholesterol: form.total_cholesterol,
        ldl: form.ldl,
        hdl: form.hdl,
        tg: form.tg,
        ast: form.ast,
        alt: form.alt,
        ggt: form.ggt,
        creatinine: form.creatinine,
      };
      const payload = {
        save: true,
        user_id: apiState.selectedUserId,
        ocr: {
          ...(ocrRaw && typeof ocrRaw === 'object' ? ocrRaw as Record<string, unknown> : {}),
          meta: {
            exam_date: form.exam_date || undefined,
            patient_gender: profile.gender === '2' ? 'F' : 'M',
          },
          measurements,
        },
      };
      await healthApi.analyzeOcr(payload);
      setStep(3);
      onApiRefresh();
      onAction('분석 결과가 저장되었습니다.');
    } catch (error) {
      onAction(error instanceof Error ? error.message : '분석 저장에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader title="데이터 업로드" description="건강검진 결과지와 처방전/약 정보는 서로 다른 OCR 흐름으로 관리합니다." />
      <div className="mb-5 grid gap-2 rounded-lg bg-white p-1 shadow-sm md:w-fit md:grid-cols-2">
        <button
          type="button"
          onClick={() => setUploadMode('checkup')}
          className={`flex min-h-12 items-center justify-center gap-2 rounded-[10px] px-5 text-sm font-bold ${uploadMode === 'checkup' ? 'bg-[#2457c5] text-white' : 'text-[#3f3f3f] hover:bg-[#f7f7f7]'}`}
        >
          <FileText className="h-4 w-4" /> 건강검진 결과지
        </button>
        <button
          type="button"
          onClick={() => setUploadMode('prescription')}
          className={`flex min-h-12 items-center justify-center gap-2 rounded-[10px] px-5 text-sm font-bold ${uploadMode === 'prescription' ? 'bg-[#2457c5] text-white' : 'text-[#3f3f3f] hover:bg-[#f7f7f7]'}`}
        >
          <Pill className="h-4 w-4" /> 처방전 · 약 정보
        </button>
      </div>

      {uploadMode === 'prescription' && (
        <div className="space-y-5">
          <Card className="p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-[#2457c5]">
                  <Pill className="h-5 w-5" />
                  <p className="text-sm font-bold tracking-[0.08em]">MEDICATION OCR</p>
                </div>
                <h2 className="mt-3 text-[26px] font-bold tracking-tight text-[#222222]">내가 먹는 약 정보를 따로 등록합니다</h2>
                <p className="mt-3 max-w-2xl text-[15px] leading-7 text-[#3f3f3f]">
                  건강검진 결과지와 처방전은 항목 구조가 다르기 때문에 따로 업로드합니다. 사용자는 “내가 먹는 약! 한눈에”에서 내려받은 PDF 또는 캡처 이미지를 등록할 수 있습니다.
                </p>
              </div>
              <SecondaryButton type="button" onClick={() => setGuideOpen(true)} className="shrink-0">
                <BookOpen className="mr-2 h-4 w-4" /> 받는 방법 보기
              </SecondaryButton>
            </div>

            <label className="mt-7 flex cursor-pointer flex-col items-center justify-center rounded-[10px] bg-[#f7f7f7] px-6 py-14 text-center hover:bg-[#eceff1]">
              <span className="grid h-16 w-16 place-items-center rounded-[10px] bg-white text-[#2457c5] shadow-sm">
                <FileUp className="h-8 w-8" />
              </span>
              <span className="mt-4 text-xl font-bold text-[#222222]">{prescriptionFile ? prescriptionFile.name : '처방전 또는 약 정보 파일을 선택해주세요'}</span>
              <span className="mt-2 text-base text-[#6a6a6a]">PDF, JPG, PNG 파일을 지원합니다.</span>
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={(event) => setPrescriptionFile(event.target.files?.[0] ?? null)} />
            </label>

            <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="text-sm leading-6 text-[#6a6a6a]">
                처방전 OCR API가 연결되면 약명, 용량, 복용 횟수, 처방일을 추출해 약 히스토리에 저장합니다.
              </p>
              <PrimaryButton
                type="button"
                disabled={!prescriptionFile}
                onClick={() => {
                  setPrescriptionReady(true);
                  onAction('처방전 파일이 선택되었습니다. 추출 내용을 확인한 뒤 저장할 수 있습니다.');
                }}
              >
                약 정보 확인으로 이동
              </PrimaryButton>
            </div>
          </Card>

          {prescriptionReady && (
            <Card className="p-6">
              <h3 className="text-lg font-bold text-[#222222]">약 히스토리 저장 준비</h3>
              <p className="mt-2 text-sm leading-6 text-[#3f3f3f]">
                선택된 파일: <strong>{prescriptionFile?.name}</strong>. 추출된 약 정보를 확인하고 필요한 항목을 수정한 뒤 저장합니다.
              </p>
            </Card>
          )}

          <div className="mt-5"><MedicalNotice /></div>

          {guideOpen && (
            <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 px-4">
              <div className="w-full max-w-2xl rounded-[10px] border border-[#d8dde5] bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-[#222222]">“내가 먹는 약! 한눈에” 자료 받는 방법</h2>
                    <p className="mt-2 text-sm leading-6 text-[#3f3f3f]">아래 순서대로 자료를 내려받은 뒤 복약자료 업로드 화면에 등록하세요.</p>
                  </div>
                  <button type="button" onClick={() => setGuideOpen(false)} className="rounded-md p-2 hover:bg-[#f7f8fa]">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <ol className="mt-5 space-y-4 text-sm leading-7 text-[#3f3f3f]">
                  <li><strong>1.</strong> 건강보험심사평가원 또는 정부 제공 서비스에서 “내가 먹는 약! 한눈에” 메뉴로 이동합니다.</li>
                  <li><strong>2.</strong> 본인인증 후 최근 처방 및 조제 약 정보를 조회합니다.</li>
                  <li><strong>3.</strong> PDF 저장 또는 화면 캡처로 약 목록 파일을 준비합니다.</li>
                  <li><strong>4.</strong> 이 화면의 처방전 · 약 정보 업로드 영역에 파일을 등록합니다.</li>
                </ol>
                <div className="mt-6 flex flex-wrap justify-end gap-2">
                  <SecondaryButton type="button" onClick={() => window.open('/guides/my-medication-guide.pdf', '_blank')}>안내 PDF 열기</SecondaryButton>
                  <PrimaryButton type="button" onClick={() => setGuideOpen(false)}>확인</PrimaryButton>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {uploadMode === 'checkup' && (
        <>
      {needsProfile && (
        <Card className="mb-5 bg-[#fff7e8] p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="font-medium text-amber-950">분석 저장을 위해 성별과 출생연도가 필요합니다</p>
              <p className="mt-1 text-sm text-amber-800">정상 기준과 일부 수치 해석에 사용됩니다.</p>
            </div>
            <div className="flex gap-2">
              <select value={profile.gender} onChange={(event) => setProfile((current) => ({ ...current, gender: event.target.value }))} className="rounded-md border border-amber-200 bg-white px-3 py-2 text-sm">
                <option value="1">남성</option>
                <option value="2">여성</option>
              </select>
              <input value={profile.birth_year} onChange={(event) => setProfile((current) => ({ ...current, birth_year: event.target.value }))} placeholder="출생연도" className="w-28 rounded-md border border-amber-200 bg-white px-3 py-2 text-sm" />
              <SecondaryButton type="button" onClick={() => void saveProfile()}>저장</SecondaryButton>
            </div>
          </div>
        </Card>
      )}

      <div className="mb-5 grid grid-cols-3 gap-3">
        {['1 결과지 업로드', '2 OCR 결과 확인', '3 분석 및 저장'].map((label, index) => (
          <div key={label} className={`rounded-lg px-3 py-4 text-center text-sm font-bold shadow-sm ${step === index + 1 ? 'bg-[#2457c5] text-white' : 'bg-white text-[#6a6a6a]'}`}>{label}</div>
        ))}
      </div>

      {step === 1 && (
        <Card className="p-8">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-[10px] bg-[#f7f7f7] px-6 py-16 text-center hover:bg-[#eceff1]">
            <span className="grid h-20 w-20 place-items-center rounded-[10px] bg-white text-[#2457c5] shadow-sm">
              <FileUp className="h-10 w-10" />
            </span>
            <span className="mt-5 text-xl font-bold text-[#222222]">{file ? file.name : '건강검진 결과지를 선택해주세요'}</span>
            <span className="mt-2 text-base text-[#6a6a6a]">JPG, PNG, PDF 파일을 지원합니다.</span>
            <input type="file" accept="image/*,.pdf" className="hidden" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </label>
          <div className="mt-5 flex justify-end">
            <PrimaryButton type="button" onClick={() => void upload()} disabled={loading}>{loading ? 'OCR 분석 중...' : 'OCR 분석 시작'}</PrimaryButton>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="p-8">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-slate-950">OCR 결과 확인</h2>
              <p className="mt-1 text-sm text-slate-500">의심 값은 테두리로 표시했습니다. 원본 결과지와 비교 후 수정해주세요.</p>
            </div>
            {suspicious.length > 0 && <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-800"><AlertTriangle className="h-3.5 w-3.5" /> 확인 필요 {suspicious.length}개</span>}
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Object.keys(labels).map((key) => (
              <label key={key} className="block text-sm font-medium text-slate-700">
                {labels[key]}
                <input
                  value={form[key] ?? ''}
                  onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                className={`mt-2 w-full rounded-lg border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#2457c5]/15 ${suspicious.includes(key) ? 'border-rose-300 bg-rose-50' : 'border-transparent bg-[#f7f7f7]'}`}
                />
              </label>
            ))}
          </div>
          <div className="mt-5 flex justify-between">
            <SecondaryButton type="button" onClick={() => setStep(1)}>이전</SecondaryButton>
            <PrimaryButton type="button" onClick={() => void saveAnalysis()} disabled={loading}><Save className="mr-2 h-4 w-4" /> {loading ? '저장 중...' : '분석 및 저장'}</PrimaryButton>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="p-8 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-teal-600" />
          <h2 className="mt-4 text-lg font-semibold text-slate-950">분석 저장이 완료되었습니다</h2>
          <p className="mt-2 text-sm text-slate-500">대시보드와 검진 기록에서 저장된 결과를 확인할 수 있습니다.</p>
        </Card>
      )}

      <div className="mt-5"><MedicalNotice /></div>
        </>
      )}
    </div>
  );
}




