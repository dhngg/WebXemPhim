import type { ReactNode } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { Compass, Lock, ServerCrash, WifiOff } from 'lucide-react';
import { ButtonLink, Button } from '@/components/ui';

function SystemPage({
  code,
  title,
  description,
  icon,
  action,
}: {
  code: string;
  title: string;
  description: string;
  icon: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="fullpage-center">
      <div className="state">
        <div className="state__icon">{icon}</div>
        <p className="muted text-sm" style={{ fontWeight: 700, letterSpacing: '0.1em' }}>
          {code}
        </p>
        <h1 className="state__title" style={{ fontSize: 'var(--text-2xl)' }}>
          {title}
        </h1>
        <p className="state__desc">{description}</p>
        <div className="row" style={{ marginTop: 'var(--space-2)' }}>
          {action ?? (
            <ButtonLink to="/" variant="dark">
              Về trang chủ
            </ButtonLink>
          )}
        </div>
      </div>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <SystemPage
      code="404"
      title="Không tìm thấy trang"
      description="Đường dẫn không tồn tại hoặc đã bị thay đổi."
      icon={<Compass size={26} aria-hidden="true" />}
    />
  );
}

export function ForbiddenPage({ message }: { message?: string }) {
  return (
    <SystemPage
      code="403"
      title="Bạn không có quyền truy cập"
      description={message ?? 'Tài khoản của bạn không có quyền xem nội dung này. Liên hệ chủ workspace nếu cần.'}
      icon={<Lock size={26} aria-hidden="true" />}
    />
  );
}

export function ServerErrorPage() {
  return (
    <SystemPage
      code="500"
      title="Đã có lỗi xảy ra"
      description="Hệ thống gặp sự cố ngoài ý muốn. Vui lòng thử lại sau ít phút."
      icon={<ServerCrash size={26} aria-hidden="true" />}
      action={
        <Button variant="dark" onClick={() => window.location.reload()}>
          Tải lại trang
        </Button>
      }
    />
  );
}

export function OfflinePage() {
  return (
    <SystemPage
      code="OFFLINE"
      title="Mất kết nối mạng"
      description="Không thể kết nối tới máy chủ. Kiểm tra kết nối Internet rồi thử lại."
      icon={<WifiOff size={26} aria-hidden="true" />}
      action={
        <Button variant="dark" onClick={() => window.location.reload()}>
          Thử lại
        </Button>
      }
    />
  );
}

/** errorElement của router: bắt lỗi render/loader. */
export function RouteErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  if (import.meta.env.DEV) console.error(error);
  return <ServerErrorPage />;
}
