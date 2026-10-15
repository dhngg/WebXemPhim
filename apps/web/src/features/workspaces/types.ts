export type WorkspaceRole = 'OWNER' | 'MANAGER' | 'STAFF';
export type WorkspaceStatus = 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';

export interface WorkspaceMembership {
  workspaceId: string;
  name: string;
  status: WorkspaceStatus;
  role: WorkspaceRole;
  /** Backend chưa trả quy mô/gói dịch vụ trong danh sách workspace → có thể vắng. */
  buildingCount?: number;
  roomCount?: number;
  plan?: { name: string; roomLimit: number };
}

/**
 * Quyền giao diện theo role. ĐỀ XUẤT tạm — permission matrix chính thức đến từ backend.
 * UI chỉ dùng để ẩn/hiện nút; backend vẫn là nơi kiểm tra quyền.
 */
export type WorkspacePermission =
  | 'rooms.write'
  | 'buildings.archive'
  | 'billing.run'
  | 'payments.confirm';

// V1 chỉ có chủ trọ (OWNER). MANAGER/STAFF là dữ liệu lịch sử, không có quyền nào ở runtime.
const OWNER_PERMISSIONS: WorkspacePermission[] = ['rooms.write', 'buildings.archive', 'billing.run', 'payments.confirm'];

export function hasPermission(role: WorkspaceRole, permission: WorkspacePermission): boolean {
  return role === 'OWNER' && OWNER_PERMISSIONS.includes(permission);
}
