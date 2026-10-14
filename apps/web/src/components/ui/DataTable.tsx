import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { EmptyState, ErrorState, LoadingBlock } from './States';

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Nhãn hiển thị trên mobile (dạng card). Mặc định dùng header nếu là string. */
  label?: string;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right';
  width?: number | string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  empty?: ReactNode;
  caption?: string;
  onRowClick?: (row: T) => void;
}

/**
 * Bảng dữ liệu có đủ trạng thái loading / error / empty.
 * Trên màn < 768px tự chuyển thành dạng card (mỗi ô hiển thị nhãn cột).
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  isLoading,
  error,
  onRetry,
  empty,
  caption,
  onRowClick,
}: DataTableProps<T>) {
  if (isLoading) return <LoadingBlock lines={5} />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (!rows || rows.length === 0) return <>{empty ?? <EmptyState title="Chưa có dữ liệu" />}</>;

  return (
    <div className="table-wrap">
      <table className="table table--stack">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn(c.align === 'right' && 'num')} style={{ width: c.width }}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={cn(onRowClick && 'table__row--click')}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(c.align === 'right' && 'num')}
                  data-label={c.label ?? (typeof c.header === 'string' ? c.header : '')}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
