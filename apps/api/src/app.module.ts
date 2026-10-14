import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { loadEnvironment } from './config/environment';
import { PrismaModule } from './database/prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuthSecurityModule } from './modules/auth/security/auth-security.module';
import { WorkspaceModule } from './modules/workspaces/workspace.module';

const environment = loadEnvironment();

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => environment] }),
    PrismaModule.register(environment),
    AuthSecurityModule.register(environment),
    AuthModule.register(environment),
    WorkspaceModule,
    HealthModule,
  ],
})
export class AppModule {}
