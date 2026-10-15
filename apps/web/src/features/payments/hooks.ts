import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateInvoicePaymentRequest, ReverseInvoicePaymentRequest } from '@rental/shared';
import { paymentsApi, type PageQuery } from './api';

const payRoot = (ws: string) => ['workspaces', ws, 'pay'] as const;

export function usePaymentLedger(ws: string, buildingId: string | undefined, invoiceId: string | undefined, page: PageQuery) {
  return useQuery({
    queryKey: [...payRoot(ws), 'ledger', buildingId, invoiceId, page],
    queryFn: () => paymentsApi.listPayments(ws, buildingId!, invoiceId!, page),
    enabled: Boolean(buildingId && invoiceId),
    placeholderData: keepPreviousData,
  });
}
export function usePayment(ws: string, buildingId: string, invoiceId: string, paymentId: string | undefined) {
  return useQuery({
    queryKey: [...payRoot(ws), 'detail', buildingId, invoiceId, paymentId],
    queryFn: () => paymentsApi.getPayment(ws, buildingId, invoiceId, paymentId!),
    enabled: Boolean(paymentId),
  });
}

/**
 * Ghi/đảo thanh toán đổi paidTotal, outstanding, paymentStatus của hóa đơn → làm mới sổ và mọi dữ liệu hóa đơn.
 * Trả về Promise để mutation chỉ hoàn tất SAU khi dữ liệu mới đã về: nếu không, thông báo/đóng hộp thoại xảy ra khi sổ còn cũ
 * và thao tác kế tiếp (vd. "Thu đủ số còn lại") lấy số còn phải thu đã lỗi thời, bị backend từ chối 409 (phát hiện ở REAL smoke).
 */
function useRefresh(ws: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: payRoot(ws) }),
      qc.invalidateQueries({ queryKey: ['workspaces', ws, 'inv'] }),
    ]);
}

export function useRecordPayment(ws: string, buildingId: string, invoiceId: string) {
  const refresh = useRefresh(ws);
  return useMutation({ mutationFn: (input: CreateInvoicePaymentRequest) => paymentsApi.recordPayment(ws, buildingId, invoiceId, input), onSuccess: refresh });
}
export function useReversePayment(ws: string, buildingId: string, invoiceId: string) {
  const refresh = useRefresh(ws);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReverseInvoicePaymentRequest }) => paymentsApi.reversePayment(ws, buildingId, invoiceId, id, input),
    onSuccess: refresh,
  });
}
