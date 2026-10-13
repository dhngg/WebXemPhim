import { env } from '@/lib/env';
import { httpClient, refreshAccessToken } from '@/services/http/httpClient';
import { accessTokenStore } from '@/services/http/accessToken';
import { ApiError } from '@/services/http/ApiError';
import { authMock } from '@/mocks/handlers/auth.mock';
import type { CurrentUser, LoginInput, RegisterInput, UpdateProfileInput } from './types';

export interface AuthApi {
  /** Trả về null nếu chưa đăng nhập. */
  me(): Promise<CurrentUser | null>;
  login(input: LoginInput): Promise<CurrentUser>;
  register(input: RegisterInput): Promise<CurrentUser>;
  logout(): Promise<void>;
  updateProfile(input: UpdateProfileInput): Promise<CurrentUser>;
  requestPasswordReset(email: string): Promise<void>;
}

/** Response DỰ KIẾN của login/register — chưa chốt với backend. */
interface AuthResponse {
  accessToken: string;
  user: CurrentUser;
}

/**
 * Endpoint & DTO DỰ KIẾN (xem API_INTEGRATION_CONTRACT.md).
 * Mô hình: access token JWT ngắn hạn trong memory + refresh token HttpOnly cookie do backend set.
 */
const authHttp: AuthApi = {
  async me() {
    // Tải lại trang làm mất access token trong memory → thử refresh bằng cookie trước.
    if (!accessTokenStore.get() && !(await refreshAccessToken())) return null;
    try {
      return await httpClient.get<CurrentUser>('/auth/me');
    } catch (error) {
      if (error instanceof ApiError && error.isUnauthorized) return null;
      throw error;
    }
  },
  async login(input) {
    const res = await httpClient.post<AuthResponse>('/auth/login', input, { skipAuthRefresh: true });
    accessTokenStore.set(res.accessToken);
    return res.user;
  },
  async register(input) {
    const res = await httpClient.post<AuthResponse>('/auth/register', input, { skipAuthRefresh: true });
    accessTokenStore.set(res.accessToken);
    return res.user;
  },
  async logout() {
    try {
      await httpClient.post('/auth/logout', undefined, { skipAuthRefresh: true });
    } finally {
      accessTokenStore.clear();
    }
  },
  updateProfile: (input) => httpClient.patch('/users/me', input),
  requestPasswordReset: (email) => httpClient.post('/auth/forgot-password', { email }, { skipAuthRefresh: true }),
};

export const authApi: AuthApi = env.useMockApi ? authMock : authHttp;
