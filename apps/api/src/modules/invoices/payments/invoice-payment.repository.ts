import { Injectable } from '@nestjs/common';
import type { CreateInvoicePaymentRequest, ReverseInvoicePaymentRequest } from '@rental/shared';
import {
  Prisma,
  type BuildingStatus,
  type InvoicePayment,
  type WorkspaceStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceNotFoundRepositoryError,
} from '../../workspaces/repositories/workspace.repository';
import { loadNetPaid } from './paid-total';

export class PaymentNotFoundRepositoryError extends Error {}
export class PaymentInvalidRepositoryError extends Error {}
export class PaymentExceedsDueRepositoryError extends Error {}
export class PaymentNotEligibleRepositoryError extends Error {}
export class PaymentIdempotencyConflictRepositoryError extends Error {}

export type PaymentRecord = InvoicePayment & { reversal: { id: string } | null };
export interface PaymentPage {
  items: PaymentRecord[];
  total: number;
  amountDue: Prisma.Decimal;
  paidTotal: Prisma.Decimal;
}
const serializable = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };
const include = { reversal: { select: { id: true } } };
/** Allowed clock skew when checking that money was not received "in the future". */
const FUTURE_TOLERANCE_MS = 5 * 60_000;

@Injectable()
export class InvoicePaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Records money received. An identical retry returns the original entry (`replay`). */
  create(
    workspaceId: string,
    actorUserId: string,
    buildingId: string,
    invoiceId: string,
    input: CreateInvoicePaymentRequest,
  ) {
    const amount = new Prisma.Decimal(input.amount);
    const receivedAt = new Date(input.receivedAt);
    const note = input.note?.trim() || null;
    const same = (e: InvoicePayment) =>
      e.kind === 'PAYMENT' &&
      e.amount.equals(amount) &&
      e.method === input.method &&
      e.receivedAt.getTime() === receivedAt.getTime() &&
      e.note === note;
    return this.write(
      workspaceId,
      actorUserId,
      buildingId,
      invoiceId,
      input.idempotencyKey,
      same,
      async (tx, invoice) => {
        if (
          Number.isNaN(receivedAt.getTime()) ||
          receivedAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS
        )
          throw new PaymentInvalidRepositoryError();
        const adjustments = await tx.invoiceAdjustment.aggregate({
          where: { invoiceId },
          _sum: { amount: true },
        });
        const amountDue = invoice.total.add(adjustments._sum.amount ?? 0);
        const paid = await loadNetPaid(tx, invoiceId);
        if (paid.add(amount).greaterThan(amountDue)) throw new PaymentExceedsDueRepositoryError();
        return tx.invoicePayment.create({
          data: {
            workspaceId,
            invoiceId,
            kind: 'PAYMENT',
            amount,
            method: input.method,
            receivedAt,
            note,
            idempotencyKey: input.idempotencyKey,
            confirmedBy: actorUserId,
          },
          include,
        });
      },
    );
  }

  /** Undoes a mistaken confirmation with a full, audited REVERSAL entry. */
  reverse(
    workspaceId: string,
    actorUserId: string,
    buildingId: string,
    invoiceId: string,
    paymentId: string,
    input: ReverseInvoicePaymentRequest,
  ) {
    const reason = input.reason.trim();
    const same = (e: InvoicePayment) =>
      e.kind === 'REVERSAL' && e.reversesPaymentId === paymentId && e.note === reason;
    return this.write(
      workspaceId,
      actorUserId,
      buildingId,
      invoiceId,
      input.idempotencyKey,
      same,
      async (tx) => {
        const original = await tx.invoicePayment.findFirst({
          where: { id: paymentId, invoiceId, workspaceId },
          include,
        });
        if (!original) throw new PaymentNotFoundRepositoryError();
        if (original.kind !== 'PAYMENT' || original.reversal)
          throw new PaymentInvalidRepositoryError();
        return tx.invoicePayment.create({
          data: {
            workspaceId,
            invoiceId,
            kind: 'REVERSAL',
            amount: original.amount,
            method: original.method,
            receivedAt: new Date(),
            note: reason,
            reversesPaymentId: paymentId,
            idempotencyKey: input.idempotencyKey,
            confirmedBy: actorUserId,
          },
          include,
        });
      },
    );
  }

  async list(
    workspaceId: string,
    buildingId: string,
    invoiceId: string,
    page: number,
    limit: number,
  ) {
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

  async get(workspaceId: string, buildingId: string, invoiceId: string, paymentId: string) {
    const payment = await this.prisma.invoicePayment.findFirst({
      where: { id: paymentId, invoiceId, workspaceId, invoice: { buildingId } },
      include,
    });
    if (!payment) throw new PaymentNotFoundRepositoryError();
    return payment;
  }

  private async write(
    workspaceId: string,
    actorUserId: string,
    buildingId: string,
    invoiceId: string,
    idempotencyKey: string,
    same: (e: InvoicePayment) => boolean,
    action: (
      tx: Prisma.TransactionClient,
      invoice: { total: Prisma.Decimal },
    ) => Promise<PaymentRecord>,
  ): Promise<{ payment: PaymentRecord; replay: boolean }> {
    const lookup = () =>
      this.prisma.invoicePayment.findUnique({
        where: { invoiceId_idempotencyKey: { invoiceId, idempotencyKey } },
        include,
      });
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          await assertScope(tx, workspaceId, actorUserId, buildingId);
          const rows = await tx.$queryRaw<Array<{ status: string; total: Prisma.Decimal | null }>>(
            Prisma.sql`SELECT "status"::text AS "status", "total_amount" AS "total" FROM "invoices" WHERE "id"=${invoiceId}::uuid AND "workspace_id"=${workspaceId}::uuid AND "building_id"=${buildingId}::uuid FOR UPDATE`,
          );
          const invoice = rows[0];
          if (!invoice) throw new PaymentNotFoundRepositoryError();
          const existing = await tx.invoicePayment.findUnique({
            where: { invoiceId_idempotencyKey: { invoiceId, idempotencyKey } },
            include,
          });
          if (existing) {
            if (!same(existing)) throw new PaymentIdempotencyConflictRepositoryError();
            return { payment: existing, replay: true };
          }
          if (invoice.status !== 'ISSUED' || !invoice.total)
            throw new PaymentNotEligibleRepositoryError();
          return {
            payment: await action(tx, { total: new Prisma.Decimal(invoice.total) }),
            replay: false,
          };
        }, serializable);
      } catch (error) {
        const known = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : null;
        if (known === 'P2002' || known === 'P2034') {
          // A concurrent request with the same key may have committed first: answer from it.
          const existing = await lookup();
          if (existing)
            if (same(existing)) return { payment: existing, replay: true };
            else throw new PaymentIdempotencyConflictRepositoryError();
          if (known === 'P2034' && attempt < 4) continue;
          if (known === 'P2002') throw new PaymentInvalidRepositoryError(); // payment already reversed
        }
        const text = String((error as Error)?.message);
        if (text.includes('payments cannot exceed the amount due'))
          throw new PaymentExceedsDueRepositoryError();
        if (text.includes('a reversal must fully reverse'))
          throw new PaymentInvalidRepositoryError();
        if (text.includes('payments require an ISSUED invoice'))
          throw new PaymentNotEligibleRepositoryError();
        throw error;
      }
    }
  }

  private async read(
    invoiceWhere: Prisma.InvoiceWhereInput,
    invoiceId: string,
    page: number,
    limit: number,
  ): Promise<PaymentPage> {
    const invoice = await this.prisma.invoice.findFirst({
      where: invoiceWhere,
      select: { totalAmount: true },
    });
    if (!invoice) throw new PaymentNotFoundRepositoryError();
    const [items, total, adjustments, paidTotal] = await Promise.all([
      this.prisma.invoicePayment.findMany({
        where: { invoiceId },
        include,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.invoicePayment.count({ where: { invoiceId } }),
      this.prisma.invoiceAdjustment.aggregate({ where: { invoiceId }, _sum: { amount: true } }),
      loadNetPaid(this.prisma, invoiceId),
    ]);
    return {
      items,
      total,
      amountDue: (invoice.totalAmount ?? new Prisma.Decimal(0)).add(adjustments._sum.amount ?? 0),
      paidTotal,
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
  if (!building[0]) throw new PaymentNotFoundRepositoryError();
  if (building[0].status !== 'ACTIVE') throw new PaymentNotEligibleRepositoryError();
}
