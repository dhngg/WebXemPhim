import type { BadgeTone } from '@/components/ui';
import { toApiError } from '@/services/http/ApiError';
import type { MeterType, RateBillingUnit, RatePlanStatus, RateServiceType } from './types';

export const SERVICE_TYPE: Record<RateServiceType, string> = {
  ELECTRICITY: 'Điện',
  WATER: 'Nước',
  WIFI: 'Internet / Wi-Fi',
  TRASH: 'Rác & vệ sinh',
  PARKING: 'Gửi xe',
  OTHER: 'Khác',
};

export const BILLING_UNIT: Record<RateBillingUnit, string> = {
  KWH: 'kWh',
  CUBIC_METER: 'm³',
  ROOM: 'phòng / tháng',
  PERSON: 'người / tháng',
  VEHICLE: 'xe / tháng',
  FIXED: 'cố định',
};

export const RATE_STATUS: Record<RatePlanStatus, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: 'Đang áp dụng', tone: 'success' },
  INACTIVE: { label: 'Đã ngừng', tone: 'neutral' },
};

export const METER_TYPE: Record<MeterType, { label: string; unit: string }> = {
  ELECTRICITY: { label: 'Điện', unit: 'kWh' },
  WATER: { label: 'Nước', unit: 'm³' },
};

const MESSAGES: Record<string, string> = {
  RATE_PLAN_NOT_FOUND: 'Không tìm thấy mã dịch vụ này trong tòa nhà.',
  RATE_PLAN_CONFLICT: 'Mã dịch vụ này đã có đơn giá trùng thời gian áp dụng.',
  RATE_PLAN_INACTIVE: 'Phiên bản đơn giá đã ngừng nên không đổi giá được; hãy đổi giá ở phiên bản đang áp dụng.',
  RATE_PLAN_NOT_ELIGIBLE: 'Ngày không hợp lệ (ngày áp dụng mới phải sau ngày áp dụng hiện tại; ngày ngừng phải sau ngày bắt đầu) hoặc tòa nhà đã lưu trữ.',
  ROOM_SERVICE_NOT_FOUND: 'Không tìm thấy dịch vụ của phòng.',
  ROOM_SERVICE_CONFLICT: 'Phòng đã áp dụng dịch vụ này trong khoảng thời gian trùng.',
  ROOM_SERVICE_NOT_ELIGIBLE: 'Ngày ngừng phải sau ngày bắt đầu; không áp dụng cho phòng/tòa nhà đã lưu trữ.',
  METER_READING_NOT_FOUND: 'Không tìm thấy chỉ số.',
  METER_READING_DUPLICATE: 'Kỳ này đã có chỉ số cho loại đồng hồ này.',
  METER_READING_INVALID:
    'Chỉ số không hợp lệ: chỉ số mới không nhỏ hơn số cũ; lần ghi đầu phải nhập số cũ; không ghi bù kỳ trước kỳ đã có; chỉ chỉnh được kỳ mới nhất và phải thay đổi giá trị.',
  METER_READING_NOT_ELIGIBLE: 'Phòng hoặc tòa nhà đã lưu trữ nên không ghi được chỉ số.',
  ROOM_NOT_FOUND: 'Không tìm thấy phòng.',
  BUILDING_NOT_FOUND: 'Không tìm thấy tòa nhà.',
  WORKSPACE_ARCHIVED: 'Workspace đã lưu trữ nên chỉ xem được, không ghi thêm dữ liệu.',
  WORKSPACE_NOT_FOUND: 'Bạn không có quyền với workspace này.',
};

export function utilitiesErrorMessage(error: unknown): string {
  const e = toApiError(error);
  if (e.isUnauthorized) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  return (e.code && MESSAGES[e.code]) || e.message;
}
