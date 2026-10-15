import { z } from 'zod';
import { VIEWING_REQUEST_STATUSES, type DecideViewingRequestRequest, type ViewingRequestResponse, type ViewingRequestStatus } from '@rental/shared';
import { toApiError } from '@/services/http/ApiError';

export const PAGE_SIZE = 20;

export const isViewingStatus = (v: string): v is ViewingRequestStatus => (VIEWING_REQUEST_STATUSES as readonly string[]).includes(v);

/** Chỉ yêu cầu đang chờ mới xác nhận/từ chối được (PENDING → CONFIRMED | REJECTED). Hủy không phải thao tác của OWNER. */
export const canDecideViewing = (v: Pick<ViewingRequestResponse, 'status'>) => v.status === 'PENDING';

/** Ghi chú cho người xem là tùy chọn, tối đa 1000 ký tự (đúng `DecideViewingRequestDto`). */
export const decisionSchema = z.object({ note: z.string().trim().max(1000, 'Ghi chú tối đa 1000 ký tự') });
export type DecisionForm = z.input<typeof decisionSchema>;
export const toDecisionBody = (v: DecisionForm): DecideViewingRequestRequest => {
  const note = v.note.trim();
  return note ? { note } : {};
};

const MESSAGES: Record<string, string> = {
  VIEWING_REQUEST_NOT_FOUND: 'Không tìm thấy yêu cầu xem phòng.',
  VIEWING_REQUEST_INVALID_TRANSITION: 'Yêu cầu này đã được xử lý hoặc người xem đã hủy, nên không đổi được nữa.',
  VIEWING_REQUEST_NOT_ELIGIBLE: 'Không xác nhận được: giờ hẹn đã qua, hoặc tin đăng không còn đủ điều kiện (đã gỡ/ẩn, phòng không còn trống, tòa nhà hoặc workspace đã lưu trữ). Bạn vẫn có thể từ chối.',
  WORKSPACE_ARCHIVED: 'Workspace đã lưu trữ nên chỉ xem được, không xử lý yêu cầu.',
  WORKSPACE_NOT_FOUND: 'Bạn không có quyền với workspace này.',
};

export function ownerViewingErrorMessage(error: unknown): string {
  const e = toApiError(error);
  if (e.isUnauthorized) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  return (e.code && MESSAGES[e.code]) || e.message;
}
