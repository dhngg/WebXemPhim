import { Injectable } from '@nestjs/common';
import type {
  CreateTenantRequest,
  TenantPageResponse,
  TenantResponse,
  UpdateTenantRequest,
} from '@rental/shared';
import { ApplicationException } from '../../../common/errors/application-exception';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceNotFoundRepositoryError,
} from '../../workspaces/repositories/workspace.repository';
import type { TenantQueryDto } from '../dto/tenant.dto';
import {
  TenantArchivedRepositoryError,
  TenantHasActiveContractRepositoryError,
  TenantNotFoundRepositoryError,
  TenantRepository,
  type TenantRecord,
} from '../repositories/tenant.repository';

@Injectable()
export class TenantService {
  constructor(private readonly repository: TenantRepository) {}

  create(workspaceId: string, userId: string, input: CreateTenantRequest): Promise<TenantResponse> {
    validateBirthDate(input.dateOfBirth);
    return this.write(() => this.repository.create(workspaceId, userId, input));
  }

  async list(workspaceId: string, query: TenantQueryDto): Promise<TenantPageResponse> {
    const { items, total } = await this.repository.list(workspaceId, query);
    return { items: items.map(toResponse), total, page: query.page, limit: query.limit };
  }

  async detail(workspaceId: string, tenantId: string): Promise<TenantResponse> {
    const tenant = await this.repository.detail(workspaceId, tenantId);
    if (!tenant) throw new ApplicationException('TENANT_NOT_FOUND');
    return toResponse(tenant);
  }

  update(
    workspaceId: string,
    userId: string,
    tenantId: string,
    input: UpdateTenantRequest,
  ): Promise<TenantResponse> {
    if (!Object.values(input).some((value) => value !== undefined))
      throw new ApplicationException('VALIDATION_ERROR');
    validateBirthDate(input.dateOfBirth ?? undefined);
    return this.write(() => this.repository.update(workspaceId, userId, tenantId, input));
  }

  archive(workspaceId: string, userId: string, tenantId: string): Promise<TenantResponse> {
    return this.write(() => this.repository.setArchived(workspaceId, userId, tenantId, true));
  }

  restore(workspaceId: string, userId: string, tenantId: string): Promise<TenantResponse> {
    return this.write(() => this.repository.setArchived(workspaceId, userId, tenantId, false));
  }

  private async write(operation: () => Promise<TenantRecord>): Promise<TenantResponse> {
    try {
      return toResponse(await operation());
    } catch (error) {
      if (error instanceof WorkspaceNotFoundRepositoryError)
        throw new ApplicationException('WORKSPACE_NOT_FOUND');
      if (error instanceof WorkspaceArchivedRepositoryError)
        throw new ApplicationException('WORKSPACE_ARCHIVED');
      if (error instanceof TenantNotFoundRepositoryError)
        throw new ApplicationException('TENANT_NOT_FOUND');
      if (error instanceof TenantHasActiveContractRepositoryError)
        throw new ApplicationException('TENANT_HAS_ACTIVE_CONTRACT');
      if (error instanceof TenantArchivedRepositoryError)
        throw new ApplicationException('TENANT_ARCHIVED');
      throw error;
    }
  }
}

function validateBirthDate(value?: string): void {
  if (!value) return;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ApplicationException('VALIDATION_ERROR');
  }
  const today = new Date().toISOString().slice(0, 10);
  if (value > today) throw new ApplicationException('VALIDATION_ERROR');
}

function toResponse(tenant: TenantRecord): TenantResponse {
  return {
    id: tenant.id,
    workspaceId: tenant.workspaceId,
    fullName: tenant.fullName,
    phone: tenant.phone,
    email: tenant.email,
    dateOfBirth: tenant.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    address: tenant.address,
    notes: tenant.notes,
    status: tenant.status,
    archivedAt: tenant.archivedAt?.toISOString() ?? null,
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString(),
  };
}
