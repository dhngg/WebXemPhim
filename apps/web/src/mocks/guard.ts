import { ApiError } from '@/services/http/ApiError';
import { hasPermission, type WorkspacePermission } from '@/features/workspaces/types';
import { requireSession } from './handlers/auth.mock';
import { db } from './db';

/** Giả lập kiểm tra quyền phía server cho mock: phải là thành viên workspace (+ quyền nếu có). */
export function requireMember(workspaceId: string, permission?: WorkspacePermission) {
  const record = requireSession();
  const membership = record.memberships.find((m) => m.workspaceId === workspaceId);
  if (!membership) throw new ApiError({ statusCode: 403, message: 'Bạn không phải thành viên của workspace này.' });
  if (permission && !hasPermission(membership.role, permission)) {
    throw new ApiError({ statusCode: 403, message: 'Vai trò của bạn không được phép thực hiện thao tác này.' });
  }
  return { user: record.user, membership };
}

export function requireAdmin() {
  const record = requireSession();
  if (record.user.globalRole !== 'ADMIN') throw new ApiError({ statusCode: 403, message: 'Chỉ quản trị viên được truy cập.' });
  return record.user;
}

/** Người thuê đã liên kết: trả về tenantId tương ứng. */
export function requireLinkedTenant() {
  const record = requireSession();
  const tenantId = db.tenantLinks[record.user.id];
  if (!tenantId) throw new ApiError({ statusCode: 403, message: 'Tài khoản chưa liên kết hồ sơ người thuê.' });
  return { user: record.user, tenantId };
}

export function validation(message: string, fieldErrors?: Record<string, string>): never {
  throw new ApiError({ statusCode: 400, message, fieldErrors });
}

export function conflict(message: string): never {
  throw new ApiError({ statusCode: 409, message });
}

export function includesText(haystack: string, q?: string) {
  if (!q) return true;
  const n = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/gi, 'd')
      .toLowerCase();
  return n(haystack).includes(n(q.trim()));
}
