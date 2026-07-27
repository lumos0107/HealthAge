import type { AppData } from '../App';
import { SectionTitle } from '../components/UI';

export function DashboardSection({ data }: { data: AppData }) {
  return (
    <>
      <SectionTitle sub="가장 최근 검진 기준 요약입니다.">대시보드</SectionTitle>
      <p className="text-sm text-slate-400">준비 중</p>
    </>
  );
}
