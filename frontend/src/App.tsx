import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Activity } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getAccessToken, supabase, supabaseConfigured } from './api/supabaseClient';

type TabKey = 'dashboard' | 'records' | 'history' | 'analysis' | 'upload';
type Status = '정상 기준 안' | '관리 참고' | '추적 확인';
type MetricKey =
  | 'sbp'
  | 'dbp'
  | 'glucose'
  | 'bmi'
  | 'waist'
  | 'ldl'
  | 'hdl'
  | 'triglyceride'
  | 'ast'
  | 'alt'
  | 'ggt'
  | 'hemoglobin'
  | 'creatinine';

type Report = {
  year: number;
  date: string;
  hospital: string;
  status: Status;
  summary: string;
  score: number;
  values: Record<MetricKey, number>;
};

type MetricDefinition = {
  key: MetricKey;
  category: string;
  name: string;
  shortName: string;
  unit: string;
  normalText: string;
  normalValue: number;
  peerMean?: number;
  status: Status;
  description: string;
  note: string;
};

type UploadState = {
  loading: boolean;
  message: string;
  error: string;
  ocr: unknown;
  analysis: unknown;
  medication: unknown;
};

type OcrField = {
  id: string;
  label: string;
  value: string;
  unit?: string;
  required?: boolean;
  confidence: number;
  section: '기본 정보' | '검사 수치';
};

type UserProfile = {
  id?: string;
  email?: string;
  name: string;
  gender: 1 | 2;
  birth_year: number;
  birth_md?: number;
};

type UserSettings = {
  checkupReminder: boolean;
  medicationReminder: boolean;
  simpleWords: boolean;
};

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL ?? import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

const initialProfile: UserProfile = {
  name: '홍길동',
  gender: 1,
  birth_year: 1974,
  birth_md: 101,
};

const initialSettings: UserSettings = {
  checkupReminder: true,
  medicationReminder: true,
  simpleWords: true,
};

const reports: Report[] = [
  {
    year: 2021,
    date: '2021-09-15',
    hospital: '서울대병원 강남센터',
    status: '관리 참고',
    summary: '혈압, 지질 수치를 생활습관과 함께 확인합니다.',
    score: 68,
    values: {
      sbp: 128,
      dbp: 82,
      glucose: 95,
      bmi: 23.5,
      waist: 84,
      ldl: 125,
      hdl: 48,
      triglyceride: 130,
      ast: 28,
      alt: 31,
      ggt: 42,
      hemoglobin: 14.7,
      creatinine: 0.88,
    },
  },
  {
    year: 2023,
    date: '2023-09-15',
    hospital: '서울대병원 강남센터',
    status: '관리 참고',
    summary: '혈당, BMI, 중성지방 흐름을 이어서 확인합니다.',
    score: 56,
    values: {
      sbp: 134,
      dbp: 84,
      glucose: 103,
      bmi: 25.1,
      waist: 89,
      ldl: 139,
      hdl: 42,
      triglyceride: 161,
      ast: 32,
      alt: 39,
      ggt: 55,
      hemoglobin: 15.1,
      creatinine: 0.94,
    },
  },
  {
    year: 2024,
    date: '2024-03-15',
    hospital: '서울대병원 강남센터',
    status: '추적 확인',
    summary: '대사증후군 관련 항목이 여러 개 겹쳐 추적 확인이 필요합니다.',
    score: 22,
    values: {
      sbp: 138,
      dbp: 88,
      glucose: 112,
      bmi: 26.3,
      waist: 93,
      ldl: 145,
      hdl: 39,
      triglyceride: 178,
      ast: 34,
      alt: 45,
      ggt: 68,
      hemoglobin: 15.4,
      creatinine: 1.01,
    },
  },
];

const latest = reports.at(-1)!;

const metricDefinitions: MetricDefinition[] = [
  {
    key: 'sbp',
    category: '혈압',
    name: '수축기 혈압',
    shortName: '수축기',
    unit: 'mmHg',
    normalText: '<120',
    normalValue: 120,
    peerMean: 126,
    status: '관리 참고',
    description: '심장이 피를 밀어낼 때 혈관에 걸리는 압력입니다.',
    note: '한 번 높게 나왔다고 바로 판단하지 않고 반복 측정 흐름을 함께 봅니다.',
  },
  {
    key: 'dbp',
    category: '혈압',
    name: '이완기 혈압',
    shortName: '이완기',
    unit: 'mmHg',
    normalText: '<80',
    normalValue: 80,
    peerMean: 79,
    status: '관리 참고',
    description: '심장이 쉬는 순간 혈관에 남아 있는 압력입니다.',
    note: '수축기 혈압과 같이 확인해야 혈압 흐름을 이해하기 쉽습니다.',
  },
  {
    key: 'glucose',
    category: '혈당',
    name: '공복혈당',
    shortName: '혈당',
    unit: 'mg/dL',
    normalText: '70-99',
    normalValue: 99,
    peerMean: 101,
    status: '관리 참고',
    description: '식사하지 않은 상태에서 혈액 속 포도당이 어느 정도인지 보는 항목입니다.',
    note: '식사, 수면, 스트레스 영향을 받을 수 있어 여러 해의 흐름이 중요합니다.',
  },
  {
    key: 'bmi',
    category: '체중·복부',
    name: '체질량지수(BMI)',
    shortName: 'BMI',
    unit: 'kg/m²',
    normalText: '18.5-22.9',
    normalValue: 22.9,
    peerMean: 24.2,
    status: '추적 확인',
    description: '키와 체중으로 계산한 체중 상태 참고값입니다.',
    note: '근육량이 많은 사람은 실제 상태와 다를 수 있어 허리둘레와 함께 봅니다.',
  },
  {
    key: 'waist',
    category: '체중·복부',
    name: '허리둘레',
    shortName: '허리',
    unit: 'cm',
    normalText: '남 <90 / 여 <85',
    normalValue: 90,
    peerMean: 86,
    status: '추적 확인',
    description: '복부 비만 여부를 볼 때 참고하는 둘레 수치입니다.',
    note: '대사증후군 기준과 연결되므로 BMI와 함께 확인합니다.',
  },
  {
    key: 'ldl',
    category: '지질',
    name: 'LDL-C',
    shortName: 'LDL',
    unit: 'mg/dL',
    normalText: '<130',
    normalValue: 130,
    peerMean: 128,
    status: '관리 참고',
    description: '혈관 건강 관리에서 자주 확인하는 콜레스테롤 항목입니다.',
    note: '기저질환이나 복용 약에 따라 목표 기준이 달라질 수 있습니다.',
  },
  {
    key: 'hdl',
    category: '지질',
    name: 'HDL-C',
    shortName: 'HDL',
    unit: 'mg/dL',
    normalText: '남 >=40 / 여 >=50',
    normalValue: 40,
    peerMean: 47,
    status: '관리 참고',
    description: '흔히 좋은 콜레스테롤이라고 부르며 낮을 때 참고가 필요합니다.',
    note: '다른 지질 수치와 함께 봐야 전체 흐름을 이해하기 쉽습니다.',
  },
  {
    key: 'triglyceride',
    category: '지질',
    name: '중성지방',
    shortName: '중성지방',
    unit: 'mg/dL',
    normalText: '<150',
    normalValue: 150,
    peerMean: 152,
    status: '관리 참고',
    description: '혈액 속 지방 성분 중 하나로 식사와 음주의 영향을 많이 받습니다.',
    note: '공복 여부와 최근 식습관에 따라 달라질 수 있어 추적 확인이 좋습니다.',
  },
  {
    key: 'ast',
    category: '간 기능',
    name: 'AST',
    shortName: 'AST',
    unit: 'IU/L',
    normalText: '<40',
    normalValue: 40,
    peerMean: 29,
    status: '정상 기준 안',
    description: '간과 근육 세포 상태를 참고할 때 보는 효소 수치입니다.',
    note: '단독으로 질환을 판단하지 않고 ALT, 감마-GTP와 함께 봅니다.',
  },
  {
    key: 'alt',
    category: '간 기능',
    name: 'ALT',
    shortName: 'ALT',
    unit: 'IU/L',
    normalText: '<40',
    normalValue: 40,
    peerMean: 32,
    status: '관리 참고',
    description: '간세포 상태를 참고하는 대표적인 효소 수치입니다.',
    note: '피로, 음주, 약물 등 여러 요인의 영향을 받을 수 있습니다.',
  },
  {
    key: 'ggt',
    category: '간 기능',
    name: '감마-GTP',
    shortName: '감마-GTP',
    unit: 'IU/L',
    normalText: '남 11-63 / 여 8-35',
    normalValue: 63,
    peerMean: 41,
    status: '관리 참고',
    description: '간담도계 상태와 음주 영향을 참고할 때 보는 수치입니다.',
    note: '음주, 약물, 지방간 등과 함께 해석해야 합니다.',
  },
  {
    key: 'hemoglobin',
    category: '혈액',
    name: '혈색소',
    shortName: '혈색소',
    unit: 'g/dL',
    normalText: '남 13-17 / 여 12-16',
    normalValue: 17,
    peerMean: 14.8,
    status: '정상 기준 안',
    description: '혈액이 산소를 운반하는 능력을 참고하는 항목입니다.',
    note: '낮거나 높을 때는 다른 혈액검사 결과와 함께 확인합니다.',
  },
  {
    key: 'creatinine',
    category: '신장 기능',
    name: '혈청 크레아티닌',
    shortName: '크레아티닌',
    unit: 'mg/dL',
    normalText: '기관 기준 확인',
    normalValue: 1.2,
    status: '정상 기준 안',
    description: '신장 기능을 추정할 때 참고하는 혈액검사 수치입니다.',
    note: '요청사항에 따라 시계열에는 표시하고 연령대 평균 비교에서는 제외합니다.',
  },
];

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'dashboard', label: '대시보드' },
  { key: 'records', label: '검진결과 조회' },
  { key: 'history', label: '히스토리' },
  { key: 'analysis', label: '건강분석' },
  { key: 'upload', label: '결과지 업로드' },
];

const externalActions: Array<
  | { title: string; description: string; url: string; tab?: never }
  | { title: string; description: string; tab: TabKey; url?: never }
> = [
  {
    title: '검진기관 찾기',
    description: '국민건강보험공단에서 안내하는 검진기관/병원 찾기 메뉴로 이동합니다.',
    url: 'https://www.nhis.or.kr/nhis/index.do',
  },
  {
    title: '가까운 병원 찾기',
    description: '응급의료포털 E-Gen에서 주변 병원과 약국 정보를 확인합니다.',
    url: 'https://www.e-gen.or.kr/egen/main.do',
  },
  {
    title: '검진 전 준비 확인',
    description: '최근 검진 기록과 관리 참고 항목을 확인하고 상담 질문을 정리합니다.',
    tab: 'analysis' as TabKey,
  },
];

function currentValue(metric: MetricDefinition) {
  return latest.values[metric.key];
}

function formatValue(value: number, unit: string) {
  return `${value}${unit}`;
}

function statusClass(status: Status) {
  if (status === '정상 기준 안') return 'border-[#2f8fd0] bg-[#eef8ff] text-[#0a5f9c]';
  if (status === '관리 참고') return 'border-[#e5a100] bg-[#fff9e8] text-[#8a5b00]';
  return 'border-[#d93c65] bg-[#fff1f4] text-[#b51d46]';
}

function isBadStatus(status: Status) {
  return status !== '정상 기준 안';
}

function metricAccentColor(metric: MetricDefinition) {
  if (metric.status === '추적 확인') return '#c0392b';
  if (metric.status === '관리 참고') return '#c0392b';
  return '#0b5cad';
}

function StatusBadge({ status }: { status: Status }) {
  return <span className={`inline-flex h-auto w-fit self-start justify-self-start whitespace-nowrap border px-3 py-1 text-sm font-bold leading-5 ${statusClass(status)}`}>{status}</span>;
}

function statusToLabel(status: string) {
  if (['extremely_high', 'very_high', 'extremely_low', 'very_low'].includes(status)) return '추적 확인';
  if (['high', 'low', 'caution'].includes(status)) return '관리 참고';
  return '정상 기준 안';
}

function birthDateFromProfile(profile: UserProfile) {
  const md = profile.birth_md ? String(profile.birth_md).padStart(4, '0') : '0101';
  return `${profile.birth_year}-${md.slice(0, 2)}-${md.slice(2, 4)}`;
}

function profileBirthFromDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return {
    birth_year: year || undefined,
    birth_md: month && day ? month * 100 + day : undefined,
  };
}

async function apiFetch(path: string, init?: RequestInit, json = true) {
  const token = await getAccessToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`${response.status} ${response.statusText}${detail ? ` - ${detail}` : ''}`);
  }

  return response.json();
}

function Header({
  activeTab,
  onTabChange,
  profile,
  onEditProfile,
  onOpenSettings,
  onReloadProfile,
  onLogout,
  onAuth,
}: {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  profile: UserProfile;
  onEditProfile: () => void;
  onOpenSettings: () => void;
  onReloadProfile: () => void;
  onLogout: () => void;
  onAuth: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('mousedown', closeOnOutside);
    return () => window.removeEventListener('mousedown', closeOnOutside);
  }, [menuOpen]);

  return (
    <header className="bg-white">
      <div className="border-b border-[#d8e0e8] bg-[#f4f7fb]">
        <div className="mx-auto flex h-9 max-w-[1280px] items-center px-6 text-[13px] text-[#2f3b4a]">
          건강검진 기록과 분석 결과를 한곳에서 확인합니다.
        </div>
      </div>

      <div className="border-b border-[#d8e0e8]">
        <div className="mx-auto flex h-[78px] max-w-[1280px] items-center justify-between px-6">
          <button type="button" className="flex items-center gap-3" onClick={() => onTabChange('dashboard')}>
            <Activity className="h-10 w-10 text-[#0b5cad]" />
            <span>
              <span className="block text-[25px] font-black tracking-[-0.04em] text-[#1d2b3a]">헬스케어</span>
              <span className="block text-xs font-bold text-[#60809f]">Health Checkup Management</span>
            </span>
          </button>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              className="border border-[#c9d5e2] bg-white px-4 py-2 text-[15px] font-black text-[#1d2b3a] hover:bg-[#f6f9fc]"
              onClick={() => setMenuOpen((current) => !current)}
            >
              {profile.name} 님
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-[46px] z-20 w-[220px] border border-[#c9d5e2] bg-white shadow-[0_10px_24px_rgba(29,43,58,0.12)]">
                <button
                  type="button"
                  className="block w-full px-4 py-3 text-left text-[15px] font-bold text-[#1d2b3a] hover:bg-[#eef6ff]"
                  onClick={() => {
                    setMenuOpen(false);
                    onAuth();
                  }}
                >
                  로그인 / 회원가입
                </button>
                <button
                  type="button"
                  className="block w-full border-t border-[#e4eaf0] px-4 py-3 text-left text-[15px] font-bold text-[#1d2b3a] hover:bg-[#eef6ff]"
                  onClick={() => {
                    setMenuOpen(false);
                    onEditProfile();
                  }}
                >
                  프로필 수정
                </button>
                <button
                  type="button"
                  className="block w-full border-t border-[#e4eaf0] px-4 py-3 text-left text-[15px] font-bold text-[#1d2b3a] hover:bg-[#eef6ff]"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenSettings();
                  }}
                >
                  설정
                </button>
                <button
                  type="button"
                  className="block w-full border-t border-[#e4eaf0] px-4 py-3 text-left text-[15px] font-bold text-[#1d2b3a] hover:bg-[#eef6ff]"
                  onClick={() => {
                    setMenuOpen(false);
                    onReloadProfile();
                  }}
                >
                  프로필 다시 불러오기
                </button>
                <button
                  type="button"
                  className="block w-full border-t border-[#e4eaf0] px-4 py-3 text-left text-[15px] font-bold text-[#b51d46] hover:bg-[#fff1f4]"
                  onClick={() => {
                    setMenuOpen(false);
                    onLogout();
                  }}
                >
                  로그아웃
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <nav className="border-b border-[#d8e0e8]">
        <div className="mx-auto grid h-[58px] max-w-[1280px] grid-cols-5 px-6 text-center text-[17px] font-black text-[#1d2b3a]">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange(tab.key)}
              className={activeTab === tab.key ? 'border-b-4 border-[#0b5cad] text-[#0b5cad]' : 'hover:text-[#0b5cad]'}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>
    </header>
  );
}

function Layout({ activeTab, onTabChange, children }: { activeTab: TabKey; onTabChange: (tab: TabKey) => void; children: ReactNode }) {
  return (
    <main className="mx-auto grid max-w-[1280px] grid-cols-[240px_1fr] gap-8 px-6 py-8">
      <aside>
        <div className="sticky top-6 border border-[#ccd7e2] bg-white">
          <div className="bg-[#0b5cad] px-5 py-5 text-[21px] font-black text-white">나의 건강관리</div>
          <ul className="divide-y divide-[#e4eaf0]">
            {tabs.map((tab) => (
              <li key={tab.key}>
                <button
                  type="button"
                  onClick={() => onTabChange(tab.key)}
                  className={`w-full px-5 py-4 text-left text-[15px] ${
                    activeTab === tab.key ? 'bg-[#eef6ff] font-black text-[#0b5cad]' : 'font-bold text-[#425466] hover:bg-[#f6f9fc]'
                  }`}
                >
                  {tab.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <section>{children}</section>
    </main>
  );
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6 border-b-2 border-[#1d2b3a] pb-5">
      <div className="mb-3 text-[14px] text-[#66788a]">홈 &gt; 나의 건강관리 &gt; {title}</div>
      <h1 className="text-[34px] font-black tracking-[-0.04em] text-[#1d2b3a]">{title}</h1>
      <p className="mt-2 text-[17px] leading-7 text-[#526273]">{subtitle}</p>
    </div>
  );
}

function DashboardView({ onTabChange }: { onTabChange: (tab: TabKey) => void }) {
  const counts = useMemo(
    () => ({
      normal: metricDefinitions.filter((metric) => metric.status === '정상 기준 안').length,
      caution: metricDefinitions.filter((metric) => metric.status === '관리 참고').length,
      follow: metricDefinitions.filter((metric) => metric.status === '추적 확인').length,
    }),
    [],
  );
  const topItems = metricDefinitions.filter((metric) => metric.status !== '정상 기준 안').slice(0, 5);

  return (
    <>
      <PageHeader title="대시보드" subtitle="최근 검진 결과에서 먼저 확인할 항목만 요약합니다." />
      <div className="mb-7 grid grid-cols-4 border border-[#ccd7e2] bg-white">
        <SummaryCell label="최근 검진일" value={latest.date} note={latest.hospital} />
        <SummaryCell label="검진 기록" value={`${reports.length}건`} note={`${reports[0].year}~${latest.year}`} />
        <SummaryCell label="참고 점수" value={`${latest.score}/100`} note="검진 수치 기반 참고 정보" />
        <SummaryCell label="관리·추적" value={`${counts.caution + counts.follow}건`} note={`정상 기준 안 ${counts.normal}건`} />
      </div>

      <div className="grid grid-cols-[1fr_320px] gap-7">
        <Board title="우선 확인 항목">
          <div className="divide-y divide-[#e1e8ef]">
            {topItems.map((metric) => (
              <button
                key={metric.key}
                type="button"
                onClick={() => onTabChange('analysis')}
                className="grid w-full grid-cols-[160px_1fr_110px] items-center gap-4 py-4 text-left"
              >
                <div className="font-black text-[#1d2b3a]">{metric.name}</div>
                <div className="text-[#526273]">
                  {formatValue(currentValue(metric), metric.unit)} · 정상 기준 {metric.normalText}
                </div>
                <StatusBadge status={metric.status} />
              </button>
            ))}
          </div>
        </Board>
        <Board title="건강관리 바로가기">
          <div className="space-y-3">
            {externalActions.map((item) => (
              <ActionButton
                key={item.title}
                onClick={() => {
                  if (item.url) window.open(item.url, '_blank', 'noopener,noreferrer');
                  if (item.tab) onTabChange(item.tab);
                }}
              >
                <span className="block">{item.title}</span>
                <span className="mt-1 block text-sm font-normal leading-6 text-[#66788a]">{item.description}</span>
              </ActionButton>
            ))}
          </div>
        </Board>
      </div>
    </>
  );
}

function RecordsView() {
  const [yearFilter, setYearFilter] = useState('전체');
  const filteredReports = yearFilter === '전체' ? reports : reports.filter((report) => String(report.year) === yearFilter);

  return (
    <>
      <PageHeader title="검진결과 조회" subtitle="검진기록과 결과조회 기능을 하나로 합쳐 연도별 결과와 상세 항목을 확인합니다." />
      <SearchBox>
        <label className="font-black text-[#1d2b3a]">검진연도</label>
        <select className="h-10 border border-[#b9c8d6] bg-white px-3" value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
          <option>전체</option>
          {reports.map((report) => (
            <option key={report.year}>{report.year}</option>
          ))}
        </select>
        <span className="text-sm text-[#66788a]">선택한 연도의 기록만 아래 표에 표시됩니다.</span>
      </SearchBox>

      <Board title="검진기록 목록">
        <ResultTable data={filteredReports} />
      </Board>

      <Board title="최근 검진 상세 항목">
        <MetricTable />
      </Board>
    </>
  );
}

function HistoryView() {
  const chartGroups = [
    { title: '혈압 변화', keys: ['sbp', 'dbp'] as MetricKey[] },
    { title: '혈당·체중 변화', keys: ['glucose', 'bmi', 'waist'] as MetricKey[] },
    { title: '지질 변화', keys: ['ldl', 'hdl', 'triglyceride'] as MetricKey[] },
    { title: '간 기능 변화', keys: ['ast', 'alt', 'ggt'] as MetricKey[] },
    { title: '혈액·신장 변화', keys: ['hemoglobin', 'creatinine'] as MetricKey[] },
  ];

  return (
    <>
      <PageHeader title="히스토리" subtitle="검진 항목별 연도 변화와 항목 설명을 함께 확인합니다." />
      <Notice>수치 변화는 생활습관, 복용 약, 검사 당시 상태에 따라 달라질 수 있습니다. 같은 항목이 반복해서 기준을 벗어나면 의료진과 상담해 보세요.</Notice>
      <div className="mt-7 grid grid-cols-2 gap-7">
        {chartGroups.map((group) => {
          const hasBadMetric = group.keys.some((key) => isBadStatus(metricByKey(key).status));
          return (
            <Board key={group.title} title={group.title} tone={hasBadMetric ? 'attention' : 'default'}>
              {hasBadMetric && <p className="mb-3 text-sm font-bold text-[#b51d46]">관리 참고 항목이 포함된 그래프입니다.</p>}
              <ChartBox height={260}>
                <LineChart data={historyRows(group.keys)}>
                  <CartesianGrid stroke="#dfe8f1" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="year" tick={{ fill: '#526273', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#526273', fontSize: 12 }} />
                  <Tooltip />
                  {group.keys.map((key, index) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={metricByKey(key).shortName}
                      stroke={lineColors[index % lineColors.length]}
                      strokeWidth={3}
                      dot={{ r: 3 }}
                    />
                  ))}
                </LineChart>
              </ChartBox>
              <ChartLegend keys={group.keys} />
            </Board>
          );
        })}
      </div>

      <Board title="항목별 쉬운 설명">
        <div className="grid grid-cols-2 gap-x-8 divide-y divide-[#e1e8ef]">
          {metricDefinitions.map((metric) => (
            <div key={metric.key} className="py-4">
              <p className="font-black text-[#1d2b3a]">{metric.name}</p>
              <p className="mt-1 text-[15px] leading-7 text-[#526273]">{metric.description}</p>
            </div>
          ))}
        </div>
      </Board>
    </>
  );
}

function AnalysisView() {
  const groups = useMemo(() => computeGroups(), []);
  const [selectedGroupName, setSelectedGroupName] = useState(groups[0]?.name ?? '');
  const selectedGroup = groups.find((group) => group.name === selectedGroupName) ?? groups[0];
  const selectedMetrics = selectedGroup.keys.map(metricByKey);

  return (
    <>
      <PageHeader title="건강분석" subtitle="검사항목별 내 수치, 정상 기준, 연령대 평균을 한 줄에서 비교합니다." />
      <Notice>이 화면은 건강검진 수치를 이해하기 위한 참고 정보입니다. 질병을 진단하거나 치료 판단을 대체하지 않습니다.</Notice>

      <div className="mt-7 grid grid-cols-[1fr_320px] gap-7">
        <Board title="나의 가까운 관리 참고군">
          <div className="mb-4 border-b border-[#d8e0e8] pb-4">
            <p className="text-[25px] font-black text-[#1d2b3a]">{selectedGroup.name}</p>
            <p className="mt-2 text-[#526273]">{selectedGroup.description}</p>
            <p className="mt-2 text-[15px] leading-7 text-[#425466]">{selectedGroup.meaning}</p>
            <p className="mt-1 text-[15px] leading-7 text-[#66788a]">관련해서 볼 수 있는 항목: {selectedGroup.related}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {groups.map((group) => (
              <button
                key={group.name}
                type="button"
                onClick={() => setSelectedGroupName(group.name)}
                className={`border px-4 py-3 text-left hover:bg-[#eef6ff] ${
                  selectedGroup.name === group.name ? 'border-[#0b5cad] bg-[#eef6ff]' : 'border-[#d8e0e8]'
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="font-black text-[#1d2b3a]">{group.name}</span>
                  <span className="font-black text-[#0b5cad]">{group.matches}개 해당</span>
                </div>
                <p className="mt-1 text-sm text-[#526273]">{group.meaning}</p>
                <p className="mt-1 text-sm text-[#66788a]">해당 항목: {group.metrics.join(', ') || '현재 뚜렷한 해당 항목 없음'}</p>
              </button>
            ))}
          </div>
        </Board>

        <Board title="점수 기준">
          <p className="text-[48px] font-black tracking-[-0.05em] text-[#1d2b3a]">{latest.score}<span className="text-[22px] text-[#9aa6b2]">/100</span></p>
          <div className="mt-3 space-y-2 leading-7 text-[#526273]">
            <p>검진 수치가 정상 기준에서 얼마나 벗어났는지, 관리 참고 항목이 몇 개인지 함께 반영한 참고 점수입니다.</p>
            <p>질환 여부를 판단하는 점수가 아니라, 어떤 항목을 먼저 살펴볼지 정리하기 위한 값입니다.</p>
            <ul className="list-disc pl-5 text-[15px]">
              <li>정상 기준 안: 감점 없음</li>
              <li>관리 참고: 항목당 6점 감점</li>
              <li>추적 확인: 항목당 12점 감점</li>
              <li>미측정 항목: 계산에서 제외</li>
            </ul>
          </div>
        </Board>
      </div>

      <Board title={`${selectedGroup.name} 관련 검사항목 비교`}>
        <p className="mb-4 text-[15px] leading-7 text-[#526273]">
          선택한 참고군을 이해하는 데 필요한 검사 항목만 모았습니다. 같은 항목이라도 증상, 복용 약, 과거력에 따라 해석이 달라질 수 있습니다.
        </p>
        <div className="divide-y divide-[#e1e8ef]">
          {selectedMetrics.map((metric) => (
            <MetricComparisonRow key={metric.key} metric={metric} />
          ))}
        </div>
      </Board>
    </>
  );
}

function UploadView({ profile, onTabChange }: { profile: UserProfile; onTabChange: (tab: TabKey) => void }) {
  const [uploadMode, setUploadMode] = useState<'checkup' | 'medication'>('checkup');
  const [uploadState, setUploadState] = useState<UploadState>({ loading: false, message: '', error: '', ocr: null, analysis: null, medication: null });
  const [ocrFields, setOcrFields] = useState<OcrField[]>([]);
  const [uploadedSource, setUploadedSource] = useState('');
  const [touchedSave, setTouchedSave] = useState(false);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);

  const changeUploadMode = (mode: 'checkup' | 'medication') => {
    setUploadMode(mode);
    setUploadState({ loading: false, message: '', error: '', ocr: null, analysis: null, medication: null });
  };

  const uploadCheckup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    runDummyCheckupOcr(file.name);
  };

  const runDummyCheckupOcr = (source: string) => {
    const dummyFields: OcrField[] = [
      { id: 'exam_date', label: '검진일', value: '', required: true, confidence: 0.94, section: '기본 정보' },
      { id: 'hospital', label: '검진기관', value: '', required: true, confidence: 0.42, section: '기본 정보' },
      { id: 'height', label: '키', value: '165.9', unit: 'cm', required: false, confidence: 0.95, section: '검사 수치' },
      { id: 'weight', label: '몸무게', value: '74.0', unit: 'kg', required: false, confidence: 0.95, section: '검사 수치' },
      { id: 'waist', label: '허리둘레', value: '86.0', unit: 'cm', required: false, confidence: 0.92, section: '검사 수치' },
      { id: 'sbp', label: '수축기 혈압', value: '135', unit: 'mmHg', required: true, confidence: 0.91, section: '검사 수치' },
      { id: 'dbp', label: '이완기 혈압', value: '117', unit: 'mmHg', required: true, confidence: 0.9, section: '검사 수치' },
      { id: 'hb', label: '혈색소', value: '15.9', unit: 'g/dL', required: false, confidence: 0.91, section: '검사 수치' },
      { id: 'fbs', label: '공복혈당', value: '94', unit: 'mg/dL', required: true, confidence: 0.86, section: '검사 수치' },
      { id: 'total_cholesterol', label: '총콜레스테롤', value: '비해당', unit: 'mg/dL', required: false, confidence: 0.89, section: '검사 수치' },
      { id: 'hdl', label: 'HDL 콜레스테롤', value: '비해당', unit: 'mg/dL', required: false, confidence: 0.89, section: '검사 수치' },
      { id: 'tg', label: '중성지방', value: '비해당', unit: 'mg/dL', required: false, confidence: 0.89, section: '검사 수치' },
      { id: 'ldl', label: 'LDL 콜레스테롤', value: '비해당', unit: 'mg/dL', required: false, confidence: 0.89, section: '검사 수치' },
      { id: 'creatinine', label: '혈청 크레아티닌', value: '0.9', unit: 'mg/dL', required: false, confidence: 0.84, section: '검사 수치' },
      { id: 'urine_protein', label: '요단백', value: '정상', required: false, confidence: 0.82, section: '검사 수치' },
      { id: 'ast', label: 'AST(SGOT)', value: '26', unit: 'IU/L', required: false, confidence: 0.9, section: '검사 수치' },
      { id: 'alt', label: 'ALT(SGPT)', value: '36', unit: 'IU/L', required: false, confidence: 0.9, section: '검사 수치' },
      { id: 'ggt', label: '감마-GTP', value: '35', unit: 'IU/L', required: false, confidence: 0.9, section: '검사 수치' },
    ];
    setUploadedSource(source);
    setTouchedSave(false);
    setConfirmSaveOpen(false);
    setOcrFields(dummyFields);
    setUploadState((current) => ({
      ...current,
      loading: false,
      error: '',
      message: '사진에서 읽은 결과가 준비되었습니다. 검진표와 다른 값이 있으면 수정한 뒤 저장하세요.',
      ocr: { source, fields: dummyFields },
      analysis: null,
    }));
  };

  const updateOcrField = (id: string, value: string) => {
    setOcrFields((current) => current.map((field) => (field.id === id ? { ...field, value } : field)));
  };

  const requiredMissing = ocrFields.filter((field) => field.required && !field.value.trim());
  const buildReviewedOcr = () => {
    const optionalEmpty = (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || trimmed === '비해당' || trimmed === '해당없음' || trimmed === '미측정') return null;
      return trimmed;
    };
    const numericValue = (field: OcrField) => {
      const value = optionalEmpty(field.value);
      if (value === null) return null;
      const number = Number(value);
      return Number.isFinite(number) ? number : value;
    };
    const fieldMap = Object.fromEntries(ocrFields.map((field) => [field.id, field]));
    const measurements = Object.fromEntries(
      ocrFields
        .filter((field) => field.section === '검사 수치')
        .map((field) => [field.id, { value: numericValue(field), ...(field.unit ? { unit: field.unit } : {}) }]),
    );
    return {
      meta: {
        patient_name: profile.name,
        exam_date: optionalEmpty(fieldMap.exam_date?.value ?? ''),
        hospital: optionalEmpty(fieldMap.hospital?.value ?? ''),
        patient_gender: profile.gender === 1 ? 'M' : 'F',
      },
      measurements,
      lifestyle: {},
    };
  };

  const scrollToFirstMissing = () => {
    window.setTimeout(() => {
      document.querySelector('[data-ocr-missing="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 0);
  };

  const requestSaveReviewedOcr = () => {
    setTouchedSave(true);
    if (!ocrFields.length) {
      setUploadState((current) => ({ ...current, error: '먼저 건강검진 결과지를 촬영하거나 선택해주세요.' }));
      return;
    }
    if (requiredMissing.length) {
      setUploadState((current) => ({ ...current, error: '필수 항목이 비어 있습니다. 빨간색으로 표시된 항목을 채워주세요.' }));
      scrollToFirstMissing();
      return;
    }
    setUploadState((current) => ({ ...current, error: '' }));
    setConfirmSaveOpen(true);
  };

  const saveReviewedOcr = () => {
    const reviewed = buildReviewedOcr();
    setConfirmSaveOpen(false);
    setUploadState((current) => ({
      ...current,
      error: '',
      message: '확인한 검진표 값이 저장되었습니다.',
      analysis: { reviewed, source: uploadedSource, checked_at: new Date().toISOString() },
    }));
  };

  const uploadMedication = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadState((current) => ({ ...current, loading: true, error: '', message: '복약자료를 업로드하고 있습니다.', medication: null }));
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await apiFetch('/medication/upload', { method: 'POST', body: formData }, false);
      setUploadState((current) => ({ ...current, loading: false, message: '복약자료가 저장되었습니다.', medication: result }));
    } catch (error) {
      setUploadState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : '복약자료 업로드에 실패했습니다.' }));
    }
  };

  return (
    <>
      <PageHeader title="결과지 업로드" subtitle="업로드할 자료 종류를 먼저 선택한 뒤 내용을 확인하고 저장합니다." />
      <div className="mb-6 grid grid-cols-2 border border-[#c9d5e2] bg-white">
        <button
          type="button"
          className={`px-5 py-4 text-left ${uploadMode === 'checkup' ? 'bg-[#eef6ff] text-[#0b5cad]' : 'text-[#526273] hover:bg-[#f7fafc]'}`}
          onClick={() => changeUploadMode('checkup')}
        >
          <span className="block text-[18px] font-black">건강검진 결과지</span>
          <span className="mt-1 block text-[14px] font-bold">검진표 사진을 확인하고 수치를 저장합니다.</span>
        </button>
        <button
          type="button"
          className={`border-l border-[#c9d5e2] px-5 py-4 text-left ${uploadMode === 'medication' ? 'bg-[#eef6ff] text-[#0b5cad]' : 'text-[#526273] hover:bg-[#f7fafc]'}`}
          onClick={() => changeUploadMode('medication')}
        >
          <span className="block text-[18px] font-black">처방전·복약자료</span>
          <span className="mt-1 block text-[14px] font-bold">내가 먹는 약 자료 파일을 등록합니다.</span>
        </button>
      </div>

      {uploadMode === 'checkup' && (
        <Board title="건강검진 결과지 확인">
          <div className="grid grid-cols-2 gap-4">
            <label className="block cursor-pointer border border-[#0b5cad] bg-[#eef6ff] px-5 py-5 hover:bg-[#dfefff]">
              <span className="block text-[20px] font-black text-[#0b5cad]">카메라로 촬영</span>
              <span className="mt-2 block text-[15px] leading-7 text-[#526273]">카메라로 결과지를 촬영한 뒤 읽힌 값을 확인합니다.</span>
              <span className="mt-4 inline-flex h-10 items-center bg-[#0b5cad] px-4 text-sm font-black text-white">촬영하기</span>
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={uploadCheckup} />
            </label>
            <label className="block cursor-pointer border border-[#c9d5e2] bg-[#f7fafc] px-5 py-5 hover:bg-[#eef6ff]">
              <span className="block text-[20px] font-black text-[#1d2b3a]">갤러리에서 선택</span>
              <span className="mt-2 block text-[15px] leading-7 text-[#526273]">이미 저장된 건강검진 결과지 사진을 선택하는 흐름입니다.</span>
              <span className="mt-4 inline-flex h-10 items-center bg-[#1d2b3a] px-4 text-sm font-black text-white">사진 선택</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={uploadCheckup} />
            </label>
          </div>

          <button type="button" className="mt-4 h-11 border border-[#0b5cad] px-5 font-black text-[#0b5cad] hover:bg-[#eef6ff]" onClick={() => runDummyCheckupOcr('sample-checkup-photo.jpg')}>
            예시 결과 불러오기
          </button>

          {ocrFields.length > 0 && (
            <div className="mt-6">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-[15px] text-[#526273]">
                {uploadedSource && <span className="font-bold text-[#1d2b3a]">선택한 파일: {uploadedSource}</span>}
                <span>확인 필요 {requiredMissing.length}개</span>
              </div>
              <div className="mb-5 border border-[#d8e0e8] bg-[#f7fafc] px-4 py-3 text-[15px] leading-7 text-[#425466]">
                이름과 성별은 회원정보의 {profile.name} / {profile.gender === 1 ? '남성' : '여성'} 정보가 자동으로 적용됩니다.
              </div>

              {(['기본 정보', '검사 수치'] as OcrField['section'][]).map((section) => (
                <div key={section} className="mb-5 border border-[#d8e0e8]">
                  <div className="border-b border-[#d8e0e8] bg-[#f2f6fa] px-4 py-3 text-[17px] font-black text-[#1d2b3a]">{section}</div>
                  <div className="divide-y divide-[#e1e8ef]">
                    {ocrFields
                      .filter((field) => field.section === section)
                      .map((field) => {
                        const missing = touchedSave && field.required && !field.value.trim();
                        return (
                          <div
                            key={field.id}
                            data-ocr-missing={missing ? 'true' : undefined}
                            className={`grid grid-cols-[170px_1fr] items-center gap-4 px-4 py-3 ${missing ? 'bg-[#fff1f4]' : ''}`}
                          >
                            <div>
                              <p className="font-black text-[#1d2b3a]">
                                {field.label}
                                {field.required && <span className="ml-1 text-[#b51d46]">*</span>}
                              </p>
                              {missing && <p className="mt-1 text-xs font-bold text-[#b51d46]">사진이나 검진표 확인 필요</p>}
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                className={`h-11 w-full border px-3 text-[15px] outline-none focus:border-[#0b5cad] ${
                                  missing ? 'border-[#d93c65] bg-white' : 'border-[#c9d5e2]'
                                }`}
                                value={field.value}
                                onChange={(event) => updateOcrField(field.id, event.target.value)}
                                placeholder={field.required ? '필수 입력' : '미측정 또는 직접 입력'}
                              />
                              {field.unit && <span className="w-[72px] text-sm font-bold text-[#66788a]">{field.unit}</span>}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))}

              <div className="mb-3 border border-[#d8e0e8] bg-[#f7fafc] px-4 py-3 text-[15px] leading-7 text-[#425466]">
                저장하기 전에 측정값과 검진기관, 검진일이 실제 검진표와 같은지 다시 한 번 확인해주세요.
              </div>
              <button type="button" className="h-12 w-full bg-[#0b5cad] px-5 font-black text-white hover:bg-[#084f8a]" onClick={requestSaveReviewedOcr}>
                확인한 값 저장
              </button>
              {Boolean(uploadState.analysis) && (
                <button type="button" className="mt-3 h-12 w-full border border-[#0b5cad] bg-white px-5 font-black text-[#0b5cad] hover:bg-[#eef6ff]" onClick={() => onTabChange('records')}>
                  검진기록에서 확인하기
                </button>
              )}
            </div>
          )}
        </Board>
      )}

      {uploadMode === 'medication' && (
        <Board title="내가 먹는 약! 한눈에 업로드">
          <UploadBox
            title="복약자료 파일 선택"
            description="내가 먹는 약! 한눈에에서 받은 xls/xlsx 파일을 업로드합니다."
            accept=".xls,.xlsx"
            onChange={uploadMedication}
          />
          <button
            type="button"
            className="mt-4 h-11 border border-[#0b5cad] px-5 font-black text-[#0b5cad] hover:bg-[#eef6ff]"
            onClick={() => window.open('/hira-medication-guide.html', '_blank', 'noopener,noreferrer')}
          >
            자료 발급 방법 안내 보기
          </button>
        </Board>
      )}

      {(uploadState.message || uploadState.error) && (
        <div className={`mt-6 border px-5 py-4 text-[15px] ${uploadState.error ? 'border-[#d93c65] bg-[#fff1f4] text-[#b51d46]' : 'border-[#b8cee5] bg-[#eef6ff] text-[#1d4f7c]'}`}>
          {uploadState.error || uploadState.message}
        </div>
      )}
      {confirmSaveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#102033]/45 px-4">
          <div className="w-full max-w-md border border-[#c9d5e2] bg-white p-6 shadow-[0_18px_48px_rgba(16,32,51,0.25)]">
            <h3 className="text-[24px] font-black text-[#1d2b3a]">이 값으로 저장할까요?</h3>
            <p className="mt-3 text-[15px] leading-7 text-[#526273]">
              저장 후에는 검진기록에서 확인할 수 있습니다. 검진일, 검진기관, 주요 측정값이 실제 검진표와 같은지 마지막으로 확인해주세요.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button type="button" className="h-11 border border-[#c9d5e2] bg-white font-black text-[#526273] hover:bg-[#f7fafc]" onClick={() => setConfirmSaveOpen(false)}>
                다시 확인
              </button>
              <button type="button" className="h-11 bg-[#0b5cad] font-black text-white hover:bg-[#084f8a]" onClick={saveReviewedOcr}>
                저장하기
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}

function SearchBox({ children }: { children: ReactNode }) {
  return (
    <div className="mb-7 border border-[#c9d5e2] bg-[#f7fafc] p-5">
      <div className="grid grid-cols-[110px_200px_1fr] items-center gap-3 text-[15px]">{children}</div>
    </div>
  );
}

function ResultTable({ data }: { data: Report[] }) {
  return (
    <table className="w-full border-collapse text-left text-[15px]">
      <thead className="bg-[#f2f6fa] text-[#1d2b3a]">
        <tr>
          <Th>검진연도</Th>
          <Th>검진일</Th>
          <Th>검진기관</Th>
          <Th>상태</Th>
          <Th>검진결과 요약</Th>
        </tr>
      </thead>
      <tbody>
        {[...data].reverse().map((report) => (
          <tr key={report.year}>
            <Td strong>{report.year}</Td>
            <Td>{report.date}</Td>
            <Td>{report.hospital}</Td>
            <Td><StatusBadge status={report.status} /></Td>
            <Td>{report.summary}</Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MetricTable() {
  return (
    <table className="w-full border-collapse text-left text-[15px]">
      <thead className="bg-[#f2f6fa] text-[#1d2b3a]">
        <tr>
          <Th>구분</Th>
          <Th>항목명</Th>
          <Th>내 수치</Th>
          <Th>정상 기준</Th>
          <Th>연령대 평균</Th>
          <Th>설명</Th>
          <Th>상태</Th>
        </tr>
      </thead>
      <tbody>
        {metricDefinitions.map((metric) => (
          <tr key={metric.key}>
            <Td>{metric.category}</Td>
            <Td strong>{metric.name}</Td>
            <Td>{formatValue(currentValue(metric), metric.unit)}</Td>
            <Td>{metric.normalText}</Td>
            <Td>{metric.peerMean == null ? '평균 비교 제외' : formatValue(metric.peerMean, metric.unit)}</Td>
            <Td>{metric.description}</Td>
            <Td><StatusBadge status={metric.status} /></Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MetricComparisonRow({ metric }: { metric: MetricDefinition }) {
  const mine = currentValue(metric);
  const max = Math.max(mine, metric.normalValue, metric.peerMean ?? 0, 1);
  const bars = [
    { label: '내 수치', value: mine, text: formatValue(mine, metric.unit), color: metricAccentColor(metric) },
    { label: '정상 기준', value: metric.normalValue, text: metric.normalText, color: '#2f8fd0' },
    ...(metric.peerMean == null
      ? [{ label: '연령대 평균', value: 0, text: '평균 비교 제외', color: '#9aa6b2' }]
      : [{ label: '연령대 평균', value: metric.peerMean, text: formatValue(metric.peerMean, metric.unit), color: '#7c8794' }]),
  ];

  return (
    <div className="grid grid-cols-[170px_1fr_auto] items-start gap-5 py-5">
      <div>
        <p className="font-black text-[#1d2b3a]">{metric.name}</p>
        <p className="mt-1 text-sm text-[#66788a]">{metric.description}</p>
      </div>
      <div className="space-y-2">
        {bars.map((bar) => (
          <div key={bar.label} className="grid grid-cols-[90px_1fr_120px] items-center gap-3">
            <span className="text-sm font-bold text-[#526273]">{bar.label}</span>
            <span className="h-2 bg-[#edf2f7]">
              <span className="block h-2" style={{ width: `${bar.value ? Math.max((bar.value / max) * 100, 6) : 0}%`, backgroundColor: bar.color }} />
            </span>
            <span className="text-sm font-bold text-[#1d2b3a]">{bar.text}</span>
          </div>
        ))}
      </div>
      <div className="justify-self-start">
        <StatusBadge status={metric.status} />
      </div>
    </div>
  );
}

function SummaryCell({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="border-r border-[#ccd7e2] px-5 py-5 last:border-r-0">
      <p className="text-sm font-black text-[#526273]">{label}</p>
      <p className="mt-2 text-[24px] font-black tracking-[-0.03em] text-[#1d2b3a]">{value}</p>
      <p className="mt-1 text-sm text-[#66788a]">{note}</p>
    </div>
  );
}

function Board({ title, children, tone = 'default' }: { title: string; children: ReactNode; tone?: 'default' | 'attention' }) {
  const borderClass = tone === 'attention' ? 'border-[#d93c65]' : 'border-[#ccd7e2]';
  const headerClass = tone === 'attention' ? 'border-[#f0b8c5] bg-[#fff7f9]' : 'border-[#ccd7e2] bg-[#f8fafc]';
  return (
    <section className={`mb-7 border ${borderClass} bg-white`}>
      <h2 className={`border-b ${headerClass} px-5 py-4 text-[20px] font-black text-[#1d2b3a]`}>{title}</h2>
      <div className="p-5">{children}</div>
    </section>
  );
}

function ChartBox({ children, height = 330 }: { children: ReactNode; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

function ChartLegend({ keys }: { keys: MetricKey[] }) {
  return (
    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[#526273]">
      {keys.map((key, index) => {
        const metric = metricByKey(key);
        return (
          <span key={key} className={`inline-flex items-center gap-2 ${isBadStatus(metric.status) ? 'font-black text-[#b51d46]' : ''}`}>
            <span className="h-2.5 w-2.5" style={{ backgroundColor: lineColors[index % lineColors.length] }} />
            <span>
              {metric.shortName}
              {isBadStatus(metric.status) ? ` (${metric.status})` : ''}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function UploadBox({ title, description, accept, onChange }: { title: string; description: string; accept: string; onChange: (event: ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className="block cursor-pointer border border-[#c9d5e2] bg-[#f7fafc] px-5 py-5 hover:bg-[#eef6ff]">
      <span className="block text-[18px] font-black text-[#1d2b3a]">{title}</span>
      <span className="mt-2 block text-[15px] leading-7 text-[#526273]">{description}</span>
      <span className="mt-4 inline-flex h-10 items-center bg-[#1d2b3a] px-4 text-sm font-black text-white">파일 선택</span>
      <input type="file" accept={accept} className="hidden" onChange={onChange} />
    </label>
  );
}

function ActionButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="block w-full border border-[#c9d5e2] px-4 py-3 text-left font-black text-[#1d2b3a] hover:bg-[#eef6ff]">
      {children}
    </button>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return <div className="border border-[#b8cee5] bg-[#eef6ff] px-5 py-4 text-[15px] leading-7 text-[#1d4f7c]">{children}</div>;
}

function Th({ children }: { children: ReactNode }) {
  return <th className="border border-[#ccd7e2] px-4 py-3 font-black">{children}</th>;
}

function Td({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return <td className={`border border-[#e1e8ef] px-4 py-3 align-top ${strong ? 'font-black text-[#1d2b3a]' : 'text-[#425466]'}`}>{children}</td>;
}

const lineColors = ['#0b5cad', '#0c8a6a', '#c98a18', '#7c8794'];

function metricByKey(key: MetricKey) {
  return metricDefinitions.find((metric) => metric.key === key)!;
}

function historyRows(keys: MetricKey[]) {
  return reports.map((report) => ({
    year: report.year,
    ...Object.fromEntries(keys.map((key) => [metricByKey(key).shortName, report.values[key]])),
  }));
}

function computeGroups() {
  const find = (key: MetricKey) => metricDefinitions.find((metric) => metric.key === key)!;
  const groupDefs = [
    {
      name: '대사 관리 참고군',
      keys: ['waist', 'glucose', 'triglyceride', 'hdl', 'sbp'] as MetricKey[],
      description: '허리둘레, 혈당, 지질, 혈압 항목이 함께 겹칠 때 먼저 확인하는 그룹입니다.',
      meaning: '대사증후군 기준과 가까운 항목을 묶어 보는 참고군입니다.',
      related: '복부비만, 혈당 상승, 혈압 상승, 중성지방 상승, HDL 저하와 관련해 볼 수 있습니다.',
    },
    {
      name: '혈압 관리 참고군',
      keys: ['sbp', 'dbp'] as MetricKey[],
      description: '수축기와 이완기 혈압 흐름을 우선 살펴보는 그룹입니다.',
      meaning: '혈압 수치가 반복해서 기준을 벗어나는지 확인하는 참고군입니다.',
      related: '두통, 어지럼, 혈관 부담과 관련해 상담이 필요할 수 있지만 증상 없이 나타나기도 합니다.',
    },
    {
      name: '지질 관리 참고군',
      keys: ['ldl', 'hdl', 'triglyceride'] as MetricKey[],
      description: '콜레스테롤과 중성지방 항목을 묶어서 보는 그룹입니다.',
      meaning: '혈관 건강과 관련된 지질 수치를 함께 보는 참고군입니다.',
      related: 'LDL 상승, HDL 저하, 중성지방 상승은 심혈관 위험 요인과 함께 확인합니다.',
    },
    {
      name: '간 기능 관찰군',
      keys: ['ast', 'alt', 'ggt'] as MetricKey[],
      description: '간 효소 수치가 생활습관, 약물, 음주와 함께 영향을 받을 수 있는 그룹입니다.',
      meaning: '간세포나 간담도계 상태를 참고하는 효소 수치를 묶은 그룹입니다.',
      related: '음주, 약물, 피로, 지방간 가능성 등 여러 요인과 함께 확인합니다.',
    },
    {
      name: '신장 기능 관찰군',
      keys: ['creatinine'] as MetricKey[],
      description: '혈청 크레아티닌 흐름을 따로 추적하는 그룹입니다.',
      meaning: '신장 기능 추정에 쓰이는 혈청 크레아티닌을 관찰하는 참고군입니다.',
      related: '신장 기능 변화는 eGFR 계산과 함께 확인하며 평균 비교에는 사용하지 않습니다.',
    },
  ];

  return groupDefs
    .map((group) => {
      const matched = group.keys.map(find).filter((metric) => metric.status !== '정상 기준 안');
      return { ...group, matches: matched.length, metrics: matched.map((metric) => metric.name) };
    })
    .sort((a, b) => b.matches - a.matches);
}

function AuthModal({
  loading,
  onClose,
  onLogin,
  onSignup,
}: {
  loading: boolean;
  onClose: () => void;
  onLogin: (email: string, password: string) => void;
  onSignup: (input: { email: string; name: string; birth_date: string; gender: 1 | 2; password: string }) => void;
}) {
  const [mode, setMode] = useState<'login' | 'signup'>('signup');
  const [form, setForm] = useState({
    email: '',
    name: '',
    birth_date: '1980-01-01',
    gender: '1',
    password: '',
  });

  return (
    <Dialog title={mode === 'signup' ? '회원가입' : '로그인'} onClose={onClose}>
      <div className="mb-5 grid grid-cols-2 border border-[#c9d5e2] text-center text-[15px] font-black">
        <button type="button" className={`py-3 ${mode === 'signup' ? 'bg-[#eef6ff] text-[#0b5cad]' : 'text-[#425466]'}`} onClick={() => setMode('signup')}>
          회원가입
        </button>
        <button type="button" className={`border-l border-[#c9d5e2] py-3 ${mode === 'login' ? 'bg-[#eef6ff] text-[#0b5cad]' : 'text-[#425466]'}`} onClick={() => setMode('login')}>
          로그인
        </button>
      </div>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (mode === 'login') {
            onLogin(form.email.trim(), form.password);
            return;
          }
          onSignup({
            email: form.email.trim(),
            name: form.name.trim(),
            birth_date: form.birth_date,
            gender: Number(form.gender) === 2 ? 2 : 1,
            password: form.password,
          });
        }}
      >
        <Field label="이메일">
          <input
            type="email"
            className="h-11 w-full border border-[#c9d5e2] px-3 text-[15px] outline-none focus:border-[#0b5cad]"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            required
          />
        </Field>
        {mode === 'signup' && (
          <>
            <Field label="이름">
              <input
                className="h-11 w-full border border-[#c9d5e2] px-3 text-[15px] outline-none focus:border-[#0b5cad]"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                required
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="생년월일">
                <input
                  type="date"
                  className="h-11 w-full border border-[#c9d5e2] px-3 text-[15px] outline-none focus:border-[#0b5cad]"
                  value={form.birth_date}
                  onChange={(event) => setForm((current) => ({ ...current, birth_date: event.target.value }))}
                  required
                />
              </Field>
              <Field label="성별">
                <select
                  className="h-11 w-full border border-[#c9d5e2] bg-white px-3 text-[15px] outline-none focus:border-[#0b5cad]"
                  value={form.gender}
                  onChange={(event) => setForm((current) => ({ ...current, gender: event.target.value }))}
                >
                  <option value="1">남성</option>
                  <option value="2">여성</option>
                </select>
              </Field>
            </div>
          </>
        )}
        <Field label="비밀번호">
          <input
            type="password"
            className="h-11 w-full border border-[#c9d5e2] px-3 text-[15px] outline-none focus:border-[#0b5cad]"
            value={form.password}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            required
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="h-11 border border-[#c9d5e2] px-5 font-black text-[#425466]" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="h-11 bg-[#0b5cad] px-5 font-black text-white disabled:bg-[#9aa6b2]" disabled={loading}>
            {loading ? '처리 중' : mode === 'signup' ? '회원가입' : '로그인'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function ProfileModal({
  profile,
  loading,
  onClose,
  onSave,
}: {
  profile: UserProfile;
  loading: boolean;
  onClose: () => void;
  onSave: (profile: UserProfile) => void;
}) {
  const [form, setForm] = useState({
    name: profile.name,
    email: profile.email ?? '',
    gender: String(profile.gender),
    birth_date: birthDateFromProfile(profile),
  });

  return (
    <Dialog title="프로필 수정" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            ...profile,
            name: form.name.trim() || profile.name,
            email: form.email.trim() || profile.email,
            gender: Number(form.gender) === 2 ? 2 : 1,
            birth_year: profileBirthFromDate(form.birth_date).birth_year || profile.birth_year,
            birth_md: profileBirthFromDate(form.birth_date).birth_md ?? profile.birth_md,
          });
        }}
      >
        <Field label="이메일">
          <input
            className="h-11 w-full border border-[#c9d5e2] px-3 text-[15px] outline-none focus:border-[#0b5cad]"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            placeholder="name@example.com"
          />
        </Field>
        <Field label="이름">
          <input
            className="h-11 w-full border border-[#c9d5e2] px-3 text-[15px] outline-none focus:border-[#0b5cad]"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="성별">
            <select
              className="h-11 w-full border border-[#c9d5e2] bg-white px-3 text-[15px] outline-none focus:border-[#0b5cad]"
              value={form.gender}
              onChange={(event) => setForm((current) => ({ ...current, gender: event.target.value }))}
            >
              <option value="1">남성</option>
              <option value="2">여성</option>
            </select>
          </Field>
          <Field label="생년월일">
            <input
              type="date"
              className="h-11 w-full border border-[#c9d5e2] px-3 text-[15px] outline-none focus:border-[#0b5cad]"
              value={form.birth_date}
              onChange={(event) => setForm((current) => ({ ...current, birth_date: event.target.value }))}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="h-11 border border-[#c9d5e2] px-5 font-black text-[#425466]" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="h-11 bg-[#0b5cad] px-5 font-black text-white disabled:bg-[#9aa6b2]" disabled={loading}>
            {loading ? '저장 중' : '저장'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function SettingsModal({
  settings,
  onClose,
  onChange,
}: {
  settings: UserSettings;
  onClose: () => void;
  onChange: (settings: UserSettings) => void;
}) {
  const items: Array<{ key: keyof UserSettings; title: string; description: string }> = [
    { key: 'checkupReminder', title: '검진 일정 알림', description: '다음 검진 시기를 놓치지 않도록 알려줍니다.' },
    { key: 'medicationReminder', title: '복약 자료 알림', description: '내가 먹는 약 자료를 정기적으로 확인하도록 안내합니다.' },
    { key: 'simpleWords', title: '쉬운 설명 우선 표시', description: '검사항목 설명을 어려운 의학 용어보다 쉬운 문장으로 먼저 보여줍니다.' },
  ];

  return (
    <Dialog title="설정" onClose={onClose}>
      <div className="divide-y divide-[#e1e8ef]">
        {items.map((item) => (
          <label key={item.key} className="flex cursor-pointer items-start justify-between gap-5 py-4">
            <span>
              <span className="block font-black text-[#1d2b3a]">{item.title}</span>
              <span className="mt-1 block text-[15px] leading-6 text-[#66788a]">{item.description}</span>
            </span>
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 accent-[#0b5cad]"
              checked={settings[item.key]}
              onChange={(event) => onChange({ ...settings, [item.key]: event.target.checked })}
            />
          </label>
        ))}
      </div>
      <div className="mt-5 flex justify-end">
        <button type="button" className="h-11 bg-[#0b5cad] px-5 font-black text-white" onClick={onClose}>
          확인
        </button>
      </div>
    </Dialog>
  );
}

function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#1d2b3a]/35 px-4">
      <div className="w-full max-w-[520px] border border-[#c9d5e2] bg-white shadow-[0_18px_48px_rgba(29,43,58,0.24)]">
        <div className="flex items-center justify-between border-b border-[#d8e0e8] px-6 py-4">
          <h2 className="text-[22px] font-black text-[#1d2b3a]">{title}</h2>
          <button type="button" className="text-[24px] font-black text-[#66788a]" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[14px] font-black text-[#425466]">{label}</span>
      {children}
    </label>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [profile, setProfile] = useState<UserProfile>(initialProfile);
  const [settings, setSettings] = useState<UserSettings>(initialSettings);
  const [authOpen, setAuthOpen] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [message, setMessage] = useState('');

  const loadProfile = async (quiet = false) => {
    const token = await getAccessToken();
    if (!token) {
      if (!quiet) setMessage('로그인 세션이 없어 현재 화면의 프로필 정보를 사용합니다.');
      return;
    }
    setProfileLoading(true);
    try {
      const users = await apiFetch('/users');
      const first = Array.isArray(users) ? users[0] : null;
      if (first) {
        setProfile({
          id: first.id ?? first.user_id,
          email: first.email,
          name: first.name ?? initialProfile.name,
          gender: Number(first.gender) === 2 ? 2 : 1,
          birth_year: Number(first.birth_year) || initialProfile.birth_year,
          birth_md: Number(first.birth_md) || initialProfile.birth_md,
        });
        if (!quiet) setMessage('프로필 정보를 불러왔습니다.');
      } else if (!quiet) {
        setMessage('저장된 프로필이 없어 현재 입력한 정보를 사용합니다.');
      }
    } catch (error) {
      if (!quiet) setMessage(error instanceof Error ? error.message : '프로필 정보를 불러오지 못했습니다.');
    } finally {
      setProfileLoading(false);
    }
  };

  const saveProfile = async (nextProfile: UserProfile) => {
    setProfileLoading(true);
    try {
      const token = await getAccessToken();
      const payload = {
        name: nextProfile.name,
        gender: nextProfile.gender,
        birth_year: nextProfile.birth_year,
        birth_md: nextProfile.birth_md,
      };
      if (token && nextProfile.id) {
        const saved = await apiFetch(`/users/${nextProfile.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        setProfile({
          ...nextProfile,
          id: saved.id ?? saved.user_id ?? nextProfile.id,
          email: saved.email ?? nextProfile.email,
          name: saved.name ?? nextProfile.name,
          gender: Number(saved.gender) === 2 ? 2 : 1,
          birth_year: Number(saved.birth_year) || nextProfile.birth_year,
          birth_md: Number(saved.birth_md) || nextProfile.birth_md,
        });
      } else {
      setProfile(nextProfile);
      }
      setProfileOpen(false);
      setMessage('프로필이 저장되었습니다.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '프로필 저장에 실패했습니다.');
    } finally {
      setProfileLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    if (!supabaseConfigured) {
      setMessage('Supabase 환경변수 설정이 필요합니다.');
      return;
    }
    setAuthLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setAuthOpen(false);
      setMessage('로그인되었습니다.');
      await loadProfile(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '로그인에 실패했습니다.');
    } finally {
      setAuthLoading(false);
    }
  };

  const signup = async (input: { email: string; name: string; birth_date: string; gender: 1 | 2; password: string }) => {
    if (!supabaseConfigured) {
      setMessage('Supabase 환경변수 설정이 필요합니다.');
      return;
    }
    setAuthLoading(true);
    try {
      const birth = profileBirthFromDate(input.birth_date);
      const { data, error } = await supabase.auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          data: {
            name: input.name,
            birth_date: input.birth_date,
            gender: input.gender,
          },
        },
      });
      if (error) throw error;

      const nextProfile: UserProfile = {
        id: data.user?.id,
        email: input.email,
        name: input.name,
        gender: input.gender,
        birth_year: birth.birth_year ?? initialProfile.birth_year,
        birth_md: birth.birth_md,
      };

      if (data.session) {
        const saved = await apiFetch('/users', {
          method: 'POST',
          body: JSON.stringify({
            name: nextProfile.name,
            gender: nextProfile.gender,
            birth_year: nextProfile.birth_year,
            birth_md: nextProfile.birth_md,
          }),
        });
        setProfile({
          ...nextProfile,
          id: saved.id ?? saved.user_id ?? data.user?.id,
          name: saved.name ?? nextProfile.name,
          gender: Number(saved.gender) === 2 ? 2 : 1,
          birth_year: Number(saved.birth_year) || nextProfile.birth_year,
          birth_md: Number(saved.birth_md) || nextProfile.birth_md,
        });
        setMessage('회원가입과 프로필 저장이 완료되었습니다.');
      } else {
        setProfile(nextProfile);
        setMessage('회원가입이 완료되었습니다. 이메일 인증 후 로그인하면 프로필을 저장합니다.');
      }
      setAuthOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '회원가입에 실패했습니다.');
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = async () => {
    if (supabaseConfigured) await supabase.auth.signOut().catch(() => undefined);
    setProfile(initialProfile);
    setMessage('로그아웃되었습니다.');
  };

  useEffect(() => {
    void loadProfile(true);
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 3000);
    return () => window.clearTimeout(timer);
  }, [message]);

  return (
    <div className="min-h-screen bg-white text-[#1d2b3a]">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        profile={profile}
        onEditProfile={() => setProfileOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onReloadProfile={() => void loadProfile()}
        onLogout={() => void logout()}
        onAuth={() => setAuthOpen(true)}
      />
      <Layout activeTab={activeTab} onTabChange={setActiveTab}>
        {activeTab === 'dashboard' && <DashboardView onTabChange={setActiveTab} />}
        {activeTab === 'records' && <RecordsView />}
        {activeTab === 'history' && <HistoryView />}
        {activeTab === 'analysis' && <AnalysisView />}
        {activeTab === 'upload' && <UploadView profile={profile} onTabChange={setActiveTab} />}
      </Layout>
      {message && (
        <div className="fixed bottom-5 right-5 z-50 border border-[#b8cee5] bg-white px-5 py-3 text-[15px] font-bold text-[#1d4f7c] shadow-[0_10px_24px_rgba(29,43,58,0.16)]">
          {message}
        </div>
      )}
      {authOpen && <AuthModal loading={authLoading} onClose={() => setAuthOpen(false)} onLogin={login} onSignup={signup} />}
      {profileOpen && <ProfileModal profile={profile} loading={profileLoading} onClose={() => setProfileOpen(false)} onSave={saveProfile} />}
      {settingsOpen && <SettingsModal settings={settings} onClose={() => setSettingsOpen(false)} onChange={setSettings} />}
    </div>
  );
}
