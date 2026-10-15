import type { AuthTokenResponse, AuthUserResponse } from '@rental/shared';
import { env } from '@/lib/env';
import { httpClient, refreshAccessToken } from '@/services/http/httpClient';
import { accessTokenStore } from '@/services/http/accessToken';
import { ApiError } from '@/services/http/ApiError';
import { authMock } from '@/mocks/handlers/auth.mock';
import type { CurrentUser, LoginInput, RegisterInput, ResetPasswordInput, UpdateProfileInput } from './types';

export interface AuthApi {
  /** Trả về null nếu chưa đăng nhập. */
  me(): Promise<CurrentUser | null>;
  login(input: LoginInput): Promise<CurrentUser>;
  register(input: RegisterInput): Promise<CurrentUser>;
  logout(): Promise<void>;
  updateProfile(input: UpdateProfileInput): Promise<CurrentUser>;
  requestPasswordReset(email: string): Promise<void>;
  /** Token sai / hết hạn / đã dùng → lỗi 400 PASSWORD_RESET_TOKEN_INVALID. */
  resetPassword(input: ResetPasswordInput): Promise<void>;
}

/**
 * Backend chỉ trả danh tính cơ bản. Vai trò đa quyền (workspace, tenant, admin) sẽ lấy từ
 * `/users/me/capabilities` ở FE-02, nên ở đây `globalRole`/`tenantLinked` chỉ là giá trị mặc định
 * và KHÔNG được dùng để cấp quyền.
 */
export function toCurrentUser(user: AuthUserResponse): CurrentUser {
  return {
    id: user.id,
    fullName: user.displayName?.trim() || user.email.split('@')[0] || user.email,
    email: user.email,
    phone: '',
    globalRole: 'USER',
    tenantLinked: false,
    createdAt: user.createdAt,
  };
}

/** Tên field của backend → tên field trong form hiện có (chỉ đổi tên, không đổi UI). */
const FORM_FIELD_NAMES: Record<string, string> = { displayName: 'fullName', newPassword: 'password' };

function withFormFields<T>(run: () => Promise<T>): Promise<T> {
  return run().catch((error: unknown) => {
    if (error instanceof ApiError && error.fieldErrors) {
      const fieldErrors = Object.fromEntries(
        Object.entries(error.fieldErrors).map(([field, message]) => [FORM_FIELD_NAMES[field] ?? field, message]),
      );
      throw new ApiError({ statusCode: error.status, message: error.message, code: error.code, fieldErrors });
    }
    throw error;
  });
}

/** Chỉ gửi đúng các field trong DTO của backend. Access token JWT giữ trong bộ nhớ; refresh là cookie HttpOnly. */
export const authHttp: AuthApi = {
  async me() {
    // Tải lại trang làm mất access token trong memory → thử refresh bằng cookie trước.
    if (!accessTokenStore.get() && !(await refreshAccessToken())) return null;
    try {
      return toCurrentUser(await httpClient.get<AuthUserResponse>('/auth/me'));
    } catch (error) {
      if (error instanceof ApiError && error.isUnauthorized) return null;
      throw error;
    }
  },
  async login(input) {
    const res = await httpClient.post<AuthTokenResponse>(
      '/auth/login',
      { email: input.identifier.trim().toLowerCase(), password: input.password },
      { skipAuthRefresh: true },
    );
    accessTokenStore.set(res.accessToken);
    return toCurrentUser(res.user);
  },
  async register(input) {
    const res = await withFormFields(() =>
      httpClient.post<AuthTokenResponse>(
        '/auth/register',
        { email: input.email.trim().toLowerCase(), password: input.password, displayName: input.fullName.trim() },
        { skipAuthRefresh: true },
      ),
    );
    accessTokenStore.set(res.accessToken);
    return toCurrentUser(res.user);
  },
  async logout() {
    try {
      await httpClient.post('/auth/logout', undefined, { skipAuthRefresh: true });
    } finally {
      accessTokenStore.clear();
    }
  },
  async updateProfile(input) {
    const user = await withFormFields(() =>
      httpClient.patch<AuthUserResponse>('/users/me', { displayName: input.fullName.trim() }),
    );
    return toCurrentUser(user);
  },
  async requestPasswordReset(email) {
    await httpClient.post('/auth/forgot-password', { email: email.trim().toLowerCase() }, { skipAuthRefresh: true });
  },
  async resetPassword(input) {
    await withFormFields(() =>
      httpClient.post('/auth/reset-password', { token: input.token, newPassword: input.password }, { skipAuthRefresh: true }),
    );
    // Backend đã thu hồi mọi phiên của tài khoản.
    accessTokenStore.clear();
  },
};

export const authApi: AuthApi = env.useMockApi ? authMock : authHttp;
