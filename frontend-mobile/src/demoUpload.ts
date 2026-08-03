// 데모 계정 전용 오프라인 업로드 경로.
// 시연 중 인터넷이 없을 때, 검진지 업로드→인식→검수→저장 흐름을
// 실제 백엔드(POST /uploads, POST /analyze) 없이 재현한다.
// 값은 하드코딩하지 않고 reports의 최신 회차에서 파생시킨다 — 값은
// 항상 data.ts와 일치하고, 앱과 시연용 검진 결과지(tools/demo_checkup_2024.html)가
// 어긋나면 아래 demoOcrResult 테스트가 깨진다.
import { reports } from './data';
import type { RealAnalyzeResult, RealOcrResult } from './health';

const latest = reports[reports.length - 1];

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function demoOcrResult(): RealOcrResult {
  const v = latest.values;
  return {
    ocr: {
      meta: { exam_date: latest.date, hospital: latest.hospital },
      measurements: {
        height: { value: v.height, unit: 'cm' },
        weight: { value: v.weight, unit: 'kg' },
        waist: { value: v.waist, unit: 'cm' },
        sbp: { value: v.sbp, unit: 'mmHg' },
        dbp: { value: v.dbp, unit: 'mmHg' },
        hb: { value: v.hemoglobin, unit: 'g/dL' },
        fbs: { value: v.glucose, unit: 'mg/dL' },
        total_cholesterol: { value: v.totalCholesterol, unit: 'mg/dL' },
        hdl: { value: v.hdl, unit: 'mg/dL' },
        tg: { value: v.triglyceride, unit: 'mg/dL' },
        ldl: { value: v.ldl, unit: 'mg/dL' },
        creatinine: { value: v.creatinine, unit: 'mg/dL' },
        urine_protein: { value: v.urineProtein === 1 ? '정상' : String(v.urineProtein) },
        ast: { value: v.ast, unit: 'IU/L' },
        alt: { value: v.alt, unit: 'IU/L' },
        ggt: { value: v.ggt, unit: 'IU/L' },
      },
      lifestyle: {},
    },
    warnings: [],
  };
}

export async function demoUploadCheckup(delayMs = 1500): Promise<RealOcrResult> {
  await wait(delayMs);
  return demoOcrResult();
}

export async function demoAnalyze(delayMs = 800): Promise<RealAnalyzeResult> {
  await wait(delayMs);
  return {
    basic_report: {},
    comprehensive: {},
    recommendations: {},
    medications_known: true,
    saved: true,
    saved_paths: null,
    warnings: [],
  };
}
