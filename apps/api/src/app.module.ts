import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { loadEnvironment } from './config/environment';
import { PrismaModule } from './database/prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuthSecurityModule } from './modules/auth/security/auth-security.module';
import { WorkspaceModule } from './modules/workspaces/workspace.module';
import { BuildingModule } from './modules/buildings/building.module';
import { RoomModule } from './modules/rooms/room.module';
import { MarketplaceModule } from './modules/marketplace/marketplace.module';
import { TenantModule } from './modules/tenants/tenant.module';
import { ContractModule } from './modules/contracts/contract.module';
import { VehicleModule } from './modules/vehicles/vehicle.module';
import { RatePlanModule } from './modules/rates/rate-plan.module';
import { MeterReadingModule } from './modules/meters/meter-reading.module';
import { InvoiceModule } from './modules/invoices/invoice.module';
import { DepositModule } from './modules/deposits/deposit.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { NotificationModule } from './modules/notifications/notification.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AdminModule } from './modules/admin/admin.module';
import { UserProfileModule } from './modules/users/user-profile.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';

const environment = loadEnvironment();

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => environment] }),
    PrismaModule.register(environment),
    AuthSecurityModule.register(environment),
    AuthModule.register(environment),
    WorkspaceModule,
    BuildingModule,
    RoomModule,
    MarketplaceModule,
    TenantModule,
    ContractModule,
    VehicleModule,
    RatePlanModule,
    MeterReadingModule,
    InvoiceModule,
    DepositModule,
    MaintenanceModule,
    NotificationModule,
    DashboardModule,
    AdminModule,
    UserProfileModule,
    OnboardingModule,
    HealthModule,
  ],
})
export class AppModule {}
