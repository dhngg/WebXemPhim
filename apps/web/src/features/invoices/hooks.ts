import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateInvoiceAdjustmentRequest, CreateInvoiceRequest, UpdateInvoiceRequest } from '@rental/shared';
import { invoicesApi, type InvoiceFilters, type PageQuery } from './api';

const root = (ws: string) => ['workspaces', ws, 'inv'] as const;

export function useInvoiceList(ws: string, buildingId: string | undefined, filters: InvoiceFilters, page: PageQuery) {
  return useQuery({
    queryKey: [...root(ws), 'list', buildingId, filters, page],
    queryFn: () => invoicesApi.listInvoices(ws, buildingId!, filters, page),
    enabled: Boolean(buildingId),
    placeholderData: keepPreviousData,
  });
}
export function useInvoice(ws: string, buildingId: string | undefined, invoiceId: string | undefined) {
  return useQuery({
    queryKey: [...root(ws), 'detail', buildingId, invoiceId],
    queryFn: () => invoicesApi.getInvoice(ws, buildingId!, invoiceId!),
    enabled: Boolean(buildingId && invoiceId),
  });
}

/** Mọi thay đổi hóa đơn/điều chỉnh làm mới danh sách, chi tiết và danh sách điều chỉnh. */
function useRefresh(ws: string) {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: root(ws) });
}

export function useCreateInvoice(ws: string, buildingId: string) {
  const refresh = useRefresh(ws);
  return useMutation({ mutationFn: (input: CreateInvoiceRequest) => invoicesApi.createInvoice(ws, buildingId, input), onSuccess: refresh });
}
export function useUpdateInvoice(ws: string, buildingId: string, invoiceId: string) {
  const refresh = useRefresh(ws);
  return useMutation({ mutationFn: (patch: UpdateInvoiceRequest) => invoicesApi.updateInvoice(ws, buildingId, invoiceId, patch), onSuccess: refresh });
}
export function useIssueInvoice(ws: string, buildingId: string, invoiceId: string) {
  const refresh = useRefresh(ws);
  return useMutation({ mutationFn: () => invoicesApi.issueInvoice(ws, buildingId, invoiceId), onSuccess: refresh });
}
export function useDeleteInvoice(ws: string, buildingId: string, invoiceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => invoicesApi.deleteInvoice(ws, buildingId, invoiceId),
    onSuccess: () => {
      qc.removeQueries({ queryKey: [...root(ws), 'detail', buildingId, invoiceId] });
      void qc.invalidateQueries({ queryKey: root(ws) });
    },
  });
}

export function useAdjustments(ws: string, buildingId: string, invoiceId: string, page: PageQuery, enabled = true) {
  return useQuery({
    queryKey: [...root(ws), 'adjustments', buildingId, invoiceId, page],
    queryFn: () => invoicesApi.listAdjustments(ws, buildingId, invoiceId, page),
    enabled,
    placeholderData: keepPreviousData,
  });
}
export function useAdjustment(ws: string, buildingId: string, invoiceId: string, adjustmentId: string | undefined) {
  return useQuery({
    queryKey: [...root(ws), 'adjustment', buildingId, invoiceId, adjustmentId],
    queryFn: () => invoicesApi.getAdjustment(ws, buildingId, invoiceId, adjustmentId!),
    enabled: Boolean(adjustmentId),
  });
}
export function useCreateAdjustment(ws: string, buildingId: string, invoiceId: string) {
  const refresh = useRefresh(ws);
  return useMutation({
    mutationFn: (input: CreateInvoiceAdjustmentRequest) => invoicesApi.createAdjustment(ws, buildingId, invoiceId, input),
    onSuccess: refresh,
  });
}
