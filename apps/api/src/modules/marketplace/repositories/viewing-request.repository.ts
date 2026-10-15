import { Injectable } from '@nestjs/common';
import type {
  CreateViewingRequestRequest,
  DecideViewingRequestRequest,
  ViewingRequestStatus,
} from '@rental/shared';
import {
  Prisma,
  type ViewingRequestStatus as PrismaViewingRequestStatus,
  type WorkspaceStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { startedActiveContractWhere } from '../../contracts/contract-occupancy';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceNotFoundRepositoryError,
} from '../../workspaces/repositories/workspace.repository';
import type { ViewingRequestQueryDto } from '../dto/viewing-request.dto';

const viewingRequestInclude = {
  requester: true,
  listing: { include: { room: { include: { building: true } } } },
} satisfies Prisma.ViewingRequestInclude;

export type ViewingRequestRecord = Prisma.ViewingRequestGetPayload<{
  include: typeof viewingRequestInclude;
}>;
export class ViewingRequestNotFoundRepositoryError extends Error {}
export class ViewingRequestNotEligibleRepositoryError extends Error {}
export class ViewingRequestInvalidTransitionRepositoryError extends Error {}
export class ViewingRequestConflictRepositoryError extends Error {}

@Injectable()
export class ViewingRequestRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    requesterUserId: string,
    listingId: string,
    input: CreateViewingRequestRequest,
  ): Promise<ViewingRequestRecord> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const scheduledAt = new Date(input.scheduledAt);
          if (scheduledAt.getTime() <= Date.now())
            throw new ViewingRequestNotEligibleRepositoryError();
          await tx.$queryRaw(
            Prisma.sql`SELECT "id" FROM "listings" WHERE "id" = ${listingId}::uuid FOR SHARE`,
          );
          const listing = await tx.listing.findFirst({
            where: {
              id: listingId,
              isPublished: true,
              NOT: { moderation: { is: { isHidden: true } } },
              room: {
                status: 'VACANT',
                workspace: { status: 'ACTIVE' },
                building: { status: 'ACTIVE' },
                contracts: { none: startedActiveContractWhere() },
              },
            },
            select: { id: true, workspaceId: true },
          });
          if (!listing) throw new ViewingRequestNotEligibleRepositoryError();
          return tx.viewingRequest.create({
            data: {
              workspaceId: listing.workspaceId,
              listingId,
              requesterUserId,
              scheduledAt,
              message: input.message,
            },
            include: viewingRequestInclude,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isUniqueViolation(error)) throw new ViewingRequestConflictRepositoryError();
      throw error;
    }
  }

  listMine(requesterUserId: string, query: ViewingRequestQueryDto) {
    return this.listPage({ requesterUserId, status: query.status }, query);
  }

  listWorkspace(workspaceId: string, query: ViewingRequestQueryDto) {
    return this.listPage({ workspaceId, status: query.status }, query);
  }

  cancel(requesterUserId: string, requestId: string): Promise<ViewingRequestRecord> {
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<Array<{ status: PrismaViewingRequestStatus }>>(
          Prisma.sql`SELECT "status" FROM "viewing_requests" WHERE "id" = ${requestId}::uuid AND "requester_user_id" = ${requesterUserId}::uuid FOR UPDATE`,
        );
        if (!rows[0]) throw new ViewingRequestNotFoundRepositoryError();
        if (!['PENDING', 'CONFIRMED'].includes(rows[0].status))
          throw new ViewingRequestInvalidTransitionRepositoryError();
        await tx.viewingRequest.update({
          where: { id: requestId },
          data: { status: 'CANCELLED', cancelledAt: new Date() },
        });
        return this.findRequired(tx, requestId);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  decide(
    workspaceId: string,
    actorUserId: string,
    requestId: string,
    status: Extract<ViewingRequestStatus, 'CONFIRMED' | 'REJECTED'>,
    input: DecideViewingRequestRequest,
  ): Promise<ViewingRequestRecord> {
    return this.prisma.$transaction(
      async (tx) => {
        await assertWorkspaceManager(tx, workspaceId, actorUserId);
        const rows = await tx.$queryRaw<
          Array<{ status: PrismaViewingRequestStatus; listingId: string; scheduledAt: Date }>
        >(
          Prisma.sql`SELECT "status", "listing_id" AS "listingId", "scheduled_at" AS "scheduledAt" FROM "viewing_requests" WHERE "id" = ${requestId}::uuid AND "workspace_id" = ${workspaceId}::uuid FOR UPDATE`,
        );
        const request = rows[0];
        if (!request) throw new ViewingRequestNotFoundRepositoryError();
        if (request.status !== 'PENDING')
          throw new ViewingRequestInvalidTransitionRepositoryError();
        if (status === 'CONFIRMED') {
          if (request.scheduledAt.getTime() <= Date.now())
            throw new ViewingRequestNotEligibleRepositoryError();
          const eligible = await tx.listing.findFirst({
            where: {
              id: request.listingId,
              workspaceId,
              isPublished: true,
              NOT: { moderation: { is: { isHidden: true } } },
              room: {
                status: 'VACANT',
                workspace: { status: 'ACTIVE' },
                building: { status: 'ACTIVE' },
                contracts: { none: startedActiveContractWhere() },
              },
            },
            select: { id: true },
          });
          if (!eligible) throw new ViewingRequestNotEligibleRepositoryError();
        }
        await tx.viewingRequest.update({
          where: { id: requestId },
          data: {
            status,
            decisionNote: input.note,
            decidedByUserId: actorUserId,
            decidedAt: new Date(),
          },
        });
        return this.findRequired(tx, requestId);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async listPage(where: Prisma.ViewingRequestWhereInput, query: ViewingRequestQueryDto) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.viewingRequest.findMany({
        where,
        include: viewingRequestInclude,
        orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.viewingRequest.count({ where }),
    ]);
    return { items, total };
  }

  private async findRequired(
    tx: Prisma.TransactionClient,
    requestId: string,
  ): Promise<ViewingRequestRecord> {
    const result = await tx.viewingRequest.findUnique({
      where: { id: requestId },
      include: viewingRequestInclude,
    });
    if (!result) throw new ViewingRequestNotFoundRepositoryError();
    return result;
  }
}

async function assertWorkspaceManager(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  actorUserId: string,
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
  if (membership?.role !== 'OWNER') throw new WorkspaceNotFoundRepositoryError();
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
