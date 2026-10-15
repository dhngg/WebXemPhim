import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateMaintenanceRequestRequest, TransitionMaintenanceRequest, UpdateMaintenanceRequestRequest } from '@rental/shared';
import { maintenanceOwnerApi, type MaintenanceFilters, type PageQuery } from './owner-api';

const root = (ws: string) => ['workspaces', ws, 'mnt'] as const;

export function useMaintenanceRequests(ws: string, buildingId: string | undefined, filters: MaintenanceFilters, page: PageQuery) {
  return useQuery({
    queryKey: [...root(ws), 'list', buildingId, filters, page],
    queryFn: () => maintenanceOwnerApi.list(ws, buildingId!, filters, page),
    enabled: Boolean(buildingId),
    placeholderData: keepPreviousData,
  });
}
export function useMaintenanceRequest(ws: string, buildingId: string | undefined, requestId: string | undefined) {
  return useQuery({
    queryKey: [...root(ws), 'detail', buildingId, requestId],
    queryFn: () => maintenanceOwnerApi.get(ws, buildingId!, requestId!),
    enabled: Boolean(buildingId && requestId),
  });
}
/** Mọi thay đổi làm mới danh sách/chi tiết, số đếm bảo trì của dashboard và thông báo mới phát sinh. */
function useRefresh(ws: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: root(ws) });
    void qc.invalidateQueries({ queryKey: ['workspaces', ws, 'dashboard'] });
    void qc.invalidateQueries({ queryKey: ['notifications'] });
  };
}
export function useCreateMaintenance(ws: string, buildingId: string) {
  const refresh = useRefresh(ws);
  return useMutation({ mutationFn: (input: CreateMaintenanceRequestRequest) => maintenanceOwnerApi.create(ws, buildingId, input), onSuccess: refresh });
}
export function useUpdateMaintenance(ws: string, buildingId: string, requestId: string) {
  const refresh = useRefresh(ws);
  return useMutation({ mutationFn: (patch: UpdateMaintenanceRequestRequest) => maintenanceOwnerApi.update(ws, buildingId, requestId, patch), onSuccess: refresh });
}
export function useTransitionMaintenance(ws: string, buildingId: string, requestId: string) {
  const refresh = useRefresh(ws);
  return useMutation({ mutationFn: (input: TransitionMaintenanceRequest) => maintenanceOwnerApi.transition(ws, buildingId, requestId, input), onSuccess: refresh });
}
