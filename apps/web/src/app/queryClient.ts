import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/services/http/ApiError';

export const SESSION_EXPIRED_EVENT = 'rp:session-expired';

function notifyIfUnauthorized(error: unknown, key?: readonly unknown[]) {
  // /auth/me trả null khi chưa đăng nhập; đăng nhập sai mật khẩu cũng trả 401 — không tính là "hết phiên".
  if (key?.[0] === 'auth') return;
  if (error instanceof ApiError && error.isUnauthorized) {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
  }
}

export function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({ onError: (error, query) => notifyIfUnauthorized(error, query.queryKey) }),
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => notifyIfUnauthorized(error, mutation.options.mutationKey),
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          // Không retry lỗi nghiệp vụ 4xx; chỉ retry lỗi mạng/5xx tối đa 1 lần.
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
          return failureCount < 1;
        },
      },
    },
  });
}
