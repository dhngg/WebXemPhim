import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { roomsApi } from './api';
import type { RoomSearchParams } from './types';

export const roomKeys = {
  all: ['rooms'] as const,
  search: (params: RoomSearchParams) => ['rooms', 'search', params] as const,
  detail: (id: string) => ['rooms', 'detail', id] as const,
  featured: ['rooms', 'featured'] as const,
  stats: ['marketplace', 'stats'] as const,
  districts: ['marketplace', 'districts'] as const,
};

export function useRoomSearch(params: RoomSearchParams) {
  return useQuery({
    queryKey: roomKeys.search(params),
    queryFn: () => roomsApi.search(params),
    placeholderData: keepPreviousData,
  });
}

export function useRoom(roomId: string | undefined) {
  return useQuery({
    queryKey: roomKeys.detail(roomId ?? ''),
    queryFn: () => roomsApi.getById(roomId!),
    enabled: Boolean(roomId),
  });
}

export function useFeaturedRooms() {
  return useQuery({ queryKey: roomKeys.featured, queryFn: () => roomsApi.getFeatured() });
}

export function useMarketplaceStats() {
  return useQuery({ queryKey: roomKeys.stats, queryFn: () => roomsApi.getStats(), staleTime: 5 * 60_000 });
}

export function useDistricts() {
  return useQuery({ queryKey: roomKeys.districts, queryFn: () => roomsApi.getDistricts(), staleTime: 5 * 60_000 });
}
