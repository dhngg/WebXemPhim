import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { propertyManagementApi as api } from './api';
import type { BuildingInput, BuildingPatch, RoomFilters, RoomInput, RoomPatch } from './types';

const base = (ws: string) => ['workspaces', ws, 'pm'] as const;

/** Sau mọi thay đổi tài sản: làm mới dữ liệu workspace (danh sách, thống kê) và tin công khai. */
function useRefresh(ws: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['workspaces', ws] });
    void qc.invalidateQueries({ queryKey: ['rooms'] });
  };
}

export function useBuildings(ws: string, q?: string) {
  return useQuery({ queryKey: [...base(ws), 'buildings', q ?? ''], queryFn: () => api.listBuildings(ws, q) });
}
export function useBuilding(ws: string, id: string | undefined) {
  return useQuery({ queryKey: [...base(ws), 'building', id], queryFn: () => api.getBuilding(ws, id!), enabled: Boolean(id) });
}
export function useCreateBuilding(ws: string) {
  const refresh = useRefresh(ws);
  return useMutation({ mutationFn: (input: BuildingInput) => api.createBuilding(ws, input), onSuccess: refresh });
}
export function useUpdateBuilding(ws: string, id: string) {
  const refresh = useRefresh(ws);
  return useMutation({ mutationFn: (patch: BuildingPatch) => api.updateBuilding(ws, id, patch), onSuccess: refresh });
}
export function useBuildingLifecycle(ws: string) {
  const refresh = useRefresh(ws);
  return {
    archive: useMutation({ mutationFn: (id: string) => api.archiveBuilding(ws, id), onSuccess: refresh }),
    restore: useMutation({ mutationFn: (id: string) => api.restoreBuilding(ws, id), onSuccess: refresh }),
  };
}

export function useRooms(ws: string, filters: RoomFilters = {}) {
  return useQuery({ queryKey: [...base(ws), 'rooms', filters], queryFn: () => api.listRooms(ws, filters) });
}
export function useRoom(ws: string, id: string | undefined, buildingId?: string) {
  return useQuery({ queryKey: [...base(ws), 'room', id], queryFn: () => api.getRoom(ws, id!, buildingId), enabled: Boolean(id) });
}
export function useCreateRoom(ws: string) {
  const refresh = useRefresh(ws);
  return useMutation({ mutationFn: (input: RoomInput) => api.createRoom(ws, input), onSuccess: refresh });
}
export function useUpdateRoom(ws: string) {
  const refresh = useRefresh(ws);
  return useMutation({
    mutationFn: (v: { buildingId: string; id: string; patch: RoomPatch }) => api.updateRoom(ws, v.buildingId, v.id, v.patch),
    onSuccess: refresh,
  });
}
export function useRoomLifecycle(ws: string) {
  const refresh = useRefresh(ws);
  return {
    archive: useMutation({ mutationFn: (v: { buildingId: string; id: string }) => api.archiveRoom(ws, v.buildingId, v.id), onSuccess: refresh }),
    restore: useMutation({ mutationFn: (v: { buildingId: string; id: string }) => api.restoreRoom(ws, v.buildingId, v.id), onSuccess: refresh }),
  };
}

export function useAmenities(ws: string) {
  return useQuery({ queryKey: [...base(ws), 'amenities'], queryFn: () => api.listAmenities(ws) });
}
export function useCreateAmenity(ws: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; description?: string }) => api.createAmenity(ws, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...base(ws), 'amenities'] }),
  });
}
export function useRoomAmenityToggle(ws: string) {
  const refresh = useRefresh(ws);
  return useMutation({
    mutationFn: (v: { buildingId: string; roomId: string; amenityId: string; enabled: boolean }) =>
      api.setRoomAmenity(ws, v.buildingId, v.roomId, v.amenityId, v.enabled),
    onSuccess: refresh,
  });
}

export function useRoomImageMutations(ws: string, buildingId: string, roomId: string) {
  const refresh = useRefresh(ws);
  return {
    add: useMutation({ mutationFn: (input: { url: string; altText?: string }) => api.addRoomImage(ws, buildingId, roomId, input), onSuccess: refresh }),
    reorder: useMutation({ mutationFn: (imageIds: string[]) => api.reorderRoomImages(ws, buildingId, roomId, imageIds), onSuccess: refresh }),
    remove: useMutation({ mutationFn: (imageId: string) => api.deleteRoomImage(ws, buildingId, roomId, imageId), onSuccess: refresh }),
  };
}

export function useSetListing(ws: string) {
  const refresh = useRefresh(ws);
  return useMutation({
    mutationFn: (v: { buildingId: string; roomId: string; published: boolean }) => api.setListing(ws, v.buildingId, v.roomId, v.published),
    onSuccess: refresh,
  });
}
