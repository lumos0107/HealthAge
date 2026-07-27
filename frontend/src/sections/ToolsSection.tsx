import type { AppData } from '../App';
import { SectionTitle } from '../components/UI';

export function ToolsSection({ data }: { data: AppData }) {
  return (
    <>
      <SectionTitle sub="투약이력·검사항목 참고치·신장기능 계산기입니다.">도구·참고</SectionTitle>
      <p className="text-sm text-slate-400">준비 중</p>
    </>
  );
}
