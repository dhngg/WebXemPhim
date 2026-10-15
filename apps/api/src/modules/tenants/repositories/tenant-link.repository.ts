import { Injectable } from '@nestjs/common';
import type {
  CreateTenantLinkRequest,
  DecideTenantLinkRequest,
  RevokeTenantLinkRequest,
  TenantLinkRequestStatus,
} from '@rental/shared';
import { Prisma, type WorkspaceStatus } from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceNotFoundRepositoryError,
} from '../../workspaces/repositories/workspace.repository';
import type { TenantLinkRequestQueryDto } from '../dto/tenant-link.dto';
import { TenantArchivedRepositoryError, TenantNotFoundRepositoryError } from './tenant.repository';

const requestInclude = { tenant: true, requester: true } satisfies Prisma.TenantLinkRequestInclude;
export type TenantLinkRequestRecord = Prisma.TenantLinkRequestGetPayload<{
  include: typeof requestInclude;
}>;
export type TenantUserLinkRecord = Prisma.TenantUserLinkGetPayload<Record<string, never>>;
export type TenantAccountLinkRecord = Prisma.TenantUserLinkGetPayload<{
  include: { user: { select: { id: true; email: true; displayName: true } } };
}>;

export class TenantLinkRequestNotFoundRepositoryError extends Error {}
export class TenantLinkRequestConflictRepositoryError extends Error {}
export class TenantLinkRequestInvalidTransitionRepositoryError extends Error {}
export class TenantLinkNotFoundRepositoryError extends Error {}
export class TenantInvitationInvalidRepositoryError extends Error {}
export class TenantInvitationConflictRepositoryError extends Error {}

@Injectable()
export class TenantLinkRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createInvitation(
    workspaceId: string,
    tenantId: string,
    creatorId: string,
    tokenHash: Uint8Array<ArrayBuffer>,
    expiresAt: Date,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await assertWorkspaceManager(tx, workspaceId, creatorId);
        const tenant = await tx.tenant.findFirst({
          where: { id: tenantId, workspaceId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!tenant) throw new TenantNotFoundRepositoryError();
        const existing = await tx.tenantUserLink.findFirst({
          where: { tenantId, revokedAt: null },
          select: { id: true },
        });
        if (existing) throw new TenantInvitationConflictRepositoryError();
        return tx.tenantInvitation.create({
          data: { workspaceId, tenantId, createdByUserId: creatorId, tokenHash, expiresAt },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async acceptInvitation(userId: string, tokenHash: Uint8Array<ArrayBuffer>, now: Date) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<
            Array<{
              id: string;
              workspaceId: string;
              tenantId: string;
              createdByUserId: string;
              acceptedAt: Date | null;
              expiresAt: Date;
            }>
          >(
            Prisma.sql`SELECT "id", "workspace_id" AS "workspaceId", "tenant_id" AS "tenantId", "created_by_user_id" AS "createdByUserId", "accepted_at" AS "acceptedAt", "expires_at" AS "expiresAt" FROM "tenant_invitations" WHERE "token_hash" = ${tokenHash} FOR UPDATE`,
          );
          const invitation = rows[0];
          if (!invitation || invitation.acceptedAt || invitation.expiresAt <= now)
            throw new TenantInvitationInvalidRepositoryError();
          const eligible = await tx.tenant.findFirst({
            where: {
              id: invitation.tenantId,
              workspaceId: invitation.workspaceId,
              status: 'ACTIVE',
              workspace: { status: 'ACTIVE' },
            },
            select: { id: true },
          });
          const user = await tx.user.findFirst({
            where: { id: userId, status: 'ACTIVE' },
            select: { id: true },
          });
          if (!eligible || !user) throw new TenantInvitationInvalidRepositoryError();
          const existing = await tx.tenantUserLink.findFirst({
            where: {
              revokedAt: null,
              OR: [
                { tenantId: invitation.tenantId },
                { userId, workspaceId: invitation.workspaceId },
              ],
            },
            select: { id: true },
          });
          if (existing) throw new TenantInvitationConflictRepositoryError();
          const link = await tx.tenantUserLink.create({
            data: {
              workspaceId: invitation.workspaceId,
              tenantId: invitation.tenantId,
              userId,
              linkRequestId: null,
              invitationId: invitation.id,
              approvedByUserId: invitation.createdByUserId,
            },
          });
          await tx.tenantInvitation.update({
            where: { id: invitation.id },
            data: { acceptedAt: now, acceptedByUserId: userId },
          });
          return link;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isUniqueViolation(error)) throw new TenantInvitationConflictRepositoryError();
      throw error;
    }
  }

  /**
   * ACTIVE (not revoked) links of one tenant profile, for the workspace OWNER only. The tenant must belong to the
   * workspace, so links of other workspaces are never reachable. Read-only: also works for an archived workspace.
   */
  async listActiveLinks(
    workspaceId: string,
    ownerUserId: string,
    tenantId: string,
  ): Promise<TenantAccountLinkRecord[]> {
    const membership = await this.prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: ownerUserId } },
      select: { role: true },
    });
    if (membership?.role !== 'OWNER') throw new WorkspaceNotFoundRepositoryError();
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, workspaceId },
      select: { id: true },
    });
    if (!tenant) throw new TenantNotFoundRepositoryError();
    return this.prisma.tenantUserLink.findMany({
      where: { workspaceId, tenantId, revokedAt: null },
      include: { user: { select: { id: true, email: true, displayName: true } } },
      orderBy: { linkedAt: 'desc' },
    });
  }

  async createRequest(
    requesterUserId: string,
    tenantId: string,
    input: CreateTenantLinkRequest,
  ): Promise<TenantLinkRequestRecord> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<Array<{ workspaceId: string; status: string }>>(
            Prisma.sql`SELECT "workspace_id" AS "workspaceId", "status"::text AS "status" FROM "tenants" WHERE "id" = ${tenantId}::uuid FOR SHARE`,
          );
          const tenant = rows[0];
          if (!tenant) throw new TenantNotFoundRepositoryError();
          if (tenant.status !== 'ACTIVE') throw new TenantArchivedRepositoryError();
          const eligible = await tx.tenant.findFirst({
            where: {
              id: tenantId,
              workspaceId: tenant.workspaceId,
              status: 'ACTIVE',
              workspace: { status: 'ACTIVE' },
            },
            select: { id: true },
          });
          const user = await tx.user.findFirst({
            where: { id: requesterUserId, status: 'ACTIVE' },
            select: { id: true },
          });
          if (!eligible || !user) throw new TenantNotFoundRepositoryError();
          const existingLink = await tx.tenantUserLink.findFirst({
            where: {
              revokedAt: null,
              OR: [{ tenantId }, { userId: requesterUserId, workspaceId: tenant.workspaceId }],
            },
            select: { id: true },
          });
          if (existingLink) throw new TenantLinkRequestConflictRepositoryError();
          return tx.tenantLinkRequest.create({
            data: {
              workspaceId: tenant.workspaceId,
              tenantId,
              requesterUserId,
              message: input.message,
            },
            include: requestInclude,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isUniqueViolation(error)) throw new TenantLinkRequestConflictRepositoryError();
      throw error;
    }
  }

  listMine(requesterUserId: string, query: TenantLinkRequestQueryDto) {
    return this.listPage({ requesterUserId, status: query.status }, query);
  }

  listWorkspace(workspaceId: string, query: TenantLinkRequestQueryDto) {
    return this.listPage({ workspaceId, status: query.status }, query);
  }

  async approve(
    workspaceId: string,
    actorUserId: string,
    requestId: string,
    input: DecideTenantLinkRequest,
  ): Promise<{ request: TenantLinkRequestRecord; link: TenantUserLinkRecord }> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await assertWorkspaceManager(tx, workspaceId, actorUserId);
          const request = await lockPendingRequest(tx, workspaceId, requestId);
          const eligible = await tx.tenantLinkRequest.findFirst({
            where: {
              id: requestId,
              workspaceId,
              tenant: { status: 'ACTIVE' },
              requester: { status: 'ACTIVE' },
            },
            select: { tenantId: true, requesterUserId: true },
          });
          if (!eligible) throw new TenantNotFoundRepositoryError();
          const link = await tx.tenantUserLink.create({
            data: {
              workspaceId,
              tenantId: eligible.tenantId,
              userId: eligible.requesterUserId,
              linkRequestId: requestId,
              approvedByUserId: actorUserId,
            },
          });
          await tx.tenantLinkRequest.update({
            where: { id: requestId },
            data: {
              status: 'APPROVED',
              decisionNote: input.note,
              decidedByUserId: actorUserId,
              decidedAt: new Date(),
            },
          });
          return { request: await findRequest(tx, request.id), link };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isUniqueViolation(error)) throw new TenantLinkRequestConflictRepositoryError();
      throw error;
    }
  }

  reject(
    workspaceId: string,
    actorUserId: string,
    requestId: string,
    input: DecideTenantLinkRequest,
  ): Promise<TenantLinkRequestRecord> {
    return this.prisma.$transaction(
      async (tx) => {
        await assertWorkspaceManager(tx, workspaceId, actorUserId);
        await lockPendingRequest(tx, workspaceId, requestId);
        await tx.tenantLinkRequest.update({
          where: { id: requestId },
          data: {
            status: 'REJECTED',
            decisionNote: input.note,
            decidedByUserId: actorUserId,
            decidedAt: new Date(),
          },
        });
        return findRequest(tx, requestId);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  revoke(
    workspaceId: string,
    actorUserId: string,
    linkId: string,
    input: RevokeTenantLinkRequest,
  ): Promise<TenantUserLinkRecord> {
    return this.prisma.$transaction(
      async (tx) => {
        await assertWorkspaceManager(tx, workspaceId, actorUserId);
        const rows = await tx.$queryRaw<Array<{ revokedAt: Date | null }>>(
          Prisma.sql`SELECT "revoked_at" AS "revokedAt" FROM "tenant_user_links" WHERE "id" = ${linkId}::uuid AND "workspace_id" = ${workspaceId}::uuid FOR UPDATE`,
        );
        if (!rows[0]) throw new TenantLinkNotFoundRepositoryError();
        if (rows[0].revokedAt) throw new TenantLinkNotFoundRepositoryError();
        return tx.tenantUserLink.update({
          where: { id: linkId },
          data: { revokedAt: new Date(), revokedByUserId: actorUserId, revokeReason: input.reason },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  listLinkedTenants(userId: string) {
    return this.prisma.tenant.findMany({
      where: {
        status: 'ACTIVE',
        workspace: { status: 'ACTIVE' },
        userLinks: { some: { userId, revokedAt: null } },
      },
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
    });
  }

  private async listPage(
    where: Prisma.TenantLinkRequestWhereInput,
    query: TenantLinkRequestQueryDto,
  ) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantLinkRequest.findMany({
        where,
        include: requestInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.tenantLinkRequest.count({ where }),
    ]);
    return { items, total };
  }
}

async function lockPendingRequest(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  requestId: string,
): Promise<{ id: string; status: TenantLinkRequestStatus }> {
  const rows = await tx.$queryRaw<Array<{ id: string; status: TenantLinkRequestStatus }>>(
    Prisma.sql`SELECT "id", "status"::text AS "status" FROM "tenant_link_requests" WHERE "id" = ${requestId}::uuid AND "workspace_id" = ${workspaceId}::uuid FOR UPDATE`,
  );
  if (!rows[0]) throw new TenantLinkRequestNotFoundRepositoryError();
  if (rows[0].status !== 'PENDING') throw new TenantLinkRequestInvalidTransitionRepositoryError();
  return rows[0];
}

async function findRequest(tx: Prisma.TransactionClient, id: string) {
  const result = await tx.tenantLinkRequest.findUnique({ where: { id }, include: requestInclude });
  if (!result) throw new TenantLinkRequestNotFoundRepositoryError();
  return result;
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

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
