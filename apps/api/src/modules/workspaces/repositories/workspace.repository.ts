import { Injectable } from '@nestjs/common';
import { Prisma, type WorkspaceRole, type WorkspaceStatus } from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';

export interface WorkspaceAccessRecord {
  id: string;
  name: string;
  status: WorkspaceStatus;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  role: WorkspaceRole;
}

export interface WorkspaceMemberRecord {
  id: string;
  role: WorkspaceRole;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    email: string;
    displayName: string | null;
  };
}

export class WorkspaceUserUnavailableRepositoryError extends Error {}
export class WorkspaceNotFoundRepositoryError extends Error {}
export class WorkspaceArchivedRepositoryError extends Error {}
export class WorkspaceOwnerConflictRepositoryError extends Error {}
export class WorkspaceMemberNotFoundRepositoryError extends Error {}
export class WorkspaceMemberAlreadyExistsRepositoryError extends Error {}
export class WorkspaceOwnerProtectedRepositoryError extends Error {}

@Injectable()
export class WorkspaceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createWithOwner(userId: string, name: string): Promise<WorkspaceAccessRecord> {
    return this.prisma.$transaction(
      async (transaction) => {
        const user = await transaction.user.findUnique({
          where: { id: userId },
          select: { status: true },
        });
        if (!user || user.status !== 'ACTIVE') throw new WorkspaceUserUnavailableRepositoryError();

        const workspace = await transaction.workspace.create({ data: { name } });
        await transaction.workspaceMembership.create({
          data: { workspaceId: workspace.id, userId, role: 'OWNER' },
        });
        return { ...workspace, role: 'OWNER' };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async findForUser(userId: string): Promise<WorkspaceAccessRecord[]> {
    const memberships = await this.prisma.workspaceMembership.findMany({
      where: { userId },
      include: { workspace: true },
      orderBy: [{ workspace: { createdAt: 'asc' } }, { workspaceId: 'asc' }],
    });
    return memberships.map(({ workspace, role }) => ({ ...workspace, role }));
  }

  async findAccessibleWorkspace(
    userId: string,
    workspaceId: string,
  ): Promise<WorkspaceAccessRecord | null> {
    const membership = await this.prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      include: { workspace: true },
    });
    return membership ? { ...membership.workspace, role: membership.role } : null;
  }

  archive(workspaceId: string, ownerUserId: string): Promise<WorkspaceAccessRecord> {
    return this.setLifecycleStatus(workspaceId, ownerUserId, 'ARCHIVED');
  }

  restore(workspaceId: string, ownerUserId: string): Promise<WorkspaceAccessRecord> {
    return this.setLifecycleStatus(workspaceId, ownerUserId, 'ACTIVE');
  }

  listMembers(workspaceId: string, ownerUserId: string): Promise<WorkspaceMemberRecord[]> {
    return this.prisma.$transaction(
      async (transaction) => {
        const actor = await transaction.workspaceMembership.findUnique({
          where: { workspaceId_userId: { workspaceId, userId: ownerUserId } },
          include: { workspace: { select: { id: true } } },
        });
        if (!actor || actor.role !== 'OWNER') throw new WorkspaceNotFoundRepositoryError();
        return transaction.workspaceMembership.findMany({
          where: { workspaceId },
          include: {
            user: { select: { id: true, email: true, displayName: true } },
          },
          orderBy: [{ role: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async addMember(
    workspaceId: string,
    ownerUserId: string,
    email: string,
    role: Exclude<WorkspaceRole, 'OWNER'>,
  ): Promise<WorkspaceMemberRecord> {
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          await lockWritableWorkspaceForOwner(transaction, workspaceId, ownerUserId);
          const user = await transaction.user.findUnique({
            where: { email },
            select: { id: true, status: true },
          });
          if (!user || user.status !== 'ACTIVE') {
            throw new WorkspaceMemberNotFoundRepositoryError();
          }
          return transaction.workspaceMembership.create({
            data: { workspaceId, userId: user.id, role },
            include: {
              user: { select: { id: true, email: true, displayName: true } },
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isUniqueViolation(error)) throw new WorkspaceMemberAlreadyExistsRepositoryError();
      throw error;
    }
  }

  updateMemberRole(
    workspaceId: string,
    ownerUserId: string,
    membershipId: string,
    role: Exclude<WorkspaceRole, 'OWNER'>,
  ): Promise<WorkspaceMemberRecord> {
    return this.prisma.$transaction(
      async (transaction) => {
        await lockWritableWorkspaceForOwner(transaction, workspaceId, ownerUserId);
        const membership = await transaction.workspaceMembership.findFirst({
          where: { id: membershipId, workspaceId },
          include: {
            user: { select: { id: true, email: true, displayName: true } },
          },
        });
        if (!membership) throw new WorkspaceMemberNotFoundRepositoryError();
        if (membership.role === 'OWNER') throw new WorkspaceOwnerProtectedRepositoryError();
        if (membership.role === role) return membership;
        return transaction.workspaceMembership.update({
          where: { id: membership.id },
          data: { role },
          include: {
            user: { select: { id: true, email: true, displayName: true } },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  removeMember(workspaceId: string, ownerUserId: string, membershipId: string): Promise<void> {
    return this.prisma.$transaction(
      async (transaction) => {
        await lockWritableWorkspaceForOwner(transaction, workspaceId, ownerUserId);
        const membership = await transaction.workspaceMembership.findFirst({
          where: { id: membershipId, workspaceId },
          select: { id: true, role: true },
        });
        if (!membership) throw new WorkspaceMemberNotFoundRepositoryError();
        if (membership.role === 'OWNER') throw new WorkspaceOwnerProtectedRepositoryError();
        const removed = await transaction.workspaceMembership.deleteMany({
          where: { id: membership.id, workspaceId, role: { not: 'OWNER' } },
        });
        if (removed.count !== 1) throw new WorkspaceOwnerProtectedRepositoryError();
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async transferOwnership(
    workspaceId: string,
    currentOwnerUserId: string,
    targetMembershipId: string,
  ): Promise<void> {
    try {
      await this.prisma.$transaction(
        async (transaction) => {
          const locked = await transaction.$queryRaw<
            Array<{ id: string; status: WorkspaceStatus }>
          >(
            Prisma.sql`SELECT "id", "status" FROM "workspaces" WHERE "id" = ${workspaceId}::uuid FOR UPDATE`,
          );
          if (!locked[0]) throw new WorkspaceNotFoundRepositoryError();
          if (locked[0].status !== 'ACTIVE') throw new WorkspaceArchivedRepositoryError();

          const currentOwner = await transaction.workspaceMembership.findUnique({
            where: { workspaceId_userId: { workspaceId, userId: currentOwnerUserId } },
            select: { id: true, role: true },
          });
          if (currentOwner?.role !== 'OWNER') throw new WorkspaceOwnerConflictRepositoryError();

          const target = await transaction.workspaceMembership.findFirst({
            where: { id: targetMembershipId, workspaceId },
            select: { id: true, userId: true, role: true, user: { select: { status: true } } },
          });
          if (!target || target.user.status !== 'ACTIVE') {
            throw new WorkspaceMemberNotFoundRepositoryError();
          }
          if (target.role === 'OWNER' || target.userId === currentOwnerUserId) {
            throw new WorkspaceOwnerConflictRepositoryError();
          }

          const demoted = await transaction.workspaceMembership.updateMany({
            where: { id: currentOwner.id, workspaceId, userId: currentOwnerUserId, role: 'OWNER' },
            data: { role: 'MANAGER' },
          });
          if (demoted.count !== 1) throw new WorkspaceOwnerConflictRepositoryError();

          const promoted = await transaction.workspaceMembership.updateMany({
            where: {
              id: target.id,
              workspaceId,
              userId: target.userId,
              role: { in: ['MANAGER', 'STAFF'] },
              user: { status: 'ACTIVE' },
            },
            data: { role: 'OWNER' },
          });
          if (promoted.count !== 1) throw new WorkspaceMemberNotFoundRepositoryError();
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof WorkspaceNotFoundRepositoryError ||
        error instanceof WorkspaceArchivedRepositoryError ||
        error instanceof WorkspaceMemberNotFoundRepositoryError ||
        error instanceof WorkspaceOwnerConflictRepositoryError
      ) {
        throw error;
      }
      if (isOwnerConstraintError(error)) throw new WorkspaceOwnerConflictRepositoryError();
      throw error;
    }
  }

  private async setLifecycleStatus(
    workspaceId: string,
    ownerUserId: string,
    targetStatus: WorkspaceStatus,
  ): Promise<WorkspaceAccessRecord> {
    return this.prisma.$transaction(
      async (transaction) => {
        const locked = await transaction.$queryRaw<Array<{ id: string; status: WorkspaceStatus }>>(
          Prisma.sql`SELECT "id", "status" FROM "workspaces" WHERE "id" = ${workspaceId}::uuid FOR UPDATE`,
        );
        if (!locked[0]) throw new WorkspaceNotFoundRepositoryError();

        const membership = await transaction.workspaceMembership.findUnique({
          where: { workspaceId_userId: { workspaceId, userId: ownerUserId } },
          select: { role: true },
        });
        if (membership?.role !== 'OWNER') throw new WorkspaceNotFoundRepositoryError();

        const workspace =
          locked[0].status === targetStatus
            ? await transaction.workspace.findUnique({ where: { id: workspaceId } })
            : await transaction.workspace.update({
                where: { id: workspaceId },
                data:
                  targetStatus === 'ARCHIVED'
                    ? { status: 'ARCHIVED', archivedAt: new Date() }
                    : { status: 'ACTIVE', archivedAt: null },
              });
        if (!workspace) throw new WorkspaceNotFoundRepositoryError();
        return { ...workspace, role: 'OWNER' };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}

async function lockWritableWorkspaceForOwner(
  transaction: Prisma.TransactionClient,
  workspaceId: string,
  ownerUserId: string,
): Promise<void> {
  const locked = await transaction.$queryRaw<Array<{ id: string; status: WorkspaceStatus }>>(
    Prisma.sql`SELECT "id", "status" FROM "workspaces" WHERE "id" = ${workspaceId}::uuid FOR UPDATE`,
  );
  if (!locked[0]) throw new WorkspaceNotFoundRepositoryError();
  if (locked[0].status !== 'ACTIVE') throw new WorkspaceArchivedRepositoryError();
  const actor = await transaction.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: ownerUserId } },
    select: { role: true },
  });
  if (actor?.role !== 'OWNER') throw new WorkspaceNotFoundRepositoryError();
}

function isOwnerConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return ['P2002', 'P2004', 'P2010', 'P2034'].includes(error.code);
  }
  return false;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
