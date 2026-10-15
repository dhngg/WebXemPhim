import type { BadgeTone } from '@/components/ui';
import { toApiError } from '@/services/http/ApiError';
import type { BuildingStatus, RoomStatus } from './types';

export const ROOM_STATUS: Record<RoomStatus, { label: string; tone: BadgeTone }> = {
  VACANT: { label: 'Trống', tone: 'primary' },
  OCCUPIED: { label: 'Đang thuê', tone: 'success' },
  UNAVAILABLE: { label: 'Tạm ngưng cho thuê', tone: 'warning' },
  ARCHIVED: { label: 'Đã lưu trữ', tone: 'neutral' },
};

export const BUILDING_STATUS: Record<BuildingStatus, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: 'Đang hoạt động', tone: 'success' },
  ARCHIVED: { label: 'Đã lưu trữ', tone: 'neutral' },
};

/** Thông báo cho các lỗi nghiệp vụ tài sản mà backend trả về (mã ổn định). */
export const PROPERTY_ERROR_MESSAGES: Record<string, string> = {
  BUILDING_NOT_FOUND: 'Không tìm thấy tòa nhà.',
  BUILDING_ARCHIVED: 'Tòa nhà đã lưu trữ nên không thể chỉnh sửa. Hãy khôi phục trước.',
  ROOM_NOT_FOUND: 'Không tìm thấy phòng.',
  ROOM_ARCHIVED: 'Phòng đã lưu trữ nên không thể chỉnh sửa. Hãy khôi phục trước.',
  ROOM_CODE_CONFLICT: 'Mã phòng đã tồn tại trong tòa nhà này.',
  AMENITY_NOT_FOUND: 'Không tìm thấy tiện ích.',
  AMENITY_ALREADY_EXISTS: 'Tiện ích này đã có trong workspace.',
  ROOM_IMAGE_NOT_FOUND: 'Không tìm thấy ảnh.',
  ROOM_IMAGE_ORDER_INVALID: 'Thứ tự ảnh không hợp lệ, hãy tải lại trang rồi thử lại.',
  WORKSPACE_ARCHIVED: 'Workspace đã lưu trữ nên không thể thay đổi dữ liệu.',
};

/** Thông báo tiếng Việt cho lỗi tài sản: ưu tiên mã nghiệp vụ, rồi thông báo chung của ApiError. */
export function propertyErrorMessage(error: unknown): string {
  const e = toApiError(error);
  return (e.code && PROPERTY_ERROR_MESSAGES[e.code]) || e.message;
}
