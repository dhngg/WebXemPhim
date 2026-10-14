import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'mock';

export function Badge({
  tone = 'neutral',
  icon,
  children,
  className,
}: {
  tone?: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn('badge', `badge--${tone}`, className)}>
      {icon}
      {children}
    </span>
  );
}

/**
 * Hiển thị trạng thái theo bảng ánh xạ status -> {label, tone}.
 * Luôn có chữ (không chỉ dùng màu) để đảm bảo accessibility.
 */
export function StatusBadge<S extends string>({
  status,
  map,
}: {
  status: S;
  map: Record<S, { label: string; tone: BadgeTone }>;
}) {
  const entry = map[status];
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}

/** Nhãn đánh dấu chức năng đang chạy bằng dữ liệu giả lập. */
export function MockBadge({ children = 'Mock' }: { children?: ReactNode }) {
  return (
    <Badge tone="mock" className="mock-badge">
      {children}
    </Badge>
  );
}
