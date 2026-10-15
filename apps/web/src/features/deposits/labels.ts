import type { DepositEntryKind } from '@rental/shared';
import type { BadgeTone } from '@/components/ui';
import { toApiError } from '@/services/http/ApiError';

export const DEPOSIT_KIND: Record<DepositEntryKind, { label: string; tone: BadgeTone; hint: string }> = {
  COLLECTION: { label: 'Thu cọc', tone: 'success', hint: 'Đã nhận tiền cọc từ người thuê' },
  DEDUCTION: { label: 'Khấu trừ', tone: 'warning', hint: 'Giữ lại một phần cọc (hư hỏng, nợ…), không phải chi tiền' },
  REFUND: { label: 'Hoàn cọc', tone: 'info', hint: 'Đã thực sự trả lại tiền cọc cho người thuê' },
  REVERSAL: { label: 'Bản đảo', tone: 'neutral', hint: 'Bút toán hủy một giao dịch ghi nhầm' },
};

const MESSAGES: Record<string, string> = {
  CONTRACT_NOT_FOUND: 'Không tìm thấy hợp đồng.',
  DEPOSIT_ENTRY_NOT_FOUND: 'Không tìm thấy giao dịch tiền cọc.',
  DEPOSIT_ENTRY_INVALID:
    'Giao dịch không hợp lệ: thiếu hình thức/lý do/mã tham chiếu theo loại, thời điểm ở tương lai, hoặc giao dịch này không đảo được (đã đảo rồi hoặc là bản đảo).',
  DEPOSIT_INSUFFICIENT_BALANCE: 'Số dư cọc không đủ cho giao dịch này (cũng áp dụng khi đảo một khoản thu làm số dư âm).',
  DEPOSIT_NOT_ELIGIBLE: 'Tòa nhà đã lưu trữ: chỉ ghi nhận được hoàn cọc số dư còn lại.',
  DEPOSIT_IDEMPOTENCY_CONFLICT: 'Mã chống gửi trùng đã được dùng cho một giao dịch khác. Đóng hộp thoại và nhập lại.',
  WORKSPACE_ARCHIVED: 'Workspace đã lưu trữ: chỉ ghi nhận được hoàn cọc số dư còn lại.',
  WORKSPACE_NOT_FOUND: 'Bạn không có quyền với workspace này.',
};

export function depositErrorMessage(error: unknown): string {
  const e = toApiError(error);
  if (e.isUnauthorized) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  return (e.code && MESSAGES[e.code]) || e.message;
}
