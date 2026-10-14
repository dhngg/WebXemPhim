import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { leasingApi, type ContractFilters, type TenantFilters } from './api';
import type { ContractInput, TenantInput, VehicleInput } from './types';

const k = (ws: string) => ['workspaces', ws] as const;

function useInvalidateWs(ws: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: k(ws) });
}

export function useTenants(ws: string, f: TenantFilters = {}) {
  return useQuery({ queryKey: [...k(ws), 'tenants', f], queryFn: () => leasingApi.listTenants(ws, f) });
}
export function useTenant(ws: string, id: string | undefined) {
  return useQuery({ queryKey: [...k(ws), 'tenants', 'detail', id], queryFn: () => leasingApi.getTenant(ws, id!), enabled: Boolean(id) });
}
export function useSaveTenant(ws: string, id?: string) {
  const invalidate = useInvalidateWs(ws);
  return useMutation({
    mutationFn: (input: TenantInput) => (id ? leasingApi.updateTenant(ws, id, input) : leasingApi.createTenant(ws, input)),
    onSuccess: invalidate,
  });
}
export function useReviewLinkRequest(ws: string) {
  const invalidate = useInvalidateWs(ws);
  return useMutation({
    mutationFn: ({ tenantId, approve }: { tenantId: string; approve: boolean }) => leasingApi.reviewLinkRequest(ws, tenantId, approve),
    onSuccess: invalidate,
  });
}

export function useContracts(ws: string, f: ContractFilters = {}) {
  return useQuery({ queryKey: [...k(ws), 'contracts', f], queryFn: () => leasingApi.listContracts(ws, f) });
}
export function useContract(ws: string, id: string | undefined) {
  return useQuery({ queryKey: [...k(ws), 'contracts', 'detail', id], queryFn: () => leasingApi.getContract(ws, id!), enabled: Boolean(id) });
}
export function useSaveContract(ws: string, id?: string) {
  const invalidate = useInvalidateWs(ws);
  return useMutation({
    mutationFn: (input: ContractInput) => (id ? leasingApi.updateContract(ws, id, input) : leasingApi.createContract(ws, input)),
    onSuccess: invalidate,
  });
}
export function useActivateContract(ws: string) {
  const invalidate = useInvalidateWs(ws);
  return useMutation({ mutationFn: (id: string) => leasingApi.activateContract(ws, id), onSuccess: invalidate });
}
export function useTerminateContract(ws: string) {
  const invalidate = useInvalidateWs(ws);
  return useMutation({
    mutationFn: (v: { id: string; endDate: string; reason: string }) => leasingApi.terminateContract(ws, v.id, v.endDate, v.reason),
    onSuccess: invalidate,
  });
}

export function useVehicles(ws: string, q?: string) {
  return useQuery({ queryKey: [...k(ws), 'vehicles', q ?? ''], queryFn: () => leasingApi.listVehicles(ws, q) });
}
export function useSaveVehicle(ws: string) {
  const invalidate = useInvalidateWs(ws);
  return useMutation({
    mutationFn: ({ input, id }: { input: VehicleInput; id?: string }) => leasingApi.saveVehicle(ws, input, id),
    onSuccess: invalidate,
  });
}
export function useDeleteVehicle(ws: string) {
  const invalidate = useInvalidateWs(ws);
  return useMutation({ mutationFn: (id: string) => leasingApi.deleteVehicle(ws, id), onSuccess: invalidate });
}
