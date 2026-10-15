import { Injectable } from '@nestjs/common';
import type {
  CreateMaintenanceRequestRequest,
  CreateTenantMaintenanceRequest,
  MaintenanceRequestPageResponse,
  MaintenanceRequestResponse,
  TransitionMaintenanceRequest,
  UpdateMaintenanceRequestRequest,
} from '@rental/shared';
import type { MaintenanceRequest, MaintenanceStatusHistory } from '../../generated/prisma/client';
import { ApplicationException } from '../../common/errors/application-exception';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceNotFoundRepositoryError,
} from '../workspaces/repositories/workspace.repository';
import { ContractNotFoundRepositoryError } from '../contracts/repositories/contract.repository';
import {
  MaintenanceInvalidTransitionRepositoryError,
  MaintenanceNotCancellableRepositoryError,
  MaintenanceNotEditableRepositoryError,
  MaintenanceNoteRequiredRepositoryError,
  MaintenanceNotEligibleRepositoryError,
  MaintenanceNotFoundRepositoryError,
  MaintenanceRepository,
} from './maintenance.repository';
import type { MaintenanceQueryDto, TenantMaintenanceQueryDto } from './maintenance.dto';

type Row = MaintenanceRequest & { history?: MaintenanceStatusHistory[] };

@Injectable()
export class MaintenanceService {
  constructor(private readonly repository: MaintenanceRepository) {}

  create(
    workspaceId: string,
    userId: string,
    buildingId: string,
    input: CreateMaintenanceRequestRequest,
  ) {
    return this.run(() => this.repository.create(workspaceId, userId, buildingId, input), false);
  }
  createForTenant(userId: string, input: CreateTenantMaintenanceRequest) {
    return this.run(() => this.repository.createForTenant(userId, input), true);
  }
  async list(workspaceId: string, buildingId: string, query: MaintenanceQueryDto) {
    const { items, total } = await this.repository.list(workspaceId, buildingId, query);
    return page(items, total, query, false);
  }
  async listForTenant(userId: string, query: TenantMaintenanceQueryDto) {
    const { items, total } = await this.repository.listForTenant(userId, query);
    return page(items, total, query, true);
  }
  get(workspaceId: string, buildingId: string, id: string) {
    return this.run(() => this.repository.get(workspaceId, buildingId, id), false);
  }
  getForTenant(userId: string, id: string) {
    return this.run(() => this.repository.getForTenant(userId, id), true);
  }
  cancelForTenant(userId: string, id: string, reason?: string) {
    return this.run(() => this.repository.cancelForTenant(userId, id, reason), true);
  }
  update(
    workspaceId: string,
    userId: string,
    buildingId: string,
    id: string,
    input: UpdateMaintenanceRequestRequest,
  ) {
    return this.run(
      () => this.repository.update(workspaceId, userId, buildingId, id, input),
      false,
    );
  }
  transition(
    workspaceId: string,
    userId: string,
    buildingId: string,
    id: string,
    input: TransitionMaintenanceRequest,
  ) {
    return this.run(
      () => this.repository.transition(workspaceId, userId, buildingId, id, input),
      false,
    );
  }
  private async run(operation: () => Promise<Row>, tenant: boolean) {
    try {
      return toResponse(await operation(), tenant);
    } catch (error) {
      throw mapError(error);
    }
  }
}

function mapError(error: unknown) {
  if (error instanceof WorkspaceNotFoundRepositoryError)
    return new ApplicationException('WORKSPACE_NOT_FOUND');
  if (error instanceof WorkspaceArchivedRepositoryError)
    return new ApplicationException('WORKSPACE_ARCHIVED');
  if (error instanceof ContractNotFoundRepositoryError)
    return new ApplicationException('CONTRACT_NOT_FOUND');
  if (error instanceof MaintenanceNoteRequiredRepositoryError)
    return new ApplicationException('VALIDATION_ERROR');
  if (error instanceof MaintenanceNotFoundRepositoryError)
    return new ApplicationException('MAINTENANCE_NOT_FOUND');
  if (error instanceof MaintenanceInvalidTransitionRepositoryError)
    return new ApplicationException('MAINTENANCE_INVALID_TRANSITION');
  if (error instanceof MaintenanceNotCancellableRepositoryError)
    return new ApplicationException('MAINTENANCE_NOT_CANCELLABLE');
  if (error instanceof MaintenanceNotEditableRepositoryError)
    return new ApplicationException('MAINTENANCE_NOT_EDITABLE');
  if (error instanceof MaintenanceNotEligibleRepositoryError)
    return new ApplicationException('MAINTENANCE_NOT_ELIGIBLE');
  return error;
}

function page(
  items: Row[],
  total: number,
  query: { page: number; limit: number },
  tenant: boolean,
): MaintenanceRequestPageResponse {
  return {
    items: items.map((i) => ({ ...toResponse(i, tenant), history: undefined })),
    total,
    page: query.page,
    limit: query.limit,
  };
}

/** Tenants never see who is assigned or which staff member changed a status. */
export function toResponse(r: Row, tenant: boolean): MaintenanceRequestResponse {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    buildingId: r.buildingId,
    roomId: r.roomId,
    contractId: r.contractId,
    tenantId: r.tenantId,
    requestedBy: tenant ? null : r.requestedBy,
    title: r.title,
    description: r.description,
    priority: r.priority,
    status: r.status,
    assigneeUserId: tenant ? null : r.assigneeUserId,
    resolutionNote: r.resolutionNote,
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
    closedAt: r.closedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    history: r.history?.map((h) => ({
      id: h.id,
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      priority: h.priority,
      assigneeUserId: tenant ? null : h.assigneeUserId,
      note: h.note,
      changedBy: tenant ? null : h.changedBy,
      createdAt: h.createdAt.toISOString(),
    })),
  };
}
