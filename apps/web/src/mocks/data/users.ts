import type { CurrentUser } from '@/features/auth/types';
import type { WorkspaceMembership } from '@/features/workspaces/types';

/**
 * TÀI KHOẢN DEMO (mock). Mật khẩu chung: demo1234
 * Mật khẩu chỉ tồn tại trong mock adapter để mô phỏng đăng nhập, không phải cơ chế thật.
 */
export const MOCK_PASSWORD = 'demo1234';

export interface MockUserRecord {
  user: CurrentUser;
  memberships: WorkspaceMembership[];
}

const anNhien: WorkspaceMembership = {
  workspaceId: 'ws-an-nhien',
  name: 'Nhà Trọ An Nhiên Group',
  status: 'ACTIVE',
  role: 'OWNER',
  buildingCount: 3,
  roomCount: 28,
  plan: { name: 'Gói Chuyên Nghiệp', roomLimit: 30 },
};

export const mockUsers: MockUserRecord[] = [
  {
    user: {
      id: 'u-owner',
      fullName: 'Nguyễn Văn Quân',
      email: 'quan@demo.vn',
      phone: '0903891223',
      globalRole: 'USER',
      tenantLinked: false,
      createdAt: '2022-03-01T02:00:00.000Z',
    },
    memberships: [
      anNhien,
      {
        workspaceId: 'ws-sunhouse',
        name: 'SunHouse Bình Thạnh',
        status: 'ACTIVE',
        role: 'MANAGER',
        buildingCount: 1,
        roomCount: 12,
        plan: { name: 'Gói Cơ Bản', roomLimit: 15 },
      },
    ],
  },
  {
    user: {
      id: 'u-tenant',
      fullName: 'Trần Văn Nam',
      email: 'nam@demo.vn',
      phone: '0912345889',
      globalRole: 'USER',
      tenantLinked: true,
      createdAt: '2024-01-10T02:00:00.000Z',
    },
    memberships: [],
  },
  {
    user: {
      id: 'u-guest',
      fullName: 'Lê Minh',
      email: 'minh@demo.vn',
      phone: '0988111222',
      globalRole: 'USER',
      tenantLinked: false,
      createdAt: '2026-10-01T02:00:00.000Z',
    },
    memberships: [],
  },
  {
    user: {
      id: 'u-admin',
      fullName: 'Quản trị hệ thống',
      email: 'admin@demo.vn',
      phone: '0900000000',
      globalRole: 'ADMIN',
      tenantLinked: false,
      createdAt: '2021-01-01T02:00:00.000Z',
    },
    memberships: [],
  },
];
