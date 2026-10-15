import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { workspacesApi } from './api';
import type { Capabilities } from '@/features/capabilities/model';
import { capabilityKeys } from '@/features/capabilities/hooks';
import { capabilitiesApi } from '@/features/capabilities/api';
import { toMembership } from '@/features/capabilities/model';
import type { WorkspaceMembership } from './types';

/**
 * Workspace của user = `capabilities.workspaces` (một nguồn quyền duy nhất, không gọi thêm API).
 * Dùng chung query với useCapabilities nên đổi quyền ở đâu cũng cập nhật tại đây.
 */
export function useMyWorkspaces(enabled = true) {
  return useQuery({
    queryKey: capabilityKeys.me,
    queryFn: () => capabilitiesApi.get(),
    enabled,
    staleTime: 30_000,
    // Quyền có thể đổi bất cứ lúc nào (bị gỡ khỏi workspace, được duyệt…) → lấy lại mỗi lần quay lại tab, kể cả khi chưa "cũ".
    refetchOnWindowFocus: 'always',
    retry: false,
    select: (caps): WorkspaceMembership[] => caps.workspaces.map(toMembership),
  });
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

/**
 * Tạo workspace. Sau khi tạo, LẤY LẠI quyền thật từ backend (capabilities) để bộ chuyển khu vực,
 * guard và danh sách workspace cập nhật; `ready` cho biết workspace mới đã xuất hiện trong quyền.
 */
export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const membership = await workspacesApi.create(name.trim());
      await qc.invalidateQueries({ queryKey: capabilityKeys.me });
      const caps = qc.getQueryData<Capabilities>(capabilityKeys.me);
      const ready = Boolean(caps?.workspaces.some((w) => w.id === membership.workspaceId));
      if (ready) lastWorkspace.set(membership.workspaceId);
      return { membership, ready };
    },
    // Dù thành công hay bị từ chối (đơn đã dùng, đạt giới hạn…), trạng thái thật có thể đã khác: lấy lại.
    onError: () => qc.invalidateQueries({ queryKey: capabilityKeys.me }),
  });
}

/**
 * Lưu trữ / khôi phục workspace. Quyền (capabilities) và danh sách workspace là một nguồn, nên luôn lấy lại sau thao tác —
 * kể cả khi bị từ chối (ví dụ 409 do đã có workspace ACTIVE khác) vì trạng thái thật có thể đã khác.
 */
export function useWorkspaceLifecycle() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: capabilityKeys.me });
  return {
    archive: useMutation({ mutationFn: (id: string) => workspacesApi.archive(id), onSettled: refresh }),
    restore: useMutation({ mutationFn: (id: string) => workspacesApi.restore(id), onSettled: refresh }),
  };
}
