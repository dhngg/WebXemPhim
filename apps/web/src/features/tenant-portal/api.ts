import type {
  CancelMaintenanceRequest,
  ContractPageResponse,
  ContractResponse,
  ContractStatus,
  CreateTenantMaintenanceRequest,
  DepositPageResponse,
  InvoiceAdjustmentPageResponse,
  InvoicePageResponse,
  InvoicePaymentPageResponse,
  InvoiceResponse,
  MaintenanceRequestPageResponse,
  MaintenanceRequestResponse,
  MaintenanceStatus,
  TenantLinkRequestPageResponse,
  TenantLinkRequestStatus,
  TenantSelfResponse,
  TenantUserLinkResponse,
} from '@rental/shared';
import { env } from '@/lib/env';
import { httpClient } from '@/services/http/httpClient';
import { tenantPortalMock } from '@/mocks/handlers/tenant-portal.mock';

export interface PageQuery {
  page: number;
  limit: number;
}

/** Thân của `POST /tenant-invitations/accept`: đúng một trường `token` (43 ký tự base64url). */
export interface AcceptInvitationInput {
  token: string;
}

/**
 * Cổng người thuê: 14 endpoint dành riêng cho tài khoản đã đăng nhập (`/…/me`), mọi kết quả do backend giới hạn
 * theo các hồ sơ người thuê còn liên kết của chính tài khoản. Thông báo dùng chung adapter `features/notifications`.
 * `POST /tenants/:tenantId/link-requests` CHỦ ĐỘNG KHÔNG có ở đây (chủ sản phẩm hoãn): liên kết chỉ bằng mã mời.
 */
export interface TenantPortalApi {
  acceptInvitation(input: AcceptInvitationInput): Promise<TenantUserLinkResponse>;
  linkRequests(q: PageQuery & { status?: TenantLinkRequestStatus }): Promise<TenantLinkRequestPageResponse>;
  linkedTenants(): Promise<TenantSelfResponse[]>;

  contracts(q: PageQuery & { status?: ContractStatus }): Promise<ContractPageResponse>;
  contract(contractId: string): Promise<ContractResponse>;
  deposit(contractId: string, q: PageQuery): Promise<DepositPageResponse>;

  invoices(q: PageQuery & { period?: string }): Promise<InvoicePageResponse>;
  invoice(invoiceId: string): Promise<InvoiceResponse>;
  adjustments(invoiceId: string, q: PageQuery): Promise<InvoiceAdjustmentPageResponse>;
  payments(invoiceId: string, q: PageQuery): Promise<InvoicePaymentPageResponse>;

  createMaintenance(input: CreateTenantMaintenanceRequest): Promise<MaintenanceRequestResponse>;
  maintenance(q: PageQuery & { status?: MaintenanceStatus }): Promise<MaintenanceRequestPageResponse>;
  maintenanceRequest(requestId: string): Promise<MaintenanceRequestResponse>;
  cancelMaintenance(requestId: string, input: CancelMaintenanceRequest): Promise<MaintenanceRequestResponse>;
}

export const tenantPortalHttp: TenantPortalApi = {
  acceptInvitation: (input) => httpClient.post('/tenant-invitations/accept', { token: input.token }),
  linkRequests: (q) => httpClient.get('/tenant-link-requests/me', { query: { status: q.status, page: q.page, limit: q.limit } }),
  linkedTenants: () => httpClient.get('/tenants/me'),

  contracts: (q) => httpClient.get('/contracts/me', { query: { status: q.status, page: q.page, limit: q.limit } }),
  contract: (id) => httpClient.get(`/contracts/me/${id}`),
  deposit: (id, q) => httpClient.get(`/contracts/me/${id}/deposit`, { query: { page: q.page, limit: q.limit } }),

  invoices: (q) => httpClient.get('/invoices/me', { query: { period: q.period, page: q.page, limit: q.limit } }),
  invoice: (id) => httpClient.get(`/invoices/me/${id}`),
  adjustments: (id, q) => httpClient.get(`/invoices/me/${id}/adjustments`, { query: { page: q.page, limit: q.limit } }),
  payments: (id, q) => httpClient.get(`/invoices/me/${id}/payments`, { query: { page: q.page, limit: q.limit } }),

  createMaintenance: (input) => httpClient.post('/maintenance-requests/me', input),
  maintenance: (q) => httpClient.get('/maintenance-requests/me', { query: { status: q.status, page: q.page, limit: q.limit } }),
  maintenanceRequest: (id) => httpClient.get(`/maintenance-requests/me/${id}`),
  cancelMaintenance: (id, input) => httpClient.post(`/maintenance-requests/me/${id}/cancel`, input),
};

export const tenantPortalApi: TenantPortalApi = env.useMockApi ? tenantPortalMock : tenantPortalHttp;
