import { useOutletContext, useParams } from 'react-router-dom';
import type { WorkspaceMembership, WorkspacePermission } from '@/features/workspaces/types';
import { hasPermission } from '@/features/workspaces/types';

/** Dùng trong các trang con của WorkspaceLayout: workspaceId + membership + kiểm quyền UI. */
export function useWorkspaceContext() {
  const { workspaceId = '' } = useParams();
  const membership = useOutletContext<WorkspaceMembership>();
  return {
    ws: workspaceId,
    membership,
    base: `/w/${workspaceId}`,
    /** Chỉ để ẩn/hiện nút — backend vẫn kiểm tra quyền thật. */
    can: (permission: WorkspacePermission) => hasPermission(membership.role, permission),
  };
}
