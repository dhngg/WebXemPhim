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
import { RoomIdParamDto } from '../../rooms/dto/room.dto';
import {
  AdjustMeterReadingRequestDto,
  CreateMeterReadingRequestDto,
  MeterReadingIdParamDto,
  MeterReadingPageResponseDto,
  MeterReadingQueryDto,
  MeterReadingResponseDto,
} from '../dto/meter-reading.dto';
import { MeterReadingService } from '../services/meter-reading.service';
@ApiTags('Meter Readings')
@ApiBearerAuth()
@UseGuards(AuthOriginGuard, AccessAuthGuard)
@Controller('workspaces/:workspaceId/buildings/:buildingId/rooms/:roomId/meter-readings')
export class MeterReadingController {
  constructor(private readonly service: MeterReadingService) {}
  @Post()
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiCreatedResponse({ type: MeterReadingResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  create(
    @Req() req: Request,
    @Param() params: RoomIdParamDto,
    @Body() input: CreateMeterReadingRequestDto,
  ) {
    return this.service.create(
      getAuthorizedWorkspace(req).id,
      getAuthenticatedUser(req).id,
      params.buildingId,
      params.roomId,
      input,
    );
  }
  @Get()
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOkResponse({ type: MeterReadingPageResponseDto })
  list(@Req() req: Request, @Param() params: RoomIdParamDto, @Query() query: MeterReadingQueryDto) {
    return this.service.list(
      getAuthorizedWorkspace(req).id,
      params.buildingId,
      params.roomId,
      query,
    );
  }
  @Patch(':readingId/adjust')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOkResponse({ type: MeterReadingResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  adjust(
    @Req() req: Request,
    @Param() params: MeterReadingIdParamDto,
    @Body() input: AdjustMeterReadingRequestDto,
  ) {
    return this.service.adjust(
      getAuthorizedWorkspace(req).id,
      getAuthenticatedUser(req).id,
      params.buildingId,
      params.roomId,
      params.readingId,
      input,
    );
  }
}
