import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
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
import {
  CreateWorkspaceRequestDto,
  WorkspaceIdParamDto,
  WorkspaceResponseDto,
} from '../dto/workspace.dto';
import {
  AllowArchivedWorkspaceLifecycle,
  getAuthorizedWorkspace,
  WorkspaceRoleGuard,
  WorkspaceRoles,
} from '../http/workspace-authorization';
import { WorkspaceService } from '../services/workspace.service';

@ApiTags('Workspaces')
@ApiBearerAuth()
@UseGuards(AuthOriginGuard, AccessAuthGuard)
@Controller('workspaces')
export class WorkspaceController {
  constructor(private readonly service: WorkspaceService) {}

  @Post()
  @ApiOperation({ summary: 'Create a workspace with the authenticated user as its OWNER' })
  @ApiCreatedResponse({ type: WorkspaceResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  create(
    @Req() request: Request,
    @Body() input: CreateWorkspaceRequestDto,
  ): Promise<WorkspaceResponseDto> {
    return this.service.create(getAuthenticatedUser(request).id, input);
  }

  @Get()
  @ApiOperation({ summary: "List the authenticated user's workspace memberships" })
  @ApiOkResponse({ type: WorkspaceResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  list(@Req() request: Request): Promise<WorkspaceResponseDto[]> {
    return this.service.list(getAuthenticatedUser(request).id);
  }

  @Get(':workspaceId')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOperation({ summary: 'Get a workspace visible through the current database membership' })
  @ApiOkResponse({ type: WorkspaceResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto, description: 'WORKSPACE_NOT_FOUND' })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  detail(@Param() _params: WorkspaceIdParamDto, @Req() request: Request): WorkspaceResponseDto {
    void _params;
    return this.service.detail(getAuthorizedWorkspace(request));
  }

  @Patch(':workspaceId/archive')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @AllowArchivedWorkspaceLifecycle()
  @ApiOperation({ summary: 'Archive a workspace without deleting its memberships or data' })
  @ApiOkResponse({ type: WorkspaceResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto, description: 'WORKSPACE_NOT_FOUND' })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  archive(
    @Param() _params: WorkspaceIdParamDto,
    @Req() request: Request,
  ): Promise<WorkspaceResponseDto> {
    void _params;
    return this.service.archive(
      getAuthorizedWorkspace(request).id,
      getAuthenticatedUser(request).id,
    );
  }

  @Patch(':workspaceId/restore')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @AllowArchivedWorkspaceLifecycle()
  @ApiOperation({ summary: 'Restore an archived workspace' })
  @ApiOkResponse({ type: WorkspaceResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto, description: 'WORKSPACE_NOT_FOUND' })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  restore(
    @Param() _params: WorkspaceIdParamDto,
    @Req() request: Request,
  ): Promise<WorkspaceResponseDto> {
    void _params;
    return this.service.restore(
      getAuthorizedWorkspace(request).id,
      getAuthenticatedUser(request).id,
    );
  }
}
