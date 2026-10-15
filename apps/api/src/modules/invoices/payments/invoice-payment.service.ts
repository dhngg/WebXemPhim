import { Injectable } from '@nestjs/common';
import type {
  CreateInvoicePaymentRequest,
  InvoicePaymentPageResponse,
  InvoicePaymentResponse,
  ReverseInvoicePaymentRequest,
} from '@rental/shared';
import { ApplicationException } from '../../../common/errors/application-exception';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceNotFoundRepositoryError,
} from '../../workspaces/repositories/workspace.repository';
import {
  InvoicePaymentRepository,
  PaymentExceedsDueRepositoryError,
  PaymentIdempotencyConflictRepositoryError,
  PaymentInvalidRepositoryError,
  PaymentNotEligibleRepositoryError,
  PaymentNotFoundRepositoryError,
  type PaymentPage,
  type PaymentRecord,
} from './invoice-payment.repository';
import { paymentStatus } from './paid-total';

type Written = { replay: boolean; body: InvoicePaymentResponse };

@Injectable()
export class InvoicePaymentService {
  constructor(private readonly repository: InvoicePaymentRepository) {}

  create(
    workspaceId: string,
    userId: string,
    buildingId: string,
    invoiceId: string,
    input: CreateInvoicePaymentRequest,
  ): Promise<Written> {
    return this.run(() =>
      this.repository.create(workspaceId, userId, buildingId, invoiceId, input),
    );
  }
  reverse(
    workspaceId: string,
    userId: string,
    buildingId: string,
    invoiceId: string,
    paymentId: string,
    input: ReverseInvoicePaymentRequest,
  ): Promise<Written> {
    return this.run(() =>
      this.repository.reverse(workspaceId, userId, buildingId, invoiceId, paymentId, input),
    );
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
  async get(workspaceId: string, buildingId: string, invoiceId: string, paymentId: string) {
    try {
      return toResponse(await this.repository.get(workspaceId, buildingId, invoiceId, paymentId));
    } catch (error) {
      throw mapError(error);
    }
  }
  private async run(
    operation: () => Promise<{ payment: PaymentRecord; replay: boolean }>,
  ): Promise<Written> {
    try {
      const { payment, replay } = await operation();
      return { replay, body: toResponse(payment) };
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
  if (error instanceof PaymentNotFoundRepositoryError)
    return new ApplicationException('INVOICE_PAYMENT_NOT_FOUND');
  if (error instanceof PaymentInvalidRepositoryError)
    return new ApplicationException('INVOICE_PAYMENT_INVALID');
  if (error instanceof PaymentExceedsDueRepositoryError)
    return new ApplicationException('INVOICE_PAYMENT_EXCEEDS_DUE');
  if (error instanceof PaymentNotEligibleRepositoryError)
    return new ApplicationException('INVOICE_PAYMENT_NOT_ELIGIBLE');
  if (error instanceof PaymentIdempotencyConflictRepositoryError)
    return new ApplicationException('INVOICE_PAYMENT_IDEMPOTENCY_CONFLICT');
  return error;
}

function toPage(result: PaymentPage, page: number, limit: number): InvoicePaymentPageResponse {
  return {
    items: result.items.map(toResponse),
    total: result.total,
    page,
    limit,
    amountDue: result.amountDue.toFixed(0),
    paidTotal: result.paidTotal.toFixed(0),
    outstanding: result.amountDue.sub(result.paidTotal).toFixed(0),
    paymentStatus: paymentStatus(result.amountDue, result.paidTotal),
  };
}

export function toResponse(p: PaymentRecord): InvoicePaymentResponse {
  return {
    id: p.id,
    workspaceId: p.workspaceId,
    invoiceId: p.invoiceId,
    kind: p.kind,
    amount: p.amount.toFixed(0),
    method: p.method,
    receivedAt: p.receivedAt.toISOString(),
    note: p.note,
    reversesPaymentId: p.reversesPaymentId,
    reversedByPaymentId: p.reversal?.id ?? null,
    confirmedBy: p.confirmedBy,
    createdAt: p.createdAt.toISOString(),
  };
}
