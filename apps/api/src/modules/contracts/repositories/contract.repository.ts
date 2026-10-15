import { Injectable } from '@nestjs/common';
import type {
  CreateContractRequest,
  EndContractRequest,
  UpdateContractRequest,
} from '@rental/shared';
import {
  Prisma,
  type ContractStatus,
  type WorkspaceStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { isSerializationFailure } from '../../../database/serialization-failure';
import { businessTodayDate } from '../../../common/time/business-date';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceNotFoundRepositoryError,
} from '../../workspaces/repositories/workspace.repository';
import type { ContractQueryDto } from '../dto/contract.dto';

const contractInclude = {
  room: { select: { id: true, code: true, buildingId: true } },
  tenant: { select: { id: true, fullName: true } },
} satisfies Prisma.ContractInclude;
export type ContractRecord = Prisma.ContractGetPayload<{ include: typeof contractInclude }>;

export class ContractNotFoundRepositoryError extends Error {}
export class ContractConflictRepositoryError extends Error {}
export class ContractInvalidTransitionRepositoryError extends Error {}
export class ContractNotEligibleRepositoryError extends Error {}
/** Ending a contract that has started needs the effective last day. */
export class ContractEndDateRequiredRepositoryError extends Error {}

const MAX_SERIALIZATION_ATTEMPTS = 3;

@Injectable()
export class ContractRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every write runs SERIALIZABLE with the room row locked. Overlap is decided by the PostgreSQL
   * exclusion constraint (the only place that is safe against concurrent requests); a serialization
   * failure is retried and, if it persists, reported as the same conflict.
   */
  private async write<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (isOverlapViolation(error)) throw new ContractConflictRepositoryError();
        if (isSerializationFailure(error)) {
          if (attempt >= MAX_SERIALIZATION_ATTEMPTS) throw new ContractConflictRepositoryError();
          continue;
        }
        throw error;
      }
    }
  }

  /**
   * A contract may start in the future and may follow another contract of the same room as long as
   * the date ranges do not intersect. The room only becomes OCCUPIED here when the contract has
   * already started; otherwise occupancy is derived from the dates when read (no cron).
   */
  create(
    workspaceId: string,
    actorUserId: string,
    input: CreateContractRequest,
  ): Promise<ContractRecord> {
    return this.write(async (tx) => {
      await assertWorkspaceManager(tx, workspaceId, actorUserId);
      const room = await lockRoom(tx, workspaceId, input.roomId);
      if (
        (room.status !== 'VACANT' && room.status !== 'OCCUPIED') ||
        room.buildingStatus !== 'ACTIVE'
      )
        throw new ContractNotEligibleRepositoryError();
      // One clock reading after the lock drives every date decision below (no mixed days across Vietnam midnight).
      const today = businessTodayDate(new Date());
      if (toDate(input.startDate) > toDate(input.endDate) || toDate(input.endDate) < today)
        throw new ContractNotEligibleRepositoryError();
      const tenant = await tx.tenant.findFirst({
        where: { id: input.tenantId, workspaceId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!tenant) throw new ContractNotEligibleRepositoryError();
      const contract = await tx.contract.create({
        data: {
          workspaceId,
          roomId: input.roomId,
          tenantId: input.tenantId,
          startDate: toDate(input.startDate),
          endDate: toDate(input.endDate),
          monthlyRent: input.monthlyRent,
          notes: input.notes,
          createdByUserId: actorUserId,
        },
        include: contractInclude,
      });
      if (toDate(input.startDate) <= today && room.status === 'VACANT') {
        await tx.room.update({ where: { id: input.roomId }, data: { status: 'OCCUPIED' } });
      }
      return contract;
    });
  }

  async list(workspaceId: string, query: ContractQueryDto) {
    const where: Prisma.ContractWhereInput = { workspaceId, status: query.status };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.contract.findMany({
        where,
        include: contractInclude,
        orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.contract.count({ where }),
    ]);
    return { items, total };
  }

  async listForTenantUser(userId: string, query: ContractQueryDto) {
    const where: Prisma.ContractWhereInput = {
      status: query.status,
      tenant: { userLinks: { some: { userId, revokedAt: null } } },
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.contract.findMany({
        where,
        include: contractInclude,
        orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.contract.count({ where }),
    ]);
    return { items, total };
  }

  detailForTenantUser(userId: string, contractId: string) {
    return this.prisma.contract.findFirst({
      where: { id: contractId, tenant: { userLinks: { some: { userId, revokedAt: null } } } },
      include: contractInclude,
    });
  }

  detail(workspaceId: string, contractId: string) {
    return this.prisma.contract.findFirst({
      where: { id: contractId, workspaceId },
      include: contractInclude,
    });
  }

  update(
    workspaceId: string,
    actorUserId: string,
    contractId: string,
    input: UpdateContractRequest,
  ): Promise<ContractRecord> {
    return this.write(async (tx) => {
      await assertWorkspaceManager(tx, workspaceId, actorUserId);
      const contract = await lockContract(tx, workspaceId, contractId);
      if (contract.status !== 'ACTIVE') throw new ContractInvalidTransitionRepositoryError();
      const room = await lockRoom(tx, workspaceId, contract.roomId);
      const startDate = input.startDate ? toDate(input.startDate) : contract.startDate;
      const endDate = input.endDate ? toDate(input.endDate) : contract.endDate;
      const today = businessTodayDate(new Date());
      if (startDate > endDate || endDate < today) throw new ContractNotEligibleRepositoryError();
      // A contract that already took effect cannot be pushed back into the future.
      if (contract.startDate <= today && startDate > today)
        throw new ContractNotEligibleRepositoryError();
      const updated = await tx.contract.update({
        where: { id: contractId },
        data: {
          startDate: input.startDate ? toDate(input.startDate) : undefined,
          endDate: input.endDate ? toDate(input.endDate) : undefined,
          monthlyRent: input.monthlyRent,
          notes: input.notes,
        },
        include: contractInclude,
      });
      if (startDate <= today && room.status === 'VACANT') {
        await tx.room.update({ where: { id: contract.roomId }, data: { status: 'OCCUPIED' } });
      }
      return updated;
    });
  }

  /**
   * One lifecycle operation, two meanings decided by the dates (business time zone):
   * - started contract: `endDate` (startDate <= endDate <= today) becomes the effective last day;
   * - contract that has not started: cancelled. The registered period is kept as history and
   *   `endedAt` (before startDate) marks it as never in effect; deposits are not touched.
   */
  end(
    workspaceId: string,
    actorUserId: string,
    contractId: string,
    input: EndContractRequest,
  ): Promise<ContractRecord> {
    return this.write(async (tx) => {
      await assertWorkspaceManager(tx, workspaceId, actorUserId);
      const contract = await lockContract(tx, workspaceId, contractId);
      if (contract.status !== 'ACTIVE') throw new ContractInvalidTransitionRepositoryError();
      const room = await lockRoom(tx, workspaceId, contract.roomId);
      const now = new Date(); // single reading: business date, validation and endedAt all use it
      const today = businessTodayDate(now);
      if (contract.startDate > today) {
        if (input.endDate !== undefined) throw new ContractNotEligibleRepositoryError();
        return tx.contract.update({
          where: { id: contractId },
          data: { status: 'ENDED', endedAt: now, endedByUserId: actorUserId },
          include: contractInclude,
        });
      }
      if (input.endDate === undefined) throw new ContractEndDateRequiredRepositoryError();
      const effectiveEnd = toDate(input.endDate);
      if (effectiveEnd < contract.startDate || effectiveEnd > today)
        throw new ContractNotEligibleRepositoryError();
      const ended = await tx.contract.update({
        where: { id: contractId },
        data: { status: 'ENDED', endDate: effectiveEnd, endedAt: now, endedByUserId: actorUserId },
        include: contractInclude,
      });
      // The room stays occupied while another contract of it is in effect (e.g. a follow-up that already started).
      const stillInEffect = await tx.contract.count({
        where: { roomId: contract.roomId, status: 'ACTIVE', startDate: { lte: today } },
      });
      if (stillInEffect === 0 && room.status === 'OCCUPIED') {
        await tx.room.update({ where: { id: contract.roomId }, data: { status: 'VACANT' } });
      }
      return ended;
    });
  }
}

async function assertWorkspaceManager(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  actorUserId: string,
) {
  const rows = await tx.$queryRaw<Array<{ status: WorkspaceStatus }>>(
    Prisma.sql`SELECT "status" FROM "workspaces" WHERE "id" = ${workspaceId}::uuid FOR SHARE`,
  );
  if (!rows[0]) throw new WorkspaceNotFoundRepositoryError();
  if (rows[0].status !== 'ACTIVE') throw new WorkspaceArchivedRepositoryError();
  const membership = await tx.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: actorUserId } },
    select: { role: true },
  });
  if (membership?.role !== 'OWNER') throw new WorkspaceNotFoundRepositoryError();
}

async function lockRoom(tx: Prisma.TransactionClient, workspaceId: string, roomId: string) {
  const rows = await tx.$queryRaw<Array<{ status: string; buildingStatus: string }>>(Prisma.sql`
    SELECT r."status"::text AS "status", b."status"::text AS "buildingStatus"
    FROM "rooms" r JOIN "buildings" b ON b."id" = r."building_id"
    WHERE r."id" = ${roomId}::uuid AND r."workspace_id" = ${workspaceId}::uuid
    FOR UPDATE OF r
  `);
  if (!rows[0] || rows[0].status === 'ARCHIVED') throw new ContractNotEligibleRepositoryError();
  return rows[0];
}

async function lockContract(tx: Prisma.TransactionClient, workspaceId: string, contractId: string) {
  const rows = await tx.$queryRaw<
    Array<{ status: ContractStatus; roomId: string; startDate: Date; endDate: Date }>
  >(Prisma.sql`
    SELECT "status", "room_id" AS "roomId", "start_date" AS "startDate", "end_date" AS "endDate"
    FROM "contracts" WHERE "id" = ${contractId}::uuid AND "workspace_id" = ${workspaceId}::uuid FOR UPDATE
  `);
  if (!rows[0]) throw new ContractNotFoundRepositoryError();
  return rows[0];
}

const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
function isOverlapViolation(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2002' || error.code === 'P2004')
  )
    return true;
  const e = error as {
    meta?: { code?: string; constraint?: unknown; message?: string };
    message?: string;
  };
  return (
    e?.meta?.code === '23P01' ||
    /contracts_active_room_period_excl/.test(
      `${String(e?.meta?.constraint ?? '')} ${e?.meta?.message ?? ''} ${e?.message ?? ''}`,
    )
  );
}
