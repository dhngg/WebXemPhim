import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Transform } from 'class-transformer';
import { IsString, IsUUID, Matches } from 'class-validator';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import type { CreateRoomServiceRequest, StopRoomServiceRequest } from '@rental/shared';
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
import { RoomServiceService } from './room-service.service';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const code = ({ value }: { value: unknown }) =>
  typeof value === 'string'
    ? value
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
    : value;

export class CreateRoomServiceRequestDto implements CreateRoomServiceRequest {
  @ApiProperty({ description: 'Building Rate code applying to this room' })
  @Transform(code)
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]{0,49}$/)
  rateCode!: string;
  @ApiProperty({ format: 'date' }) @IsString() @Matches(DATE) effectiveFrom!: string;
}
export class StopRoomServiceRequestDto implements StopRoomServiceRequest {
  @ApiProperty({ format: 'date', description: 'Exclusive end date' })
  @IsString()
  @Matches(DATE)
  effectiveTo!: string;
}
export class RoomServiceIdParamDto extends RoomIdParamDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() serviceId!: string;
}

@ApiTags('Room Services')
@ApiBearerAuth()
@UseGuards(AuthOriginGuard, AccessAuthGuard)
@Controller('workspaces/:workspaceId/buildings/:buildingId/rooms/:roomId/services')
export class RoomServiceController {
  constructor(private readonly service: RoomServiceService) {}

  @Post()
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiCreatedResponse()
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  create(
    @Req() req: Request,
    @Param() params: RoomIdParamDto,
    @Body() input: CreateRoomServiceRequestDto,
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
  @ApiOkResponse()
  list(@Req() req: Request, @Param() params: RoomIdParamDto) {
    return this.service.list(getAuthorizedWorkspace(req).id, params.buildingId, params.roomId);
  }

  @Patch(':serviceId/stop')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOkResponse()
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  stop(
    @Req() req: Request,
    @Param() params: RoomServiceIdParamDto,
    @Body() input: StopRoomServiceRequestDto,
  ) {
    return this.service.stop(
      getAuthorizedWorkspace(req).id,
      getAuthenticatedUser(req).id,
      params.buildingId,
      params.roomId,
      params.serviceId,
      input,
    );
  }
}
