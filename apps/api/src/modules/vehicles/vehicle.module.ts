import { Module } from '@nestjs/common';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { VehicleController } from './controllers/vehicle.controller';
import { VehicleRepository } from './repositories/vehicle.repository';
import { VehicleService } from './services/vehicle.service';
@Module({
  imports: [WorkspaceModule],
  controllers: [VehicleController],
  providers: [VehicleRepository, VehicleService],
})
export class VehicleModule {}
