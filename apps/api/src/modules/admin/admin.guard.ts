import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ApplicationException } from '../../common/errors/application-exception';
import { PrismaService } from '../../database/prisma/prisma.service';
import { getAuthenticatedUser } from '../auth/http/auth-http-security';

/**
 * Platform admin is a role of its own (table `platform_admins`), independent of workspace roles.
 * It is read from the database on every request, never from the JWT. Place after AccessAuthGuard.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = getAuthenticatedUser(request);
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { userId: user.id },
      select: { userId: true, user: { select: { status: true } } },
    });
    if (!admin || admin.user.status !== 'ACTIVE') {
      throw new ApplicationException('PLATFORM_ADMIN_REQUIRED');
    }
    return true;
  }
}
