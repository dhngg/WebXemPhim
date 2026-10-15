import { Body, Controller, Param, Put, Req, UseGuards } from '@nestjs/common';
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
  ListingManagementResponseDto,
  ListingRoomParamDto,
  SetListingPublicationRequestDto,
} from '../dto/listing.dto';
import { ListingService } from '../services/listing.service';

@ApiTags('Marketplace Management')
@ApiBearerAuth()
@UseGuards(AuthOriginGuard, AccessAuthGuard, WorkspaceRoleGuard)
@WorkspaceRoles('OWNER')
@Controller('workspaces/:workspaceId/buildings/:buildingId/rooms/:roomId/listing')
export class ListingManagementController {
  constructor(private readonly service: ListingService) {}

  @Put()
  @ApiOperation({ summary: 'Enable or disable a room public listing idempotently' })
  @ApiOkResponse({ type: ListingManagementResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  setPublication(
    @Param() params: ListingRoomParamDto,
    @Req() request: Request,
    @Body() input: SetListingPublicationRequestDto,
  ): Promise<ListingManagementResponseDto> {
    return this.service.setPublication(
      getAuthorizedWorkspace(request).id,
      getAuthenticatedUser(request).id,
      params.buildingId,
      params.roomId,
      input,
    );
  }
}
