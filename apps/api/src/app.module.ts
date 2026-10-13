import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { loadEnvironment } from './config/environment';
import { PrismaModule } from './database/prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';

const environment = loadEnvironment();

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => environment] }),
    PrismaModule.register(environment),
    HealthModule,
  ],
})
export class AppModule {}
