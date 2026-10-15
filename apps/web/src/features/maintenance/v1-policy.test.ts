import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({
  record: null as unknown as { user: { id: string; fullName: string }; memberships: Array<{ workspaceId: string; role: string; status: string; name: string }> },
}));

vi.mock('@/mocks/handlers/auth.mock', () => ({
  requireSession: () => session.record,
}));
vi.mock('@/mocks/mockUtils', () => ({ simulate: async () => ({ empty: false }) }));

import operationsPage from '@/pages/workspace/MaintenancePages.tsx?raw';
import maintenanceApiSrc from '@/features/maintenance/owner-api.ts?raw';
import maintenanceModelSrc from '@/features/maintenance/owner-model.ts?raw';
import maintenanceTypesSrc from '@/features/maintenance/types.ts?raw';
import maintenanceMockSrc from '@/mocks/handlers/maintenance-requests.mock.ts?raw';
import routerSrc from '@/app/router.tsx?raw';
import layoutSrc from '@/layouts/WorkspaceLayout.tsx?raw';
import { requireMember } from '@/mocks/guard';
import { workspacesMock } from '@/mocks/handlers/workspaces.mock';

const as = (...roles: string[]) => {
  session.record = {
    user: { id: 'u1', fullName: 'Test' },
    memberships: roles.map((role, i) => ({ workspaceId: `w${i}`, role, status: 'ACTIVE', name: `WS ${i}` })),
  };
};

describe('mock RBAC V1: only OWNER operates a workspace', () => {
  beforeEach(() => as('OWNER', 'MANAGER', 'STAFF'));

  it('OWNER passes the membership and permission guards', () => {
    expect(requireMember('w0').membership.role).toBe('OWNER');
    expect(requireMember('w0', 'rooms.write').membership.role).toBe('OWNER');
    expect(requireMember('w0', 'buildings.archive')).toBeDefined();
  });

  it.each([['w1', 'MANAGER'], ['w2', 'STAFF']])('legacy %s (%s) is rejected even without a permission requirement', (id) => {
    expect(() => requireMember(id)).toThrow();
    expect(() => requireMember(id, 'rooms.write')).toThrow();
  });

  it('unknown workspace is still rejected', () => {
    expect(() => requireMember('nope')).toThrow();
  });

  it('listMine returns only OWNER memberships, keeping the others untouched in the data', async () => {
    const list = await workspacesMock.listMine();
    expect(list.map((m) => m.role)).toEqual(['OWNER']);
    expect(session.record.memberships).toHaveLength(3);
  });
});

describe('maintenance has no assignment feature in the web app', () => {
  it('UI no longer renders an assignee form or column', () => {
    const page = operationsPage;
    expect(page).not.toMatch(/assignee/i);
    expect(page).not.toContain('Phân công');
    expect(page).not.toContain('Lưu phân công');
  });

  it('API layer and mutation payload carry no assignee', () => {
    // filter assigneeUserId của backend được nhắc tới trong chú thích nhưng không bao giờ được gửi
    expect(maintenanceApiSrc.replace(/\/\*\*[\s\S]*?\*\//g, '')).not.toMatch(/assignee/i);
    expect(maintenanceModelSrc).not.toMatch(/assignee/i);
    expect(maintenanceTypesSrc).not.toMatch(/assignee/i);
    // the DTO still has assigneeUserId (historic data); V1 never assigns anybody, so the mock only ever returns null
    expect(maintenanceMockSrc).not.toMatch(/assigneeUserId:\s*(?!null)\S/);
  });

  it('no Members/Workspace-staff screens or calls remain', () => {
    expect(routerSrc).not.toContain('WorkspaceAdminPages');
    expect(layoutSrc).not.toMatch(/\/members|Thành viên/);
  });
});
