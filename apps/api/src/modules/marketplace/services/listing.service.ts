import { Injectable } from '@nestjs/common';
import type {
  ListingManagementResponse,
  PublicListingPageResponse,
  PublicListingResponse,
  SetListingPublicationRequest,
} from '@rental/shared';
import { ApplicationException } from '../../../common/errors/application-exception';
import {
  BuildingArchivedRepositoryError,
  BuildingNotFoundRepositoryError,
} from '../../buildings/repositories/building.repository';
import {
  RoomArchivedRepositoryError,
  RoomNotFoundRepositoryError,
} from '../../rooms/repositories/room.repository';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceNotFoundRepositoryError,
} from '../../workspaces/repositories/workspace.repository';
import type { PublicListingQueryDto } from '../dto/listing.dto';
import {
  ListingNotEligibleRepositoryError,
  ListingRepository,
  type ListingRecord,
  type PublicListingRecord,
} from '../repositories/listing.repository';

@Injectable()
export class ListingService {
  constructor(private readonly repository: ListingRepository) {}

  async setPublication(
    workspaceId: string,
    userId: string,
    buildingId: string,
    roomId: string,
    input: SetListingPublicationRequest,
  ): Promise<ListingManagementResponse> {
    try {
      return toManagementResponse(
        await this.repository.setPublication(workspaceId, userId, buildingId, roomId, input),
      );
    } catch (error) {
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
      if (error instanceof ListingNotEligibleRepositoryError)
        throw new ApplicationException('LISTING_NOT_ELIGIBLE');
      throw error;
    }
  }

  async listPublic(query: PublicListingQueryDto): Promise<PublicListingPageResponse> {
    if (query.minPrice && query.maxPrice && Number(query.minPrice) > Number(query.maxPrice))
      throw new ApplicationException('VALIDATION_ERROR');
    const { items, total } = await this.repository.listPublic(query);
    return { items: items.map(toPublicResponse), page: query.page, limit: query.limit, total };
  }

  async detailPublic(listingId: string): Promise<PublicListingResponse> {
    const listing = await this.repository.detailPublic(listingId);
    if (!listing) throw new ApplicationException('LISTING_NOT_FOUND');
    return toPublicResponse(listing);
  }
}

function toManagementResponse(listing: ListingRecord): ListingManagementResponse {
  return {
    id: listing.id,
    roomId: listing.roomId,
    published: listing.isPublished,
    publishedAt: listing.publishedAt?.toISOString() ?? null,
    unpublishedAt: listing.unpublishedAt?.toISOString() ?? null,
    createdAt: listing.createdAt.toISOString(),
    updatedAt: listing.updatedAt.toISOString(),
  };
}

function toPublicResponse(listing: PublicListingRecord): PublicListingResponse {
  const { room } = listing;
  const { building } = room;
  if (!listing.publishedAt) throw new ApplicationException('LISTING_NOT_FOUND');
  return {
    id: listing.id,
    publishedAt: listing.publishedAt.toISOString(),
    room: {
      id: room.id,
      code: room.code,
      areaSqm: room.areaSqm.toFixed(2),
      monthlyRent: room.monthlyRent.toFixed(2),
      maxOccupants: room.maxOccupants,
      description: room.description,
      amenities: room.amenities.map(({ amenity }) => ({ id: amenity.id, name: amenity.name })),
      images: room.images.map((image) => ({
        id: image.id,
        url: image.url,
        altText: image.altText,
        sortOrder: image.sortOrder,
      })),
    },
    building: {
      id: building.id,
      name: building.name,
      addressLine1: building.addressLine1,
      addressLine2: building.addressLine2,
      ward: building.ward,
      district: building.district,
      city: building.city,
      postalCode: building.postalCode,
      countryCode: 'VN',
    },
  };
}
