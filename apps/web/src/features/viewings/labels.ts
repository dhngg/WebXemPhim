import type { BadgeTone } from '@/components/ui';
import { toApiError } from '@/services/http/ApiError';
import type { ViewingStatus } from './types';

export const VIEWING_STATUS: Record<ViewingStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: 'Chờ xác nhận', tone: 'warning' },
  CONFIRMED: { label: 'Đã xác nhận', tone: 'primary' },
  REJECTED: { label: 'Bị từ chối', tone: 'danger' },
  CANCELLED: { label: 'Đã hủy', tone: 'neutral' },
};

const MESSAGES: Record<string, string> = {
  VIEWING_REQUEST_NOT_ELIGIBLE: 'Tin đăng này hiện không nhận đặt lịch xem (phòng đã có người thuê hoặc tin đã gỡ).',
  VIEWING_REQUEST_CONFLICT: 'Bạn đã có yêu cầu xem phòng còn hiệu lực cho khung giờ này.',
  VIEWING_REQUEST_INVALID_TRANSITION: 'Lịch xem này không thể hủy ở trạng thái hiện tại.',
  VIEWING_REQUEST_NOT_FOUND: 'Không tìm thấy lịch xem hoặc tin đăng.',
  LISTING_NOT_FOUND: 'Tin đăng không còn tồn tại.',
};

export function viewingErrorMessage(error: unknown): string {
  const e = toApiError(error);
  if (e.isUnauthorized) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  return (e.code && MESSAGES[e.code]) || e.message;
}
