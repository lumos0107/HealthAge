import {
  Activity, BarChart3, ClipboardList, LayoutDashboard,
  Upload, User, Wrench,
} from 'lucide-react';

export const SECTIONS = [
  { key: 'dashboard', label: '대시보드', icon: LayoutDashboard, desc: '한눈에 보기' },
  { key: 'analysis', label: '종합 분석', icon: Activity, desc: '계산기·집단군·What-if' },
  { key: 'history', label: '히스토리', icon: BarChart3, desc: '연도별 추이·변화속도' },
  { key: 'records', label: '검진 기록', icon: ClipboardList, desc: '회차별 원본·인쇄' },
  { key: 'upload', label: '업로드·입력', icon: Upload, desc: '검진지 OCR·직접 입력' },
  { key: 'tools', label: '도구·참고', icon: Wrench, desc: '투약이력·참고치·eGFR' },
  { key: 'profile', label: '내 정보', icon: User, desc: '프로필·검진 알림' },
] as const;

export type SectionKey = (typeof SECTIONS)[number]['key'];

export function Sidebar({ active, onSelect, backendOk, userName, onSignOut }: {
  active: SectionKey;
  onSelect: (k: SectionKey) => void;
  backendOk: boolean | null;
  userName: string;
  onSignOut: () => void;
}) {
  return (
    <aside className="fixed inset-y-0 left-0 flex w-64 flex-col border-r border-slate-200 bg-white print:hidden">
      <div className="px-6 py-7">
        <p className="text-lg font-bold text-slate-900">헬스에이지</p>
        <p className="mt-0.5 text-xs text-slate-400">건강검진 결과 상세 열람</p>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const on = active === s.key;
          return (
            <button key={s.key} onClick={() => onSelect(s.key)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                on ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}>
              <Icon size={18} className="shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{s.label}</span>
                <span className={`block truncate text-xs ${on ? 'text-slate-300' : 'text-slate-400'}`}>{s.desc}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 px-5 py-4">
        <p className="truncate text-sm font-semibold text-slate-700">{userName}</p>
        <div className="mt-2 flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${
            backendOk === null ? 'bg-slate-300' : backendOk ? 'bg-emerald-500' : 'bg-rose-500'
          }`} />
          <span className="text-xs text-slate-400">
            {backendOk === null ? '연결 확인 중' : backendOk ? '백엔드 연결됨' : '백엔드 연결 안 됨'}
          </span>
        </div>
        <button onClick={onSignOut} className="mt-3 text-xs font-medium text-slate-400 hover:text-slate-700">
          로그아웃
        </button>
      </div>
    </aside>
  );
}
