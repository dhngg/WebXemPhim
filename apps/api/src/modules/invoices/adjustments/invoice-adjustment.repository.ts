import { Injectable } from '@nestjs/common';
import type { CreateInvoiceAdjustmentRequest } from '@rental/shared';
import {
  Prisma,
  type BuildingStatus,
  type InvoiceAdjustment,
  type WorkspaceStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { loadNetPaid } from '../payments/paid-total';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceNotFoundRepositoryError,
} from '../../workspaces/repositories/workspace.repository';

export class AdjustmentNotFoundRepositoryError extends Error {}
export class AdjustmentInvalidRepositoryError extends Error {}
export class AdjustmentNotEligibleRepositoryError extends Error {}
export class AdjustmentIdempotencyConflictRepositoryError extends Error {}
export class AdjustmentBelowPaidRepositoryError extends Error {}

export interface AdjustmentPage {
  items: InvoiceAdjustment[];
  total: number;
  originalTotal: Prisma.Decimal;
  adjustmentsTotal: Prisma.Decimal;
}
const serializable = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };

@Injectable()
export class InvoiceAdjustmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Appends an adjustment; a retry with the same key and payload returns the original (`replay`).
   * A serialization failure from a concurrent adjustment is retried so the loser re-evaluates
   * against the committed total and gets a proper domain error instead of a 500.
   */
  async create(
    workspaceId: string,
    actorUserId: string,
    buildingId: string,
    invoiceId: string,
    input: CreateInvoiceAdjustmentRequest,
  ): Promise<{ adjustment: InvoiceAdjustment; replay: boolean }> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.createOnce(workspaceId, actorUserId, buildingId, invoiceId, input);
      } catch (error) {
        const serialization =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
        if (!serialization || attempt >= 4) throw error;
      }
    }
  }

  private async createOnce(
    workspaceId: string,
    actorUserId: string,
    buildingId: string,
    invoiceId: string,
    input: CreateInvoiceAdjustmentRequest,
  ): Promise<{ adjustment: InvoiceAdjustment; replay: boolean }> {
    const requested = new Prisma.Decimal(input.amount);
    const amount = requested.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
    const reason = input.reason.trim();
    const sameAs = (a: InvoiceAdjustment) =>
      a.requestedAmount.equals(requested) &&
      a.reason === reason &&
      a.referenceAdjustmentId === (input.referenceAdjustmentId ?? null);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await assertScope(tx, workspaceId, actorUserId, buildingId);
        const rows = await tx.$queryRaw<Array<{ status: string; total: Prisma.Decimal | null }>>(
          Prisma.sql`SELECT "status"::text AS "status", "total_amount" AS "total" FROM "invoices" WHERE "id"=${invoiceId}::uuid AND "workspace_id"=${workspaceId}::uuid AND "building_id"=${buildingId}::uuid FOR UPDATE`,
        );
        const invoice = rows[0];
        if (!invoice) throw new AdjustmentNotFoundRepositoryError();
        const existing = await tx.invoiceAdjustment.findUnique({
          where: { invoiceId_idempotencyKey: { invoiceId, idempotencyKey: input.idempotencyKey } },
        });
        if (existing) {
          if (!sameAs(existing)) throw new AdjustmentIdempotencyConflictRepositoryError();
          return { adjustment: existing, replay: true };
        }
        if (invoice.status !== 'ISSUED' || !invoice.total)
          throw new AdjustmentNotEligibleRepositoryError();
        if (amount.isZero()) throw new AdjustmentInvalidRepositoryError();
        if (input.referenceAdjustmentId) {
          const reference = await tx.invoiceAdjustment.findFirst({
            where: { id: input.referenceAdjustmentId, invoiceId, workspaceId },
            include: { corrections: { select: { id: true } } },
          });
          if (!reference || reference.corrections.length > 0)
            throw new AdjustmentInvalidRepositoryError();
        }
        const sum = await tx.invoiceAdjustment.aggregate({
          where: { invoiceId },
          _sum: { amount: true },
        });
        const adjusted = new Prisma.Decimal(invoice.total).add(sum._sum.amount ?? 0).add(amount);
        if (adjusted.isNegative()) throw new AdjustmentInvalidRepositoryError();
        // Never push the amount due below money already received (no negative outstanding).
        if (adjusted.lessThan(await loadNetPaid(tx, invoiceId)))
          throw new AdjustmentBelowPaidRepositoryError();
        const adjustment = await tx.invoiceAdjustment.create({
          data: {
            workspaceId,
            invoiceId,
            amount,
            requestedAmount: requested,
            reason,
            referenceAdjustmentId: input.referenceAdjustmentId,
            idempotencyKey: input.idempotencyKey,
            createdBy: actorUserId,
          },
        });
        return { adjustment, replay: false };
      }, serializable);
    } catch (error) {
      // A concurrent retry lost the race on the unique key: answer from the committed row.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2034')
      ) {
        const existing = await this.prisma.invoiceAdjustment.findUnique({
          where: { invoiceId_idempotencyKey: { invoiceId, idempotencyKey: input.idempotencyKey } },
        });
        if (existing)
          if (sameAs(existing)) return { adjustment: existing, replay: true };
          else throw new AdjustmentIdempotencyConflictRepositoryError();
        if (error.code === 'P2002') throw new AdjustmentInvalidRepositoryError(); // reference already corrected
      }
      if (String((error as Error)?.message).includes('cannot fall below the amount already paid'))
        throw new AdjustmentBelowPaidRepositoryError();
      if (String((error as Error)?.message).includes('adjusted invoice total cannot be negative'))
        throw new AdjustmentInvalidRepositoryError();
      if (String((error as Error)?.message).includes('adjustments require an ISSUED invoice'))
        throw new AdjustmentNotEligibleRepositoryError();
      throw error;
    }
  }

  list(
    workspaceId: string,
    buildingId: string,
    invoiceId: string,
    page: number,
    limit: number,
  ): Promise<AdjustmentPage> {
    return this.read({ id: invoiceId, workspaceId, buildingId }, invoiceId, page, limit);
  }

  listForTenant(userId: string, invoiceId: string, page: number, limit: number) {
    return this.read(
      {
        id: invoiceId,
        status: 'ISSUED',
        contract: { tenant: { userLinks: { some: { userId, revokedAt: null } } } },
      },
      invoiceId,
      page,
      limit,
    );
  }

  async get(workspaceId: string, buildingId: string, invoiceId: string, adjustmentId: string) {
    const adjustment = await this.prisma.invoiceAdjustment.findFirst({
      where: { id: adjustmentId, invoiceId, workspaceId, invoice: { buildingId } },
    });
    if (!adjustment) throw new AdjustmentNotFoundRepositoryError();
    return adjustment;
  }

  private async read(
    invoiceWhere: Prisma.InvoiceWhereInput,
    invoiceId: string,
    page: number,
    limit: number,
  ): Promise<AdjustmentPage> {
    const invoice = await this.prisma.invoice.findFirst({
      where: invoiceWhere,
      select: { id: true, totalAmount: true, status: true },
    });
    if (!invoice) throw new AdjustmentNotFoundRepositoryError();
    const [items, total, sum] = await this.prisma.$transaction([
      this.prisma.invoiceAdjustment.findMany({
        where: { invoiceId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.invoiceAdjustment.count({ where: { invoiceId } }),
      this.prisma.invoiceAdjustment.aggregate({ where: { invoiceId }, _sum: { amount: true } }),
    ]);
    return {
      items,
      total,
      originalTotal: invoice.totalAmount ?? new Prisma.Decimal(0),
      adjustmentsTotal: sum._sum.amount ?? new Prisma.Decimal(0),
    };
  }
}

async function assertScope(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  userId: string,
  buildingId: string,
) {
  const ws = await tx.$queryRaw<Array<{ status: WorkspaceStatus }>>(
    Prisma.sql`SELECT "status" FROM "workspaces" WHERE "id"=${workspaceId}::uuid FOR SHARE`,
  );
  if (!ws[0]) throw new WorkspaceNotFoundRepositoryError();
  if (ws[0].status !== 'ACTIVE') throw new WorkspaceArchivedRepositoryError();
  const membership = await tx.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
  if (membership?.role !== 'OWNER') throw new WorkspaceNotFoundRepositoryError();
  const building = await tx.$queryRaw<Array<{ status: BuildingStatus }>>(
    Prisma.sql`SELECT "status" FROM "buildings" WHERE "id"=${buildingId}::uuid AND "workspace_id"=${workspaceId}::uuid FOR SHARE`,
  );
  if (!building[0]) throw new AdjustmentNotFoundRepositoryError();
  if (building[0].status !== 'ACTIVE') throw new AdjustmentNotEligibleRepositoryError();
}
