import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { roomsApi } from './api';
import type { RoomSearchParams } from './types';

export const roomKeys = {
  all: ['rooms'] as const,
  search: (params: RoomSearchParams) => ['rooms', 'search', params] as const,
  detail: (id: string) => ['rooms', 'detail', id] as const,
};

export function useRoomSearch(params: RoomSearchParams) {
  return useQuery({
    queryKey: roomKeys.search(params),
    queryFn: () => roomsApi.search(params),
    placeholderData: keepPreviousData,
  });
}

export function useRoom(listingId: string | undefined) {
  return useQuery({
    queryKey: roomKeys.detail(listingId ?? ''),
    queryFn: () => roomsApi.getByListingId(listingId!),
    enabled: Boolean(listingId),
  });
}
