import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateDepositEntryRequest, ReverseDepositEntryRequest } from '@rental/shared';
import { depositsApi, type PageQuery } from './api';

const root = (ws: string) => ['workspaces', ws, 'dep'] as const;

/** Sổ + 4 tổng do backend tính (collected/deducted/refunded/balance); không tự cộng từ trang đang xem. */
export function useDeposit(ws: string, contractId: string | undefined, page: PageQuery) {
  return useQuery({
    queryKey: [...root(ws), 'ledger', contractId, page],
    queryFn: () => depositsApi.getDeposit(ws, contractId!, page),
    enabled: Boolean(contractId),
    placeholderData: keepPreviousData,
  });
}
export function useDepositEntry(ws: string, contractId: string, entryId: string | undefined) {
  return useQuery({
    queryKey: [...root(ws), 'entry', contractId, entryId],
    queryFn: () => depositsApi.getEntry(ws, contractId, entryId!),
    enabled: Boolean(entryId),
  });
}
function useRefresh(ws: string) {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: root(ws) });
}
export function useCreateDepositEntry(ws: string, contractId: string) {
  const refresh = useRefresh(ws);
  return useMutation({ mutationFn: (input: CreateDepositEntryRequest) => depositsApi.createEntry(ws, contractId, input), onSuccess: refresh });
}
export function useReverseDepositEntry(ws: string, contractId: string) {
  const refresh = useRefresh(ws);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReverseDepositEntryRequest }) => depositsApi.reverseEntry(ws, contractId, id, input),
    onSuccess: refresh,
  });
}
