import { useState } from 'react';
import type { AppData } from '../App';
import type { RealComboAnalysis, RealRecommendations } from '../api/types';
import { Card, EmptyState, KV, LevelBadge, SectionTitle } from '../components/UI';
import { fmt } from '../lib/format';

const CALC_CATEGORY_LABEL: Record<string, string> = {
  lipid: '지질', insulin: '인슐린 저항성', adiposity: '체지방·복부',
  liver: '간', bp: '혈압', cardiovascular: '심혈관',
};
const CALC_CATEGORY_ORDER = ['lipid', 'insulin', 'adiposity', 'liver', 'bp', 'cardiovascular'];

export function AnalysisSection({ data }: { data: AppData }) {
  const { reports, raw } = data;
  const [year, setYear] = useState<number | null>(null);
  if (reports.length === 0) {
    return (
      <>
        <SectionTitle sub="검진 수치로 계산한 참고 지표입니다. 진단이 아닙니다.">종합 분석</SectionTitle>
        <EmptyState title="분석할 검진이 없어요" desc="'업로드·입력'에서 검진 결과를 저장하면 여기에 분석이 나타나요." />
      </>
    );
  }
  const idx = year === null ? raw.length - 1 : raw.findIndex((r) => r.year === year);
  const report = raw[idx < 0 ? raw.length - 1 : idx];
  const combo = report.combo_analysis ?? null;

  return (
    <>
      <SectionTitle sub="검진 수치로 계산한 참고 지표입니다. 진단이 아닙니다.">종합 분석</SectionTitle>

      <div className="mb-6 flex flex-wrap gap-2">
        {reports.map((r) => (
          <button
            key={r.year}
            onClick={() => setYear(r.year)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ring-1 transition ${
              report.year === r.year
                ? 'bg-slate-900 text-white ring-slate-900'
                : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {r.year}년
          </button>
        ))}
      </div>

      {!combo && (
        <EmptyState title="이 회차는 분석 데이터가 없어요" desc="종합 분석은 새로 저장된 검진부터 제공돼요." />
      )}

      {combo && (
        <>
          <div className="grid grid-flow-row-dense grid-cols-2 gap-4">
            <MetabolicSyndromeCard detail={combo.metabolic_syndrome_detail ?? null} />
            <LdlTargetCard target={combo.ldl_target ?? null} />
            <CalculatorsCard calculators={combo.calculators ?? null} />
            <FattyLiverCard fattyLiver={combo.fatty_liver ?? null} />
            <ComboGroupsCard comboGroups={combo.combo_groups ?? null} disclaimer={combo.disclaimer} />
            <SingleGroupsCard groups={combo.single_groups ?? null} />
            <AscvdCard ascvd={combo.ascvd_simulation ?? null} />
            <RecommendationsCard recommendations={report.recommendations ?? null} />
          </div>
        </>
      )}
    </>
  );
}

// ─── 대사증후군 ───────────────────────────────────────────────────────────
function MetabolicSyndromeCard({ detail }: { detail: RealComboAnalysis['metabolic_syndrome_detail'] }) {
  if (!detail) return null;
  // 백엔드 실응답(evaluate_metabolic_syndrome)은 types.ts가 선언한 met_factors 배열이 아니라
  // factors: {인자명: {met, ...}} 딕셔너리로 내려온다 — 두 소스를 모두 받아 폴백한다.
  const factors = detail.factors as Record<string, { met?: boolean }> | undefined;
  const metFactors: string[] = detail.met_factors
    ?? (factors ? Object.entries(factors).filter(([, f]) => f?.met).map(([name]) => name) : []);
  return (
    <Card title="대사증후군">
      <KV
        label="충족 인자"
        value={detail.count != null && detail.evaluable != null ? `${detail.count} / ${detail.evaluable}` : '판정 불가'}
      />
      <KV
        label="판정"
        value={detail.is_metabolic_syndrome == null ? '판정 불가' : detail.is_metabolic_syndrome ? '해당' : '해당 없음'}
      />
      {metFactors.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {metFactors.map((f) => (
            <span key={f} className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
              {f}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── LDL 개인 목표 ────────────────────────────────────────────────────────
function LdlTargetCard({ target }: { target: RealComboAnalysis['ldl_target'] }) {
  if (!target) return null;
  const reliable = target.ldl_reliable !== false;
  return (
    <Card title="LDL 개인 목표">
      <KV label="위험군" value={target.label} />
      <KV label="목표" value={target.target_text} />
      <KV label="현재 LDL" value={fmt(target.current_ldl, 'mg/dL')} />
      {!reliable ? (
        <>
          <span className="mt-3 inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
            판정 보류
          </span>
          {target.reliability_note && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 ring-1 ring-amber-200">
              {target.reliability_note}
            </p>
          )}
        </>
      ) : (
        <>
          {target.achieved != null && (
            <span
              className={`mt-3 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${
                target.achieved ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-amber-200'
              }`}
            >
              {target.achieved ? '목표 달성' : '목표 초과'}
            </span>
          )}
          {target.gap != null && <KV label="목표까지" value={fmt(target.gap, 'mg/dL')} />}
        </>
      )}
      {target.risk_factors.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {target.risk_factors.map((f) => (
            <span key={f} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">{f}</span>
          ))}
        </div>
      )}
      <p className="mt-3 text-sm leading-relaxed text-slate-600">{target.basis}</p>
      <p className="mt-3 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-400">{target.reference}</p>
      {target.limitations[0] && (
        <p className="mt-1 text-xs leading-relaxed text-slate-400">{target.limitations[0]}</p>
      )}
    </Card>
  );
}

// ─── 계산기 15종 ──────────────────────────────────────────────────────────
function CalculatorsCard({ calculators }: { calculators: RealComboAnalysis['calculators'] }) {
  if (!calculators || calculators.items.length === 0) return null;
  const items = calculators.items;
  return (
    <Card title="계산기" sub={`${items.length}종 — 컷오프가 없는 지표는 또래 백분위를 함께 보여줘요.`} className="col-span-2">
      {CALC_CATEGORY_ORDER.filter((cat) => items.some((i) => i.category === cat)).map((cat) => (
        <div key={cat} className="mb-6 last:mb-0">
          <h4 className="mb-2 text-sm font-bold text-slate-700">{CALC_CATEGORY_LABEL[cat]}</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-400">
                  <th className="py-2 pr-3 font-medium">지표</th>
                  <th className="py-2 pr-3 font-medium">값</th>
                  <th className="py-2 pr-3 font-medium">구간</th>
                  <th className="py-2 pr-3 font-medium">해석</th>
                  <th className="py-2 pr-3 font-medium">기준</th>
                  <th className="py-2 font-medium">식</th>
                </tr>
              </thead>
              <tbody>
                {items.filter((i) => i.category === cat).map((item) => (
                  <tr key={item.key} className="border-b border-slate-100 align-top last:border-0">
                    <td className="py-2.5 pr-3 font-semibold text-slate-900">{item.title}</td>
                    <td className="py-2.5 pr-3 tabular-nums text-slate-900">{fmt(item.value, item.unit)}</td>
                    <td className="py-2.5 pr-3"><LevelBadge level={item.level} /></td>
                    <td className="py-2.5 pr-3 leading-relaxed text-slate-600">
                      {item.interpretation}
                      {item.peer_label && <span className="mt-1 block text-xs text-slate-400">{item.peer_label}</span>}
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-slate-400">{item.cutoffs ?? '—'}</td>
                    <td className="py-2.5 text-xs text-slate-400">{item.formula ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {calculators.unavailable.length > 0 && (
        <p className="mt-2 text-xs text-slate-400">계산 불가: {calculators.unavailable.join(', ')}</p>
      )}
      {calculators.disclaimer && (
        <p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-400">{calculators.disclaimer}</p>
      )}
    </Card>
  );
}

// ─── 지방간 ───────────────────────────────────────────────────────────────
function FattyLiverCard({ fattyLiver }: { fattyLiver: RealComboAnalysis['fatty_liver'] }) {
  if (!fattyLiver) return null;
  const indices = fattyLiver.indices;
  return (
    <Card title="지방간">
      <KV label="유형" value={fattyLiver.type ?? '판정 불가'} />
      {fattyLiver.provisional && <p className="mt-1 text-xs text-amber-600">잠정 판정이에요.</p>}
      <p className="mt-3 text-sm leading-relaxed text-slate-600">{fattyLiver.basis}</p>
      {fattyLiver.cardiometabolic_factors.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {fattyLiver.cardiometabolic_factors.map((f) => (
            <span key={f} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">{f}</span>
          ))}
        </div>
      )}
      {fattyLiver.note && <p className="mt-2 text-xs leading-relaxed text-slate-400">{fattyLiver.note}</p>}

      {indices && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="grid grid-cols-2 gap-3">
            {(['fli', 'hsi'] as const).map((k) => {
              const v = indices[k];
              if (!v) return null;
              return (
                <div key={k} className="rounded-xl bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-700">{k.toUpperCase()}</span>
                    <LevelBadge level={v.level} />
                  </div>
                  <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{fmt(v.value)}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">{v.interpretation}</p>
                </div>
              );
            })}
          </div>
          {indices.unavailable.length > 0 && (
            <p className="mt-2 text-xs text-slate-400">계산 불가: {indices.unavailable.join(', ')}</p>
          )}
          {indices.disclaimer && (
            <p className="mt-2 text-xs leading-relaxed text-slate-400">{indices.disclaimer}</p>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── 조합그룹 ─────────────────────────────────────────────────────────────
function ComboGroupsCard({ comboGroups, disclaimer }: {
  comboGroups: RealComboAnalysis['combo_groups']; disclaimer: RealComboAnalysis['disclaimer'];
}) {
  if (!comboGroups) return null;
  return (
    <Card title="조합그룹" sub="내 조합이 모집단에서 얼마나 흔한지(O/E 배수)를 함께 보여줘요." className="col-span-2">
      {comboGroups.matched.length === 0 ? (
        <p className="text-sm text-slate-500">해당하는 조합그룹이 없어요.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {comboGroups.matched.map((g) => (
            <div key={g.combo_name} className="rounded-xl bg-slate-50 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-bold text-slate-900">{g.combo_name}</span>
                {g.population && (
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-500">
                    O/E {g.population.observed_to_expected.toFixed(2)}배
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{g.meaning}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {g.components.map((c) => (
                  <span key={c} className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-600 ring-1 ring-slate-200">{c}</span>
                ))}
              </div>
              {g.population && (
                <p className="mt-2 text-xs text-slate-400">
                  이 조합 {g.population.n_in_combo.toLocaleString()}명 ({g.population.pct_of_total.toFixed(1)}%)
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {comboGroups.not_evaluable.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-500">
            판정 불가 조합 ({comboGroups.not_evaluable.length}건)
          </summary>
          <ul className="mt-2 space-y-1.5">
            {comboGroups.not_evaluable.map((ne) => (
              <li key={ne.combo_name} className="text-xs text-slate-500">
                <span className="font-semibold text-slate-600">{ne.combo_name}</span>
                {' — 누락: '}{ne.missing.join(', ')}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-4 border-t border-slate-100 pt-3">
        <p className="text-xs text-slate-400">
          모집단 출처: {comboGroups.population.source}
          {comboGroups.population.year != null && comboGroups.population.total_n != null &&
            ` · ${comboGroups.population.year}년 · ${comboGroups.population.total_n.toLocaleString()}명`}
        </p>
        {comboGroups.caveats.map((c, i) => (
          <p key={i} className="mt-1 text-xs leading-relaxed text-slate-400">{c}</p>
        ))}
        {disclaimer && <p className="mt-2 text-xs leading-relaxed text-slate-400">{disclaimer}</p>}
      </div>
    </Card>
  );
}

// ─── 단일 집단군 ──────────────────────────────────────────────────────────
function SingleGroupsCard({ groups }: { groups: RealComboAnalysis['single_groups'] }) {
  if (!groups || groups.length === 0) return null;
  return (
    <Card title="단일 집단군" sub={`${groups.length}개 기준으로 판정해요.`} className="col-span-2">
      <div className="grid grid-cols-3 gap-3">
        {groups.map((g) => (
          <div
            key={g.key}
            className={`rounded-xl p-3 ring-1 ${
              g.applies === true ? 'bg-slate-900 ring-slate-900' : g.applies === false ? 'bg-white ring-slate-200' : 'bg-slate-50 ring-slate-100'
            }`}
          >
            <span className={`text-sm font-semibold ${g.applies === true ? 'text-white' : g.applies === null ? 'text-slate-400' : 'text-slate-900'}`}>
              {g.name}
            </span>
            <p className={`mt-1 text-xs ${g.applies === true ? 'text-slate-300' : 'text-slate-400'}`}>
              {g.applies === true ? '해당' : g.applies === false ? '해당 없음' : '판정 불가(입력값 없음)'}
            </p>
            {g.desc && <p className="mt-1 text-xs leading-relaxed text-slate-400">{g.desc}</p>}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── ASCVD 참고 ───────────────────────────────────────────────────────────
function AscvdCard({ ascvd }: { ascvd: RealComboAnalysis['ascvd_simulation'] }) {
  if (!ascvd) return null;
  if (!ascvd.available) {
    return (
      <Card title="ASCVD 참고">
        <p className="text-sm leading-relaxed text-slate-500">{ascvd.reason ?? '계산할 수 없어요.'}</p>
      </Card>
    );
  }
  return (
    <Card title="ASCVD 참고" sub="한국인 대상으로 검증되지 않은 참고용 시뮬레이션이에요.">
      <div className="flex items-baseline gap-3">
        <span className="text-2xl font-bold tabular-nums text-slate-900">{fmt(ascvd.risk_percent, '%')}</span>
        {ascvd.risk_level && <LevelBadge level={ascvd.risk_level} />}
      </div>
      {ascvd.risk_label && <p className="mt-1 text-sm text-slate-600">{ascvd.risk_label}</p>}

      {ascvd.scenarios && ascvd.scenarios.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {ascvd.scenarios.map((s) => (
            <div key={s.name} className="flex items-center justify-between text-xs text-slate-500">
              <span>{s.name}</span>
              <span className="tabular-nums">{s.risk_percent}% ({s.delta > 0 ? '+' : ''}{s.delta})</span>
            </div>
          ))}
        </div>
      )}

      {ascvd.how_to_read && <p className="mt-3 text-xs leading-relaxed text-slate-500">{ascvd.how_to_read}</p>}
      {ascvd.limitations && ascvd.limitations.length > 0 && (
        <ul className="mt-2 space-y-1">
          {ascvd.limitations.map((l, i) => (
            <li key={i} className="text-xs leading-relaxed text-slate-400">· {l}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ─── 권장사항 ─────────────────────────────────────────────────────────────
function RecommendationsCard({ recommendations }: { recommendations: RealRecommendations | null }) {
  if (!recommendations) return null;
  const priority = recommendations.priority_messages ?? [];
  const rec = recommendations.recommendations ?? {};
  const hasAny = priority.length > 0 || !!rec.common?.length || !!rec.metabolic_factors?.length
    || !!rec.group_specific?.length || !!rec.medication_notes?.length || !!rec.elderly_notes?.length;
  if (!hasAny) return null;

  return (
    <Card title="권장사항" className="col-span-2">
      {priority.length > 0 && (
        <ul className="space-y-2">
          {priority.map((m, i) => (
            <li key={i} className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium leading-relaxed text-white">{m}</li>
          ))}
        </ul>
      )}

      {!!rec.common?.length && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {rec.common.map((c) => (
            <div key={c.category} className="rounded-xl bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">{c.category}</p>
              <ul className="mt-2 space-y-1">
                {c.items.map((it, i) => <li key={i} className="text-xs leading-relaxed text-slate-600">· {it}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}

      {!!rec.metabolic_factors?.length && (
        <div className="mt-4 space-y-3">
          {rec.metabolic_factors.map((f) => (
            <div key={f.factor} className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-100">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-amber-900">{f.title}</p>
                {f.target && <span className="text-xs font-medium text-amber-700">{f.target}</span>}
              </div>
              <ul className="mt-2 space-y-1">
                {f.details.map((d, i) => <li key={i} className="text-xs leading-relaxed text-amber-800">· {d}</li>)}
              </ul>
              {f.reason && <p className="mt-1 text-xs text-amber-600">{f.reason}</p>}
            </div>
          ))}
        </div>
      )}

      {!!rec.group_specific?.length && (
        <div className="mt-4 space-y-3">
          {rec.group_specific.map((g) => (
            <div key={g.group_id} className="rounded-xl bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">{g.title}</p>
              <ul className="mt-2 space-y-1">
                {g.details.map((d, i) => <li key={i} className="text-xs leading-relaxed text-slate-600">· {d}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}

      {!!rec.medication_notes?.length && (
        <div className="mt-4 space-y-2">
          {rec.medication_notes.map((m, i) => (
            <p key={i} className="text-xs leading-relaxed text-slate-500">
              <span className="font-semibold text-slate-700">{m.medication}</span> — {m.note}
            </p>
          ))}
        </div>
      )}

      {!!rec.elderly_notes?.length && (
        <ul className="mt-4 space-y-1">
          {rec.elderly_notes.map((n, i) => <li key={i} className="text-xs leading-relaxed text-slate-500">· {n}</li>)}
        </ul>
      )}
    </Card>
  );
}
