import { useState } from 'react';
import { simulateCheckup } from '../api/endpoints';
import type { MetricKey, RealSimulation, Report, SimulateChanges } from '../api/types';
import { Card, ErrorBox, LevelBadge, Stepper } from './UI';

const CONTROLS: {
  label: string; from: MetricKey; to: keyof SimulateChanges;
  min: number; max: number; step: number; unit: string;
}[] = [
  { label: '허리둘레', from: 'waist', to: 'waist', min: 50, max: 150, step: 1, unit: 'cm' },
  { label: '수축기혈압', from: 'sbp', to: 'sbp', min: 80, max: 220, step: 1, unit: 'mmHg' },
  { label: '이완기혈압', from: 'dbp', to: 'dbp', min: 40, max: 140, step: 1, unit: 'mmHg' },
  { label: '공복혈당', from: 'glucose', to: 'fbs', min: 50, max: 400, step: 1, unit: 'mg/dL' },
  { label: '중성지방', from: 'triglyceride', to: 'tg', min: 30, max: 900, step: 5, unit: 'mg/dL' },
  { label: 'HDL 콜레스테롤', from: 'hdl', to: 'hdl', min: 15, max: 120, step: 1, unit: 'mg/dL' },
  { label: 'LDL 콜레스테롤', from: 'ldl', to: 'ldl', min: 30, max: 300, step: 1, unit: 'mg/dL' },
];

/**
 * ⚠️ latest는 반드시 '가장 최근' 회차여야 한다.
 * 서버(POST /analyze/simulate)는 항상 최신 저장 검진값을 기준선으로 쓰기 때문에,
 * 연도 탭에서 과거 회차를 넘기면 스테퍼에 보이는 값과 계산 기준이 어긋난다.
 */
export function WhatIfPanel({ latest }: { latest: Report }) {
  const active = CONTROLS.filter((c) => typeof latest.values[c.from] === 'number');
  const [values, setValues] = useState<Partial<Record<MetricKey, number>>>(
    () => Object.fromEntries(active.map((c) => [c.from, latest.values[c.from]!])),
  );
  const [result, setResult] = useState<RealSimulation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (active.length === 0) return null;

  const run = async () => {
    const changes: SimulateChanges = {};
    for (const c of active) {
      const v = values[c.from];
      if (typeof v === 'number' && v !== latest.values[c.from]) changes[c.to] = v;
    }
    if (!Object.keys(changes).length) {
      setError('바꾼 값이 없어요. 위 항목을 조정한 뒤 다시 계산해주세요.');
      return;
    }
    setBusy(true); setError('');
    try {
      setResult(await simulateCheckup(changes));
    } catch (e) {
      setError(e instanceof Error ? e.message : '재계산에 실패했어요.');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setValues(Object.fromEntries(active.map((c) => [c.from, latest.values[c.from]!])));
    setResult(null); setError('');
  };

  return (
    <Card className="mb-6">
      <h3 className="text-base font-bold text-slate-900">이렇게 바뀌면?</h3>
      <p className="mt-1 text-sm leading-relaxed text-slate-500">
        다음 검진에서 값이 이렇게 나오면 지표가 어떻게 달라지는지 공식으로 다시 계산해요.
        <br />
        "몇 kg 빼면 수치가 얼마나 내려갈지"를 예측하는 것이 아닙니다.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-8">
        {/* 좌: 스테퍼 + 액션 */}
        <div>
          <div className="divide-y divide-slate-100">
            {active.map((c) => (
              <Stepper
                key={c.from}
                label={c.label}
                value={values[c.from] ?? latest.values[c.from]!}
                min={c.min}
                max={c.max}
                step={c.step}
                unit={c.unit}
                onChange={(v) => setValues((prev) => ({ ...prev, [c.from]: v }))}
              />
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={run}
              disabled={busy}
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
            >
              {busy ? '계산 중…' : '다시 계산'}
            </button>
            <button
              onClick={reset}
              disabled={busy}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-40"
            >
              되돌리기
            </button>
          </div>
          {error && <div className="mt-4"><ErrorBox message={error} /></div>}
        </div>

        {/* 우: 결과 비교 */}
        <div>
          {!result ? (
            <p className="text-sm leading-relaxed text-slate-400">
              왼쪽 값을 조정하고 [다시 계산]을 눌러보세요.
            </p>
          ) : result.error ? (
            <ErrorBox message={result.error} />
          ) : (
            <WhatIfResult result={result} />
          )}
        </div>
      </div>
    </Card>
  );
}

// TG≥400이면 백엔드가 achieved를 null로 준다(Friedewald LDL 신뢰도 낮음 — 판정 보류).
function achievedLabel(achieved: boolean | null): string {
  if (achieved === null) return '판정 보류';
  return achieved ? '목표 달성' : '목표 초과';
}

function WhatIfResult({ result }: { result: RealSimulation }) {
  const ms = result.metabolic_syndrome;
  const beforeFactors = new Set(ms.before.met_factors);
  const afterFactors = new Set(ms.after.met_factors);
  const factorsResolved = ms.before.met_factors.filter((f) => !afterFactors.has(f));
  const factorsAdded = ms.after.met_factors.filter((f) => !beforeFactors.has(f));
  const changedCalcs = result.calculators.filter((c) => c.changed);
  const target = result.ldl_target;

  return (
    <div className="space-y-6">
      {/* 1. 대사증후군 */}
      <div>
        <h4 className="text-sm font-bold text-slate-700">대사증후군</h4>
        <p className="mt-1.5 text-sm text-slate-600">
          충족 인자 <span className="font-semibold text-slate-900 tabular-nums">{ms.before.count ?? '—'}</span>
          {' → '}
          <span className="font-semibold text-slate-900 tabular-nums">{ms.after.count ?? '—'}</span>개
        </p>
        {ms.after.is_metabolic_syndrome === false && ms.before.is_metabolic_syndrome === true && (
          <p className="mt-1.5 text-sm font-semibold text-emerald-700">
            3개 미만이 되어 대사증후군 기준에서 벗어나요
          </p>
        )}
        {(factorsResolved.length > 0 || factorsAdded.length > 0) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {factorsResolved.map((f) => (
              <span key={`r-${f}`} className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                해소: {f}
              </span>
            ))}
            {factorsAdded.map((f) => (
              <span key={`a-${f}`} className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
                추가: {f}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 2. 바뀐 계산기 */}
      {changedCalcs.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-slate-700">바뀐 계산기</h4>
          <div className="mt-1.5 space-y-3">
            {changedCalcs.map((c) => (
              <div key={c.key} className="rounded-xl bg-slate-50 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900">{c.title}</span>
                  <span className="text-sm tabular-nums text-slate-600">
                    {c.before ?? '—'} → {c.after ?? '—'}
                    {c.delta != null && (
                      <span className="ml-1 text-xs text-slate-400">({c.delta > 0 ? '+' : ''}{c.delta})</span>
                    )}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <LevelBadge level={c.before_level} />
                  <span className="text-xs text-slate-400">→</span>
                  <LevelBadge level={c.after_level} />
                </div>
                {c.after_interpretation && (
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{c.after_interpretation}</p>
                )}
                {c.before_percentile != null && c.after_percentile != null && (
                  <p className="mt-1 text-xs text-slate-500">
                    또래 상위 {c.before_percentile}% → {c.after_percentile}%
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. 집단군 변화 */}
      {(result.groups.resolved.length > 0 || result.groups.added.length > 0) && (
        <div>
          <h4 className="text-sm font-bold text-slate-700">집단군 변화</h4>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {result.groups.resolved.map((g) => (
              <span key={`gr-${g}`} className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                벗어남: {g}
              </span>
            ))}
            {result.groups.added.map((g) => (
              <span key={`ga-${g}`} className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                새로 해당: {g}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 4. LDL 목표 — achieved가 null(TG≥400 신뢰도 보류)이어도 블록 자체는 숨기지 않는다 */}
      {target.target_ldl != null && (
        <div>
          <h4 className="text-sm font-bold text-slate-700">LDL 목표</h4>
          <p className="mt-1.5 text-sm text-slate-600">
            {achievedLabel(target.before_achieved)}
            {' → '}
            {achievedLabel(target.after_achieved)}
          </p>
          {(target.before_achieved === null || target.after_achieved === null) && (
            <p className="mt-1 text-xs text-slate-400">
              중성지방이 400 이상이면 LDL 계산값의 신뢰도가 낮아 판정을 보류해요
            </p>
          )}
        </div>
      )}

      {/* 5. 그대로인 지표 */}
      {result.unchanged.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-slate-700">그대로인 지표</h4>
          <p className="mt-1 text-xs text-slate-400">바꾼 값이 이 지표의 계산식에 들어가지 않아서예요</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {result.unchanged.map((u) => (
              <span key={u} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">{u}</span>
            ))}
          </div>
        </div>
      )}

      {/* 6. 한계 전량 노출 */}
      {result.limitations.length > 0 && (
        <div className="border-t border-slate-100 pt-3">
          <ul className="space-y-1">
            {result.limitations.map((l, i) => (
              <li key={i} className="text-xs leading-relaxed text-slate-400">· {l}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
