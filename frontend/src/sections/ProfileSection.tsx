import { useEffect, useState } from 'react';
import type { AppData } from '../App';
import { deleteUser, getMe, patchUser } from '../api/endpoints';
import { supabase } from '../api/supabaseClient';
import type { Profile } from '../api/types';
import { Card, ErrorBox, KV, Loading, SectionTitle } from '../components/UI';
import { LifestyleFields, type LifestyleValue } from '../components/LifestyleFields';
import { alcoholWeeklyGrams, buildCheckupIcs } from '../lib/format';

/** getMe() 응답은 백엔드 스키마 이름을 그대로 쓴다 — 화면에서 새 이름을 붙이지 않는다. */
function meLabel(key: string): string {
  const labels: Record<string, string> = {
    id: '사용자 ID', email: '이메일', user_id: '사용자 ID',
    created_at: '가입일', updated_at: '수정일',
  };
  return labels[key] ?? key;
}

function meValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function ProfileSection({ data }: { data: AppData }) {
  const profile = data.profile;

  const [name, setName] = useState(profile?.name ?? '');
  const [gender, setGender] = useState<Profile['gender']>(profile?.gender ?? null);
  const [birthYear, setBirthYear] = useState(profile?.birth_year != null ? String(profile.birth_year) : '');
  const [lifestyle, setLifestyle] = useState<LifestyleValue>({
    smoking: profile?.smoking ?? '',
    drinking: profile?.drinking ?? '',
    drinkFreq: '',
    drinkGlasses: '',
    drinkType: '소주',
  });

  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);

  const [me, setMe] = useState<Record<string, unknown> | null>(null);
  const [meError, setMeError] = useState('');

  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((res) => { if (!cancelled) setMe(res); })
      .catch((e) => { if (!cancelled) setMeError(e instanceof Error ? e.message : '인증 정보를 불러오지 못했어요.'); });
    return () => { cancelled = true; };
  }, []);

  const handleSave = async () => {
    setSaveError('');
    setSaved(false);
    setSaveBusy(true);
    try {
      const body: Partial<Profile> = {
        name: name.trim() || null,
        gender,
        birth_year: birthYear.trim() ? Number(birthYear) : null,
      };
      if (lifestyle.smoking) body.smoking = lifestyle.smoking;
      if (lifestyle.drinking) {
        body.drinking = lifestyle.drinking;
        body.alcohol_weekly_g = lifestyle.drinking === 'yes'
          ? alcoholWeeklyGrams(Number(lifestyle.drinkFreq) || 0, Number(lifestyle.drinkGlasses) || 0, lifestyle.drinkType)
          : 0;
      }
      await patchUser(data.userId, body);
      setSaved(true);
      await data.reload();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '저장에 실패했어요.');
    } finally {
      setSaveBusy(false);
    }
  };

  const handleDownloadIcs = () => {
    const year = data.timeseries?.insight?.next_exam_year;
    if (!year) return;
    const ics = buildCheckupIcs(year, profile?.name ?? '회원');
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `checkup-${year}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async () => {
    const ok = window.confirm('계정과 모든 검진·분석·투약 기록이 영구 삭제됩니다. 되돌릴 수 없어요. 정말 삭제할까요?');
    if (!ok) return;
    setDeleteError('');
    setDeleteBusy(true);
    try {
      await deleteUser(data.userId);
      await supabase.auth.signOut();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : '탈퇴에 실패했어요.');
    } finally {
      setDeleteBusy(false);
    }
  };

  const nextExamYear = data.timeseries?.insight?.next_exam_year;

  return (
    <>
      <SectionTitle sub="프로필과 검진 알림을 관리합니다.">내 정보</SectionTitle>

      <div className="space-y-6">
        <Card title="프로필" sub="이름·성별·출생연도는 검사값 판정 기준으로도 쓰여요.">
          <div className="grid grid-cols-3 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-600">이름</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                className="mt-1.5 w-full rounded-lg px-3 py-2 text-sm outline-none ring-1 ring-slate-300 focus:ring-2 focus:ring-slate-900" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-600">성별</span>
              <div className="mt-1.5 flex gap-2">
                {([[1, '남'], [2, '여']] as const).map(([v, label]) => (
                  <button key={v} type="button" onClick={() => setGender(v)}
                    className={`rounded-lg px-3.5 py-2 text-sm font-semibold ring-1 transition ${
                      gender === v ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-600">출생연도</span>
              <input type="text" value={birthYear} onChange={(e) => setBirthYear(e.target.value)}
                placeholder="YYYY"
                className="mt-1.5 w-full rounded-lg px-3 py-2 text-sm outline-none ring-1 ring-slate-300 focus:ring-2 focus:ring-slate-900" />
            </label>
          </div>
        </Card>

        <Card title="생활습관" sub="분석은 백엔드가 프로필에 저장된 값을 읽어서 사용해요.">
          <LifestyleFields value={lifestyle} onChange={setLifestyle} gender={gender} />
        </Card>

        {saveError && <ErrorBox message={saveError} />}
        {saved && (
          <div className="rounded-xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200">
            <p className="text-sm font-semibold text-emerald-800">저장했어요.</p>
          </div>
        )}
        <button
          onClick={() => void handleSave()}
          disabled={saveBusy}
          className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {saveBusy ? '저장 중…' : '저장'}
        </button>

        <Card title="인증 정보" sub="/auth/me 응답입니다.">
          {meError && <ErrorBox message={meError} />}
          {!meError && !me && <Loading />}
          {me && Object.entries(me).map(([k, v]) => (
            <KV key={k} label={meLabel(k)} value={meValue(v)} />
          ))}
        </Card>

        {nextExamYear && (
          <Card title="다음 검진 알림">
            <p className="text-sm text-slate-700">{nextExamYear}년에 검진을 받으시면 돼요.</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              웹에서는 알림을 대신 울려드릴 수 없어, 캘린더 파일로 내려드려요. 앱에서는 알림 예약이 됩니다.
            </p>
            <button
              onClick={handleDownloadIcs}
              className="mt-4 rounded-lg px-3.5 py-1.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
            >
              캘린더에 추가 (.ics)
            </button>
          </Card>
        )}

        <Card title="회원 탈퇴" sub="계정과 모든 기록이 영구 삭제됩니다.">
          {deleteError && <div className="mb-3"><ErrorBox message={deleteError} /></div>}
          <button
            onClick={() => void handleDelete()}
            disabled={deleteBusy}
            className="rounded-lg bg-rose-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-40"
          >
            {deleteBusy ? '처리 중…' : '계정 삭제'}
          </button>
        </Card>
      </div>
    </>
  );
}
