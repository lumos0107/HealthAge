import type { Profile } from '../api/types';
import { alcoholWeeklyGrams, DRINK_TYPES } from '../lib/format';

// 지방간 분류 3구간 경계(주당 순알코올, g) — 2025 MASLD 지침 그림2 알고리즘.
// backend/app/analyzer/_internal/combo_group_analysis.py의
// ALCOHOL_WEEKLY_G_LOWER/UPPER과 동일한 값(출처·주석 참고).
// "위험 기준선"이 아니라 MASLD↔MetALD↔ALD 분류 경계다 — 이 값을 넘는다고 곧바로 위험한 게 아니라
// 지방간이 있을 때 어느 유형으로 분류되는지가 달라진다.
export const FATTY_LIVER_BASELINE = { male: 210, female: 140 }; // MASLD ↔ MetALD 경계
export const FATTY_LIVER_UPPER = { male: 420, female: 350 }; // MetALD ↔ ALD 경계

export type LifestyleValue = {
  smoking: Profile['smoking'] | '';
  drinking: Profile['drinking'] | '';
  drinkFreq: string;
  drinkGlasses: string;
  drinkType: string;
};

/**
 * 흡연·음주 입력 UI — Task 10 UploadSection에서 이식.
 * Task 12 ProfileSection과 함께 쓰므로 중복 구현을 피하기 위해 공용 컴포넌트로 뺐다.
 */
export function LifestyleFields({ value, onChange, gender }: {
  value: LifestyleValue;
  onChange: (next: LifestyleValue) => void;
  gender: Profile['gender'];
}) {
  const { smoking, drinking, drinkFreq, drinkGlasses, drinkType } = value;
  const alcoholG = drinking === 'yes' ? alcoholWeeklyGrams(Number(drinkFreq) || 0, Number(drinkGlasses) || 0, drinkType) : 0;
  const lower = gender === 2 ? FATTY_LIVER_BASELINE.female : FATTY_LIVER_BASELINE.male;
  const upper = gender === 2 ? FATTY_LIVER_UPPER.female : FATTY_LIVER_UPPER.male;
  const overBaseline = drinking === 'yes' && alcoholG > lower;
  const overUpper = drinking === 'yes' && alcoholG > upper;

  return (
    <>
      <div>
        <p className="text-sm font-medium text-slate-600">흡연</p>
        <div className="mt-2 flex gap-2">
          {([['never', '비흡연'], ['former', '과거'], ['current', '현재']] as const).map(([v, label]) => (
            <button key={v} onClick={() => onChange({ ...value, smoking: v })}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold ring-1 transition ${
                smoking === v ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <p className="text-sm font-medium text-slate-600">음주</p>
        <div className="mt-2 flex gap-2">
          {([['no', '안 마심'], ['yes', '마심']] as const).map(([v, label]) => (
            <button key={v} onClick={() => onChange({ ...value, drinking: v })}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold ring-1 transition ${
                drinking === v ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {drinking === 'yes' && (
        <div className="mt-5">
          <div className="grid grid-cols-3 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-600">주당 횟수</span>
              <input type="text" value={drinkFreq} onChange={(e) => onChange({ ...value, drinkFreq: e.target.value })}
                className="mt-1.5 w-full rounded-lg px-3 py-2 text-sm ring-1 ring-slate-300 outline-none focus:ring-2 focus:ring-slate-900" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-600">1회 잔수</span>
              <input type="text" value={drinkGlasses} onChange={(e) => onChange({ ...value, drinkGlasses: e.target.value })}
                className="mt-1.5 w-full rounded-lg px-3 py-2 text-sm ring-1 ring-slate-300 outline-none focus:ring-2 focus:ring-slate-900" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-600">술 종류</span>
              <select value={drinkType} onChange={(e) => onChange({ ...value, drinkType: e.target.value })}
                className="mt-1.5 w-full rounded-lg px-3 py-2 text-sm ring-1 ring-slate-300 outline-none focus:ring-2 focus:ring-slate-900">
                {DRINK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>
          <p className={`mt-3 text-sm ${overBaseline ? 'font-bold text-rose-600' : 'text-slate-600'}`}>
            주당 순알코올 약 {alcoholG}g
            {overBaseline && (overUpper
              ? ' — 지방간이 있다면 ALD(알코올성) 쪽으로 분류돼요'
              : ' — 지방간이 있다면 MASLD가 아닌 MetALD 쪽으로 분류돼요')}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            지방간 분류 경계(주당 순알코올): {lower}g까지 MASLD · {lower}~{upper}g는 MetALD · {upper}g 초과는 ALD
            (남 {FATTY_LIVER_BASELINE.male}/{FATTY_LIVER_UPPER.male}g · 여 {FATTY_LIVER_BASELINE.female}/{FATTY_LIVER_UPPER.female}g)
          </p>
        </div>
      )}
    </>
  );
}
