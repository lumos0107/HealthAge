import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import type { ReactNode } from 'react';

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-[28px] font-bold leading-[1.43] text-[#222222]">{title}</h1>
        {description && <p className="mt-2 max-w-4xl text-[16px] leading-6 text-[#3f3f3f]">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[10px] border border-[#d8dde5] bg-white ${className}`}>{children}</section>;
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'blue' | 'teal' | 'amber' | 'rose' }) {
  const tones = {
    slate: 'border-[#d8dde5] bg-[#f7f8fa] text-[#5f6672]',
    blue: 'border-blue-200 bg-blue-50 text-blue-800',
    teal: 'border-[#c9d7f4] bg-[#f2f6ff] text-[#2457c5]',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    rose: 'border-rose-200 bg-rose-50 text-rose-800',
  };
  return <span className={`inline-flex items-center whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export function MedicalNotice() {
  return (
    <div className="border-y border-[#ebebeb] bg-white px-5 py-4 text-[15px] leading-7 text-[#3f3f3f]">
      <div className="flex items-start gap-2.5">
        <Info className="mt-1 h-4 w-4 shrink-0 text-[#929292]" />
        <p className="max-w-none">
          이 화면은 건강검진 수치를 이해하기 위한 참고 정보입니다. 증상, 복용 약물, 과거력, 검진기관 기준에 따라 해석이 달라질 수 있으며 의학적 진단이나 치료 판단을 대체하지 않습니다.
        </p>
      </div>
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-[#d8dde5] bg-white px-6 py-14 text-center">
      <CheckCircle2 className="mx-auto h-9 w-9 text-[#d6dbe0]" />
      <h2 className="mt-4 text-xl font-bold text-[#222222]">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-[15px] leading-6 text-[#6a6a6a]">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex max-w-md items-start gap-3 rounded-[10px] border border-[#d8dde5] bg-white px-4 py-3 text-sm text-[#222222] shadow-[0_8px_22px_rgba(20,33,61,0.08)]">
      <AlertTriangle className="mt-0.5 h-4 w-4 text-[#2457c5]" />
      <span className="leading-6">{message}</span>
      <button type="button" onClick={onClose} className="ml-2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-11 items-center justify-center rounded-md bg-[#2457c5] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1d469f] disabled:cursor-not-allowed disabled:bg-[#c9d7f4] disabled:opacity-100 ${props.className ?? ''}`}
    />
  );
}

export function SecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-10 items-center justify-center rounded-md border border-[#9aa4b2] bg-white px-4 py-2 text-sm font-semibold text-[#222222] hover:bg-[#f7f8fa] disabled:cursor-not-allowed disabled:opacity-50 ${props.className ?? ''}`}
    />
  );
}



