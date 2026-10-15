import { env } from '@/lib/env';
import { httpClient } from '@/services/http/httpClient';
import { roomsMock } from '@/mocks/handlers/rooms.mock';
import type { PublicListingPageResponse, PublicListingResponse } from '@rental/shared';
import type { PublicRoom, RoomSearchParams, RoomSearchResult } from './types';

export interface RoomsApi {
  search(params: RoomSearchParams): Promise<RoomSearchResult>;
  getByListingId(listingId: string): Promise<PublicRoom>;
  /** Compatibility alias for FE-03B mock code; the argument is still a public listing ID. */
  getById(listingId: string): Promise<PublicRoom>;
}

export function mapPublicListing(dto: PublicListingResponse): PublicRoom {
  const price = Number(dto.room.monthlyRent);
  const area = Number(dto.room.areaSqm);
  if (!Number.isFinite(price) || !Number.isFinite(area))
    throw new TypeError('Public listing contains an invalid decimal value.');

  return {
    id: dto.id,
    roomId: dto.room.id,
    title: `${dto.building.name} – Phòng ${dto.room.code}`,
    buildingName: dto.building.name,
    streetAddress: dto.building.addressLine1,
    address: [
      dto.building.addressLine1,
      dto.building.addressLine2,
      dto.building.ward,
      dto.building.district,
      dto.building.city,
    ]
      .filter((part): part is string => Boolean(part))
      .join(', '),
    ward: dto.building.ward ?? '',
    district: dto.building.district ?? '',
    city: dto.building.city,
    price,
    area,
    maxOccupants: dto.room.maxOccupants,
    amenities: dto.room.amenities.map((amenity) => ({ ...amenity })),
    images: [...dto.room.images]
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((image) => image.url),
    description: dto.room.description,
    postedAt: dto.publishedAt,
  };
}

export const roomsHttp: RoomsApi = {
  async search(params) {
    const response = await httpClient.get<PublicListingPageResponse>('/listings', {
      query: {
        city: params.city,
        district: params.district,
        ward: params.ward,
        minPrice: params.minPrice,
        maxPrice: params.maxPrice,
        amenityIds: params.amenityIds?.join(','),
        page: params.page,
        limit: params.limit,
      },
    });
    return {
      items: response.items.map(mapPublicListing),
      page: response.page,
      pageSize: response.limit,
      total: response.total,
    };
  },
  async getByListingId(listingId) {
    const response = await httpClient.get<PublicListingResponse>(
      `/listings/${encodeURIComponent(listingId)}`,
    );
    return mapPublicListing(response);
  },
  getById: (listingId) => roomsHttp.getByListingId(listingId),
};

export const roomsApi: RoomsApi = env.useMockApi ? roomsMock : roomsHttp;
