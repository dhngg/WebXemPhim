import { Injectable } from '@nestjs/common';
import type {
  AddWorkspaceMemberRequest,
  CreateWorkspaceRequest,
  UpdateWorkspaceMemberRequest,
  WorkspaceMemberResponse,
  WorkspaceResponse,
} from '@rental/shared';
import { ApplicationException } from '../../../common/errors/application-exception';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceMemberAlreadyExistsRepositoryError,
  WorkspaceMemberNotFoundRepositoryError,
  WorkspaceNotFoundRepositoryError,
  WorkspaceOwnerConflictRepositoryError,
  WorkspaceOwnerProtectedRepositoryError,
  WorkspaceRepository,
  type WorkspaceAccessRecord,
  type WorkspaceMemberRecord,
  WorkspaceUserUnavailableRepositoryError,
} from '../repositories/workspace.repository';

@Injectable()
export class WorkspaceService {
  constructor(private readonly repository: WorkspaceRepository) {}

  async create(userId: string, input: CreateWorkspaceRequest): Promise<WorkspaceResponse> {
    try {
      return toResponse(await this.repository.createWithOwner(userId, input.name.trim()));
    } catch (error) {
      if (error instanceof WorkspaceUserUnavailableRepositoryError) {
        throw new ApplicationException('ACCOUNT_DISABLED');
      }
      throw error;
    }
  }

  async list(userId: string): Promise<WorkspaceResponse[]> {
    return (await this.repository.findForUser(userId)).map(toResponse);
  }

  detail(workspace: WorkspaceAccessRecord): WorkspaceResponse {
    return toResponse(workspace);
  }

  async archive(workspaceId: string, ownerUserId: string): Promise<WorkspaceResponse> {
    return this.changeLifecycle(() => this.repository.archive(workspaceId, ownerUserId));
  }

  async restore(workspaceId: string, ownerUserId: string): Promise<WorkspaceResponse> {
    return this.changeLifecycle(() => this.repository.restore(workspaceId, ownerUserId));
  }

  async listMembers(workspaceId: string, ownerUserId: string): Promise<WorkspaceMemberResponse[]> {
    try {
      return (await this.repository.listMembers(workspaceId, ownerUserId)).map(toMemberResponse);
    } catch (error) {
      this.rethrowMembershipError(error);
    }
  }

  async addMember(
    workspaceId: string,
    ownerUserId: string,
    input: AddWorkspaceMemberRequest,
  ): Promise<WorkspaceMemberResponse> {
    try {
      return toMemberResponse(
        await this.repository.addMember(workspaceId, ownerUserId, input.email, input.role),
      );
    } catch (error) {
      this.rethrowMembershipError(error);
    }
  }

  async updateMemberRole(
    workspaceId: string,
    ownerUserId: string,
    membershipId: string,
    input: UpdateWorkspaceMemberRequest,
  ): Promise<WorkspaceMemberResponse> {
    try {
      return toMemberResponse(
        await this.repository.updateMemberRole(workspaceId, ownerUserId, membershipId, input.role),
      );
    } catch (error) {
      this.rethrowMembershipError(error);
    }
  }

  async removeMember(
    workspaceId: string,
    ownerUserId: string,
    membershipId: string,
  ): Promise<void> {
    try {
      await this.repository.removeMember(workspaceId, ownerUserId, membershipId);
    } catch (error) {
      this.rethrowMembershipError(error);
    }
  }

  async transferOwnership(
    workspaceId: string,
    currentOwnerUserId: string,
    targetMembershipId: string,
  ): Promise<void> {
    try {
      await this.repository.transferOwnership(workspaceId, currentOwnerUserId, targetMembershipId);
    } catch (error) {
      if (error instanceof WorkspaceNotFoundRepositoryError) {
        throw new ApplicationException('WORKSPACE_NOT_FOUND');
      }
      if (error instanceof WorkspaceArchivedRepositoryError) {
        throw new ApplicationException('WORKSPACE_ARCHIVED');
      }
      if (error instanceof WorkspaceOwnerConflictRepositoryError) {
        throw new ApplicationException('WORKSPACE_OWNER_CONFLICT');
      }
      if (error instanceof WorkspaceMemberNotFoundRepositoryError) {
        throw new ApplicationException('WORKSPACE_MEMBER_NOT_FOUND');
      }
      throw error;
    }
  }

  private async changeLifecycle(
    operation: () => Promise<WorkspaceAccessRecord>,
  ): Promise<WorkspaceResponse> {
    try {
      return toResponse(await operation());
    } catch (error) {
      if (error instanceof WorkspaceNotFoundRepositoryError) {
        throw new ApplicationException('WORKSPACE_NOT_FOUND');
      }
      throw error;
    }
  }

  private rethrowMembershipError(error: unknown): never {
    if (error instanceof WorkspaceNotFoundRepositoryError) {
      throw new ApplicationException('WORKSPACE_NOT_FOUND');
    }
    if (error instanceof WorkspaceArchivedRepositoryError) {
      throw new ApplicationException('WORKSPACE_ARCHIVED');
    }
    if (error instanceof WorkspaceMemberNotFoundRepositoryError) {
      throw new ApplicationException('WORKSPACE_MEMBER_NOT_FOUND');
    }
    if (error instanceof WorkspaceMemberAlreadyExistsRepositoryError) {
      throw new ApplicationException('WORKSPACE_MEMBER_ALREADY_EXISTS');
    }
    if (error instanceof WorkspaceOwnerProtectedRepositoryError) {
      throw new ApplicationException('WORKSPACE_OWNER_PROTECTED');
    }
    throw error;
  }
}

function toResponse(workspace: WorkspaceAccessRecord): WorkspaceResponse {
  return {
    id: workspace.id,
    name: workspace.name,
    status: workspace.status,
    archivedAt: workspace.archivedAt?.toISOString() ?? null,
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString(),
    currentMembership: { role: workspace.role },
  };
}

function toMemberResponse(membership: WorkspaceMemberRecord): WorkspaceMemberResponse {
  return {
    id: membership.id,
    role: membership.role,
    createdAt: membership.createdAt.toISOString(),
    updatedAt: membership.updatedAt.toISOString(),
    user: membership.user,
  };
}
