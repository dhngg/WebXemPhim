import { Injectable } from '@nestjs/common';
import type {
  CreateInvoiceRequest,
  InvoiceMissingItem,
  InvoicePageResponse,
  InvoiceResponse,
  UpdateInvoiceRequest,
} from '@rental/shared';
import { Prisma } from '../../../generated/prisma/client';
import { netPaid, paymentStatus } from '../payments/paid-total';
import { ApplicationException } from '../../../common/errors/application-exception';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceNotFoundRepositoryError,
} from '../../workspaces/repositories/workspace.repository';
import { ContractNotFoundRepositoryError } from '../../contracts/repositories/contract.repository';
import type { InvoiceQueryDto, TenantInvoiceQueryDto } from '../dto/invoice.dto';
import {
  InvoiceDuplicateRepositoryError,
  InvoiceIncompleteRepositoryError,
  InvoiceNotEditableRepositoryError,
  InvoiceNotEligibleRepositoryError,
  InvoiceVehicleBillingConflictRepositoryError,
  InvoiceNotFoundRepositoryError,
  InvoicePeriodInvalidRepositoryError,
  InvoiceRepository,
  type InvoiceRecord,
} from '../repositories/invoice.repository';

@Injectable()
export class InvoiceService {
  constructor(private readonly repository: InvoiceRepository) {}

  create(workspaceId: string, userId: string, buildingId: string, input: CreateInvoiceRequest) {
    if (input.dueDate && !validDate(input.dueDate))
      throw new ApplicationException('VALIDATION_ERROR');
    return this.run(() => this.repository.create(workspaceId, userId, buildingId, input));
  }
  async list(workspaceId: string, buildingId: string, query: InvoiceQueryDto) {
    return this.page(await this.repository.list(workspaceId, buildingId, query), query);
  }
  get(workspaceId: string, buildingId: string, invoiceId: string) {
    return this.run(() => this.repository.get(workspaceId, buildingId, invoiceId));
  }
  update(
    workspaceId: string,
    userId: string,
    buildingId: string,
    invoiceId: string,
    input: UpdateInvoiceRequest,
  ) {
    if (input.dueDate && !validDate(input.dueDate))
      throw new ApplicationException('VALIDATION_ERROR');
    return this.run(() =>
      this.repository.update(workspaceId, userId, buildingId, invoiceId, input),
    );
  }
  issue(workspaceId: string, userId: string, buildingId: string, invoiceId: string) {
    return this.run(() => this.repository.issue(workspaceId, userId, buildingId, invoiceId));
  }
  async remove(workspaceId: string, userId: string, buildingId: string, invoiceId: string) {
    try {
      await this.repository.deleteDraft(workspaceId, userId, buildingId, invoiceId);
    } catch (error) {
      throw mapError(error);
    }
  }
  async listForTenant(userId: string, query: TenantInvoiceQueryDto) {
    return this.page(await this.repository.listForTenant(userId, query), query);
  }
  getForTenant(userId: string, invoiceId: string) {
    return this.run(() => this.repository.getForTenant(userId, invoiceId));
  }

  private page(
    result: { items: InvoiceRecord[]; total: number },
    query: { page: number; limit: number },
  ): InvoicePageResponse {
    return {
      items: result.items.map(toResponse),
      total: result.total,
      page: query.page,
      limit: query.limit,
    };
  }
  private async run(operation: () => Promise<InvoiceRecord>): Promise<InvoiceResponse> {
    try {
      return toResponse(await operation());
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
  if (error instanceof InvoiceNotFoundRepositoryError)
    return new ApplicationException('INVOICE_NOT_FOUND');
  if (error instanceof InvoiceDuplicateRepositoryError)
    return new ApplicationException('INVOICE_DUPLICATE');
  if (error instanceof InvoiceNotEditableRepositoryError)
    return new ApplicationException('INVOICE_NOT_EDITABLE');
  if (error instanceof InvoiceIncompleteRepositoryError)
    return new ApplicationException('INVOICE_INCOMPLETE');
  if (error instanceof InvoicePeriodInvalidRepositoryError)
    return new ApplicationException('INVOICE_PERIOD_INVALID');
  if (error instanceof InvoiceVehicleBillingConflictRepositoryError)
    return new ApplicationException('INVOICE_VEHICLE_BILLING_CONFLICT');
  if (error instanceof InvoiceNotEligibleRepositoryError)
    return new ApplicationException('INVOICE_NOT_ELIGIBLE');
  return error;
}

const validDate = (v: string) => {
  const d = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

export function toResponse(invoice: InvoiceRecord): InvoiceResponse {
  const missingItems = (invoice.missingItems ?? []) as unknown as InvoiceMissingItem[];
  const issued = invoice.status === 'ISSUED';
  const adjustments = (invoice.adjustments ?? []).reduce(
    (acc, a) => acc.add(a.amount),
    new Prisma.Decimal(0),
  );
  const sum = invoice.items.reduce((acc, i) => acc.add(i.amount), new Prisma.Decimal(0));
  return {
    id: invoice.id,
    workspaceId: invoice.workspaceId,
    buildingId: invoice.buildingId,
    roomId: invoice.roomId,
    contractId: invoice.contractId,
    period: invoice.period.toISOString().slice(0, 7),
    status: invoice.status,
    tenantId: invoice.tenantId,
    occupantCount: invoice.occupantCount,
    occupantCountConfirmedBy: invoice.occupantCountConfirmedBy,
    occupantCountConfirmedAt: invoice.occupantCountConfirmedAt?.toISOString() ?? null,
    billsVehicles: invoice.billsVehicles,
    dueDate: invoice.dueDate?.toISOString().slice(0, 10) ?? null,
    notes: invoice.notes,
    missingItems,
    isComplete: missingItems.length === 0,
    totalAmount: issued && invoice.totalAmount ? invoice.totalAmount.toFixed(0) : null,
    provisionalAmount: issued ? null : sum.toFixed(0),
    roundingRule: invoice.roundingRule,
    adjustmentsTotal: issued ? adjustments.toFixed(0) : null,
    paidTotal: issued ? netPaid(invoice.payments ?? []).toFixed(0) : null,
    outstanding:
      issued && invoice.totalAmount
        ? invoice.totalAmount
            .add(adjustments)
            .sub(netPaid(invoice.payments ?? []))
            .toFixed(0)
        : null,
    paymentStatus:
      issued && invoice.totalAmount
        ? paymentStatus(invoice.totalAmount.add(adjustments), netPaid(invoice.payments ?? []))
        : null,
    adjustedTotal:
      issued && invoice.totalAmount ? invoice.totalAmount.add(adjustments).toFixed(0) : null,
    items: invoice.items.map((i) => ({
      id: i.id,
      sortOrder: i.sortOrder,
      itemType: i.itemType,
      code: i.code,
      description: i.description,
      unit: i.unit,
      quantity: i.quantity.toFixed(3),
      unitPrice: i.unitPrice.toFixed(4),
      prorationNumerator: i.prorationNumerator,
      prorationDenominator: i.prorationDenominator,
      amount: i.amount.toFixed(0),
      ratePlanId: i.ratePlanId,
      meterReadingId: i.meterReadingId,
      meterRevision: i.meterRevision,
      details: (i.details ?? {}) as Record<string, unknown>,
    })),
    issuedAt: invoice.issuedAt?.toISOString() ?? null,
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
  };
}
