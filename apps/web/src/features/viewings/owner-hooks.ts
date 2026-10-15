import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DecideViewingRequestRequest } from '@rental/shared';
import { viewingsOwnerApi, type OwnerViewingQuery } from './owner-api';
import { viewingKeys } from './hooks';

export const ownerViewingKeys = {
  all: (ws: string) => ['workspaces', ws, 'viewing-requests'] as const,
  list: (ws: string, q: OwnerViewingQuery) => ['workspaces', ws, 'viewing-requests', q] as const,
};

export function useWorkspaceViewingRequests(ws: string, q: OwnerViewingQuery) {
  return useQuery({ queryKey: ownerViewingKeys.list(ws, q), queryFn: () => viewingsOwnerApi.list(ws, q), placeholderData: (prev) => prev });
}

type Decision = { id: string; body: DecideViewingRequestRequest };

/**
 * Xác nhận/từ chối. Dù thành công hay bị từ chối (409: đã xử lý, hết điều kiện) luôn tải lại danh sách vì trạng thái thật có thể đã đổi;
 * người xem thấy kết quả ở “Lịch xem của tôi” và có thông báo.
 */
export function useDecideViewing(ws: string) {
  const qc = useQueryClient();
  const onSettled = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ownerViewingKeys.all(ws) }),
      qc.invalidateQueries({ queryKey: viewingKeys.mine }),
      qc.invalidateQueries({ queryKey: ['notifications'] }),
    ]);
  return {
    confirm: useMutation({ mutationFn: (v: Decision) => viewingsOwnerApi.confirm(ws, v.id, v.body), onSettled }),
    reject: useMutation({ mutationFn: (v: Decision) => viewingsOwnerApi.reject(ws, v.id, v.body), onSettled }),
  };
}
