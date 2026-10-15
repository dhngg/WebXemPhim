import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiConflictResponse,
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
import {
  DecideViewingRequestDto,
  ViewingRequestPageResponseDto,
  ViewingRequestQueryDto,
  ViewingRequestResponseDto,
  WorkspaceViewingRequestParamDto,
} from '../dto/viewing-request.dto';
import { ViewingRequestService } from '../services/viewing-request.service';

@ApiTags('Workspace Viewing Requests')
@ApiBearerAuth()
@UseGuards(AuthOriginGuard, AccessAuthGuard, WorkspaceRoleGuard)
@WorkspaceRoles('OWNER')
@Controller('workspaces/:workspaceId/viewing-requests')
export class WorkspaceViewingRequestController {
  constructor(private readonly service: ViewingRequestService) {}

  @Get()
  @ApiOperation({ summary: 'List viewing requests within an authorized workspace' })
  @ApiOkResponse({ type: ViewingRequestPageResponseDto })
  list(
    @Req() request: Request,
    @Query() query: ViewingRequestQueryDto,
  ): Promise<ViewingRequestPageResponseDto> {
    return this.service.listWorkspace(getAuthorizedWorkspace(request).id, query);
  }

  @Patch(':requestId/confirm')
  @ApiOperation({ summary: 'Confirm a pending future viewing request' })
  @ApiOkResponse({ type: ViewingRequestResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  confirm(
    @Param() params: WorkspaceViewingRequestParamDto,
    @Req() request: Request,
    @Body() input: DecideViewingRequestDto,
  ): Promise<ViewingRequestResponseDto> {
    return this.service.confirm(
      getAuthorizedWorkspace(request).id,
      getAuthenticatedUser(request).id,
      params.requestId,
      input,
    );
  }

  @Patch(':requestId/reject')
  @ApiOperation({ summary: 'Reject a pending viewing request' })
  @ApiOkResponse({ type: ViewingRequestResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  reject(
    @Param() params: WorkspaceViewingRequestParamDto,
    @Req() request: Request,
    @Body() input: DecideViewingRequestDto,
  ): Promise<ViewingRequestResponseDto> {
    return this.service.reject(
      getAuthorizedWorkspace(request).id,
      getAuthenticatedUser(request).id,
      params.requestId,
      input,
    );
  }
}
