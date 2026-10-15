import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { PAYMENT_METHODS, type DepositEntryResponse, type InvoicePaymentResponse } from '@rental/shared';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  FilterBar,
  FormField,
  KeyValueList,
  LoadingBlock,
  Modal,
  PageHeader,
  Pagination,
  Section,
  Select,
  StatusBadge,
  useToast,
  type Column,
} from '@/components/ui';
import { useCreateDepositEntry, useDeposit, useDepositEntry, useReverseDepositEntry } from '@/features/deposits/hooks';
import { DEPOSIT_KIND, depositErrorMessage } from '@/features/deposits/labels';
import { depositEntrySchema, reverseDepositSchema, toDepositBody, type DepositEntryForm, type ReverseDepositForm } from '@/features/deposits/schemas';
import { INVOICE_STATUS, PAYMENT_STATUS } from '@/features/invoices/labels';
import { useInvoice, useInvoiceList } from '@/features/invoices/hooks';
import { PAYMENT_ENTRY_KIND, PAYMENT_METHOD, paymentErrorMessage } from '@/features/payments/labels';
import { usePayment, usePaymentLedger, useRecordPayment, useReversePayment } from '@/features/payments/hooks';
import { isoToLocalInput, paymentSchema, reverseSchema, toPaymentBody, type PaymentForm, type ReverseForm } from '@/features/payments/schemas';
import { useBuildings, useRooms } from '@/features/property-management/hooks';
import { formatMoney } from '@/features/property-management/mappers';
import { useContractList } from '@/features/tenancy/hooks';
import { CONTRACT_PHASE } from '@/features/tenancy/labels';
import { useWorkspaceContext } from '@/hooks/useWorkspaceContext';
import { useSearchState } from '@/hooks/useSearchState';
import { useIdempotencyKey } from '@/lib/idempotency';
import { periodLabel } from '@/lib/dates';
import { formatDateTime } from '@/lib/format';
import { toApiError } from '@/services/http/ApiError';
import { ForbiddenPage } from '@/pages/system/ErrorPages';
import { BuildingSelect, NoBuilding } from './UtilityPages';

const PAGE = 20;

/** Chỉ OWNER ghi dữ liệu, và workspace chưa lưu trữ. */
function useCanWrite() {
  const { can, membership } = useWorkspaceContext();
  return can('rooms.write') && membership.status !== 'ARCHIVED';
}
const money = (v: string | null | undefined) => (v === null || v === undefined ? '—' : formatMoney(v));
const signedMoney = (kind: 'PAYMENT' | 'REVERSAL' | string, v: string) => (kind === 'REVERSAL' ? `−${money(v)}` : money(v));

// ===================================================================== Thanh toán (theo hóa đơn)
/** PAY-01 — sổ thanh toán của MỘT hóa đơn đã phát hành: ghi nhận khoản thu, xem chi tiết, đảo khoản ghi nhầm. */
export function PaymentsPage() {
  const { ws, base, can } = useWorkspaceContext();
  const writable = useCanWrite();
  const buildings = useBuildings(ws);
  const [s, set] = useSearchState(['buildingId', 'invoiceId', 'period', 'page'] as const);
  const active = useMemo(() => (buildings.data ?? []).filter((b) => b.status === 'ACTIVE'), [buildings.data]);
  const buildingId = active.find((b) => b.id === s.buildingId)?.id ?? active[0]?.id;
  const issued = useInvoiceList(ws, buildingId, { status: 'ISSUED', period: s.period || undefined }, { page: 1, limit: 50 });
  const rooms = useRooms(ws, { buildingId });
  const contracts = useContractList(ws);
  const invoiceId = s.invoiceId || undefined;
  const invoice = useInvoice(ws, buildingId, invoiceId);
  const page = Math.max(1, Number(s.page) || 1);
  const ledger = usePaymentLedger(ws, buildingId, invoiceId, { page, limit: PAGE });
  const [recording, setRecording] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [reversing, setReversing] = useState<InvoicePaymentResponse | null>(null);

  if (!can('payments.confirm')) return <ForbiddenPage message="Chỉ chủ trọ được ghi nhận thanh toán." />;

  const roomCode = (id: string) => rooms.data?.find((r) => r.id === id)?.code ?? '—';
  const tenantOf = (contractId: string) => contracts.data?.find((c) => c.id === contractId)?.tenantName ?? '—';
  const inv = invoice.data;
  const isIssued = inv?.status === 'ISSUED';
  const sum = ledger.data;

  const columns: Column<InvoicePaymentResponse>[] = [
    { key: 'at', header: 'Thời điểm', render: (p) => formatDateTime(p.receivedAt) },
    { key: 'kind', header: 'Loại', render: (p) => <StatusBadge status={p.kind} map={PAYMENT_ENTRY_KIND} /> },
    { key: 'amount', header: 'Số tiền', align: 'right', render: (p) => <strong>{signedMoney(p.kind, p.amount)}</strong> },
    { key: 'method', header: 'Hình thức', render: (p) => PAYMENT_METHOD[p.method] },
    {
      key: 'note',
      header: 'Ghi chú',
      render: (p) => (
        <>
          <p>{p.note ?? '—'}</p>
          {p.reversedByPaymentId && <Badge tone="warning">Đã bị đảo</Badge>}
          {p.reversesPaymentId && <p className="cell-sub">Đảo một khoản thu trước đó</p>}
        </>
      ),
    },
    {
      key: 'act',
      header: '',
      align: 'right',
      render: (p) => (
        <span className="row" style={{ justifyContent: 'flex-end' }}>
          <Button size="sm" variant="ghost" aria-label={`Chi tiết thanh toán ${signedMoney(p.kind, p.amount)}`} onClick={() => setViewing(p.id)}>
            Chi tiết
          </Button>
          {writable && p.kind === 'PAYMENT' && !p.reversedByPaymentId && (
            <Button size="sm" variant="ghost" aria-label={`Đảo thanh toán ${money(p.amount)}`} onClick={() => setReversing(p)}>
              Đảo
            </Button>
          )}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Thanh toán"
        description="Sổ thu tiền theo từng hóa đơn đã phát hành. Chủ trọ ghi nhận khoản đã nhận (tiền mặt/chuyển khoản); ghi nhầm thì đảo bằng bút toán mới, không sửa hay xóa bản gốc."
        actions={
          writable &&
          isIssued && (
            <Button variant="dark" onClick={() => setRecording(true)}>
              <Plus size={16} aria-hidden="true" /> Ghi nhận thanh toán
            </Button>
          )
        }
      />
      {!buildingId ? (
        <NoBuilding loading={buildings.isLoading} error={buildings.error} onRetry={() => buildings.refetch()} />
      ) : (
        <div className="stack">
          <Section flush>
            <FilterBar>
              <BuildingSelect value={buildingId} options={active} onChange={(id) => set({ buildingId: id, invoiceId: '', page: '' })} />
              <input className="input" type="month" aria-label="Kỳ" value={s.period} onChange={(e) => set({ period: e.target.value, invoiceId: '', page: '' })} style={{ minWidth: 150 }} />
              <Select aria-label="Hóa đơn" value={invoiceId ?? ''} onChange={(e) => set({ invoiceId: e.target.value, page: '' })} style={{ minWidth: 280 }}>
                <option value="">— Chọn hóa đơn đã phát hành —</option>
                {(issued.data?.items ?? []).map((i) => (
                  <option key={i.id} value={i.id}>
                    {periodLabel(i.period)} • {roomCode(i.roomId)} • {tenantOf(i.contractId)}
                    {i.paymentStatus ? ` • ${PAYMENT_STATUS[i.paymentStatus].label}` : ''}
                  </option>
                ))}
              </Select>
            </FilterBar>
            {issued.data && issued.data.total > issued.data.items.length && (
              <p className="text-xs muted" style={{ padding: 'var(--space-2) var(--space-4)' }}>
                Chỉ hiện {issued.data.items.length}/{issued.data.total} hóa đơn gần nhất: chọn kỳ để thu hẹp danh sách.
              </p>
            )}
          </Section>

          {!invoiceId ? (
            <Section>
              <EmptyState title="Chọn một hóa đơn đã phát hành" description="Sổ thanh toán và số còn phải thu sẽ hiển thị tại đây." />
            </Section>
          ) : invoice.isLoading ? (
            <LoadingBlock lines={4} />
          ) : invoice.error || !inv ? (
            <ErrorState error={invoice.error} onRetry={() => invoice.refetch()} />
          ) : (
            <>
              {!isIssued && (
                <p className="alert alert--warning" role="status">
                  Hóa đơn này còn là bản nháp. Chỉ hóa đơn đã phát hành mới nhận thanh toán.
                </p>
              )}
              <Section
                title={`Hóa đơn kỳ ${periodLabel(inv.period)} — phòng ${roomCode(inv.roomId)}`}
                actions={
                  <Link to={`${base}/invoices/${inv.buildingId}/${inv.id}`} className="text-sm">
                    Xem hóa đơn →
                  </Link>
                }
              >
                <KeyValueList
                  items={[
                    { label: 'Trạng thái hóa đơn', value: <StatusBadge status={inv.status} map={INVOICE_STATUS} /> },
                    { label: 'Tình trạng thanh toán', value: sum ? <StatusBadge status={sum.paymentStatus} map={PAYMENT_STATUS} /> : '—' },
                    { label: 'Số phải thu', value: sum ? money(sum.amountDue) : '—' },
                    { label: 'Đã thu', value: sum ? money(sum.paidTotal) : '—' },
                    { label: 'Còn phải thu', value: sum ? money(sum.outstanding) : '—' },
                  ]}
                />
              </Section>
              <Section title="Lịch sử thanh toán" flush>
                <DataTable
                  columns={columns}
                  rows={sum?.items}
                  rowKey={(p) => p.id}
                  isLoading={ledger.isLoading}
                  error={ledger.error}
                  onRetry={() => ledger.refetch()}
                  empty={<EmptyState title="Chưa có khoản thanh toán" description={isIssued ? 'Ghi nhận khoản đầu tiên bằng nút “Ghi nhận thanh toán”.' : undefined} />}
                />
                <Pagination page={page} pageSize={PAGE} total={sum?.total ?? 0} onChange={(p) => set({ page: String(p) })} />
              </Section>
            </>
          )}
        </div>
      )}
      {recording && buildingId && invoiceId && sum && (
        <RecordPaymentModal ws={ws} buildingId={buildingId} invoiceId={invoiceId} outstanding={sum.outstanding} onClose={() => setRecording(false)} />
      )}
      {viewing && buildingId && invoiceId && <PaymentDetailModal ws={ws} buildingId={buildingId} invoiceId={invoiceId} paymentId={viewing} onClose={() => setViewing(null)} />}
      {reversing && buildingId && invoiceId && <ReversePaymentModal ws={ws} buildingId={buildingId} invoiceId={invoiceId} payment={reversing} onClose={() => setReversing(null)} />}
    </>
  );
}

function RecordPaymentModal({ ws, buildingId, invoiceId, outstanding, onClose }: { ws: string; buildingId: string; invoiceId: string; outstanding: string; onClose: () => void }) {
  const record = useRecordPayment(ws, buildingId, invoiceId);
  const toast = useToast();
  const keyFor = useIdempotencyKey('pay');
  const form = useForm<PaymentForm>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { amount: '', method: 'CASH', receivedAt: isoToLocalInput(), note: '' },
  });
  const e = form.formState.errors;
  return (
    <Modal open title="Ghi nhận thanh toán" description={`Còn phải thu: ${money(outstanding)}. Không vượt số còn phải thu; thời điểm nhận không ở tương lai.`} onClose={onClose}>
      <form
        className="stack"
        noValidate
        onSubmit={form.handleSubmit(async (v) => {
          const key = keyFor(`${v.amount.trim()}|${v.method}|${v.receivedAt}|${v.note.trim()}`);
          try {
            await record.mutateAsync(toPaymentBody(v, key));
            toast.success(Number(v.amount) < Number(outstanding) ? 'Đã ghi nhận thanh toán một phần.' : 'Đã thu đủ hóa đơn.');
            onClose();
          } catch (err) {
            const a = toApiError(err);
            if (a.code === 'INVOICE_PAYMENT_EXCEEDS_DUE') form.setError('amount', { message: paymentErrorMessage(err) });
            else if (a.code === 'INVOICE_PAYMENT_INVALID') form.setError('receivedAt', { message: paymentErrorMessage(err) });
            else toast.error(paymentErrorMessage(err));
          }
        })}
      >
        <FormField label="Số tiền (VND)" required error={e.amount?.message}>
          <input className="input" inputMode="numeric" {...form.register('amount')} />
        </FormField>
        <div>
          <Button size="sm" variant="ghost" onClick={() => form.setValue('amount', outstanding, { shouldValidate: true })}>
            Thu đủ số còn lại
          </Button>
        </div>
        <div className="form-grid form-grid--2">
          <FormField label="Hình thức" required error={e.method?.message}>
            <select className="select" {...form.register('method')}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD[m]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Thời điểm nhận tiền" required error={e.receivedAt?.message}>
            <input className="input" type="datetime-local" {...form.register('receivedAt')} />
          </FormField>
        </div>
        <FormField label="Ghi chú" error={e.note?.message}>
          <textarea className="textarea" maxLength={500} {...form.register('note')} />
        </FormField>
        <div className="form-actions">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" variant="dark" loading={record.isPending}>
            Ghi nhận
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ReversePaymentModal({ ws, buildingId, invoiceId, payment, onClose }: { ws: string; buildingId: string; invoiceId: string; payment: InvoicePaymentResponse; onClose: () => void }) {
  const reverse = useReversePayment(ws, buildingId, invoiceId);
  const toast = useToast();
  const keyFor = useIdempotencyKey('rev');
  const form = useForm<ReverseForm>({ resolver: zodResolver(reverseSchema), defaultValues: { reason: '' } });
  return (
    <Modal open title="Đảo khoản thanh toán" description={`Tạo bút toán đảo ${money(payment.amount)} (${formatDateTime(payment.receivedAt)}). Khoản gốc được giữ nguyên trong lịch sử.`} onClose={onClose}>
      <form
        className="stack"
        noValidate
        onSubmit={form.handleSubmit(async (v) => {
          try {
            await reverse.mutateAsync({ id: payment.id, input: { reason: v.reason.trim(), idempotencyKey: keyFor(`${payment.id}|${v.reason.trim()}`) } });
            toast.success('Đã đảo khoản thanh toán.');
            onClose();
          } catch (err) {
            toast.error(paymentErrorMessage(err));
          }
        })}
      >
        <FormField label="Lý do đảo" required error={form.formState.errors.reason?.message}>
          <textarea className="textarea" maxLength={500} {...form.register('reason')} />
        </FormField>
        <div className="form-actions">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" variant="danger" loading={reverse.isPending}>
            Đảo khoản này
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PaymentDetailModal({ ws, buildingId, invoiceId, paymentId, onClose }: { ws: string; buildingId: string; invoiceId: string; paymentId: string; onClose: () => void }) {
  const detail = usePayment(ws, buildingId, invoiceId, paymentId);
  const p = detail.data;
  return (
    <Modal open title="Chi tiết thanh toán" onClose={onClose}>
      {detail.isLoading ? (
        <LoadingBlock lines={4} />
      ) : detail.error || !p ? (
        <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
      ) : (
        <KeyValueList
          items={[
            { label: 'Loại', value: PAYMENT_ENTRY_KIND[p.kind].label },
            { label: 'Số tiền', value: signedMoney(p.kind, p.amount) },
            { label: 'Hình thức', value: PAYMENT_METHOD[p.method] },
            { label: 'Thời điểm nhận', value: formatDateTime(p.receivedAt) },
            { label: 'Ghi chú', value: p.note ?? '—' },
            { label: 'Đảo khoản', value: p.reversesPaymentId ?? '—' },
            { label: 'Đã bị đảo bởi', value: p.reversedByPaymentId ?? '—' },
            { label: 'Người ghi nhận', value: p.confirmedBy },
            { label: 'Ghi lúc', value: formatDateTime(p.createdAt) },
            { label: 'Mã giao dịch', value: p.id },
          ]}
        />
      )}
      <div className="form-actions">
        <Button variant="secondary" onClick={onClose}>
          Đóng
        </Button>
      </div>
    </Modal>
  );
}

// ===================================================================== Tiền cọc (theo hợp đồng)
/** DEP-01 — sổ tiền cọc của MỘT hợp đồng (ACTIVE hoặc ENDED): thu, khấu trừ, hoàn, đảo. Sổ chỉ ghi nhận, không chuyển tiền. */
export function DepositsPage() {
  const { ws, can, membership } = useWorkspaceContext();
  const writable = useCanWrite();
  const buildings = useBuildings(ws);
  const contracts = useContractList(ws);
  const [s, set] = useSearchState(['contractId', 'page'] as const);
  const contractId = s.contractId || undefined;
  const page = Math.max(1, Number(s.page) || 1);
  const deposit = useDeposit(ws, contractId, { page, limit: PAGE });
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [reversing, setReversing] = useState<DepositEntryResponse | null>(null);

  if (!can('payments.confirm')) return <ForbiddenPage message="Chỉ chủ trọ được ghi nhận tiền cọc." />;

  const contract = contracts.data?.find((c) => c.id === contractId);
  const buildingArchived = Boolean(contract && buildings.data?.find((b) => b.id === contract.buildingId)?.status === 'ARCHIVED');
  // Workspace/tòa nhà đã lưu trữ: backend chỉ cho OWNER hoàn số dư còn lại (REFUND); thu, khấu trừ và đảo bị chặn.
  const refundOnly = membership.status === 'ARCHIVED' || buildingArchived;
  const d = deposit.data;

  const columns: Column<DepositEntryResponse>[] = [
    { key: 'at', header: 'Thời điểm', render: (e) => formatDateTime(e.occurredAt) },
    { key: 'kind', header: 'Loại', render: (e) => <StatusBadge status={e.kind} map={DEPOSIT_KIND} /> },
    { key: 'amount', header: 'Số tiền', align: 'right', render: (e) => <strong>{signedMoney(e.kind, e.amount)}</strong> },
    { key: 'method', header: 'Hình thức', render: (e) => (e.method ? PAYMENT_METHOD[e.method] : '—') },
    {
      key: 'reason',
      header: 'Lý do / tham chiếu',
      render: (e) => (
        <>
          <p>{e.reason ?? '—'}</p>
          {e.reference && <p className="cell-sub">Tham chiếu: {e.reference}</p>}
          {e.reversedByEntryId && <Badge tone="warning">Đã bị đảo</Badge>}
        </>
      ),
    },
    {
      key: 'act',
      header: '',
      align: 'right',
      render: (e) => (
        <span className="row" style={{ justifyContent: 'flex-end' }}>
          <Button size="sm" variant="ghost" aria-label={`Chi tiết giao dịch cọc ${DEPOSIT_KIND[e.kind].label} ${money(e.amount)}`} onClick={() => setViewing(e.id)}>
            Chi tiết
          </Button>
          {writable && !refundOnly && e.kind !== 'REVERSAL' && !e.reversedByEntryId && (
            <Button size="sm" variant="ghost" aria-label={`Đảo giao dịch cọc ${DEPOSIT_KIND[e.kind].label} ${money(e.amount)}`} onClick={() => setReversing(e)}>
              Đảo
            </Button>
          )}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Tiền cọc"
        description="Sổ cọc theo từng hợp đồng, tách khỏi hóa đơn. Hệ thống chỉ ghi nhận việc đã xảy ra (thu, khấu trừ, hoàn), không tự chuyển hay hoàn tiền; ghi nhầm thì đảo bằng bút toán mới."
        actions={
          writable &&
          contractId && (
            <Button variant="dark" onClick={() => setAdding(true)}>
              <Plus size={16} aria-hidden="true" /> Ghi nhận giao dịch cọc
            </Button>
          )
        }
      />
      <div className="stack">
        <Section flush>
          <FilterBar>
            <Select aria-label="Hợp đồng" value={contractId ?? ''} onChange={(e) => set({ contractId: e.target.value, page: '' })} style={{ minWidth: 320 }}>
              <option value="">— Chọn hợp đồng —</option>
              {(contracts.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  Phòng {c.roomCode}
                  {c.buildingName ? ` (${c.buildingName})` : ''} • {c.tenantName} • {CONTRACT_PHASE[c.phase].label}
                </option>
              ))}
            </Select>
          </FilterBar>
        </Section>

        {contracts.error ? (
          <ErrorState error={contracts.error} onRetry={() => contracts.refetch()} />
        ) : !contractId ? (
          <Section>
            <EmptyState title="Chọn một hợp đồng" description="Sổ cọc và số dư sẽ hiển thị tại đây. Hợp đồng đang hiệu lực hoặc đã kết thúc đều xem được." />
          </Section>
        ) : (
          <>
            {refundOnly && (
              <p className="alert alert--warning" role="status">
                {membership.status === 'ARCHIVED' ? 'Workspace' : 'Tòa nhà'} đã lưu trữ: chỉ ghi nhận được hoàn cọc số dư còn lại.
              </p>
            )}
            {contract?.phase === 'CANCELLED' && (
              <p className="alert alert--info" role="status">
                Hợp đồng đã hủy trước ngày bắt đầu. Tiền cọc đã nhận không tự động hoàn; ghi nhận hoàn cọc thủ công khi đã trả lại tiền.
              </p>
            )}
            <Section title={contract ? `Phòng ${contract.roomCode} — ${contract.tenantName}` : 'Số dư cọc'}>
              {deposit.isLoading ? (
                <LoadingBlock lines={3} />
              ) : (
                <KeyValueList
                  items={[
                    { label: 'Đã thu', value: money(d?.collectedTotal) },
                    { label: 'Đã khấu trừ', value: money(d?.deductedTotal) },
                    { label: 'Đã hoàn', value: money(d?.refundedTotal) },
                    { label: 'Số dư cọc', value: <strong>{money(d?.balance)}</strong> },
                  ]}
                />
              )}
            </Section>
            <Section title="Sổ giao dịch" flush>
              <DataTable
                columns={columns}
                rows={d?.items}
                rowKey={(e) => e.id}
                isLoading={deposit.isLoading}
                error={deposit.error}
                onRetry={() => deposit.refetch()}
                empty={<EmptyState title="Chưa có giao dịch cọc" />}
              />
              <Pagination page={page} pageSize={PAGE} total={d?.total ?? 0} onChange={(p) => set({ page: String(p) })} />
            </Section>
          </>
        )}
      </div>
      {adding && contractId && <DepositEntryModal ws={ws} contractId={contractId} refundOnly={refundOnly} balance={d?.balance} onClose={() => setAdding(false)} />}
      {viewing && contractId && <DepositDetailModal ws={ws} contractId={contractId} entryId={viewing} onClose={() => setViewing(null)} />}
      {reversing && contractId && <ReverseDepositModal ws={ws} contractId={contractId} entry={reversing} onClose={() => setReversing(null)} />}
    </>
  );
}

function DepositEntryModal({ ws, contractId, refundOnly, balance, onClose }: { ws: string; contractId: string; refundOnly: boolean; balance?: string; onClose: () => void }) {
  const create = useCreateDepositEntry(ws, contractId);
  const toast = useToast();
  const keyFor = useIdempotencyKey('dep');
  const form = useForm<DepositEntryForm>({
    resolver: zodResolver(depositEntrySchema),
    defaultValues: { kind: refundOnly ? 'REFUND' : 'COLLECTION', amount: '', method: 'CASH', occurredAt: isoToLocalInput(), reason: '', reference: '', note: '' },
  });
  const kind = form.watch('kind');
  const e = form.formState.errors;
  return (
    <Modal open title="Ghi nhận giao dịch cọc" description={balance !== undefined ? `Số dư hiện tại: ${money(balance)}. Khấu trừ và hoàn không vượt số dư.` : undefined} onClose={onClose}>
      <form
        className="stack"
        noValidate
        onSubmit={form.handleSubmit(async (v) => {
          const key = keyFor(JSON.stringify([v.kind, v.amount.trim(), v.method, v.occurredAt, v.reason.trim(), v.reference.trim(), v.note.trim()]));
          try {
            await create.mutateAsync(toDepositBody(v, key));
            toast.success('Đã ghi nhận giao dịch cọc.');
            onClose();
          } catch (err) {
            const a = toApiError(err);
            if (a.code === 'DEPOSIT_INSUFFICIENT_BALANCE') form.setError('amount', { message: depositErrorMessage(err) });
            else toast.error(depositErrorMessage(err));
          }
        })}
      >
        <FormField label="Loại giao dịch" required error={e.kind?.message} hint={DEPOSIT_KIND[kind as keyof typeof DEPOSIT_KIND]?.hint}>
          <select className="select" {...form.register('kind')}>
            {!refundOnly && <option value="COLLECTION">{DEPOSIT_KIND.COLLECTION.label}</option>}
            {!refundOnly && <option value="DEDUCTION">{DEPOSIT_KIND.DEDUCTION.label}</option>}
            <option value="REFUND">{DEPOSIT_KIND.REFUND.label}</option>
          </select>
        </FormField>
        <div className="form-grid form-grid--2">
          <FormField label="Số tiền (VND)" required error={e.amount?.message}>
            <input className="input" inputMode="numeric" {...form.register('amount')} />
          </FormField>
          <FormField label="Thời điểm xảy ra" required error={e.occurredAt?.message}>
            <input className="input" type="datetime-local" {...form.register('occurredAt')} />
          </FormField>
        </div>
        {kind !== 'DEDUCTION' && (
          <FormField label="Hình thức" required error={e.method?.message}>
            <select className="select" {...form.register('method')}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD[m]}
                </option>
              ))}
            </select>
          </FormField>
        )}
        {kind !== 'COLLECTION' && (
          <>
            <FormField label="Lý do" required error={e.reason?.message}>
              <input className="input" maxLength={500} {...form.register('reason')} />
            </FormField>
            <FormField
              label={kind === 'DEDUCTION' ? 'Nội dung liên quan' : 'Mã chuyển khoản / số phiếu chi'}
              required
              error={e.reference?.message}
              hint={kind === 'DEDUCTION' ? 'Ví dụ biên bản hư hỏng, hạng mục khấu trừ.' : 'Mã giao dịch ngân hàng hoặc số phiếu chi tiền mặt.'}
            >
              <input className="input" maxLength={200} {...form.register('reference')} />
            </FormField>
          </>
        )}
        <FormField label="Ghi chú" error={e.note?.message}>
          <textarea className="textarea" maxLength={500} {...form.register('note')} />
        </FormField>
        <div className="form-actions">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" variant="dark" loading={create.isPending}>
            Ghi nhận
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ReverseDepositModal({ ws, contractId, entry, onClose }: { ws: string; contractId: string; entry: DepositEntryResponse; onClose: () => void }) {
  const reverse = useReverseDepositEntry(ws, contractId);
  const toast = useToast();
  const keyFor = useIdempotencyKey('drv');
  const form = useForm<ReverseDepositForm>({ resolver: zodResolver(reverseDepositSchema), defaultValues: { reason: '' } });
  return (
    <Modal open title="Đảo giao dịch cọc" description={`Tạo bút toán đảo ${DEPOSIT_KIND[entry.kind].label.toLowerCase()} ${money(entry.amount)}. Giao dịch gốc được giữ nguyên.`} onClose={onClose}>
      <form
        className="stack"
        noValidate
        onSubmit={form.handleSubmit(async (v) => {
          try {
            await reverse.mutateAsync({ id: entry.id, input: { reason: v.reason.trim(), idempotencyKey: keyFor(`${entry.id}|${v.reason.trim()}`) } });
            toast.success('Đã đảo giao dịch cọc.');
            onClose();
          } catch (err) {
            toast.error(depositErrorMessage(err));
          }
        })}
      >
        <FormField label="Lý do đảo" required error={form.formState.errors.reason?.message}>
          <textarea className="textarea" maxLength={500} {...form.register('reason')} />
        </FormField>
        <div className="form-actions">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" variant="danger" loading={reverse.isPending}>
            Đảo giao dịch này
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function DepositDetailModal({ ws, contractId, entryId, onClose }: { ws: string; contractId: string; entryId: string; onClose: () => void }) {
  const detail = useDepositEntry(ws, contractId, entryId);
  const e = detail.data;
  return (
    <Modal open title="Chi tiết giao dịch cọc" onClose={onClose}>
      {detail.isLoading ? (
        <LoadingBlock lines={4} />
      ) : detail.error || !e ? (
        <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
      ) : (
        <KeyValueList
          items={[
            { label: 'Loại', value: DEPOSIT_KIND[e.kind].label },
            { label: 'Số tiền', value: signedMoney(e.kind, e.amount) },
            { label: 'Hình thức', value: e.method ? PAYMENT_METHOD[e.method] : '—' },
            { label: 'Thời điểm', value: formatDateTime(e.occurredAt) },
            { label: 'Lý do', value: e.reason ?? '—' },
            { label: 'Tham chiếu', value: e.reference ?? '—' },
            { label: 'Ghi chú', value: e.note ?? '—' },
            { label: 'Đảo giao dịch', value: e.reversesEntryId ?? '—' },
            { label: 'Đã bị đảo bởi', value: e.reversedByEntryId ?? '—' },
            { label: 'Người ghi nhận', value: e.createdBy },
            { label: 'Ghi lúc', value: formatDateTime(e.createdAt) },
            { label: 'Mã giao dịch', value: e.id },
          ]}
        />
      )}
      <div className="form-actions">
        <Button variant="secondary" onClick={onClose}>
          Đóng
        </Button>
      </div>
    </Modal>
  );
}
