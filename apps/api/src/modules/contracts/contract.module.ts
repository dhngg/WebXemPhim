import { Module } from '@nestjs/common';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { ContractController, TenantContractController } from './controllers/contract.controller';
import { ContractRepository } from './repositories/contract.repository';
import { ContractService } from './services/contract.service';

@Module({
  imports: [WorkspaceModule],
  controllers: [ContractController, TenantContractController],
  providers: [ContractRepository, ContractService],
})
export class ContractModule {}
