import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, Lock, WifiOff } from 'lucide-react';
import { Button } from './Button';
import { toApiError } from '@/services/http/ApiError';
import { cn } from '@/lib/cn';

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="state" role="status">
      <div className="state__icon">{icon ?? <Inbox size={26} aria-hidden="true" />}</div>
      <p className="state__title">{title}</p>
      {description && <p className="state__desc">{description}</p>}
      {action}
    </div>
  );
}

/** Hiển thị lỗi API với thông điệp phù hợp theo mã lỗi + nút thử lại. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const apiError = toApiError(error);
  let title = 'Đã có lỗi xảy ra';
  let icon: ReactNode = <AlertTriangle size={26} aria-hidden="true" />;
  if (apiError.isNetwork) {
    title = 'Mất kết nối';
    icon = <WifiOff size={26} aria-hidden="true" />;
  } else if (apiError.isForbidden) {
    title = 'Bạn không có quyền truy cập';
    icon = <Lock size={26} aria-hidden="true" />;
  } else if (apiError.isNotFound) {
    title = 'Không tìm thấy dữ liệu';
  } else if (apiError.isUnauthorized) {
    title = 'Phiên đăng nhập đã hết hạn';
    icon = <Lock size={26} aria-hidden="true" />;
  }

  return (
    <div className="state state--error" role="alert">
      <div className="state__icon">{icon}</div>
      <p className="state__title">{title}</p>
      <p className="state__desc">{apiError.message}</p>
      {onRetry && !apiError.isForbidden && !apiError.isNotFound && (
        <Button variant="secondary" onClick={onRetry}>
          Thử lại
        </Button>
      )}
    </div>
  );
}

export function Skeleton({
  width,
  height = 16,
  className,
}: {
  width?: number | string;
  height?: number | string;
  className?: string;
}) {
  return <div className={cn('skeleton', className)} style={{ width, height }} aria-hidden="true" />;
}

export function LoadingBlock({ label = 'Đang tải…', lines = 3 }: { label?: string; lines?: number }) {
  return (
    <div className="stack" role="status" aria-live="polite" style={{ padding: 'var(--space-5)' }}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={18} width={`${90 - i * 15}%`} />
      ))}
    </div>
  );
}
