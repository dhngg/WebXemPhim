import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class CapabilitiesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string) {
    const [memberships, links, admin, application] = await Promise.all([
      this.prisma.workspaceMembership.findMany({
        where: { userId, role: 'OWNER' },
        include: { workspace: { select: { id: true, name: true, status: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.tenantUserLink.findMany({
        where: {
          userId,
          revokedAt: null,
          tenant: { status: 'ACTIVE' },
          workspace: { status: 'ACTIVE' },
        },
        include: {
          tenant: { select: { id: true, fullName: true } },
          workspace: { select: { id: true, name: true } },
        },
        orderBy: { linkedAt: 'asc' },
      }),
      this.prisma.platformAdmin.findUnique({ where: { userId }, select: { userId: true } }),
      this.prisma.landlordApplication.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      workspaces: memberships.map(({ workspace, role }) => ({ ...workspace, role })),
      tenantLinks: links.map(({ tenant, workspace }) => ({
        tenantId: tenant.id,
        workspaceId: workspace.id,
        tenantName: tenant.fullName,
        workspaceName: workspace.name,
      })),
      isPlatformAdmin: admin !== null,
      landlordApplication: application
        ? {
            id: application.id,
            status: application.status,
            reason: application.reason,
            decisionNote: application.decisionNote,
            decidedByUserId: application.decidedByUserId,
            decidedAt: application.decidedAt?.toISOString() ?? null,
            createdAt: application.createdAt.toISOString(),
            updatedAt: application.updatedAt.toISOString(),
          }
        : null,
    };
  }
}
