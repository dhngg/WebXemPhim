import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNoContentResponse,
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
  AddWorkspaceMemberRequestDto,
  CreateWorkspaceRequestDto,
  TransferWorkspaceOwnershipRequestDto,
  UpdateWorkspaceMemberRequestDto,
  WorkspaceIdParamDto,
  WorkspaceMemberResponseDto,
  WorkspaceMembershipIdParamDto,
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
  @WorkspaceRoles('OWNER', 'MANAGER', 'STAFF')
  @ApiOperation({ summary: 'Get a workspace visible through the current database membership' })
  @ApiOkResponse({ type: WorkspaceResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto, description: 'WORKSPACE_NOT_FOUND' })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  detail(@Param() _params: WorkspaceIdParamDto, @Req() request: Request): WorkspaceResponseDto {
    void _params;
    return this.service.detail(getAuthorizedWorkspace(request));
  }

  @Get(':workspaceId/members')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOperation({ summary: 'List registered users with memberships in the workspace' })
  @ApiOkResponse({ type: WorkspaceMemberResponseDto, isArray: true })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto, description: 'WORKSPACE_NOT_FOUND' })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  listMembers(
    @Param() _params: WorkspaceIdParamDto,
    @Req() request: Request,
  ): Promise<WorkspaceMemberResponseDto[]> {
    void _params;
    return this.service.listMembers(
      getAuthorizedWorkspace(request).id,
      getAuthenticatedUser(request).id,
    );
  }

  @Post(':workspaceId/members')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOperation({ summary: 'Add an ACTIVE registered user to the workspace by normalized email' })
  @ApiCreatedResponse({ type: WorkspaceMemberResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  addMember(
    @Param() _params: WorkspaceIdParamDto,
    @Req() request: Request,
    @Body() input: AddWorkspaceMemberRequestDto,
  ): Promise<WorkspaceMemberResponseDto> {
    void _params;
    return this.service.addMember(
      getAuthorizedWorkspace(request).id,
      getAuthenticatedUser(request).id,
      input,
    );
  }

  @Patch(':workspaceId/members/:membershipId')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOperation({ summary: 'Change a non-owner workspace member role to MANAGER or STAFF' })
  @ApiOkResponse({ type: WorkspaceMemberResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  updateMemberRole(
    @Param() params: WorkspaceMembershipIdParamDto,
    @Req() request: Request,
    @Body() input: UpdateWorkspaceMemberRequestDto,
  ): Promise<WorkspaceMemberResponseDto> {
    return this.service.updateMemberRole(
      getAuthorizedWorkspace(request).id,
      getAuthenticatedUser(request).id,
      params.membershipId,
      input,
    );
  }

  @Delete(':workspaceId/members/:membershipId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOperation({ summary: 'Remove a non-owner membership from the workspace' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  removeMember(
    @Param() params: WorkspaceMembershipIdParamDto,
    @Req() request: Request,
  ): Promise<void> {
    return this.service.removeMember(
      getAuthorizedWorkspace(request).id,
      getAuthenticatedUser(request).id,
      params.membershipId,
    );
  }

  @Post(':workspaceId/transfer-ownership')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOperation({ summary: 'Atomically transfer workspace ownership to an ACTIVE member' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  transferOwnership(
    @Param() _params: WorkspaceIdParamDto,
    @Req() request: Request,
    @Body() input: TransferWorkspaceOwnershipRequestDto,
  ): Promise<void> {
    void _params;
    return this.service.transferOwnership(
      getAuthorizedWorkspace(request).id,
      getAuthenticatedUser(request).id,
      input.targetMembershipId,
    );
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
