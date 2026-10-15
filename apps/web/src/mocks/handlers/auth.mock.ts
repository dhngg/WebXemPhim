import type { AuthApi } from '@/features/auth/api';
import { ApiError } from '@/services/http/ApiError';
import { MOCK_PASSWORD, mockUsers, type MockUserRecord } from '../data/users';
import { mockSession } from '../session';
import { simulate } from '../mockUtils';

function requireSession(): MockUserRecord {
  const id = mockSession.get();
  const record = mockUsers.find((r) => r.user.id === id);
  if (!record) throw new ApiError({ statusCode: 401, message: 'Bạn cần đăng nhập để tiếp tục.' });
  return record;
}

export function currentMockUser(): MockUserRecord | null {
  const id = mockSession.get();
  return mockUsers.find((r) => r.user.id === id) ?? null;
}

export { requireSession };

/**
 * Đặt lại mật khẩu (mock). Không có email thật nên token được suy ra từ email:
 * `demo.<base64url(email)>` — còn dùng được sau khi tải lại trang. Mỗi token chỉ dùng 1 lần
 * và mật khẩu mới chỉ nhớ trong bộ nhớ (tải lại trang → về lại mật khẩu demo).
 */
const passwordOverrides: Record<string, string> = {};
const usedResetTokens = new Set<string>();

function toBase64Url(text: string) {
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(text: string) {
  try {
    return atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    return null;
  }
}

/** Liên kết đặt lại mật khẩu mà "email" demo sẽ chứa — chỉ hiển thị ở chế độ mock. */
export function demoResetLink(email: string) {
  return `/reset-password?token=demo.${toBase64Url(email.trim().toLowerCase())}`;
}

export const authMock: AuthApi = {
  async me() {
    await simulate();
    const record = currentMockUser();
    return record ? record.user : null;
  },

  async login({ identifier, password }) {
    await simulate();
    const id = identifier.trim().toLowerCase();
    const record = mockUsers.find((r) => r.user.email === id || r.user.phone === id.replace(/\s/g, ''));
    if (!record || password !== (passwordOverrides[record.user.id] ?? MOCK_PASSWORD)) {
      throw new ApiError({ statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'Email hoặc mật khẩu không đúng.' });
    }
    mockSession.set(record.user.id);
    return record.user;
  },

  async register(input) {
    await simulate();
    if (mockUsers.some((r) => r.user.email === input.email.toLowerCase())) {
      throw new ApiError({
        statusCode: 409,
        message: 'Email đã được sử dụng.',
        fieldErrors: { email: 'Email này đã có tài khoản.' },
      });
    }
    const record: MockUserRecord = {
      user: {
        id: `u-${Date.now()}`,
        fullName: input.fullName,
        email: input.email.toLowerCase(),
        phone: input.phone ?? '',
        globalRole: 'USER',
        tenantLinked: false,
        createdAt: new Date().toISOString(),
      },
      memberships: [],
    };
    mockUsers.push(record);
    mockSession.set(record.user.id);
    return record.user;
  },

  async logout() {
    await simulate();
    mockSession.clear();
  },

  async updateProfile(input) {
    await simulate();
    const record = requireSession();
    record.user = { ...record.user, fullName: input.fullName, ...(input.phone === undefined ? {} : { phone: input.phone }) };
    return record.user;
  },

  async requestPasswordReset() {
    await simulate();
    // Không tiết lộ email có tồn tại hay không.
  },

  async resetPassword({ token, password }) {
    await simulate();
    const email = token.startsWith('demo.') ? fromBase64Url(token.slice(5)) : null;
    const record = email ? mockUsers.find((r) => r.user.email === email) : undefined;
    if (!record || usedResetTokens.has(token)) {
      throw new ApiError({
        statusCode: 400,
        code: 'PASSWORD_RESET_TOKEN_INVALID',
        message: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.',
      });
    }
    usedResetTokens.add(token);
    passwordOverrides[record.user.id] = password;
  },
};
