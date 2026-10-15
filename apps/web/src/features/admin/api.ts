import type {
  AdminAuditLogPageResponse,
  AdminListingPageResponse,
  AdminListingResponse,
  AdminReasonRequest,
  AdminUserDetailResponse,
  AdminUserPageResponse,
  AdminUserResponse,
  LandlordApplicationResponse,
  LandlordApplicationStatus,
} from '@rental/shared';
import { env } from '@/lib/env';
import { httpClient } from '@/services/http/httpClient';
import { adminMock } from '@/mocks/handlers/admin.mock';

export interface PageQuery {
  page: number;
  limit: number;
}

/**
 * Đơn đăng ký chủ trọ phía Platform Admin: backend trả thêm người nộp. Chưa có kiểu dùng chung cho trang này,
 * nên định nghĩa tại đây theo đúng response của `GET /admin/landlord-applications`.
 */
export interface AdminLandlordApplication extends LandlordApplicationResponse {
  user: { id: string; email: string; displayName: string | null };
}
export interface AdminLandlordApplicationPage {
  items: AdminLandlordApplication[];
  page: number;
  limit: number;
  total: number;
}

export type AdminUserStatus = AdminUserResponse['status'];
export interface AdminUserQuery extends PageQuery {
  status?: AdminUserStatus;
  /** Một đoạn email (không phân biệt hoa thường). */
  search?: string;
}
export interface AdminListingQuery extends PageQuery {
  hidden?: boolean;
  published?: boolean;
  workspaceId?: string;
}
/** Backend chỉ nhận lọc đối tượng USER hoặc LISTING (đơn chủ trọ có ghi nhật ký nhưng không lọc theo loại đó được). */
export type AdminAuditTargetType = 'USER' | 'LISTING';
export interface AdminAuditQuery extends PageQuery {
  actorUserId?: string;
  action?: string;
  targetType?: AdminAuditTargetType;
  targetId?: string;
  /** ISO 8601, bao gồm. */
  from?: string;
  /** ISO 8601, KHÔNG bao gồm. */
  to?: string;
}

/**
 * Platform Admin V1: đúng 11 endpoint `/admin/*`. Không có tổng quan, quản trị workspace, báo cáo tin đăng hay cấp quyền
 * Platform Admin (backend không có). Mọi thao tác ghi dùng POST riêng cho từng hành động và bắt buộc `{ reason }`.
 */
export interface AdminApi {
  applications(q: PageQuery & { status?: LandlordApplicationStatus }): Promise<AdminLandlordApplicationPage>;
  approveApplication(id: string, body: AdminReasonRequest): Promise<LandlordApplicationResponse>;
  rejectApplication(id: string, body: AdminReasonRequest): Promise<LandlordApplicationResponse>;

  users(q: AdminUserQuery): Promise<AdminUserPageResponse>;
  user(id: string): Promise<AdminUserDetailResponse>;
  lockUser(id: string, body: AdminReasonRequest): Promise<AdminUserResponse>;
  unlockUser(id: string, body: AdminReasonRequest): Promise<AdminUserResponse>;

  listings(q: AdminListingQuery): Promise<AdminListingPageResponse>;
  hideListing(id: string, body: AdminReasonRequest): Promise<AdminListingResponse>;
  restoreListing(id: string, body: AdminReasonRequest): Promise<AdminListingResponse>;

  auditLogs(q: AdminAuditQuery): Promise<AdminAuditLogPageResponse>;
}

export const adminHttp: AdminApi = {
  applications: (q) => httpClient.get('/admin/landlord-applications', { query: { status: q.status, page: q.page, limit: q.limit } }),
  approveApplication: (id, body) => httpClient.post(`/admin/landlord-applications/${id}/approve`, body),
  rejectApplication: (id, body) => httpClient.post(`/admin/landlord-applications/${id}/reject`, body),

  users: (q) => httpClient.get('/admin/users', { query: { status: q.status, search: q.search, page: q.page, limit: q.limit } }),
  user: (id) => httpClient.get(`/admin/users/${id}`),
  lockUser: (id, body) => httpClient.post(`/admin/users/${id}/lock`, body),
  unlockUser: (id, body) => httpClient.post(`/admin/users/${id}/unlock`, body),

  listings: (q) => httpClient.get('/admin/listings', { query: { hidden: q.hidden, published: q.published, workspaceId: q.workspaceId, page: q.page, limit: q.limit } }),
  hideListing: (id, body) => httpClient.post(`/admin/listings/${id}/hide`, body),
  restoreListing: (id, body) => httpClient.post(`/admin/listings/${id}/restore`, body),

  auditLogs: (q) =>
    httpClient.get('/admin/audit-logs', {
      query: { actorUserId: q.actorUserId, action: q.action, targetType: q.targetType, targetId: q.targetId, from: q.from, to: q.to, page: q.page, limit: q.limit },
    }),
};

export const adminApi: AdminApi = env.useMockApi ? adminMock : adminHttp;
