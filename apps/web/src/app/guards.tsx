import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useCurrentUser } from '@/features/auth/hooks';
import { safeRedirect } from '@/features/auth/landing';
import { ErrorState, LoadingBlock } from '@/components/ui';
import { useAppRole, type Area } from '@/features/auth/role';

function FullPageLoading() {
  return (
    <div className="fullpage-center">
      <div style={{ width: 320 }}>
        <LoadingBlock label="Đang kiểm tra phiên đăng nhập…" />
      </div>
    </div>
  );
}

/** Yêu cầu đăng nhập; chưa đăng nhập -> /login?redirect=<đường dẫn hiện tại>. */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { data: user, isLoading, error, refetch } = useCurrentUser();
  const location = useLocation();

  if (isLoading) return <FullPageLoading />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!user) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }
  return children ?? <Outlet />;
}

/**
 * Chỉ cho user CÓ khu vực `area` (theo quyền thật từ backend) vào nhánh route này. Khu vực khác bị đưa
 * về trang chủ của chính họ. `market` là khu công khai nên ai cũng vào được (không chờ tải quyền).
 * Chỉ là phân tách giao diện — backend vẫn kiểm tra quyền cho mọi request.
 */
export function RequireArea({ area, children }: { area: Area; children?: ReactNode }) {
  const { has, home, isLoading, error, refetch } = useAppRole();
  if (area === 'market') return children ?? <Outlet />;
  if (isLoading) return <FullPageLoading />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!has(area)) return <Navigate to={home} replace />;
  return children ?? <Outlet />;
}

/** Trang chỉ dành cho khách (login/register) — đã đăng nhập thì chuyển đi. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { user, home, isLoading } = useAppRole();
  const location = useLocation();
  if (isLoading) return <FullPageLoading />;
  if (user) {
    const redirect = safeRedirect(new URLSearchParams(location.search).get('redirect'));
    return <Navigate to={redirect ?? home} replace />;
  }
  return children;
}
