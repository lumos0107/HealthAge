import type { AppData } from '../App';
import { SectionTitle } from '../components/UI';

export function RecordsSection({ data }: { data: AppData }) {
  return (
    <>
      <SectionTitle sub="저장된 회차의 원본 값입니다.">검진 기록</SectionTitle>
      <p className="text-sm text-slate-400">준비 중</p>
    </>
  );
}
