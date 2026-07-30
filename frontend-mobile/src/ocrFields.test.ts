// OCR 응답 → 검수 화면 칸 자동입력 회귀 테스트.
//
// 픽스처는 지어낸 값이 아니라 실제 백엔드 호출 결과다:
//   합성 검진 결과지 1장 → POST /uploads (VISION_BACKEND=ollama, qwen2.5vl:7b-q8_0)
//   → 응답의 meta/measurements/measurements_confidence 그대로.
// 이미지에 적힌 16개 값과 OCR이 뽑은 값이 전부 일치했고(2026-07-30 확인),
// 이 테스트는 그 JSON이 UploadScreen의 칸으로 옳게 옮겨지는지를 고정한다.
import { describe, expect, it, vi } from 'vitest';

// health.ts → api.ts는 AsyncStorage(네이티브 모듈)를 끌어와 node에서 못 뜬다.
// 이 테스트가 보는 함수들은 순수 변환이라 api를 빈 껍데기로 갈아끼운다.
vi.mock('./api', () => ({
  supabase: {},
  supabaseConfigured: false,
  getAccessToken: async () => null,
  apiFetch: async () => ({}),
}));

const { ocrResultToFields, fieldsToOcrResult } = await import('./health');

const REAL_OCR = {
  meta: {
    source_images: ['sheet.png'], page_count: 1,
    exam_date: '2025-03-14', patient_birth: null, patient_gender: null,
    patient_name: '홍길동', hospital: '제주대학교병원 건강증진센터',
    ocr_confidence: 0.9, extraction_rate: 0.89,
  },
  measurements: {
    height: { value: 172.4, unit: 'cm' },
    weight: { value: 81.6, unit: 'kg' },
    waist: { value: 94.5, unit: 'cm' },
    sbp: { value: 142, unit: 'mmHg' },
    dbp: { value: 91, unit: 'mmHg' },
    fbs: { value: 118, unit: 'mg/dL' },
    hb: { value: 15.2, unit: 'g/dL' },
    creatinine: { value: 1.05, unit: 'mg/dL' },
    urine_protein: { value: '음성', code: 1 },
    total_cholesterol: { value: 228, unit: 'mg/dL' },
    ldl: { value: 151, unit: 'mg/dL' },
    hdl: { value: 38, unit: 'mg/dL' },
    tg: { value: 196, unit: 'mg/dL' },
    ast: { value: 37, unit: 'IU/L' },
    alt: { value: 52, unit: 'IU/L' },
    ggt: { value: 78, unit: 'IU/L' },
  },
  measurements_confidence: {
    height: { confidence: 0.95, flags: [] },
    ggt: { confidence: 0.9, flags: [] },
  },
};

// 결과지 이미지에 적힌 값 = 칸에 들어와야 하는 문자열
const EXPECTED: Record<string, string> = {
  exam_date: '2025-03-14',
  hospital: '제주대학교병원 건강증진센터',
  height: '172.4', weight: '81.6', waist: '94.5',
  sbp: '142', dbp: '91', fbs: '118',
  total_cholesterol: '228', hdl: '38', tg: '196', ldl: '151',
  hb: '15.2', creatinine: '1.05',
  ast: '37', alt: '52', ggt: '78',
  urine_protein: '음성',
};

describe('ocrResultToFields — 사진의 수치가 칸에 그대로 들어오는지', () => {
  const fields = ocrResultToFields(REAL_OCR as any);
  const byId = new Map(fields.map((f) => [f.id, f]));

  it.each(Object.entries(EXPECTED))('%s 칸에 %s가 채워진다', (id, want) => {
    expect(byId.get(id)?.value).toBe(want);
  });

  it('검수 화면의 칸을 하나도 빠뜨리지 않는다 — 빈 칸 0개', () => {
    // 이 결과지에서는 ocrTemplate의 모든 칸이 채워졌다. 템플릿에 칸이 늘어나면
    // 여기서 먼저 걸려, 자동입력이 안 되는 칸이 조용히 생기는 것을 막는다.
    expect(fields.map((f) => f.id).sort()).toEqual(Object.keys(EXPECTED).sort());
    expect(fields.filter((f) => f.value === '')).toEqual([]);
  });

  it('확신도가 내려온 항목만 confidence를 갖는다 — 없는 값을 만들지 않는다', () => {
    expect(byId.get('height')?.confidence).toBe(0.95);
    expect(byId.get('ggt')?.confidence).toBe(0.9);
    expect(byId.get('hdl')?.confidence).toBeUndefined();
    // 검진일·검진기관은 항목별 확신도가 없는 자리다.
    expect(byId.get('exam_date')?.confidence).toBeUndefined();
  });
});

describe('fieldsToOcrResult — 사용자가 고친 값이 되돌아가는지', () => {
  it('수정한 칸은 숫자로, meta는 meta 자리로 되돌아간다', () => {
    const fields = ocrResultToFields(REAL_OCR as any).map((f) =>
      f.id === 'waist' ? { ...f, value: '92' } : f);
    const back = fieldsToOcrResult(fields, REAL_OCR as any);
    expect(back.measurements?.waist?.value).toBe(92);
    expect(back.measurements?.sbp?.value).toBe(142);
    expect(back.meta?.exam_date).toBe('2025-03-14');
    // 손대지 않은 다른 영역(환자명 등)은 보존된다.
    expect(back.meta?.patient_name).toBe('홍길동');
  });

  it('빈 칸은 null로 보내 "미측정"과 0을 구분한다', () => {
    const fields = ocrResultToFields(REAL_OCR as any).map((f) =>
      f.id === 'ggt' ? { ...f, value: '' } : f);
    const back = fieldsToOcrResult(fields, REAL_OCR as any);
    expect(back.measurements?.ggt?.value).toBeNull();
  });
});
