import { Link } from 'react-router-dom';
import { ErrorState } from '@/components/ui';
import { formatMoney } from '@/features/property-management/mappers';
import { tenantErrorMessage } from '@/features/tenant-portal/model';
import { toApiError } from '@/services/http/ApiError';

/** Số tiền do backend trả dạng chuỗi thập phân: chỉ định dạng ở UI, không đổi sang số để tính. */
export const money = (v: string | null | undefined) => (v === null || v === undefined ? '—' : formatMoney(v));

/**
 * Lỗi của trang chi tiết. 404 nghĩa là không tồn tại HOẶC không thuộc hồ sơ đang liên kết (kể cả liên kết đã bị gỡ):
 * backend không phân biệt nên giao diện cũng không tiết lộ thêm, chỉ đưa người dùng về danh sách.
 */
export function DetailError({ error, onRetry, backTo, backLabel }: { error: unknown; onRetry: () => void; backTo: string; backLabel: string }) {
  const api = toApiError(error);
  if (!api.isNotFound) return <ErrorState error={error} onRetry={onRetry} />;
  return (
    <div className="state state--error" role="alert">
      <p className="state__title">Không tìm thấy dữ liệu</p>
      <p className="state__desc">{tenantErrorMessage(error)}</p>
      <Link to={backTo}>← {backLabel}</Link>
    </div>
  );
}
