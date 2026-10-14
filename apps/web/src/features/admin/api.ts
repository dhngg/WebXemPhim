import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { env } from '@/lib/env';
import { httpClient } from '@/services/http/httpClient';
import { adminMock } from '@/mocks/handlers/admin.mock';
import type { BadgeTone } from '@/components/ui';
import type { WorkspaceStatus } from '@/features/workspaces/types';
import type { AdminListing, AdminListingStatus, AdminOverview, AdminUser, AdminWorkspace, AuditLog } from './types';

export interface AuditFilters {
  q?: string;
  category?: AuditLog['category'];
  from?: string;
  to?: string;
}

export interface AdminApi {
  overview(): Promise<AdminOverview>;
  users(q?: string): Promise<AdminUser[]>;
  setUserLocked(id: string, locked: boolean): Promise<AdminUser>;
  workspaces(q?: string): Promise<AdminWorkspace[]>;
  setWorkspaceStatus(id: string, status: WorkspaceStatus): Promise<AdminWorkspace>;
  listings(status?: AdminListingStatus): Promise<AdminListing[]>;
  setListingStatus(id: string, status: AdminListingStatus): Promise<AdminListing>;
  auditLogs(f: AuditFilters): Promise<AuditLog[]>;
}

const adminHttp: AdminApi = {
  overview: () => httpClient.get('/admin/overview'),
  users: (q) => httpClient.get('/admin/users', { query: { q } }),
  setUserLocked: (id, locked) => httpClient.patch(`/admin/users/${id}`, { status: locked ? 'LOCKED' : 'ACTIVE' }),
  workspaces: (q) => httpClient.get('/admin/workspaces', { query: { q } }),
  setWorkspaceStatus: (id, status) => httpClient.patch(`/admin/workspaces/${id}`, { status }),
  listings: (status) => httpClient.get('/admin/listings', { query: { status } }),
  setListingStatus: (id, status) => httpClient.patch(`/admin/listings/${id}`, { status }),
  auditLogs: (f) => httpClient.get('/admin/audit-logs', { query: { ...f } }),
};

export const adminApi: AdminApi = env.useMockApi ? adminMock : adminHttp;

export const LISTING_ADMIN_STATUS: Record<AdminListingStatus, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: 'Đang hiển thị', tone: 'success' },
  REPORTED: { label: 'Bị báo cáo', tone: 'danger' },
  REMOVED: { label: 'Đã gỡ', tone: 'neutral' },
};

export const AUDIT_CATEGORY: Record<AuditLog['category'], string> = {
  AUTH: 'Xác thực',
  USER: 'Người dùng',
  WORKSPACE: 'Workspace',
  LISTING: 'Tin đăng',
  BILLING: 'Thu chi',
};

const K = ['admin'] as const;

export const useAdminOverview = () => useQuery({ queryKey: [...K, 'overview'], queryFn: () => adminApi.overview() });
export const useAdminUsers = (q?: string) => useQuery({ queryKey: [...K, 'users', q ?? ''], queryFn: () => adminApi.users(q) });
export const useAdminWorkspaces = (q?: string) => useQuery({ queryKey: [...K, 'workspaces', q ?? ''], queryFn: () => adminApi.workspaces(q) });
export const useAdminListings = (status?: AdminListingStatus) =>
  useQuery({ queryKey: [...K, 'listings', status ?? 'all'], queryFn: () => adminApi.listings(status) });
export const useAuditLogs = (f: AuditFilters) => useQuery({ queryKey: [...K, 'audit', f], queryFn: () => adminApi.auditLogs(f) });

export function useAdminMutations() {
  const qc = useQueryClient();
  const onSuccess = () => qc.invalidateQueries({ queryKey: K });
  return {
    setUserLocked: useMutation({ mutationFn: (v: { id: string; locked: boolean }) => adminApi.setUserLocked(v.id, v.locked), onSuccess }),
    setWorkspaceStatus: useMutation({
      mutationFn: (v: { id: string; status: WorkspaceStatus }) => adminApi.setWorkspaceStatus(v.id, v.status),
      onSuccess,
    }),
    setListingStatus: useMutation({
      mutationFn: (v: { id: string; status: AdminListingStatus }) => adminApi.setListingStatus(v.id, v.status),
      onSuccess: () => {
        onSuccess();
        qc.invalidateQueries({ queryKey: ['rooms'] });
      },
    }),
  };
}
