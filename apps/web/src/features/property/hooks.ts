import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { propertyApi } from './api';
import type { BuildingInput, ListingStatus, WsRoomFilters, WsRoomInput, WsViewingStatus } from './types';

const k = (ws: string) => ['workspaces', ws] as const;

export function useBuildings(ws: string, q?: string) {
  return useQuery({ queryKey: [...k(ws), 'buildings', q ?? ''], queryFn: () => propertyApi.listBuildings(ws, q) });
}
export function useBuilding(ws: string, id: string | undefined) {
  return useQuery({
    queryKey: [...k(ws), 'buildings', 'detail', id],
    queryFn: () => propertyApi.getBuilding(ws, id!),
    enabled: Boolean(id),
  });
}
export function useSaveBuilding(ws: string, id?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BuildingInput) => (id ? propertyApi.updateBuilding(ws, id, input) : propertyApi.createBuilding(ws, input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: k(ws) }),
  });
}

export function useWsRooms(ws: string, filters: WsRoomFilters = {}) {
  return useQuery({ queryKey: [...k(ws), 'rooms', filters], queryFn: () => propertyApi.listRooms(ws, filters) });
}
export function useWsRoom(ws: string, id: string | undefined) {
  return useQuery({
    queryKey: [...k(ws), 'rooms', 'detail', id],
    queryFn: () => propertyApi.getRoom(ws, id!),
    enabled: Boolean(id),
  });
}
export function useSaveRoom(ws: string, id?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: WsRoomInput) => (id ? propertyApi.updateRoom(ws, id, input) : propertyApi.createRoom(ws, input)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: k(ws) });
      qc.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
}
export function useSetListingStatus(ws: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ListingStatus }) => propertyApi.setListingStatus(ws, id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: k(ws) });
      qc.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
}

export function useWsViewings(ws: string, status?: WsViewingStatus) {
  return useQuery({ queryKey: [...k(ws), 'viewings', status ?? 'all'], queryFn: () => propertyApi.listViewings(ws, status) });
}
export function useSetViewingStatus(ws: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: WsViewingStatus }) => propertyApi.setViewingStatus(ws, id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: k(ws) }),
  });
}
