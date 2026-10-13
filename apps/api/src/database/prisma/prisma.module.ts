import { type DynamicModule, Global, Module } from '@nestjs/common';
import type { Environment } from '../../config/environment';
import { PrismaService } from './prisma.service';

@Global()
@Module({})
export class PrismaModule {
  static register(environment: Environment): DynamicModule {
    if (!environment.DATABASE_ENABLED) {
      return { module: PrismaModule };
    }

    const databaseUrl = environment.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required when Prisma is enabled');
    }

    return {
      module: PrismaModule,
      providers: [{ provide: PrismaService, useFactory: () => new PrismaService(databaseUrl) }],
      exports: [PrismaService],
    };
  }
}
