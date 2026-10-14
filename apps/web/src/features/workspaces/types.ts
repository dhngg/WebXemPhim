export type WorkspaceRole = 'OWNER' | 'MANAGER' | 'STAFF';
export type WorkspaceStatus = 'ACTIVE' | 'SUSPENDED';

export interface WorkspaceMembership {
  workspaceId: string;
  name: string;
  status: WorkspaceStatus;
  role: WorkspaceRole;
  buildingCount: number;
  roomCount: number;
  plan: { name: string; roomLimit: number };
}

/**
 * Quyền giao diện theo role. ĐỀ XUẤT tạm — permission matrix chính thức đến từ backend.
 * UI chỉ dùng để ẩn/hiện nút; backend vẫn là nơi kiểm tra quyền.
 */
export type WorkspacePermission =
  | 'workspace.settings'
  | 'members.manage'
  | 'rooms.write'
  | 'billing.run'
  | 'payments.confirm';

const MATRIX: Record<WorkspaceRole, WorkspacePermission[]> = {
  OWNER: ['workspace.settings', 'members.manage', 'rooms.write', 'billing.run', 'payments.confirm'],
  MANAGER: ['rooms.write', 'billing.run', 'payments.confirm'],
  STAFF: ['rooms.write'],
};

export function hasPermission(role: WorkspaceRole, permission: WorkspacePermission): boolean {
  return MATRIX[role].includes(permission);
}
