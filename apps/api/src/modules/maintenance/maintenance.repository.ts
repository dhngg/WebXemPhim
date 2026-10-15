import { Injectable } from '@nestjs/common';
import {
  MAINTENANCE_TRANSITIONS,
  type CreateMaintenanceRequestRequest,
  type CreateTenantMaintenanceRequest,
  type TransitionMaintenanceRequest,
  type UpdateMaintenanceRequestRequest,
} from '@rental/shared';
import {
  Prisma,
  type BuildingStatus,
  type MaintenanceRequest,
  type MaintenanceStatusHistory,
  type RoomStatus,
  type WorkspaceStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { isSerializationFailure } from '../../database/serialization-failure';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceNotFoundRepositoryError,
} from '../workspaces/repositories/workspace.repository';
import { ContractNotFoundRepositoryError } from '../contracts/repositories/contract.repository';
import { startedActiveContractWhere } from '../contracts/contract-occupancy';
import { businessTodayDate } from '../../common/time/business-date';
import type { MaintenanceQueryDto, TenantMaintenanceQueryDto } from './maintenance.dto';

export type MaintenanceRecord = MaintenanceRequest & { history: MaintenanceStatusHistory[] };
export class MaintenanceNotFoundRepositoryError extends Error {}
export class MaintenanceInvalidTransitionRepositoryError extends Error {}
export class MaintenanceNotEditableRepositoryError extends Error {}
export class MaintenanceNotEligibleRepositoryError extends Error {}
export class MaintenanceNoteRequiredRepositoryError extends Error {}
export class MaintenanceNotCancellableRepositoryError extends Error {}

const MAX_ATTEMPTS = 5;
const serializable = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };
const withHistory = {
  history: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] },
};
const withoutHistory = { history: { take: 0 } };

@Injectable()
export class MaintenanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Serializable transaction that retries serialization failures (P2034). The loser of a race
   * (e.g. tenant cancel vs. manager assign) re-reads the committed state and gets a business error
   * instead of an HTTP 500.
   */
  private async serializableTx<T>(run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.prisma.$transaction(run, serializable);
      } catch (error) {
        if (!isSerializationFailure(error) || attempt >= MAX_ATTEMPTS) throw error;
      }
    }
  }

  /**
   * Manager-created request for a room; linked to the contract in effect today (ACTIVE and started)
   * when there is one. A future follow-up contract is never picked.
   */
  create(
    workspaceId: string,
    actorUserId: string,
    buildingId: string,
    input: CreateMaintenanceRequestRequest,
  ) {
    return this.serializableTx(async (tx) => {
      await assertManager(tx, workspaceId, actorUserId, buildingId);
      await assertRoom(tx, workspaceId, buildingId, input.roomId);
      const contract = await tx.contract.findFirst({
        where: { workspaceId, roomId: input.roomId, ...startedActiveContractWhere() },
        select: { id: true, tenantId: true },
        orderBy: { startDate: 'desc' },
      });
      return insertRequest(tx, {
        workspaceId,
        buildingId,
        roomId: input.roomId,
        contractId: contract?.id,
        tenantId: contract?.tenantId,
        requestedBy: actorUserId,
        title: input.title,
        description: input.description,
        priority: input.priority,
      });
    });
  }

  /**
   * Tenant request: needs a linked account and the tenant's own ACTIVE contract that has already
   * started; the room comes from it. Before startDate the tenant can see the contract but cannot
   * open maintenance requests on it.
   */
  createForTenant(userId: string, input: CreateTenantMaintenanceRequest) {
    return this.serializableTx(async (tx) => {
      const contract = await tx.contract.findFirst({
        where: {
          id: input.contractId,
          status: 'ACTIVE',
          tenant: { userLinks: { some: { userId, revokedAt: null } } },
        },
        include: { room: { select: { buildingId: true } } },
      });
      if (!contract) throw new ContractNotFoundRepositoryError();
      if (contract.startDate > businessTodayDate())
        throw new MaintenanceNotEligibleRepositoryError();
      const ws = await tx.$queryRaw<Array<{ status: WorkspaceStatus }>>(
        Prisma.sql`SELECT "status" FROM "workspaces" WHERE "id"=${contract.workspaceId}::uuid FOR SHARE`,
      );
      if (ws[0]?.status !== 'ACTIVE') throw new WorkspaceArchivedRepositoryError();
      await assertRoom(tx, contract.workspaceId, contract.room.buildingId, contract.roomId);
      return insertRequest(tx, {
        workspaceId: contract.workspaceId,
        buildingId: contract.room.buildingId,
        roomId: contract.roomId,
        contractId: contract.id,
        tenantId: contract.tenantId,
        requestedBy: userId,
        title: input.title,
        description: input.description,
        priority: input.priority,
      });
    });
  }

  /**
   * Tenant cancels their own request. The row is locked and the OPEN + unassigned conditions are
   * checked inside the same Serializable transaction, so a concurrent assign/start/resolve either
   * commits first (cancel is refused) or waits behind this lock (and is then refused as CANCELLED).
   */
  cancelForTenant(userId: string, id: string, reason?: string) {
    return this.serializableTx(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ workspace_id: string }>>(
        Prisma.sql`SELECT "workspace_id" FROM "maintenance_requests" WHERE "id"=${id}::uuid FOR UPDATE`,
      );
      if (!locked[0]) throw new MaintenanceNotFoundRepositoryError();
      const current = await tx.maintenanceRequest.findFirst({
        where: { id, ...tenantWhere(userId) },
      });
      if (!current) throw new MaintenanceNotFoundRepositoryError();
      const ws = await tx.$queryRaw<Array<{ status: WorkspaceStatus }>>(
        Prisma.sql`SELECT "status" FROM "workspaces" WHERE "id"=${current.workspaceId}::uuid FOR SHARE`,
      );
      if (ws[0]?.status !== 'ACTIVE') throw new WorkspaceArchivedRepositoryError();
      await assertRoom(tx, current.workspaceId, current.buildingId, current.roomId);
      if (current.status !== 'OPEN' || current.assigneeUserId !== null)
        throw new MaintenanceNotCancellableRepositoryError();
      await tx.maintenanceRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
      await tx.maintenanceStatusHistory.create({
        data: {
          workspaceId: current.workspaceId,
          requestId: id,
          fromStatus: 'OPEN',
          toStatus: 'CANCELLED',
          priority: current.priority,
          assigneeUserId: null,
          note: reason?.trim() || null,
          changedBy: userId,
        },
      });
      return tx.maintenanceRequest.findUniqueOrThrow({ where: { id }, include: withHistory });
    });
  }

  async list(workspaceId: string, buildingId: string, query: MaintenanceQueryDto) {
    return this.page(
      {
        workspaceId,
        buildingId,
        status: query.status,
        priority: query.priority,
        roomId: query.roomId,
        assigneeUserId: query.assigneeUserId,
      },
      query.page,
      query.limit,
    );
  }

  listForTenant(userId: string, query: TenantMaintenanceQueryDto) {
    return this.page({ ...tenantWhere(userId), status: query.status }, query.page, query.limit);
  }

  async get(workspaceId: string, buildingId: string, id: string) {
    const request = await this.prisma.maintenanceRequest.findFirst({
      where: { id, workspaceId, buildingId },
      include: withHistory,
    });
    if (!request) throw new MaintenanceNotFoundRepositoryError();
    return request;
  }

  async getForTenant(userId: string, id: string) {
    const request = await this.prisma.maintenanceRequest.findFirst({
      where: { id, ...tenantWhere(userId) },
      include: withHistory,
    });
    if (!request) throw new MaintenanceNotFoundRepositoryError();
    return request;
  }

  update(
    workspaceId: string,
    actorUserId: string,
    buildingId: string,
    id: string,
    input: UpdateMaintenanceRequestRequest,
  ) {
    return this.serializableTx(async (tx) => {
      await assertManager(tx, workspaceId, actorUserId, buildingId);
      const current = await lockRequest(tx, workspaceId, buildingId, id);
      if (current.status === 'CLOSED' || current.status === 'CANCELLED')
        throw new MaintenanceNotEditableRepositoryError();
      // V1 has no assignment feature: any legacy assignee is carried through unchanged.
      const assignee = current.assigneeUserId;
      const priority = input.priority ?? current.priority;
      const updated = await tx.maintenanceRequest.update({
        where: { id },
        data: {
          title: input.title,
          description: input.description,
          priority,
          assigneeUserId: assignee,
        },
      });
      if (priority !== current.priority) {
        await tx.maintenanceStatusHistory.create({
          data: {
            workspaceId,
            requestId: id,
            fromStatus: current.status,
            toStatus: current.status,
            priority,
            assigneeUserId: assignee,
            note: input.note?.trim() || null,
            changedBy: actorUserId,
          },
        });
      }
      return tx.maintenanceRequest.findUniqueOrThrow({
        where: { id: updated.id },
        include: withHistory,
      });
    });
  }

  transition(
    workspaceId: string,
    actorUserId: string,
    buildingId: string,
    id: string,
    input: TransitionMaintenanceRequest,
  ) {
    return this.serializableTx(async (tx) => {
      await assertManager(tx, workspaceId, actorUserId, buildingId);
      const current = await lockRequest(tx, workspaceId, buildingId, id);
      if (current.status === 'CLOSED' || current.status === 'CANCELLED')
        throw new MaintenanceNotEditableRepositoryError();
      if (!MAINTENANCE_TRANSITIONS[current.status].includes(input.toStatus))
        throw new MaintenanceInvalidTransitionRepositoryError();
      const note = input.note?.trim() || null;
      const now = new Date();
      // V1 has no assignment feature: any legacy assignee is carried through unchanged.
      const assignee = current.assigneeUserId;
      if (input.toStatus === 'RESOLVED' && !note)
        throw new MaintenanceNoteRequiredRepositoryError();
      await tx.maintenanceRequest.update({
        where: { id },
        data: {
          status: input.toStatus,
          assigneeUserId: assignee,
          ...(input.toStatus === 'RESOLVED' ? { resolutionNote: note, resolvedAt: now } : {}),
          ...(input.toStatus === 'CLOSED' ? { closedAt: now } : {}),
        },
      });
      await tx.maintenanceStatusHistory.create({
        data: {
          workspaceId,
          requestId: id,
          fromStatus: current.status,
          toStatus: input.toStatus,
          priority: current.priority,
          assigneeUserId: assignee,
          note,
          changedBy: actorUserId,
        },
      });
      return tx.maintenanceRequest.findUniqueOrThrow({ where: { id }, include: withHistory });
    });
  }

  private async page(where: Prisma.MaintenanceRequestWhereInput, page: number, limit: number) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.maintenanceRequest.findMany({
        where,
        include: withoutHistory,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.maintenanceRequest.count({ where }),
    ]);
    return { items, total };
  }
}

/** A tenant only sees requests they submitted, and only while their account link is valid. */
const tenantWhere = (userId: string): Prisma.MaintenanceRequestWhereInput => ({
  requestedBy: userId,
  contract: { tenant: { userLinks: { some: { userId, revokedAt: null } } } },
});

async function insertRequest(
  tx: Prisma.TransactionClient,
  data: Prisma.MaintenanceRequestUncheckedCreateInput,
) {
  const created = await tx.maintenanceRequest.create({
    data: { ...data, title: data.title.trim(), description: data.description.trim() },
  });
  await tx.maintenanceStatusHistory.create({
    data: {
      workspaceId: created.workspaceId,
      requestId: created.id,
      fromStatus: null,
      toStatus: 'OPEN',
      priority: created.priority,
      changedBy: created.requestedBy,
    },
  });
  return tx.maintenanceRequest.findUniqueOrThrow({
    where: { id: created.id },
    include: withHistory,
  });
}

async function assertManager(
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
  if (!building[0]) throw new MaintenanceNotFoundRepositoryError();
  if (building[0].status !== 'ACTIVE') throw new MaintenanceNotEligibleRepositoryError();
}

async function assertRoom(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  buildingId: string,
  roomId: string,
) {
  const building = await tx.$queryRaw<Array<{ status: BuildingStatus }>>(
    Prisma.sql`SELECT "status" FROM "buildings" WHERE "id"=${buildingId}::uuid AND "workspace_id"=${workspaceId}::uuid FOR SHARE`,
  );
  if (building[0]?.status !== 'ACTIVE') throw new MaintenanceNotEligibleRepositoryError();
  const room = await tx.$queryRaw<Array<{ status: RoomStatus }>>(
    Prisma.sql`SELECT "status" FROM "rooms" WHERE "id"=${roomId}::uuid AND "building_id"=${buildingId}::uuid AND "workspace_id"=${workspaceId}::uuid FOR SHARE`,
  );
  if (!room[0]) throw new MaintenanceNotFoundRepositoryError();
  if (room[0].status === 'ARCHIVED') throw new MaintenanceNotEligibleRepositoryError();
}

async function lockRequest(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  buildingId: string,
  id: string,
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "maintenance_requests" WHERE "id"=${id}::uuid AND "workspace_id"=${workspaceId}::uuid AND "building_id"=${buildingId}::uuid FOR UPDATE`,
  );
  if (!rows[0]) throw new MaintenanceNotFoundRepositoryError();
  return tx.maintenanceRequest.findUniqueOrThrow({ where: { id } });
}
