import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ContractResponse, ContractStatus, MaintenanceStatus, TenantLinkRequestStatus } from '@rental/shared';
import { capabilityKeys } from '@/features/capabilities/hooks';
import { tenantPortalApi, type AcceptInvitationInput, type PageQuery } from './api';
import { canRequestMaintenance } from './model';

/** Mọi dữ liệu Cổng người thuê nằm dưới khóa này để làm mới/xóa cùng lúc (ví dụ sau khi liên kết hồ sơ mới). */
export const tenantKeys = {
  all: ['tenant-portal'] as const,
  tenants: ['tenant-portal', 'tenants'] as const,
  linkRequests: (q: object) => ['tenant-portal', 'link-requests', q] as const,
  contracts: (q: object) => ['tenant-portal', 'contracts', q] as const,
  contract: (id: string | undefined) => ['tenant-portal', 'contract', id] as const,
  deposit: (id: string | undefined, q: object) => ['tenant-portal', 'deposit', id, q] as const,
  invoices: (q: object) => ['tenant-portal', 'invoices', q] as const,
  invoice: (id: string | undefined) => ['tenant-portal', 'invoice', id] as const,
  adjustments: (id: string | undefined, q: object) => ['tenant-portal', 'adjustments', id, q] as const,
  payments: (id: string | undefined, q: object) => ['tenant-portal', 'payments', id, q] as const,
  maintenanceAll: ['tenant-portal', 'maintenance'] as const,
  maintenance: (q: object) => ['tenant-portal', 'maintenance', 'list', q] as const,
  maintenanceRequest: (id: string | undefined) => ['tenant-portal', 'maintenance', 'item', id] as const,
};

export const useLinkedTenants = () => useQuery({ queryKey: tenantKeys.tenants, queryFn: () => tenantPortalApi.linkedTenants() });

export const useLinkRequests = (q: PageQuery & { status?: TenantLinkRequestStatus }) =>
  useQuery({ queryKey: tenantKeys.linkRequests(q), queryFn: () => tenantPortalApi.linkRequests(q), placeholderData: (prev) => prev });

export const useTenantContracts = (q: PageQuery & { status?: ContractStatus }) =>
  useQuery({ queryKey: tenantKeys.contracts(q), queryFn: () => tenantPortalApi.contracts(q), placeholderData: (prev) => prev });
export const useTenantContract = (id: string | undefined) =>
  useQuery({ queryKey: tenantKeys.contract(id), queryFn: () => tenantPortalApi.contract(id!), enabled: Boolean(id), retry: false });
export const useTenantDeposit = (id: string | undefined, q: PageQuery) =>
  useQuery({ queryKey: tenantKeys.deposit(id, q), queryFn: () => tenantPortalApi.deposit(id!, q), enabled: Boolean(id), placeholderData: (prev) => prev, retry: false });

export const useTenantInvoices = (q: PageQuery & { period?: string }) =>
  useQuery({ queryKey: tenantKeys.invoices(q), queryFn: () => tenantPortalApi.invoices(q), placeholderData: (prev) => prev });
export const useTenantInvoice = (id: string | undefined) =>
  useQuery({ queryKey: tenantKeys.invoice(id), queryFn: () => tenantPortalApi.invoice(id!), enabled: Boolean(id), retry: false });
export const useTenantAdjustments = (id: string | undefined, q: PageQuery) =>
  useQuery({ queryKey: tenantKeys.adjustments(id, q), queryFn: () => tenantPortalApi.adjustments(id!, q), enabled: Boolean(id), placeholderData: (prev) => prev, retry: false });
export const useTenantPayments = (id: string | undefined, q: PageQuery) =>
  useQuery({ queryKey: tenantKeys.payments(id, q), queryFn: () => tenantPortalApi.payments(id!, q), enabled: Boolean(id), placeholderData: (prev) => prev, retry: false });

export const useTenantMaintenance = (q: PageQuery & { status?: MaintenanceStatus }) =>
  useQuery({ queryKey: tenantKeys.maintenance(q), queryFn: () => tenantPortalApi.maintenance(q), placeholderData: (prev) => prev });
export const useTenantMaintenanceRequest = (id: string | undefined) =>
  useQuery({ queryKey: tenantKeys.maintenanceRequest(id), queryFn: () => tenantPortalApi.maintenanceRequest(id!), enabled: Boolean(id), retry: false });

const BACKEND_MAX_LIMIT = 50;
const MAX_PICKER_PAGES = 10;
/**
 * Hợp đồng đủ điều kiện gửi yêu cầu bảo trì cho hộp chọn: lấy ACTIVE theo từng trang (tối đa 50/trang, theo backend)
 * cho đến hết rồi lọc theo pha, để không bỏ sót hợp đồng nằm ở trang sau.
 */
export function useEligibleContracts(enabled: boolean) {
  return useQuery({
    queryKey: ['tenant-portal', 'eligible-contracts'],
    enabled,
    queryFn: async (): Promise<ContractResponse[]> => {
      const all: ContractResponse[] = [];
      for (let page = 1; page <= MAX_PICKER_PAGES; page++) {
        const res = await tenantPortalApi.contracts({ status: 'ACTIVE', page, limit: BACKEND_MAX_LIMIT });
        all.push(...res.items);
        if (all.length >= res.total || res.items.length === 0) break;
      }
      return all.filter(canRequestMaintenance);
    },
  });
}

/** Chấp nhận mã mời: quyền (capabilities) và hồ sơ đã liên kết đổi ngay, nên phải tải lại cả hai. */
export function useAcceptInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AcceptInvitationInput) => tenantPortalApi.acceptInvitation(input),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: capabilityKeys.me }),
        qc.invalidateQueries({ queryKey: tenantKeys.all }),
        qc.invalidateQueries({ queryKey: ['notifications'] }),
      ]);
    },
  });
}

export function useCreateTenantMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: tenantPortalApi.createMaintenance,
    onSuccess: () => qc.invalidateQueries({ queryKey: tenantKeys.maintenanceAll }),
  });
}

export function useCancelTenantMaintenance(requestId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof tenantPortalApi.cancelMaintenance>[1]) => tenantPortalApi.cancelMaintenance(requestId, input),
    // Kể cả khi hủy bị từ chối (409) trạng thái thật có thể đã đổi: luôn tải lại.
    onSettled: () => qc.invalidateQueries({ queryKey: tenantKeys.maintenanceAll }),
  });
}
