import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicListingPageResponse, PublicListingResponse } from '@rental/shared';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/services/http/httpClient', () => ({ httpClient: { get } }));
vi.mock('@/mocks/handlers/rooms.mock', () => ({ roomsMock: {} }));

import { mapPublicListing, roomsHttp } from './api';

const listing = (overrides: Partial<PublicListingResponse> = {}): PublicListingResponse => ({
  id: '11111111-1111-4111-8111-111111111111',
  publishedAt: '2026-10-15T01:00:00.000Z',
  room: {
    id: '22222222-2222-4222-8222-222222222222',
    code: 'A-101',
    areaSqm: '25.50',
    monthlyRent: '3500000.00',
    maxOccupants: 2,
    description: 'Phòng có cửa sổ.',
    amenities: [{ id: '33333333-3333-4333-8333-333333333333', name: 'Điều hòa' }],
    images: [
      { id: 'image-2', url: 'https://example.test/2.jpg', altText: null, sortOrder: 2 },
      { id: 'image-1', url: 'https://example.test/1.jpg', altText: 'Ảnh chính', sortOrder: 1 },
    ],
  },
  building: {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Tòa An Bình',
    addressLine1: '12 Nguyễn Trãi',
    addressLine2: null,
    ward: 'Thượng Đình',
    district: 'Thanh Xuân',
    city: 'Hà Nội',
    postalCode: null,
    countryCode: 'VN',
  },
  ...overrides,
});

beforeEach(() => get.mockReset());

describe('public listing DTO adapter', () => {
  it('uses listing.id for navigation and keeps room.id only as roomId', () => {
    const mapped = mapPublicListing(listing());

    expect(mapped.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(mapped.roomId).toBe('22222222-2222-4222-8222-222222222222');
    expect(mapped.title).toBe('Tòa An Bình – Phòng A-101');
    expect(mapped.price).toBe(3_500_000);
    expect(mapped.area).toBe(25.5);
    expect(mapped.address).toBe('12 Nguyễn Trãi, Thượng Đình, Thanh Xuân, Hà Nội');
    expect(mapped.amenities).toEqual([
      { id: '33333333-3333-4333-8333-333333333333', name: 'Điều hòa' },
    ]);
    expect(mapped.images).toEqual([
      'https://example.test/1.jpg',
      'https://example.test/2.jpg',
    ]);
    expect(mapped).not.toHaveProperty('verified');
    expect(mapped).not.toHaveProperty('fees');
    expect(mapped).not.toHaveProperty('landlord');
  });

  it('maps backend pagination and only sends supported filters', async () => {
    const response: PublicListingPageResponse = {
      items: [listing()],
      page: 2,
      limit: 20,
      total: 41,
    };
    get.mockResolvedValueOnce(response);

    const result = await roomsHttp.search({
      city: 'Hà Nội',
      district: 'Thanh Xuân',
      ward: 'Thượng Đình',
      minPrice: 2_000_000,
      maxPrice: 5_000_000,
      amenityIds: ['33333333-3333-4333-8333-333333333333'],
      page: 2,
      limit: 20,
      // tham số cũ không còn trong RoomSearchParams: nếu lọt vào cũng không bao giờ được gửi lên backend
      ...({ q: 'ignored', areaMin: 20, occupants: 2, roomType: 'STUDIO', sort: 'price_asc', priceMin: 1, priceMax: 2 } as object),
    });

    expect(get).toHaveBeenCalledWith('/listings', {
      query: {
        city: 'Hà Nội',
        district: 'Thanh Xuân',
        ward: 'Thượng Đình',
        minPrice: 2_000_000,
        maxPrice: 5_000_000,
        amenityIds: '33333333-3333-4333-8333-333333333333',
        page: 2,
        limit: 20,
      },
    });
    expect(result).toMatchObject({ page: 2, pageSize: 20, total: 41 });
    expect(result.items[0]?.id).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('loads detail by encoded listing ID', async () => {
    get.mockResolvedValueOnce(listing());

    const result = await roomsHttp.getByListingId('listing/id');

    expect(get).toHaveBeenCalledWith('/listings/listing%2Fid');
    expect(result.id).toBe('11111111-1111-4111-8111-111111111111');
  });
});
