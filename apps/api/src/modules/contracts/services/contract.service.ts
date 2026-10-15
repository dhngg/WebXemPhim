import { Injectable } from '@nestjs/common';
import {
  contractPhase,
  type ContractPageResponse,
  ContractResponse,
  CreateContractRequest,
  EndContractRequest,
  UpdateContractRequest,
} from '@rental/shared';
import { ApplicationException } from '../../../common/errors/application-exception';
import { businessToday } from '../../../common/time/business-date';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceNotFoundRepositoryError,
} from '../../workspaces/repositories/workspace.repository';
import type { ContractQueryDto } from '../dto/contract.dto';
import {
  ContractConflictRepositoryError,
  ContractEndDateRequiredRepositoryError,
  ContractInvalidTransitionRepositoryError,
  ContractNotEligibleRepositoryError,
  ContractNotFoundRepositoryError,
  ContractRepository,
  type ContractRecord,
} from '../repositories/contract.repository';

@Injectable()
export class ContractService {
  constructor(private readonly repository: ContractRepository) {}

  create(workspaceId: string, userId: string, input: CreateContractRequest) {
    this.validateActivePeriod(input.startDate, input.endDate);
    return this.execute(() => this.repository.create(workspaceId, userId, input));
  }
  async list(workspaceId: string, query: ContractQueryDto): Promise<ContractPageResponse> {
    const { items, total } = await this.repository.list(workspaceId, query);
    return { items: items.map(toResponse), total, page: query.page, limit: query.limit };
  }
  async listForTenantUser(userId: string, query: ContractQueryDto): Promise<ContractPageResponse> {
    const { items, total } = await this.repository.listForTenantUser(userId, query);
    return { items: items.map(toResponse), total, page: query.page, limit: query.limit };
  }
  async detailForTenantUser(userId: string, contractId: string) {
    const result = await this.repository.detailForTenantUser(userId, contractId);
    if (!result) throw new ApplicationException('CONTRACT_NOT_FOUND');
    return toResponse(result);
  }
  async detail(workspaceId: string, contractId: string) {
    const result = await this.repository.detail(workspaceId, contractId);
    if (!result) throw new ApplicationException('CONTRACT_NOT_FOUND');
    return toResponse(result);
  }
  update(workspaceId: string, userId: string, contractId: string, input: UpdateContractRequest) {
    if (!Object.values(input).some((value) => value !== undefined))
      throw new ApplicationException('VALIDATION_ERROR');
    if (input.startDate && !validDate(input.startDate))
      throw new ApplicationException('VALIDATION_ERROR');
    if (input.endDate && !validDate(input.endDate))
      throw new ApplicationException('VALIDATION_ERROR');
    return this.execute(() => this.repository.update(workspaceId, userId, contractId, input));
  }
  end(workspaceId: string, userId: string, contractId: string, input: EndContractRequest) {
    if (input.endDate !== undefined && !validDate(input.endDate))
      throw new ApplicationException('VALIDATION_ERROR');
    return this.execute(() => this.repository.end(workspaceId, userId, contractId, input));
  }

  /** A new ACTIVE contract may start in the future, but cannot already be past its end (business dates). */
  private validateActivePeriod(start: string, end: string) {
    if (!validDate(start) || !validDate(end)) throw new ApplicationException('VALIDATION_ERROR');
    if (start > end || end < businessToday())
      throw new ApplicationException('CONTRACT_NOT_ELIGIBLE');
  }
  private async execute(operation: () => Promise<ContractRecord>): Promise<ContractResponse> {
    try {
      return toResponse(await operation());
    } catch (error) {
      if (error instanceof WorkspaceNotFoundRepositoryError)
        throw new ApplicationException('WORKSPACE_NOT_FOUND');
      if (error instanceof WorkspaceArchivedRepositoryError)
        throw new ApplicationException('WORKSPACE_ARCHIVED');
      if (error instanceof ContractNotFoundRepositoryError)
        throw new ApplicationException('CONTRACT_NOT_FOUND');
      if (error instanceof ContractConflictRepositoryError)
        throw new ApplicationException('CONTRACT_CONFLICT');
      if (error instanceof ContractEndDateRequiredRepositoryError)
        throw new ApplicationException('VALIDATION_ERROR');
      if (error instanceof ContractInvalidTransitionRepositoryError)
        throw new ApplicationException('CONTRACT_INVALID_TRANSITION');
      if (error instanceof ContractNotEligibleRepositoryError)
        throw new ApplicationException('CONTRACT_NOT_ELIGIBLE');
      throw error;
    }
  }
}

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const validDate = (value: string) =>
  !Number.isNaN(date(value).getTime()) && date(value).toISOString().slice(0, 10) === value;
function toResponse(contract: ContractRecord): ContractResponse {
  const startDate = contract.startDate.toISOString().slice(0, 10);
  const endDate = contract.endDate.toISOString().slice(0, 10);
  const phase = contractPhase(
    { status: contract.status, startDate, endDate, endedAt: contract.endedAt },
    businessToday(),
  );
  return {
    id: contract.id,
    workspaceId: contract.workspaceId,
    roomId: contract.roomId,
    tenantId: contract.tenantId,
    startDate,
    endDate,
    monthlyRent: contract.monthlyRent.toFixed(2),
    status: contract.status,
    phase,
    notes: contract.notes,
    endedAt: contract.endedAt?.toISOString() ?? null,
    createdAt: contract.createdAt.toISOString(),
    updatedAt: contract.updatedAt.toISOString(),
    room: contract.room,
    tenant: contract.tenant,
  };
}
