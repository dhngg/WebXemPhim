import type {
  CreateMaintenanceRequestRequest,
  MaintenancePriority,
  MaintenanceRequestPageResponse,
  MaintenanceRequestResponse,
  MaintenanceStatus,
  TransitionMaintenanceRequest,
  UpdateMaintenanceRequestRequest,
} from '@rental/shared';
import { env } from '@/lib/env';
import { httpClient } from '@/services/http/httpClient';
import { maintenanceOwnerMock } from '@/mocks/handlers/maintenance-requests.mock';

export interface MaintenanceFilters {
  status?: MaintenanceStatus;
  priority?: MaintenancePriority;
  roomId?: string;
}
export interface PageQuery {
  page: number;
  limit: number;
}

/**
 * 5 endpoint OWNER của yêu cầu bảo trì, luôn dưới workspace → tòa nhà. Dùng thẳng DTO dùng chung.
 * Không có giao người phụ trách, bình luận hay ảnh: V1 do chủ trọ tự xử lý (filter assigneeUserId của backend cũng không dùng).
 */
export interface MaintenanceOwnerApi {
  list(ws: string, buildingId: string, filters: MaintenanceFilters, page: PageQuery): Promise<MaintenanceRequestPageResponse>;
  create(ws: string, buildingId: string, input: CreateMaintenanceRequestRequest): Promise<MaintenanceRequestResponse>;
  get(ws: string, buildingId: string, requestId: string): Promise<MaintenanceRequestResponse>;
  update(ws: string, buildingId: string, requestId: string, patch: UpdateMaintenanceRequestRequest): Promise<MaintenanceRequestResponse>;
  transition(ws: string, buildingId: string, requestId: string, input: TransitionMaintenanceRequest): Promise<MaintenanceRequestResponse>;
}

const enc = encodeURIComponent;
const mp = (ws: string, b: string) => `/workspaces/${enc(ws)}/buildings/${enc(b)}/maintenance-requests`;

export const maintenanceOwnerHttp: MaintenanceOwnerApi = {
  list: (ws, b, f, page) => httpClient.get(mp(ws, b), { query: { status: f.status, priority: f.priority, roomId: f.roomId, page: page.page, limit: page.limit } }),
  create: (ws, b, input) => httpClient.post(mp(ws, b), input),
  get: (ws, b, id) => httpClient.get(`${mp(ws, b)}/${enc(id)}`),
  update: (ws, b, id, patch) => httpClient.patch(`${mp(ws, b)}/${enc(id)}`, patch),
  transition: (ws, b, id, input) => httpClient.post(`${mp(ws, b)}/${enc(id)}/transition`, input),
};

export const maintenanceOwnerApi: MaintenanceOwnerApi = env.useMockApi ? maintenanceOwnerMock : maintenanceOwnerHttp;
