import { Injectable, Optional } from '@nestjs/common';
import type { DatabaseState } from '@rental/shared';
import { PrismaService } from '../../../database/prisma/prisma.service';

@Injectable()
export class HealthRepository {
  constructor(@Optional() private readonly prisma?: PrismaService) {}

  async getDatabaseState(): Promise<DatabaseState> {
    if (!this.prisma) return 'disabled';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch {
      return 'down';
    }
  }
}
