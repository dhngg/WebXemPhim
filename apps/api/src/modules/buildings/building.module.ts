import { Module } from '@nestjs/common';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { BuildingController } from './controllers/building.controller';
import { BuildingRepository } from './repositories/building.repository';
import { BuildingService } from './services/building.service';

@Module({
  imports: [WorkspaceModule],
  controllers: [BuildingController],
  providers: [BuildingRepository, BuildingService],
})
export class BuildingModule {}
