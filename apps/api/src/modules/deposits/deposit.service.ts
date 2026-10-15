import { Injectable } from '@nestjs/common';
import type {
  CreateDepositEntryRequest,
  DepositEntryResponse,
  DepositPageResponse,
  ReverseDepositEntryRequest,
} from '@rental/shared';
import { ApplicationException } from '../../common/errors/application-exception';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceNotFoundRepositoryError,
} from '../workspaces/repositories/workspace.repository';
import { ContractNotFoundRepositoryError } from '../contracts/repositories/contract.repository';
import {
  DepositArchivedOwnerOnlyRepositoryError,
  DepositEntryInvalidRepositoryError,
  DepositEntryNotFoundRepositoryError,
  DepositIdempotencyConflictRepositoryError,
  DepositInsufficientBalanceRepositoryError,
  DepositNotEligibleRepositoryError,
  DepositRepository,
  type DepositEntryRecord,
  type DepositPage,
} from './deposit.repository';

type Written = { replay: boolean; body: DepositEntryResponse };

@Injectable()
export class DepositService {
  constructor(private readonly repository: DepositRepository) {}

  create(
    workspaceId: string,
    userId: string,
    contractId: string,
    input: CreateDepositEntryRequest,
  ) {
    return this.run(() => this.repository.create(workspaceId, userId, contractId, input));
  }
  reverse(
    workspaceId: string,
    userId: string,
    contractId: string,
    entryId: string,
    input: ReverseDepositEntryRequest,
  ) {
    return this.run(() => this.repository.reverse(workspaceId, userId, contractId, entryId, input));
  }
  async list(workspaceId: string, contractId: string, page: number, limit: number) {
    try {
      return toPage(
        await this.repository.list(workspaceId, contractId, page, limit),
        contractId,
        page,
        limit,
      );
    } catch (error) {
      throw mapError(error);
    }
  }
  async listForTenant(userId: string, contractId: string, page: number, limit: number) {
    try {
      return toPage(
        await this.repository.listForTenant(userId, contractId, page, limit),
        contractId,
        page,
        limit,
      );
    } catch (error) {
      throw mapError(error);
    }
  }
  async get(workspaceId: string, contractId: string, entryId: string) {
    try {
      return toResponse(await this.repository.get(workspaceId, contractId, entryId));
    } catch (error) {
      throw mapError(error);
    }
  }
  private async run(
    operation: () => Promise<{ entry: DepositEntryRecord; replay: boolean }>,
  ): Promise<Written> {
    try {
      const { entry, replay } = await operation();
      return { replay, body: toResponse(entry) };
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
  if (error instanceof DepositEntryNotFoundRepositoryError)
    return new ApplicationException('DEPOSIT_ENTRY_NOT_FOUND');
  if (error instanceof DepositArchivedOwnerOnlyRepositoryError)
    return new ApplicationException('DEPOSIT_ARCHIVED_OWNER_ONLY');
  if (error instanceof DepositEntryInvalidRepositoryError)
    return new ApplicationException('DEPOSIT_ENTRY_INVALID');
  if (error instanceof DepositInsufficientBalanceRepositoryError)
    return new ApplicationException('DEPOSIT_INSUFFICIENT_BALANCE');
  if (error instanceof DepositNotEligibleRepositoryError)
    return new ApplicationException('DEPOSIT_NOT_ELIGIBLE');
  if (error instanceof DepositIdempotencyConflictRepositoryError)
    return new ApplicationException('DEPOSIT_IDEMPOTENCY_CONFLICT');
  return error;
}

function toPage(
  result: DepositPage,
  contractId: string,
  page: number,
  limit: number,
): DepositPageResponse {
  return {
    contractId,
    collectedTotal: result.totals.collected.toFixed(0),
    deductedTotal: result.totals.deducted.toFixed(0),
    refundedTotal: result.totals.refunded.toFixed(0),
    balance: result.totals.balance.toFixed(0),
    items: result.items.map(toResponse),
    total: result.total,
    page,
    limit,
  };
}

export function toResponse(e: DepositEntryRecord): DepositEntryResponse {
  return {
    id: e.id,
    workspaceId: e.workspaceId,
    contractId: e.contractId,
    kind: e.kind,
    amount: e.amount.toFixed(0),
    method: e.method,
    occurredAt: e.occurredAt.toISOString(),
    reason: e.reason,
    reference: e.reference,
    note: e.note,
    reversesEntryId: e.reversesEntryId,
    reversedByEntryId: e.reversal?.id ?? null,
    createdBy: e.createdBy,
    createdAt: e.createdAt.toISOString(),
  };
}
