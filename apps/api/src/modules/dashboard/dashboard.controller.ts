import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AccessAuthGuard, AuthOriginGuard } from '../auth/http/auth-http-security';
import {
  getAuthorizedWorkspace,
  WorkspaceRoleGuard,
  WorkspaceRoles,
} from '../workspaces/http/workspace-authorization';
import { WorkspaceIdParamDto } from '../workspaces/dto/workspace.dto';
import { DashboardQueryDto } from './dashboard.dto';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(AuthOriginGuard, AccessAuthGuard, WorkspaceRoleGuard)
@WorkspaceRoles('OWNER')
@Controller('workspaces/:workspaceId/dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get()
  @ApiOkResponse()
  get(
    @Req() req: Request,
    @Param() _params: WorkspaceIdParamDto,
    @Query() query: DashboardQueryDto,
  ) {
    return this.service.get(getAuthorizedWorkspace(req).id, query);
  }
}
