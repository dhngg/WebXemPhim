import { Module } from '@nestjs/common';
import { WorkspaceController } from './controllers/workspace.controller';
import { WorkspaceRoleGuard } from './http/workspace-authorization';
import { WorkspaceRepository } from './repositories/workspace.repository';
import { WorkspaceService } from './services/workspace.service';

@Module({
  controllers: [WorkspaceController],
  providers: [WorkspaceRepository, WorkspaceService, WorkspaceRoleGuard],
})
export class WorkspaceModule {}
