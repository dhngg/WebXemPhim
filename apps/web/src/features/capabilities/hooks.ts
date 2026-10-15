import { useQuery } from '@tanstack/react-query';
import { capabilitiesApi } from './api';

export const capabilityKeys = { me: ['capabilities'] as const };

/**
 * Quyền hiện tại của user đã đăng nhập. Lấy lại khi đăng nhập/khôi phục phiên, khi quay lại tab
 * (quyền có thể đổi: được thêm/xóa khỏi workspace, được duyệt chủ trọ…) và khi một request nhận 403.
 */
export function useCapabilities(enabled: boolean) {
  return useQuery({
    queryKey: capabilityKeys.me,
    queryFn: () => capabilitiesApi.get(),
    enabled,
    staleTime: 30_000,
    // Quyền có thể đổi bất cứ lúc nào (bị gỡ khỏi workspace, được duyệt…) → lấy lại mỗi lần quay lại tab, kể cả khi chưa "cũ".
    refetchOnWindowFocus: 'always',
    retry: false,
  });
}
