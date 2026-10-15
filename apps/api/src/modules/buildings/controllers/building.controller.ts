import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../auth/dto/auth-response.dto';
import {
  AccessAuthGuard,
  AuthOriginGuard,
  getAuthenticatedUser,
} from '../../auth/http/auth-http-security';
import { WorkspaceIdParamDto } from '../../workspaces/dto/workspace.dto';
import {
  getAuthorizedWorkspace,
  WorkspaceRoleGuard,
  WorkspaceRoles,
} from '../../workspaces/http/workspace-authorization';
import {
  BuildingIdParamDto,
  BuildingResponseDto,
  CreateBuildingRequestDto,
  UpdateBuildingRequestDto,
} from '../dto/building.dto';
import { BuildingService } from '../services/building.service';

@ApiTags('Buildings')
@ApiBearerAuth()
@UseGuards(AuthOriginGuard, AccessAuthGuard)
@Controller('workspaces/:workspaceId/buildings')
export class BuildingController {
  constructor(private readonly service: BuildingService) {}

  @Post()
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOperation({ summary: 'Create an ACTIVE building in an ACTIVE workspace' })
  @ApiCreatedResponse({ type: BuildingResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  create(
    @Param() _params: WorkspaceIdParamDto,
    @Req() request: Request,
    @Body() input: CreateBuildingRequestDto,
  ): Promise<BuildingResponseDto> {
    void _params;
    return this.service.create(
      getAuthorizedWorkspace(request).id,
      getAuthenticatedUser(request).id,
      input,
    );
  }

  @Get()
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOperation({ summary: 'List buildings scoped to an accessible workspace' })
  @ApiOkResponse({ type: BuildingResponseDto, isArray: true })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  list(
    @Param() _params: WorkspaceIdParamDto,
    @Req() request: Request,
  ): Promise<BuildingResponseDto[]> {
    void _params;
    return this.service.list(getAuthorizedWorkspace(request).id);
  }

  @Get(':buildingId')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOperation({ summary: 'Get a building scoped to an accessible workspace' })
  @ApiOkResponse({ type: BuildingResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  detail(
    @Param() params: BuildingIdParamDto,
    @Req() request: Request,
  ): Promise<BuildingResponseDto> {
    return this.service.detail(getAuthorizedWorkspace(request).id, params.buildingId);
  }

  @Patch(':buildingId')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOperation({ summary: 'Update an ACTIVE building in an ACTIVE workspace' })
  @ApiOkResponse({ type: BuildingResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  update(
    @Param() params: BuildingIdParamDto,
    @Req() request: Request,
    @Body() input: UpdateBuildingRequestDto,
  ): Promise<BuildingResponseDto> {
    return this.service.update(
      getAuthorizedWorkspace(request).id,
      getAuthenticatedUser(request).id,
      params.buildingId,
      input,
    );
  }

  @Patch(':buildingId/archive')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOperation({ summary: 'Archive a building without deleting it' })
  @ApiOkResponse({ type: BuildingResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  archive(
    @Param() params: BuildingIdParamDto,
    @Req() request: Request,
  ): Promise<BuildingResponseDto> {
    return this.service.archive(
      getAuthorizedWorkspace(request).id,
      getAuthenticatedUser(request).id,
      params.buildingId,
    );
  }

  @Patch(':buildingId/restore')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOperation({ summary: 'Restore an archived building' })
  @ApiOkResponse({ type: BuildingResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  restore(
    @Param() params: BuildingIdParamDto,
    @Req() request: Request,
  ): Promise<BuildingResponseDto> {
    return this.service.restore(
      getAuthorizedWorkspace(request).id,
      getAuthenticatedUser(request).id,
      params.buildingId,
    );
  }
}
