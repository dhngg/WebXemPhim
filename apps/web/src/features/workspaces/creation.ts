import { z } from 'zod';
import type { Capabilities } from '@/features/capabilities/model';
import type { ApiError } from '@/services/http/ApiError';

/**
 * Luật tạo workspace của backend (`POST /workspaces`), phản chiếu lại ở giao diện CHỈ để chỉ dẫn người dùng.
 * Backend vẫn là nơi quyết định; mọi lỗi trả về đều được hiển thị.
 *  - Chưa từng là OWNER: cần đơn đăng ký chủ trọ đã được duyệt.
 *  - Đang là OWNER của một workspace ACTIVE: không tạo thêm (tối đa 1 workspace đang hoạt động).
 *  - Đã từng là OWNER: tổng số workspace sở hữu tối đa 2.
 */
export type WorkspaceCreationState =
  | { kind: 'ALLOWED'; viaApplication: boolean }
  | { kind: 'NEEDS_APPLICATION' }
  | { kind: 'APPLICATION_PENDING' }
  | { kind: 'APPLICATION_REJECTED' }
  | { kind: 'LIMIT_ACTIVE' }
  | { kind: 'LIMIT_TOTAL' };

export const MAX_OWNED_WORKSPACES = 2;

export function workspaceCreation(caps: Capabilities | null | undefined): WorkspaceCreationState {
  const owned = (caps?.workspaces ?? []).filter((w) => w.role === 'OWNER');
  if (owned.some((w) => w.status === 'ACTIVE')) return { kind: 'LIMIT_ACTIVE' };
  if (owned.length >= MAX_OWNED_WORKSPACES) return { kind: 'LIMIT_TOTAL' };
  if (owned.length > 0) return { kind: 'ALLOWED', viaApplication: false };
  switch (caps?.landlordApplication?.status) {
    case 'APPROVED':
      return { kind: 'ALLOWED', viaApplication: true };
    case 'PENDING':
      return { kind: 'APPLICATION_PENDING' };
    case 'REJECTED':
      return { kind: 'APPLICATION_REJECTED' };
    default:
      return { kind: 'NEEDS_APPLICATION' };
  }
}

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1, 'Vui lòng nhập tên workspace').max(100, 'Tên tối đa 100 ký tự'),
});
export type CreateWorkspaceForm = z.input<typeof createWorkspaceSchema>;

/** Thông báo cho các lỗi tạo workspace mà backend trả về. */
export function creationErrorMessage(error: ApiError): string {
  switch (error.code) {
    case 'WORKSPACE_ACTIVE_LIMIT_REACHED':
      return 'Bạn đã đạt giới hạn workspace: mỗi chủ trọ chỉ có một workspace đang hoạt động (và tối đa 2 workspace sở hữu). Hãy lưu trữ workspace hiện tại trước khi tạo workspace mới.';
    case 'LANDLORD_APPLICATION_REQUIRED':
      return 'Bạn cần một đơn đăng ký chủ trọ đã được duyệt (và chưa dùng để tạo workspace) mới tạo được workspace.';
    case 'ACCOUNT_DISABLED':
      return 'Tài khoản đã bị khóa nên không thể tạo workspace.';
    default:
      return error.isForbidden ? 'Bạn không có quyền tạo workspace.' : error.message;
  }
}

/** Thông báo cho lỗi lưu trữ / khôi phục workspace. */
export function lifecycleErrorMessage(error: ApiError, action: 'archive' | 'restore'): string {
  switch (error.code) {
    case 'WORKSPACE_ACTIVE_LIMIT_REACHED':
      return 'Không khôi phục được: bạn đã có một workspace đang hoạt động. Mỗi chủ trọ chỉ có một workspace đang hoạt động, hãy lưu trữ workspace đó trước.';
    case 'WORKSPACE_NOT_FOUND':
      return 'Không tìm thấy workspace, hoặc bạn không phải chủ trọ (OWNER) của workspace này.';
    case 'WORKSPACE_ARCHIVED':
      return 'Workspace đã lưu trữ.';
    default:
      if (error.isUnauthorized) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
      return error.isForbidden ? `Bạn không có quyền ${action === 'archive' ? 'lưu trữ' : 'khôi phục'} workspace này.` : error.message;
  }
}
