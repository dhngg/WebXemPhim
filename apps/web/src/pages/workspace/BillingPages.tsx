import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, CheckCircle2, FileText, Plus, Receipt, Save, XCircle } from 'lucide-react';
import {
  Badge,
  Button,
  ButtonLink,
  ConfirmDialog,
  CurrencyInput,
  DataTable,
  DatePicker,
  EmptyState,
  ErrorState,
  FilterBar,
  FormField,
  ImageUploader,
  KeyValueList,
  LoadingBlock,
  Modal,
  PageHeader,
  SearchInput,
  Section,
  Select,
  StatCard,
  StatusBadge,
  Tabs,
  useToast,
  type Column,
} from '@/components/ui';
import {
  useAddAdjustment,
  useBillingPreview,
  useConfirmPayment,
  useCreateDeposit,
  useCreateRate,
  useDeposits,
  useInvoice,
  useInvoices,
  useMeterSheet,
  usePayments,
  useRates,
  useRecordPayment,
  useRejectPayment,
  useRunBilling,
  useSaveMeter,
} from '@/features/billing/hooks';
import type { MeterSheetRow } from '@/features/billing/api';
import { DEPOSIT_TYPE, INVOICE_STATUS, PAYMENT_METHOD, PAYMENT_STATUS } from '@/features/billing/labels';
import { invoiceBalance, invoiceGrandTotal, rateForDate } from '@/features/billing/calc';
import type { BillingRunResult, DepositTxType, Invoice, InvoiceStatus, Payment, PaymentMethod, PaymentStatus, RateVersion } from '@/features/billing/types';
import { useContracts } from '@/features/leasing/hooks';
import { useWorkspaceContext } from '@/hooks/useWorkspaceContext';
import { useSearchState } from '@/hooks/useSearchState';
import { addMonths, currentPeriod, periodLabel, todayVN } from '@/lib/dates';
import { formatDate, formatDateTime, formatNumber, formatVnd } from '@/lib/format';
import { toApiError } from '@/services/http/ApiError';
import { ForbiddenPage } from '@/pages/system/ErrorPages';

function PeriodSelect({ value, onChange, months = 12, future = 1 }: { value: string; onChange: (p: string) => void; months?: number; future?: number }) {
  const now = currentPeriod();
  const options = Array.from({ length: months + future }, (_, i) => addMonths(now, future - i));
  return (
    <Select aria-label="Kỳ tính tiền" value={value} onChange={(e) => onChange(e.target.value)} style={{ minWidth: 140 }}>
      {options.map((p) => (
        <option key={p} value={p}>
          Kỳ {periodLabel(p)}
        </option>
      ))}
    </Select>
  );
}

// ===================================================================== Rates
const rateSchema = z.object({
  effectiveFrom: z.string().min(1, 'Chọn ngày áp dụng'),
  electricityPerKwh: z.number({ invalid_type_error: 'Bắt buộc' }).int().min(0),
  waterPerPerson: z.number({ invalid_type_error: 'Bắt buộc' }).int().min(0),
  waterPerM3: z.number({ invalid_type_error: 'Bắt buộc' }).int().min(0),
  internet: z.number({ invalid_type_error: 'Bắt buộc' }).int().min(0),
  sanitation: z.number({ invalid_type_error: 'Bắt buộc' }).int().min(0),
});
type RateForm = z.input<typeof rateSchema>;

/** RATE-01 */
export function RatesPage() {
  const { ws, can } = useWorkspaceContext();
  const { data, isLoading, error, refetch } = useRates(ws);
  const create = useCreateRate(ws);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const today = todayVN();
  const current = data ? rateForDate(data, today) : undefined;
  const form = useForm<RateForm>({ resolver: zodResolver(rateSchema) });

  const columns: Column<RateVersion>[] = [
    {
      key: 'from',
      header: 'Áp dụng từ',
      render: (r) => (
        <span className="row">
          <strong>{formatDate(r.effectiveFrom)}</strong>
          {r.id === current?.id && <Badge tone="success">Đang áp dụng</Badge>}
          {r.effectiveFrom > today && <Badge tone="info">Sắp áp dụng</Badge>}
        </span>
      ),
    },
    { key: 'e', header: 'Điện (đ/kWh)', align: 'right', render: (r) => formatNumber(r.electricityPerKwh) },
    { key: 'w', header: 'Nước (đ/người)', align: 'right', render: (r) => formatNumber(r.waterPerPerson) },
    { key: 'm3', header: 'Nước (đ/m³)', align: 'right', render: (r) => formatNumber(r.waterPerM3) },
    { key: 'i', header: 'Internet', align: 'right', render: (r) => formatNumber(r.internet) },
    { key: 's', header: 'Rác & VS', align: 'right', render: (r) => formatNumber(r.sanitation) },
    { key: 'by', header: 'Tạo bởi', render: (r) => <span className="cell-sub">{r.createdBy} • {formatDate(r.createdAt)}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Bảng giá dịch vụ"
        description="Đơn giá theo phiên bản effectiveFrom. Hóa đơn đã phát hành giữ snapshot đơn giá, không tự cập nhật theo bảng giá mới."
        actions={
          can('billing.run') && (
            <Button
              variant="dark"
              onClick={() => {
                form.reset({
                  effectiveFrom: `${addMonths(currentPeriod(), 1)}-01`,
                  electricityPerKwh: current?.electricityPerKwh ?? 3500,
                  waterPerPerson: current?.waterPerPerson ?? 100_000,
                  waterPerM3: current?.waterPerM3 ?? 18_000,
                  internet: current?.internet ?? 100_000,
                  sanitation: current?.sanitation ?? 30_000,
                });
                setOpen(true);
              }}
            >
              <Plus size={16} aria-hidden="true" /> Tạo phiên bản đơn giá
            </Button>
          )
        }
      />
      <Section flush>
        <DataTable columns={columns} rows={data} rowKey={(r) => r.id} isLoading={isLoading} error={error} onRetry={() => refetch()} empty={<EmptyState title="Chưa có bảng giá" description="Cần ít nhất một phiên bản đơn giá để lập hóa đơn." />} />
      </Section>
      <Modal open={open} title="Phiên bản đơn giá mới" description="Không sửa phiên bản cũ — tạo phiên bản mới với ngày áp dụng." onClose={() => setOpen(false)}>
        <form
          className="stack"
          noValidate
          onSubmit={form.handleSubmit(async (v) => {
            try {
              await create.mutateAsync(rateSchema.parse(v));
              toast.success('Đã tạo phiên bản đơn giá.');
              setOpen(false);
            } catch (e) {
              const err = toApiError(e);
              if (err.isConflict) form.setError('effectiveFrom', { message: err.message });
              else toast.error(err.message);
            }
          })}
        >
          <FormField label="Áp dụng từ ngày" required error={form.formState.errors.effectiveFrom?.message}>
            <DatePicker {...form.register('effectiveFrom')} />
          </FormField>
          <div className="form-grid form-grid--2">
            {(
              [
                ['electricityPerKwh', 'Điện (đ/kWh)'],
                ['waterPerPerson', 'Nước theo người (đ/người/tháng)'],
                ['waterPerM3', 'Nước theo đồng hồ (đ/m³)'],
                ['internet', 'Internet (đ/phòng/tháng)'],
                ['sanitation', 'Rác & vệ sinh (đ/phòng/tháng)'],
              ] as const
            ).map(([name, label]) => (
              <FormField key={name} label={label} required error={form.formState.errors[name]?.message}>
                <Controller control={form.control} name={name} render={({ field }) => <CurrencyInput value={field.value} onChange={field.onChange} />} />
              </FormField>
            ))}
          </div>
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" variant="dark" loading={create.isPending}>
              Tạo phiên bản
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ===================================================================== Meters
function MeterRow({ row, period, disabled }: { row: MeterSheetRow; period: string; disabled: boolean }) {
  const { ws } = useWorkspaceContext();
  const save = useSaveMeter(ws);
  const toast = useToast();
  const init = () => ({
    eo: row.reading?.electricOld ?? row.previous?.electric ?? 0,
    en: row.reading?.electricNew ?? ('' as number | ''),
    wo: row.reading?.waterOld ?? row.previous?.water ?? 0,
    wn: row.reading?.waterNew ?? ('' as number | ''),
  });
  const [v, setV] = useState(init);
  useEffect(() => setV(init()), [row.reading?.id, row.reading?.recordedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const [err, setErr] = useState<string | null>(null);

  const dirty =
    v.en !== '' &&
    v.wn !== '' &&
    (!row.reading || v.en !== row.reading.electricNew || v.wn !== row.reading.waterNew || v.eo !== row.reading.electricOld || v.wo !== row.reading.waterOld);

  function submit() {
    if (v.en === '' || v.wn === '') return;
    if (v.en < v.eo) return setErr('Số điện mới < số cũ');
    if (v.wn < v.wo) return setErr('Số nước mới < số cũ');
    setErr(null);
    save.mutate(
      { roomId: row.roomId, period, electricOld: v.eo, electricNew: v.en, waterOld: v.wo, waterNew: v.wn },
      { onSuccess: () => toast.success(`Đã lưu chỉ số ${row.roomCode}.`), onError: (e) => setErr(toApiError(e).message) },
    );
  }
  const num = (s: string): number | '' => (s === '' ? '' : Math.max(0, Number(s)));

  return (
    <tr>
      <td data-label="Phòng">
        <p className="cell-title">{row.roomCode}</p>
        <p className="cell-sub">{row.buildingName}</p>
      </td>
      <td data-label="Điện cũ → mới">
        <div className="row">
          <input className="input meter-input" type="number" aria-label={`Điện cũ ${row.roomCode}`} value={v.eo} disabled={disabled} onChange={(e) => setV({ ...v, eo: Number(e.target.value) || 0 })} />
          →
          <input className="input meter-input" type="number" aria-label={`Điện mới ${row.roomCode}`} value={v.en} disabled={disabled} aria-invalid={v.en !== '' && v.en < v.eo} onChange={(e) => setV({ ...v, en: num(e.target.value) })} />
        </div>
      </td>
      <td data-label="Tiêu thụ" className="num">
        {v.en !== '' ? `${formatNumber(Math.max(0, v.en - v.eo))} kWh` : '—'}
      </td>
      <td data-label="Nước cũ → mới">
        <div className="row">
          <input className="input meter-input" type="number" aria-label={`Nước cũ ${row.roomCode}`} value={v.wo} disabled={disabled} onChange={(e) => setV({ ...v, wo: Number(e.target.value) || 0 })} />
          →
          <input className="input meter-input" type="number" aria-label={`Nước mới ${row.roomCode}`} value={v.wn} disabled={disabled} aria-invalid={v.wn !== '' && v.wn < v.wo} onChange={(e) => setV({ ...v, wn: num(e.target.value) })} />
        </div>
      </td>
      <td data-label="Trạng thái">
        {err ? (
          <span className="field__error" role="alert">
            {err}
          </span>
        ) : row.reading ? (
          <Badge tone="success">Đã ghi {formatDate(row.reading.recordedAt)}</Badge>
        ) : (
          <Badge tone="warning">Chưa ghi</Badge>
        )}
      </td>
      <td>
        {!disabled && (
          <Button size="sm" variant={dirty ? 'dark' : 'secondary'} disabled={!dirty} loading={save.isPending} onClick={submit}>
            <Save size={14} /> Lưu
          </Button>
        )}
      </td>
    </tr>
  );
}

/** METER-01 */
export function MetersPage() {
  const { ws, base, can } = useWorkspaceContext();
  const [s, set] = useSearchState(['period'] as const);
  const period = s.period || currentPeriod();
  const { data, isLoading, error, refetch } = useMeterSheet(ws, period);
  const [q, setQ] = useState('');
  const rows = (data ?? []).filter((r) => !q || `${r.roomCode} ${r.buildingName}`.toLowerCase().includes(q.toLowerCase()));
  const missing = (data ?? []).filter((r) => !r.reading).length;

  return (
    <>
      <PageHeader
        title="Ghi chỉ số điện nước"
        description="Số cũ tự gợi ý từ chỉ số mới của kỳ trước. Kỳ đã phát hành hóa đơn sẽ bị khóa sửa."
        actions={
          can('billing.run') && (
            <ButtonLink to={`${base}/billing/run?period=${period}`} variant="dark">
              <Receipt size={16} aria-hidden="true" /> Lập hóa đơn kỳ {periodLabel(period)}
            </ButtonLink>
          )
        }
      />
      <Section flush>
        <FilterBar actions={missing > 0 ? <Badge tone="warning">{missing} phòng chưa ghi</Badge> : data?.length ? <Badge tone="success">Đã ghi đủ</Badge> : null}>
          <PeriodSelect value={period} onChange={(p) => set({ period: p })} />
          <SearchInput value={q} onChange={setQ} placeholder="Lọc theo phòng…" />
        </FilterBar>
        {isLoading ? (
          <LoadingBlock lines={6} />
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : !rows.length ? (
          <EmptyState title="Không có phòng cần ghi chỉ số" description="Chỉ phòng có hợp đồng hiệu lực trong kỳ mới cần ghi." />
        ) : (
          <div className="table-wrap">
            <table className="table table--stack">
              <thead>
                <tr>
                  <th>Phòng</th>
                  <th>Điện cũ → mới</th>
                  <th className="num">Tiêu thụ</th>
                  <th>Nước cũ → mới (m³)</th>
                  <th>Trạng thái</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <MeterRow key={r.roomId} row={r} period={period} disabled={!can('rooms.write')} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}

// ===================================================================== Invoices
/** INV-01 */
export function InvoicesPage() {
  const { ws, base, can } = useWorkspaceContext();
  const [s, set] = useSearchState(['period', 'status', 'q'] as const);
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useInvoices(ws, { period: s.period || undefined, status: (s.status || undefined) as InvoiceStatus | undefined, q: s.q || undefined });
  const totals = useMemo(() => {
    const list = data ?? [];
    return {
      total: list.reduce((x, i) => x + invoiceGrandTotal(i), 0),
      paid: list.reduce((x, i) => x + i.paidConfirmed, 0),
      due: list.reduce((x, i) => x + invoiceBalance(i), 0),
    };
  }, [data]);

  const columns: Column<Invoice>[] = [
    {
      key: 'code',
      header: 'Hóa đơn',
      render: (i) => (
        <>
          <Link to={`${base}/invoices/${i.id}`} className="cell-title">
            {i.code}
          </Link>
          <p className="cell-sub">Kỳ {periodLabel(i.period)}</p>
        </>
      ),
    },
    {
      key: 'room',
      header: 'Phòng / người thuê',
      render: (i) => (
        <>
          <p className="cell-title">
            {i.roomCode} <span className="cell-sub">({i.buildingName})</span>
          </p>
          <p className="cell-sub">{i.tenantName}</p>
        </>
      ),
    },
    { key: 'total', header: 'Tổng tiền', align: 'right', render: (i) => formatVnd(invoiceGrandTotal(i)) },
    { key: 'paid', header: 'Đã thu', align: 'right', render: (i) => formatVnd(i.paidConfirmed) },
    { key: 'due', header: 'Còn nợ', align: 'right', render: (i) => <strong className={invoiceBalance(i) > 0 ? 'danger-text' : undefined}>{formatVnd(invoiceBalance(i))}</strong> },
    { key: 'dd', header: 'Hạn nộp', render: (i) => formatDate(i.dueDate) },
    { key: 'st', header: 'Trạng thái', render: (i) => <StatusBadge status={i.status} map={INVOICE_STATUS} /> },
  ];

  return (
    <>
      <PageHeader
        title="Hóa đơn"
        description="“Đã thu” chỉ gồm khoản thanh toán đã được xác nhận."
        actions={
          can('billing.run') && (
            <ButtonLink to={`${base}/billing/run`} variant="dark">
              <Receipt size={16} aria-hidden="true" /> Lập hóa đơn tháng
            </ButtonLink>
          )
        }
      />
      <div className="grid grid--3" style={{ marginBottom: 'var(--space-4)' }}>
        <StatCard label="Tổng phải thu (theo bộ lọc)" value={formatVnd(totals.total)} />
        <StatCard label="Đã thu (xác nhận)" value={formatVnd(totals.paid)} tone="primary" />
        <StatCard label="Còn nợ" value={formatVnd(totals.due)} tone="danger" />
      </div>
      <Section flush>
        <FilterBar>
          <SearchInput value={s.q} onChange={(q) => set({ q })} placeholder="Mã HĐ, phòng, người thuê…" />
          <Select aria-label="Kỳ" value={s.period} onChange={(e) => set({ period: e.target.value })}>
            <option value="">Mọi kỳ</option>
            {Array.from({ length: 12 }, (_, i) => addMonths(currentPeriod(), -i)).map((p) => (
              <option key={p} value={p}>
                Kỳ {periodLabel(p)}
              </option>
            ))}
          </Select>
          <Select aria-label="Trạng thái" value={s.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">Mọi trạng thái</option>
            {(Object.keys(INVOICE_STATUS) as InvoiceStatus[]).map((k) => (
              <option key={k} value={k}>
                {INVOICE_STATUS[k].label}
              </option>
            ))}
          </Select>
        </FilterBar>
        <DataTable
          columns={columns}
          rows={data}
          rowKey={(i) => i.id}
          isLoading={isLoading}
          error={error}
          onRetry={() => refetch()}
          onRowClick={(i) => navigate(`${base}/invoices/${i.id}`)}
          empty={<EmptyState icon={<FileText size={26} />} title="Không có hóa đơn phù hợp" />}
        />
      </Section>
    </>
  );
}

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

/** INV-02 */
export function InvoiceDetailPage() {
  const { ws, base, can } = useWorkspaceContext();
  const { invoiceId } = useParams();
  const invoice = useInvoice(ws, invoiceId);
  const payments = usePayments(ws, undefined, invoiceId);
  const adjust = useAddAdjustment(ws);
  const toast = useToast();
  const [adjOpen, setAdjOpen] = useState(false);
  const [amount, setAmount] = useState<number | undefined>();
  const [sign, setSign] = useState<1 | -1>(-1);
  const [reason, setReason] = useState('');

  if (invoice.isLoading) return <LoadingBlock lines={8} />;
  if (invoice.error || !invoice.data) return <ErrorState error={invoice.error} onRetry={() => invoice.refetch()} />;
  const inv = invoice.data;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Hóa đơn', to: `${base}/invoices` }, { label: inv.code }]}
        title={`Hóa đơn ${inv.code}`}
        description={`Kỳ ${periodLabel(inv.period)} • ${inv.roomCode} (${inv.buildingName}) • ${inv.tenantName}`}
        eyebrow={<div style={{ marginBottom: 'var(--space-2)' }}><StatusBadge status={inv.status} map={INVOICE_STATUS} /></div>}
        actions={
          <>
            {can('billing.run') && (
              <Button variant="secondary" onClick={() => setAdjOpen(true)}>
                Điều chỉnh (có audit)
              </Button>
            )}
            {can('payments.confirm') && invoiceBalance(inv) > 0 && (
              <ButtonLink to={`${base}/payments?invoice=${inv.id}`} variant="dark">
                Ghi nhận thanh toán
              </ButtonLink>
            )}
          </>
        }
      />
      <div className="grid grid--main-side">
        <Section title="Chi tiết khoản phí" subtitle={`Snapshot đơn giá phiên bản áp dụng từ ${formatDate(inv.rateEffectiveFrom)} — không thay đổi khi bảng giá cập nhật.`} flush>
          <InvoiceLinesTable invoice={inv} />
        </Section>
        <div className="stack">
          <Section title="Thông tin">
            <KeyValueList
              items={[
                { label: 'Hợp đồng', value: <Link to={`${base}/contracts/${inv.contractId}`}>{inv.contractCode}</Link> },
                { label: 'Ngày phát hành', value: formatDate(inv.issueDate) },
                { label: 'Hạn nộp', value: formatDate(inv.dueDate) },
              ]}
            />
          </Section>
          <Section title="Lịch sử thu">
            {payments.isLoading ? (
              <LoadingBlock lines={2} />
            ) : !payments.data?.length ? (
              <p className="text-sm muted">Chưa có thanh toán.</p>
            ) : (
              <ul className="list-plain stack" style={{ gap: 'var(--space-3)' }}>
                {payments.data.map((p) => (
                  <li key={p.id}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <strong>{formatVnd(p.amount)}</strong>
                      <StatusBadge status={p.status} map={PAYMENT_STATUS} />
                    </div>
                    <p className="cell-sub">
                      {PAYMENT_METHOD[p.method]} • {formatDateTime(p.submittedAt)} • {p.submittedBy === 'TENANT' ? 'Người thuê gửi' : 'Nhân viên ghi nhận'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
      <Modal open={adjOpen} title="Điều chỉnh hóa đơn" description="Mọi điều chỉnh được ghi lại (người thực hiện, thời gian, lý do)." onClose={() => setAdjOpen(false)}>
        <div className="stack">
          <div className="row">
            <label className="checkbox">
              <input type="radio" name="sign" checked={sign === -1} onChange={() => setSign(-1)} /> Giảm trừ
            </label>
            <label className="checkbox">
              <input type="radio" name="sign" checked={sign === 1} onChange={() => setSign(1)} /> Cộng thêm
            </label>
          </div>
          <FormField label="Số tiền" required>
            <CurrencyInput value={amount} onChange={setAmount} />
          </FormField>
          <FormField label="Lý do (bắt buộc)" required>
            <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: Giảm 2 ngày mất nước" />
          </FormField>
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setAdjOpen(false)}>
              Hủy
            </Button>
            <Button
              variant="dark"
              disabled={!amount || !reason.trim()}
              loading={adjust.isPending}
              onClick={() =>
                adjust.mutate(
                  { id: inv.id, amount: sign * (amount ?? 0), reason: reason.trim() },
                  {
                    onSuccess: () => {
                      toast.success('Đã ghi nhận điều chỉnh.');
                      setAdjOpen(false);
                      setAmount(undefined);
                      setReason('');
                    },
                    onError: (e) => toast.error(toApiError(e).message),
                  },
                )
              }
            >
              Lưu điều chỉnh
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/** INV-03 */
export function BillingRunPage() {
  const { ws, base, can } = useWorkspaceContext();
  const [s, set] = useSearchState(['period'] as const);
  const period = s.period || currentPeriod();
  const [started, setStarted] = useState(false);
  const preview = useBillingPreview(ws, period, started && can('billing.run'));
  const run = useRunBilling(ws);
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<BillingRunResult | null>(null);

  useEffect(() => {
    setSelected(new Set((preview.data ?? []).filter((p) => p.status === 'READY').map((p) => p.contractId)));
  }, [preview.data]);

  if (!can('billing.run')) return <ForbiddenPage message="Chỉ OWNER/MANAGER được lập hóa đơn." />;

  const ready = preview.data?.filter((p) => p.status === 'READY') ?? [];
  const total = ready.filter((p) => selected.has(p.contractId)).reduce((x, p) => x + p.total, 0);
  const STATUS = {
    READY: { label: 'Sẵn sàng', tone: 'success' as const },
    ALREADY_ISSUED: { label: 'Đã có hóa đơn', tone: 'neutral' as const },
    MISSING_METER: { label: 'Thiếu chỉ số', tone: 'warning' as const },
    NO_RATE: { label: 'Thiếu bảng giá', tone: 'danger' as const },
  };

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Hóa đơn', to: `${base}/invoices` }, { label: 'Lập hóa đơn tháng' }]}
        title="Lập hóa đơn tháng"
        description="Bước 1: chọn kỳ → Bước 2: xem trước từng hợp đồng → Bước 3: xác nhận phát hành. Mỗi hợp đồng tối đa 1 hóa đơn thường/kỳ; tiền phòng prorate theo ngày hiệu lực trong tháng."
      />
      {result ? (
        <Section title={`Kết quả lập hóa đơn kỳ ${periodLabel(result.period)}`}>
          <div className="alert alert--success" style={{ marginBottom: 'var(--space-4)' }}>
            <CheckCircle2 size={18} aria-hidden="true" /> Đã tạo {result.created.length} hóa đơn. {result.skipped.length > 0 && `Bỏ qua ${result.skipped.length} hợp đồng.`}
          </div>
          <div className="table-wrap">
            <table className="table table--stack">
              <thead>
                <tr>
                  <th>Hợp đồng</th>
                  <th>Kết quả</th>
                  <th className="num">Tổng tiền</th>
                </tr>
              </thead>
              <tbody>
                {result.created.map((c) => (
                  <tr key={c.contractCode}>
                    <td data-label="Hợp đồng">{c.contractCode}</td>
                    <td data-label="Kết quả">
                      <Badge tone="success">Tạo {c.invoiceCode}</Badge>
                    </td>
                    <td data-label="Tổng" className="num">
                      {formatVnd(c.total)}
                    </td>
                  </tr>
                ))}
                {result.skipped.map((c) => (
                  <tr key={c.contractCode}>
                    <td data-label="Hợp đồng">{c.contractCode}</td>
                    <td data-label="Kết quả">
                      <Badge tone="warning">Bỏ qua: {c.reason}</Badge>
                    </td>
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="form-actions">
            <Button
              variant="secondary"
              onClick={() => {
                setResult(null);
                setStarted(false);
              }}
            >
              Lập kỳ khác
            </Button>
            <ButtonLink to={`${base}/invoices?period=${result.period}`} variant="dark">
              Xem hóa đơn kỳ {periodLabel(result.period)}
            </ButtonLink>
          </div>
        </Section>
      ) : (
        <>
          <Section title="Bước 1 — Chọn kỳ">
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <PeriodSelect
                value={period}
                onChange={(p) => {
                  set({ period: p });
                  setStarted(false);
                }}
                months={6}
              />
              <Button variant="dark" onClick={() => setStarted(true)} loading={preview.isFetching}>
                Xem trước
              </Button>
              <Link to={`${base}/meters?period=${period}`} className="text-sm">
                Kiểm tra chỉ số điện nước kỳ {periodLabel(period)} →
              </Link>
            </div>
          </Section>
          {started && (
            <div style={{ marginTop: 'var(--space-4)' }}>
              <Section
                title="Bước 2 — Xem trước"
                subtitle={`${ready.length} hợp đồng sẵn sàng • Đã chọn ${selected.size} • Tổng ${formatVnd(total)}`}
                actions={
                  <Button variant="dark" disabled={!selected.size} onClick={() => setConfirm(true)}>
                    Bước 3 — Phát hành {selected.size} hóa đơn
                  </Button>
                }
                flush
              >
                {preview.isLoading ? (
                  <LoadingBlock lines={6} />
                ) : preview.error ? (
                  <ErrorState error={preview.error} onRetry={() => preview.refetch()} />
                ) : !preview.data?.length ? (
                  <EmptyState title="Không có hợp đồng hiệu lực trong kỳ" />
                ) : (
                  <div className="table-wrap">
                    <table className="table table--stack">
                      <thead>
                        <tr>
                          <th>
                            <input
                              type="checkbox"
                              aria-label="Chọn tất cả"
                              checked={ready.length > 0 && ready.every((p) => selected.has(p.contractId))}
                              onChange={(e) => setSelected(new Set(e.target.checked ? ready.map((p) => p.contractId) : []))}
                            />
                          </th>
                          <th>Hợp đồng</th>
                          <th>Chi tiết</th>
                          <th className="num">Tổng</th>
                          <th>Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.data.map((p) => (
                          <tr key={p.contractId}>
                            <td data-label="Chọn">
                              <input
                                type="checkbox"
                                aria-label={`Chọn ${p.contractCode}`}
                                disabled={p.status !== 'READY'}
                                checked={selected.has(p.contractId)}
                                onChange={(e) => {
                                  const next = new Set(selected);
                                  if (e.target.checked) next.add(p.contractId);
                                  else next.delete(p.contractId);
                                  setSelected(next);
                                }}
                              />
                            </td>
                            <td data-label="Hợp đồng">
                              <p className="cell-title">
                                {p.contractCode} • {p.roomCode}
                              </p>
                              <p className="cell-sub">
                                {p.buildingName} • {p.tenantName}
                              </p>
                            </td>
                            <td data-label="Chi tiết">
                              {p.lines.length ? (
                                <ul className="preview-lines">
                                  {p.lines.map((l, i) => (
                                    <li key={i}>
                                      {l.label}: {formatVnd(l.amount)} {l.note ? `(${l.note})` : ''}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <span className="cell-sub">{p.message}</span>
                              )}
                            </td>
                            <td data-label="Tổng" className="num">
                              {p.total ? formatVnd(p.total) : '—'}
                            </td>
                            <td data-label="Trạng thái">
                              <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
                              {p.status === 'MISSING_METER' && (
                                <p>
                                  <Link to={`${base}/meters?period=${period}`} className="text-xs">
                                    Ghi chỉ số →
                                  </Link>
                                </p>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>
            </div>
          )}
        </>
      )}
      <ConfirmDialog
        open={confirm}
        title={`Phát hành ${selected.size} hóa đơn kỳ ${periodLabel(period)}?`}
        description={`Tổng ${formatVnd(total)}. Hóa đơn sẽ lưu snapshot đơn giá hiện hành. Gửi thông báo cho người thuê qua Zalo/SMS chưa hoạt động (mock).`}
        confirmLabel="Phát hành"
        loading={run.isPending}
        onCancel={() => setConfirm(false)}
        onConfirm={() =>
          run.mutate(
            { period, contractIds: [...selected] },
            {
              onSuccess: (r) => {
                setResult(r);
                toast.success(`Đã tạo ${r.created.length} hóa đơn.`);
              },
              onError: (e) => toast.error(toApiError(e).message),
              onSettled: () => setConfirm(false),
            },
          )
        }
      />
    </>
  );
}

// ===================================================================== Payments
const paymentSchema = z.object({
  invoiceId: z.string().min(1, 'Chọn hóa đơn'),
  amount: z.number({ invalid_type_error: 'Nhập số tiền', required_error: 'Nhập số tiền' }).int().positive('Số tiền phải > 0'),
  method: z.enum(['CASH', 'BANK_TRANSFER']),
  proofUrl: z.string().optional(),
  note: z.string().optional(),
});
type PaymentForm = z.input<typeof paymentSchema>;

/** PAY-01 */
export function PaymentsPage() {
  const { ws, can } = useWorkspaceContext();
  const [s, set] = useSearchState(['invoice'] as const);
  const [tab, setTab] = useState<PaymentStatus | 'ALL'>('PENDING');
  const payments = usePayments(ws);
  const unpaid = useInvoices(ws, {});
  const record = useRecordPayment(ws);
  const confirmM = useConfirmPayment(ws);
  const reject = useRejectPayment(ws);
  const toast = useToast();
  const [rejecting, setRejecting] = useState<Payment | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [proof, setProof] = useState<string[]>([]);
  const openInvoices = (unpaid.data ?? []).filter((i) => invoiceBalance(i) > 0);
  const form = useForm<PaymentForm>({ resolver: zodResolver(paymentSchema), defaultValues: { invoiceId: s.invoice, method: 'CASH' } });
  const selectedInvoice = openInvoices.find((i) => i.id === form.watch('invoiceId'));
  const pendingCount = payments.data?.filter((p) => p.status === 'PENDING').length;
  const rows = (payments.data ?? []).filter((p) => tab === 'ALL' || p.status === tab);

  useEffect(() => {
    if (s.invoice) form.setValue('invoiceId', s.invoice);
  }, [s.invoice]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!can('payments.confirm')) return <ForbiddenPage message="Chỉ OWNER/MANAGER được xác nhận thanh toán." />;

  const columns: Column<Payment>[] = [
    {
      key: 'inv',
      header: 'Hóa đơn',
      render: (p) => (
        <>
          <p className="cell-title">{p.invoiceCode}</p>
          <p className="cell-sub">
            {p.roomCode} • {p.tenantName}
          </p>
        </>
      ),
    },
    { key: 'amt', header: 'Số tiền', align: 'right', render: (p) => <strong>{formatVnd(p.amount)}</strong> },
    {
      key: 'm',
      header: 'Phương thức',
      render: (p) => (
        <>
          <p>{PAYMENT_METHOD[p.method]}</p>
          {p.proofUrl && (
            <a href={p.proofUrl} target="_blank" rel="noreferrer" className="text-xs">
              Xem minh chứng
            </a>
          )}
        </>
      ),
    },
    {
      key: 'at',
      header: 'Gửi lúc',
      render: (p) => (
        <>
          <p className="text-sm">{formatDateTime(p.submittedAt)}</p>
          {p.note && <p className="cell-sub">{p.note}</p>}
        </>
      ),
    },
    { key: 'st', header: 'Trạng thái', render: (p) => <StatusBadge status={p.status} map={PAYMENT_STATUS} /> },
    {
      key: 'act',
      header: '',
      render: (p) =>
        p.status === 'PENDING' ? (
          <div className="row">
            <Button
              size="sm"
              variant="dark"
              loading={confirmM.isPending && confirmM.variables === p.id}
              onClick={() => confirmM.mutate(p.id, { onSuccess: () => toast.success('Đã xác nhận — khoản này được tính là đã thu.'), onError: (e) => toast.error(toApiError(e).message) })}
            >
              <CheckCircle2 size={14} /> Xác nhận
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRejecting(p)}>
              <XCircle size={14} /> Từ chối
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader title="Xác nhận thanh toán" description="Chỉ khoản đã được xác nhận mới tính là đã thu. Hỗ trợ thanh toán một phần." />
      <div className="grid grid--main-side">
        <div>
          <Tabs
            label="Trạng thái thanh toán"
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'PENDING', label: 'Chờ xác nhận', count: pendingCount },
              { key: 'CONFIRMED', label: 'Đã xác nhận' },
              { key: 'REJECTED', label: 'Từ chối' },
              { key: 'ALL', label: 'Tất cả' },
            ]}
          />
          <Section flush>
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(p) => p.id}
              isLoading={payments.isLoading}
              error={payments.error}
              onRetry={() => payments.refetch()}
              empty={<EmptyState title="Không có thanh toán ở trạng thái này" />}
            />
          </Section>
        </div>
        <Section title="Ghi nhận thanh toán tại quầy" subtitle="Tiền mặt / chuyển khoản do nhân viên ghi nhận được xác nhận ngay.">
          <form
            className="stack"
            noValidate
            onSubmit={form.handleSubmit(async (v) => {
              const parsed = paymentSchema.parse(v);
              if (selectedInvoice && parsed.amount > invoiceBalance(selectedInvoice)) {
                form.setError('amount', { message: `Tối đa ${formatVnd(invoiceBalance(selectedInvoice))}` });
                return;
              }
              try {
                await record.mutateAsync({ ...parsed, method: parsed.method as PaymentMethod, proofUrl: proof[0] });
                toast.success(parsed.amount < invoiceBalance(selectedInvoice!) ? 'Đã ghi nhận thanh toán một phần.' : 'Đã thu đủ hóa đơn.');
                form.reset({ invoiceId: '', method: 'CASH', amount: undefined, note: '' });
                setProof([]);
                set({ invoice: '' });
              } catch (e) {
                const err = toApiError(e);
                Object.entries(err.fieldErrors ?? {}).forEach(([f, m]) => form.setError(f as keyof PaymentForm, { message: m }));
                if (!err.fieldErrors) toast.error(err.message);
              }
            })}
          >
            <FormField label="Hóa đơn còn nợ" required error={form.formState.errors.invoiceId?.message}>
              <select className="select" {...form.register('invoiceId')}>
                <option value="">— Chọn hóa đơn —</option>
                {openInvoices.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.code} • {i.roomCode} • {i.tenantName} • nợ {formatVnd(invoiceBalance(i))}
                  </option>
                ))}
              </select>
            </FormField>
            {selectedInvoice && (
              <div className="row text-sm" style={{ justifyContent: 'space-between' }}>
                <span className="muted">Còn nợ</span>
                <Button size="sm" variant="ghost" onClick={() => form.setValue('amount', invoiceBalance(selectedInvoice))}>
                  {formatVnd(invoiceBalance(selectedInvoice))} — thu đủ
                </Button>
              </div>
            )}
            <FormField label="Số tiền" required error={form.formState.errors.amount?.message} hint="Nhập ít hơn số còn nợ để ghi nhận thanh toán một phần.">
              <Controller control={form.control} name="amount" render={({ field }) => <CurrencyInput value={field.value} onChange={field.onChange} />} />
            </FormField>
            <FormField label="Phương thức" required>
              <select className="select" {...form.register('method')}>
                <option value="CASH">Tiền mặt</option>
                <option value="BANK_TRANSFER">Chuyển khoản</option>
              </select>
            </FormField>
            <ImageUploader label="Chứng từ (tùy chọn)" value={proof} onChange={setProof} max={1} />
            <FormField label="Ghi chú">
              <input className="input" {...form.register('note')} />
            </FormField>
            <Button type="submit" variant="dark" block loading={record.isPending}>
              Ghi nhận & xác nhận
            </Button>
          </form>
        </Section>
      </div>
      <Modal open={Boolean(rejecting)} title="Từ chối minh chứng thanh toán" onClose={() => setRejecting(null)}>
        <div className="stack">
          <p className="text-sm">
            {rejecting?.tenantName} • {rejecting && formatVnd(rejecting.amount)} • {rejecting?.invoiceCode}
          </p>
          <FormField label="Lý do" required>
            <textarea className="textarea" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="VD: Chưa nhận được tiền trong tài khoản" />
          </FormField>
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setRejecting(null)}>
              Hủy
            </Button>
            <Button
              variant="danger"
              disabled={!rejectReason.trim()}
              loading={reject.isPending}
              onClick={() =>
                reject.mutate(
                  { id: rejecting!.id, reason: rejectReason.trim() },
                  {
                    onSuccess: () => {
                      toast.success('Đã từ chối.');
                      setRejecting(null);
                      setRejectReason('');
                    },
                    onError: (e) => toast.error(toApiError(e).message),
                  },
                )
              }
            >
              Từ chối
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ===================================================================== Deposits
const depositSchema = z.object({
  contractId: z.string().min(1, 'Chọn hợp đồng'),
  type: z.enum(['COLLECT', 'REFUND', 'DEDUCT']),
  amount: z.number({ invalid_type_error: 'Nhập số tiền', required_error: 'Nhập số tiền' }).int().positive('Số tiền phải > 0'),
  date: z.string().min(1, 'Chọn ngày'),
  note: z.string().optional(),
});
type DepositForm = z.input<typeof depositSchema>;

/** DEP-01 */
export function DepositsPage() {
  const { ws, base, can } = useWorkspaceContext();
  const { data, isLoading, error, refetch } = useDeposits(ws);
  const contracts = useContracts(ws);
  const create = useCreateDeposit(ws);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const form = useForm<DepositForm>({ resolver: zodResolver(depositSchema) });
  const held = (data ?? []).reduce((s, d) => s + DEPOSIT_TYPE[d.type].sign * d.amount, 0);
  const sum = (t: DepositTxType) => (data ?? []).filter((d) => d.type === t).reduce((s, d) => s + d.amount, 0);

  return (
    <>
      <PageHeader
        title="Giao dịch tiền cọc"
        description="Tiền cọc được theo dõi riêng — không gộp vào doanh thu tiền thuê."
        actions={
          can('payments.confirm') && (
            <Button
              variant="dark"
              onClick={() => {
                form.reset({ contractId: '', type: 'REFUND', amount: undefined, date: todayVN(), note: '' });
                setOpen(true);
              }}
            >
              <Plus size={16} aria-hidden="true" /> Thêm giao dịch cọc
            </Button>
          )
        }
      />
      <div className="grid grid--4" style={{ marginBottom: 'var(--space-4)' }}>
        <StatCard label="Đang giữ" value={formatVnd(held)} tone="primary" />
        <StatCard label="Đã thu cọc" value={formatVnd(sum('COLLECT'))} />
        <StatCard label="Đã hoàn" value={formatVnd(sum('REFUND'))} />
        <StatCard label="Đã khấu trừ" value={formatVnd(sum('DEDUCT'))} />
      </div>
      <Section flush>
        <DataTable
          rows={data}
          rowKey={(d) => d.id}
          isLoading={isLoading}
          error={error}
          onRetry={() => refetch()}
          empty={<EmptyState title="Chưa có giao dịch cọc" />}
          columns={[
            { key: 'date', header: 'Ngày', render: (d) => formatDate(d.date) },
            {
              key: 'c',
              header: 'Hợp đồng',
              render: (d) => (
                <>
                  <Link to={`${base}/contracts/${d.contractId}`} className="cell-title">
                    {d.contractCode}
                  </Link>
                  <p className="cell-sub">
                    {d.roomCode} • {d.tenantName}
                  </p>
                </>
              ),
            },
            { key: 't', header: 'Loại', render: (d) => <StatusBadge status={d.type} map={DEPOSIT_TYPE} /> },
            { key: 'a', header: 'Số tiền', align: 'right', render: (d) => `${DEPOSIT_TYPE[d.type].sign > 0 ? '+' : '−'}${formatVnd(d.amount)}` },
            { key: 'n', header: 'Ghi chú', render: (d) => <span className="cell-sub">{d.note ?? '—'}</span> },
          ]}
        />
      </Section>
      <Modal open={open} title="Giao dịch tiền cọc" onClose={() => setOpen(false)}>
        <form
          className="stack"
          noValidate
          onSubmit={form.handleSubmit(async (v) => {
            try {
              await create.mutateAsync(depositSchema.parse(v));
              toast.success('Đã ghi nhận giao dịch cọc.');
              setOpen(false);
            } catch (e) {
              const err = toApiError(e);
              Object.entries(err.fieldErrors ?? {}).forEach(([f, m]) => form.setError(f as keyof DepositForm, { message: m }));
              if (!err.fieldErrors) toast.error(err.message);
            }
          })}
        >
          <FormField label="Hợp đồng" required error={form.formState.errors.contractId?.message}>
            <select className="select" {...form.register('contractId')}>
              <option value="">— Chọn hợp đồng —</option>
              {contracts.data
                ?.filter((c) => c.status !== 'DRAFT')
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} • {c.roomCode} • {c.primaryTenantName}
                  </option>
                ))}
            </select>
          </FormField>
          <div className="form-grid form-grid--2">
            <FormField label="Loại" required>
              <select className="select" {...form.register('type')}>
                {(Object.keys(DEPOSIT_TYPE) as DepositTxType[]).map((k) => (
                  <option key={k} value={k}>
                    {DEPOSIT_TYPE[k].label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Ngày" required error={form.formState.errors.date?.message}>
              <DatePicker {...form.register('date')} />
            </FormField>
          </div>
          <FormField label="Số tiền" required error={form.formState.errors.amount?.message}>
            <Controller control={form.control} name="amount" render={({ field }) => <CurrencyInput value={field.value} onChange={field.onChange} />} />
          </FormField>
          <FormField label="Ghi chú" hint="Bắt buộc nên ghi rõ lý do khi khấu trừ.">
            <textarea className="textarea" {...form.register('note')} />
          </FormField>
          {form.watch('type') === 'DEDUCT' && (
            <p className="alert alert--warning">
              <AlertTriangle size={16} aria-hidden="true" /> Khấu trừ cọc không được tính là doanh thu tiền thuê trong báo cáo.
            </p>
          )}
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" variant="dark" loading={create.isPending}>
              Lưu
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
