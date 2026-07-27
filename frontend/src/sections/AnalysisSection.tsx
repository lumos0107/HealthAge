import type { AppData } from '../App';
import { SectionTitle } from '../components/UI';

export function AnalysisSection({ data }: { data: AppData }) {
  return (
    <>
      <SectionTitle sub="검진 수치로 계산한 참고 지표입니다. 진단이 아닙니다.">종합 분석</SectionTitle>
      <p className="text-sm text-slate-400">준비 중</p>
    </>
  );
}
