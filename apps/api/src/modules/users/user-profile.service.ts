import { Injectable } from '@nestjs/common';
import type { AuthUserResponse } from '@rental/shared';
import { ApplicationException } from '../../common/errors/application-exception';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CapabilitiesRepository } from './capabilities.repository';

const select = {
  id: true,
  email: true,
  displayName: true,
  status: true,
  createdAt: true,
} as const;

@Injectable()
export class UserProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capabilitiesRepository: CapabilitiesRepository,
  ) {}

  capabilities(userId: string) {
    return this.capabilitiesRepository.get(userId);
  }

  async get(userId: string): Promise<AuthUserResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select });
    if (!user) throw new ApplicationException('UNAUTHORIZED');
    return toResponse(user);
  }

  /** Writes only `display_name`, and only while the account is ACTIVE. */
  async updateDisplayName(userId: string, displayName: string | null): Promise<AuthUserResponse> {
    const result = await this.prisma.user.updateMany({
      where: { id: userId, status: 'ACTIVE' },
      data: { displayName },
    });
    if (result.count === 0) throw new ApplicationException('ACCOUNT_DISABLED');
    return this.get(userId);
  }
}

function toResponse(user: {
  id: string;
  email: string;
  displayName: string | null;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: Date;
}): AuthUserResponse {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
  };
}
