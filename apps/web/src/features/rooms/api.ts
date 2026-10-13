import { env } from '@/lib/env';
import { httpClient } from '@/services/http/httpClient';
import { roomsMock } from '@/mocks/handlers/rooms.mock';
import type { MarketplaceStats, PublicRoom, RoomSearchParams, RoomSearchResult } from './types';

export interface RoomsApi {
  search(params: RoomSearchParams): Promise<RoomSearchResult>;
  getById(roomId: string): Promise<PublicRoom>;
  getFeatured(): Promise<PublicRoom[]>;
  getStats(): Promise<MarketplaceStats>;
  getDistricts(): Promise<Array<{ name: string; count: number }>>;
}

/** Endpoint DỰ KIẾN — chưa chốt với backend (xem API_INTEGRATION_CONTRACT.md). */
const roomsHttp: RoomsApi = {
  search: (params) =>
    httpClient.get('/marketplace/rooms', {
      query: { ...params, amenities: params.amenities },
    }),
  getById: (roomId) => httpClient.get(`/marketplace/rooms/${encodeURIComponent(roomId)}`),
  getFeatured: () => httpClient.get('/marketplace/rooms/featured'),
  getStats: () => httpClient.get('/marketplace/stats'),
  getDistricts: () => httpClient.get('/marketplace/districts'),
};

export const roomsApi: RoomsApi = env.useMockApi ? roomsMock : roomsHttp;
