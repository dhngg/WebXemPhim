import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { ApplicationException } from '../../../common/errors/application-exception';
import { AccessAuthGuard } from '../../auth/http/auth-http-security';
import { WorkspaceRoleGuard } from './workspace-authorization';

describe('WorkspaceRoleGuard', () => {
  it.each(['MANAGER', 'STAFF'] as const)(
    'rejects a historical %s membership even when legacy route metadata names it',
    async (role) => {
      const reflector = {
        getAllAndOverride: jest
          .fn()
          .mockReturnValueOnce(['OWNER', 'MANAGER', 'STAFF'])
          .mockReturnValueOnce(false),
      } as unknown as Reflector;
      const repository = {
        findAccessibleWorkspace: jest.fn().mockResolvedValue({
          id: '770060ca-e063-4b27-9b10-e517ba61866e',
          role,
          status: 'ACTIVE',
        }),
      };
      const request = {
        params: { workspaceId: '770060ca-e063-4b27-9b10-e517ba61866e' },
        method: 'GET',
        get: jest.fn().mockReturnValue('Bearer access-token'),
      };
      const context = {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => undefined,
        getClass: () => undefined,
      } as unknown as ExecutionContext;
      const accessGuard = new AccessAuthGuard({
        authenticateAccessToken: jest.fn().mockResolvedValue({ id: 'legacy-member' }),
      } as never);
      const guard = new WorkspaceRoleGuard(reflector, repository as never);

      await accessGuard.canActivate(context);
      await expect(guard.canActivate(context)).rejects.toMatchObject<Partial<ApplicationException>>(
        {
          code: 'WORKSPACE_NOT_FOUND',
        },
      );
    },
  );

  it('allows an OWNER membership on an active workspace', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValueOnce(['OWNER']).mockReturnValueOnce(false),
    } as unknown as Reflector;
    const repository = {
      findAccessibleWorkspace: jest.fn().mockResolvedValue({
        id: '770060ca-e063-4b27-9b10-e517ba61866e',
        role: 'OWNER',
        status: 'ACTIVE',
      }),
    };
    const request = {
      params: { workspaceId: '770060ca-e063-4b27-9b10-e517ba61866e' },
      method: 'GET',
      get: jest.fn().mockReturnValue('Bearer access-token'),
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext;
    const accessGuard = new AccessAuthGuard({
      authenticateAccessToken: jest.fn().mockResolvedValue({ id: 'owner-1' }),
    } as never);
    const guard = new WorkspaceRoleGuard(reflector, repository as never);

    await accessGuard.canActivate(context);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('blocks business writes when the authorized workspace is archived', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValueOnce(['OWNER']).mockReturnValueOnce(false),
    } as unknown as Reflector;
    const repository = {
      findAccessibleWorkspace: jest.fn().mockResolvedValue({
        id: '770060ca-e063-4b27-9b10-e517ba61866e',
        role: 'OWNER',
        status: 'ARCHIVED',
      }),
    };
    const request = {
      params: { workspaceId: '770060ca-e063-4b27-9b10-e517ba61866e' },
      method: 'PATCH',
      get: jest.fn().mockReturnValue('Bearer access-token'),
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext;
    const accessGuard = new AccessAuthGuard({
      authenticateAccessToken: jest.fn().mockResolvedValue({ id: 'owner-1' }),
    } as never);
    const guard = new WorkspaceRoleGuard(reflector, repository as never);

    await accessGuard.canActivate(context);
    await expect(guard.canActivate(context)).rejects.toMatchObject<Partial<ApplicationException>>({
      code: 'WORKSPACE_ARCHIVED',
    });
  });
});
