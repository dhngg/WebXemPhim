import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { billingApi, type InvoiceFilters } from './api';
import type { DepositInput, MeterInput, PaymentInput, PaymentStatus, RateInput } from './types';

const k = (ws: string) => ['workspaces', ws] as const;

function useInvalidateWs(ws: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: k(ws) });
    qc.invalidateQueries({ queryKey: ['tenant-portal'] });
  };
}

export function useRates(ws: string) {
  return useQuery({ queryKey: [...k(ws), 'rates'], queryFn: () => billingApi.listRates(ws) });
}
export function useCreateRate(ws: string) {
  const invalidate = useInvalidateWs(ws);
  return useMutation({ mutationFn: (input: RateInput) => billingApi.createRate(ws, input), onSuccess: invalidate });
}

export function useMeterSheet(ws: string, period: string) {
  return useQuery({ queryKey: [...k(ws), 'meters', period], queryFn: () => billingApi.getMeterSheet(ws, period) });
}
export function useSaveMeter(ws: string) {
  const invalidate = useInvalidateWs(ws);
  return useMutation({ mutationFn: (input: MeterInput) => billingApi.saveMeter(ws, input), onSuccess: invalidate });
}

export function useInvoices(ws: string, f: InvoiceFilters = {}) {
  return useQuery({ queryKey: [...k(ws), 'invoices', f], queryFn: () => billingApi.listInvoices(ws, f) });
}
export function useInvoice(ws: string, id: string | undefined) {
  return useQuery({ queryKey: [...k(ws), 'invoices', 'detail', id], queryFn: () => billingApi.getInvoice(ws, id!), enabled: Boolean(id) });
}
export function useAddAdjustment(ws: string) {
  const invalidate = useInvalidateWs(ws);
  return useMutation({
    mutationFn: (v: { id: string; amount: number; reason: string }) => billingApi.addAdjustment(ws, v.id, v.amount, v.reason),
    onSuccess: invalidate,
  });
}

export function useBillingPreview(ws: string, period: string, enabled: boolean) {
  return useQuery({
    queryKey: [...k(ws), 'billing-preview', period],
    queryFn: () => billingApi.previewBilling(ws, period),
    enabled,
  });
}
export function useRunBilling(ws: string) {
  const invalidate = useInvalidateWs(ws);
  return useMutation({
    mutationFn: (v: { period: string; contractIds: string[] }) => billingApi.runBilling(ws, v.period, v.contractIds),
    onSuccess: invalidate,
  });
}

export function usePayments(ws: string, status?: PaymentStatus, invoiceId?: string) {
  return useQuery({
    queryKey: [...k(ws), 'payments', status ?? 'all', invoiceId ?? ''],
    queryFn: () => billingApi.listPayments(ws, status, invoiceId),
  });
}
export function useRecordPayment(ws: string) {
  const invalidate = useInvalidateWs(ws);
  return useMutation({ mutationFn: (input: PaymentInput) => billingApi.recordPayment(ws, input), onSuccess: invalidate });
}
export function useConfirmPayment(ws: string) {
  const invalidate = useInvalidateWs(ws);
  return useMutation({ mutationFn: (id: string) => billingApi.confirmPayment(ws, id), onSuccess: invalidate });
}
export function useRejectPayment(ws: string) {
  const invalidate = useInvalidateWs(ws);
  return useMutation({
    mutationFn: (v: { id: string; reason: string }) => billingApi.rejectPayment(ws, v.id, v.reason),
    onSuccess: invalidate,
  });
}

export function useDeposits(ws: string, contractId?: string) {
  return useQuery({ queryKey: [...k(ws), 'deposits', contractId ?? ''], queryFn: () => billingApi.listDeposits(ws, contractId) });
}
export function useCreateDeposit(ws: string) {
  const invalidate = useInvalidateWs(ws);
  return useMutation({ mutationFn: (input: DepositInput) => billingApi.createDeposit(ws, input), onSuccess: invalidate });
}
