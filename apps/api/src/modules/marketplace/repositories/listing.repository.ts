import { Injectable } from '@nestjs/common';
import type { SetListingPublicationRequest } from '@rental/shared';
import {
  Prisma,
  type BuildingStatus,
  type Listing,
  type RoomStatus,
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
import {
  RoomArchivedRepositoryError,
  RoomNotFoundRepositoryError,
} from '../../rooms/repositories/room.repository';
import type { PublicListingQueryDto } from '../dto/listing.dto';

const publicListingInclude = {
  room: {
    include: {
      building: true,
      amenities: { include: { amenity: true } },
      images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
    },
  },
} satisfies Prisma.ListingInclude;

export type ListingRecord = Listing;
export type PublicListingRecord = Prisma.ListingGetPayload<{
  include: typeof publicListingInclude;
}>;
export class ListingNotEligibleRepositoryError extends Error {}

@Injectable()
export class ListingRepository {
  constructor(private readonly prisma: PrismaService) {}

  setPublication(
    workspaceId: string,
    actorUserId: string,
    buildingId: string,
    roomId: string,
    input: SetListingPublicationRequest,
  ): Promise<ListingRecord> {
    return this.prisma.$transaction(
      async (tx) => {
        const workspace = await tx.$queryRaw<Array<{ status: WorkspaceStatus }>>(
          Prisma.sql`SELECT "status" FROM "workspaces" WHERE "id" = ${workspaceId}::uuid FOR SHARE`,
        );
        if (!workspace[0]) throw new WorkspaceNotFoundRepositoryError();
        if (workspace[0].status !== 'ACTIVE') throw new WorkspaceArchivedRepositoryError();
        const membership = await tx.workspaceMembership.findUnique({
          where: { workspaceId_userId: { workspaceId, userId: actorUserId } },
          select: { role: true },
        });
        if (membership?.role !== 'OWNER') throw new WorkspaceNotFoundRepositoryError();
        const buildings = await tx.$queryRaw<Array<{ status: BuildingStatus }>>(
          Prisma.sql`SELECT "status" FROM "buildings" WHERE "id" = ${buildingId}::uuid AND "workspace_id" = ${workspaceId}::uuid FOR SHARE`,
        );
        if (!buildings[0]) throw new BuildingNotFoundRepositoryError();
        if (buildings[0].status !== 'ACTIVE') throw new BuildingArchivedRepositoryError();
        const rooms = await tx.$queryRaw<Array<{ status: RoomStatus }>>(
          Prisma.sql`SELECT "status" FROM "rooms" WHERE "id" = ${roomId}::uuid AND "building_id" = ${buildingId}::uuid AND "workspace_id" = ${workspaceId}::uuid FOR UPDATE`,
        );
        if (!rooms[0]) throw new RoomNotFoundRepositoryError();
        if (rooms[0].status === 'ARCHIVED') throw new RoomArchivedRepositoryError();
        if (input.published && rooms[0].status !== 'VACANT')
          throw new ListingNotEligibleRepositoryError();
        // The stored flag is not flipped by any job when a contract starts: check the dates as well.
        if (
          input.published &&
          (await tx.contract.count({ where: { roomId, ...startedActiveContractWhere() } })) > 0
        )
          throw new ListingNotEligibleRepositoryError();

        const existing = await tx.listing.findUnique({ where: { roomId } });
        const now = new Date();
        if (!existing) {
          return tx.listing.create({
            data: {
              workspaceId,
              roomId,
              isPublished: input.published,
              publishedAt: input.published ? now : null,
              unpublishedAt: input.published ? null : now,
            },
          });
        }
        if (existing.isPublished === input.published) return existing;
        return tx.listing.update({
          where: { id: existing.id },
          data: {
            isPublished: input.published,
            publishedAt: input.published ? now : null,
            unpublishedAt: input.published ? null : now,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async listPublic(query: PublicListingQueryDto): Promise<{
    items: PublicListingRecord[];
    total: number;
  }> {
    const where = buildPublicWhere(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.listing.findMany({
        where,
        include: publicListingInclude,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.listing.count({ where }),
    ]);
    return { items, total };
  }

  detailPublic(listingId: string): Promise<PublicListingRecord | null> {
    return this.prisma.listing.findFirst({
      where: { id: listingId, ...publicEligibilityWhere() },
      include: publicListingInclude,
    });
  }
}

const publicEligibilityWhere = () => ({
  isPublished: true,
  NOT: { moderation: { is: { isHidden: true } } }, // hidden by Platform Admin moderation
  room: {
    status: 'VACANT' as const,
    workspace: { status: 'ACTIVE' as const },
    building: { status: 'ACTIVE' as const },
    // Rooms whose tenant is already in (stored flag is not flipped by a job) are not public.
    // A room only reserved by a future contract keeps its current listing visibility (pending policy).
    contracts: { none: startedActiveContractWhere() },
  },
});

function buildPublicWhere(query: PublicListingQueryDto): Prisma.ListingWhereInput {
  const building: Prisma.BuildingWhereInput = { status: 'ACTIVE' };
  if (query.city) building.city = { contains: query.city, mode: 'insensitive' };
  if (query.district) building.district = { contains: query.district, mode: 'insensitive' };
  if (query.ward) building.ward = { contains: query.ward, mode: 'insensitive' };
  const room: Prisma.RoomWhereInput = {
    status: 'VACANT',
    workspace: { status: 'ACTIVE' },
    building,
    contracts: { none: startedActiveContractWhere() },
    monthlyRent: { gte: query.minPrice, lte: query.maxPrice },
  };
  return {
    isPublished: true,
    NOT: { moderation: { is: { isHidden: true } } }, // hidden by Platform Admin moderation
    room,
    AND: (query.amenityIds ?? []).map((amenityId) => ({
      room: { amenities: { some: { amenityId } } },
    })),
  };
}
