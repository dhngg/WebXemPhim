import { Injectable } from '@nestjs/common';
import type {
  AmenityResponse,
  AddRoomImageRequest,
  CreateAmenityRequest,
  CreateRoomRequest,
  RoomResponse,
  RoomImageResponse,
  ReorderRoomImagesRequest,
  UpdateRoomRequest,
} from '@rental/shared';
import { ApplicationException } from '../../../common/errors/application-exception';
import {
  BuildingArchivedRepositoryError,
  BuildingNotFoundRepositoryError,
} from '../../buildings/repositories/building.repository';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceNotFoundRepositoryError,
} from '../../workspaces/repositories/workspace.repository';
import {
  AmenityAlreadyExistsRepositoryError,
  AmenityNotFoundRepositoryError,
  type AmenityRecord,
  RoomArchivedRepositoryError,
  RoomCodeConflictRepositoryError,
  RoomHasActiveContractRepositoryError,
  RoomNotFoundRepositoryError,
  RoomImageNotFoundRepositoryError,
  RoomImageOrderInvalidRepositoryError,
  type RoomImageRecord,
  RoomRepository,
  type RoomRecord,
} from '../repositories/room.repository';

@Injectable()
export class RoomService {
  constructor(private readonly repository: RoomRepository) {}

  createRoom(
    workspaceId: string,
    userId: string,
    buildingId: string,
    input: CreateRoomRequest,
  ): Promise<RoomResponse> {
    return this.write(() => this.repository.createRoom(workspaceId, userId, buildingId, input));
  }
  async listRooms(workspaceId: string, buildingId: string): Promise<RoomResponse[]> {
    return (await this.repository.listRooms(workspaceId, buildingId)).map(toRoomResponse);
  }
  async detailRoom(workspaceId: string, buildingId: string, roomId: string): Promise<RoomResponse> {
    const room = await this.repository.detailRoom(workspaceId, buildingId, roomId);
    if (!room) throw new ApplicationException('ROOM_NOT_FOUND');
    return toRoomResponse(room);
  }
  updateRoom(
    workspaceId: string,
    userId: string,
    buildingId: string,
    roomId: string,
    input: UpdateRoomRequest,
  ): Promise<RoomResponse> {
    if (!Object.values(input).some((value) => value !== undefined))
      throw new ApplicationException('VALIDATION_ERROR');
    return this.write(() =>
      this.repository.updateRoom(workspaceId, userId, buildingId, roomId, input),
    );
  }
  archiveRoom(
    workspaceId: string,
    userId: string,
    buildingId: string,
    roomId: string,
  ): Promise<RoomResponse> {
    return this.write(() => this.repository.archiveRoom(workspaceId, userId, buildingId, roomId));
  }
  restoreRoom(
    workspaceId: string,
    userId: string,
    buildingId: string,
    roomId: string,
  ): Promise<RoomResponse> {
    return this.write(() => this.repository.restoreRoom(workspaceId, userId, buildingId, roomId));
  }
  async createAmenity(
    workspaceId: string,
    userId: string,
    input: CreateAmenityRequest,
  ): Promise<AmenityResponse> {
    try {
      return toAmenityResponse(await this.repository.createAmenity(workspaceId, userId, input));
    } catch (error) {
      this.rethrow(error);
    }
  }
  async listAmenities(workspaceId: string): Promise<AmenityResponse[]> {
    return (await this.repository.listAmenities(workspaceId)).map(toAmenityResponse);
  }
  async assignAmenity(
    workspaceId: string,
    userId: string,
    buildingId: string,
    roomId: string,
    amenityId: string,
  ): Promise<void> {
    try {
      await this.repository.assignAmenity(workspaceId, userId, buildingId, roomId, amenityId);
    } catch (error) {
      this.rethrow(error);
    }
  }
  async unassignAmenity(
    workspaceId: string,
    userId: string,
    buildingId: string,
    roomId: string,
    amenityId: string,
  ): Promise<void> {
    try {
      await this.repository.unassignAmenity(workspaceId, userId, buildingId, roomId, amenityId);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async addRoomImage(
    workspaceId: string,
    userId: string,
    buildingId: string,
    roomId: string,
    input: AddRoomImageRequest,
  ): Promise<RoomImageResponse> {
    try {
      return toRoomImageResponse(
        await this.repository.addRoomImage(workspaceId, userId, buildingId, roomId, input),
      );
    } catch (error) {
      this.rethrow(error);
    }
  }

  async listRoomImages(
    workspaceId: string,
    buildingId: string,
    roomId: string,
  ): Promise<RoomImageResponse[]> {
    return (await this.repository.listRoomImages(workspaceId, buildingId, roomId)).map(
      toRoomImageResponse,
    );
  }

  async reorderRoomImages(
    workspaceId: string,
    userId: string,
    buildingId: string,
    roomId: string,
    input: ReorderRoomImagesRequest,
  ): Promise<RoomImageResponse[]> {
    try {
      return (
        await this.repository.reorderRoomImages(workspaceId, userId, buildingId, roomId, input)
      ).map(toRoomImageResponse);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async deleteRoomImage(
    workspaceId: string,
    userId: string,
    buildingId: string,
    roomId: string,
    imageId: string,
  ): Promise<void> {
    try {
      await this.repository.deleteRoomImage(workspaceId, userId, buildingId, roomId, imageId);
    } catch (error) {
      this.rethrow(error);
    }
  }

  private async write(operation: () => Promise<RoomRecord>): Promise<RoomResponse> {
    try {
      return toRoomResponse(await operation());
    } catch (error) {
      this.rethrow(error);
    }
  }
  private rethrow(error: unknown): never {
    if (error instanceof WorkspaceNotFoundRepositoryError)
      throw new ApplicationException('WORKSPACE_NOT_FOUND');
    if (error instanceof WorkspaceArchivedRepositoryError)
      throw new ApplicationException('WORKSPACE_ARCHIVED');
    if (error instanceof BuildingNotFoundRepositoryError)
      throw new ApplicationException('BUILDING_NOT_FOUND');
    if (error instanceof BuildingArchivedRepositoryError)
      throw new ApplicationException('BUILDING_ARCHIVED');
    if (error instanceof RoomNotFoundRepositoryError)
      throw new ApplicationException('ROOM_NOT_FOUND');
    if (error instanceof RoomArchivedRepositoryError)
      throw new ApplicationException('ROOM_ARCHIVED');
    if (error instanceof RoomHasActiveContractRepositoryError)
      throw new ApplicationException('ROOM_HAS_ACTIVE_CONTRACT');
    if (error instanceof RoomCodeConflictRepositoryError)
      throw new ApplicationException('ROOM_CODE_CONFLICT');
    if (error instanceof AmenityNotFoundRepositoryError)
      throw new ApplicationException('AMENITY_NOT_FOUND');
    if (error instanceof AmenityAlreadyExistsRepositoryError)
      throw new ApplicationException('AMENITY_ALREADY_EXISTS');
    if (error instanceof RoomImageNotFoundRepositoryError)
      throw new ApplicationException('ROOM_IMAGE_NOT_FOUND');
    if (error instanceof RoomImageOrderInvalidRepositoryError)
      throw new ApplicationException('ROOM_IMAGE_ORDER_INVALID');
    throw error;
  }
}

function toRoomImageResponse(image: RoomImageRecord): RoomImageResponse {
  return {
    id: image.id,
    workspaceId: image.workspaceId,
    roomId: image.roomId,
    url: image.url,
    altText: image.altText,
    sortOrder: image.sortOrder,
    createdAt: image.createdAt.toISOString(),
    updatedAt: image.updatedAt.toISOString(),
  };
}

function toAmenityResponse(amenity: AmenityRecord): AmenityResponse {
  return {
    id: amenity.id,
    workspaceId: amenity.workspaceId,
    name: amenity.name,
    description: amenity.description,
    createdAt: amenity.createdAt.toISOString(),
    updatedAt: amenity.updatedAt.toISOString(),
  };
}
function toRoomResponse(room: RoomRecord): RoomResponse {
  return {
    id: room.id,
    workspaceId: room.workspaceId,
    buildingId: room.buildingId,
    code: room.code,
    areaSqm: room.areaSqm.toFixed(2),
    monthlyRent: room.monthlyRent.toFixed(2),
    maxOccupants: room.maxOccupants,
    description: room.description,
    status: room.status,
    archivedAt: room.archivedAt?.toISOString() ?? null,
    amenities: room.amenities.map(({ amenity }) => toAmenityResponse(amenity)),
    createdAt: room.createdAt.toISOString(),
    updatedAt: room.updatedAt.toISOString(),
  };
}
