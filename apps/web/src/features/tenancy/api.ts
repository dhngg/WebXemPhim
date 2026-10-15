import type {
  BuildingResponse,
  ContractResponse,
  TenantAccountLinkResponse,
  TenantInvitationResponse,
  TenantLinkRequestResponse,
  TenantResponse,
  VehicleResponse,
} from '@rental/shared';
import { env } from '@/lib/env';
import { httpClient } from '@/services/http/httpClient';
import { tenancyMock } from '@/mocks/handlers/tenancy.mock';
import { toAccountLink, toContract, toContractBody, toInvitation, toLinkRequest, toTenant, toTenantBody, toVehicle, toVehicleBody } from './mappers';
import type {
  ContractInput,
  ContractPatch,
  ContractStatus,
  LinkInvitation,
  LinkRequestItem,
  LinkRequestStatus,
  ManagedVehicle,
  TenancyContract,
  TenantAccountLink,
  TenantInput,
  TenantPatch,
  TenantProfile,
  TenantStatus,
  VehicleInput,
  VehiclePatch,
  VehicleStatus,
} from './types';

export interface TenancyApi {
  listTenants(ws: string, f?: { status?: TenantStatus }): Promise<TenantProfile[]>;
  getTenant(ws: string, id: string): Promise<TenantProfile>;
  createTenant(ws: string, input: TenantInput): Promise<TenantProfile>;
  updateTenant(ws: string, id: string, patch: TenantPatch): Promise<TenantProfile>;
  archiveTenant(ws: string, id: string): Promise<TenantProfile>;
  restoreTenant(ws: string, id: string): Promise<TenantProfile>;

  listLinkRequests(ws: string, f?: { status?: LinkRequestStatus }): Promise<LinkRequestItem[]>;
  decideLinkRequest(ws: string, requestId: string, approve: boolean, note?: string): Promise<void>;

  /** Liên kết tài khoản ACTIVE của hồ sơ (tối đa 1) — cần `id` để thu hồi. */
  listActiveLinks(ws: string, tenantId: string): Promise<TenantAccountLink[]>;
  revokeLink(ws: string, linkId: string, reason?: string): Promise<void>;
  /** Tạo lời mời liên kết; token chỉ trả về một lần. */
  createInvitation(ws: string, tenantId: string): Promise<LinkInvitation>;

  listContracts(ws: string, f?: { status?: ContractStatus }): Promise<TenancyContract[]>;
  getContract(ws: string, id: string): Promise<TenancyContract>;
  createContract(ws: string, input: ContractInput): Promise<TenancyContract>;
  updateContract(ws: string, id: string, patch: ContractPatch): Promise<TenancyContract>;
  /** Hợp đồng đã bắt đầu: bắt buộc ngày kết thúc thực tế. Hợp đồng chưa bắt đầu: bỏ trống ngày → HỦY (giữ kỳ thuê đã đăng ký làm lịch sử). */
  endContract(ws: string, id: string, endDate?: string): Promise<TenancyContract>;

  listVehicles(ws: string, f?: { status?: VehicleStatus }): Promise<ManagedVehicle[]>;
  createVehicle(ws: string, input: VehicleInput): Promise<ManagedVehicle>;
  updateVehicle(ws: string, id: string, patch: VehiclePatch): Promise<ManagedVehicle>;
  stopVehicle(ws: string, id: string, reason?: string): Promise<ManagedVehicle>;
}

const p = (ws: string) => `/workspaces/${encodeURIComponent(ws)}`;
const PAGE_LIMIT = 50;
const MAX_PAGES = 20;

/** Backend phân trang (tối đa 50/trang): gom các trang để màn hình lọc/tìm kiếm trên toàn bộ dữ liệu. */
async function fetchAll<T>(path: string, query: Record<string, string | number | undefined> = {}): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const res = await httpClient.get<{ items: T[]; total: number }>(path, { query: { ...query, page, limit: PAGE_LIMIT } });
    all.push(...res.items);
    if (all.length >= res.total || res.items.length === 0) break;
  }
  return all;
}

async function buildingNames(ws: string): Promise<Map<string, string>> {
  const list = await httpClient.get<BuildingResponse[]>(`${p(ws)}/buildings`);
  return new Map(list.map((b) => [b.id, b.name]));
}

export const tenancyHttp: TenancyApi = {
  async listTenants(ws, f = {}) {
    return (await fetchAll<TenantResponse>(`${p(ws)}/tenants`, { status: f.status })).map(toTenant);
  },
  async getTenant(ws, id) {
    return toTenant(await httpClient.get<TenantResponse>(`${p(ws)}/tenants/${encodeURIComponent(id)}`));
  },
  async createTenant(ws, input) {
    return toTenant(await httpClient.post<TenantResponse>(`${p(ws)}/tenants`, toTenantBody(input)));
  },
  async updateTenant(ws, id, patch) {
    return toTenant(await httpClient.patch<TenantResponse>(`${p(ws)}/tenants/${encodeURIComponent(id)}`, patch));
  },
  async archiveTenant(ws, id) {
    return toTenant(await httpClient.patch<TenantResponse>(`${p(ws)}/tenants/${encodeURIComponent(id)}/archive`));
  },
  async restoreTenant(ws, id) {
    return toTenant(await httpClient.patch<TenantResponse>(`${p(ws)}/tenants/${encodeURIComponent(id)}/restore`));
  },

  async listLinkRequests(ws, f = {}) {
    const items = await fetchAll<TenantLinkRequestResponse>(`${p(ws)}/tenant-link-requests`, { status: f.status });
    return items.map(toLinkRequest);
  },
  async decideLinkRequest(ws, requestId, approve, note) {
    await httpClient.patch(
      `${p(ws)}/tenant-link-requests/${encodeURIComponent(requestId)}/${approve ? 'approve' : 'reject'}`,
      note ? { note } : {},
    );
  },

  async listActiveLinks(ws, tenantId) {
    const items = await httpClient.get<TenantAccountLinkResponse[]>(`${p(ws)}/tenants/${encodeURIComponent(tenantId)}/user-links`);
    return items.map(toAccountLink);
  },
  async revokeLink(ws, linkId, reason) {
    await httpClient.patch(`${p(ws)}/tenant-user-links/${encodeURIComponent(linkId)}/revoke`, reason ? { reason } : {});
  },
  async createInvitation(ws, tenantId) {
    return toInvitation(await httpClient.post<TenantInvitationResponse>(`${p(ws)}/tenants/${encodeURIComponent(tenantId)}/invitations`));
  },

  async listContracts(ws, f = {}) {
    const [items, names] = await Promise.all([fetchAll<ContractResponse>(`${p(ws)}/contracts`, { status: f.status }), buildingNames(ws)]);
    return items.map((c) => toContract(c, names));
  },
  async getContract(ws, id) {
    const dto = await httpClient.get<ContractResponse>(`${p(ws)}/contracts/${encodeURIComponent(id)}`);
    return toContract(dto, await buildingNames(ws));
  },
  async createContract(ws, input) {
    const dto = await httpClient.post<ContractResponse>(`${p(ws)}/contracts`, toContractBody(input));
    return toContract(dto, await buildingNames(ws));
  },
  async updateContract(ws, id, patch) {
    const dto = await httpClient.patch<ContractResponse>(`${p(ws)}/contracts/${encodeURIComponent(id)}`, patch);
    return toContract(dto, await buildingNames(ws));
  },
  async endContract(ws, id, endDate) {
    const dto = await httpClient.patch<ContractResponse>(`${p(ws)}/contracts/${encodeURIComponent(id)}/end`, endDate ? { endDate } : {});
    return toContract(dto, await buildingNames(ws));
  },

  async listVehicles(ws, f = {}) {
    return (await fetchAll<VehicleResponse>(`${p(ws)}/vehicles`, { status: f.status })).map(toVehicle);
  },
  async createVehicle(ws, input) {
    return toVehicle(await httpClient.post<VehicleResponse>(`${p(ws)}/vehicles`, toVehicleBody(input)));
  },
  async updateVehicle(ws, id, patch) {
    return toVehicle(await httpClient.patch<VehicleResponse>(`${p(ws)}/vehicles/${encodeURIComponent(id)}`, patch));
  },
  async stopVehicle(ws, id, reason) {
    return toVehicle(await httpClient.patch<VehicleResponse>(`${p(ws)}/vehicles/${encodeURIComponent(id)}/stop`, reason ? { reason } : {}));
  },
};

export const tenancyApi: TenancyApi = env.useMockApi ? tenancyMock : tenancyHttp;
