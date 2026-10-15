import { useCurrentUser } from './hooks';
import { lastWorkspace } from '@/features/workspaces/hooks';
import { useCapabilities } from '@/features/capabilities/hooks';
import { areasOf, homeFor, type Area, type Capabilities } from '@/features/capabilities/model';

export type { Area, Capabilities };

/**
 * Quyền hiện tại của người dùng, lấy từ backend (`/users/me/capabilities`), KHÔNG suy ra từ email,
 * localStorage hay một vai trò cố định. Một user có thể đồng thời có nhiều khu vực
 * (chủ trọ ở nhiều workspace, người thuê, quản trị…). Đây chỉ là phân tách giao diện — backend vẫn là
 * nơi kiểm tra quyền cuối cùng cho mọi request.
 */
export function useAppRole() {
  const me = useCurrentUser();
  const user = me.data ?? null;
  const query = useCapabilities(Boolean(user));
  const capabilities: Capabilities | null = user ? (query.data ?? null) : null;
  const areas = areasOf(capabilities);
  return {
    user,
    isGuest: !me.isLoading && !user,
    capabilities,
    areas,
    has: (area: Area) => areas.includes(area),
    /** Trang chủ theo quyền thật; '/' khi chưa biết quyền (đang tải / lỗi). */
    home: homeFor(capabilities, lastWorkspace.get()),
    isLoading: me.isLoading || (Boolean(user) && query.isLoading),
    /** Lỗi khi tải quyền (mạng, 401/403…): giao diện phải hiển thị, không được coi như "không có quyền". */
    error: user ? query.error : null,
    refetch: () => query.refetch(),
  };
}
