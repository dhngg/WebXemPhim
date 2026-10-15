import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type Building,
  type BuildingStatus,
  type WorkspaceRole,
  type WorkspaceStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import type { CreateBuildingRequest, UpdateBuildingRequest } from '@rental/shared';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceNotFoundRepositoryError,
} from '../../workspaces/repositories/workspace.repository';

export type BuildingRecord = Building;
export class BuildingNotFoundRepositoryError extends Error {}
export class BuildingArchivedRepositoryError extends Error {}

@Injectable()
export class BuildingRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    workspaceId: string,
    actorUserId: string,
    input: CreateBuildingRequest,
  ): Promise<BuildingRecord> {
    return this.prisma.$transaction(
      async (transaction) => {
        const workspace = await transaction.$queryRaw<Array<{ status: WorkspaceStatus }>>(
          Prisma.sql`SELECT "status" FROM "workspaces" WHERE "id" = ${workspaceId}::uuid FOR SHARE`,
        );
        if (!workspace[0]) throw new WorkspaceNotFoundRepositoryError();
        if (workspace[0].status !== 'ACTIVE') throw new WorkspaceArchivedRepositoryError();

        const membership = await transaction.workspaceMembership.findUnique({
          where: { workspaceId_userId: { workspaceId, userId: actorUserId } },
          select: { role: true },
        });
        if (membership?.role !== 'OWNER') {
          throw new WorkspaceNotFoundRepositoryError();
        }

        return transaction.building.create({
          data: {
            workspaceId,
            name: input.name,
            description: input.description,
            addressLine1: input.addressLine1,
            addressLine2: input.addressLine2,
            ward: input.ward,
            district: input.district,
            city: input.city,
            postalCode: input.postalCode,
            latitude: input.latitude,
            longitude: input.longitude,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  list(workspaceId: string): Promise<BuildingRecord[]> {
    return this.prisma.building.findMany({
      where: { workspaceId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  detail(workspaceId: string, buildingId: string): Promise<BuildingRecord | null> {
    return this.prisma.building.findFirst({ where: { id: buildingId, workspaceId } });
  }

  update(
    workspaceId: string,
    actorUserId: string,
    buildingId: string,
    input: UpdateBuildingRequest,
  ): Promise<BuildingRecord> {
    return this.prisma.$transaction(
      async (transaction) => {
        await lockWritableWorkspace(transaction, workspaceId, actorUserId, ['OWNER']);
        const building = await lockBuilding(transaction, workspaceId, buildingId);
        if (building.status !== 'ACTIVE') throw new BuildingArchivedRepositoryError();
        const updated = await transaction.building.updateMany({
          where: { id: buildingId, workspaceId, status: 'ACTIVE' },
          data: input,
        });
        if (updated.count !== 1) throw new BuildingNotFoundRepositoryError();
        const result = await transaction.building.findFirst({
          where: { id: buildingId, workspaceId },
        });
        if (!result) throw new BuildingNotFoundRepositoryError();
        return result;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  archive(workspaceId: string, ownerUserId: string, buildingId: string): Promise<BuildingRecord> {
    return this.setLifecycleStatus(workspaceId, ownerUserId, buildingId, 'ARCHIVED');
  }

  restore(workspaceId: string, ownerUserId: string, buildingId: string): Promise<BuildingRecord> {
    return this.setLifecycleStatus(workspaceId, ownerUserId, buildingId, 'ACTIVE');
  }

  private setLifecycleStatus(
    workspaceId: string,
    ownerUserId: string,
    buildingId: string,
    status: BuildingStatus,
  ): Promise<BuildingRecord> {
    return this.prisma.$transaction(
      async (transaction) => {
        await lockWritableWorkspace(transaction, workspaceId, ownerUserId, ['OWNER']);
        const building = await lockBuilding(transaction, workspaceId, buildingId);
        if (building.status !== status) {
          const updated = await transaction.building.updateMany({
            where: { id: buildingId, workspaceId, status: building.status },
            data:
              status === 'ARCHIVED'
                ? { status: 'ARCHIVED', archivedAt: new Date() }
                : { status: 'ACTIVE', archivedAt: null },
          });
          if (updated.count !== 1) throw new BuildingNotFoundRepositoryError();
        }
        const result = await transaction.building.findFirst({
          where: { id: buildingId, workspaceId },
        });
        if (!result) throw new BuildingNotFoundRepositoryError();
        return result;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}

async function lockWritableWorkspace(
  transaction: Prisma.TransactionClient,
  workspaceId: string,
  actorUserId: string,
  allowedRoles: WorkspaceRole[],
): Promise<void> {
  const workspace = await transaction.$queryRaw<Array<{ status: WorkspaceStatus }>>(
    Prisma.sql`SELECT "status" FROM "workspaces" WHERE "id" = ${workspaceId}::uuid FOR SHARE`,
  );
  if (!workspace[0]) throw new WorkspaceNotFoundRepositoryError();
  if (workspace[0].status !== 'ACTIVE') throw new WorkspaceArchivedRepositoryError();
  const membership = await transaction.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: actorUserId } },
    select: { role: true },
  });
  if (!membership || !allowedRoles.includes(membership.role)) {
    throw new WorkspaceNotFoundRepositoryError();
  }
}

async function lockBuilding(
  transaction: Prisma.TransactionClient,
  workspaceId: string,
  buildingId: string,
): Promise<{ id: string; status: BuildingStatus }> {
  const rows = await transaction.$queryRaw<Array<{ id: string; status: BuildingStatus }>>(
    Prisma.sql`SELECT "id", "status" FROM "buildings" WHERE "id" = ${buildingId}::uuid AND "workspace_id" = ${workspaceId}::uuid FOR UPDATE`,
  );
  if (!rows[0]) throw new BuildingNotFoundRepositoryError();
  return rows[0];
}
