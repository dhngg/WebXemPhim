import { z } from 'zod';
import { LANDLORD_APPLICATION_STATUSES, type AdminReasonRequest, type LandlordApplicationStatus } from '@rental/shared';
import type { BadgeTone } from '@/components/ui';
import { toApiError } from '@/services/http/ApiError';
import type { AdminAuditTargetType, AdminLandlordApplication, AdminUserStatus } from './api';

export const PAGE_SIZE = 20;
/** Backend giới hạn 1–100 mỗi trang. */
export const MAX_LIMIT = 100;

export const APPLICATION_STATUS: Record<LandlordApplicationStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: 'Chờ duyệt', tone: 'warning' },
  APPROVED: { label: 'Đã duyệt', tone: 'success' },
  REJECTED: { label: 'Đã từ chối', tone: 'danger' },
};
export const isApplicationStatus = (v: string): v is LandlordApplicationStatus => (LANDLORD_APPLICATION_STATUSES as readonly string[]).includes(v);

export const USER_STATUS: Record<AdminUserStatus, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: 'Hoạt động', tone: 'success' },
  DISABLED: { label: 'Đã khóa', tone: 'danger' },
};
export const isUserStatus = (v: string): v is AdminUserStatus => v === 'ACTIVE' || v === 'DISABLED';

/** Ẩn/khôi phục chỉ đổi kiểm duyệt; không đổi trạng thái đăng (`isPublished`) của chủ trọ. */
export const MODERATION_STATE: Record<'visible' | 'hidden', { label: string; tone: BadgeTone }> = {
  visible: { label: 'Đang hiển thị', tone: 'success' },
  hidden: { label: 'Đã ẩn', tone: 'danger' },
};

/** Sự kiện backend đang ghi. Giá trị lạ vẫn hiển thị nguyên văn. */
export const AUDIT_ACTION: Record<string, string> = {
  USER_LOCK: 'Khóa tài khoản',
  USER_UNLOCK: 'Mở khóa tài khoản',
  LISTING_HIDE: 'Ẩn tin đăng',
  LISTING_RESTORE: 'Khôi phục tin đăng',
  LANDLORD_APPLICATION_APPROVED: 'Duyệt đơn chủ trọ',
  LANDLORD_APPLICATION_REJECTED: 'Từ chối đơn chủ trọ',
};
export const auditActionLabel = (action: string) => AUDIT_ACTION[action] ?? action;

export const AUDIT_TARGET: Record<string, string> = { USER: 'Người dùng', LISTING: 'Tin đăng', LANDLORD_APPLICATION: 'Đơn chủ trọ' };
export const auditTargetLabel = (type: string) => AUDIT_TARGET[type] ?? type;
/** Chỉ hai loại này lọc được ở backend. */
export const FILTERABLE_TARGETS: AdminAuditTargetType[] = ['USER', 'LISTING'];
export const isFilterableTarget = (v: string): v is AdminAuditTargetType => (FILTERABLE_TARGETS as string[]).includes(v);

export const reasonSchema = z.object({ reason: z.string().trim().min(1, 'Nhập lý do').max(500, 'Lý do tối đa 500 ký tự') });
export type ReasonForm = z.input<typeof reasonSchema>;
/** Đúng thân backend yêu cầu: `{ reason }` (không phải `note`). */
export const toReasonBody = (v: ReasonForm): AdminReasonRequest => ({ reason: v.reason.trim() });

/** Chỉ đơn đang chờ mới duyệt/từ chối được; backend cũng từ chối đơn của chính quản trị viên. */
export const canDecide = (a: Pick<AdminLandlordApplication, 'status'>) => a.status === 'PENDING';
export const isOwnApplication = (a: Pick<AdminLandlordApplication, 'user'>, meId: string | undefined) => Boolean(meId) && a.user.id === meId;

const DAY = 86_400_000;
/**
 * Khoảng ngày (giờ Việt Nam, UTC+7) → tham số backend: `from` bao gồm, `to` KHÔNG bao gồm nên lấy đầu ngày kế tiếp
 * để “đến ngày X” gồm cả ngày X. Ngày sai định dạng bị bỏ qua.
 */
export function auditRange(from: string, to: string): { from?: string; to?: string } {
  const day = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? Date.parse(`${d}T00:00:00+07:00`) : NaN);
  const f = day(from);
  const t = day(to);
  return {
    ...(Number.isNaN(f) ? {} : { from: new Date(f).toISOString() }),
    ...(Number.isNaN(t) ? {} : { to: new Date(t + DAY).toISOString() }),
  };
}

const MESSAGES: Record<string, string> = {
  PLATFORM_ADMIN_REQUIRED: 'Chỉ Platform Admin đang hoạt động mới thao tác được.',
  ADMIN_USER_NOT_FOUND: 'Không tìm thấy người dùng.',
  ADMIN_TARGET_PROTECTED: 'Không thể khóa tài khoản này: đó là tài khoản của chính bạn hoặc một Platform Admin khác.',
  ADMIN_STATE_UNCHANGED: 'Trạng thái đã như vậy rồi nên không có gì để đổi. Danh sách sẽ được làm mới.',
  LISTING_NOT_FOUND: 'Không tìm thấy tin đăng.',
  LANDLORD_APPLICATION_NOT_FOUND: 'Không tìm thấy đơn đăng ký chủ trọ.',
  LANDLORD_APPLICATION_INVALID_TRANSITION: 'Đơn đã được xử lý, hoặc là đơn của chính bạn nên bạn không thể duyệt/từ chối.',
  VALIDATION_ERROR: 'Dữ liệu chưa hợp lệ (mã lọc phải là UUID, lý do tối đa 500 ký tự).',
};

export function adminErrorMessage(error: unknown): string {
  const e = toApiError(error);
  if (e.isUnauthorized) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  if (e.isForbidden && !e.code) return 'Bạn không có quyền Platform Admin.';
  return (e.code && MESSAGES[e.code]) || e.message;
}
