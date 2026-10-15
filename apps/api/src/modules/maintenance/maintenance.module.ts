import { Module } from '@nestjs/common';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { MaintenanceController, TenantMaintenanceController } from './maintenance.controller';
import { MaintenanceRepository } from './maintenance.repository';
import { MaintenanceService } from './maintenance.service';

@Module({
  imports: [WorkspaceModule],
  controllers: [MaintenanceController, TenantMaintenanceController],
  providers: [MaintenanceRepository, MaintenanceService],
})
export class MaintenanceModule {}
