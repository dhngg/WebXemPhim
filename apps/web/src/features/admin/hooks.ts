import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminReasonRequest, LandlordApplicationStatus } from '@rental/shared';
import { adminApi, type AdminAuditQuery, type AdminListingQuery, type AdminUserQuery, type PageQuery } from './api';

/** Mọi dữ liệu quản trị nằm dưới khóa này để làm mới cùng lúc sau mỗi thao tác. */
export const adminKeys = {
  all: ['admin'] as const,
  applications: (q: object) => ['admin', 'applications', q] as const,
  users: (q: object) => ['admin', 'users', q] as const,
  user: (id: string | undefined) => ['admin', 'user', id] as const,
  listings: (q: object) => ['admin', 'listings', q] as const,
  audit: (q: object) => ['admin', 'audit', q] as const,
};

export const useAdminApplications = (q: PageQuery & { status?: LandlordApplicationStatus }) =>
  useQuery({ queryKey: adminKeys.applications(q), queryFn: () => adminApi.applications(q), placeholderData: (prev) => prev });
export const useAdminUsers = (q: AdminUserQuery) =>
  useQuery({ queryKey: adminKeys.users(q), queryFn: () => adminApi.users(q), placeholderData: (prev) => prev });
export const useAdminUser = (id: string | undefined) =>
  useQuery({ queryKey: adminKeys.user(id), queryFn: () => adminApi.user(id!), enabled: Boolean(id), retry: false });
export const useAdminListings = (q: AdminListingQuery) =>
  useQuery({ queryKey: adminKeys.listings(q), queryFn: () => adminApi.listings(q), placeholderData: (prev) => prev });
export const useAuditLogs = (q: AdminAuditQuery) =>
  useQuery({ queryKey: adminKeys.audit(q), queryFn: () => adminApi.auditLogs(q), placeholderData: (prev) => prev });

type Decision = { id: string; body: AdminReasonRequest };

/**
 * Mutation quản trị. Dù thành công hay bị từ chối (ví dụ 409 do trạng thái đã đổi) luôn làm mới dữ liệu quản trị,
 * vì nhật ký (audit) luôn thay đổi theo mỗi thao tác thành công và trạng thái thật có thể đã khác.
 */
export function useAdminActions() {
  const qc = useQueryClient();
  const onSettled = () => qc.invalidateQueries({ queryKey: adminKeys.all });
  return {
    approveApplication: useMutation({ mutationFn: (v: Decision) => adminApi.approveApplication(v.id, v.body), onSettled }),
    rejectApplication: useMutation({ mutationFn: (v: Decision) => adminApi.rejectApplication(v.id, v.body), onSettled }),
    lockUser: useMutation({ mutationFn: (v: Decision) => adminApi.lockUser(v.id, v.body), onSettled }),
    unlockUser: useMutation({ mutationFn: (v: Decision) => adminApi.unlockUser(v.id, v.body), onSettled }),
    hideListing: useMutation({
      mutationFn: (v: Decision) => adminApi.hideListing(v.id, v.body),
      onSettled: () => {
        void onSettled();
        void qc.invalidateQueries({ queryKey: ['rooms'] });
      },
    }),
    restoreListing: useMutation({
      mutationFn: (v: Decision) => adminApi.restoreListing(v.id, v.body),
      onSettled: () => {
        void onSettled();
        void qc.invalidateQueries({ queryKey: ['rooms'] });
      },
    }),
  };
}
