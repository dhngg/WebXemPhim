import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { InvoiceAdjustmentResponse, InvoiceItemResponse, InvoicePaymentResponse, InvoiceResponse } from '@rental/shared';
import {
  DataTable,
  EmptyState,
  FilterBar,
  KeyValueList,
  LoadingBlock,
  PageHeader,
  Pagination,
  Section,
  StatusBadge,
  type Column,
} from '@/components/ui';
import { INVOICE_STATUS, ITEM_TYPE, PAYMENT_STATUS } from '@/features/invoices/labels';
import { formatSignedMoney } from '@/features/invoices/mappers';
import { PAYMENT_ENTRY_KIND, PAYMENT_METHOD } from '@/features/payments/labels';
import { useTenantAdjustments, useTenantInvoice, useTenantInvoices, useTenantPayments } from '@/features/tenant-portal/hooks';
import { PAGE_SIZE } from '@/features/tenant-portal/model';
import { formatDecimal } from '@/features/utilities/mappers';
import { useSearchState } from '@/hooks/useSearchState';
import { periodLabel } from '@/lib/dates';
import { formatDate, formatDateTime } from '@/lib/format';
import { DetailError, money } from './parts';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** TPT-03 — hóa đơn của tôi (chỉ hóa đơn đã phát hành; bản nháp không bao giờ tới người thuê). Lọc theo kỳ, phân trang thật. */
export function TenantInvoicesPage() {
  const navigate = useNavigate();
  const [s, set] = useSearchState(['period', 'page'] as const);
  const page = Math.max(1, Number(s.page) || 1);
  const period = MONTH.test(s.period) ? s.period : undefined;
  const list = useTenantInvoices({ period, page, limit: PAGE_SIZE });

  const columns: Column<InvoiceResponse>[] = [
    {
      key: 'period',
      header: 'Kỳ',
      render: (i) => (
        <Link to={`/tenant/invoices/${i.id}`} className="cell-title">
          {periodLabel(i.period)}
        </Link>
      ),
    },
    { key: 'total', header: 'Sau điều chỉnh', align: 'right', render: (i) => money(i.adjustedTotal) },
    { key: 'paid', header: 'Đã thanh toán', align: 'right', render: (i) => money(i.paidTotal) },
    { key: 'out', header: 'Còn phải thanh toán', align: 'right', render: (i) => <strong className={Number(i.outstanding) > 0 ? 'danger-text' : undefined}>{money(i.outstanding)}</strong> },
    { key: 'due', header: 'Hạn thanh toán', render: (i) => (i.dueDate ? formatDate(i.dueDate) : '—') },
    {
      key: 'st',
      header: 'Trạng thái',
      render: (i) => (
        <span className="row">
          <StatusBadge status={i.status} map={INVOICE_STATUS} />
          {i.paymentStatus && <StatusBadge status={i.paymentStatus} map={PAYMENT_STATUS} />}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Hóa đơn của tôi" description="Hóa đơn đã phát hành cho các hợp đồng của bạn. Thanh toán do chủ trọ ghi nhận vào sổ." />
      <Section flush>
        <FilterBar>
          <input className="input" type="month" aria-label="Kỳ" value={s.period} onChange={(e) => set({ period: e.target.value, page: '' })} style={{ minWidth: 150 }} />
        </FilterBar>
        <DataTable
          columns={columns}
          rows={list.data?.items}
          rowKey={(i) => i.id}
          isLoading={list.isLoading}
          error={list.error}
          onRetry={() => list.refetch()}
          onRowClick={(i) => navigate(`/tenant/invoices/${i.id}`)}
          empty={<EmptyState title="Chưa có hóa đơn" description={period ? 'Không có hóa đơn nào trong kỳ này.' : 'Hóa đơn sẽ hiện ở đây sau khi chủ trọ phát hành.'} />}
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onChange={(p) => set({ page: String(p) })} />
      </Section>
    </>
  );
}

const itemColumns: Column<InvoiceItemResponse>[] = [
  { key: 'type', header: 'Loại', render: (i) => ITEM_TYPE[i.itemType] },
  {
    key: 'desc',
    header: 'Nội dung',
    render: (i) => (
      <>
        <p className="cell-title">{i.description}</p>
        <p className="cell-sub">{i.code}</p>
      </>
    ),
  },
  { key: 'qty', header: 'Số lượng', align: 'right', render: (i) => `${formatDecimal(i.quantity)} ${i.unit}` },
  { key: 'price', header: 'Đơn giá', align: 'right', render: (i) => `${formatDecimal(i.unitPrice)} ₫` },
  { key: 'ratio', header: 'Tỷ lệ kỳ', align: 'right', render: (i) => (i.prorationNumerator && i.prorationDenominator ? `${i.prorationNumerator}/${i.prorationDenominator} ngày` : '—') },
  { key: 'amount', header: 'Thành tiền', align: 'right', render: (i) => money(i.amount) },
];

/** TPT-04 — chi tiết hóa đơn: các dòng tiền, tổng, sổ thanh toán và sổ điều chỉnh (mỗi sổ phân trang riêng). */
export function TenantInvoiceDetailPage() {
  const { invoiceId } = useParams();
  const invoice = useTenantInvoice(invoiceId);
  const inv = invoice.data;

  if (invoice.isLoading) return <LoadingBlock lines={6} />;
  if (invoice.error || !inv) return <DetailError error={invoice.error} onRetry={() => invoice.refetch()} backTo="/tenant/invoices" backLabel="Về danh sách hóa đơn" />;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Hóa đơn', to: '/tenant/invoices' }, { label: periodLabel(inv.period) }]}
        title={`Hóa đơn kỳ ${periodLabel(inv.period)}`}
        description={inv.dueDate ? `Hạn thanh toán ${formatDate(inv.dueDate)}` : undefined}
        eyebrow={
          <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
            <StatusBadge status={inv.status} map={INVOICE_STATUS} />
            {inv.paymentStatus && <StatusBadge status={inv.paymentStatus} map={PAYMENT_STATUS} />}
          </div>
        }
      />
      <div className="grid grid--main-side">
        <div className="stack">
          <Section title="Các dòng tiền" flush>
            <DataTable columns={itemColumns} rows={inv.items} rowKey={(i) => i.id} empty={<EmptyState title="Chưa có dòng tiền" />} />
          </Section>
          <PaymentsSection invoiceId={inv.id} />
          <AdjustmentsSection invoiceId={inv.id} />
        </div>
        <div className="stack">
          <Section title="Tổng tiền">
            <KeyValueList
              items={[
                { label: 'Tổng hóa đơn', value: money(inv.totalAmount) },
                { label: 'Điều chỉnh', value: inv.adjustmentsTotal === null ? '—' : formatSignedMoney(inv.adjustmentsTotal) },
                { label: 'Sau điều chỉnh', value: money(inv.adjustedTotal) },
                { label: 'Đã thanh toán', value: money(inv.paidTotal) },
                { label: 'Còn phải thanh toán', value: <strong className={Number(inv.outstanding) > 0 ? 'danger-text' : undefined}>{money(inv.outstanding)}</strong> },
                { label: 'Thanh toán', value: inv.paymentStatus ? PAYMENT_STATUS[inv.paymentStatus].label : '—' },
              ]}
            />
          </Section>
          <Section title="Thông tin">
            <KeyValueList
              items={[
                { label: 'Hợp đồng', value: <Link to={`/tenant/contracts/${inv.contractId}`}>Xem hợp đồng</Link> },
                { label: 'Hạn thanh toán', value: inv.dueDate ? formatDate(inv.dueDate) : '—' },
                { label: 'Số người ở', value: inv.occupantCount === null ? '—' : String(inv.occupantCount) },
                { label: 'Tính phí xe', value: inv.billsVehicles === null ? 'Chưa quyết định' : inv.billsVehicles ? 'Có' : 'Không' },
                { label: 'Ghi chú', value: inv.notes ?? '—' },
                { label: 'Quy tắc làm tròn', value: inv.roundingRule },
                ...(inv.issuedAt ? [{ label: 'Phát hành lúc', value: formatDateTime(inv.issuedAt) }] : []),
              ]}
            />
          </Section>
        </div>
      </div>
    </>
  );
}

/** Sổ thanh toán của hóa đơn (chỉ xem): số liệu tổng do backend trả cho cả hóa đơn, không cộng từ trang đang xem. */
function PaymentsSection({ invoiceId }: { invoiceId: string }) {
  const [page, setPage] = useState(1);
  const ledger = useTenantPayments(invoiceId, { page, limit: PAGE_SIZE });
  const d = ledger.data;

  const columns: Column<InvoicePaymentResponse>[] = [
    { key: 'at', header: 'Nhận lúc', render: (p) => formatDateTime(p.receivedAt) },
    { key: 'kind', header: 'Loại', render: (p) => <StatusBadge status={p.kind} map={PAYMENT_ENTRY_KIND} /> },
    { key: 'amount', header: 'Số tiền', align: 'right', render: (p) => <strong>{money(p.amount)}</strong> },
    { key: 'method', header: 'Hình thức', render: (p) => PAYMENT_METHOD[p.method] },
    {
      key: 'note',
      header: 'Ghi chú',
      render: (p) => (
        <>
          {p.note ?? (p.kind === 'PAYMENT' && !p.reversedByPaymentId ? '—' : '')}
          {p.kind === 'REVERSAL' && <p className="cell-sub">Hủy một khoản đã ghi nhận</p>}
          {p.reversedByPaymentId && <p className="cell-sub">Khoản này đã bị đảo</p>}
        </>
      ),
    },
  ];

  return (
    <Section title="Lịch sử thanh toán" subtitle="Do chủ trọ ghi nhận; không có thanh toán chờ xác nhận." flush>
      {d && (
        <div style={{ padding: 'var(--space-4)' }}>
          <KeyValueList
            items={[
              { label: 'Số phải thu', value: money(d.amountDue) },
              { label: 'Đã thanh toán', value: money(d.paidTotal) },
              { label: 'Còn phải thanh toán', value: money(d.outstanding) },
              { label: 'Thanh toán', value: PAYMENT_STATUS[d.paymentStatus].label },
            ]}
          />
        </div>
      )}
      <DataTable
        columns={columns}
        rows={d?.items}
        rowKey={(p) => p.id}
        isLoading={ledger.isLoading}
        error={ledger.error}
        onRetry={() => ledger.refetch()}
        empty={<EmptyState title="Chưa có thanh toán" description="Khoản thu sẽ hiện ở đây sau khi chủ trọ ghi nhận." />}
      />
      <Pagination page={page} pageSize={PAGE_SIZE} total={d?.total ?? 0} onChange={setPage} />
    </Section>
  );
}

/** Sổ điều chỉnh của hóa đơn (chỉ xem). Bút toán không sửa/xóa; sai sót được sửa bằng bút toán mới tham chiếu bút toán cũ. */
function AdjustmentsSection({ invoiceId }: { invoiceId: string }) {
  const [page, setPage] = useState(1);
  const ledger = useTenantAdjustments(invoiceId, { page, limit: PAGE_SIZE });
  const d = ledger.data;

  const columns: Column<InvoiceAdjustmentResponse>[] = [
    { key: 'at', header: 'Thời điểm', render: (a) => formatDateTime(a.createdAt) },
    {
      key: 'amount',
      header: 'Số tiền',
      align: 'right',
      render: (a) => (
        <>
          <strong>{formatSignedMoney(a.amount)}</strong>
          {Number(a.requestedAmount) !== Number(a.amount) && <p className="cell-sub">nhập {a.requestedAmount}, làm tròn 1 đồng</p>}
        </>
      ),
    },
    {
      key: 'reason',
      header: 'Lý do',
      render: (a) => (
        <>
          <p>{a.reason}</p>
          {a.referenceAdjustmentId && <p className="cell-sub">Sửa lại bút toán trước đó</p>}
        </>
      ),
    },
  ];

  return (
    <Section title="Điều chỉnh" subtitle="Bút toán không sửa hay xóa được; sai sót được sửa bằng bút toán mới." flush>
      {d && (
        <div style={{ padding: 'var(--space-4)' }}>
          <KeyValueList
            items={[
              { label: 'Tổng ban đầu', value: money(d.originalTotal) },
              { label: 'Điều chỉnh', value: formatSignedMoney(d.adjustmentsTotal) },
              { label: 'Sau điều chỉnh', value: money(d.adjustedTotal) },
            ]}
          />
        </div>
      )}
      <DataTable
        columns={columns}
        rows={d?.items}
        rowKey={(a) => a.id}
        isLoading={ledger.isLoading}
        error={ledger.error}
        onRetry={() => ledger.refetch()}
        empty={<EmptyState title="Không có điều chỉnh" description="Hóa đơn này chưa bị điều chỉnh." />}
      />
      <Pagination page={page} pageSize={PAGE_SIZE} total={d?.total ?? 0} onChange={setPage} />
    </Section>
  );
}
