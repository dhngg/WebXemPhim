import { Module } from '@nestjs/common';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { DepositController, TenantDepositController } from './deposit.controller';
import { DepositRepository } from './deposit.repository';
import { DepositService } from './deposit.service';

@Module({
  imports: [WorkspaceModule],
  controllers: [DepositController, TenantDepositController],
  providers: [DepositRepository, DepositService],
})
export class DepositModule {}
