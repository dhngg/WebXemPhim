import { Module } from '@nestjs/common';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { TenantController } from './controllers/tenant.controller';
import { TenantLinkController } from './controllers/tenant-link.controller';
import { TenantLinkRepository } from './repositories/tenant-link.repository';
import { TenantRepository } from './repositories/tenant.repository';
import { TenantLinkService } from './services/tenant-link.service';
import { TenantService } from './services/tenant.service';

@Module({
  imports: [WorkspaceModule],
  controllers: [TenantController, TenantLinkController],
  providers: [TenantRepository, TenantService, TenantLinkRepository, TenantLinkService],
})
export class TenantModule {}
