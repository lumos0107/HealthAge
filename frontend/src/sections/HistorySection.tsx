import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { AppData } from '../App';
import { metricLabel, statusFromBackend } from '../api/adapt';
import type { RealTimeseries } from '../api/types';
import { fmt } from '../lib/format';
import { Card, EmptyState, KV, SectionTitle, StatusBadge } from '../components/UI';

// 라인 색 — 지표의 좋고 나쁨과 무관한 구분용 팔레트 (HDL도 다른 지표와 같은 규칙으로 칠한다).
const LINE_COLORS = ['#0f172a', '#0284c7', '#e11d48', '#d97706', '#059669'];

const CHART_GROUPS: { title: string; keys: string[] }[] = [
  { title: '혈압 추이', keys: ['수축기혈압', '이완기혈압'] },
  { title: '콜레스테롤 추이', keys: ['LDL콜레스테롤', 'HDL콜레스테롤', '총콜레스테롤'] },
  { title: 'BMI·허리둘레 추이', keys: ['BMI', '허리둘레'] },
  { title: '혈당·중성지방 추이', keys: ['식전혈당(공복혈당)', '트리글리세라이드'] },
  { title: '간·신장 기능 추이', keys: ['혈청지오티(AST)', '혈청지피티(ALT)', '감마지티피', '혈청크레아티닌'] },
];

const SEVERITY_STYLE: Record<string, string> = {
  high: 'bg-rose-50 text-rose-800 ring-rose-200',
  medium: 'bg-amber-50 text-amber-800 ring-amber-200',
};

const EXAM_PATTERN_LABEL: Record<string, string> = {
  parity: '검진 주기',
  expected_in_range: '예정 연도',
  actual: '실제 검진 연도',
  missed: '누락된 연도',
  extra: '추가 검진 연도',
  next_expected: '다음 예정 연도',
};

function TrendChart({ title, ts, metricKeys }: { title: string; ts: RealTimeseries; metricKeys: string[] }) {
  const available = metricKeys.filter((k) => ts.metrics[k]);
  if (available.length === 0) return null;

  const years = ts.years ?? [];
  const chartData = years.map((year) => {
    const row: Record<string, number | null> = { year };
    for (const k of available) {
      const m = ts.metrics[k];
      const idx = m.years.indexOf(year);
      row[k] = idx >= 0 ? m.values[idx] : null;
    }
    return row;
  });

  return (
    <Card title={title}>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="year" tick={{ fontSize: 12 }} stroke="#94a3b8" />
          <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
          <Tooltip />
          <Legend />
          {available.map((k, i) => (
            <Line key={k} type="monotone" dataKey={k} name={metricLabel(k)}
              stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2}
              connectNulls={false} dot={{ r: 3 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function HistorySection({ data }: { data: AppData }) {
  const { reports, latest, timeseries } = data;

  // 회차 0~1개 — 선그래프 대신 안내.
  if (reports.length <= 1) {
    const evals = latest?.comprehensive?.all_evaluations ?? [];
    return (
      <>
        <SectionTitle sub="회차별 변화와 또래 대비 변화 속도입니다.">히스토리</SectionTitle>
        {reports.length === 0 ? (
          <EmptyState title="아직 저장된 검진이 없어요" desc="업로드·입력에서 검진지를 올리면 히스토리가 시작돼요" />
        ) : (
          <>
            <p className="text-sm text-slate-500">회차가 2개 이상이면 추이 그래프가 나타나요.</p>
            {evals.length > 0 && (
              <Card title="현재 값" className="mt-4">
                {evals.map((e) => (
                  <KV key={e.metric} label={e.metric} value={fmt(e.value, e.unit)} hint={e.label} />
                ))}
              </Card>
            )}
          </>
        )}
      </>
    );
  }

  if (!timeseries) {
    return (
      <>
        <SectionTitle sub="회차별 변화와 또래 대비 변화 속도입니다.">히스토리</SectionTitle>
        <EmptyState title="시계열 분석 결과를 불러오지 못했어요" desc="잠시 후 다시 시도해주세요." />
      </>
    );
  }

  const fullEntries = timeseries.full_timeseries
    ? Object.values(timeseries.full_timeseries.by_direction).flat()
    : [];

  return (
    <>
      <SectionTitle sub="회차별 변화와 또래 대비 변화 속도입니다.">히스토리</SectionTitle>

      {/* 그래프 5종 */}
      <div className="grid grid-cols-2 gap-4">
        {CHART_GROUPS.map((g) => (
          <TrendChart key={g.title} title={g.title} ts={timeseries} metricKeys={g.keys} />
        ))}
      </div>

      {/* 또래 대비 변화 속도 */}
      {timeseries.change_pace && timeseries.change_pace.length > 0 && (
        <Card title="또래 대비 변화 속도" className="mt-4">
          <div className="space-y-3">
            {timeseries.change_pace.map((cp) => (
              <div key={cp.metric} className="rounded-xl bg-slate-50 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-900">{metricLabel(cp.metric)}</span>
                  {cp.pace.ratio != null && (
                    <span className="shrink-0 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
                      {cp.pace.ratio}배
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{cp.pace.text}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                  <span>본인 변화 {fmt(cp.user_change)}</span>
                  <span>또래 변화 {fmt(cp.population_change)}</span>
                  {cp.span_years != null && <span>{cp.span_years}년간</span>}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400 leading-relaxed">
            배수는 또래 '평균'과의 비교라서 또래 안의 개인차는 담기지 않습니다.
          </p>
        </Card>
      )}

      {/* 하이라이트 */}
      {timeseries.highlights && timeseries.highlights.length > 0 && (
        <Card title="하이라이트" className="mt-4">
          <div className="space-y-2.5">
            {timeseries.highlights.map((h, i) => (
              <div key={i} className={`rounded-xl px-4 py-3 ring-1 ${SEVERITY_STYLE[h.severity] ?? 'bg-slate-50 text-slate-700 ring-slate-200'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{metricLabel(h.metric)}</span>
                  <span className="text-xs font-medium opacity-70">{h.type}</span>
                </div>
                <p className="mt-1 text-sm leading-relaxed">{h.message}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 검진 패턴 — 앱이 안 쓰던 값. 알려진 키만 한글 라벨, 모르는 키는 원본 그대로. */}
      {timeseries.exam_pattern && (
        <Card title="검진 패턴" className="mt-4">
          {Object.entries(timeseries.exam_pattern).map(([key, value]) => (
            <KV key={key} label={EXAM_PATTERN_LABEL[key] ?? key}
              value={Array.isArray(value) ? (value.length ? value.join(', ') : '없음') : String(value)} />
          ))}
        </Card>
      )}

      {/* 전체 시계열 원본 */}
      {timeseries.full_timeseries && fullEntries.length > 0 && (
        <Card title="전체 시계열 원본" sub="회차 간 모든 항목의 원본 변화값입니다." className="mt-4">
          <details>
            <summary className="cursor-pointer text-sm font-medium text-slate-600">표 펼치기</summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th className="py-2 pr-3 font-medium">지표</th>
                    <th className="py-2 pr-3 font-medium">시작</th>
                    <th className="py-2 pr-3 font-medium">종료</th>
                    <th className="py-2 pr-3 font-medium">변화량</th>
                    <th className="py-2 pr-3 font-medium">변화율</th>
                    <th className="py-2 font-medium">현재 상태</th>
                  </tr>
                </thead>
                <tbody>
                  {fullEntries.map((e) => (
                    <tr key={e.metric} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 pr-3 font-medium text-slate-900">{metricLabel(e.metric)}</td>
                      <td className="py-2 pr-3 tabular-nums text-slate-600">{e.first_year}년 {e.first_value}</td>
                      <td className="py-2 pr-3 tabular-nums text-slate-600">{e.last_year}년 {e.last_value}</td>
                      <td className="py-2 pr-3 tabular-nums">{e.change > 0 ? '+' : ''}{e.change}</td>
                      <td className="py-2 pr-3 tabular-nums">{e.pct_change != null ? `${e.pct_change > 0 ? '+' : ''}${e.pct_change}%` : '-'}</td>
                      <td className="py-2"><StatusBadge status={statusFromBackend(e.current_status)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </Card>
      )}
    </>
  );
}
