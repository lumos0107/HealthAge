// 데모 계정 오프라인 업로드용 값 변환 테스트.
// data.ts의 최신 회차(2024년) 값이 백엔드 OCR 응답과 같은 모양으로 나오는지,
// 그 결과가 검수 화면(ocrResultToFields)을 통과해 빈 칸 없이 채워지는지 확인한다.
import { describe, expect, it, vi } from 'vitest';
import { demoAnalyze, demoOcrResult, demoUploadCheckup } from './demoUpload';

// health.ts는 './api'(AsyncStorage/Supabase 네이티브 모듈)를 가져오므로,
// ocrFields.test.ts와 같은 방식으로 빈 껍데기로 갈아끼운다 — 이 테스트가 보는
// ocrResultToFields는 순수 변환이라 api 쪽 실제 구현은 필요 없다.
vi.mock('./api', () => ({
  supabase: {},
  supabaseConfigured: false,
  getAccessToken: async () => null,
  apiFetch: async () => ({}),
}));

const { ocrResultToFields } = await import('./health');

describe('demoOcrResult', () => {
  it('검진일과 기관이 2024년 회차와 같다', () => {
    const result = demoOcrResult();
    expect(result.ocr.meta?.exam_date).toBe('2024-03-15');
    expect(result.ocr.meta?.hospital).toBe('서울대병원 강남센터');
  });

  it('2024년 회차의 검사 수치를 ocrTemplate id로 담는다', () => {
    const result = demoOcrResult();
    const m = result.ocr.measurements!;
    expect(m.height?.value).toBe(165.9);
    expect(m.weight?.value).toBe(69.4);
    expect(m.waist?.value).toBe(88);
    expect(m.sbp?.value).toBe(134);
    expect(m.dbp?.value).toBe(85);
    expect(m.fbs?.value).toBe(110);
    expect(m.hb?.value).toBe(15.1);
    expect(m.total_cholesterol?.value).toBe(216);
    expect(m.hdl?.value).toBe(39);
    expect(m.tg?.value).toBe(168);
    expect(m.ldl?.value).toBe(145);
    expect(m.creatinine?.value).toBe(0.99);
    expect(m.ast?.value).toBe(27);
    expect(m.alt?.value).toBe(33);
    expect(m.ggt?.value).toBe(64);
  });

  it('urineProtein 코드 1을 문자열 정상으로 변환한다', () => {
    const result = demoOcrResult();
    expect(result.ocr.measurements!.urine_protein?.value).toBe('정상');
  });

  it('경고가 없다', () => {
    expect(demoOcrResult().warnings).toEqual([]);
  });
});

describe('demoOcrResult → ocrResultToFields', () => {
  it('필수 항목을 포함해 모든 칸이 빈 값 없이 채워진다', () => {
    const fields = ocrResultToFields(demoOcrResult().ocr);
    for (const f of fields) {
      expect(f.value, `${f.id} 칸이 비어 있음`).not.toBe('');
    }
  });
});

describe('demoUploadCheckup', () => {
  it('demoOcrResult와 같은 값을 돌려준다', async () => {
    const result = await demoUploadCheckup(0);
    expect(result).toEqual(demoOcrResult());
  });
});

describe('demoAnalyze', () => {
  it('medications_known이 true인 성공 응답을 돌려준다', async () => {
    const result = await demoAnalyze(0);
    expect(result.saved).toBe(true);
    expect(result.medications_known).toBe(true);
    expect(result.warnings).toEqual([]);
  });
});
