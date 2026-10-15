import type { BadgeTone } from '@/components/ui';
import { toApiError } from '@/services/http/ApiError';
import type { ContractPhase, ContractStatus, TenantStatus, VehicleStatus } from './types';

export const TENANT_STATUS: Record<TenantStatus, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: 'Đang hoạt động', tone: 'success' },
  ARCHIVED: { label: 'Đã lưu trữ', tone: 'neutral' },
};

export const CONTRACT_STATUS_V1: Record<ContractStatus, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: 'Đang hiệu lực', tone: 'success' },
  ENDED: { label: 'Đã kết thúc', tone: 'info' },
};

/** Hiệu lực suy ra từ ngày (giờ Việt Nam); trạng thái lưu ở backend chỉ ACTIVE/ENDED. */
export const CONTRACT_PHASE: Record<ContractPhase, { label: string; tone: BadgeTone }> = {
  UPCOMING: { label: 'Chưa có hiệu lực', tone: 'info' },
  IN_EFFECT: { label: 'Đang hiệu lực', tone: 'success' },
  OVERDUE: { label: 'Quá hạn – chưa kết thúc', tone: 'warning' },
  ENDED: { label: 'Đã kết thúc', tone: 'neutral' },
  CANCELLED: { label: 'Đã hủy trước ngày bắt đầu', tone: 'neutral' },
};

export const VEHICLE_STATUS: Record<VehicleStatus, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: 'Đang sử dụng', tone: 'success' },
  INACTIVE: { label: 'Đã ngừng', tone: 'neutral' },
};

/** Danh mục loại xe chưa được chốt ở backend (chuỗi mở): chỉ gợi ý, giá trị lạ hiển thị nguyên văn. */
export const VEHICLE_TYPE_OPTIONS: Record<string, string> = {
  MOTORBIKE: 'Xe máy',
  EBIKE: 'Xe điện',
  BICYCLE: 'Xe đạp',
  CAR: 'Ô tô',
};
export const vehicleTypeLabel = (type: string) => VEHICLE_TYPE_OPTIONS[type] ?? type;

const MESSAGES: Record<string, string> = {
  TENANT_NOT_FOUND: 'Không tìm thấy hồ sơ người thuê.',
  TENANT_ARCHIVED: 'Hồ sơ người thuê đã lưu trữ nên không thể thay đổi. Hãy khôi phục trước.',
  TENANT_HAS_ACTIVE_CONTRACT: 'Người thuê còn hợp đồng chưa kết thúc (kể cả hợp đồng chưa bắt đầu) nên chưa thể lưu trữ.',
  TENANT_LINK_REQUEST_NOT_FOUND: 'Không tìm thấy yêu cầu liên kết.',
  TENANT_LINK_REQUEST_CONFLICT: 'Hồ sơ này đã có yêu cầu hoặc liên kết tài khoản khác.',
  TENANT_LINK_REQUEST_INVALID_TRANSITION: 'Yêu cầu liên kết đã được xử lý trước đó.',
  CONTRACT_NOT_FOUND: 'Không tìm thấy hợp đồng.',
  CONTRACT_CONFLICT: 'Phòng này đã có hợp đồng khác trùng thời gian thuê (ngày bắt đầu và kết thúc đều tính bao gồm).',
  CONTRACT_INVALID_TRANSITION: 'Chỉ hợp đồng chưa kết thúc mới sửa, kết thúc hoặc hủy được.',
  CONTRACT_NOT_ELIGIBLE:
    'Không thực hiện được: ngày kết thúc không được ở quá khứ và không được trước ngày bắt đầu; phòng không được ở trạng thái Không khả dụng; hợp đồng đã bắt đầu không dời được về tương lai; hợp đồng chưa bắt đầu chỉ hủy được (không đặt ngày kết thúc); ngày kết thúc thực tế phải từ ngày bắt đầu đến hôm nay.',
  VEHICLE_NOT_FOUND: 'Không tìm thấy phương tiện.',
  VEHICLE_ALREADY_EXISTS: 'Biển số này đã được đăng ký trong workspace (kể cả xe đã ngừng).',
  VEHICLE_INACTIVE: 'Phương tiện đã ngừng sử dụng nên không thể sửa.',
  VEHICLE_NOT_ELIGIBLE: 'Người thuê đã lưu trữ hoặc không hợp lệ cho phương tiện này.',
  ROOM_NOT_FOUND: 'Không tìm thấy phòng.',
  WORKSPACE_ARCHIVED: 'Workspace đã lưu trữ nên chỉ xem được, không ghi thêm dữ liệu.',
  WORKSPACE_NOT_FOUND: 'Bạn không có quyền với workspace này.',
};

export function tenancyErrorMessage(error: unknown): string {
  const e = toApiError(error);
  if (e.isUnauthorized) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  return (e.code && MESSAGES[e.code]) || e.message;
}
