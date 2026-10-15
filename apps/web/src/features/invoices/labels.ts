import type { InvoiceItemType, InvoiceMissingReason, InvoiceStatus, PaymentStatus } from '@rental/shared';
import type { BadgeTone } from '@/components/ui';
import { toApiError } from '@/services/http/ApiError';

/** Trạng thái HÓA ĐƠN chỉ có DRAFT / ISSUED; tình trạng thu tiền là một thuộc tính riêng (paymentStatus). */
export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; tone: BadgeTone }> = {
  DRAFT: { label: 'Bản nháp', tone: 'warning' },
  ISSUED: { label: 'Đã phát hành', tone: 'success' },
};

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: BadgeTone }> = {
  UNPAID: { label: 'Chưa thanh toán', tone: 'danger' },
  PARTIALLY_PAID: { label: 'Thanh toán một phần', tone: 'warning' },
  PAID: { label: 'Đã thanh toán', tone: 'success' },
};

export const ITEM_TYPE: Record<InvoiceItemType, string> = {
  RENT: 'Tiền thuê',
  ELECTRICITY: 'Điện',
  WATER: 'Nước',
  SERVICE: 'Dịch vụ',
  VEHICLE: 'Phương tiện',
};

/** Nơi người dùng xử lý nguyên nhân thiếu dữ liệu: màn bảng giá/chỉ số (FE-06A) hoặc chính hóa đơn nháp. */
export type MissingTarget = 'rates' | 'meters' | 'edit';

export const MISSING_REASON: Record<InvoiceMissingReason, { label: string; target: MissingTarget; action: string }> = {
  METER_READING_MISSING: { label: 'Thiếu chỉ số điện/nước của kỳ này', target: 'meters', action: 'Ghi chỉ số' },
  OCCUPANT_COUNT_MISSING: { label: 'Cần xác nhận số người ở (đơn giá tính theo người)', target: 'edit', action: 'Nhập số người ở' },
  RATE_PERIOD_MISMATCH: { label: 'Đơn giá không phủ hết kỳ', target: 'rates', action: 'Xem bảng giá' },
  WATER_METHOD_CONFLICT: { label: 'Có nhiều cách tính nước cùng lúc', target: 'rates', action: 'Xem bảng giá' },
  RATE_UNIT_UNSUPPORTED: { label: 'Đơn vị tính của đơn giá chưa được hỗ trợ', target: 'rates', action: 'Xem bảng giá' },
  RATE_MISSING: { label: 'Thiếu đơn giá của dịch vụ', target: 'rates', action: 'Xem bảng giá' },
  RATE_SEGMENT_CONSUMPTION_UNKNOWN: { label: 'Đơn giá đổi giữa kỳ nhưng không chia được lượng tiêu thụ', target: 'rates', action: 'Xem bảng giá' },
  RATE_CHANGE_NOT_SPLITTABLE: { label: 'Đơn giá đổi giữa kỳ không chia tách được', target: 'rates', action: 'Xem bảng giá' },
  VEHICLE_BILLING_AMBIGUOUS: { label: 'Người thuê có nhiều hợp đồng trong kỳ: chọn hóa đơn này có tính phí xe hay không', target: 'edit', action: 'Chọn tính phí xe' },
};

const MESSAGES: Record<string, string> = {
  INVOICE_NOT_FOUND: 'Không tìm thấy hóa đơn.',
  INVOICE_DUPLICATE: 'Hợp đồng này đã có hóa đơn cho kỳ đã chọn.',
  INVOICE_NOT_EDITABLE: 'Chỉ bản nháp mới sửa hoặc xóa được. Hóa đơn đã phát hành chỉ điều chỉnh bằng bút toán điều chỉnh.',
  INVOICE_INCOMPLETE: 'Hóa đơn còn thiếu đơn giá, chỉ số hoặc số lượng nên chưa phát hành được.',
  INVOICE_PERIOD_INVALID: 'Hợp đồng không có hiệu lực trong kỳ này (hoặc đã hủy trước ngày bắt đầu).',
  INVOICE_NOT_ELIGIBLE: 'Tòa nhà đã lưu trữ nên không thay đổi hóa đơn được.',
  INVOICE_VEHICLE_BILLING_CONFLICT: 'Một hóa đơn khác của người thuê đã tính phí xe trong kỳ này.',
  CONTRACT_NOT_FOUND: 'Không tìm thấy hợp đồng trong tòa nhà này.',
  INVOICE_ADJUSTMENT_NOT_FOUND: 'Không tìm thấy bút toán điều chỉnh.',
  INVOICE_ADJUSTMENT_INVALID: 'Điều chỉnh không hợp lệ: số tiền bằng 0 (sau làm tròn 1 đồng), làm tổng hóa đơn âm, hoặc tham chiếu sai/đã được sửa.',
  INVOICE_ADJUSTMENT_NOT_ELIGIBLE: 'Chỉ hóa đơn đã phát hành của tòa nhà đang hoạt động mới điều chỉnh được.',
  INVOICE_ADJUSTMENT_IDEMPOTENCY_CONFLICT: 'Mã chống gửi trùng đã được dùng cho một điều chỉnh khác. Đóng hộp thoại và nhập lại.',
  INVOICE_ADJUSTMENT_BELOW_PAID: 'Điều chỉnh làm số phải thu thấp hơn số tiền đã nhận. Cần đảo hoặc hoàn khoản đã thu trước.',
  BUILDING_NOT_FOUND: 'Không tìm thấy tòa nhà.',
  WORKSPACE_ARCHIVED: 'Workspace đã lưu trữ nên chỉ xem được, không ghi thêm dữ liệu.',
  WORKSPACE_NOT_FOUND: 'Bạn không có quyền với workspace này.',
};

export function invoiceErrorMessage(error: unknown): string {
  const e = toApiError(error);
  if (e.isUnauthorized) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  return (e.code && MESSAGES[e.code]) || e.message;
}
