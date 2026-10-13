import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useCurrentUser } from '@/features/auth/hooks';
import { landingFor, safeRedirect } from '@/features/auth/landing';
import { ErrorState, LoadingBlock } from '@/components/ui';
import { ForbiddenPage } from '@/pages/system/ErrorPages';

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

/** Chỉ ADMIN toàn cục. Backend vẫn kiểm tra quyền thật. */
export function RequireAdmin({ children }: { children?: ReactNode }) {
  const { data: user } = useCurrentUser();
  if (user?.globalRole !== 'ADMIN') return <ForbiddenPage />;
  return children ?? <Outlet />;
}

/** Cổng người thuê yêu cầu hồ sơ thuê đã liên kết; chưa liên kết -> trang liên kết. */
export function RequireLinkedTenant({ children }: { children?: ReactNode }) {
  const { data: user } = useCurrentUser();
  if (!user?.tenantLinked) return <Navigate to="/tenant/link-account" replace />;
  return children ?? <Outlet />;
}

/** Trang chỉ dành cho khách (login/register) — đã đăng nhập thì chuyển đi. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { data: user, isLoading } = useCurrentUser();
  const location = useLocation();
  if (isLoading) return <FullPageLoading />;
  if (user) {
    const redirect = safeRedirect(new URLSearchParams(location.search).get('redirect'));
    return <Navigate to={redirect ?? landingFor(user)} replace />;
  }
  return children;
}
