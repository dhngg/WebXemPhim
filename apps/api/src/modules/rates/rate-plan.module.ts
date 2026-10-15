import { Module } from '@nestjs/common';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { RatePlanController } from './controllers/rate-plan.controller';
import { RatePlanRepository } from './repositories/rate-plan.repository';
import { RatePlanService } from './services/rate-plan.service';
@Module({
  imports: [WorkspaceModule],
  controllers: [RatePlanController],
  providers: [RatePlanRepository, RatePlanService],
})
export class RatePlanModule {}
