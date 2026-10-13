import { PrismaPg } from '@prisma/adapter-pg';
import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(databaseUrl: string) {
    const adapter = new PrismaPg({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 5_000,
      enableChannelBinding: true,
      max: 5,
    });
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
