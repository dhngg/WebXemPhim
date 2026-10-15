import { Injectable } from '@nestjs/common';
import type { AdjustMeterReadingRequest, CreateMeterReadingRequest } from '@rental/shared';
import {
  Prisma,
  type BuildingStatus,
  type MeterReading,
  type MeterReadingAdjustment,
  type RoomStatus,
  type WorkspaceStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceNotFoundRepositoryError,
} from '../../workspaces/repositories/workspace.repository';
import type { MeterReadingQueryDto } from '../dto/meter-reading.dto';
export type MeterReadingRecord = MeterReading & { adjustments: MeterReadingAdjustment[] };
export class MeterReadingNotFoundRepositoryError extends Error {}
export class MeterReadingDuplicateRepositoryError extends Error {}
export class MeterReadingInvalidRepositoryError extends Error {}
export class MeterReadingNotEligibleRepositoryError extends Error {}
export class MeterRoomNotFoundRepositoryError extends Error {}
const include = { adjustments: { orderBy: { revision: 'asc' as const } } };
@Injectable()
export class MeterReadingRepository {
  constructor(private readonly prisma: PrismaService) {}
  async create(
    workspaceId: string,
    actorUserId: string,
    buildingId: string,
    roomId: string,
    input: CreateMeterReadingRequest,
  ): Promise<MeterReadingRecord> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await assertScope(tx, workspaceId, actorUserId, buildingId, roomId);
          const period = toPeriod(input.period);
          const latest = await tx.meterReading.findFirst({
            where: { roomId, meterType: input.meterType },
            orderBy: { period: 'desc' },
          });
          if (latest && latest.period.getTime() === period.getTime())
            throw new MeterReadingDuplicateRepositoryError();
          if (latest && latest.period > period) throw new MeterReadingInvalidRepositoryError();
          const previous = latest
            ? latest.currentReading
            : input.previousReading === undefined
              ? undefined
              : new Prisma.Decimal(input.previousReading);
          if (previous === undefined) throw new MeterReadingInvalidRepositoryError();
          if (latest && input.previousReading !== undefined) {
            if (!new Prisma.Decimal(input.previousReading).equals(previous))
              throw new MeterReadingInvalidRepositoryError();
          }
          const current = new Prisma.Decimal(input.currentReading);
          if (current.lessThan(previous)) throw new MeterReadingInvalidRepositoryError();
          return tx.meterReading.create({
            data: {
              workspaceId,
              buildingId,
              roomId,
              meterType: input.meterType,
              period,
              previousReading: previous,
              currentReading: current,
              recordedBy: actorUserId,
            },
            include,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isUniqueConflict(error)) throw new MeterReadingDuplicateRepositoryError();
      throw error;
    }
  }
  async list(workspaceId: string, buildingId: string, roomId: string, query: MeterReadingQueryDto) {
    const room = await this.prisma.room.findFirst({
      where: { id: roomId, buildingId, workspaceId },
      select: { id: true },
    });
    if (!room) throw new MeterRoomNotFoundRepositoryError();
    const where: Prisma.MeterReadingWhereInput = {
      workspaceId,
      buildingId,
      roomId,
      meterType: query.meterType,
      period: query.period ? toPeriod(query.period) : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.meterReading.findMany({
        where,
        include,
        orderBy: [{ period: 'desc' }, { meterType: 'asc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.meterReading.count({ where }),
    ]);
    return { items, total };
  }
  adjust(
    workspaceId: string,
    actorUserId: string,
    buildingId: string,
    roomId: string,
    readingId: string,
    input: AdjustMeterReadingRequest,
  ): Promise<MeterReadingRecord> {
    return this.prisma.$transaction(
      async (tx) => {
        await assertScope(tx, workspaceId, actorUserId, buildingId, roomId);
        const rows = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT "id" FROM "meter_readings" WHERE "id"=${readingId}::uuid AND "workspace_id"=${workspaceId}::uuid AND "building_id"=${buildingId}::uuid AND "room_id"=${roomId}::uuid FOR UPDATE`,
        );
        if (!rows[0]) throw new MeterReadingNotFoundRepositoryError();
        const reading = await tx.meterReading.findUniqueOrThrow({ where: { id: readingId } });
        const [later, earlier] = await Promise.all([
          tx.meterReading.findFirst({
            where: { roomId, meterType: reading.meterType, period: { gt: reading.period } },
            select: { id: true },
          }),
          tx.meterReading.findFirst({
            where: { roomId, meterType: reading.meterType, period: { lt: reading.period } },
            select: { id: true },
          }),
        ]);
        // Later periods are chained to this reading, so only the newest one can change.
        if (later) throw new MeterReadingInvalidRepositoryError();
        if (earlier && input.previousReading !== undefined)
          throw new MeterReadingInvalidRepositoryError();
        const nextPrevious =
          input.previousReading === undefined
            ? reading.previousReading
            : new Prisma.Decimal(input.previousReading);
        const nextCurrent = new Prisma.Decimal(input.currentReading);
        if (nextCurrent.lessThan(nextPrevious)) throw new MeterReadingInvalidRepositoryError();
        if (
          nextPrevious.equals(reading.previousReading) &&
          nextCurrent.equals(reading.currentReading)
        )
          throw new MeterReadingInvalidRepositoryError();
        const revision = reading.revision + 1;
        await tx.meterReadingAdjustment.create({
          data: {
            workspaceId,
            meterReadingId: readingId,
            revision,
            oldPreviousReading: reading.previousReading,
            oldCurrentReading: reading.currentReading,
            newPreviousReading: nextPrevious,
            newCurrentReading: nextCurrent,
            reason: input.reason,
            adjustedBy: actorUserId,
          },
        });
        return tx.meterReading.update({
          where: { id: readingId },
          data: { previousReading: nextPrevious, currentReading: nextCurrent, revision },
          include,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
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
  if (!building[0]) throw new MeterRoomNotFoundRepositoryError();
  if (building[0].status !== 'ACTIVE') throw new MeterReadingNotEligibleRepositoryError();
  const room = await tx.$queryRaw<Array<{ status: RoomStatus }>>(
    Prisma.sql`SELECT "status" FROM "rooms" WHERE "id"=${roomId}::uuid AND "building_id"=${buildingId}::uuid AND "workspace_id"=${workspaceId}::uuid FOR SHARE`,
  );
  if (!room[0]) throw new MeterRoomNotFoundRepositoryError();
  if (room[0].status === 'ARCHIVED') throw new MeterReadingNotEligibleRepositoryError();
}
const toPeriod = (value: string) => new Date(`${value}-01T00:00:00.000Z`);
function isUniqueConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2002' || error.code === 'P2034')
  );
}
