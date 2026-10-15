import { Injectable } from '@nestjs/common';
import type { CreateTenantRequest, UpdateTenantRequest } from '@rental/shared';
import {
  Prisma,
  type Tenant,
  type WorkspaceRole,
  type WorkspaceStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { isSerializationFailure } from '../../../database/serialization-failure';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceNotFoundRepositoryError,
} from '../../workspaces/repositories/workspace.repository';
import type { TenantQueryDto } from '../dto/tenant.dto';

export type TenantRecord = Tenant;
export class TenantNotFoundRepositoryError extends Error {}
export class TenantArchivedRepositoryError extends Error {}
export class TenantHasActiveContractRepositoryError extends Error {}

@Injectable()
export class TenantRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    workspaceId: string,
    actorUserId: string,
    input: CreateTenantRequest,
  ): Promise<TenantRecord> {
    return this.prisma.$transaction(
      async (tx) => {
        await assertWritableWorkspace(tx, workspaceId, actorUserId, ['OWNER']);
        return tx.tenant.create({ data: toCreateData(workspaceId, input) });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async list(workspaceId: string, query: TenantQueryDto) {
    const where: Prisma.TenantWhereInput = { workspaceId, status: query.status };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenant.findMany({
        where,
        orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.tenant.count({ where }),
    ]);
    return { items, total };
  }

  detail(workspaceId: string, tenantId: string): Promise<TenantRecord | null> {
    return this.prisma.tenant.findFirst({ where: { id: tenantId, workspaceId } });
  }

  update(
    workspaceId: string,
    actorUserId: string,
    tenantId: string,
    input: UpdateTenantRequest,
  ): Promise<TenantRecord> {
    return this.prisma.$transaction(
      async (tx) => {
        await assertWritableWorkspace(tx, workspaceId, actorUserId, ['OWNER']);
        const rows = await tx.$queryRaw<Array<{ status: 'ACTIVE' | 'ARCHIVED' }>>(
          Prisma.sql`SELECT "status" FROM "tenants" WHERE "id" = ${tenantId}::uuid AND "workspace_id" = ${workspaceId}::uuid FOR UPDATE`,
        );
        if (!rows[0]) throw new TenantNotFoundRepositoryError();
        if (rows[0].status === 'ARCHIVED') throw new TenantArchivedRepositoryError();
        return tx.tenant.update({
          where: { id: tenantId },
          data: toUpdateData(input),
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  /**
   * Archive/restore are idempotent and keep every historical row (contracts, vehicles, links).
   * Archiving is refused while the tenant still has an ACTIVE contract.
   */
  async setArchived(
    workspaceId: string,
    actorUserId: string,
    tenantId: string,
    archive: boolean,
  ): Promise<TenantRecord> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            await assertWritableWorkspace(tx, workspaceId, actorUserId, ['OWNER']);
            const rows = await tx.$queryRaw<Array<{ status: 'ACTIVE' | 'ARCHIVED' }>>(
              Prisma.sql`SELECT "status" FROM "tenants" WHERE "id" = ${tenantId}::uuid AND "workspace_id" = ${workspaceId}::uuid FOR UPDATE`,
            );
            if (!rows[0]) throw new TenantNotFoundRepositoryError();
            const target = archive ? 'ARCHIVED' : 'ACTIVE';
            if (rows[0].status === target)
              return tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
            if (archive) {
              const active = await tx.contract.count({
                where: { tenantId, workspaceId, status: 'ACTIVE' },
              });
              if (active > 0) throw new TenantHasActiveContractRepositoryError();
            }
            return tx.tenant.update({
              where: { id: tenantId },
              data: { status: target, archivedAt: archive ? new Date() : null },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (!isSerializationFailure(error) || attempt >= 4) throw error;
      }
    }
  }
}

async function assertWritableWorkspace(
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

function toCreateData(workspaceId: string, input: CreateTenantRequest): Prisma.TenantCreateInput {
  return {
    workspace: { connect: { id: workspaceId } },
    fullName: input.fullName,
    phone: input.phone,
    email: input.email,
    dateOfBirth: input.dateOfBirth ? new Date(`${input.dateOfBirth}T00:00:00.000Z`) : undefined,
    address: input.address,
    notes: input.notes,
  };
}

function toUpdateData(input: UpdateTenantRequest): Prisma.TenantUpdateInput {
  return {
    fullName: input.fullName,
    phone: input.phone,
    email: input.email,
    dateOfBirth:
      input.dateOfBirth === null
        ? null
        : input.dateOfBirth
          ? new Date(`${input.dateOfBirth}T00:00:00.000Z`)
          : undefined,
    address: input.address,
    notes: input.notes,
  };
}
