import { useState } from 'react';
import type { ChangeEvent } from 'react';
import type { AppData } from '../App';
import { analyzeCheckup, patchUser, uploadCheckupImage } from '../api/endpoints';
import type { Profile, RealOcrResult } from '../api/types';
import { Card, ErrorBox, Loading, SectionTitle } from '../components/UI';
import { LifestyleFields, type LifestyleValue } from '../components/LifestyleFields';
import { alcoholWeeklyGrams, DRINK_TYPES, OCR_LOW_CONFIDENCE, ocrFlagText } from '../lib/format';

// 검수 폼 항목 틀 — 모바일 data.ts의 ocrTemplate(300-319행)과 같은 id·라벨·단위·구분.
// 예시값은 넣지 않는다(전부 빈 문자열로 시작).
type FieldDef = { id: string; label: string; unit?: string; required?: boolean; section: '기본 정보' | '검사 수치' };

const FIELDS: FieldDef[] = [
  { id: 'exam_date', label: '검진일', required: true, section: '기본 정보' },
  { id: 'hospital', label: '검진기관', required: true, section: '기본 정보' },
  { id: 'height', label: '키', unit: 'cm', section: '검사 수치' },
  { id: 'weight', label: '몸무게', unit: 'kg', section: '검사 수치' },
  { id: 'waist', label: '허리둘레', unit: 'cm', section: '검사 수치' },
  { id: 'sbp', label: '수축기 혈압', unit: 'mmHg', required: true, section: '검사 수치' },
  { id: 'dbp', label: '이완기 혈압', unit: 'mmHg', required: true, section: '검사 수치' },
  { id: 'hb', label: '혈색소', unit: 'g/dL', section: '검사 수치' },
  { id: 'fbs', label: '공복혈당', unit: 'mg/dL', required: true, section: '검사 수치' },
  { id: 'total_cholesterol', label: '총콜레스테롤', unit: 'mg/dL', section: '검사 수치' },
  { id: 'hdl', label: 'HDL 콜레스테롤', unit: 'mg/dL', section: '검사 수치' },
  { id: 'tg', label: '중성지방', unit: 'mg/dL', section: '검사 수치' },
  { id: 'ldl', label: 'LDL 콜레스테롤', unit: 'mg/dL', section: '검사 수치' },
  { id: 'creatinine', label: '혈청 크레아티닌', unit: 'mg/dL', section: '검사 수치' },
  { id: 'urine_protein', label: '요단백', section: '검사 수치' },
  { id: 'ast', label: 'AST(SGOT)', unit: 'IU/L', section: '검사 수치' },
  { id: 'alt', label: 'ALT(SGPT)', unit: 'IU/L', section: '검사 수치' },
  { id: 'ggt', label: '감마-GTP', unit: 'IU/L', section: '검사 수치' },
];
const TEXT_IDS = new Set(['exam_date', 'hospital', 'urine_protein']);

type Confidence = Record<string, { confidence?: number; flags?: string[] }>;

function emptyFields(): Record<string, string> {
  return Object.fromEntries(FIELDS.map((f) => [f.id, '']));
}

/** 폼 값 → 백엔드 ocr 골격. 숫자 항목은 실제 숫자로 보낸다(저장 경로는 문자열을 강제 변환하지 않는다). */
function buildOcr(fields: Record<string, string>): RealOcrResult['ocr'] {
  const measurements: Record<string, { value: unknown; unit?: string }> = {};
  for (const f of FIELDS) {
    if (f.id === 'exam_date' || f.id === 'hospital') continue;
    const raw = fields[f.id]?.trim();
    if (!raw) continue;
    if (f.id === 'urine_protein') {
      measurements[f.id] = { value: raw };
    } else {
      const num = Number(raw);
      if (Number.isNaN(num)) continue;
      measurements[f.id] = { value: num, unit: f.unit };
    }
  }
  return { meta: { exam_date: fields.exam_date.trim(), hospital: fields.hospital.trim() }, measurements };
}

function validate(fields: Record<string, string>): string | null {
  const missing = FIELDS.filter((f) => f.required && !fields[f.id]?.trim());
  if (missing.length) return `필수 항목을 입력해주세요: ${missing.map((f) => f.label).join(', ')}`;
  // 빈 값은 허용(미측정) — 값이 있는데 숫자가 아닌 경우만 막는다. 필수 여부와 무관하게 전체 수치 필드에 적용.
  const invalidNumeric = FIELDS.filter((f) => {
    if (TEXT_IDS.has(f.id)) return false;
    const raw = fields[f.id]?.trim();
    if (!raw) return false;
    return Number.isNaN(Number(raw));
  });
  if (invalidNumeric.length) return `숫자로 입력해주세요: ${invalidNumeric.map((f) => f.label).join(', ')}`;
  return null;
}

export function UploadSection({ data, onSaved }: { data: AppData; onSaved?: () => void }) {
  const [tab, setTab] = useState<'upload' | 'manual'>('upload');
  const [fields, setFields] = useState<Record<string, string>>(emptyFields);
  const [confidence, setConfidence] = useState<Confidence>({});
  const [ocrWarnings, setOcrWarnings] = useState<string[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const [lifestyle, setLifestyle] = useState<LifestyleValue>({
    smoking: data.profile?.smoking ?? '',
    drinking: data.profile?.drinking ?? '',
    drinkFreq: '',
    drinkGlasses: '',
    drinkType: DRINK_TYPES[0],
  });

  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveWarnings, setSaveWarnings] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  const updateField = (id: string, value: string) => {
    setFields((prev) => ({ ...prev, [id]: value }));
    // 사용자가 편집한 칸은 OCR 확신도라는 개념이 없으므로 즉시 해제한다.
    setConfidence((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadBusy(true);
    setUploadError('');
    try {
      const res = await uploadCheckupImage(file);
      const meta = res.ocr.meta ?? {};
      const measurements = res.ocr.measurements ?? {};
      setFields((prev) => {
        const next = { ...prev };
        if (meta.exam_date != null) next.exam_date = String(meta.exam_date);
        if (meta.hospital != null) next.hospital = String(meta.hospital);
        for (const f of FIELDS) {
          if (f.id === 'exam_date' || f.id === 'hospital') continue;
          const m = measurements[f.id];
          if (m && m.value != null) next[f.id] = String(m.value);
        }
        return next;
      });
      setConfidence(res.ocr.measurements_confidence ?? {});
      setOcrWarnings(res.warnings ?? []);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '업로드에 실패했어요.');
    } finally {
      setUploadBusy(false);
    }
  };

  const alcoholG = lifestyle.drinking === 'yes'
    ? alcoholWeeklyGrams(Number(lifestyle.drinkFreq) || 0, Number(lifestyle.drinkGlasses) || 0, lifestyle.drinkType)
    : 0;

  const handleSave = async () => {
    setSaveError('');
    setSaved(false);
    const err = validate(fields);
    if (err) {
      setSaveError(err);
      return;
    }
    setSaveBusy(true);
    try {
      // 검진 저장을 먼저 확정한다 — 생활습관 patch가 검진 저장보다 먼저 성공해버리면
      // 검진 저장이 실패했을 때 생활습관만 반영된 부분 상태가 남는다.
      const result = await analyzeCheckup(buildOcr(fields), true);
      const warnings = [...(result.warnings ?? [])];

      const lifestyleBody: Partial<Profile> = {};
      if (lifestyle.smoking) lifestyleBody.smoking = lifestyle.smoking;
      if (lifestyle.drinking) {
        lifestyleBody.drinking = lifestyle.drinking;
        if (lifestyle.drinking === 'yes') {
          // 0이면 사용자가 음주 상세(횟수·잔수)를 입력하지 않은 것으로 보고, 기존 값을 지우지 않도록 생략한다.
          if (alcoholG > 0) lifestyleBody.alcohol_weekly_g = alcoholG;
        } else {
          lifestyleBody.alcohol_weekly_g = 0;
        }
      }
      if (Object.keys(lifestyleBody).length) {
        try {
          await patchUser(data.userId, lifestyleBody);
        } catch {
          // 검진 저장은 이미 성공했으므로 이건 저장 실패로 취급하지 않고 경고만 남긴다.
          warnings.push('생활습관 저장 실패');
        }
      }

      setSaveWarnings(warnings);
      setSaved(true);
      await data.reload();
      onSaved?.();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '저장에 실패했어요.');
    } finally {
      setSaveBusy(false);
    }
  };

  return (
    <>
      <SectionTitle sub="검진지 사진을 올리거나 값을 직접 입력합니다.">업로드·입력</SectionTitle>

      <div className="mb-6 flex gap-2">
        <button
          onClick={() => setTab('upload')}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ring-1 transition ${
            tab === 'upload' ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
          }`}
        >
          검진지 사진 업로드
        </button>
        <button
          onClick={() => setTab('manual')}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ring-1 transition ${
            tab === 'manual' ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
          }`}
        >
          직접 입력
        </button>
      </div>

      {tab === 'upload' && (
        <Card className="mb-6">
          <input type="file" accept="image/*" onChange={(e) => void handleFile(e)} disabled={uploadBusy}
            className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-800" />
          {uploadBusy && <div className="mt-3"><Loading label="검진지를 읽는 중…" /></div>}
          {uploadError && <div className="mt-3"><ErrorBox message={uploadError} /></div>}
          {ocrWarnings.length > 0 && (
            <div className="mt-3 rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200">
              {ocrWarnings.map((w, i) => (
                <p key={i} className="text-sm text-amber-800 leading-relaxed">{w}</p>
              ))}
            </div>
          )}
        </Card>
      )}

      {(['기본 정보', '검사 수치'] as const).map((section) => (
        <Card key={section} title={section} className="mb-6">
          <div className="grid grid-cols-3 gap-x-6 gap-y-5">
            {FIELDS.filter((f) => f.section === section).map((f) => {
              const conf = confidence[f.id];
              const lowConf = conf?.confidence != null && conf.confidence < OCR_LOW_CONFIDENCE;
              const flagText = lowConf ? ocrFlagText(conf?.flags) : null;
              return (
                <label key={f.id} className="block">
                  <span className="text-sm font-medium text-slate-600">
                    {f.label}
                    {f.required && <span className="ml-0.5 text-rose-500">*</span>}
                    {f.unit && <span className="ml-1.5 text-xs text-slate-400">{f.unit}</span>}
                  </span>
                  <input
                    type="text"
                    value={fields[f.id]}
                    onChange={(e) => updateField(f.id, e.target.value)}
                    placeholder={f.id === 'exam_date' ? 'YYYY-MM-DD' : undefined}
                    className={`mt-1.5 w-full rounded-lg px-3 py-2 text-sm outline-none ring-1 focus:ring-2 focus:ring-slate-900 ${
                      lowConf ? 'bg-amber-50 ring-amber-400' : 'ring-slate-300'
                    }`}
                  />
                  {lowConf && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                        확신 {Math.round((conf?.confidence ?? 0) * 100)}%
                      </span>
                      {flagText && <span className="text-xs text-amber-700">{flagText}</span>}
                    </div>
                  )}
                </label>
              );
            })}
          </div>
        </Card>
      ))}

      <Card title="생활습관" sub="분석은 백엔드가 프로필에 저장된 값을 읽어서 사용해요." className="mb-6">
        <LifestyleFields value={lifestyle} onChange={setLifestyle} gender={data.profile?.gender ?? null} />
      </Card>

      {saveError && <div className="mb-4"><ErrorBox message={saveError} /></div>}

      {saved && (
        <div className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200">
          <p className="text-sm font-semibold text-emerald-800">저장했어요. 대시보드에서 확인하세요.</p>
          {saveWarnings.map((w, i) => (
            <p key={i} className="mt-1 text-xs leading-relaxed text-emerald-700">{w}</p>
          ))}
        </div>
      )}

      <button
        onClick={() => void handleSave()}
        disabled={saveBusy}
        className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
      >
        {saveBusy ? '저장 중…' : '저장'}
      </button>
    </>
  );
}
