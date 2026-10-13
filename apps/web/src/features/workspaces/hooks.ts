import { useQuery } from '@tanstack/react-query';
import { workspacesApi } from './api';
import type { WorkspaceMembership } from './types';

export const workspaceKeys = { mine: ['workspaces', 'mine'] as const };

export function useMyWorkspaces(enabled = true) {
  return useQuery({ queryKey: workspaceKeys.mine, queryFn: () => workspacesApi.listMine(), enabled });
}

/** Membership của user trong workspace hiện tại (undefined khi đang tải / không phải thành viên). */
export function useWorkspaceMembership(workspaceId: string | undefined): {
  membership: WorkspaceMembership | undefined;
  isLoading: boolean;
  error: unknown;
} {
  const query = useMyWorkspaces(Boolean(workspaceId));
  return {
    membership: query.data?.find((m) => m.workspaceId === workspaceId),
    isLoading: query.isLoading,
    error: query.error,
  };
}

const LAST_KEY = 'rp.lastWorkspaceId';

/** Ghi nhớ workspace gần nhất (chỉ là tiện ích UI, không phải dữ liệu quyền). */
export const lastWorkspace = {
  get(): string | null {
    try {
      return localStorage.getItem(LAST_KEY);
    } catch {
      return null;
    }
  },
  set(id: string) {
    try {
      localStorage.setItem(LAST_KEY, id);
    } catch {
      /* bỏ qua */
    }
  },
};
