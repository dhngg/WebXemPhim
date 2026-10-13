import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { env } from '@/lib/env';
import { httpClient } from '@/services/http/httpClient';
import { tenantPortalMock } from '@/mocks/handlers/tenant-portal.mock';
import type { Contract } from '@/features/leasing/types';
import type { Invoice, Payment, PaymentInput } from '@/features/billing/types';
import type { MaintenanceRequest, MaintenancePriority } from '@/features/maintenance/types';
import type { LinkRequest, LinkRequestInput, TenantOverview } from './types';

export interface TenantMaintenanceInput {
  title: string;
  description: string;
  priority: MaintenancePriority;
  images: string[];
}

export interface TenantPortalApi {
  overview(): Promise<TenantOverview>;
  contracts(): Promise<Contract[]>;
  invoices(): Promise<Invoice[]>;
  invoice(id: string): Promise<{ invoice: Invoice; payments: Payment[]; bank: { name: string; account: string; holder: string } }>;
  submitPayment(input: PaymentInput): Promise<Payment>;
  maintenance(): Promise<MaintenanceRequest[]>;
  createMaintenance(input: TenantMaintenanceInput): Promise<MaintenanceRequest>;
  linkRequests(): Promise<LinkRequest[]>;
  requestLink(input: LinkRequestInput): Promise<LinkRequest>;
}

/** Endpoint DỰ KIẾN — chưa chốt. */
const tenantHttp: TenantPortalApi = {
  overview: () => httpClient.get('/tenant/overview'),
  contracts: () => httpClient.get('/tenant/contracts'),
  invoices: () => httpClient.get('/tenant/invoices'),
  invoice: (id) => httpClient.get(`/tenant/invoices/${id}`),
  submitPayment: (input) => httpClient.post('/tenant/payments', input),
  maintenance: () => httpClient.get('/tenant/maintenance'),
  createMaintenance: (input) => httpClient.post('/tenant/maintenance', input),
  linkRequests: () => httpClient.get('/tenant/link-requests'),
  requestLink: (input) => httpClient.post('/tenant/link-requests', input),
};

export const tenantPortalApi: TenantPortalApi = env.useMockApi ? tenantPortalMock : tenantHttp;

const K = ['tenant-portal'] as const;

export const useTenantOverview = () => useQuery({ queryKey: [...K, 'overview'], queryFn: () => tenantPortalApi.overview() });
export const useTenantContracts = () => useQuery({ queryKey: [...K, 'contracts'], queryFn: () => tenantPortalApi.contracts() });
export const useTenantInvoices = () => useQuery({ queryKey: [...K, 'invoices'], queryFn: () => tenantPortalApi.invoices() });
export const useTenantInvoice = (id: string | undefined) =>
  useQuery({ queryKey: [...K, 'invoice', id], queryFn: () => tenantPortalApi.invoice(id!), enabled: Boolean(id) });
export const useTenantMaintenance = () => useQuery({ queryKey: [...K, 'maintenance'], queryFn: () => tenantPortalApi.maintenance() });
export const useLinkRequests = () => useQuery({ queryKey: [...K, 'link-requests'], queryFn: () => tenantPortalApi.linkRequests() });

export function useSubmitTenantPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PaymentInput) => tenantPortalApi.submitPayment(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: K });
      qc.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
}
export function useCreateTenantMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TenantMaintenanceInput) => tenantPortalApi.createMaintenance(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: K });
      qc.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
}
export function useRequestLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LinkRequestInput) => tenantPortalApi.requestLink(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: K });
      qc.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
}
