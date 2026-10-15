import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type LandlordApplication,
  type LandlordApplicationStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ApplicationException } from '../../common/errors/application-exception';

const response = (row: LandlordApplication) => ({
  id: row.id,
  status: row.status,
  reason: row.reason,
  decisionNote: row.decisionNote,
  decidedByUserId: row.decidedByUserId ?? null,
  decidedAt: row.decidedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

@Injectable()
export class LandlordApplicationService {
  constructor(private readonly prisma: PrismaService) {}

  async submit(userId: string, reason: string) {
    try {
      const row = await this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw(
            Prisma.sql`SELECT "id" FROM "users" WHERE "id" = ${userId}::uuid FOR UPDATE`,
          );
          const user = await tx.user.findUnique({
            where: { id: userId },
            select: { status: true },
          });
          if (user?.status !== 'ACTIVE') throw new ApplicationException('ACCOUNT_DISABLED');
          if (
            await tx.workspaceMembership.findFirst({
              where: { userId, role: 'OWNER' },
              select: { id: true },
            })
          )
            throw new ApplicationException('LANDLORD_APPLICATION_COOLDOWN');
          const pending = await tx.landlordApplication.findFirst({
            where: { userId, status: 'PENDING' },
          });
          if (pending) throw new ApplicationException('LANDLORD_APPLICATION_PENDING');
          const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
          const recent = await tx.landlordApplication.count({
            where: { userId, createdAt: { gte: since } },
          });
          if (recent >= 3) throw new ApplicationException('LANDLORD_APPLICATION_COOLDOWN');
          const last = await tx.landlordApplication.findFirst({
            where: { userId },
            orderBy: { createdAt: 'desc' },
          });
          if (
            last?.status === 'REJECTED' &&
            last.decidedAt &&
            Date.now() - last.decidedAt.getTime() < 30 * 86400000
          )
            throw new ApplicationException('LANDLORD_APPLICATION_COOLDOWN');
          return tx.landlordApplication.create({ data: { userId, reason } });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return response(row);
    } catch (error) {
      if (error instanceof ApplicationException) throw error;
      if (isUnique(error)) throw new ApplicationException('LANDLORD_APPLICATION_PENDING');
      throw error;
    }
  }

  async mine(userId: string) {
    const items = await this.prisma.landlordApplication.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return { items: items.map(response) };
  }

  async list(status: LandlordApplicationStatus | undefined, page: number, limit: number) {
    const where = { status };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.landlordApplication.findMany({
        where,
        include: { user: { select: { id: true, email: true, displayName: true } } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.landlordApplication.count({ where }),
    ]);
    return {
      items: items.map((row) => ({ ...response(row), user: row.user })),
      total,
      page,
      limit,
    };
  }

  async decide(
    actorId: string,
    id: string,
    status: Exclude<LandlordApplicationStatus, 'PENDING'>,
    note: string,
  ) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<
            Array<{ id: string; user_id: string; status: LandlordApplicationStatus }>
          >(
            Prisma.sql`SELECT "id", "user_id", "status" FROM "landlord_applications" WHERE "id" = ${id}::uuid FOR UPDATE`,
          );
          const row = rows[0];
          if (!row) throw new ApplicationException('LANDLORD_APPLICATION_NOT_FOUND');
          if (row.user_id === actorId)
            throw new ApplicationException('LANDLORD_APPLICATION_INVALID_TRANSITION');
          if (row.status !== 'PENDING')
            throw new ApplicationException('LANDLORD_APPLICATION_INVALID_TRANSITION');
          const actor = await tx.platformAdmin.findUnique({
            where: { userId: actorId },
            select: { user: { select: { status: true } } },
          });
          if (!actor || actor.user.status !== 'ACTIVE')
            throw new ApplicationException('PLATFORM_ADMIN_REQUIRED');
          const updated = await tx.landlordApplication.update({
            where: { id },
            data: {
              status,
              decisionNote: note,
              decidedByUserId: actorId,
              decidedAt: new Date(),
            },
          });
          await tx.adminAuditLog.create({
            data: {
              actorUserId: actorId,
              action:
                status === 'APPROVED'
                  ? 'LANDLORD_APPLICATION_APPROVED'
                  : 'LANDLORD_APPLICATION_REJECTED',
              targetType: 'LANDLORD_APPLICATION',
              targetId: id,
              reason: note,
              metadata: { applicantUserId: row.user_id, applicationStatus: status },
            },
          });
          return response(updated);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof ApplicationException) throw error;
      throw error;
    }
  }
}

function isUnique(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
