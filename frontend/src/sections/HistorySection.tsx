import type { AppData } from '../App';
import { SectionTitle } from '../components/UI';

export function HistorySection({ data }: { data: AppData }) {
  return (
    <>
      <SectionTitle sub="회차별 변화와 또래 대비 변화 속도입니다.">히스토리</SectionTitle>
      <p className="text-sm text-slate-400">준비 중</p>
    </>
  );
}
