import { Injectable } from '@nestjs/common';
import type {
  CreateVehicleRequest,
  StopVehicleRequest,
  UpdateVehicleRequest,
} from '@rental/shared';
import { Prisma, type WorkspaceStatus } from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceNotFoundRepositoryError,
} from '../../workspaces/repositories/workspace.repository';
import type { VehicleQueryDto } from '../dto/vehicle.dto';

const vehicleInclude = {
  tenant: { select: { id: true, fullName: true } },
} satisfies Prisma.VehicleInclude;
export type VehicleRecord = Prisma.VehicleGetPayload<{ include: typeof vehicleInclude }>;
export class VehicleNotFoundRepositoryError extends Error {}
export class VehicleAlreadyExistsRepositoryError extends Error {}
export class VehicleInactiveRepositoryError extends Error {}
export class VehicleNotEligibleRepositoryError extends Error {}

@Injectable()
export class VehicleRepository {
  constructor(private readonly prisma: PrismaService) {}
  async create(
    workspaceId: string,
    actorUserId: string,
    input: CreateVehicleRequest,
  ): Promise<VehicleRecord> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await assertWorkspaceManager(tx, workspaceId, actorUserId);
          const tenant = await tx.$queryRaw<Array<{ status: string }>>(
            Prisma.sql`SELECT "status"::text AS "status" FROM "tenants" WHERE "id" = ${input.tenantId}::uuid AND "workspace_id" = ${workspaceId}::uuid FOR SHARE`,
          );
          if (!tenant[0] || tenant[0].status !== 'ACTIVE')
            throw new VehicleNotEligibleRepositoryError();
          return tx.vehicle.create({ data: { workspaceId, ...input }, include: vehicleInclude });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isUnique(error)) throw new VehicleAlreadyExistsRepositoryError();
      throw error;
    }
  }
  async list(workspaceId: string, query: VehicleQueryDto) {
    const where: Prisma.VehicleWhereInput = {
      workspaceId,
      status: query.status,
      tenantId: query.tenantId,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.vehicle.findMany({
        where,
        include: vehicleInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.vehicle.count({ where }),
    ]);
    return { items, total };
  }
  detail(workspaceId: string, vehicleId: string) {
    return this.prisma.vehicle.findFirst({
      where: { id: vehicleId, workspaceId },
      include: vehicleInclude,
    });
  }
  async update(
    workspaceId: string,
    actorUserId: string,
    vehicleId: string,
    input: UpdateVehicleRequest,
  ): Promise<VehicleRecord> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await assertWorkspaceManager(tx, workspaceId, actorUserId);
          const vehicle = await lockVehicle(tx, workspaceId, vehicleId);
          if (vehicle.status !== 'ACTIVE') throw new VehicleInactiveRepositoryError();
          const tenant = await tx.tenant.findFirst({
            where: { id: vehicle.tenantId, workspaceId, status: 'ACTIVE' },
            select: { id: true },
          });
          if (!tenant) throw new VehicleNotEligibleRepositoryError();
          return tx.vehicle.update({
            where: { id: vehicleId },
            data: input,
            include: vehicleInclude,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isUnique(error)) throw new VehicleAlreadyExistsRepositoryError();
      throw error;
    }
  }
  stop(
    workspaceId: string,
    actorUserId: string,
    vehicleId: string,
    input: StopVehicleRequest,
  ): Promise<VehicleRecord> {
    return this.prisma.$transaction(
      async (tx) => {
        await assertWorkspaceManager(tx, workspaceId, actorUserId);
        const vehicle = await lockVehicle(tx, workspaceId, vehicleId);
        if (vehicle.status === 'ACTIVE')
          await tx.vehicle.update({
            where: { id: vehicleId },
            data: { status: 'INACTIVE', inactiveAt: new Date(), inactiveReason: input.reason },
          });
        const result = await tx.vehicle.findUnique({
          where: { id: vehicleId },
          include: vehicleInclude,
        });
        if (!result) throw new VehicleNotFoundRepositoryError();
        return result;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
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
async function lockVehicle(tx: Prisma.TransactionClient, workspaceId: string, vehicleId: string) {
  const rows = await tx.$queryRaw<Array<{ status: 'ACTIVE' | 'INACTIVE'; tenantId: string }>>(
    Prisma.sql`SELECT "status", "tenant_id" AS "tenantId" FROM "vehicles" WHERE "id" = ${vehicleId}::uuid AND "workspace_id" = ${workspaceId}::uuid FOR UPDATE`,
  );
  if (!rows[0]) throw new VehicleNotFoundRepositoryError();
  return rows[0];
}
function isUnique(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
