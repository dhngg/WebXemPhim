import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { httpClient, REFRESH_PATH } from './httpClient';
import { accessTokenStore } from './accessToken';
import { ApiError } from './ApiError';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

type Call = { url: string; init: RequestInit };

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return handler(url, init);
    }),
  );
  return calls;
}

const authHeader = (c: Call) => (c.init.headers as Record<string, string>).Authorization;

describe('httpClient — access token trong memory + refresh cookie', () => {
  beforeEach(() => accessTokenStore.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('gắn Bearer token và luôn gửi credentials: include', async () => {
    accessTokenStore.set('t1');
    const calls = mockFetch(() => json(200, { ok: true }));
    await httpClient.get('/rooms');
    expect(authHeader(calls[0]!)).toBe('Bearer t1');
    expect(calls[0]!.init.credentials).toBe('include');
  });

  it('401 → refresh một lần → gửi lại request với token mới', async () => {
    accessTokenStore.set('expired');
    const calls = mockFetch((url, init) => {
      if (url.endsWith(REFRESH_PATH)) return json(200, { accessToken: 'fresh' });
      const auth = (init.headers as Record<string, string>).Authorization;
      return auth === 'Bearer fresh' ? json(200, { id: 1 }) : json(401, { message: 'expired' });
    });
    await expect(httpClient.post('/payments', { amount: 1 })).resolves.toEqual({ id: 1 });
    expect(calls.map((c) => c.url.replace(/^.*\/api\/v1/, ''))).toEqual(['/payments', REFRESH_PATH, '/payments']);
    expect(accessTokenStore.get()).toBe('fresh');
  });

  it('nhiều request 401 đồng thời chỉ gọi refresh MỘT lần', async () => {
    accessTokenStore.set('expired');
    const calls = mockFetch(async (url, init) => {
      if (url.endsWith(REFRESH_PATH)) {
        await new Promise((r) => setTimeout(r, 10));
        return json(200, { accessToken: 'fresh' });
      }
      const auth = (init.headers as Record<string, string>).Authorization;
      return auth === 'Bearer fresh' ? json(200, {}) : json(401, {});
    });
    await Promise.all([httpClient.get('/a'), httpClient.get('/b'), httpClient.get('/c')]);
    expect(calls.filter((c) => c.url.endsWith(REFRESH_PATH))).toHaveLength(1);
  });

  it('refresh thất bại → xóa token, ném 401, không lặp vô hạn', async () => {
    accessTokenStore.set('expired');
    const calls = mockFetch(() => json(401, { message: 'Hết phiên' }));
    const err = await httpClient.get('/me').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(401);
    expect(accessTokenStore.get()).toBeNull();
    expect(calls).toHaveLength(2); // request gốc + refresh, không gửi lại
  });

  it('skipAuthRefresh: login sai mật khẩu không kích hoạt refresh', async () => {
    const calls = mockFetch(() => json(401, { message: 'Sai mật khẩu' }));
    await expect(httpClient.post('/auth/login', {}, { skipAuthRefresh: true })).rejects.toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(1);
  });

  it('lỗi 400 trả fieldErrors để form hiển thị theo field', async () => {
    mockFetch(() => json(400, { statusCode: 400, message: 'Invalid', fieldErrors: { endDate: 'Sai' } }));
    const err = (await httpClient.post('/contracts', {}).catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(400);
    expect(err.fieldErrors).toEqual({ endDate: 'Sai' });
  });
});

describe('httpClient — CSRF, refresh cookie, mã lỗi backend', () => {
  beforeEach(() => accessTokenStore.clear());
  afterEach(() => vi.unstubAllGlobals());

  const headersOf = (c: Call) => c.init.headers as Record<string, string>;

  it('thêm X-CSRF-Protection: 1 cho POST/PUT/PATCH/DELETE nhưng không cho GET', async () => {
    const calls = mockFetch(() => json(200, {}));
    await httpClient.get('/a');
    await httpClient.post('/a', {});
    await httpClient.put('/a', {});
    await httpClient.patch('/a', {});
    await httpClient.delete('/a');
    expect(calls.map((c) => c.init.method)).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
    expect(calls.map((c) => headersOf(c)['X-CSRF-Protection'])).toEqual([undefined, '1', '1', '1', '1']);
    expect(calls.every((c) => c.init.credentials === 'include')).toBe(true);
  });

  it('refresh là POST có CSRF header, đúng đường dẫn /api/v1/auth/refresh và nhận { accessToken }', async () => {
    accessTokenStore.set('expired');
    const calls = mockFetch((url, init) => {
      if (url.endsWith(REFRESH_PATH)) return json(200, { accessToken: 'fresh', expiresIn: 600, user: {} });
      return (init.headers as Record<string, string>).Authorization === 'Bearer fresh' ? json(200, {}) : json(401, {});
    });
    await httpClient.get('/x');
    const refresh = calls.find((c) => c.url.endsWith(REFRESH_PATH))!;
    expect(refresh.url).toMatch(/\/api\/v1\/auth\/refresh$/);
    expect(refresh.init.method).toBe('POST');
    expect(headersOf(refresh)['X-CSRF-Protection']).toBe('1');
    expect(headersOf(refresh).Authorization).toBe('Bearer expired');
  });

  it('409 TOKEN_ALREADY_ROTATED (tab khác thắng) → thử refresh lại đúng một lần với cookie mới', async () => {
    accessTokenStore.set('expired');
    let refreshCalls = 0;
    mockFetch((url, init) => {
      if (url.endsWith(REFRESH_PATH)) {
        refreshCalls += 1;
        return refreshCalls === 1 ? json(409, { statusCode: 409, code: 'TOKEN_ALREADY_ROTATED', message: 'x' }) : json(200, { accessToken: 'fresh' });
      }
      return (init.headers as Record<string, string>).Authorization === 'Bearer fresh' ? json(200, { ok: 1 }) : json(401, {});
    });
    await expect(httpClient.get('/x')).resolves.toEqual({ ok: 1 });
    expect(refreshCalls).toBe(2);
  });

  it('refresh bị từ chối (REFRESH_TOKEN_INVALID) → xóa token, 401, không vòng lặp', async () => {
    accessTokenStore.set('expired');
    const calls = mockFetch((url) =>
      url.endsWith(REFRESH_PATH) ? json(401, { statusCode: 401, code: 'REFRESH_TOKEN_INVALID', message: 'x' }) : json(401, { statusCode: 401, code: 'ACCESS_TOKEN_EXPIRED', message: 'x' }),
    );
    const err = (await httpClient.get('/x').catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(401);
    expect(accessTokenStore.get()).toBeNull();
    expect(calls).toHaveLength(2);
  });

  it('403 ACCOUNT_DISABLED không refresh và có thông báo rõ ràng', async () => {
    accessTokenStore.set('t');
    const calls = mockFetch(() => json(403, { statusCode: 403, code: 'ACCOUNT_DISABLED', message: 'x' }));
    const err = (await httpClient.get('/x').catch((e: unknown) => e)) as ApiError;
    expect(err.isForbidden).toBe(true);
    expect(err.message).toContain('khóa');
    expect(calls).toHaveLength(1);
  });

  it('403 CSRF_VALIDATION_FAILED có thông báo riêng', async () => {
    mockFetch(() => json(403, { statusCode: 403, code: 'CSRF_VALIDATION_FAILED', message: 'x' }));
    const err = (await httpClient.post('/x', {}).catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe('CSRF_VALIDATION_FAILED');
    expect(err.message).toContain('bảo mật');
  });

  it('429 đọc Retry-After; lỗi không phải JSON (proxy 502) vẫn thành ApiError có status', async () => {
    mockFetch(() => new Response('', { status: 429, headers: { 'Retry-After': '30' } }));
    const limited = (await httpClient.post('/auth/login', {}, { skipAuthRefresh: true }).catch((e: unknown) => e)) as ApiError;
    expect([limited.status, limited.retryAfter]).toEqual([429, 30]);
    mockFetch(() => new Response('<html>Bad gateway</html>', { status: 502 }));
    const bad = (await httpClient.get('/x').catch((e: unknown) => e)) as ApiError;
    expect(bad.status).toBe(502);
  });

  it('204 trả undefined', async () => {
    mockFetch(() => new Response(null, { status: 204 }));
    await expect(httpClient.post('/auth/logout', undefined, { skipAuthRefresh: true })).resolves.toBeUndefined();
  });
});
