import { env } from '@/lib/env';
import { httpClient } from '@/services/http/httpClient';
import { leasingMock } from '@/mocks/handlers/leasing.mock';
import type { Contract, ContractInput, ContractStatus, Tenant, TenantInput, Vehicle, VehicleInput, AccountLinkStatus } from './types';

export interface TenantFilters {
  q?: string;
  linkStatus?: AccountLinkStatus;
}

export interface ContractFilters {
  q?: string;
  status?: ContractStatus;
  roomId?: string;
  tenantId?: string;
}

export interface LeasingApi {
  listTenants(ws: string, f: TenantFilters): Promise<Tenant[]>;
  getTenant(ws: string, id: string): Promise<Tenant>;
  createTenant(ws: string, input: TenantInput): Promise<Tenant>;
  updateTenant(ws: string, id: string, input: TenantInput): Promise<Tenant>;
  /** Chủ trọ duyệt/từ chối yêu cầu liên kết tài khoản (đã xác minh phía backend). */
  reviewLinkRequest(ws: string, tenantId: string, approve: boolean): Promise<Tenant>;

  listContracts(ws: string, f: ContractFilters): Promise<Contract[]>;
  getContract(ws: string, id: string): Promise<Contract>;
  createContract(ws: string, input: ContractInput): Promise<Contract>;
  updateContract(ws: string, id: string, input: ContractInput): Promise<Contract>;
  activateContract(ws: string, id: string): Promise<Contract>;
  terminateContract(ws: string, id: string, endDate: string, reason: string): Promise<Contract>;

  listVehicles(ws: string, q?: string): Promise<Vehicle[]>;
  saveVehicle(ws: string, input: VehicleInput, id?: string): Promise<Vehicle>;
  deleteVehicle(ws: string, id: string): Promise<void>;
}

const p = (ws: string) => `/workspaces/${encodeURIComponent(ws)}`;

/** Endpoint DỰ KIẾN — chưa chốt. */
const leasingHttp: LeasingApi = {
  listTenants: (ws, f) => httpClient.get(`${p(ws)}/tenants`, { query: { ...f } }),
  getTenant: (ws, id) => httpClient.get(`${p(ws)}/tenants/${id}`),
  createTenant: (ws, input) => httpClient.post(`${p(ws)}/tenants`, input),
  updateTenant: (ws, id, input) => httpClient.patch(`${p(ws)}/tenants/${id}`, input),
  reviewLinkRequest: (ws, id, approve) => httpClient.post(`${p(ws)}/tenants/${id}/link-request/${approve ? 'approve' : 'reject'}`),
  listContracts: (ws, f) => httpClient.get(`${p(ws)}/contracts`, { query: { ...f } }),
  getContract: (ws, id) => httpClient.get(`${p(ws)}/contracts/${id}`),
  createContract: (ws, input) => httpClient.post(`${p(ws)}/contracts`, input),
  updateContract: (ws, id, input) => httpClient.patch(`${p(ws)}/contracts/${id}`, input),
  activateContract: (ws, id) => httpClient.post(`${p(ws)}/contracts/${id}/activate`),
  terminateContract: (ws, id, endDate, reason) => httpClient.post(`${p(ws)}/contracts/${id}/terminate`, { endDate, reason }),
  listVehicles: (ws, q) => httpClient.get(`${p(ws)}/vehicles`, { query: { q } }),
  saveVehicle: (ws, input, id) => (id ? httpClient.patch(`${p(ws)}/vehicles/${id}`, input) : httpClient.post(`${p(ws)}/vehicles`, input)),
  deleteVehicle: (ws, id) => httpClient.delete(`${p(ws)}/vehicles/${id}`),
};

export const leasingApi: LeasingApi = env.useMockApi ? leasingMock : leasingHttp;
