import type { PaymentEntryKind, PaymentMethod } from '@rental/shared';
import type { BadgeTone } from '@/components/ui';
import { toApiError } from '@/services/http/ApiError';

export const PAYMENT_METHOD: Record<PaymentMethod, string> = { CASH: 'Tiền mặt', BANK_TRANSFER: 'Chuyển khoản' };

/** Sổ chỉ có khoản thu (PAYMENT) và bản đảo (REVERSAL); không có trạng thái chờ xác nhận/từ chối. */
export const PAYMENT_ENTRY_KIND: Record<PaymentEntryKind, { label: string; tone: BadgeTone }> = {
  PAYMENT: { label: 'Khoản thu', tone: 'success' },
  REVERSAL: { label: 'Bản đảo', tone: 'warning' },
};

const MESSAGES: Record<string, string> = {
  INVOICE_NOT_FOUND: 'Không tìm thấy hóa đơn.',
  INVOICE_PAYMENT_NOT_FOUND: 'Không tìm thấy khoản thanh toán hoặc hóa đơn.',
  INVOICE_PAYMENT_INVALID: 'Thanh toán không hợp lệ: thời điểm nhận ở tương lai, hoặc khoản này không đảo được (đã đảo rồi hoặc là bản đảo).',
  INVOICE_PAYMENT_EXCEEDS_DUE: 'Tổng thanh toán không được vượt số phải thu của hóa đơn.',
  INVOICE_PAYMENT_NOT_ELIGIBLE: 'Chỉ hóa đơn đã phát hành của tòa nhà đang hoạt động mới nhận thanh toán.',
  INVOICE_PAYMENT_IDEMPOTENCY_CONFLICT: 'Mã chống gửi trùng đã được dùng cho một giao dịch khác. Đóng hộp thoại và nhập lại.',
  BUILDING_NOT_FOUND: 'Không tìm thấy tòa nhà.',
  WORKSPACE_ARCHIVED: 'Workspace đã lưu trữ nên chỉ xem được, không ghi thêm dữ liệu.',
  WORKSPACE_NOT_FOUND: 'Bạn không có quyền với workspace này.',
};

export function paymentErrorMessage(error: unknown): string {
  const e = toApiError(error);
  if (e.isUnauthorized) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  return (e.code && MESSAGES[e.code]) || e.message;
}
