import { Injectable } from '@nestjs/common';
import type { CreateDepositEntryRequest, ReverseDepositEntryRequest } from '@rental/shared';
import {
  Prisma,
  type BuildingStatus,
  type ContractDepositEntry,
  type DepositEntryKind,
  type WorkspaceStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceNotFoundRepositoryError,
} from '../workspaces/repositories/workspace.repository';
import { ContractNotFoundRepositoryError } from '../contracts/repositories/contract.repository';
import { depositTotals, type DepositTotals } from './deposit-totals';

export class DepositEntryNotFoundRepositoryError extends Error {}
export class DepositEntryInvalidRepositoryError extends Error {}
export class DepositInsufficientBalanceRepositoryError extends Error {}
export class DepositNotEligibleRepositoryError extends Error {}
export class DepositIdempotencyConflictRepositoryError extends Error {}
export class DepositArchivedOwnerOnlyRepositoryError extends Error {}

export type DepositEntryRecord = ContractDepositEntry & { reversal: { id: string } | null };
export interface DepositPage {
  items: DepositEntryRecord[];
  total: number;
  totals: DepositTotals;
}
const serializable = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };
const include = { reversal: { select: { id: true } } };
const FUTURE_TOLERANCE_MS = 5 * 60_000;
const ledgerSelect = { id: true, kind: true, amount: true, reversesEntryId: true } as const;

@Injectable()
export class DepositRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Records a collection, deduction or refund that already happened. Never moves money. */
  create(
    workspaceId: string,
    actorUserId: string,
    contractId: string,
    input: CreateDepositEntryRequest,
  ) {
    const amount = new Prisma.Decimal(input.amount);
    const occurredAt = new Date(input.occurredAt);
    const clean = (v?: string) => v?.trim() || null;
    const reason = clean(input.reason);
    const reference = clean(input.reference);
    const note = clean(input.note);
    const method = input.method ?? null;
    const same = (e: ContractDepositEntry) =>
      e.kind === input.kind &&
      e.amount.equals(amount) &&
      e.method === method &&
      e.occurredAt.getTime() === occurredAt.getTime() &&
      e.reason === reason &&
      e.reference === reference &&
      e.note === note;
    return this.write(
      workspaceId,
      actorUserId,
      contractId,
      input.kind,
      input.idempotencyKey,
      same,
      async (tx) => {
        if (
          Number.isNaN(occurredAt.getTime()) ||
          occurredAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS
        )
          throw new DepositEntryInvalidRepositoryError();
        const needsMethod = input.kind !== 'DEDUCTION';
        if (needsMethod !== (method !== null)) throw new DepositEntryInvalidRepositoryError();
        // A deduction needs reason + reference; a refund needs reason + the real-world refund
        // reference (transfer code or cash receipt). The system never moves the money itself.
        if (input.kind !== 'COLLECTION' && (!reason || !reference))
          throw new DepositEntryInvalidRepositoryError();
        if (input.kind !== 'COLLECTION') {
          const { balance } = depositTotals(await ledger(tx, contractId));
          if (balance.lessThan(amount)) throw new DepositInsufficientBalanceRepositoryError();
        }
        return tx.contractDepositEntry.create({
          data: {
            workspaceId,
            contractId,
            kind: input.kind,
            amount,
            method,
            occurredAt,
            reason,
            reference,
            note,
            idempotencyKey: input.idempotencyKey,
            createdBy: actorUserId,
          },
          include,
        });
      },
    );
  }

  /** Compensating entry that undoes a mistaken record; the original row is never touched. */
  reverse(
    workspaceId: string,
    actorUserId: string,
    contractId: string,
    entryId: string,
    input: ReverseDepositEntryRequest,
  ) {
    const reason = input.reason.trim();
    const same = (e: ContractDepositEntry) =>
      e.kind === 'REVERSAL' && e.reversesEntryId === entryId && e.reason === reason;
    return this.write(
      workspaceId,
      actorUserId,
      contractId,
      'REVERSAL',
      input.idempotencyKey,
      same,
      async (tx) => {
        const original = await tx.contractDepositEntry.findFirst({
          where: { id: entryId, contractId, workspaceId },
          include,
        });
        if (!original) throw new DepositEntryNotFoundRepositoryError();
        if (original.kind === 'REVERSAL' || original.reversal)
          throw new DepositEntryInvalidRepositoryError();
        if (original.kind === 'COLLECTION') {
          // Taking back a collection must not leave the balance negative.
          const { balance } = depositTotals(await ledger(tx, contractId));
          if (balance.lessThan(original.amount))
            throw new DepositInsufficientBalanceRepositoryError();
        }
        return tx.contractDepositEntry.create({
          data: {
            workspaceId,
            contractId,
            kind: 'REVERSAL',
            amount: original.amount,
            method: original.method,
            occurredAt: new Date(),
            reason,
            reversesEntryId: entryId,
            idempotencyKey: input.idempotencyKey,
            createdBy: actorUserId,
          },
          include,
        });
      },
    );
  }

  list(workspaceId: string, contractId: string, page: number, limit: number) {
    return this.read({ id: contractId, workspaceId }, contractId, page, limit);
  }

  listForTenant(userId: string, contractId: string, page: number, limit: number) {
    return this.read(
      { id: contractId, tenant: { userLinks: { some: { userId, revokedAt: null } } } },
      contractId,
      page,
      limit,
    );
  }

  async get(workspaceId: string, contractId: string, entryId: string) {
    const entry = await this.prisma.contractDepositEntry.findFirst({
      where: { id: entryId, contractId, workspaceId },
      include,
    });
    if (!entry) throw new DepositEntryNotFoundRepositoryError();
    return entry;
  }

  private async write(
    workspaceId: string,
    actorUserId: string,
    contractId: string,
    kind: DepositEntryKind,
    idempotencyKey: string,
    same: (e: ContractDepositEntry) => boolean,
    action: (tx: Prisma.TransactionClient) => Promise<DepositEntryRecord>,
  ): Promise<{ entry: DepositEntryRecord; replay: boolean }> {
    const lookup = () =>
      this.prisma.contractDepositEntry.findUnique({
        where: { contractId_idempotencyKey: { contractId, idempotencyKey } },
        include,
      });
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          await assertScope(tx, workspaceId, actorUserId, contractId, kind);
          const existing = await tx.contractDepositEntry.findUnique({
            where: { contractId_idempotencyKey: { contractId, idempotencyKey } },
            include,
          });
          if (existing) {
            if (!same(existing)) throw new DepositIdempotencyConflictRepositoryError();
            return { entry: existing, replay: true };
          }
          return { entry: await action(tx), replay: false };
        }, serializable);
      } catch (error) {
        const known = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : null;
        if (known === 'P2002' || known === 'P2034') {
          const existing = await lookup();
          if (existing)
            if (same(existing)) return { entry: existing, replay: true };
            else throw new DepositIdempotencyConflictRepositoryError();
          if (known === 'P2034' && attempt < 4) continue;
          if (known === 'P2002') throw new DepositEntryInvalidRepositoryError(); // already reversed
        }
        const text = String((error as Error)?.message);
        if (text.includes('deposit balance cannot be negative'))
          throw new DepositInsufficientBalanceRepositoryError();
        if (text.includes('a reversal must fully reverse'))
          throw new DepositEntryInvalidRepositoryError();
        throw error;
      }
    }
  }

  private async read(
    contractWhere: Prisma.ContractWhereInput,
    contractId: string,
    page: number,
    limit: number,
  ): Promise<DepositPage> {
    const contract = await this.prisma.contract.findFirst({
      where: contractWhere,
      select: { id: true },
    });
    if (!contract) throw new ContractNotFoundRepositoryError();
    const [items, total, all] = await Promise.all([
      this.prisma.contractDepositEntry.findMany({
        where: { contractId },
        include,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.contractDepositEntry.count({ where: { contractId } }),
      this.prisma.contractDepositEntry.findMany({ where: { contractId }, select: ledgerSelect }),
    ]);
    return { items, total, totals: depositTotals(all) };
  }
}

const ledger = (tx: Prisma.TransactionClient, contractId: string) =>
  tx.contractDepositEntry.findMany({ where: { contractId }, select: ledgerSelect });

/**
 * V1 rule: only OWNER writes while the workspace and building are active.
 * Archived exception: only an OWNER may record a REFUND of the remaining deposit; collections,
 * deductions and reversals stay blocked so archived data is not otherwise changed.
 */
async function assertScope(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  userId: string,
  contractId: string,
  kind: DepositEntryKind,
) {
  const ws = await tx.$queryRaw<Array<{ status: WorkspaceStatus }>>(
    Prisma.sql`SELECT "status" FROM "workspaces" WHERE "id"=${workspaceId}::uuid FOR SHARE`,
  );
  if (!ws[0]) throw new WorkspaceNotFoundRepositoryError();
  const membership = await tx.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
  if (membership?.role !== 'OWNER') throw new WorkspaceNotFoundRepositoryError();
  // The contract row is locked for the whole transaction: ledger changes are strictly serialized.
  const rows = await tx.$queryRaw<Array<{ buildingStatus: BuildingStatus }>>(
    Prisma.sql`SELECT b."status" AS "buildingStatus" FROM "contracts" c JOIN "rooms" r ON r."id"=c."room_id" JOIN "buildings" b ON b."id"=r."building_id" WHERE c."id"=${contractId}::uuid AND c."workspace_id"=${workspaceId}::uuid FOR UPDATE OF c`,
  );
  if (!rows[0]) throw new ContractNotFoundRepositoryError();
  const workspaceArchived = ws[0].status !== 'ACTIVE';
  const buildingArchived = rows[0].buildingStatus !== 'ACTIVE';
  if (!workspaceArchived && !buildingArchived) return;
  if (kind !== 'REFUND') {
    if (workspaceArchived) throw new WorkspaceArchivedRepositoryError();
    throw new DepositNotEligibleRepositoryError();
  }
  if (membership.role !== 'OWNER') throw new DepositArchivedOwnerOnlyRepositoryError();
}
