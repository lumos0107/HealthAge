import type { AppData } from '../App';
import { SectionTitle } from '../components/UI';

export function UploadSection({ data }: { data: AppData }) {
  return (
    <>
      <SectionTitle sub="검진지 사진을 올리거나 값을 직접 입력합니다.">업로드·입력</SectionTitle>
      <p className="text-sm text-slate-400">준비 중</p>
    </>
  );
}
