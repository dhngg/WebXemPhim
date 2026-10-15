import type { CapabilitiesApi } from '@/features/capabilities/api';
import type { Capabilities } from '@/features/capabilities/model';
import { simulate } from '../mockUtils';
import { activeTenantIds, tenantRecord, workspaceName } from '../tenant-links';
import { requireSession } from './auth.mock';
import { mockLandlordApplications } from './landlord-application.mock';

/** Mock: dựng quyền từ tài khoản demo. Chỉ dùng khi bật VITE_USE_MOCK_API=true. */
export const capabilitiesMock: CapabilitiesApi = {
  async get() {
    await simulate();
    const { user, memberships } = requireSession();
    const caps: Capabilities = {
      workspaces: memberships.map((m) => ({
        id: m.workspaceId,
        name: m.name,
        status: m.status === 'ACTIVE' ? 'ACTIVE' : 'ARCHIVED',
        role: m.role,
      })),
      tenantLinks: activeTenantIds(user.id).flatMap((tenantId) => {
        const t = tenantRecord(tenantId);
        return t ? [{ tenantId, workspaceId: t.workspaceId, tenantName: t.fullName, workspaceName: workspaceName(t.workspaceId) }] : [];
      }),
      isPlatformAdmin: user.globalRole === 'ADMIN',
      landlordApplication: mockLandlordApplications.get(user.id) ?? null,
    };
    return caps;
  },
};
