import type { ReactNode } from 'react';
import type { Status } from '../api/types';

export function Card({ title, sub, children, className = '' }: {
  title?: string; sub?: string; children: ReactNode; className?: string;
}) {
  return (
    <section className={`rounded-2xl bg-white ring-1 ring-slate-200 p-6 ${className}`}>
      {title && <h3 className="text-base font-bold text-slate-900">{title}</h3>}
      {sub && <p className="mt-1 text-sm text-slate-500 leading-relaxed">{sub}</p>}
      {(title || sub) && <div className="h-4" />}
      {children}
    </section>
  );
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <header className="mb-6">
      <h2 className="text-2xl font-bold text-slate-900">{children}</h2>
      {sub && <p className="mt-1.5 text-sm text-slate-500">{sub}</p>}
    </header>
  );
}

const STATUS_STYLE: Record<Status, string> = {
  정상: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  주의: 'bg-amber-50 text-amber-700 ring-amber-200',
  위험: 'bg-rose-50 text-rose-700 ring-rose-200',
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${STATUS_STYLE[status]}`}>
      {status}
    </span>
  );
}

/** 계산기·지방간지수의 level 배지. info는 판정이 아니라 정보이므로 중립 회색을 쓴다. */
const LEVEL_STYLE: Record<string, string> = {
  low: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  intermediate: 'bg-amber-50 text-amber-700 ring-amber-200',
  borderline: 'bg-amber-50 text-amber-700 ring-amber-200',
  high: 'bg-rose-50 text-rose-700 ring-rose-200',
  very_high: 'bg-rose-100 text-rose-800 ring-rose-300',
  info: 'bg-slate-100 text-slate-600 ring-slate-200',
};
const LEVEL_TEXT: Record<string, string> = {
  low: '낮음', intermediate: '중간', borderline: '경계',
  high: '높음', very_high: '매우 높음', info: '참고',
};

export function LevelBadge({ level }: { level?: string }) {
  if (!level) return null;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${LEVEL_STYLE[level] ?? LEVEL_STYLE.info}`}>
      {LEVEL_TEXT[level] ?? level}
    </span>
  );
}

export function KV({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-500 shrink-0">{label}</span>
      <span className="text-sm font-semibold text-slate-900 tabular-nums text-right">
        {value}
        {hint && <span className="ml-2 font-normal text-slate-400">{hint}</span>}
      </span>
    </div>
  );
}

export function EmptyState({ title, desc, action }: { title: string; desc: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-14 text-center">
      <p className="text-base font-semibold text-slate-700">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">{desc}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl bg-rose-50 ring-1 ring-rose-200 px-5 py-4">
      <p className="text-sm font-semibold text-rose-800">불러오지 못했어요</p>
      <p className="mt-1 text-sm text-rose-700 break-all">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-3 rounded-lg bg-rose-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-rose-700">
          다시 시도
        </button>
      )}
    </div>
  );
}

export function Loading({ label = '불러오는 중…' }: { label?: string }) {
  return <p className="py-10 text-center text-sm text-slate-400">{label}</p>;
}

export function Stepper({ label, value, min, max, step = 1, unit, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit: string;
  onChange: (v: number) => void;
}) {
  const round = (v: number) => Math.round(v * 10) / 10;
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-sm font-medium text-slate-600">{label}</span>
      <div className="flex items-center gap-3">
        <button onClick={() => onChange(round(Math.max(min, value - step)))}
          className="h-8 w-8 rounded-full ring-1 ring-slate-300 text-slate-600 hover:bg-slate-50">−</button>
        <span className="min-w-[72px] text-center text-sm font-bold text-slate-900 tabular-nums">
          {value}<span className="ml-0.5 font-medium text-slate-400">{unit}</span>
        </span>
        <button onClick={() => onChange(round(Math.min(max, value + step)))}
          className="h-8 w-8 rounded-full ring-1 ring-slate-300 text-slate-600 hover:bg-slate-50">+</button>
      </div>
    </div>
  );
}
