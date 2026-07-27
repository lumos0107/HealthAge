import { useState } from 'react';
import type { AppData } from '../App';
import * as api from '../api/endpoints';
import { Card, EmptyState, KV, SectionTitle, StatusBadge } from '../components/UI';
import { fmt } from '../lib/format';

/** 상세 패널 표시 항목 — 브리프 지정 순서 고정. checkup(DB 컬럼) 키와 1:1. */
const DETAIL_FIELDS: { label: string; key: string; unit?: string }[] = [
  { label: '신장', key: 'height_cm', unit: 'cm' },
  { label: '체중', key: 'weight_kg', unit: 'kg' },
  { label: 'BMI', key: 'bmi', unit: 'kg/m²' },
  { label: '허리둘레', key: 'waist_cm', unit: 'cm' },
  { label: '수축기혈압', key: 'sbp', unit: 'mmHg' },
  { label: '이완기혈압', key: 'dbp', unit: 'mmHg' },
  { label: '공복혈당', key: 'fbs', unit: 'mg/dL' },
  { label: '총콜레스테롤', key: 'total_cholesterol', unit: 'mg/dL' },
  { label: 'LDL', key: 'ldl', unit: 'mg/dL' },
  { label: 'HDL', key: 'hdl', unit: 'mg/dL' },
  { label: '중성지방', key: 'tg', unit: 'mg/dL' },
  { label: 'AST', key: 'ast', unit: 'IU/L' },
  { label: 'ALT', key: 'alt', unit: 'IU/L' },
  { label: '감마GTP', key: 'ggt', unit: 'IU/L' },
  { label: '크레아티닌', key: 'creatinine', unit: 'mg/dL' },
  { label: '요단백', key: 'urine_protein' },
];

function downloadJson(payload: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function RecordsSection({ data }: { data: AppData }) {
  const { userId, reports, raw, reload } = data;
  const [openYear, setOpenYear] = useState<number | null>(null);
  const [busyYear, setBusyYear] = useState<number | null>(null);

  if (reports.length === 0) {
    return (
      <>
        <SectionTitle sub="저장된 회차의 원본 값입니다.">검진 기록</SectionTitle>
        <EmptyState title="아직 저장된 검진이 없어요" desc="업로드·입력에서 검진지를 올리면 여기 기록이 쌓여요" />
      </>
    );
  }

  const openReport = openYear != null ? raw.find((r) => r.year === openYear) ?? null : null;

  const handleDelete = async (year: number) => {
    if (!window.confirm(`${year}년 검진 기록을 삭제할까요? 되돌릴 수 없어요.`)) return;
    setBusyYear(year);
    try {
      await api.deleteReport(userId, year);
      if (openYear === year) setOpenYear(null);
      await reload();
    } finally {
      setBusyYear(null);
    }
  };

  return (
    <>
      <SectionTitle sub="저장된 회차의 원본 값입니다.">검진 기록</SectionTitle>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-2 pr-3 font-medium">검진연도</th>
                <th className="py-2 pr-3 font-medium">검진일</th>
                <th className="py-2 pr-3 font-medium">의료기관</th>
                <th className="py-2 pr-3 font-medium">상태</th>
                <th className="py-2 pr-3 font-medium">요약</th>
                <th className="py-2 font-medium print-hide">작업</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.year} className="border-b border-slate-100 last:border-0 align-top">
                  <td className="py-3 pr-3 font-semibold text-slate-900 tabular-nums">{r.year}</td>
                  <td className="py-3 pr-3 text-slate-600 tabular-nums">{r.date}</td>
                  <td className="py-3 pr-3 text-slate-600">{r.hospital}</td>
                  <td className="py-3 pr-3"><StatusBadge status={r.status} /></td>
                  <td className="py-3 pr-3 max-w-xs text-slate-600">{r.summary}</td>
                  <td className="py-3 print-hide">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setOpenYear(openYear === r.year ? null : r.year)}
                        className="rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ring-slate-300 text-slate-700 hover:bg-slate-50"
                      >
                        {openYear === r.year ? '접기' : '자세히 보기'}
                      </button>
                      <button
                        onClick={() => {
                          const payload = raw.find((x) => x.year === r.year);
                          if (payload) downloadJson(payload, `checkup-${r.year}.json`);
                        }}
                        className="rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ring-slate-300 text-slate-700 hover:bg-slate-50"
                      >
                        JSON 다운로드
                      </button>
                      <button
                        onClick={() => void handleDelete(r.year)}
                        disabled={busyYear === r.year}
                        className="rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ring-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                      >
                        {busyYear === r.year ? '삭제 중…' : '삭제'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {openReport && (
        <Card title={`${openReport.year}년 상세`} className="print-page mt-4">
          <button
            onClick={() => window.print()}
            className="print-hide mb-4 rounded-lg bg-slate-900 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            인쇄 / PDF로 저장
          </button>
          {DETAIL_FIELDS.map((f) => (
            <KV key={f.key} label={f.label} value={fmt(openReport.checkup?.[f.key], f.unit)} />
          ))}
          <div className="mt-6 space-y-0.5 border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-500">
            <p>이 문서는 건강검진 수치를 정리한 참고 자료입니다.</p>
            <p>진단서·소견서가 아니며, 참고 점수는 이 서비스의 자체 지표입니다.</p>
            <p>의학적 판단은 의료진과 상의하세요.</p>
          </div>
        </Card>
      )}
    </>
  );
}
