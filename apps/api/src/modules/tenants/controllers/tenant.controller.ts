import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
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
  CreateTenantRequestDto,
  TenantIdParamDto,
  TenantPageResponseDto,
  TenantQueryDto,
  TenantResponseDto,
  UpdateTenantRequestDto,
} from '../dto/tenant.dto';
import { TenantService } from '../services/tenant.service';

@ApiTags('Tenants')
@ApiBearerAuth()
@UseGuards(AuthOriginGuard, AccessAuthGuard)
@Controller('workspaces/:workspaceId/tenants')
export class TenantController {
  constructor(private readonly service: TenantService) {}

  @Post()
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOperation({ summary: 'Create an ACTIVE tenant profile in an ACTIVE workspace' })
  @ApiCreatedResponse({ type: TenantResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  create(
    @Param() _params: WorkspaceIdParamDto,
    @Req() request: Request,
    @Body() input: CreateTenantRequestDto,
  ): Promise<TenantResponseDto> {
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
  @ApiOperation({ summary: 'List tenant profiles scoped to an authorized workspace' })
  @ApiOkResponse({ type: TenantPageResponseDto })
  list(
    @Param() _params: WorkspaceIdParamDto,
    @Req() request: Request,
    @Query() query: TenantQueryDto,
  ): Promise<TenantPageResponseDto> {
    void _params;
    return this.service.list(getAuthorizedWorkspace(request).id, query);
  }

  @Get(':tenantId')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOperation({ summary: 'Get a tenant profile within an authorized workspace' })
  @ApiOkResponse({ type: TenantResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  detail(@Param() params: TenantIdParamDto, @Req() request: Request): Promise<TenantResponseDto> {
    return this.service.detail(getAuthorizedWorkspace(request).id, params.tenantId);
  }

  @Patch(':tenantId')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOperation({ summary: 'Update an ACTIVE tenant profile' })
  @ApiOkResponse({ type: TenantResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  update(
    @Param() params: TenantIdParamDto,
    @Req() request: Request,
    @Body() input: UpdateTenantRequestDto,
  ): Promise<TenantResponseDto> {
    return this.service.update(
      getAuthorizedWorkspace(request).id,
      getAuthenticatedUser(request).id,
      params.tenantId,
      input,
    );
  }

  @Patch(':tenantId/archive')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOperation({ summary: 'Archive a tenant (idempotent); refused while a contract is ACTIVE' })
  @ApiOkResponse({ type: TenantResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  archive(@Param() params: TenantIdParamDto, @Req() request: Request): Promise<TenantResponseDto> {
    return this.service.archive(
      getAuthorizedWorkspace(request).id,
      getAuthenticatedUser(request).id,
      params.tenantId,
    );
  }

  @Patch(':tenantId/restore')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOperation({ summary: 'Restore an archived tenant (idempotent)' })
  @ApiOkResponse({ type: TenantResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  restore(@Param() params: TenantIdParamDto, @Req() request: Request): Promise<TenantResponseDto> {
    return this.service.restore(
      getAuthorizedWorkspace(request).id,
      getAuthenticatedUser(request).id,
      params.tenantId,
    );
  }
}
