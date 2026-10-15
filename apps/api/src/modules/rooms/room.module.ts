import { Module } from '@nestjs/common';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { RoomController } from './controllers/room.controller';
import { RoomRepository } from './repositories/room.repository';
import { RoomService } from './services/room.service';

@Module({
  imports: [WorkspaceModule],
  controllers: [RoomController],
  providers: [RoomRepository, RoomService],
})
export class RoomModule {}
