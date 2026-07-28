import { useCallback, useEffect, useState } from 'react';
import { adaptReport } from './api/adapt';
import * as api from './api/endpoints';
import { supabase, supabaseConfigured } from './api/supabaseClient';
import type { Profile, RealReportPayload, RealTimeseries, Report } from './api/types';
import { Sidebar, type SectionKey } from './components/Sidebar';
import { ErrorBox, Loading } from './components/UI';
import { AnalysisSection } from './sections/AnalysisSection';
import { DashboardSection } from './sections/DashboardSection';
import { HistorySection } from './sections/HistorySection';
import { ProfileSection } from './sections/ProfileSection';
import { RecordsSection } from './sections/RecordsSection';
import { ToolsSection } from './sections/ToolsSection';
import { UploadSection } from './sections/UploadSection';

export type AppData = {
  userId: string;
  profile: Profile | null;
  reports: Report[];
  raw: RealReportPayload[];
  latest: RealReportPayload | null;
  timeseries: RealTimeseries | null;
  reload: () => Promise<void>;
};

function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setBusy(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-8 ring-1 ring-slate-200">
        <h1 className="text-xl font-bold text-slate-900">헬스에이지</h1>
        <p className="mt-1 text-sm text-slate-500">건강검진 결과 상세 열람</p>
        {!supabaseConfigured && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
            .env에 VITE_SUPABASE_URL·VITE_SUPABASE_ANON_KEY가 없어 로그인할 수 없어요.
          </p>
        )}
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required
          placeholder="이메일" autoComplete="username"
          className="mt-6 w-full rounded-xl px-4 py-2.5 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-slate-900 outline-none" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required
          placeholder="비밀번호" autoComplete="current-password"
          className="mt-3 w-full rounded-xl px-4 py-2.5 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-slate-900 outline-none" />
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        <button disabled={busy || !supabaseConfigured}
          className="mt-5 w-full rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
          {busy ? '로그인 중…' : '로그인'}
        </button>
      </form>
    </div>
  );
}

export default function App() {
  const [userId, setUserId] = useState<string | null>(null);
  const [section, setSection] = useState<SectionKey>('dashboard');
  const [data, setData] = useState<Omit<AppData, 'reload'> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [backendOk, setBackendOk] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUserId(s?.user.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    api.getHealth().then(() => setBackendOk(true)).catch(() => setBackendOk(false));
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true); setError('');
    try {
      // 프로필·연도목록을 먼저, 그 다음 연도별 상세를 병렬로.
      const [profile, years] = await Promise.all([
        api.getUser(userId).catch(() => null),
        api.getReportYears(userId),
      ]);
      const raw = (await Promise.all(years.map((y) => api.getReportByYear(userId, y))))
        .sort((a, b) => a.year - b.year);
      const [latest, timeseries] = await Promise.all([
        raw.length ? api.getLatestComprehensive(userId).catch(() => null) : Promise.resolve(null),
        api.getTimeseries(userId),
      ]);
      setData({ userId, profile, reports: raw.map(adaptReport), raw, latest, timeseries });
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  /** 저장·삭제 후 호출 — 시계열을 먼저 재생성한 뒤 전체를 다시 읽는다. */
  const reload = useCallback(async () => {
    await api.refreshTimeseries();
    await load();
  }, [load]);

  if (!userId) return <SignIn />;

  const appData: AppData | null = data ? { ...data, reload } : null;
  const Section = {
    dashboard: DashboardSection, analysis: AnalysisSection, history: HistorySection,
    records: RecordsSection, upload: UploadSection, tools: ToolsSection, profile: ProfileSection,
  }[section];

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar active={section} onSelect={setSection} backendOk={backendOk}
        userName={data?.profile?.name ?? '사용자'}
        onSignOut={() => { void supabase.auth.signOut(); }} />
      <main className="ml-64 px-10 py-9 print:ml-0 print:px-0 print:py-0">
        <div className="mx-auto max-w-6xl">
          {loading && !appData && <Loading />}
          {error && <ErrorBox message={error} onRetry={() => void load()} />}
          {appData && (
            section === 'upload'
              ? <UploadSection data={appData} onSaved={() => setSection('dashboard')} />
              : <Section data={appData} />
          )}
        </div>
      </main>
    </div>
  );
}
