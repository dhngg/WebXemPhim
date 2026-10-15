import type { WorkspaceRole } from './types';

export function roleLabel(role: WorkspaceRole): string {
  return role === 'OWNER' ? 'Chủ hệ thống' : role === 'MANAGER' ? 'Quản lý' : 'Nhân viên';
}
