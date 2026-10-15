import { z } from 'zod';
import {
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_TRANSITIONS,
  type CreateMaintenanceRequestRequest,
  type MaintenancePriority,
  type MaintenanceRequestResponse,
  type MaintenanceStatus,
  type UpdateMaintenanceRequestRequest,
} from '@rental/shared';
import type { BadgeTone } from '@/components/ui';
import { toApiError } from '@/services/http/ApiError';

export const STATUS_LABEL: Record<MaintenanceStatus, { label: string; tone: BadgeTone }> = {
  OPEN: { label: 'Mới tiếp nhận', tone: 'warning' },
  IN_PROGRESS: { label: 'Đang xử lý', tone: 'primary' },
  RESOLVED: { label: 'Đã xử lý', tone: 'success' },
  CLOSED: { label: 'Đã đóng', tone: 'neutral' },
  CANCELLED: { label: 'Đã hủy', tone: 'neutral' },
};
export const PRIORITY_LABEL: Record<MaintenancePriority, { label: string; tone: BadgeTone }> = {
  URGENT: { label: 'Khẩn cấp', tone: 'danger' },
  HIGH: { label: 'Cao', tone: 'warning' },
  MEDIUM: { label: 'Trung bình', tone: 'info' },
  LOW: { label: 'Thấp', tone: 'neutral' },
};

/** Bước kế tiếp DUY NHẤT hợp lệ (không nhảy cóc, không mở lại); trạng thái cuối không có bước nào. */
export const nextStatus = (s: MaintenanceStatus): MaintenanceStatus | undefined => MAINTENANCE_TRANSITIONS[s][0];
export const TRANSITION_ACTION: Partial<Record<MaintenanceStatus, string>> = {
  IN_PROGRESS: 'Bắt đầu xử lý',
  RESOLVED: 'Đánh dấu đã xử lý',
  CLOSED: 'Đóng yêu cầu',
};
/** Ghi chú xử lý bắt buộc khi chuyển sang RESOLVED (backend dùng làm resolutionNote). */
export const noteRequired = (to: MaintenanceStatus) => to === 'RESOLVED';
/** Backend chỉ cho sửa nội dung khi chưa CLOSED/CANCELLED. */
export const canEdit = (r: Pick<MaintenanceRequestResponse, 'status'>) => r.status !== 'CLOSED' && r.status !== 'CANCELLED';

const title = z.string().trim().min(1, 'Nhập tiêu đề').max(150, 'Tiêu đề tối đa 150 ký tự');
const description = z.string().trim().min(1, 'Nhập mô tả').max(5000, 'Mô tả tối đa 5000 ký tự');
const priority = z.enum(['', ...MAINTENANCE_PRIORITIES]);

export const createSchema = z.object({ roomId: z.string().min(1, 'Chọn phòng'), title, description, priority });
export type CreateForm = z.input<typeof createSchema>;
export const editSchema = z.object({ title, description, priority });
export type EditForm = z.input<typeof editSchema>;
export const transitionSchema = (to: MaintenanceStatus) =>
  z.object({
    note: noteRequired(to)
      ? z.string().trim().min(1, 'Nhập ghi chú xử lý').max(1000, 'Ghi chú tối đa 1000 ký tự')
      : z.string().trim().max(1000, 'Ghi chú tối đa 1000 ký tự'),
  });
export type TransitionForm = { note: string };

/** Tạo: ưu tiên chỉ gửi khi người dùng chọn; hợp đồng do backend tự gắn (hợp đồng đang hiệu lực của phòng). */
export function toCreateBody(v: CreateForm): CreateMaintenanceRequestRequest {
  const body: CreateMaintenanceRequestRequest = { roomId: v.roomId, title: v.title.trim(), description: v.description.trim() };
  if (v.priority) body.priority = v.priority as MaintenancePriority;
  return body;
}
/** Sửa: chỉ title/description/priority và chỉ trường đổi; không bao giờ gửi status. */
export function diffEdit(current: MaintenanceRequestResponse, v: EditForm): UpdateMaintenanceRequestRequest {
  const body: UpdateMaintenanceRequestRequest = {};
  if (v.title.trim() !== current.title) body.title = v.title.trim();
  if (v.description.trim() !== current.description) body.description = v.description.trim();
  if (v.priority && v.priority !== current.priority) body.priority = v.priority as MaintenancePriority;
  return body;
}

const MESSAGES: Record<string, string> = {
  MAINTENANCE_NOT_FOUND: 'Không tìm thấy yêu cầu bảo trì.',
  MAINTENANCE_INVALID_TRANSITION: 'Chuyển trạng thái không hợp lệ: chỉ đi tuần tự Mới → Đang xử lý → Đã xử lý → Đã đóng, không nhảy cóc hay mở lại.',
  MAINTENANCE_NOT_EDITABLE: 'Yêu cầu đã đóng nên không sửa được.',
  MAINTENANCE_NOT_ELIGIBLE: 'Phòng hoặc tòa nhà đã lưu trữ nên không thay đổi được yêu cầu bảo trì.',
  VALIDATION_ERROR: 'Dữ liệu chưa hợp lệ (chuyển sang “Đã xử lý” cần ghi chú xử lý).',
  ROOM_NOT_FOUND: 'Không tìm thấy phòng trong tòa nhà này.',
  BUILDING_NOT_FOUND: 'Không tìm thấy tòa nhà.',
  WORKSPACE_ARCHIVED: 'Workspace đã lưu trữ nên chỉ xem được, không ghi thêm dữ liệu.',
  WORKSPACE_NOT_FOUND: 'Bạn không có quyền với workspace này.',
};
export function maintenanceErrorMessage(error: unknown): string {
  const e = toApiError(error);
  if (e.isUnauthorized) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  return (e.code && MESSAGES[e.code]) || e.message;
}
