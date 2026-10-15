import type { UserCapabilitiesResponse } from '@rental/shared';
import type { WorkspaceMembership } from '@/features/workspaces/types';

/** Quyền thật của user, do backend tính từ quan hệ trong DB (`GET /users/me/capabilities`). */
export type Capabilities = UserCapabilitiesResponse;

/**
 * Khu vực giao diện. Một user có thể thuộc nhiều khu vực cùng lúc:
 * - market: tìm trọ (công khai, ai cũng vào được);
 * - landlord: là OWNER của ít nhất một workspace (V1 không có MANAGER/STAFF);
 * - tenant: có liên kết người thuê còn hiệu lực;
 * - admin: Platform Admin.
 */
export type Area = 'market' | 'landlord' | 'tenant' | 'admin';

/** Thứ tự hiển thị trong bộ chuyển khu vực. */
export const AREA_ORDER: Area[] = ['market', 'landlord', 'tenant', 'admin'];

/** Thứ tự ưu tiên khi chọn trang đích sau đăng nhập (chỉ giữa các khu vực mà user thực sự có). */
const LANDING_PRIORITY: Area[] = ['admin', 'landlord', 'tenant', 'market'];

/**
 * Chính sách V1: chỉ membership OWNER mở khu vực chủ trọ. MANAGER/STAFF (dữ liệu cũ, backend có thể còn trả)
 * bị loại ngay từ nguồn quyền, nên không thể hiện thành quyền chủ trọ ở bất kỳ màn hình nào.
 * Tenant, Platform Admin và các workspace OWNER của cùng user không bị ảnh hưởng.
 */
export function applyV1Policy(caps: Capabilities): Capabilities {
  return { ...caps, workspaces: caps.workspaces.filter((w) => w.role === 'OWNER') };
}

/** Khách và user chưa có quyền nào khác chỉ có khu vực công khai. */
export function areasOf(caps: Capabilities | null | undefined): Area[] {
  const has: Record<Area, boolean> = {
    market: true,
    landlord: Boolean(caps?.workspaces.length),
    tenant: Boolean(caps?.tenantLinks.length),
    admin: caps?.isPlatformAdmin === true,
  };
  return AREA_ORDER.filter((area) => has[area]);
}

/**
 * Workspace mặc định để vào: ưu tiên workspace dùng gần nhất NẾU user vẫn còn là thành viên
 * (giá trị lưu trong trình duyệt chỉ là gợi ý, luôn đối chiếu lại với quyền thật), rồi workspace
 * đang hoạt động đầu tiên, rồi workspace đầu tiên.
 */
export function pickWorkspace(caps: Capabilities | null | undefined, lastWorkspaceId?: string | null) {
  const list = caps?.workspaces ?? [];
  return list.find((w) => w.id === lastWorkspaceId) ?? list.find((w) => w.status === 'ACTIVE') ?? list[0];
}

/** Trang chủ của user theo quyền thật. */
export function homeFor(caps: Capabilities | null | undefined, lastWorkspaceId?: string | null): string {
  const areas = areasOf(caps);
  const area = LANDING_PRIORITY.find((a) => areas.includes(a)) ?? 'market';
  switch (area) {
    case 'admin':
      return '/admin';
    case 'landlord': {
      const ws = pickWorkspace(caps, lastWorkspaceId);
      return ws ? `/w/${ws.id}/dashboard` : '/workspaces/select';
    }
    case 'tenant':
      return '/tenant';
    default:
      return '/';
  }
}

/** Chuyển workspace của capabilities sang kiểu mà các màn hình workspace hiện có đang dùng. */
export function toMembership(w: Capabilities['workspaces'][number]): WorkspaceMembership {
  return { workspaceId: w.id, name: w.name, status: w.status, role: w.role };
}
