import type { AppData } from '../App';
import { fmt } from '../lib/format';
import { Card, EmptyState, KV, SectionTitle } from '../components/UI';

export function DashboardSection({ data }: { data: AppData }) {
  const { reports, latest, timeseries } = data;
  const insight = timeseries?.insight ?? null;
  const rarity = latest?.combo_analysis?.rarity ?? null;
  const summary = latest?.comprehensive?.summary;

  if (reports.length === 0) {
    return (
      <>
        <SectionTitle sub="가장 최근 검진 기준 요약입니다.">대시보드</SectionTitle>
        <EmptyState
          title="아직 저장된 검진이 없어요"
          desc="업로드·입력에서 검진지를 올리면 여기에 요약이 나타나요"
        />
      </>
    );
  }

  const recent = reports[reports.length - 1];
  const keyMetrics = (latest?.comprehensive?.all_evaluations ?? [])
    .filter((e) => e.status !== 'normal' && e.status !== 'normal_good' && e.status !== 'info')
    .slice(0, 6);

  return (
    <>
      <SectionTitle sub="가장 최근 검진 기준 요약입니다.">대시보드</SectionTitle>

      {/* 1. 요약 4칸 */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <p className="text-xs font-medium text-slate-500">저장된 검진</p>
          <p className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums">
            {reports.length}<span className="ml-1 text-sm font-medium text-slate-400">회</span>
          </p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-slate-500">관리 점수</p>
          <p className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums">
            {fmt(summary ? Math.round(summary.risk_score) : undefined)}
          </p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-slate-500">관리 필요 항목</p>
          <p className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums">
            {recent.manageCount + recent.trackCount}<span className="ml-1 text-sm font-medium text-slate-400">개</span>
          </p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-slate-500">최근 검진</p>
          <p className="mt-1.5 text-base font-bold text-slate-900">{recent.date}</p>
          <p className="mt-0.5 text-xs text-slate-400">{recent.hospital || '기관 미상'}</p>
        </Card>
      </div>

      {/* 2·3. 인사이트 + 다음 검진 (2칸) / 4. 해당 위험군 (1칸) */}
      {(insight || rarity) && (
        <div className="mt-4 grid grid-cols-3 gap-4">
          {insight && (
            <Card title="최근 인사이트" className={rarity ? 'col-span-2' : 'col-span-3'}>
              <p className="text-sm text-slate-700 leading-relaxed">{insight.summary}</p>

              {insight.top_concerns.length > 0 && (
                <ul className="mt-4 space-y-3">
                  {insight.top_concerns.map((c) => (
                    <li key={c.metric} className="rounded-xl bg-slate-50 p-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-semibold text-slate-900">{c.title}</span>
                        <span className="shrink-0 text-sm font-bold text-slate-900 tabular-nums">{c.current_value}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 leading-relaxed">{c.details}</p>
                    </li>
                  ))}
                </ul>
              )}

              {insight.next_exam_year && (
                <div className="mt-4 rounded-xl bg-slate-900 px-4 py-3">
                  <p className="text-sm font-semibold text-white">{insight.next_exam_year}년에 받으시면 돼요</p>
                  <p className="mt-0.5 text-xs text-slate-300">내 정보에서 캘린더에 추가할 수 있어요</p>
                </div>
              )}
            </Card>
          )}

          {/* 백엔드 필드명은 rarity지만 실제로 계산하는 건 희귀도가 아니라
              '내가 속한 집단군의 개수'다(user_group_analysis.calculate_group_rarity —
              gender·age·year를 인자로 받지만 쓰지 않고, 모집단 빈도 계산도 없다).
              그래서 화면에는 개수와 해당 집단군만 그대로 보여준다. */}
          {rarity && (
            <Card title="해당하는 위험군" className={insight ? undefined : 'col-span-3'}>
              <KV label="임상 집단군 수" value={rarity.clinical_count} />
              <KV label="생활습관 집단군 수" value={rarity.lifestyle_count} />

              {rarity.clinical_groups.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-slate-500">임상 그룹</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {rarity.clinical_groups.map((g) => (
                      <span key={g} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">{g}</span>
                    ))}
                  </div>
                </div>
              )}

              {rarity.lifestyle_groups.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-slate-500">생활습관 그룹</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {rarity.lifestyle_groups.map((g) => (
                      <span key={g} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">{g}</span>
                    ))}
                  </div>
                </div>
              )}

              <p className="mt-3 text-sm text-slate-700 leading-relaxed">{rarity.interpretation}</p>

              <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400 leading-relaxed">
                검진 수치로 판정한 집단군의 개수를 센 참고 정보이며, 진단이 아닙니다.
              </p>
            </Card>
          )}
        </div>
      )}

      {/* 5. 주요 지표 */}
      {keyMetrics.length > 0 && (
        <Card title="주요 지표" sub="정상 범위를 벗어난 항목이에요." className="mt-4">
          <div className="grid grid-cols-2 gap-3">
            {keyMetrics.map((e) => (
              <div key={e.metric} className="rounded-xl bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900">{e.metric}</span>
                  <span className="shrink-0 text-xs font-medium text-slate-500">{e.label}</span>
                </div>
                <p className="mt-1.5 text-lg font-bold text-slate-900 tabular-nums">{fmt(e.value, e.unit)}</p>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">{e.meaning}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
