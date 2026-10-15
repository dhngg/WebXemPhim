import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type {
  CreateTenantLinkRequest,
  DecideTenantLinkRequest,
  RevokeTenantLinkRequest,
  TenantLinkRequestPageResponse,
  TenantLinkRequestResponse,
  TenantAccountLinkResponse,
  TenantSelfResponse,
  TenantUserLinkResponse,
} from '@rental/shared';
import { ApplicationException } from '../../../common/errors/application-exception';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceNotFoundRepositoryError,
} from '../../workspaces/repositories/workspace.repository';
import type { TenantLinkRequestQueryDto } from '../dto/tenant-link.dto';
import {
  TenantArchivedRepositoryError,
  TenantNotFoundRepositoryError,
  type TenantRecord,
} from '../repositories/tenant.repository';
import {
  TenantLinkNotFoundRepositoryError,
  TenantInvitationConflictRepositoryError,
  TenantInvitationInvalidRepositoryError,
  TenantLinkRepository,
  TenantLinkRequestConflictRepositoryError,
  TenantLinkRequestInvalidTransitionRepositoryError,
  TenantLinkRequestNotFoundRepositoryError,
  type TenantAccountLinkRecord,
  type TenantLinkRequestRecord,
  type TenantUserLinkRecord,
} from '../repositories/tenant-link.repository';

@Injectable()
export class TenantLinkService {
  constructor(private readonly repository: TenantLinkRepository) {}

  async createInvitation(workspaceId: string, tenantId: string, creatorId: string) {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = new Uint8Array(
      createHash('sha256').update(`tenant-invitation:v1:${token}`).digest(),
    );
    const expiresAt = new Date(Date.now() + 7 * 86400000);
    try {
      const row = await this.repository.createInvitation(
        workspaceId,
        tenantId,
        creatorId,
        tokenHash,
        expiresAt,
      );
      return {
        id: row.id,
        tenantId: row.tenantId,
        workspaceId: row.workspaceId,
        token,
        expiresAt: row.expiresAt.toISOString(),
        acceptedAt: null,
        createdAt: row.createdAt.toISOString(),
      };
    } catch (error) {
      this.mapError(error);
    }
  }

  async acceptInvitation(userId: string, token: string) {
    const tokenHash = new Uint8Array(
      createHash('sha256').update(`tenant-invitation:v1:${token}`).digest(),
    );
    try {
      return toLinkResponse(await this.repository.acceptInvitation(userId, tokenHash, new Date()));
    } catch (error) {
      this.mapError(error);
    }
  }

  createRequest(userId: string, tenantId: string, input: CreateTenantLinkRequest) {
    return this.executeRequest(() => this.repository.createRequest(userId, tenantId, input));
  }

  async listMine(userId: string, query: TenantLinkRequestQueryDto) {
    const result = await this.repository.listMine(userId, query);
    return toPage(result.items, result.total, query);
  }

  async listWorkspace(workspaceId: string, query: TenantLinkRequestQueryDto) {
    const result = await this.repository.listWorkspace(workspaceId, query);
    return toPage(result.items, result.total, query);
  }

  async approve(
    workspaceId: string,
    userId: string,
    requestId: string,
    input: DecideTenantLinkRequest,
  ): Promise<TenantUserLinkResponse> {
    try {
      const { link } = await this.repository.approve(workspaceId, userId, requestId, input);
      return toLinkResponse(link);
    } catch (error) {
      this.mapError(error);
    }
  }

  reject(workspaceId: string, userId: string, requestId: string, input: DecideTenantLinkRequest) {
    return this.executeRequest(() => this.repository.reject(workspaceId, userId, requestId, input));
  }

  async revoke(
    workspaceId: string,
    userId: string,
    linkId: string,
    input: RevokeTenantLinkRequest,
  ): Promise<TenantUserLinkResponse> {
    try {
      return toLinkResponse(await this.repository.revoke(workspaceId, userId, linkId, input));
    } catch (error) {
      this.mapError(error);
    }
  }

  async listActiveLinks(
    workspaceId: string,
    ownerUserId: string,
    tenantId: string,
  ): Promise<TenantAccountLinkResponse[]> {
    try {
      return (await this.repository.listActiveLinks(workspaceId, ownerUserId, tenantId)).map(
        toAccountLinkResponse,
      );
    } catch (error) {
      this.mapError(error);
    }
  }

  async linkedTenants(userId: string): Promise<TenantSelfResponse[]> {
    return (await this.repository.listLinkedTenants(userId)).map(toTenantResponse);
  }

  private async executeRequest(operation: () => Promise<TenantLinkRequestRecord>) {
    try {
      return toRequestResponse(await operation());
    } catch (error) {
      this.mapError(error);
    }
  }

  private mapError(error: unknown): never {
    if (error instanceof TenantInvitationInvalidRepositoryError)
      throw new ApplicationException('TENANT_INVITATION_INVALID');
    if (error instanceof TenantInvitationConflictRepositoryError)
      throw new ApplicationException('TENANT_INVITATION_CONFLICT');
    if (error instanceof WorkspaceNotFoundRepositoryError)
      throw new ApplicationException('WORKSPACE_NOT_FOUND');
    if (error instanceof WorkspaceArchivedRepositoryError)
      throw new ApplicationException('WORKSPACE_ARCHIVED');
    if (error instanceof TenantNotFoundRepositoryError)
      throw new ApplicationException('TENANT_NOT_FOUND');
    if (error instanceof TenantArchivedRepositoryError)
      throw new ApplicationException('TENANT_ARCHIVED');
    if (error instanceof TenantLinkRequestNotFoundRepositoryError)
      throw new ApplicationException('TENANT_LINK_REQUEST_NOT_FOUND');
    if (error instanceof TenantLinkRequestConflictRepositoryError)
      throw new ApplicationException('TENANT_LINK_REQUEST_CONFLICT');
    if (error instanceof TenantLinkRequestInvalidTransitionRepositoryError)
      throw new ApplicationException('TENANT_LINK_REQUEST_INVALID_TRANSITION');
    if (error instanceof TenantLinkNotFoundRepositoryError)
      throw new ApplicationException('TENANT_LINK_NOT_FOUND');
    throw error;
  }
}

function toPage(
  items: TenantLinkRequestRecord[],
  total: number,
  query: TenantLinkRequestQueryDto,
): TenantLinkRequestPageResponse {
  return { items: items.map(toRequestResponse), total, page: query.page, limit: query.limit };
}

function toRequestResponse(request: TenantLinkRequestRecord): TenantLinkRequestResponse {
  return {
    id: request.id,
    workspaceId: request.workspaceId,
    tenantId: request.tenantId,
    requesterUserId: request.requesterUserId,
    status: request.status,
    message: request.message,
    decisionNote: request.decisionNote,
    decidedAt: request.decidedAt?.toISOString() ?? null,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    tenant: { id: request.tenant.id, fullName: request.tenant.fullName },
    requester: {
      id: request.requester.id,
      email: request.requester.email,
      displayName: request.requester.displayName,
    },
  };
}

function toLinkResponse(link: TenantUserLinkRecord): TenantUserLinkResponse {
  return {
    id: link.id,
    workspaceId: link.workspaceId,
    tenantId: link.tenantId,
    userId: link.userId,
    linkedAt: link.linkedAt.toISOString(),
    revokedAt: link.revokedAt?.toISOString() ?? null,
  };
}

function toAccountLinkResponse(link: TenantAccountLinkRecord): TenantAccountLinkResponse {
  return {
    ...toLinkResponse(link),
    user: { id: link.user.id, email: link.user.email, displayName: link.user.displayName },
  };
}

function toTenantResponse(tenant: TenantRecord): TenantSelfResponse {
  return {
    id: tenant.id,
    workspaceId: tenant.workspaceId,
    fullName: tenant.fullName,
    phone: tenant.phone,
    email: tenant.email,
    dateOfBirth: tenant.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    address: tenant.address,
    status: tenant.status,
    archivedAt: tenant.archivedAt?.toISOString() ?? null,
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString(),
  };
}
