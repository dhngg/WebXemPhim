import { Injectable } from '@nestjs/common';
import type {
  CreateRatePlanRequest,
  StopRatePlanRequest,
  UpdateRatePlanRequest,
} from '@rental/shared';
import {
  Prisma,
  type BuildingStatus,
  type RatePlan,
  type WorkspaceStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceNotFoundRepositoryError,
} from '../../workspaces/repositories/workspace.repository';
import type { RatePlanQueryDto } from '../dto/rate-plan.dto';
export type RatePlanRecord = RatePlan;
export class RatePlanNotFoundRepositoryError extends Error {}
export class RatePlanConflictRepositoryError extends Error {}
export class RatePlanInactiveRepositoryError extends Error {}
export class RatePlanNotEligibleRepositoryError extends Error {}
@Injectable()
export class RatePlanRepository {
  constructor(private readonly prisma: PrismaService) {}
  async create(
    workspaceId: string,
    actorUserId: string,
    buildingId: string,
    input: CreateRatePlanRequest,
  ) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await assertScope(tx, workspaceId, actorUserId, buildingId);
          return tx.ratePlan.create({
            data: {
              workspaceId,
              buildingId,
              code: input.code,
              name: input.name,
              serviceType: input.serviceType,
              billingUnit: input.billingUnit,
              unitPrice: input.unitPrice,
              effectiveFrom: toDate(input.effectiveFrom),
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isConflict(error)) throw new RatePlanConflictRepositoryError();
      throw error;
    }
  }
  async list(workspaceId: string, buildingId: string, query: RatePlanQueryDto) {
    const where: Prisma.RatePlanWhereInput = {
      workspaceId,
      buildingId,
      status: query.status,
      serviceType: query.serviceType,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.ratePlan.findMany({
        where,
        orderBy: [{ code: 'asc' }, { effectiveFrom: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.ratePlan.count({ where }),
    ]);
    return { items, total };
  }
  async update(
    workspaceId: string,
    actorUserId: string,
    buildingId: string,
    ratePlanId: string,
    input: UpdateRatePlanRequest,
  ) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await assertScope(tx, workspaceId, actorUserId, buildingId);
          const current = await lockRate(tx, workspaceId, buildingId, ratePlanId);
          if (current.status !== 'ACTIVE') throw new RatePlanInactiveRepositoryError();
          const nextFrom = toDate(input.effectiveFrom);
          if (nextFrom <= current.effectiveFrom) throw new RatePlanNotEligibleRepositoryError();
          await tx.ratePlan.update({
            where: { id: ratePlanId },
            data: { status: 'INACTIVE', effectiveTo: nextFrom },
          });
          return tx.ratePlan.create({
            data: {
              workspaceId,
              buildingId,
              code: current.code,
              name: input.name ?? current.name,
              serviceType: input.serviceType ?? current.serviceType,
              billingUnit: input.billingUnit ?? current.billingUnit,
              unitPrice: input.unitPrice,
              effectiveFrom: nextFrom,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isConflict(error)) throw new RatePlanConflictRepositoryError();
      throw error;
    }
  }
  stop(
    workspaceId: string,
    actorUserId: string,
    buildingId: string,
    ratePlanId: string,
    input: StopRatePlanRequest,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await assertScope(tx, workspaceId, actorUserId, buildingId);
        const current = await lockRate(tx, workspaceId, buildingId, ratePlanId);
        if (current.status === 'INACTIVE') return current;
        const end = toDate(input.effectiveTo);
        if (end <= current.effectiveFrom) throw new RatePlanNotEligibleRepositoryError();
        return tx.ratePlan.update({
          where: { id: ratePlanId },
          data: { status: 'INACTIVE', effectiveTo: end },
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
  if (!building[0] || building[0].status !== 'ACTIVE')
    throw new RatePlanNotEligibleRepositoryError();
}
async function lockRate(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  buildingId: string,
  id: string,
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "rate_plans" WHERE "id"=${id}::uuid AND "workspace_id"=${workspaceId}::uuid AND "building_id"=${buildingId}::uuid FOR UPDATE`,
  );
  if (!rows[0]) throw new RatePlanNotFoundRepositoryError();
  const rate = await tx.ratePlan.findUnique({ where: { id } });
  if (!rate) throw new RatePlanNotFoundRepositoryError();
  return rate;
}
const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
function isConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2002' ||
      error.code === 'P2004' ||
      String(error.meta?.constraint ?? '').includes('rate_plans_period_excl'))
  );
}
