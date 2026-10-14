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
