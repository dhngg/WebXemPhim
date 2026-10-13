import { env } from '@/lib/env';
import { ApiError } from './ApiError';
import { accessTokenStore } from './accessToken';
import type { ApiErrorBody } from '@/types/api';

export type Query = Record<string, string | number | boolean | undefined | null | string[]>;

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
  /** Không tự refresh + gửi lại khi 401 (dùng cho login/register/refresh/logout). */
  skipAuthRefresh?: boolean;
}

/**
 * Endpoint refresh DỰ KIẾN — chưa chốt với backend.
 * Kỳ vọng: POST, đọc refresh token từ cookie HttpOnly, trả `{ accessToken }` và rotate cookie.
 */
export const REFRESH_PATH = '/auth/refresh';

function buildUrl(path: string, query?: Query): string {
  const url = new URL(`${env.apiBaseUrl}${path}`, window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(key, v));
      else url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

const networkError = () => new ApiError({ statusCode: 0, message: 'Không thể kết nối máy chủ. Vui lòng kiểm tra mạng.' });

async function send(method: string, path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = accessTokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    return await fetch(buildUrl(path, options.query), {
      method,
      // Gửi kèm cookie refresh HttpOnly. Cấu hình CORS/SameSite/CSRF cần chốt với backend.
      credentials: 'include',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw networkError();
  }
}

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Lấy access token mới bằng refresh cookie. Single-flight: nhiều request 401 cùng lúc
 * chỉ gọi refresh MỘT lần (tránh refresh-token reuse bị backend coi là tấn công).
 */
export function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await send('POST', REFRESH_PATH, { skipAuthRefresh: true });
        if (!res.ok) {
          accessTokenStore.clear();
          return false;
        }
        const data = (await res.json().catch(() => null)) as { accessToken?: string } | null;
        if (!data?.accessToken) {
          accessTokenStore.clear();
          return false;
        }
        accessTokenStore.set(data.accessToken);
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function toResult<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const body = (data ?? {}) as Partial<ApiErrorBody>;
    throw new ApiError({
      statusCode: response.status,
      message: body.message ?? 'Đã có lỗi xảy ra.',
      code: body.code,
      fieldErrors: body.fieldErrors,
    });
  }
  return data as T;
}

/**
 * HttpClient dùng chung (fetch).
 * - Access token: header `Authorization: Bearer` lấy từ bộ nhớ.
 * - Gặp 401: refresh một lần rồi gửi lại request ĐÚNG MỘT lần. Request bị 401 chưa được
 *   backend xử lý nên gửi lại là an toàn kể cả POST. Không có retry nào khác ở tầng này.
 * - Refresh thất bại: xóa token, ném 401 → UI hiện “Phiên đăng nhập đã hết hạn”.
 */
async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  let response = await send(method, path, options);
  if (response.status === 401 && !options.skipAuthRefresh) {
    const refreshed = await refreshAccessToken();
    if (refreshed) response = await send(method, path, options);
  }
  return toResult<T>(response);
}

export const httpClient = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('POST', path, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PATCH', path, { ...options, body }),
  delete: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, options),
};
