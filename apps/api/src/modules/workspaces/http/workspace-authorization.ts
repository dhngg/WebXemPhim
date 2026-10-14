import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isUUID } from 'class-validator';
import type { Request } from 'express';
import type { WorkspaceRole } from '@rental/shared';
import { ApplicationException } from '../../../common/errors/application-exception';
import { getAuthenticatedUser } from '../../auth/http/auth-http-security';
import {
  WorkspaceRepository,
  type WorkspaceAccessRecord,
} from '../repositories/workspace.repository';

const WORKSPACE_ROLES_METADATA = 'workspace_roles';
const ALLOW_ARCHIVED_LIFECYCLE_METADATA = 'allow_archived_workspace_lifecycle';
const AUTHORIZED_WORKSPACE = Symbol('AUTHORIZED_WORKSPACE');

export const WorkspaceRoles = (...roles: WorkspaceRole[]) =>
  SetMetadata(WORKSPACE_ROLES_METADATA, roles);
export const AllowArchivedWorkspaceLifecycle = () =>
  SetMetadata(ALLOW_ARCHIVED_LIFECYCLE_METADATA, true);

@Injectable()
export class WorkspaceRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly repository: WorkspaceRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const roles = this.reflector.getAllAndOverride<WorkspaceRole[]>(WORKSPACE_ROLES_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    const allowsArchivedLifecycle = this.reflector.getAllAndOverride<boolean>(
      ALLOW_ARCHIVED_LIFECYCLE_METADATA,
      [context.getHandler(), context.getClass()],
    );
    const rawWorkspaceId = request.params.workspaceId;
    const workspaceId = Array.isArray(rawWorkspaceId) ? rawWorkspaceId[0] : rawWorkspaceId;
    if (!roles?.length || !workspaceId || !isUUID(workspaceId)) {
      throw new ApplicationException('WORKSPACE_NOT_FOUND');
    }
    const workspace = await this.repository.findAccessibleWorkspace(
      getAuthenticatedUser(request).id,
      workspaceId,
    );
    if (!workspace || !roles.includes(workspace.role)) {
      throw new ApplicationException('WORKSPACE_NOT_FOUND');
    }
    const isBusinessWrite = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    if (isBusinessWrite && !allowsArchivedLifecycle && workspace.status !== 'ACTIVE') {
      throw new ApplicationException('WORKSPACE_ARCHIVED');
    }
    Object.defineProperty(request, AUTHORIZED_WORKSPACE, {
      configurable: false,
      enumerable: false,
      writable: false,
      value: workspace,
    });
    return true;
  }
}

export function getAuthorizedWorkspace(request: Request): WorkspaceAccessRecord {
  const workspace = (request as Request & { [AUTHORIZED_WORKSPACE]?: WorkspaceAccessRecord })[
    AUTHORIZED_WORKSPACE
  ];
  if (!workspace) throw new ApplicationException('WORKSPACE_NOT_FOUND');
  return workspace;
}
