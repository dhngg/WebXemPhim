import { Module } from '@nestjs/common';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { MeterReadingController } from './controllers/meter-reading.controller';
import { MeterReadingRepository } from './repositories/meter-reading.repository';
import { MeterReadingService } from './services/meter-reading.service';
@Module({
  imports: [WorkspaceModule],
  controllers: [MeterReadingController],
  providers: [MeterReadingRepository, MeterReadingService],
})
export class MeterReadingModule {}
