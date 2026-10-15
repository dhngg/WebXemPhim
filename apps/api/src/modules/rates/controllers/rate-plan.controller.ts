import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
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
import { BuildingIdParamDto } from '../../buildings/dto/building.dto';
import {
  CreateRatePlanRequestDto,
  RatePlanIdParamDto,
  RatePlanPageResponseDto,
  RatePlanQueryDto,
  RatePlanResponseDto,
  StopRatePlanRequestDto,
  UpdateRatePlanRequestDto,
} from '../dto/rate-plan.dto';
import { RatePlanService } from '../services/rate-plan.service';
@ApiTags('Building Rates')
@ApiBearerAuth()
@UseGuards(AuthOriginGuard, AccessAuthGuard)
@Controller('workspaces/:workspaceId/buildings/:buildingId/rates')
export class RatePlanController {
  constructor(private readonly service: RatePlanService) {}
  @Post()
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiCreatedResponse({ type: RatePlanResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  create(
    @Req() req: Request,
    @Param() params: BuildingIdParamDto,
    @Body() input: CreateRatePlanRequestDto,
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
  @ApiOkResponse({ type: RatePlanPageResponseDto })
  list(@Req() req: Request, @Param() params: BuildingIdParamDto, @Query() query: RatePlanQueryDto) {
    return this.service.list(getAuthorizedWorkspace(req).id, params.buildingId, query);
  }
  @Patch(':ratePlanId')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOkResponse({ type: RatePlanResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  update(
    @Req() req: Request,
    @Param() params: RatePlanIdParamDto,
    @Body() input: UpdateRatePlanRequestDto,
  ) {
    return this.service.update(
      getAuthorizedWorkspace(req).id,
      getAuthenticatedUser(req).id,
      params.buildingId,
      params.ratePlanId,
      input,
    );
  }
  @Patch(':ratePlanId/stop')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOkResponse({ type: RatePlanResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  stop(
    @Req() req: Request,
    @Param() params: RatePlanIdParamDto,
    @Body() input: StopRatePlanRequestDto,
  ) {
    return this.service.stop(
      getAuthorizedWorkspace(req).id,
      getAuthenticatedUser(req).id,
      params.buildingId,
      params.ratePlanId,
      input,
    );
  }
}
