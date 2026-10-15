import type { DecideViewingRequestRequest, ViewingRequestPageResponse, ViewingRequestResponse, ViewingRequestStatus } from '@rental/shared';
import { env } from '@/lib/env';
import { httpClient } from '@/services/http/httpClient';
import { viewingsOwnerMock } from '@/mocks/handlers/viewing-requests.mock';

export interface OwnerViewingQuery {
  status?: ViewingRequestStatus;
  page: number;
  limit: number;
}

/**
 * Yêu cầu xem phòng phía OWNER: đúng 3 endpoint `/workspaces/:ws/viewing-requests`.
 * OWNER chỉ xác nhận hoặc từ chối yêu cầu đang PENDING (kèm ghi chú tùy chọn); hủy là việc của người xem.
 */
export interface ViewingsOwnerApi {
  list(ws: string, q: OwnerViewingQuery): Promise<ViewingRequestPageResponse>;
  confirm(ws: string, requestId: string, body: DecideViewingRequestRequest): Promise<ViewingRequestResponse>;
  reject(ws: string, requestId: string, body: DecideViewingRequestRequest): Promise<ViewingRequestResponse>;
}

const base = (ws: string) => `/workspaces/${encodeURIComponent(ws)}/viewing-requests`;

export const viewingsOwnerHttp: ViewingsOwnerApi = {
  list: (ws, q) => httpClient.get(base(ws), { query: { status: q.status, page: q.page, limit: q.limit } }),
  confirm: (ws, id, body) => httpClient.patch(`${base(ws)}/${encodeURIComponent(id)}/confirm`, body),
  reject: (ws, id, body) => httpClient.patch(`${base(ws)}/${encodeURIComponent(id)}/reject`, body),
};

export const viewingsOwnerApi: ViewingsOwnerApi = env.useMockApi ? viewingsOwnerMock : viewingsOwnerHttp;
