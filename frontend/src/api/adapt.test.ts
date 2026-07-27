import { describe, expect, it } from 'vitest';
import { METRIC_NAME_TO_KEY, adaptReport, statusFromBackend } from './adapt';
import type { RealReportPayload } from './types';

describe('METRIC_NAME_TO_KEY', () => {
  // 24번 §3 버그 #2 — 백엔드 실제 명칭 4개가 맵에 없어 실계정 화면에서 항목이 통째로 사라졌다.
  it('백엔드가 실제로 내려주는 한글 명칭을 모두 매핑한다', () => {
    expect(METRIC_NAME_TO_KEY['식전혈당(공복혈당)']).toBe('glucose');
    expect(METRIC_NAME_TO_KEY['트리글리세라이드']).toBe('triglyceride');
    expect(METRIC_NAME_TO_KEY['혈청지오티(AST)']).toBe('ast');
    expect(METRIC_NAME_TO_KEY['혈청지피티(ALT)']).toBe('alt');
  });
});

describe('statusFromBackend', () => {
  it('normal 계열은 정상', () => {
    expect(statusFromBackend('normal')).toBe('정상');
    expect(statusFromBackend('normal_good')).toBe('정상');
    expect(statusFromBackend('info')).toBe('정상');
  });
  it('caution/high/low는 주의', () => {
    expect(statusFromBackend('caution')).toBe('주의');
    expect(statusFromBackend('high')).toBe('주의');
    expect(statusFromBackend('low')).toBe('주의');
  });
  it('very_/extremely_ 계열은 위험', () => {
    expect(statusFromBackend('very_high')).toBe('위험');
    expect(statusFromBackend('extremely_low')).toBe('위험');
  });
});

function payload(evals: any[]): RealReportPayload {
  return {
    user_id: 'u1',
    year: 2024,
    checkup: { exam_date: '2024-03-11', hospital: '서울내과' },
    basic_report: { summary: '요약문' },
    comprehensive: {
      summary: {
        total_metrics: evals.length, risk_count: 0, warning_count: 0,
        normal_count: 0, elderly_warning_count: 0,
        risk_score: 72.4, overall_status: '관리 필요',
      },
      all_evaluations: evals,
    },
  } as RealReportPayload;
}

const ev = (metric: string, value: number, status: string) => ({
  metric, value, status, label: '', icon: '', color: '',
  meaning: '', direction: 'high_bad', unit: 'mg/dL',
});

describe('adaptReport', () => {
  it('평가 항목을 values·statusByKey로 펼친다', () => {
    const r = adaptReport(payload([
      ev('식전혈당(공복혈당)', 112, 'high'),
      ev('수축기혈압', 138, 'normal'),
    ]));
    expect(r.values.glucose).toBe(112);
    expect(r.statusByKey.glucose).toBe('주의');
    expect(r.values.sbp).toBe(138);
    expect(r.statusByKey.sbp).toBe('정상');
  });

  it('manageCount·trackCount를 백엔드 status로 센다', () => {
    const r = adaptReport(payload([
      ev('수축기혈압', 138, 'high'),
      ev('이완기혈압', 92, 'low'),
      ev('중성지방', 480, 'very_high'),
      ev('HDL콜레스테롤', 60, 'normal'),
    ]));
    expect(r.manageCount).toBe(2);
    expect(r.trackCount).toBe(1);
  });

  it('score는 백엔드 risk_score를 반올림해 그대로 쓴다(프론트 재계산 금지)', () => {
    expect(adaptReport(payload([])).score).toBe(72);
  });

  it('맵에 없는 명칭은 조용히 건너뛴다(화면을 깨뜨리지 않는다)', () => {
    const r = adaptReport(payload([ev('처음보는항목', 1, 'high')]));
    expect(Object.keys(r.values)).toHaveLength(0);
    expect(r.manageCount).toBe(1); // 카운트는 전체 평가 기준이라 유지된다
  });

  it('검진일·기관이 없으면 연도 기본값과 빈 문자열로 채운다', () => {
    const p = payload([]);
    p.checkup = {};
    const r = adaptReport(p);
    expect(r.date).toBe('2024-01-01');
    expect(r.hospital).toBe('');
  });
});
