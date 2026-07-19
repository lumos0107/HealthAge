import { ArrowRight, CalendarDays, ChartNoAxesColumn, FileText, ScanLine, UploadCloud } from 'lucide-react';
import type { ApiHealthState } from '../../api/healthApi';
import { getUserId, getUserName } from '../../api/reportMapper';
import type { MetricKey, TabKey } from '../../data/mockData';
import { metricLabels, metricUnits } from '../../data/mockData';
import { evaluateMetric, getMetricValue, isMeasured, statusLabel, statusTone, type ClinicalStatus } from '../../utils/clinical';
import { managementScore, statusCounts } from '../../utils/healthScores';
import { Badge, Card, EmptyState, MedicalNotice, PrimaryButton } from './Common';

type DashboardProps = {
  apiState: ApiHealthState;
  onNavigate: (tab: TabKey) => void;
  onAction: (message: string) => void;
};

const metricGroups: Array<{ title: string; keys: MetricKey[]; desc: string }> = [
  { title: '혈압', keys: ['sbp', 'dbp'], desc: '수축기·이완기 혈압' },
  { title: '혈당', keys: ['fbs'], desc: '공복혈당' },
  { title: '체중·복부', keys: ['bmi', 'waist'], desc: 'BMI와 허리둘레' },
  { title: '콜레스테롤', keys: ['ldl', 'hdl', 'tg'], desc: 'LDL, HDL, 중성지방' },
  { title: '간 기능', keys: ['ast', 'alt', 'ggt'], desc: 'AST, ALT, 감마-GTP' },
  { title: '신장 기능', keys: ['creatinine'], desc: '혈청 크레아티닌' },
];

const quickServices = [
  { title: '검진기록', desc: '연도별 결과 확인', icon: FileText, tab: 'records' as TabKey },
  { title: '히스토리', desc: '수치 변화 확인', icon: ChartNoAxesColumn, tab: 'history' as TabKey },
  { title: '건강분석', desc: '기준값 비교', icon: ScanLine, tab: 'risk' as TabKey },
  { title: '결과지 업로드', desc: 'OCR 확인 후 저장', icon: UploadCloud, tab: 'upload' as TabKey },
];

function groupStatus(record: NonNullable<ApiHealthState['reports'][number]>, keys: MetricKey[]): ClinicalStatus {
  const statuses = keys.map((key) => evaluateMetric(key, getMetricValue(record, key), record));
  if (statuses.includes('risk')) return 'risk';
  if (statuses.includes('watch') || statuses.includes('low')) return 'watch';
  if (statuses.includes('normal')) return 'normal';
  return 'unmeasured';
}

function firstMeasuredLabel(record: NonNullable<ApiHealthState['reports'][number]>, keys: MetricKey[]) {
  const key = keys.find((item) => isMeasured(getMetricValue(record, item))) ?? keys[0];
  const value = getMetricValue(record, key);
  return isMeasured(value) ? `${metricLabels[key]} ${value}${metricUnits[key]}` : '미측정';
}

function normalizeApiStatus(status?: string): ClinicalStatus {
  if (!status) return 'normal';
  if (['extremely_high', 'very_high'].includes(status)) return 'risk';
  if (['high', 'caution'].includes(status)) return 'watch';
  if (['extremely_low', 'very_low', 'low'].includes(status)) return 'low';
  return 'normal';
}

function groupStatusFromApi(apiState: ApiHealthState, record: NonNullable<ApiHealthState['reports'][number]>, keys: MetricKey[]) {
  if (!apiState.comprehensive?.all_evaluations?.length) return groupStatus(record, keys);
  const aliases = keys.map((key) => metricLabels[key].replace(/\s/g, '').toLowerCase());
  const statuses = apiState.comprehensive.all_evaluations
    .filter((item) => {
      const metric = String(item.metric ?? '').replace(/\s/g, '').toLowerCase();
      return aliases.some((alias) => metric.includes(alias) || alias.includes(metric));
    })
    .map((item) => normalizeApiStatus(item.status));
  if (statuses.includes('risk')) return 'risk';
  if (statuses.includes('watch') || statuses.includes('low')) return 'watch';
  if (statuses.includes('normal')) return 'normal';
  return groupStatus(record, keys);
}

export function Dashboard({ apiState, onNavigate }: DashboardProps) {
  const latest = apiState.reports.at(-1);
  const currentUser = apiState.users.find((user) => getUserId(user) === apiState.selectedUserId);
  const userName = getUserName(currentUser, apiState.comprehensive);

  if (!latest) {
    return (
      <div className="space-y-5">
        <section className="border-b border-[#d8dde5] bg-white px-2 py-10">
          <p className="text-sm font-bold tracking-[0.14em] text-[#2457c5]">WITHUS MEDICAL CHECKUP</p>
          <h1 className="mt-3 text-[34px] font-bold leading-tight tracking-tight text-[#222222] md:text-[42px]">건강검진 결과를 쉽게 확인하세요</h1>
          <p className="mt-4 max-w-xl text-[16px] leading-7 text-[#3f3f3f]">결과지를 업로드하면 OCR 결과를 확인하고, 정상 기준과 과거 기록을 함께 정리할 수 있습니다.</p>
          <PrimaryButton type="button" onClick={() => onNavigate('upload')} className="mt-6">
            결과지 업로드하기 <ArrowRight className="ml-2 h-5 w-5" />
          </PrimaryButton>
        </section>
        <EmptyState title="아직 저장된 검진기록이 없습니다" description="검진 결과를 저장하면 홈, 검진기록, 히스토리, 건강분석 화면이 활성화됩니다." />
      </div>
    );
  }

  const score = managementScore(latest, apiState.comprehensive);
  const counts = statusCounts(latest, apiState.comprehensive);
  const highlighted = metricGroups
    .map((group) => ({ ...group, status: groupStatusFromApi(apiState, latest, group.keys) }))
    .filter((group) => group.status !== 'normal' && group.status !== 'unmeasured')
    .slice(0, 3);
  const priorityMessages = apiState.recommendations?.priority_messages?.map((message) => message.replace(/^[^\p{L}\p{N}]+/u, '').trim()).filter(Boolean) ?? [];

  return (
    <div className="space-y-8">
      <section className="rounded-[10px] border border-[#d8dde5] bg-white px-8 py-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-bold tracking-[0.14em] text-[#2457c5]">HEALTH CHECKUP SUMMARY</p>
            <h1 className="mt-3 text-[32px] font-bold leading-tight tracking-tight text-[#222222] md:text-[40px]">{userName}님의 건강검진 홈</h1>
            <p className="mt-3 max-w-2xl text-[16px] leading-7 text-[#3f3f3f]">최근 검진 결과를 정상 기준, 연령대 평균, 과거 기록과 함께 확인할 수 있습니다.</p>
          </div>
          <button type="button" onClick={() => onNavigate('upload')} className="inline-flex min-h-11 w-fit items-center justify-center rounded-lg bg-[#2457c5] px-5 text-sm font-bold text-white hover:bg-[#1d469f]">
            새 결과지 등록
          </button>
        </div>

        <div className="mt-8 grid gap-0 rounded-[10px] border border-[#d8dde5] md:grid-cols-[1.2fr_0.8fr_1fr]">
          <div className="border-b border-[#d8dde5] px-5 py-5 md:border-b-0 md:border-r">
            <div className="flex items-center gap-2 text-sm font-bold text-[#6a6a6a]">
              <CalendarDays className="h-4 w-4" /> 최근 검진
            </div>
            <p className="mt-2 text-[18px] font-bold text-[#222222]">{latest.hospital}</p>
            <p className="mt-1 text-sm text-[#6a6a6a]">{latest.examDate}</p>
          </div>
          <div className="border-b border-[#d8dde5] px-5 py-5 md:border-b-0 md:border-r">
            <p className="text-sm font-bold text-[#6a6a6a]">검진 수치 기반 참고 점수</p>
            <p className="mt-1 text-[38px] font-bold tabular-nums text-[#222222]">
              {score}<span className="text-[17px] text-[#aaa]">/100</span>
            </p>
            {apiState.comprehensive?.summary?.overall_status && <p className="mt-1 text-xs text-[#6a6a6a]">{apiState.comprehensive.summary.overall_status}</p>}
          </div>
          <div className="grid grid-cols-3 divide-x divide-[#ebebeb] px-5 py-5">
            <div className="text-center">
              <p className="text-sm font-bold text-[#2457c5]">정상</p>
              <p className="mt-1 text-[26px] font-bold text-[#2457c5]">{counts.normal}</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-[#b36b00]">관리</p>
              <p className="mt-1 text-[26px] font-bold text-[#b36b00]">{counts.watch}</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-[#c2414b]">추적</p>
              <p className="mt-1 text-[26px] font-bold text-[#c2414b]">{counts.risk}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
        <div className="rounded-[10px] border border-[#d8dde5] bg-white p-7">
          <div className="flex items-center justify-between">
            <h2 className="text-[22px] font-bold text-[#222222]">관리 참고 항목</h2>
            <Badge tone="blue">진단 아님</Badge>
          </div>
          <div className="mt-4 divide-y divide-[#ebebeb]">
            {highlighted.length ? (
              highlighted.map((item) => (
                <button key={item.title} type="button" onClick={() => onNavigate('risk')} className="flex w-full items-center justify-between gap-4 py-4 text-left">
                  <div className="min-w-0">
                    <p className="text-[17px] font-bold text-[#222222]">{item.title}</p>
                    <p className="mt-1 truncate text-sm text-[#6a6a6a]">{item.desc}</p>
                  </div>
                  <span className={`shrink-0 whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-bold ${statusTone(item.status)}`}>{statusLabel(item.status)}</span>
                </button>
              ))
            ) : (
              <p className="py-4 text-sm font-bold text-[#2457c5]">강조할 관리 참고 항목이 없습니다.</p>
            )}
          </div>
          {priorityMessages[0] && (
            <div className="mt-4 border-t border-[#d8dde5] pt-4">
              <p className="text-sm font-bold text-[#222222]">우선 확인</p>
              <p className="mt-1 text-sm leading-6 text-[#3f3f3f]">{priorityMessages[0]}</p>
            </div>
          )}
        </div>

        <div className="rounded-[10px] border border-[#d8dde5] bg-white p-7">
          <h2 className="text-[22px] font-bold text-[#222222]">검진 결과 읽기</h2>
          <div className="mt-4 divide-y divide-[#ebebeb]">
            <div className="border-b border-[#d8dde5] py-4">
              <p className="font-bold text-[#222222]">정상 기준과 함께 비교</p>
              <p className="mt-1 text-sm leading-6 text-[#3f3f3f]">연령대 평균은 참고값이며, 정상 범위와 함께 확인해야 합니다.</p>
            </div>
            <div className="py-4">
              <p className="font-bold text-[#222222]">반복되는 흐름 확인</p>
              <p className="mt-1 text-sm leading-6 text-[#3f3f3f]">한 번의 수치보다 여러 해의 변화 흐름을 함께 보는 것이 좋습니다.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[10px] border border-[#d8dde5] bg-white p-7">
        <h2 className="text-[22px] font-bold text-[#222222]">바로가기</h2>
        <div className="mt-4 grid gap-0 divide-y divide-[#ebebeb] rounded-[10px] border border-[#d8dde5] md:grid-cols-4 md:divide-x md:divide-y-0">
          {quickServices.map((service) => (
            <button key={service.title} type="button" onClick={() => onNavigate(service.tab)} className="flex items-start gap-3 px-4 py-5 text-left hover:bg-[#f8f9fa]">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[#f2f6ff] text-[#2457c5]">
                <service.icon className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-[16px] font-bold text-[#222222]">{service.title}</span>
                <span className="mt-1 block text-sm text-[#6a6a6a]">{service.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[10px] border border-[#d8dde5] bg-white p-7">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[22px] font-bold text-[#222222]">주요 검진 항목</h2>
            <button type="button" onClick={() => onNavigate('records')} className="flex items-center text-sm font-bold text-[#222222]">
              전체 보기 <ArrowRight className="ml-1 h-4 w-4" />
            </button>
          </div>
          <div className="grid overflow-hidden rounded-[10px] border border-[#d8dde5] md:grid-cols-2">
            {metricGroups.map((group, index) => {
              const status = groupStatusFromApi(apiState, latest, group.keys);
              return (
                <button
                  key={group.title}
                  type="button"
                  onClick={() => onNavigate('records')}
                  className={`flex min-h-[96px] w-full items-center justify-between gap-4 border-b border-[#d8dde5] px-5 py-4 text-left hover:bg-[#f7f8fa] md:px-5 ${index % 2 === 0 ? 'md:border-r' : ''} ${index >= metricGroups.length - 2 ? 'md:border-b-0' : ''}`}
                >
                  <div className="min-w-0">
                    <p className="text-[16px] font-bold text-[#222222]">{group.title}</p>
                    <p className="mt-1 truncate text-sm text-[#6a6a6a]">{firstMeasuredLabel(latest, group.keys)}</p>
                  </div>
                  <span className={`shrink-0 whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-bold leading-5 ${statusTone(status)}`}>{statusLabel(status)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-[10px] border border-[#d8dde5] bg-white p-7">
          <h2 className="text-[22px] font-bold text-[#222222]">결과를 읽는 방법</h2>
          <div className="mt-4 divide-y divide-[#ebebeb]">
            {[
              ['정상 기준', '연령대 평균이 아니라 검진 기준 범위를 먼저 확인합니다.'],
              ['변화 흐름', '한 번의 수치보다 여러 해의 흐름을 함께 보는 것이 좋습니다.'],
              ['확인 필요', '반복해서 기준을 벗어나면 의료진 상담을 고려하세요.'],
            ].map(([title, desc]) => (
              <div key={title} className="py-4">
                <p className="font-bold text-[#222222]">{title}</p>
                <p className="mt-1 text-sm leading-6 text-[#3f3f3f]">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <MedicalNotice />
    </div>
  );
}




