import { apiFetch, apiUpload } from './client';
import type {
  Profile, RealAnalyzeResult, RealEgfr, RealMedicationUploadResult,
  RealOcrResult, RealReportPayload, RealSimulation, RealTimeseries,
  ReferenceEvaluateResponse, SimulateChanges,
} from './types';
import type { MedicationItem } from './types';

// ── health (2) ──────────────────────────────────────────────────────────
export const getRoot = () => apiFetch('/');
export const getHealth = () => apiFetch('/health');

// ── auth (1) ────────────────────────────────────────────────────────────
export const getMe = () => apiFetch('/auth/me');

// ── users (5) ───────────────────────────────────────────────────────────
export const listUsers = (): Promise<Profile[]> => apiFetch('/users');
export const getUser = (userId: string): Promise<Profile> => apiFetch(`/users/${userId}`);
export const createUser = (body: Partial<Profile>): Promise<Profile> =>
  apiFetch('/users', { method: 'POST', body: JSON.stringify(body) });
export const patchUser = (userId: string, body: Partial<Profile>): Promise<Profile> =>
  apiFetch(`/users/${userId}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteUser = (userId: string): Promise<null> =>
  apiFetch(`/users/${userId}`, { method: 'DELETE' });

// ── uploads · analysis (6) ──────────────────────────────────────────────
export function uploadCheckupImage(file: File): Promise<RealOcrResult> {
  const form = new FormData();
  form.append('file', file);
  return apiUpload('/uploads', form);
}
export const analyzeCheckup = (ocr: RealOcrResult['ocr'], save: boolean): Promise<RealAnalyzeResult> =>
  apiFetch('/analyze', { method: 'POST', body: JSON.stringify({ ocr, save }) });
export const simulateCheckup = (changes: SimulateChanges): Promise<RealSimulation> =>
  apiFetch('/analyze/simulate', { method: 'POST', body: JSON.stringify(changes) });
export const getReportYears = async (userId: string): Promise<number[]> =>
  (await apiFetch(`/reports/${userId}`))?.years ?? [];
export const getReportByYear = (userId: string, year: number): Promise<RealReportPayload> =>
  apiFetch(`/reports/${userId}/${year}`);
export const getLatestComprehensive = (userId: string): Promise<RealReportPayload> =>
  apiFetch(`/reports/${userId}/comprehensive/latest`);
export const deleteReport = (userId: string, year: number): Promise<null> =>
  apiFetch(`/reports/${userId}/${year}`, { method: 'DELETE' });

// ── timeseries (2) ──────────────────────────────────────────────────────
/**
 * GET /timeseries/{id}는 DB 행(timeseries_data·insights 컬럼)을 그대로 준다.
 * 언랩하지 않으면 insight·highlights·change_pace가 전부 undefined가 된다.
 * (24번 §3 버그 #1 — 모바일에서 잡은 것과 같은 함정)
 * 회차가 2년 미만이면 404 → null로 돌려 화면이 "데이터 부족"으로 처리하게 한다.
 */
export async function getTimeseries(userId: string): Promise<RealTimeseries | null> {
  try {
    const row = await apiFetch(`/timeseries/${userId}`);
    if (!row) return null;
    const body = row.timeseries_data ?? row;
    return { ...body, insight: body.insight ?? row.insights ?? null };
  } catch {
    return null;
  }
}
export async function refreshTimeseries(): Promise<void> {
  try {
    await apiFetch('/timeseries/refresh', { method: 'POST' });
  } catch {
    // 회차 부족이면 백엔드가 available=false로 응답 — 화면은 "데이터 부족"으로 자연 처리된다.
  }
}

// ── medication (2) ──────────────────────────────────────────────────────
export function uploadMedicationFile(file: File, manualBirthday?: string): Promise<RealMedicationUploadResult> {
  const form = new FormData();
  form.append('file', file);
  if (manualBirthday) form.append('manual_birthday', manualBirthday);
  form.append('persist', 'true');
  return apiUpload('/medication/upload', form);
}
export const getMedications = (userId: string): Promise<MedicationItem[]> =>
  apiFetch(`/medication/${userId}`);

// ── reference (2) ───────────────────────────────────────────────────────
export const getReferenceItems = async (): Promise<string[]> =>
  (await apiFetch('/reference/items'))?.items ?? [];
export const evaluateReference = (
  sex: 'M' | 'F',
  items: { item: string; value: number; population_mean?: number | null }[],
): Promise<ReferenceEvaluateResponse> =>
  apiFetch('/reference/evaluate', { method: 'POST', body: JSON.stringify({ sex, items }) });

// ── renal (1) ───────────────────────────────────────────────────────────
export const calcEgfr = (
  serumCr: number, age: number, sex: 1 | 2, weightKg?: number | null,
): Promise<RealEgfr> =>
  apiFetch('/renal/egfr', {
    method: 'POST',
    body: JSON.stringify({
      serum_cr: serumCr, age, sex: sex === 2 ? 'female' : 'male',
      ...(typeof weightKg === 'number' && weightKg > 0 ? { weight_kg: weightKg } : {}),
    }),
  });
