import { Injectable } from '@nestjs/common';
import { Prisma, type WorkspaceRole, type WorkspaceStatus } from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { isSerializationFailure } from '../../../database/serialization-failure';

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
export class WorkspaceApplicationRequiredRepositoryError extends Error {}
export class WorkspaceActiveOwnershipLimitRepositoryError extends Error {}

@Injectable()
export class WorkspaceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createWithOwner(userId: string, name: string): Promise<WorkspaceAccessRecord> {
    return withSerializationRetry(() =>
      this.prisma.$transaction(
        async (transaction) => {
          await transaction.$queryRaw(
            Prisma.sql`SELECT "id" FROM "users" WHERE "id" = ${userId}::uuid FOR UPDATE`,
          );
          const user = await transaction.user.findUnique({
            where: { id: userId },
            select: { status: true },
          });
          if (!user || user.status !== 'ACTIVE')
            throw new WorkspaceUserUnavailableRepositoryError();

          // Accounts that already own workspaces remain eligible; new accounts spend an approval.
          const existingOwner = await transaction.workspaceMembership.findFirst({
            where: { userId, role: 'OWNER' },
            select: { id: true },
          });
          const approvedApplication = existingOwner
            ? null
            : await transaction.landlordApplication.findFirst({
                where: { userId, status: 'APPROVED', workspaceCreatedAt: null },
                orderBy: { decidedAt: 'desc' },
              });
          if (!existingOwner && !approvedApplication)
            throw new WorkspaceApplicationRequiredRepositoryError();
          const activeOwnedWorkspaceCount = await transaction.workspace.count({
            where: { status: 'ACTIVE', memberships: { some: { userId, role: 'OWNER' } } },
          });
          if (activeOwnedWorkspaceCount >= 1)
            throw new WorkspaceActiveOwnershipLimitRepositoryError();
          if (existingOwner) {
            const ownedWorkspaceCount = await transaction.workspace.count({
              where: { memberships: { some: { userId, role: 'OWNER' } } },
            });
            if (ownedWorkspaceCount >= 2) throw new WorkspaceActiveOwnershipLimitRepositoryError();
          }

          const workspace = await transaction.workspace.create({ data: { name } });
          await transaction.workspaceMembership.create({
            data: { workspaceId: workspace.id, userId, role: 'OWNER' },
          });
          if (approvedApplication)
            await transaction.landlordApplication.update({
              where: { id: approvedApplication.id },
              data: { workspaceCreatedAt: new Date() },
            });
          return { ...workspace, role: 'OWNER' };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async findForUser(userId: string): Promise<WorkspaceAccessRecord[]> {
    const memberships = await this.prisma.workspaceMembership.findMany({
      where: { userId, role: 'OWNER' },
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
    return membership?.role === 'OWNER' ? { ...membership.workspace, role: 'OWNER' } : null;
  }

  archive(workspaceId: string, ownerUserId: string): Promise<WorkspaceAccessRecord> {
    return this.setLifecycleStatus(workspaceId, ownerUserId, 'ARCHIVED');
  }

  restore(workspaceId: string, ownerUserId: string): Promise<WorkspaceAccessRecord> {
    return this.setLifecycleStatus(workspaceId, ownerUserId, 'ACTIVE');
  }

  listMembers(workspaceId: string, ownerUserId: string): Promise<WorkspaceMemberRecord[]> {
    void workspaceId;
    void ownerUserId;
    return Promise.reject(new WorkspaceNotFoundRepositoryError());
  }

  async addMember(
    workspaceId: string,
    ownerUserId: string,
    email: string,
    role: Exclude<WorkspaceRole, 'OWNER'>,
  ): Promise<WorkspaceMemberRecord> {
    void workspaceId;
    void ownerUserId;
    void email;
    void role;
    throw new WorkspaceNotFoundRepositoryError();
  }

  updateMemberRole(
    workspaceId: string,
    ownerUserId: string,
    membershipId: string,
    role: Exclude<WorkspaceRole, 'OWNER'>,
  ): Promise<WorkspaceMemberRecord> {
    void workspaceId;
    void ownerUserId;
    void membershipId;
    void role;
    return Promise.reject(new WorkspaceNotFoundRepositoryError());
  }

  removeMember(workspaceId: string, ownerUserId: string, membershipId: string): Promise<void> {
    void workspaceId;
    void ownerUserId;
    void membershipId;
    return Promise.reject(new WorkspaceNotFoundRepositoryError());
  }

  async transferOwnership(
    workspaceId: string,
    currentOwnerUserId: string,
    targetMembershipId: string,
  ): Promise<void> {
    void workspaceId;
    void currentOwnerUserId;
    void targetMembershipId;
    throw new WorkspaceNotFoundRepositoryError();
  }

  private async setLifecycleStatus(
    workspaceId: string,
    ownerUserId: string,
    targetStatus: WorkspaceStatus,
  ): Promise<WorkspaceAccessRecord> {
    return withSerializationRetry(() =>
      this.prisma.$transaction(
        async (transaction) => {
          // Serialize creates/restores for this owner before checking the active-workspace cap.
          await transaction.$queryRaw(
            Prisma.sql`SELECT "id" FROM "users" WHERE "id" = ${ownerUserId}::uuid FOR UPDATE`,
          );
          const locked = await transaction.$queryRaw<
            Array<{ id: string; status: WorkspaceStatus }>
          >(
            Prisma.sql`SELECT "id", "status" FROM "workspaces" WHERE "id" = ${workspaceId}::uuid FOR UPDATE`,
          );
          if (!locked[0]) throw new WorkspaceNotFoundRepositoryError();

          const membership = await transaction.workspaceMembership.findUnique({
            where: { workspaceId_userId: { workspaceId, userId: ownerUserId } },
            select: { role: true },
          });
          if (membership?.role !== 'OWNER') throw new WorkspaceNotFoundRepositoryError();

          if (targetStatus === 'ACTIVE' && locked[0].status !== 'ACTIVE') {
            const activeOwnedWorkspaceCount = await transaction.workspace.count({
              where: {
                id: { not: workspaceId },
                status: 'ACTIVE',
                memberships: { some: { userId: ownerUserId, role: 'OWNER' } },
              },
            });
            if (activeOwnedWorkspaceCount >= 1)
              throw new WorkspaceActiveOwnershipLimitRepositoryError();
          }

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
      ),
    );
  }
}

async function withSerializationRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isSerializationFailure(error) || attempt >= 4) throw error;
    }
  }
}
