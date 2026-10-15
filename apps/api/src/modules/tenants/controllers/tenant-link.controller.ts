import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
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
import {
  getAuthorizedWorkspace,
  WorkspaceRoleGuard,
  WorkspaceRoles,
} from '../../workspaces/http/workspace-authorization';
import { TenantIdParamDto, TenantResponseDto } from '../dto/tenant.dto';
import {
  CreateTenantLinkRequestDto,
  DecideTenantLinkRequestDto,
  RevokeTenantLinkRequestDto,
  TenantLinkRequestPageResponseDto,
  TenantLinkRequestParamDto,
  TenantLinkRequestQueryDto,
  TenantAccountLinkResponseDto,
  TenantLinkRequestResponseDto,
  TenantLinkTenantParamDto,
  TenantUserLinkParamDto,
  TenantUserLinkResponseDto,
} from '../dto/tenant-link.dto';
import { TenantLinkService } from '../services/tenant-link.service';

class AcceptTenantInvitationDto {
  @ApiProperty({ description: '43 character base64url token sent by the workspace manager' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  token!: string;
}

@ApiTags('Tenant Account Linking')
@ApiBearerAuth()
@UseGuards(AuthOriginGuard, AccessAuthGuard)
@Controller()
export class TenantLinkController {
  constructor(private readonly service: TenantLinkService) {}

  @Post('workspaces/:workspaceId/tenants/:tenantId/invitations')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  createInvitation(@Param() params: TenantIdParamDto, @Req() request: Request) {
    return this.service.createInvitation(
      getAuthorizedWorkspace(request).id,
      params.tenantId,
      getAuthenticatedUser(request).id,
    );
  }

  @Get('workspaces/:workspaceId/tenants/:tenantId/user-links')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOperation({ summary: 'List the ACTIVE account links of a tenant profile (OWNER only)' })
  @ApiOkResponse({ type: TenantAccountLinkResponseDto, isArray: true })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  listActiveLinks(@Param() params: TenantIdParamDto, @Req() request: Request) {
    return this.service.listActiveLinks(
      getAuthorizedWorkspace(request).id,
      getAuthenticatedUser(request).id,
      params.tenantId,
    );
  }

  @Post('tenant-invitations/accept')
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  acceptInvitation(@Req() request: Request, @Body() input: AcceptTenantInvitationDto) {
    return this.service.acceptInvitation(getAuthenticatedUser(request).id, input.token);
  }

  @Post('tenants/:tenantId/link-requests')
  @ApiOperation({ summary: 'Request linking the authenticated account to a tenant profile' })
  @ApiCreatedResponse({ type: TenantLinkRequestResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  createRequest(
    @Param() params: TenantLinkTenantParamDto,
    @Req() request: Request,
    @Body() input: CreateTenantLinkRequestDto,
  ) {
    return this.service.createRequest(getAuthenticatedUser(request).id, params.tenantId, input);
  }

  @Get('tenant-link-requests/me')
  @ApiOperation({ summary: 'List only tenant link requests submitted by the authenticated user' })
  @ApiOkResponse({ type: TenantLinkRequestPageResponseDto })
  listMine(@Req() request: Request, @Query() query: TenantLinkRequestQueryDto) {
    return this.service.listMine(getAuthenticatedUser(request).id, query);
  }

  @Get('tenants/me')
  @ApiOperation({ summary: 'List only active tenant profiles linked to the authenticated user' })
  @ApiOkResponse({ type: TenantResponseDto, isArray: true })
  linkedTenants(@Req() request: Request) {
    return this.service.linkedTenants(getAuthenticatedUser(request).id);
  }

  @Get('workspaces/:workspaceId/tenant-link-requests')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOkResponse({ type: TenantLinkRequestPageResponseDto })
  listWorkspace(@Req() request: Request, @Query() query: TenantLinkRequestQueryDto) {
    return this.service.listWorkspace(getAuthorizedWorkspace(request).id, query);
  }

  @Patch('workspaces/:workspaceId/tenant-link-requests/:requestId/approve')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOkResponse({ type: TenantUserLinkResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  approve(
    @Param() params: TenantLinkRequestParamDto,
    @Req() request: Request,
    @Body() input: DecideTenantLinkRequestDto,
  ) {
    return this.service.approve(
      getAuthorizedWorkspace(request).id,
      getAuthenticatedUser(request).id,
      params.requestId,
      input,
    );
  }

  @Patch('workspaces/:workspaceId/tenant-link-requests/:requestId/reject')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOkResponse({ type: TenantLinkRequestResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  reject(
    @Param() params: TenantLinkRequestParamDto,
    @Req() request: Request,
    @Body() input: DecideTenantLinkRequestDto,
  ) {
    return this.service.reject(
      getAuthorizedWorkspace(request).id,
      getAuthenticatedUser(request).id,
      params.requestId,
      input,
    );
  }

  @Patch('workspaces/:workspaceId/tenant-user-links/:linkId/revoke')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOkResponse({ type: TenantUserLinkResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  revoke(
    @Param() params: TenantUserLinkParamDto,
    @Req() request: Request,
    @Body() input: RevokeTenantLinkRequestDto,
  ) {
    return this.service.revoke(
      getAuthorizedWorkspace(request).id,
      getAuthenticatedUser(request).id,
      params.linkId,
      input,
    );
  }
}
