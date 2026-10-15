import type { Invoice } from '@/features/billing/types';
import { invoiceBalance, invoiceGrandTotal } from '@/features/billing/calc';
import { formatDateTime, formatNumber, formatVnd } from '@/lib/format';

// ===================================================================== Invoice lines (dùng chung với cổng người thuê)
/** Bảng dòng hóa đơn theo mô hình legacy: chỉ còn dùng ở Cổng người thuê (FE-08). */
export function InvoiceLinesTable({ invoice }: { invoice: Invoice }) {
  return (
    <>
      <div className="table-wrap">
        <table className="table table--stack">
          <thead>
            <tr>
              <th>Khoản phí</th>
              <th className="num">Số lượng</th>
              <th className="num">Đơn giá (snapshot)</th>
              <th className="num">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((l, i) => (
              <tr key={i}>
                <td data-label="Khoản phí">
                  <p className="cell-title">{l.label}</p>
                  {l.note && <p className="cell-sub">{l.note}</p>}
                </td>
                <td data-label="Số lượng" className="num">
                  {formatNumber(l.quantity)} {l.unit}
                </td>
                <td data-label="Đơn giá" className="num">
                  {formatVnd(l.unitPrice)}
                  {l.key === 'rent' ? '/tháng' : ''}
                </td>
                <td data-label="Thành tiền" className="num">
                  {formatVnd(l.amount)}
                </td>
              </tr>
            ))}
            {invoice.adjustments.map((a) => (
              <tr key={a.id}>
                <td data-label="Điều chỉnh">
                  <p className="cell-title">Điều chỉnh: {a.reason}</p>
                  <p className="cell-sub">
                    {a.by} • {formatDateTime(a.at)}
                  </p>
                </td>
                <td />
                <td />
                <td data-label="Thành tiền" className="num">
                  {a.amount > 0 ? '+' : ''}
                  {formatVnd(a.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="totals">
        <div>
          <span>Tổng phát hành</span>
          <span>{formatVnd(invoice.total)}</span>
        </div>
        {invoice.adjustments.length > 0 && (
          <div>
            <span>Sau điều chỉnh</span>
            <span>{formatVnd(invoiceGrandTotal(invoice))}</span>
          </div>
        )}
        <div>
          <span>Đã thu (đã xác nhận)</span>
          <span>− {formatVnd(invoice.paidConfirmed)}</span>
        </div>
        <div className="totals__grand">
          <span>Còn nợ</span>
          <span className={invoiceBalance(invoice) > 0 ? 'danger-text' : undefined}>{formatVnd(invoiceBalance(invoice))}</span>
        </div>
      </div>
    </>
  );
}
