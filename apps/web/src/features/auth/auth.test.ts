import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authHttp, toCurrentUser } from './api';
import { readResetToken } from '@/pages/auth/AuthPages';
import { accessTokenStore } from '@/services/http/accessToken';
import { ApiError, fieldErrorsFrom } from '@/services/http/ApiError';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function mockFetch(handler: (call: Call) => Response) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const call: Call = {
        url: url.replace(/^.*\/api\/v1/, ''),
        method: String(init.method),
        headers: init.headers as Record<string, string>,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      };
      calls.push(call);
      return handler(call);
    }),
  );
  return calls;
}

const backendUser = {
  id: 'u1',
  email: 'a@b.test',
  displayName: 'Lê Minh',
  status: 'ACTIVE' as const,
  createdAt: '2026-10-15T00:00:00.000Z',
};

describe('auth adapter — DTO gửi lên backend', () => {
  beforeEach(() => accessTokenStore.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('đăng ký chỉ gửi email/password/displayName (không phone, role, acceptTerms)', async () => {
    const calls = mockFetch(() => json(201, { accessToken: 't', expiresIn: 600, user: backendUser }));
    const user = await authHttp.register({
      fullName: ' Lê Minh ',
      email: ' A@B.test ',
      phone: '0988111222',
      password: 'mat-khau-dai-12',
      acceptTerms: true,
    });
    expect(calls[0]).toMatchObject({ url: '/auth/register', method: 'POST' });
    expect(calls[0]!.body).toEqual({ email: 'a@b.test', password: 'mat-khau-dai-12', displayName: 'Lê Minh' });
    expect(accessTokenStore.get()).toBe('t');
    expect(user).toMatchObject({ id: 'u1', fullName: 'Lê Minh', email: 'a@b.test' });
  });

  it('đăng nhập gửi email + password', async () => {
    const calls = mockFetch(() => json(200, { accessToken: 't2', expiresIn: 600, user: backendUser }));
    await authHttp.login({ identifier: ' A@B.test', password: 'pw-pw-pw-pw-1' });
    expect(calls[0]!.body).toEqual({ email: 'a@b.test', password: 'pw-pw-pw-pw-1' });
    expect(calls[0]!.headers['X-CSRF-Protection']).toBe('1');
  });

  it('đăng nhập sai: 401 INVALID_CREDENTIALS có thông báo tiếng Việt và không gọi refresh', async () => {
    const calls = mockFetch(() => json(401, { statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' }));
    const err = (await authHttp.login({ identifier: 'a@b.test', password: 'x' }).catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe('INVALID_CREDENTIALS');
    expect(err.message).toBe('Email hoặc mật khẩu không đúng.');
    expect(calls).toHaveLength(1);
  });

  it('đăng ký trùng email: 409 EMAIL_ALREADY_EXISTS', async () => {
    mockFetch(() => json(409, { statusCode: 409, code: 'EMAIL_ALREADY_EXISTS', message: 'Email exists' }));
    const err = (await authHttp
      .register({ fullName: 'A B', email: 'a@b.test', password: 'mat-khau-dai-12', acceptTerms: true })
      .catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe('EMAIL_ALREADY_EXISTS');
    expect(err.isConflict).toBe(true);
  });

  it('lỗi validation: errors[] thành fieldErrors, displayName → fullName', async () => {
    mockFetch(() =>
      json(400, {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        errors: ['displayName must be shorter than or equal to 100 characters', 'email must be an email'],
      }),
    );
    const err = (await authHttp
      .register({ fullName: 'x'.repeat(120), email: 'bad', password: 'mat-khau-dai-12', acceptTerms: true })
      .catch((e: unknown) => e)) as ApiError;
    expect(err.fieldErrors).toEqual({
      fullName: 'must be shorter than or equal to 100 characters',
      email: 'must be an email',
    });
  });

  it('quên mật khẩu: POST email và chấp nhận phản hồi chung 202', async () => {
    const calls = mockFetch(() => json(202, { accepted: true }));
    await expect(authHttp.requestPasswordReset(' A@B.test ')).resolves.toBeUndefined();
    expect(calls[0]).toMatchObject({ url: '/auth/forgot-password', method: 'POST', body: { email: 'a@b.test' } });
  });

  it('quên mật khẩu bị giới hạn: 429 kèm Retry-After', async () => {
    mockFetch(() => json(429, { statusCode: 429, code: 'RATE_LIMITED', message: 'Too many' }, { 'Retry-After': '42' }));
    const err = (await authHttp.requestPasswordReset('a@b.test').catch((e: unknown) => e)) as ApiError;
    expect(err.isRateLimited).toBe(true);
    expect(err.retryAfter).toBe(42);
    expect(err.message).toContain('42 giây');
  });

  it('đặt lại mật khẩu gửi {token, newPassword}, 204, và xóa access token (mọi phiên bị thu hồi)', async () => {
    accessTokenStore.set('old');
    const calls = mockFetch(() => new Response(null, { status: 204 }));
    const token = 'A'.repeat(43);
    await authHttp.resetPassword({ token, password: 'mat-khau-moi-123' });
    expect(calls[0]!.body).toEqual({ token, newPassword: 'mat-khau-moi-123' });
    expect(accessTokenStore.get()).toBeNull();
  });

  it('token sai/hết hạn/đã dùng: 400 PASSWORD_RESET_TOKEN_INVALID', async () => {
    mockFetch(() => json(400, { statusCode: 400, code: 'PASSWORD_RESET_TOKEN_INVALID', message: 'x' }));
    const err = (await authHttp.resetPassword({ token: 'A'.repeat(43), password: 'mat-khau-moi-123' }).catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe('PASSWORD_RESET_TOKEN_INVALID');
  });

  it('mật khẩu mới yếu: 400 VALIDATION_ERROR gắn vào ô "password", không phải lỗi token', async () => {
    mockFetch(() =>
      json(400, { statusCode: 400, code: 'VALIDATION_ERROR', message: 'v', errors: ['newPassword must be longer than or equal to 12 characters'] }),
    );
    const err = (await authHttp.resetPassword({ token: 'A'.repeat(43), password: 'short' }).catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.fieldErrors).toEqual({ password: 'must be longer than or equal to 12 characters' });
  });

  it('cập nhật hồ sơ: PATCH /users/me chỉ gửi displayName (không phone/role/status)', async () => {
    accessTokenStore.set('t');
    const calls = mockFetch(() => json(200, { ...backendUser, displayName: 'Tên mới' }));
    const user = await authHttp.updateProfile({ fullName: ' Tên mới ', phone: '0988111222' });
    expect(calls[0]).toMatchObject({ url: '/users/me', method: 'PATCH', body: { displayName: 'Tên mới' } });
    expect(user.fullName).toBe('Tên mới');
  });

  it('đăng xuất: POST /auth/logout (204) và luôn xóa token trong bộ nhớ', async () => {
    accessTokenStore.set('t');
    const calls = mockFetch(() => new Response(null, { status: 204 }));
    await authHttp.logout();
    expect(calls[0]).toMatchObject({ url: '/auth/logout', method: 'POST' });
    expect(calls[0]!.headers['X-CSRF-Protection']).toBe('1');
    expect(accessTokenStore.get()).toBeNull();
  });

  it('logout vẫn xóa token khi mạng lỗi', async () => {
    accessTokenStore.set('t');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')));
    await authHttp.logout().catch(() => undefined);
    expect(accessTokenStore.get()).toBeNull();
  });

  it('me(): chưa có phiên (refresh 401) → null, không gọi /auth/me', async () => {
    const calls = mockFetch(() => json(401, { statusCode: 401, code: 'REFRESH_TOKEN_INVALID', message: 'x' }));
    await expect(authHttp.me()).resolves.toBeNull();
    expect(calls.map((c) => c.url)).toEqual(['/auth/refresh']);
  });

  it('me(): tải lại trang → refresh bằng cookie rồi GET /auth/me với Bearer mới', async () => {
    const calls = mockFetch((c) =>
      c.url === '/auth/refresh'
        ? json(200, { accessToken: 'fresh', expiresIn: 600, user: backendUser })
        : json(200, backendUser),
    );
    const user = await authHttp.me();
    expect(calls.map((c) => c.url)).toEqual(['/auth/refresh', '/auth/me']);
    expect(calls[1]!.headers.Authorization).toBe('Bearer fresh');
    expect(user?.email).toBe('a@b.test');
  });
});

describe('toCurrentUser', () => {
  it('không suy ra quyền từ dữ liệu Auth (admin/tenant do FE-02 lấy từ capabilities)', () => {
    const user = toCurrentUser({ ...backendUser, displayName: null });
    expect(user.globalRole).toBe('USER');
    expect(user.tenantLinked).toBe(false);
    expect(user.fullName).toBe('a'); // fallback từ phần trước @ của email
    expect(user.phone).toBe('');
  });
});

describe('fieldErrorsFrom', () => {
  it('tách "<field> <thông báo>" và bỏ qua chuỗi không theo dạng đó', () => {
    expect(fieldErrorsFrom(['email must be an email', 'Validation failed!'])).toEqual({ email: 'must be an email' });
    expect(fieldErrorsFrom([])).toBeUndefined();
  });
});

describe('token đặt lại mật khẩu', () => {
  it('đọc từ #token= (ưu tiên) và từ ?token= (liên kết demo mock)', () => {
    expect(readResetToken('#token=abc_DEF-1', '')).toBe('abc_DEF-1');
    expect(readResetToken('', '?token=demo.xyz')).toBe('demo.xyz');
    expect(readResetToken('#token=hash', '?token=query')).toBe('hash');
    expect(readResetToken('', '')).toBe('');
  });
});
