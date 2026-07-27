import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { AppData } from '../App';
import * as api from '../api/endpoints';
import { metricLabel } from '../api/adapt';
import type { MedicationItem, ReferenceItemResult, RealEgfr, RealMedicationUploadResult } from '../api/types';
import { Card, ErrorBox, Loading, SectionTitle } from '../components/UI';
import { fmt } from '../lib/format';

/** dispensed_date는 백엔드가 YYYYMMDD로 준다 → 화면은 YYYY-MM-DD로 표시. */
function formatDispensedDate(raw: unknown): string {
  const s = String(raw ?? '');
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s || '—';
}

const NORMAL_STATUS_TEXT: Record<string, string> = { normal: '정상', low: '낮음', high: '높음' };
const SEVERITY_TEXT: Record<string, string> = { normal: '정상', caution: '주의', warning: '경고' };
const MEAN_POSITION_TEXT: Record<string, string> = { above: '평균 이상', below: '평균 이하', near: '평균 근접' };

export function ToolsSection({ data }: { data: AppData }) {
  return (
    <>
      <SectionTitle sub="투약이력·검사항목 참고치·신장기능 계산기입니다.">도구·참고</SectionTitle>
      <div className="space-y-6">
        <MedicationCard userId={data.userId} />
        <ReferenceCard />
        <EgfrCard data={data} />
      </div>
    </>
  );
}

// ─── A. 투약이력 (HIRA) ─────────────────────────────────────────────────
function MedicationCard({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsBirthday, setNeedsBirthday] = useState(false);
  const [manualBirthday, setManualBirthday] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [result, setResult] = useState<RealMedicationUploadResult | null>(null);

  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [history, setHistory] = useState<MedicationItem[] | null>(null);

  const doUpload = async (file: File, birthday?: string) => {
    setBusy(true);
    setError('');
    try {
      const res = await api.uploadMedicationFile(file, birthday);
      setResult(res);
      setNeedsBirthday(false);
      setPendingFile(null);
      setManualBirthday('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '업로드에 실패했어요.';
      setError(msg);
      // 백엔드가 생일 불일치 시 401을 준다 — 수동 생일 입력칸을 노출한다.
      if (msg.startsWith('401')) {
        setNeedsBirthday(true);
        setPendingFile(file);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setResult(null);
    setNeedsBirthday(false);
    void doUpload(file);
  };

  const retryWithBirthday = () => {
    if (!pendingFile || !manualBirthday.trim()) return;
    void doUpload(pendingFile, manualBirthday.trim());
  };

  const loadHistory = async () => {
    setHistoryBusy(true);
    setHistoryError('');
    try {
      setHistory(await api.getMedications(userId));
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : '조회에 실패했어요.');
    } finally {
      setHistoryBusy(false);
    }
  };

  // items[]를 efficacy_class(효능군)로 묶는다.
  const grouped: Record<string, Array<Record<string, any>>> = {};
  for (const it of result?.items ?? []) {
    const cls = it.efficacy_class || '기타';
    (grouped[cls] ??= []).push(it);
  }

  return (
    <Card title="투약이력 (HIRA)" sub="건강보험심사평가원 '내가 먹는 약! 한눈에' 엑셀을 업로드하면 정리해서 보여줘요.">
      <input
        type="file"
        accept=".xls,.xlsx"
        onChange={handleFile}
        disabled={busy}
        className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-800"
      />
      {busy && <div className="mt-3"><Loading label="업로드하는 중…" /></div>}
      {error && <div className="mt-3"><ErrorBox message={error} /></div>}

      {needsBirthday && (
        <div className="mt-3 flex items-center gap-2">
          <input
            type="text"
            placeholder="생년월일 YYYYMMDD 또는 YYYY-MM-DD"
            value={manualBirthday}
            onChange={(e) => setManualBirthday(e.target.value)}
            className="flex-1 rounded-lg px-3 py-2 text-sm outline-none ring-1 ring-slate-300 focus:ring-2 focus:ring-slate-900"
          />
          <button
            onClick={retryWithBirthday}
            disabled={busy || !manualBirthday.trim()}
            className="shrink-0 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            다시 시도
          </button>
        </div>
      )}

      {result && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap gap-4 text-sm text-slate-600">
            <span>파싱 {result.count}건</span>
            <span>{result.persisted ? `저장됨 (신규 ${result.inserted}건)` : '저장되지 않음'}</span>
          </div>
          {result.unique_ingredients.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {result.unique_ingredients.map((ing) => (
                <span key={ing} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">{ing}</span>
              ))}
            </div>
          )}

          {Object.entries(grouped).map(([cls, items]) => (
            <div key={cls} className="mt-4">
              <h4 className="mb-2 text-sm font-bold text-slate-700">{cls}</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs text-slate-400">
                      <th className="py-2 pr-3 font-medium">제품명</th>
                      <th className="py-2 pr-3 font-medium">성분</th>
                      <th className="py-2 pr-3 font-medium">조제일</th>
                      <th className="py-2 pr-3 font-medium">투여일수</th>
                      <th className="py-2 pr-3 font-medium">1일 횟수</th>
                      <th className="py-2 font-medium">1회 용량</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0">
                        <td className="py-2 pr-3 font-semibold text-slate-900">{it.product_name}</td>
                        <td className="py-2 pr-3 text-slate-600">{it.ingredient_en || '—'}</td>
                        <td className="py-2 pr-3 tabular-nums text-slate-600">{formatDispensedDate(it.dispensed_date)}</td>
                        <td className="py-2 pr-3 tabular-nums text-slate-600">{it.total_days != null ? `${it.total_days}일` : '—'}</td>
                        <td className="py-2 pr-3 tabular-nums text-slate-600">{it.times_per_day != null ? `1일 ${it.times_per_day}회` : '—'}</td>
                        <td className="py-2 tabular-nums text-slate-600">
                          {it.dose_per_time != null ? `${it.dose_per_time}${it.unit ?? ''}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 border-t border-slate-100 pt-4">
        <button
          onClick={() => void loadHistory()}
          disabled={historyBusy}
          className="rounded-lg px-3.5 py-1.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-40"
        >
          {historyBusy ? '불러오는 중…' : '저장된 투약이력 조회'}
        </button>
        {historyError && <div className="mt-3"><ErrorBox message={historyError} /></div>}
        {history && (
          history.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">저장된 투약이력이 없어요.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-400">
                    <th className="py-2 pr-3 font-medium">제품명</th>
                    <th className="py-2 pr-3 font-medium">효능군</th>
                    <th className="py-2 pr-3 font-medium">조제일</th>
                    <th className="py-2 font-medium">투여일수</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((it, i) => (
                    <tr key={i} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 pr-3 font-semibold text-slate-900">{it.product_name}</td>
                      <td className="py-2 pr-3 text-slate-600">{it.efficacy_class || '—'}</td>
                      <td className="py-2 pr-3 tabular-nums text-slate-600">{formatDispensedDate(it.dispensed_date)}</td>
                      <td className="py-2 tabular-nums text-slate-600">{it.total_days != null ? `${it.total_days}일` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </Card>
  );
}

// ─── B. 검사항목 참고치 ─────────────────────────────────────────────────
function ReferenceCard() {
  const [items, setItems] = useState<string[]>([]);
  const [itemsBusy, setItemsBusy] = useState(true);
  const [itemsError, setItemsError] = useState('');

  const [sex, setSex] = useState<'M' | 'F'>('M');
  const [values, setValues] = useState<Record<string, string>>({});
  const [means, setMeans] = useState<Record<string, string>>({});

  const [evalBusy, setEvalBusy] = useState(false);
  const [evalError, setEvalError] = useState('');
  const [results, setResults] = useState<ReferenceItemResult[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getReferenceItems()
      .then((list) => { if (!cancelled) setItems(list); })
      .catch((e) => { if (!cancelled) setItemsError(e instanceof Error ? e.message : '항목 목록을 불러오지 못했어요.'); })
      .finally(() => { if (!cancelled) setItemsBusy(false); });
    return () => { cancelled = true; };
  }, []);

  const handleEvaluate = async () => {
    setEvalError('');
    setResults(null);
    const payload = items
      .filter((k) => values[k]?.trim())
      .map((k) => {
        const value = Number(values[k]);
        const meanRaw = means[k]?.trim();
        const population_mean = meanRaw ? Number(meanRaw) : undefined;
        return { item: k, value, ...(population_mean !== undefined && !Number.isNaN(population_mean) ? { population_mean } : {}) };
      })
      .filter((x) => !Number.isNaN(x.value));
    if (payload.length === 0) {
      setEvalError('최소 한 항목에 값을 입력해주세요.');
      return;
    }
    setEvalBusy(true);
    try {
      const res = await api.evaluateReference(sex, payload);
      setResults(res.results);
    } catch (e) {
      setEvalError(e instanceof Error ? e.message : '평가에 실패했어요.');
    } finally {
      setEvalBusy(false);
    }
  };

  return (
    <Card title="검사항목 참고치" sub="성별과 값을 입력하면 정상범위와 상태를 알려줘요.">
      {itemsBusy && <Loading label="항목 목록을 불러오는 중…" />}
      {itemsError && <ErrorBox message={itemsError} />}

      {!itemsBusy && !itemsError && (
        <>
          <div className="flex gap-2">
            {(['M', 'F'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSex(s)}
                className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold ring-1 transition ${
                  sex === s ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'
                }`}
              >
                {s === 'M' ? '남' : '여'}
              </button>
            ))}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-400">
                  <th className="py-2 pr-3 font-medium">항목</th>
                  <th className="py-2 pr-3 font-medium">값</th>
                  <th className="py-2 font-medium">모집단 평균(선택)</th>
                </tr>
              </thead>
              <tbody>
                {items.map((k) => (
                  <tr key={k} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3 font-medium text-slate-700">{metricLabel(k)}</td>
                    <td className="py-2 pr-3">
                      <input
                        type="text"
                        value={values[k] ?? ''}
                        onChange={(e) => setValues((p) => ({ ...p, [k]: e.target.value }))}
                        className="w-24 rounded-lg px-2 py-1.5 text-sm outline-none ring-1 ring-slate-300 focus:ring-2 focus:ring-slate-900"
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="text"
                        value={means[k] ?? ''}
                        onChange={(e) => setMeans((p) => ({ ...p, [k]: e.target.value }))}
                        className="w-24 rounded-lg px-2 py-1.5 text-sm outline-none ring-1 ring-slate-300 focus:ring-2 focus:ring-slate-900"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={() => void handleEvaluate()}
            disabled={evalBusy}
            className="mt-4 rounded-lg bg-slate-900 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
          >
            {evalBusy ? '평가하는 중…' : '평가'}
          </button>
          {evalError && <div className="mt-3"><ErrorBox message={evalError} /></div>}

          {results && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-400">
                    <th className="py-2 pr-3 font-medium">항목</th>
                    <th className="py-2 pr-3 font-medium">값</th>
                    <th className="py-2 pr-3 font-medium">정상범위</th>
                    <th className="py-2 pr-3 font-medium">상태</th>
                    <th className="py-2 pr-3 font-medium">중증도</th>
                    <th className="py-2 font-medium">모집단 대비</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.item} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 pr-3 font-semibold text-slate-900">{metricLabel(r.item)}</td>
                      <td className="py-2 pr-3 tabular-nums text-slate-600">{fmt(r.value, r.unit)}</td>
                      <td className="py-2 pr-3 tabular-nums text-slate-600">
                        {r.normal_low != null || r.normal_high != null ? `${r.normal_low ?? '—'} ~ ${r.normal_high ?? '—'}` : '—'}
                      </td>
                      <td className="py-2 pr-3 text-slate-700">{NORMAL_STATUS_TEXT[r.normal_status] ?? r.normal_status}</td>
                      <td className="py-2 pr-3 text-slate-700">{SEVERITY_TEXT[r.severity] ?? r.severity}</td>
                      <td className="py-2 text-xs text-slate-500">
                        {r.population_mean != null
                          ? `평균 ${r.population_mean}${r.unit ?? ''}`
                            + (r.diff_from_mean != null ? ` · ${r.diff_from_mean > 0 ? '+' : ''}${r.diff_from_mean}` : '')
                            + (r.pct_from_mean != null ? ` (${r.pct_from_mean}%)` : '')
                            + (r.mean_position ? ` · ${MEAN_POSITION_TEXT[r.mean_position] ?? r.mean_position}` : '')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ─── C. eGFR 계산기 ─────────────────────────────────────────────────────
function EgfrCard({ data }: { data: AppData }) {
  const latestCheckup = data.raw[data.raw.length - 1]?.checkup;
  const defaultAge = data.profile?.birth_year ? new Date().getFullYear() - data.profile.birth_year : undefined;
  const defaultSex: 'M' | 'F' = data.profile?.gender === 2 ? 'F' : 'M';
  const defaultCr = latestCheckup?.creatinine;

  const [cr, setCr] = useState(defaultCr != null ? String(defaultCr) : '');
  const [age, setAge] = useState(defaultAge != null ? String(defaultAge) : '');
  const [sex, setSex] = useState<'M' | 'F'>(defaultSex);
  // 체중은 브리프상 기본값 대상이 아니다 — "체중을 넣었을 때만" crcl이 나오는 선택 입력이므로 빈 값에서 시작한다.
  const [weight, setWeight] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<RealEgfr | null>(null);

  const handleCalc = async () => {
    setError('');
    const crNum = Number(cr);
    const ageNum = Number(age);
    if (!cr.trim() || Number.isNaN(crNum) || !age.trim() || Number.isNaN(ageNum)) {
      setError('혈청 크레아티닌과 나이를 숫자로 입력해주세요.');
      return;
    }
    const weightNum = weight.trim() ? Number(weight) : undefined;
    setBusy(true);
    try {
      setResult(await api.calcEgfr(crNum, ageNum, sex === 'F' ? 2 : 1, weightNum));
    } catch (e) {
      setError(e instanceof Error ? e.message : '계산에 실패했어요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="eGFR 계산기" sub="신장 기능을 참고용으로 계산해요. 진단이 아닙니다.">
      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-600">
            혈청 크레아티닌<span className="ml-0.5 text-rose-500">*</span>
            <span className="ml-1.5 text-xs text-slate-400">mg/dL</span>
          </span>
          <input
            type="text"
            value={cr}
            onChange={(e) => setCr(e.target.value)}
            className="mt-1.5 w-full rounded-lg px-3 py-2 text-sm outline-none ring-1 ring-slate-300 focus:ring-2 focus:ring-slate-900"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-600">나이<span className="ml-0.5 text-rose-500">*</span></span>
          <input
            type="text"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            className="mt-1.5 w-full rounded-lg px-3 py-2 text-sm outline-none ring-1 ring-slate-300 focus:ring-2 focus:ring-slate-900"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-600">성별<span className="ml-0.5 text-rose-500">*</span></span>
          <div className="mt-1.5 flex gap-2">
            {(['M', 'F'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSex(s)}
                className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold ring-1 transition ${
                  sex === s ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'
                }`}
              >
                {s === 'M' ? '남' : '여'}
              </button>
            ))}
          </div>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-600">
            체중(선택)<span className="ml-1.5 text-xs text-slate-400">kg</span>
          </span>
          <input
            type="text"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="mt-1.5 w-full rounded-lg px-3 py-2 text-sm outline-none ring-1 ring-slate-300 focus:ring-2 focus:ring-slate-900"
          />
        </label>
      </div>

      <button
        onClick={() => void handleCalc()}
        disabled={busy}
        className="mt-4 rounded-lg bg-slate-900 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
      >
        {busy ? '계산하는 중…' : '계산'}
      </button>
      {error && <div className="mt-3"><ErrorBox message={error} /></div>}

      {result && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold tabular-nums text-slate-900">{fmt(result.egfr, result.unit)}</span>
            <span className="text-sm font-semibold text-slate-600">{result.stage} · {result.label}</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{result.description}</p>
          <p className="mt-1 text-xs text-slate-400">{result.method}</p>

          {result.crcl != null && (
            <div className="mt-4 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-100">
              <p className="text-sm font-semibold text-amber-900">크레아티닌 청소율(CrCl) — 약물 용량 참고용</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-amber-900">
                {fmt(result.crcl, 'mL/min')}{result.crcl_label && ` · ${result.crcl_label}`}
              </p>
              {result.crcl_note && <p className="mt-1 text-xs leading-relaxed text-amber-700">{result.crcl_note}</p>}
              {result.crcl_method && <p className="mt-1 text-xs text-amber-600">{result.crcl_method}</p>}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
