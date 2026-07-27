import type { AppData } from '../App';
import { SectionTitle } from '../components/UI';

export function ProfileSection({ data }: { data: AppData }) {
  return (
    <>
      <SectionTitle sub="프로필과 검진 알림을 관리합니다.">내 정보</SectionTitle>
      <p className="text-sm text-slate-400">준비 중</p>
    </>
  );
}
