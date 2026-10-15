import { z } from 'zod';
import {
  MAINTENANCE_PRIORITIES,
  type CancelMaintenanceRequest,
  type ContractResponse,
  type CreateTenantMaintenanceRequest,
  type MaintenancePriority,
  type MaintenanceRequestResponse,
  type TenantLinkRequestStatus,
} from '@rental/shared';
import type { BadgeTone } from '@/components/ui';
import { toApiError } from '@/services/http/ApiError';

export const PAGE_SIZE = 20;

export const LINK_REQUEST_STATUS: Record<TenantLinkRequestStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: 'Chờ chủ trọ duyệt', tone: 'warning' },
  APPROVED: { label: 'Đã duyệt', tone: 'success' },
  REJECTED: { label: 'Bị từ chối', tone: 'danger' },
};

/** Mã mời đúng định dạng backend: 43 ký tự base64url. */
export const INVITATION_TOKEN = /^[A-Za-z0-9_-]{43}$/;
export const invitationSchema = z.object({
  token: z
    .string()
    .trim()
    .min(1, 'Nhập mã mời')
    .regex(INVITATION_TOKEN, 'Mã mời gồm đúng 43 ký tự chữ, số, “-” hoặc “_”'),
});
export type InvitationForm = z.input<typeof invitationSchema>;

/**
 * Backend chỉ nhận yêu cầu bảo trì cho hợp đồng ACTIVE đã đến ngày bắt đầu (hợp đồng chưa có hiệu lực bị từ chối
 * với MAINTENANCE_NOT_ELIGIBLE). Pha được suy ra từ ngày ở backend nên FE chỉ đọc `phase`, không tự so ngày.
 */
export const canRequestMaintenance = (c: Pick<ContractResponse, 'status' | 'phase'>) => c.status === 'ACTIVE' && c.phase !== 'UPCOMING';
/** Chỉ hủy được khi còn OPEN; việc đã có người nhận xử lý do backend quyết định (409 MAINTENANCE_NOT_CANCELLABLE). */
export const canCancelMaintenance = (r: Pick<MaintenanceRequestResponse, 'status'>) => r.status === 'OPEN';

const title = z.string().trim().min(1, 'Nhập tiêu đề').max(150, 'Tiêu đề tối đa 150 ký tự');
const description = z.string().trim().min(1, 'Nhập mô tả').max(5000, 'Mô tả tối đa 5000 ký tự');
export const createMaintenanceSchema = z.object({
  contractId: z.string().min(1, 'Chọn hợp đồng'),
  title,
  description,
  priority: z.enum(['', ...MAINTENANCE_PRIORITIES]),
});
export type CreateMaintenanceForm = z.input<typeof createMaintenanceSchema>;

/** Ưu tiên chỉ gửi khi người thuê chọn; phòng lấy từ hợp đồng ở backend nên không gửi roomId. */
export function toCreateMaintenanceBody(v: CreateMaintenanceForm): CreateTenantMaintenanceRequest {
  const body: CreateTenantMaintenanceRequest = { contractId: v.contractId, title: v.title.trim(), description: v.description.trim() };
  if (v.priority) body.priority = v.priority as MaintenancePriority;
  return body;
}

export const cancelSchema = z.object({ reason: z.string().trim().max(500, 'Lý do tối đa 500 ký tự') });
export type CancelForm = z.input<typeof cancelSchema>;
/** `reason` là tùy chọn: bỏ qua khi để trống. */
export function toCancelBody(v: CancelForm): CancelMaintenanceRequest {
  const reason = v.reason.trim();
  return reason ? { reason } : {};
}

const MESSAGES: Record<string, string> = {
  TENANT_INVITATION_INVALID: 'Mã mời không hợp lệ, đã hết hạn hoặc đã được sử dụng. Hãy xin chủ trọ một mã mời mới.',
  TENANT_INVITATION_CONFLICT: 'Không thể dùng mã mời này: hồ sơ này đã có tài khoản liên kết, hoặc tài khoản của bạn đã liên kết một hồ sơ khác trong cùng workspace.',
  VALIDATION_ERROR: 'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại.',
  CONTRACT_NOT_FOUND: 'Không tìm thấy hợp đồng, hoặc hợp đồng không thuộc hồ sơ bạn đang liên kết.',
  INVOICE_NOT_FOUND: 'Không tìm thấy hóa đơn, hoặc hóa đơn không thuộc hồ sơ bạn đang liên kết.',
  MAINTENANCE_NOT_FOUND: 'Không tìm thấy yêu cầu bảo trì, hoặc yêu cầu không thuộc hồ sơ bạn đang liên kết.',
  MAINTENANCE_NOT_ELIGIBLE: 'Chỉ gửi được yêu cầu bảo trì cho hợp đồng đang hiệu lực và đã đến ngày bắt đầu thuê.',
  MAINTENANCE_NOT_CANCELLABLE: 'Yêu cầu đã được chủ trọ tiếp nhận xử lý nên không hủy được nữa.',
  WORKSPACE_ARCHIVED: 'Workspace đã lưu trữ nên chỉ xem được, không gửi hay hủy yêu cầu.',
  WORKSPACE_NOT_FOUND: 'Không tìm thấy workspace.',
};

export function tenantErrorMessage(error: unknown): string {
  const e = toApiError(error);
  if (e.isUnauthorized) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  return (e.code && MESSAGES[e.code]) || e.message;
}
