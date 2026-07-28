import { getAccessToken } from './supabaseClient';

export const API_BASE_URL =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? 'http://127.0.0.1:8000';

/** 백엔드 에러 응답을 사람이 읽을 수 있는 한 줄로 정규화한다. */
async function toError(res: Response): Promise<Error> {
  const text = await res.text().catch(() => '');
  let detail = text;
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed?.detail === 'string') detail = parsed.detail;
  } catch {
    // JSON이 아니면 원문 그대로 쓴다
  }
  return new Error(`${res.status} ${res.statusText}${detail ? ` - ${detail}` : ''}`);
}

/** JSON API 호출. Supabase 토큰을 자동으로 붙인다. */
export async function apiFetch(path: string, init?: RequestInit): Promise<any> {
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw await toError(res);
  // 204 No Content(회원탈퇴 DELETE 등)는 본문이 없어 json() 파싱이 실패한다.
  if (res.status === 204) return null;
  return res.json();
}

/** multipart 업로드. Content-Type은 브라우저가 boundary와 함께 자동으로 넣게 둔다. */
export async function apiUpload(path: string, form: FormData): Promise<any> {
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form,
  });
  if (!res.ok) throw await toError(res);
  return res.json();
}
