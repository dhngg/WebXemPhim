import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../auth/dto/auth-response.dto';
import {
  AccessAuthGuard,
  AuthOriginGuard,
  getAuthenticatedUser,
} from '../../auth/http/auth-http-security';
import {
  getAuthorizedWorkspace,
  WorkspaceRoleGuard,
  WorkspaceRoles,
} from '../../workspaces/http/workspace-authorization';
import {
  CreateVehicleRequestDto,
  StopVehicleRequestDto,
  UpdateVehicleRequestDto,
  VehicleIdParamDto,
  VehiclePageResponseDto,
  VehicleQueryDto,
  VehicleResponseDto,
} from '../dto/vehicle.dto';
import { VehicleService } from '../services/vehicle.service';

@ApiTags('Vehicles')
@ApiBearerAuth()
@UseGuards(AuthOriginGuard, AccessAuthGuard)
@Controller('workspaces/:workspaceId/vehicles')
export class VehicleController {
  constructor(private readonly service: VehicleService) {}
  @Post()
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiCreatedResponse({ type: VehicleResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  create(@Req() req: Request, @Body() input: CreateVehicleRequestDto) {
    return this.service.create(getAuthorizedWorkspace(req).id, getAuthenticatedUser(req).id, input);
  }
  @Get()
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOkResponse({ type: VehiclePageResponseDto })
  list(@Req() req: Request, @Query() query: VehicleQueryDto) {
    return this.service.list(getAuthorizedWorkspace(req).id, query);
  }
  @Get(':vehicleId')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOkResponse({ type: VehicleResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  detail(@Req() req: Request, @Param() params: VehicleIdParamDto) {
    return this.service.detail(getAuthorizedWorkspace(req).id, params.vehicleId);
  }
  @Patch(':vehicleId')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOkResponse({ type: VehicleResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  update(
    @Req() req: Request,
    @Param() params: VehicleIdParamDto,
    @Body() input: UpdateVehicleRequestDto,
  ) {
    return this.service.update(
      getAuthorizedWorkspace(req).id,
      getAuthenticatedUser(req).id,
      params.vehicleId,
      input,
    );
  }
  @Patch(':vehicleId/stop')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOkResponse({ type: VehicleResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  stop(
    @Req() req: Request,
    @Param() params: VehicleIdParamDto,
    @Body() input: StopVehicleRequestDto,
  ) {
    return this.service.stop(
      getAuthorizedWorkspace(req).id,
      getAuthenticatedUser(req).id,
      params.vehicleId,
      input,
    );
  }
}
