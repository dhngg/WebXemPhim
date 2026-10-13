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
    if (!record || password !== MOCK_PASSWORD) {
      throw new ApiError({ statusCode: 401, message: 'Email/số điện thoại hoặc mật khẩu không đúng.' });
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
        phone: input.phone,
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
    record.user = { ...record.user, ...input };
    return record.user;
  },

  async requestPasswordReset() {
    await simulate();
    // Không tiết lộ email có tồn tại hay không.
  },
};
