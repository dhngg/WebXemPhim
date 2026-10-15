import { Injectable } from '@nestjs/common';
import type {
  CreateInvoiceAdjustmentRequest,
  InvoiceAdjustmentPageResponse,
  InvoiceAdjustmentResponse,
} from '@rental/shared';
import type { InvoiceAdjustment } from '../../../generated/prisma/client';
import { ApplicationException } from '../../../common/errors/application-exception';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceNotFoundRepositoryError,
} from '../../workspaces/repositories/workspace.repository';
import {
  AdjustmentBelowPaidRepositoryError,
  AdjustmentIdempotencyConflictRepositoryError,
  AdjustmentInvalidRepositoryError,
  AdjustmentNotEligibleRepositoryError,
  AdjustmentNotFoundRepositoryError,
  InvoiceAdjustmentRepository,
  type AdjustmentPage,
} from './invoice-adjustment.repository';

@Injectable()
export class InvoiceAdjustmentService {
  constructor(private readonly repository: InvoiceAdjustmentRepository) {}

  async create(
    workspaceId: string,
    userId: string,
    buildingId: string,
    invoiceId: string,
    input: CreateInvoiceAdjustmentRequest,
  ): Promise<{ replay: boolean; body: InvoiceAdjustmentResponse }> {
    try {
      const { adjustment, replay } = await this.repository.create(
        workspaceId,
        userId,
        buildingId,
        invoiceId,
        input,
      );
      return { replay, body: toResponse(adjustment) };
    } catch (error) {
      throw mapError(error);
    }
  }
  async list(
    workspaceId: string,
    buildingId: string,
    invoiceId: string,
    page: number,
    limit: number,
  ) {
    try {
      return toPage(
        await this.repository.list(workspaceId, buildingId, invoiceId, page, limit),
        page,
        limit,
      );
    } catch (error) {
      throw mapError(error);
    }
  }
  async listForTenant(userId: string, invoiceId: string, page: number, limit: number) {
    try {
      return toPage(
        await this.repository.listForTenant(userId, invoiceId, page, limit),
        page,
        limit,
      );
    } catch (error) {
      throw mapError(error);
    }
  }
  async get(workspaceId: string, buildingId: string, invoiceId: string, adjustmentId: string) {
    try {
      return toResponse(
        await this.repository.get(workspaceId, buildingId, invoiceId, adjustmentId),
      );
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
  if (error instanceof AdjustmentNotFoundRepositoryError)
    return new ApplicationException('INVOICE_ADJUSTMENT_NOT_FOUND');
  if (error instanceof AdjustmentBelowPaidRepositoryError)
    return new ApplicationException('INVOICE_ADJUSTMENT_BELOW_PAID');
  if (error instanceof AdjustmentInvalidRepositoryError)
    return new ApplicationException('INVOICE_ADJUSTMENT_INVALID');
  if (error instanceof AdjustmentNotEligibleRepositoryError)
    return new ApplicationException('INVOICE_ADJUSTMENT_NOT_ELIGIBLE');
  if (error instanceof AdjustmentIdempotencyConflictRepositoryError)
    return new ApplicationException('INVOICE_ADJUSTMENT_IDEMPOTENCY_CONFLICT');
  return error;
}

function toPage(
  result: AdjustmentPage,
  page: number,
  limit: number,
): InvoiceAdjustmentPageResponse {
  return {
    items: result.items.map(toResponse),
    total: result.total,
    page,
    limit,
    originalTotal: result.originalTotal.toFixed(0),
    adjustmentsTotal: result.adjustmentsTotal.toFixed(0),
    adjustedTotal: result.originalTotal.add(result.adjustmentsTotal).toFixed(0),
  };
}

export function toResponse(a: InvoiceAdjustment): InvoiceAdjustmentResponse {
  return {
    id: a.id,
    workspaceId: a.workspaceId,
    invoiceId: a.invoiceId,
    amount: a.amount.toFixed(0),
    requestedAmount: a.requestedAmount.toFixed(4),
    reason: a.reason,
    referenceAdjustmentId: a.referenceAdjustmentId,
    createdBy: a.createdBy,
    createdAt: a.createdAt.toISOString(),
  };
}
