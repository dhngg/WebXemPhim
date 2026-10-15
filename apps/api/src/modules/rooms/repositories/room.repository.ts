import { Injectable } from '@nestjs/common';
import type {
  AddRoomImageRequest,
  CreateAmenityRequest,
  CreateRoomRequest,
  ReorderRoomImagesRequest,
  UpdateRoomRequest,
} from '@rental/shared';
import {
  Prisma,
  type Amenity,
  type BuildingStatus,
  type RoomStatus,
  type RoomImage,
  type WorkspaceRole,
  type WorkspaceStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { startedActiveContractWhere } from '../../contracts/contract-occupancy';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceNotFoundRepositoryError,
} from '../../workspaces/repositories/workspace.repository';
import {
  BuildingArchivedRepositoryError,
  BuildingNotFoundRepositoryError,
} from '../../buildings/repositories/building.repository';

const roomInclude = { amenities: { include: { amenity: true } } } as const;
export type RoomRecord = Prisma.RoomGetPayload<{ include: typeof roomInclude }>;
export type AmenityRecord = Amenity;
export type RoomImageRecord = RoomImage;

export class RoomNotFoundRepositoryError extends Error {}
export class RoomArchivedRepositoryError extends Error {}
/** The room's status is controlled by an active contract (database trigger / same rule checked up front). */
export class RoomHasActiveContractRepositoryError extends Error {}
export class RoomCodeConflictRepositoryError extends Error {}
export class AmenityNotFoundRepositoryError extends Error {}
export class AmenityAlreadyExistsRepositoryError extends Error {}
export class RoomImageNotFoundRepositoryError extends Error {}
export class RoomImageOrderInvalidRepositoryError extends Error {}

@Injectable()
export class RoomRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createRoom(
    workspaceId: string,
    actorUserId: string,
    buildingId: string,
    input: CreateRoomRequest,
  ): Promise<RoomRecord> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await lockPropertyScope(tx, workspaceId, actorUserId, ['OWNER'], buildingId);
          return tx.room.create({
            data: {
              workspaceId,
              buildingId,
              code: input.code,
              areaSqm: input.areaSqm,
              monthlyRent: input.monthlyRent,
              maxOccupants: input.maxOccupants,
              description: input.description,
              status: input.status,
            },
            include: roomInclude,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isUniqueViolation(error)) throw new RoomCodeConflictRepositoryError();
      throw error;
    }
  }

  async listRooms(workspaceId: string, buildingId: string): Promise<RoomRecord[]> {
    const rooms = await this.prisma.room.findMany({
      where: { workspaceId, buildingId },
      include: roomInclude,
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
    });
    return withOccupancy(this.prisma, rooms);
  }

  async detailRoom(
    workspaceId: string,
    buildingId: string,
    roomId: string,
  ): Promise<RoomRecord | null> {
    const room = await this.prisma.room.findFirst({
      where: { id: roomId, workspaceId, buildingId },
      include: roomInclude,
    });
    return room ? (await withOccupancy(this.prisma, [room]))[0]! : null;
  }

  async updateRoom(
    workspaceId: string,
    actorUserId: string,
    buildingId: string,
    roomId: string,
    input: UpdateRoomRequest,
  ): Promise<RoomRecord> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await lockPropertyScope(tx, workspaceId, actorUserId, ['OWNER'], buildingId);
          const room = await lockRoom(tx, workspaceId, buildingId, roomId);
          if (room.status === 'ARCHIVED') throw new RoomArchivedRepositoryError();
          if (
            (input.status === 'VACANT' || input.status === 'UNAVAILABLE') &&
            input.status !== room.status &&
            (await tx.contract.count({ where: { roomId, ...startedActiveContractWhere() } })) > 0
          )
            throw new RoomHasActiveContractRepositoryError();
          const updated = await tx.room.updateMany({
            where: { id: roomId, workspaceId, buildingId, status: { not: 'ARCHIVED' } },
            data: input,
          });
          if (updated.count !== 1) throw new RoomNotFoundRepositoryError();
          const result = await tx.room.findFirst({
            where: { id: roomId, workspaceId, buildingId },
            include: roomInclude,
          });
          if (!result) throw new RoomNotFoundRepositoryError();
          return (await withOccupancy(tx, [result]))[0]!;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isUniqueViolation(error)) throw new RoomCodeConflictRepositoryError();
      if (isActiveContractGuard(error)) throw new RoomHasActiveContractRepositoryError();
      throw error;
    }
  }

  archiveRoom(
    workspaceId: string,
    actorUserId: string,
    buildingId: string,
    roomId: string,
  ): Promise<RoomRecord> {
    return this.setRoomLifecycle(workspaceId, actorUserId, buildingId, roomId, 'ARCHIVED');
  }

  restoreRoom(
    workspaceId: string,
    actorUserId: string,
    buildingId: string,
    roomId: string,
  ): Promise<RoomRecord> {
    return this.setRoomLifecycle(workspaceId, actorUserId, buildingId, roomId, 'VACANT');
  }

  async createAmenity(
    workspaceId: string,
    actorUserId: string,
    input: CreateAmenityRequest,
  ): Promise<AmenityRecord> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await lockWorkspace(tx, workspaceId, actorUserId, ['OWNER']);
          return tx.amenity.create({
            data: { workspaceId, name: input.name, description: input.description },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isUniqueViolation(error)) throw new AmenityAlreadyExistsRepositoryError();
      throw error;
    }
  }

  listAmenities(workspaceId: string): Promise<AmenityRecord[]> {
    return this.prisma.amenity.findMany({
      where: { workspaceId },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  assignAmenity(
    workspaceId: string,
    actorUserId: string,
    buildingId: string,
    roomId: string,
    amenityId: string,
  ): Promise<void> {
    return this.prisma.$transaction(
      async (tx) => {
        await lockPropertyScope(tx, workspaceId, actorUserId, ['OWNER'], buildingId);
        const room = await lockRoom(tx, workspaceId, buildingId, roomId);
        if (room.status === 'ARCHIVED') throw new RoomArchivedRepositoryError();
        const amenity = await tx.amenity.findFirst({
          where: { id: amenityId, workspaceId },
          select: { id: true },
        });
        if (!amenity) throw new AmenityNotFoundRepositoryError();
        await tx.roomAmenity.upsert({
          where: { roomId_amenityId: { roomId, amenityId } },
          create: { roomId, amenityId },
          update: {},
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  unassignAmenity(
    workspaceId: string,
    actorUserId: string,
    buildingId: string,
    roomId: string,
    amenityId: string,
  ): Promise<void> {
    return this.prisma.$transaction(
      async (tx) => {
        await lockPropertyScope(tx, workspaceId, actorUserId, ['OWNER'], buildingId);
        const room = await lockRoom(tx, workspaceId, buildingId, roomId);
        if (room.status === 'ARCHIVED') throw new RoomArchivedRepositoryError();
        const amenity = await tx.amenity.findFirst({
          where: { id: amenityId, workspaceId },
          select: { id: true },
        });
        if (!amenity) throw new AmenityNotFoundRepositoryError();
        await tx.roomAmenity.deleteMany({ where: { roomId, amenityId } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  addRoomImage(
    workspaceId: string,
    actorUserId: string,
    buildingId: string,
    roomId: string,
    input: AddRoomImageRequest,
  ): Promise<RoomImageRecord> {
    return this.prisma.$transaction(
      async (tx) => {
        await lockPropertyScope(tx, workspaceId, actorUserId, ['OWNER'], buildingId);
        const room = await lockRoom(tx, workspaceId, buildingId, roomId);
        if (room.status === 'ARCHIVED') throw new RoomArchivedRepositoryError();
        const lastImage = await tx.roomImage.findFirst({
          where: { workspaceId, roomId },
          select: { sortOrder: true },
          orderBy: [{ sortOrder: 'desc' }, { id: 'desc' }],
        });
        return tx.roomImage.create({
          data: {
            workspaceId,
            roomId,
            url: input.url,
            altText: input.altText,
            sortOrder: (lastImage?.sortOrder ?? -1) + 1,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  listRoomImages(
    workspaceId: string,
    buildingId: string,
    roomId: string,
  ): Promise<RoomImageRecord[]> {
    return this.prisma.roomImage.findMany({
      where: { workspaceId, roomId, room: { buildingId, workspaceId } },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  reorderRoomImages(
    workspaceId: string,
    actorUserId: string,
    buildingId: string,
    roomId: string,
    input: ReorderRoomImagesRequest,
  ): Promise<RoomImageRecord[]> {
    return this.prisma.$transaction(
      async (tx) => {
        await lockPropertyScope(tx, workspaceId, actorUserId, ['OWNER'], buildingId);
        const room = await lockRoom(tx, workspaceId, buildingId, roomId);
        if (room.status === 'ARCHIVED') throw new RoomArchivedRepositoryError();
        const current = await tx.roomImage.findMany({
          where: { workspaceId, roomId },
          select: { id: true },
        });
        const currentIds = new Set(current.map(({ id }) => id));
        if (
          current.length !== input.imageIds.length ||
          input.imageIds.some((id) => !currentIds.has(id))
        )
          throw new RoomImageOrderInvalidRepositoryError();
        for (const [sortOrder, id] of input.imageIds.entries()) {
          const result = await tx.roomImage.updateMany({
            where: { id, workspaceId, roomId },
            data: { sortOrder },
          });
          if (result.count !== 1) throw new RoomImageOrderInvalidRepositoryError();
        }
        return tx.roomImage.findMany({
          where: { workspaceId, roomId },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  deleteRoomImage(
    workspaceId: string,
    actorUserId: string,
    buildingId: string,
    roomId: string,
    imageId: string,
  ): Promise<void> {
    return this.prisma.$transaction(
      async (tx) => {
        await lockPropertyScope(tx, workspaceId, actorUserId, ['OWNER'], buildingId);
        const room = await lockRoom(tx, workspaceId, buildingId, roomId);
        if (room.status === 'ARCHIVED') throw new RoomArchivedRepositoryError();
        const result = await tx.roomImage.deleteMany({
          where: { id: imageId, workspaceId, roomId },
        });
        if (result.count !== 1) throw new RoomImageNotFoundRepositoryError();
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async setRoomLifecycle(
    workspaceId: string,
    actorUserId: string,
    buildingId: string,
    roomId: string,
    targetStatus: RoomStatus,
  ): Promise<RoomRecord> {
    try {
      return await this.setRoomLifecycleTx(
        workspaceId,
        actorUserId,
        buildingId,
        roomId,
        targetStatus,
      );
    } catch (error) {
      if (isActiveContractGuard(error)) throw new RoomHasActiveContractRepositoryError();
      throw error;
    }
  }

  private setRoomLifecycleTx(
    workspaceId: string,
    actorUserId: string,
    buildingId: string,
    roomId: string,
    targetStatus: RoomStatus,
  ): Promise<RoomRecord> {
    return this.prisma.$transaction(
      async (tx) => {
        await lockPropertyScope(tx, workspaceId, actorUserId, ['OWNER'], buildingId);
        const room = await lockRoom(tx, workspaceId, buildingId, roomId);
        if (
          targetStatus === 'ARCHIVED' &&
          room.status !== 'ARCHIVED' &&
          (await tx.contract.count({ where: { roomId, status: 'ACTIVE' } })) > 0
        )
          throw new RoomHasActiveContractRepositoryError();
        if (room.status !== targetStatus) {
          const updated = await tx.room.updateMany({
            where: { id: roomId, workspaceId, buildingId, status: room.status },
            data:
              targetStatus === 'ARCHIVED'
                ? { status: 'ARCHIVED', archivedAt: new Date() }
                : { status: 'VACANT', archivedAt: null },
          });
          if (updated.count !== 1) throw new RoomNotFoundRepositoryError();
        }
        const result = await tx.room.findFirst({
          where: { id: roomId, workspaceId, buildingId },
          include: roomInclude,
        });
        if (!result) throw new RoomNotFoundRepositoryError();
        return (await withOccupancy(tx, [result]))[0]!;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}

/**
 * Occupancy follows the contract dates, not the stored flag. No job flips `rooms.status` when a
 * contract starts, so the status returned by the API is derived at read time (business date):
 * an ACTIVE contract that has started => OCCUPIED (also while it is overdue and not yet ended by
 * the OWNER); a future contract does not occupy the room. ARCHIVED and manual UNAVAILABLE are kept.
 */
async function withOccupancy<T extends { id: string; status: RoomStatus }>(
  db: Pick<Prisma.TransactionClient, 'contract'>,
  rooms: T[],
): Promise<T[]> {
  const candidates = rooms.filter((room) => room.status !== 'ARCHIVED').map((room) => room.id);
  if (candidates.length === 0) return rooms;
  const started = await db.contract.findMany({
    where: { roomId: { in: candidates }, ...startedActiveContractWhere() },
    select: { roomId: true },
    distinct: ['roomId'],
  });
  const occupied = new Set(started.map((contract) => contract.roomId));
  return rooms.map((room) => {
    if (room.status === 'ARCHIVED') return room;
    if (occupied.has(room.id)) return { ...room, status: 'OCCUPIED' as const };
    return room.status === 'OCCUPIED' ? { ...room, status: 'VACANT' as const } : room;
  });
}

async function lockWorkspace(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  actorUserId: string,
  roles: WorkspaceRole[],
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ status: WorkspaceStatus }>>(
    Prisma.sql`SELECT "status" FROM "workspaces" WHERE "id" = ${workspaceId}::uuid FOR SHARE`,
  );
  if (!rows[0]) throw new WorkspaceNotFoundRepositoryError();
  if (rows[0].status !== 'ACTIVE') throw new WorkspaceArchivedRepositoryError();
  const membership = await tx.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: actorUserId } },
    select: { role: true },
  });
  if (!membership || !roles.includes(membership.role)) throw new WorkspaceNotFoundRepositoryError();
}

async function lockPropertyScope(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  actorUserId: string,
  roles: WorkspaceRole[],
  buildingId: string,
): Promise<void> {
  await lockWorkspace(tx, workspaceId, actorUserId, roles);
  const buildings = await tx.$queryRaw<Array<{ status: BuildingStatus }>>(
    Prisma.sql`SELECT "status" FROM "buildings" WHERE "id" = ${buildingId}::uuid AND "workspace_id" = ${workspaceId}::uuid FOR SHARE`,
  );
  if (!buildings[0]) throw new BuildingNotFoundRepositoryError();
  if (buildings[0].status !== 'ACTIVE') throw new BuildingArchivedRepositoryError();
}

async function lockRoom(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  buildingId: string,
  roomId: string,
): Promise<{ status: RoomStatus }> {
  const rooms = await tx.$queryRaw<Array<{ status: RoomStatus }>>(
    Prisma.sql`SELECT "status" FROM "rooms" WHERE "id" = ${roomId}::uuid AND "workspace_id" = ${workspaceId}::uuid AND "building_id" = ${buildingId}::uuid FOR UPDATE`,
  );
  if (!rooms[0]) throw new RoomNotFoundRepositoryError();
  return rooms[0];
}

/** Raised by the rooms_protect_active_contract_state trigger when a race slips past the up-front check. */
function isActiveContractGuard(error: unknown): boolean {
  const e = error as { message?: string; meta?: { message?: string } };
  return /room with an? (started )?active contract/i.test(
    `${e?.meta?.message ?? ''} ${e?.message ?? ''}`,
  );
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
