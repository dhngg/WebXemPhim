import type { BadgeTone } from '@/components/ui';
import type { DepositTxType, InvoiceStatus, PaymentMethod, PaymentStatus } from './types';

export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; tone: BadgeTone }> = {
  DRAFT: { label: 'Nháp', tone: 'neutral' },
  ISSUED: { label: 'Chờ thanh toán', tone: 'warning' },
  PARTIALLY_PAID: { label: 'Thanh toán một phần', tone: 'info' },
  PAID: { label: 'Đã thanh toán', tone: 'success' },
  OVERDUE: { label: 'Quá hạn', tone: 'danger' },
  VOID: { label: 'Đã hủy', tone: 'neutral' },
};

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: 'Chờ xác nhận', tone: 'warning' },
  CONFIRMED: { label: 'Đã xác nhận', tone: 'success' },
  REJECTED: { label: 'Từ chối', tone: 'danger' },
};

export const PAYMENT_METHOD: Record<PaymentMethod, string> = {
  CASH: 'Tiền mặt',
  BANK_TRANSFER: 'Chuyển khoản',
};

export const DEPOSIT_TYPE: Record<DepositTxType, { label: string; tone: BadgeTone; sign: 1 | -1 }> = {
  COLLECT: { label: 'Thu cọc', tone: 'success', sign: 1 },
  REFUND: { label: 'Hoàn cọc', tone: 'info', sign: -1 },
  DEDUCT: { label: 'Khấu trừ cọc', tone: 'warning', sign: -1 },
};
