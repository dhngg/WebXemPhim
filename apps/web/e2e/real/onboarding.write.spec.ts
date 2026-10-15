import { expect, request, test } from '@playwright/test';
import type {
  LandlordApplicationResponse,
  UserCapabilitiesResponse,
  WorkspaceResponse,
} from '@rental/shared';
import { REAL_WEB_ORIGIN, requireWriteEnvironment } from './support/environment';
import { fixtureEmail, fixturePassword, FixtureRegistry } from './support/fixture-registry';
import { RealApi, RealApiError } from './support/real-api';

test.describe.serial('REAL WRITE: account onboarding', () => {
  test('approval/rejection, workspace gate and capabilities persist through real HTTP', async () => {
    const { adminEmail, adminPassword } = requireWriteEnvironment();
    const fixtures = new FixtureRegistry();
    const ownerContext = await request.newContext({ baseURL: REAL_WEB_ORIGIN });
    const rejectedContext = await request.newContext({ baseURL: REAL_WEB_ORIGIN });
    const adminContext = await request.newContext({ baseURL: REAL_WEB_ORIGIN });
    const ownerApi = new RealApi(ownerContext);
    const rejectedApi = new RealApi(rejectedContext);
    const adminApi = new RealApi(adminContext);
    let cleanupFailures: string[] = [];

    try {
      const password = fixturePassword();
      const owner = await ownerApi.register({
        email: fixtureEmail(fixtures.runId, 'owner'),
        password,
        displayName: `FE11 Owner ${fixtures.runId}`,
      });
      fixtures.record('user', owner.user.id, 'retained-active');

      const rejected = await rejectedApi.register({
        email: fixtureEmail(fixtures.runId, 'rejected'),
        password,
        displayName: `FE11 Rejected ${fixtures.runId}`,
      });
      fixtures.record('user', rejected.user.id, 'retained-active');

      await expectWorkspaceCreationDenied(ownerApi);

      const ownerApplication = await ownerApi.post<LandlordApplicationResponse>(
        '/landlord-applications/me',
        { reason: `REAL smoke owner ${fixtures.runId}` },
      );
      fixtures.record('landlord-application', ownerApplication.id, 'pending');

      const rejectedApplication = await rejectedApi.post<LandlordApplicationResponse>(
        '/landlord-applications/me',
        { reason: `REAL smoke rejected ${fixtures.runId}` },
      );
      fixtures.record('landlord-application', rejectedApplication.id, 'pending');

      await adminApi.login({ email: adminEmail, password: adminPassword });
      const approved = await adminApi.post<LandlordApplicationResponse>(
        `/admin/landlord-applications/${ownerApplication.id}/approve`,
        { reason: `FE11 approved ${fixtures.runId}` },
        200,
      );
      expect(approved.status).toBe('APPROVED');
      fixtures.update('landlord-application', approved.id, 'approved-retained');

      const declined = await adminApi.post<LandlordApplicationResponse>(
        `/admin/landlord-applications/${rejectedApplication.id}/reject`,
        { reason: `FE11 rejected ${fixtures.runId}` },
        200,
      );
      expect(declined.status).toBe('REJECTED');
      fixtures.update('landlord-application', declined.id, 'rejected-retained');

      await expectWorkspaceCreationDenied(rejectedApi);

      const workspace = await ownerApi.post<WorkspaceResponse>('/workspaces', {
        name: `FE11 ${fixtures.runId}`,
      });
      fixtures.record('workspace', workspace.id, 'active');
      fixtures.defer(`archive-workspace:${workspace.id}`, async () => {
        const archived = await ownerApi.patch<WorkspaceResponse>(
          `/workspaces/${workspace.id}/archive`,
          {},
        );
        if (archived.status !== 'ARCHIVED') throw new Error('Workspace archive was not persisted.');
        fixtures.update('workspace', workspace.id, 'archived');
      });

      expect(workspace.currentMembership.role).toBe('OWNER');
      const capabilities = await ownerApi.get<UserCapabilitiesResponse>('/users/me/capabilities');
      expect(capabilities.landlordApplication?.status).toBe('APPROVED');
      expect(capabilities.workspaces).toContainEqual(
        expect.objectContaining({ id: workspace.id, role: 'OWNER', status: 'ACTIVE' }),
      );

      const rejectedCapabilities = await rejectedApi.get<UserCapabilitiesResponse>(
        '/users/me/capabilities',
      );
      expect(rejectedCapabilities.landlordApplication?.status).toBe('REJECTED');
      expect(rejectedCapabilities.workspaces).toEqual([]);
    } finally {
      cleanupFailures = await fixtures.cleanup();
      await fixtures.writeManifest(cleanupFailures);
      await Promise.all([ownerContext.dispose(), rejectedContext.dispose(), adminContext.dispose()]);
    }

    expect(cleanupFailures).toEqual([]);
  });
});

async function expectWorkspaceCreationDenied(api: RealApi): Promise<void> {
  try {
    await api.post<WorkspaceResponse>('/workspaces', { name: 'Must not be created' });
    throw new Error('Workspace creation unexpectedly succeeded.');
  } catch (error) {
    expect(error).toBeInstanceOf(RealApiError);
    expect(error).toMatchObject({ status: 403, code: 'LANDLORD_APPLICATION_REQUIRED' });
  }
}
