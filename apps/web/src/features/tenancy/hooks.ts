import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tenancyApi } from './api';
import type {
  ContractInput,
  ContractPatch,
  ContractStatus,
  TenantInput,
  TenantPatch,
  TenantStatus,
  VehicleInput,
  VehiclePatch,
  VehicleStatus,
} from './types';

const base = (ws: string) => ['workspaces', ws, 'tn'] as const;

/** Hợp đồng đổi trạng thái phòng; người thuê/xe liên quan nhau → làm mới toàn bộ dữ liệu workspace. */
function useRefresh(ws: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['workspaces', ws] });
    void qc.invalidateQueries({ queryKey: ['rooms'] });
  };
}

export function useTenantList(ws: string, status?: TenantStatus) {
  return useQuery({ queryKey: [...base(ws), 'tenants', status ?? 'all'], queryFn: () => tenancyApi.listTenants(ws, { status }) });
}
export function useTenantProfile(ws: string, id: string | undefined) {
  return useQuery({ queryKey: [...base(ws), 'tenant', id], queryFn: () => tenancyApi.getTenant(ws, id!), enabled: Boolean(id) });
}
export function useCreateTenant(ws: string) {
  const refresh = useRefresh(ws);
  return useMutation({ mutationFn: (input: TenantInput) => tenancyApi.createTenant(ws, input), onSuccess: refresh });
}
export function useUpdateTenant(ws: string, id: string) {
  const refresh = useRefresh(ws);
  return useMutation({ mutationFn: (patch: TenantPatch) => tenancyApi.updateTenant(ws, id, patch), onSuccess: refresh });
}
export function useTenantLifecycle(ws: string) {
  const refresh = useRefresh(ws);
  return useMutation({
    mutationFn: ({ id, archive }: { id: string; archive: boolean }) =>
      archive ? tenancyApi.archiveTenant(ws, id) : tenancyApi.restoreTenant(ws, id),
    onSuccess: refresh,
  });
}

export function usePendingLinkRequests(ws: string) {
  return useQuery({
    queryKey: [...base(ws), 'link-requests', 'PENDING'],
    queryFn: () => tenancyApi.listLinkRequests(ws, { status: 'PENDING' }),
  });
}
export function useDecideLinkRequest(ws: string) {
  const refresh = useRefresh(ws);
  return useMutation({
    mutationFn: ({ id, approve, note }: { id: string; approve: boolean; note?: string }) =>
      tenancyApi.decideLinkRequest(ws, id, approve, note),
    onSuccess: refresh,
  });
}

export function useTenantLinks(ws: string, tenantId: string | undefined) {
  return useQuery({
    queryKey: [...base(ws), 'tenant-links', tenantId],
    queryFn: () => tenancyApi.listActiveLinks(ws, tenantId!),
    enabled: Boolean(tenantId),
  });
}
export function useRevokeLink(ws: string) {
  const refresh = useRefresh(ws);
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => tenancyApi.revokeLink(ws, id, reason),
    onSuccess: refresh,
  });
}
/** Token chỉ nằm trong kết quả mutation (bộ nhớ), không đưa vào cache truy vấn hay log. */
export function useCreateInvitation(ws: string) {
  return useMutation({ mutationFn: (tenantId: string) => tenancyApi.createInvitation(ws, tenantId) });
}

export function useContractList(ws: string, status?: ContractStatus) {
  return useQuery({ queryKey: [...base(ws), 'contracts', status ?? 'all'], queryFn: () => tenancyApi.listContracts(ws, { status }) });
}
export function useContractDetail(ws: string, id: string | undefined) {
  return useQuery({ queryKey: [...base(ws), 'contract', id], queryFn: () => tenancyApi.getContract(ws, id!), enabled: Boolean(id) });
}
export function useCreateContract(ws: string) {
  const refresh = useRefresh(ws);
  return useMutation({ mutationFn: (input: ContractInput) => tenancyApi.createContract(ws, input), onSuccess: refresh });
}
export function useUpdateContract(ws: string, id: string) {
  const refresh = useRefresh(ws);
  return useMutation({ mutationFn: (patch: ContractPatch) => tenancyApi.updateContract(ws, id, patch), onSuccess: refresh });
}
export function useEndContract(ws: string) {
  const refresh = useRefresh(ws);
  return useMutation({
    mutationFn: ({ id, endDate }: { id: string; endDate?: string }) => tenancyApi.endContract(ws, id, endDate),
    onSuccess: refresh,
  });
}

export function useVehicleList(ws: string, status?: VehicleStatus) {
  return useQuery({ queryKey: [...base(ws), 'vehicles', status ?? 'all'], queryFn: () => tenancyApi.listVehicles(ws, { status }) });
}
export function useCreateVehicle(ws: string) {
  const refresh = useRefresh(ws);
  return useMutation({ mutationFn: (input: VehicleInput) => tenancyApi.createVehicle(ws, input), onSuccess: refresh });
}
export function useUpdateVehicle(ws: string) {
  const refresh = useRefresh(ws);
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: VehiclePatch }) => tenancyApi.updateVehicle(ws, id, patch),
    onSuccess: refresh,
  });
}
export function useStopVehicle(ws: string) {
  const refresh = useRefresh(ws);
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => tenancyApi.stopVehicle(ws, id, reason),
    onSuccess: refresh,
  });
}
