import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../auth/dto/auth-response.dto';
import {
  AccessAuthGuard,
  AuthOriginGuard,
  getAuthenticatedUser,
} from '../auth/http/auth-http-security';
import {
  getAuthorizedWorkspace,
  WorkspaceRoleGuard,
  WorkspaceRoles,
} from '../workspaces/http/workspace-authorization';
import { BuildingIdParamDto } from '../buildings/dto/building.dto';
import {
  CancelMaintenanceDto,
  CreateMaintenanceRequestDto,
  CreateTenantMaintenanceDto,
  MaintenanceIdParamDto,
  MaintenanceQueryDto,
  TenantMaintenanceIdParamDto,
  TenantMaintenanceQueryDto,
  TransitionMaintenanceDto,
  UpdateMaintenanceDto,
} from './maintenance.dto';
import { MaintenanceService } from './maintenance.service';

@ApiTags('Maintenance')
@ApiBearerAuth()
@UseGuards(AuthOriginGuard, AccessAuthGuard)
@Controller('workspaces/:workspaceId/buildings/:buildingId/maintenance-requests')
export class MaintenanceController {
  constructor(private readonly service: MaintenanceService) {}

  @Post()
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiCreatedResponse()
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  create(
    @Req() req: Request,
    @Param() params: BuildingIdParamDto,
    @Body() input: CreateMaintenanceRequestDto,
  ) {
    return this.service.create(
      getAuthorizedWorkspace(req).id,
      getAuthenticatedUser(req).id,
      params.buildingId,
      input,
    );
  }

  @Get()
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOkResponse()
  list(
    @Req() req: Request,
    @Param() params: BuildingIdParamDto,
    @Query() query: MaintenanceQueryDto,
  ) {
    return this.service.list(getAuthorizedWorkspace(req).id, params.buildingId, query);
  }

  @Get(':requestId')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOkResponse()
  get(@Req() req: Request, @Param() params: MaintenanceIdParamDto) {
    return this.service.get(getAuthorizedWorkspace(req).id, params.buildingId, params.requestId);
  }

  @Patch(':requestId')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOkResponse()
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  update(
    @Req() req: Request,
    @Param() params: MaintenanceIdParamDto,
    @Body() input: UpdateMaintenanceDto,
  ) {
    return this.service.update(
      getAuthorizedWorkspace(req).id,
      getAuthenticatedUser(req).id,
      params.buildingId,
      params.requestId,
      input,
    );
  }

  @Post(':requestId/transition')
  @HttpCode(200)
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOkResponse()
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  transition(
    @Req() req: Request,
    @Param() params: MaintenanceIdParamDto,
    @Body() input: TransitionMaintenanceDto,
  ) {
    return this.service.transition(
      getAuthorizedWorkspace(req).id,
      getAuthenticatedUser(req).id,
      params.buildingId,
      params.requestId,
      input,
    );
  }
}

@ApiTags('Tenant Maintenance')
@ApiBearerAuth()
@UseGuards(AuthOriginGuard, AccessAuthGuard)
@Controller('maintenance-requests/me')
export class TenantMaintenanceController {
  constructor(private readonly service: MaintenanceService) {}

  @Post()
  @ApiCreatedResponse()
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  create(@Req() req: Request, @Body() input: CreateTenantMaintenanceDto) {
    return this.service.createForTenant(getAuthenticatedUser(req).id, input);
  }

  @Get()
  @ApiOkResponse()
  list(@Req() req: Request, @Query() query: TenantMaintenanceQueryDto) {
    return this.service.listForTenant(getAuthenticatedUser(req).id, query);
  }

  @Get(':requestId')
  @ApiOkResponse()
  get(@Req() req: Request, @Param() params: TenantMaintenanceIdParamDto) {
    return this.service.getForTenant(getAuthenticatedUser(req).id, params.requestId);
  }

  @Post(':requestId/cancel')
  @HttpCode(200)
  @ApiOkResponse()
  @ApiConflictResponse({ type: ApiErrorResponseDto, description: 'MAINTENANCE_NOT_CANCELLABLE' })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  cancel(
    @Req() req: Request,
    @Param() params: TenantMaintenanceIdParamDto,
    @Body() body: CancelMaintenanceDto,
  ) {
    return this.service.cancelForTenant(
      getAuthenticatedUser(req).id,
      params.requestId,
      body.reason,
    );
  }
}
