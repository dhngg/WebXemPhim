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
import { BuildingIdParamDto } from '../../buildings/dto/building.dto';
import { WorkspaceIdParamDto } from '../../workspaces/dto/workspace.dto';
import {
  getAuthorizedWorkspace,
  WorkspaceRoleGuard,
  WorkspaceRoles,
} from '../../workspaces/http/workspace-authorization';
import {
  AmenityResponseDto,
  AddRoomImageRequestDto,
  CreateAmenityRequestDto,
  CreateRoomRequestDto,
  RoomAmenityParamDto,
  RoomIdParamDto,
  RoomImageParamDto,
  RoomImageResponseDto,
  RoomResponseDto,
  UpdateRoomRequestDto,
  ReorderRoomImagesRequestDto,
} from '../dto/room.dto';
import { RoomService } from '../services/room.service';

@ApiTags('Rooms & Amenities')
@ApiBearerAuth()
@UseGuards(AuthOriginGuard, AccessAuthGuard)
@Controller('workspaces/:workspaceId')
export class RoomController {
  constructor(private readonly service: RoomService) {}

  @Post('buildings/:buildingId/rooms')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOperation({ summary: 'Create a room in an ACTIVE building' })
  @ApiCreatedResponse({ type: RoomResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  createRoom(
    @Param() params: BuildingIdParamDto,
    @Req() request: Request,
    @Body() input: CreateRoomRequestDto,
  ): Promise<RoomResponseDto> {
    return this.service.createRoom(
      getAuthorizedWorkspace(request).id,
      getAuthenticatedUser(request).id,
      params.buildingId,
      input,
    );
  }

  @Get('buildings/:buildingId/rooms')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOperation({ summary: 'List rooms in a workspace-scoped building' })
  @ApiOkResponse({ type: RoomResponseDto, isArray: true })
  listRooms(
    @Param() params: BuildingIdParamDto,
    @Req() request: Request,
  ): Promise<RoomResponseDto[]> {
    return this.service.listRooms(getAuthorizedWorkspace(request).id, params.buildingId);
  }

  @Get('buildings/:buildingId/rooms/:roomId')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOperation({ summary: 'Get room detail with amenities' })
  @ApiOkResponse({ type: RoomResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  detailRoom(@Param() params: RoomIdParamDto, @Req() request: Request): Promise<RoomResponseDto> {
    return this.service.detailRoom(
      getAuthorizedWorkspace(request).id,
      params.buildingId,
      params.roomId,
    );
  }

  @Patch('buildings/:buildingId/rooms/:roomId')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOperation({ summary: 'Update a non-archived room' })
  @ApiOkResponse({ type: RoomResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  updateRoom(
    @Param() params: RoomIdParamDto,
    @Req() request: Request,
    @Body() input: UpdateRoomRequestDto,
  ): Promise<RoomResponseDto> {
    return this.service.updateRoom(
      getAuthorizedWorkspace(request).id,
      getAuthenticatedUser(request).id,
      params.buildingId,
      params.roomId,
      input,
    );
  }

  @Patch('buildings/:buildingId/rooms/:roomId/archive')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOperation({ summary: 'Archive a room' })
  @ApiOkResponse({ type: RoomResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  archiveRoom(@Param() params: RoomIdParamDto, @Req() request: Request): Promise<RoomResponseDto> {
    return this.service.archiveRoom(
      getAuthorizedWorkspace(request).id,
      getAuthenticatedUser(request).id,
      params.buildingId,
      params.roomId,
    );
  }

  @Patch('buildings/:buildingId/rooms/:roomId/restore')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOperation({ summary: 'Restore an archived room as VACANT' })
  @ApiOkResponse({ type: RoomResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  restoreRoom(@Param() params: RoomIdParamDto, @Req() request: Request): Promise<RoomResponseDto> {
    return this.service.restoreRoom(
      getAuthorizedWorkspace(request).id,
      getAuthenticatedUser(request).id,
      params.buildingId,
      params.roomId,
    );
  }

  @Post('amenities')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOperation({ summary: 'Create a workspace amenity' })
  @ApiCreatedResponse({ type: AmenityResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  createAmenity(
    @Param() _params: WorkspaceIdParamDto,
    @Req() request: Request,
    @Body() input: CreateAmenityRequestDto,
  ): Promise<AmenityResponseDto> {
    void _params;
    return this.service.createAmenity(
      getAuthorizedWorkspace(request).id,
      getAuthenticatedUser(request).id,
      input,
    );
  }

  @Get('amenities')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOperation({ summary: 'List amenities in a workspace' })
  @ApiOkResponse({ type: AmenityResponseDto, isArray: true })
  listAmenities(
    @Param() _params: WorkspaceIdParamDto,
    @Req() request: Request,
  ): Promise<AmenityResponseDto[]> {
    void _params;
    return this.service.listAmenities(getAuthorizedWorkspace(request).id);
  }

  @Post('buildings/:buildingId/rooms/:roomId/amenities/:amenityId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOperation({ summary: 'Assign a workspace amenity to a room idempotently' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  assignAmenity(@Param() params: RoomAmenityParamDto, @Req() request: Request): Promise<void> {
    return this.service.assignAmenity(
      getAuthorizedWorkspace(request).id,
      getAuthenticatedUser(request).id,
      params.buildingId,
      params.roomId,
      params.amenityId,
    );
  }

  @Delete('buildings/:buildingId/rooms/:roomId/amenities/:amenityId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOperation({ summary: 'Unassign an amenity from a room idempotently' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  unassignAmenity(@Param() params: RoomAmenityParamDto, @Req() request: Request): Promise<void> {
    return this.service.unassignAmenity(
      getAuthorizedWorkspace(request).id,
      getAuthenticatedUser(request).id,
      params.buildingId,
      params.roomId,
      params.amenityId,
    );
  }

  @Post('buildings/:buildingId/rooms/:roomId/images')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOperation({ summary: 'Add externally hosted image metadata to a room' })
  @ApiCreatedResponse({ type: RoomImageResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  addRoomImage(
    @Param() params: RoomIdParamDto,
    @Req() request: Request,
    @Body() input: AddRoomImageRequestDto,
  ): Promise<RoomImageResponseDto> {
    return this.service.addRoomImage(
      getAuthorizedWorkspace(request).id,
      getAuthenticatedUser(request).id,
      params.buildingId,
      params.roomId,
      input,
    );
  }

  @Get('buildings/:buildingId/rooms/:roomId/images')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOperation({ summary: 'List room images in display order' })
  @ApiOkResponse({ type: RoomImageResponseDto, isArray: true })
  listRoomImages(
    @Param() params: RoomIdParamDto,
    @Req() request: Request,
  ): Promise<RoomImageResponseDto[]> {
    return this.service.listRoomImages(
      getAuthorizedWorkspace(request).id,
      params.buildingId,
      params.roomId,
    );
  }

  @Patch('buildings/:buildingId/rooms/:roomId/images/reorder')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOperation({ summary: 'Replace the complete display order for room images' })
  @ApiOkResponse({ type: RoomImageResponseDto, isArray: true })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  reorderRoomImages(
    @Param() params: RoomIdParamDto,
    @Req() request: Request,
    @Body() input: ReorderRoomImagesRequestDto,
  ): Promise<RoomImageResponseDto[]> {
    return this.service.reorderRoomImages(
      getAuthorizedWorkspace(request).id,
      getAuthenticatedUser(request).id,
      params.buildingId,
      params.roomId,
      input,
    );
  }

  @Delete('buildings/:buildingId/rooms/:roomId/images/:imageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOperation({ summary: 'Delete room image metadata' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  deleteRoomImage(@Param() params: RoomImageParamDto, @Req() request: Request): Promise<void> {
    return this.service.deleteRoomImage(
      getAuthorizedWorkspace(request).id,
      getAuthenticatedUser(request).id,
      params.buildingId,
      params.roomId,
      params.imageId,
    );
  }
}
