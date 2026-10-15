import { Injectable } from '@nestjs/common';
import type { CreateRoomServiceRequest, StopRoomServiceRequest } from '@rental/shared';
import {
  Prisma,
  type BuildingStatus,
  type RoomServiceAssignment,
  type RoomStatus,
  type WorkspaceStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceNotFoundRepositoryError,
} from '../../workspaces/repositories/workspace.repository';
import { RatePlanNotFoundRepositoryError } from '../../rates/repositories/rate-plan.repository';

export type RoomServiceRecord = RoomServiceAssignment;
export class RoomServiceNotFoundRepositoryError extends Error {}
export class RoomServiceConflictRepositoryError extends Error {}
export class RoomServiceNotEligibleRepositoryError extends Error {}

const serializable = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };
const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

@Injectable()
export class RoomServiceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    workspaceId: string,
    actorUserId: string,
    buildingId: string,
    roomId: string,
    input: CreateRoomServiceRequest,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await assertScope(tx, workspaceId, actorUserId, buildingId, roomId);
        // The code must exist in the building's rates, otherwise it could never be priced.
        const rate = await tx.ratePlan.findFirst({
          where: { workspaceId, buildingId, code: input.rateCode },
          select: { id: true },
        });
        if (!rate) throw new RatePlanNotFoundRepositoryError();
        return tx.roomServiceAssignment.create({
          data: {
            workspaceId,
            buildingId,
            roomId,
            rateCode: input.rateCode,
            effectiveFrom: toDate(input.effectiveFrom),
            createdBy: actorUserId,
          },
        });
      }, serializable);
    } catch (error) {
      throw translate(error);
    }
  }

  async list(workspaceId: string, buildingId: string, roomId: string) {
    const room = await this.prisma.room.findFirst({
      where: { id: roomId, buildingId, workspaceId },
      select: { id: true },
    });
    if (!room) throw new RoomServiceNotFoundRepositoryError();
    return this.prisma.roomServiceAssignment.findMany({
      where: { workspaceId, buildingId, roomId },
      orderBy: [{ rateCode: 'asc' }, { effectiveFrom: 'desc' }],
    });
  }

  async stop(
    workspaceId: string,
    actorUserId: string,
    buildingId: string,
    roomId: string,
    serviceId: string,
    input: StopRoomServiceRequest,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await assertScope(tx, workspaceId, actorUserId, buildingId, roomId);
        const rows = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT "id" FROM "room_service_assignments" WHERE "id"=${serviceId}::uuid AND "workspace_id"=${workspaceId}::uuid AND "building_id"=${buildingId}::uuid AND "room_id"=${roomId}::uuid FOR UPDATE`,
        );
        if (!rows[0]) throw new RoomServiceNotFoundRepositoryError();
        const current = await tx.roomServiceAssignment.findUniqueOrThrow({
          where: { id: serviceId },
        });
        if (current.effectiveTo) return current;
        const end = toDate(input.effectiveTo);
        if (end <= current.effectiveFrom) throw new RoomServiceNotEligibleRepositoryError();
        return tx.roomServiceAssignment.update({
          where: { id: serviceId },
          data: { effectiveTo: end, endedBy: actorUserId },
        });
      }, serializable);
    } catch (error) {
      throw translate(error);
    }
  }
}

async function assertScope(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  userId: string,
  buildingId: string,
  roomId: string,
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
  if (!building[0]) throw new RoomServiceNotFoundRepositoryError();
  if (building[0].status !== 'ACTIVE') throw new RoomServiceNotEligibleRepositoryError();
  const room = await tx.$queryRaw<Array<{ status: RoomStatus }>>(
    Prisma.sql`SELECT "status" FROM "rooms" WHERE "id"=${roomId}::uuid AND "building_id"=${buildingId}::uuid AND "workspace_id"=${workspaceId}::uuid FOR SHARE`,
  );
  if (!room[0]) throw new RoomServiceNotFoundRepositoryError();
  if (room[0].status === 'ARCHIVED') throw new RoomServiceNotEligibleRepositoryError();
}

function translate(error: unknown) {
  const text = error instanceof Error ? `${error.message}` : '';
  if (
    text.includes('room_service_assignments_period_excl') ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2002', 'P2004', 'P2034'].includes(error.code))
  )
    return new RoomServiceConflictRepositoryError();
  return error;
}
