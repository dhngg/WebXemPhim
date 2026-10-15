import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Plus, RefreshCw } from 'lucide-react';
import type { InvoiceAdjustmentResponse, InvoiceItemResponse, InvoiceResponse } from '@rental/shared';
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  DatePicker,
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
import {
  useAdjustment,
  useAdjustments,
  useCreateAdjustment,
  useCreateInvoice,
  useDeleteInvoice,
  useInvoice,
  useInvoiceList,
  useIssueInvoice,
  useUpdateInvoice,
} from '@/features/invoices/hooks';
import { INVOICE_STATUS, ITEM_TYPE, MISSING_REASON, PAYMENT_STATUS, invoiceErrorMessage } from '@/features/invoices/labels';
import {
  boolToTri,
  canIssue,
  diffUpdate,
  formatSignedMoney,
  invoiceAmount,
  isDraft,
  newIdempotencyKey,
  toAdjustmentBody,
  toCreateBody,
} from '@/features/invoices/mappers';
import { adjustmentSchema, createInvoiceSchema, updateInvoiceSchema, type AdjustmentForm, type CreateInvoiceForm, type UpdateInvoiceForm } from '@/features/invoices/schemas';
import { useBuildings, useRooms } from '@/features/property-management/hooks';
import { formatMoney } from '@/features/property-management/mappers';
import { useContractDetail, useContractList } from '@/features/tenancy/hooks';
import { CONTRACT_PHASE } from '@/features/tenancy/labels';
import { formatDecimal } from '@/features/utilities/mappers';
import { useWorkspaceContext } from '@/hooks/useWorkspaceContext';
import { useSearchState } from '@/hooks/useSearchState';
import { currentPeriod, periodLabel } from '@/lib/dates';
import { formatDate, formatDateTime } from '@/lib/format';
import { toApiError } from '@/services/http/ApiError';
import { BuildingSelect, NoBuilding } from './UtilityPages';

const PAGE_SIZE = 20;

/** Chỉ OWNER ghi dữ liệu, và workspace chưa lưu trữ. */
function useCanWrite() {
  const { can, membership } = useWorkspaceContext();
  return can('rooms.write') && membership.status !== 'ARCHIVED';
}

const money = (v: string | null | undefined) => (v === null || v === undefined ? '—' : formatMoney(v));

// ===================================================================== Danh sách
/** INV-01 — hóa đơn theo tòa nhà: lọc theo trạng thái/kỳ/phòng/hợp đồng, phân trang thật, lập bản nháp cho một hợp đồng. */
export function InvoicesPage() {
  const { ws, base } = useWorkspaceContext();
  const writable = useCanWrite();
  const navigate = useNavigate();
  const buildings = useBuildings(ws);
  const [s, set] = useSearchState(['buildingId', 'status', 'period', 'roomId', 'contractId', 'page'] as const);
  const active = useMemo(() => (buildings.data ?? []).filter((b) => b.status === 'ACTIVE'), [buildings.data]);
  const buildingId = active.find((b) => b.id === s.buildingId)?.id ?? active[0]?.id;
  const page = Math.max(1, Number(s.page) || 1);
  const filters = {
    status: (s.status || undefined) as 'DRAFT' | 'ISSUED' | undefined,
    period: s.period || undefined,
    roomId: s.roomId || undefined,
    contractId: s.contractId || undefined,
  };
  const list = useInvoiceList(ws, buildingId, filters, { page, limit: PAGE_SIZE });
  const rooms = useRooms(ws, { buildingId });
  const contracts = useContractList(ws);
  const buildingContracts = useMemo(() => (contracts.data ?? []).filter((c) => c.buildingId === buildingId), [contracts.data, buildingId]);
  const roomCode = (id: string) => rooms.data?.find((r) => r.id === id)?.code ?? '—';
  const tenantOf = (contractId: string) => buildingContracts.find((c) => c.id === contractId)?.tenantName ?? '—';
  const [creating, setCreating] = useState(false);

  const columns: Column<InvoiceResponse>[] = [
    {
      key: 'period',
      header: 'Kỳ',
      render: (i) => (
        <Link to={`${base}/invoices/${i.buildingId}/${i.id}`} className="cell-title">
          {periodLabel(i.period)}
        </Link>
      ),
    },
    { key: 'room', header: 'Phòng', render: (i) => roomCode(i.roomId) },
    { key: 'tenant', header: 'Người thuê', render: (i) => tenantOf(i.contractId) },
    {
      key: 'status',
      header: 'Hóa đơn',
      render: (i) => (
        <span className="row">
          <StatusBadge status={i.status} map={INVOICE_STATUS} />
          {isDraft(i) && !i.isComplete && <Badge tone="danger">Còn thiếu dữ liệu</Badge>}
        </span>
      ),
    },
    { key: 'pay', header: 'Thanh toán', render: (i) => (i.paymentStatus ? <StatusBadge status={i.paymentStatus} map={PAYMENT_STATUS} /> : <span className="muted">—</span>) },
    {
      key: 'amount',
      header: 'Số tiền',
      align: 'right',
      render: (i) => (
        <>
          <p>{money(invoiceAmount(i))}</p>
          {isDraft(i) && <p className="cell-sub">tạm tính</p>}
        </>
      ),
    },
    { key: 'due', header: 'Còn phải thu', align: 'right', render: (i) => money(i.outstanding) },
  ];

  return (
    <>
      <PageHeader
        title="Hóa đơn"
        description="Mỗi hóa đơn thuộc một hợp đồng và một kỳ. Tạo bản nháp, bổ sung dữ liệu còn thiếu, rồi phát hành; hóa đơn đã phát hành chỉ điều chỉnh bằng bút toán."
        actions={
          writable &&
          buildingId && (
            <Button variant="dark" onClick={() => setCreating(true)}>
              <Plus size={16} aria-hidden="true" /> Lập hóa đơn
            </Button>
          )
        }
      />
      {!buildingId ? (
        <NoBuilding loading={buildings.isLoading} error={buildings.error} onRetry={() => buildings.refetch()} />
      ) : (
        <Section flush>
          <FilterBar>
            <BuildingSelect value={buildingId} options={active} onChange={(id) => set({ buildingId: id, roomId: '', contractId: '', page: '' })} />
            <Select aria-label="Trạng thái hóa đơn" value={s.status} onChange={(e) => set({ status: e.target.value, page: '' })}>
              <option value="">Mọi trạng thái</option>
              <option value="DRAFT">{INVOICE_STATUS.DRAFT.label}</option>
              <option value="ISSUED">{INVOICE_STATUS.ISSUED.label}</option>
            </Select>
            <input className="input" type="month" aria-label="Kỳ" value={s.period} onChange={(e) => set({ period: e.target.value, page: '' })} style={{ minWidth: 150 }} />
            <Select aria-label="Phòng" value={s.roomId} onChange={(e) => set({ roomId: e.target.value, page: '' })}>
              <option value="">Mọi phòng</option>
              {(rooms.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code}
                </option>
              ))}
            </Select>
            <Select aria-label="Hợp đồng" value={s.contractId} onChange={(e) => set({ contractId: e.target.value, page: '' })}>
              <option value="">Mọi hợp đồng</option>
              {buildingContracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.roomCode} • {c.tenantName}
                </option>
              ))}
            </Select>
          </FilterBar>
          <DataTable
            columns={columns}
            rows={list.data?.items}
            rowKey={(i) => i.id}
            isLoading={list.isLoading}
            error={list.error}
            onRetry={() => list.refetch()}
            onRowClick={(i) => navigate(`${base}/invoices/${i.buildingId}/${i.id}`)}
            empty={<EmptyState title="Chưa có hóa đơn" description="Lập hóa đơn cho một hợp đồng và một kỳ để bắt đầu." />}
          />
          <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onChange={(p) => set({ page: String(p) })} />
        </Section>
      )}
      {creating && buildingId && (
        <CreateInvoiceModal
          ws={ws}
          buildingId={buildingId}
          contracts={buildingContracts.filter((c) => c.phase !== 'CANCELLED')}
          onClose={() => setCreating(false)}
          onCreated={(id) => navigate(`${base}/invoices/${buildingId}/${id}`)}
        />
      )}
    </>
  );
}

function CreateInvoiceModal({
  ws,
  buildingId,
  contracts,
  onClose,
  onCreated,
}: {
  ws: string;
  buildingId: string;
  contracts: Array<{ id: string; roomCode: string; tenantName: string; phase: keyof typeof CONTRACT_PHASE }>;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const create = useCreateInvoice(ws, buildingId);
  const toast = useToast();
  const form = useForm<CreateInvoiceForm>({
    resolver: zodResolver(createInvoiceSchema),
    defaultValues: { contractId: '', period: currentPeriod(), occupantCount: '', billVehicles: '', dueDate: '', notes: '' },
  });
  const e = form.formState.errors;
  return (
    <Modal open title="Lập hóa đơn" description="Hệ thống tạo một bản nháp và tự tính các dòng từ hợp đồng, bảng giá, chỉ số và dịch vụ của phòng." onClose={onClose}>
      <form
        className="stack"
        noValidate
        onSubmit={form.handleSubmit(async (v) => {
          try {
            const created = await create.mutateAsync(toCreateBody(v));
            toast.success('Đã tạo hóa đơn nháp.');
            onCreated(created.id);
          } catch (err) {
            const a = toApiError(err);
            if (a.code === 'INVOICE_DUPLICATE' || a.code === 'INVOICE_PERIOD_INVALID') form.setError('period', { message: invoiceErrorMessage(err) });
            else if (a.code === 'CONTRACT_NOT_FOUND') form.setError('contractId', { message: invoiceErrorMessage(err) });
            else if (a.code === 'INVOICE_VEHICLE_BILLING_CONFLICT') form.setError('billVehicles', { message: invoiceErrorMessage(err) });
            else toast.error(invoiceErrorMessage(err));
          }
        })}
      >
        <FormField label="Hợp đồng" required error={e.contractId?.message}>
          <select className="select" {...form.register('contractId')}>
            <option value="">— Chọn hợp đồng —</option>
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.roomCode} • {c.tenantName} ({CONTRACT_PHASE[c.phase].label})
              </option>
            ))}
          </select>
        </FormField>
        <div className="form-grid form-grid--2">
          <FormField label="Kỳ tính tiền" required error={e.period?.message}>
            <input className="input" type="month" {...form.register('period')} />
          </FormField>
          <FormField label="Hạn thanh toán" error={e.dueDate?.message}>
            <DatePicker {...form.register('dueDate')} />
          </FormField>
          <FormField label="Số người ở" error={e.occupantCount?.message} hint="Chỉ cần khi có dịch vụ tính theo người (0–100).">
            <input className="input" inputMode="numeric" {...form.register('occupantCount')} />
          </FormField>
          <FormField label="Tính phí xe trên hóa đơn này" error={e.billVehicles?.message} hint="Chỉ cần chọn khi người thuê có nhiều hợp đồng trong kỳ.">
            <select className="select" {...form.register('billVehicles')}>
              <option value="">Để hệ thống quyết định</option>
              <option value="true">Có</option>
              <option value="false">Không</option>
            </select>
          </FormField>
        </div>
        <FormField label="Ghi chú" error={e.notes?.message}>
          <textarea className="textarea" maxLength={1000} {...form.register('notes')} />
        </FormField>
        <div className="form-actions">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" variant="dark" loading={create.isPending}>
            Tạo bản nháp
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ===================================================================== Chi tiết
/** INV-02 — chi tiết: dòng tiền, dữ liệu còn thiếu, sửa/tính lại/phát hành/xóa bản nháp; điều chỉnh khi đã phát hành. */
export function InvoiceDetailPage() {
  const { ws, base } = useWorkspaceContext();
  const { buildingId, invoiceId } = useParams();
  const writable = useCanWrite();
  const navigate = useNavigate();
  const toast = useToast();
  const invoice = useInvoice(ws, buildingId, invoiceId);
  const inv = invoice.data;
  const update = useUpdateInvoice(ws, buildingId ?? '', invoiceId ?? '');
  const issue = useIssueInvoice(ws, buildingId ?? '', invoiceId ?? '');
  const remove = useDeleteInvoice(ws, buildingId ?? '', invoiceId ?? '');
  const contract = useContractDetail(ws, inv?.contractId);
  const rooms = useRooms(ws, { buildingId });
  const [editing, setEditing] = useState(false);
  const [confirmIssue, setConfirmIssue] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (invoice.isLoading) return <LoadingBlock lines={6} />;
  if (invoice.error || !inv) return <ErrorState error={invoice.error} onRetry={() => invoice.refetch()} />;
  const draft = isDraft(inv);
  const room = rooms.data?.find((r) => r.id === inv.roomId);

  const recalc = () =>
    update.mutate(
      {},
      { onSuccess: () => toast.success('Đã tính lại từ dữ liệu hiện tại.'), onError: (e) => toast.error(invoiceErrorMessage(e)) },
    );

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
    { key: 'amount', header: 'Thành tiền', align: 'right', render: (i) => formatMoney(i.amount) },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Hóa đơn', to: `${base}/invoices?buildingId=${inv.buildingId}` }, { label: periodLabel(inv.period) }]}
        title={`Hóa đơn kỳ ${periodLabel(inv.period)}${room ? ` — phòng ${room.code}` : ''}`}
        description={contract.data ? `Người thuê: ${contract.data.tenantName}` : undefined}
        eyebrow={
          <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
            <StatusBadge status={inv.status} map={INVOICE_STATUS} />
            {inv.paymentStatus && <StatusBadge status={inv.paymentStatus} map={PAYMENT_STATUS} />}
          </div>
        }
        actions={
          writable &&
          draft && (
            <>
              <Button variant="secondary" loading={update.isPending} onClick={recalc}>
                <RefreshCw size={16} aria-hidden="true" /> Tính lại
              </Button>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Sửa thông tin
              </Button>
              <Button variant="secondary" onClick={() => setConfirmDelete(true)}>
                Xóa bản nháp
              </Button>
              <Button variant="dark" disabled={!canIssue(inv)} onClick={() => setConfirmIssue(true)} title={inv.isComplete ? undefined : 'Cần bổ sung dữ liệu còn thiếu trước khi phát hành'}>
                Phát hành
              </Button>
            </>
          )
        }
      />

      {draft && inv.missingItems.length > 0 && (
        <div className="alert alert--warning" role="alert" style={{ marginBottom: 'var(--space-4)' }}>
          <AlertTriangle size={18} aria-hidden="true" />
          <div className="stack" style={{ gap: 'var(--space-2)' }}>
            <strong>Còn thiếu dữ liệu — chưa phát hành được. Bổ sung rồi bấm “Tính lại”.</strong>
            <ul className="list-plain stack" style={{ gap: 'var(--space-1)' }}>
              {inv.missingItems.map((m, idx) => {
                const info = MISSING_REASON[m.reason];
                return (
                  <li key={`${m.code}-${m.reason}-${idx}`} className="row">
                    <span>
                      {info?.label ?? m.reason} <span className="muted">({m.code})</span>
                      {m.detail ? ` — ${m.detail}` : ''}
                    </span>
                    {info?.target === 'meters' && <Link to={`${base}/meters?buildingId=${inv.buildingId}&period=${inv.period}`}>{info.action} →</Link>}
                    {info?.target === 'rates' && <Link to={`${base}/rates?buildingId=${inv.buildingId}`}>{info.action} →</Link>}
                    {info?.target === 'edit' && writable && (
                      <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                        {info.action}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
      {!draft && (
        <p className="alert alert--info" role="status" style={{ marginBottom: 'var(--space-4)' }}>
          Hóa đơn đã phát hành không sửa hoặc xóa được. Sai sót xử lý bằng bút toán điều chỉnh bên dưới.
        </p>
      )}

      <div className="grid grid--main-side">
        <div className="stack">
          <Section title="Các dòng tiền" flush>
            <DataTable columns={itemColumns} rows={inv.items} rowKey={(i) => i.id} empty={<EmptyState title="Chưa có dòng tiền" />} />
          </Section>
          {!draft && <AdjustmentsPanel ws={ws} invoice={inv} canWrite={writable} />}
        </div>
        <div className="stack">
          <Section title="Tổng tiền">
            <KeyValueList
              items={
                draft
                  ? [{ label: 'Tạm tính (chưa phải số chốt)', value: money(inv.provisionalAmount) }]
                  : [
                      { label: 'Tổng hóa đơn', value: money(inv.totalAmount) },
                      { label: 'Điều chỉnh', value: inv.adjustmentsTotal === null ? '—' : formatSignedMoney(inv.adjustmentsTotal) },
                      { label: 'Sau điều chỉnh', value: money(inv.adjustedTotal) },
                      { label: 'Đã thu', value: money(inv.paidTotal) },
                      { label: 'Còn phải thu', value: money(inv.outstanding) },
                      { label: 'Thanh toán', value: inv.paymentStatus ? PAYMENT_STATUS[inv.paymentStatus].label : '—' },
                    ]
              }
            />
            {!draft && (
              <p style={{ marginTop: 'var(--space-3)' }}>
                <Link to={`${base}/payments?buildingId=${inv.buildingId}&invoiceId=${inv.id}`}>Sổ thanh toán của hóa đơn →</Link>
              </p>
            )}
          </Section>
          <Section title="Thông tin">
            <KeyValueList
              items={[
                { label: 'Phòng', value: room ? <Link to={`${base}/rooms/${room.id}`}>{room.code}</Link> : '—' },
                { label: 'Hợp đồng', value: contract.data ? <Link to={`${base}/contracts/${contract.data.id}`}>{contract.data.tenantName}</Link> : '—' },
                { label: 'Hạn thanh toán', value: inv.dueDate ? formatDate(inv.dueDate) : '—' },
                { label: 'Số người ở', value: inv.occupantCount === null ? '—' : String(inv.occupantCount) },
                ...(inv.occupantCountConfirmedAt ? [{ label: 'Xác nhận số người lúc', value: formatDateTime(inv.occupantCountConfirmedAt) }] : []),
                { label: 'Tính phí xe', value: inv.billsVehicles === null ? 'Chưa quyết định' : inv.billsVehicles ? 'Có' : 'Không' },
                { label: 'Ghi chú', value: inv.notes ?? '—' },
                { label: 'Quy tắc làm tròn', value: inv.roundingRule },
                ...(inv.issuedAt ? [{ label: 'Phát hành lúc', value: formatDateTime(inv.issuedAt) }] : []),
                { label: 'Tạo lúc', value: formatDateTime(inv.createdAt) },
              ]}
            />
          </Section>
        </div>
      </div>

      {editing && <EditInvoiceModal invoice={inv} onClose={() => setEditing(false)} update={update} />}
      <ConfirmDialog
        open={confirmIssue}
        title="Phát hành hóa đơn?"
        description="Sau khi phát hành, số tiền được chốt và không thể sửa hay xóa; sai sót chỉ điều chỉnh bằng bút toán."
        confirmLabel="Phát hành"
        loading={issue.isPending}
        onCancel={() => setConfirmIssue(false)}
        onConfirm={() =>
          issue.mutate(undefined, {
            onSuccess: () => toast.success('Đã phát hành hóa đơn.'),
            onError: (e) => toast.error(invoiceErrorMessage(e)),
            onSettled: () => setConfirmIssue(false),
          })
        }
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Xóa bản nháp?"
        description="Chỉ bản nháp mới xóa được. Thao tác này không hoàn tác."
        confirmLabel="Xóa bản nháp"
        danger
        loading={remove.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() =>
          remove.mutate(undefined, {
            onSuccess: () => {
              toast.success('Đã xóa bản nháp.');
              navigate(`${base}/invoices?buildingId=${inv.buildingId}`);
            },
            onError: (e) => {
              toast.error(invoiceErrorMessage(e));
              setConfirmDelete(false);
            },
          })
        }
      />
    </>
  );
}

function EditInvoiceModal({ invoice, onClose, update }: { invoice: InvoiceResponse; onClose: () => void; update: ReturnType<typeof useUpdateInvoice> }) {
  const toast = useToast();
  const form = useForm<UpdateInvoiceForm>({
    resolver: zodResolver(updateInvoiceSchema),
    defaultValues: {
      occupantCount: invoice.occupantCount === null ? '' : String(invoice.occupantCount),
      billVehicles: boolToTri(invoice.billsVehicles),
      dueDate: invoice.dueDate ?? '',
      notes: invoice.notes ?? '',
    },
  });
  const e = form.formState.errors;
  return (
    <Modal open title="Sửa bản nháp" description="Lưu sẽ tính lại toàn bộ các dòng tiền từ dữ liệu hiện tại. Chỉ các trường thay đổi được gửi đi." onClose={onClose}>
      <form
        className="stack"
        noValidate
        onSubmit={form.handleSubmit(async (v) => {
          try {
            await update.mutateAsync(diffUpdate(invoice, v));
            toast.success('Đã cập nhật và tính lại hóa đơn.');
            onClose();
          } catch (err) {
            const a = toApiError(err);
            if (a.code === 'INVOICE_VEHICLE_BILLING_CONFLICT') form.setError('billVehicles', { message: invoiceErrorMessage(err) });
            else toast.error(invoiceErrorMessage(err));
          }
        })}
      >
        <div className="form-grid form-grid--2">
          <FormField label="Số người ở" error={e.occupantCount?.message} hint="0–100. Backend không cho xóa số đã nhập.">
            <input className="input" inputMode="numeric" {...form.register('occupantCount')} />
          </FormField>
          <FormField label="Tính phí xe trên hóa đơn này" error={e.billVehicles?.message}>
            <select className="select" {...form.register('billVehicles')}>
              <option value="">Chưa chọn</option>
              <option value="true">Có</option>
              <option value="false">Không</option>
            </select>
          </FormField>
          <FormField label="Hạn thanh toán" error={e.dueDate?.message}>
            <DatePicker {...form.register('dueDate')} />
          </FormField>
        </div>
        <FormField label="Ghi chú" error={e.notes?.message}>
          <textarea className="textarea" maxLength={1000} {...form.register('notes')} />
        </FormField>
        <div className="form-actions">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" variant="dark" loading={update.isPending}>
            Lưu và tính lại
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ===================================================================== Điều chỉnh
const ADJ_PAGE = 10;

/** Bút toán điều chỉnh của hóa đơn đã phát hành: xem danh sách/chi tiết, thêm mới, sửa lại một bút toán trước đó. */
function AdjustmentsPanel({ ws, invoice, canWrite }: { ws: string; invoice: InvoiceResponse; canWrite: boolean }) {
  const [page, setPage] = useState(1);
  const list = useAdjustments(ws, invoice.buildingId, invoice.id, { page, limit: ADJ_PAGE });
  const [adding, setAdding] = useState<{ reference?: string } | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const refOf = (a: InvoiceAdjustmentResponse) => a.referenceAdjustmentId;
  const corrected = new Set((list.data?.items ?? []).map(refOf).filter(Boolean));

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
    {
      key: 'act',
      header: '',
      align: 'right',
      render: (a) => (
        <span className="row" style={{ justifyContent: 'flex-end' }}>
          <Button size="sm" variant="ghost" aria-label={`Chi tiết điều chỉnh ${formatSignedMoney(a.amount)}`} onClick={() => setViewing(a.id)}>
            Chi tiết
          </Button>
          {canWrite && !corrected.has(a.id) && (
            <Button size="sm" variant="ghost" aria-label={`Sửa lại điều chỉnh ${formatSignedMoney(a.amount)}`} onClick={() => setAdding({ reference: a.id })}>
              Sửa lại
            </Button>
          )}
        </span>
      ),
    },
  ];

  return (
    <Section
      title="Điều chỉnh"
      subtitle="Bút toán không sửa hay xóa được; sai sót thì thêm bút toán mới (có thể tham chiếu bút toán cũ)."
      actions={
        canWrite && (
          <Button size="sm" variant="secondary" onClick={() => setAdding({})}>
            <Plus size={14} aria-hidden="true" /> Thêm điều chỉnh
          </Button>
        )
      }
      flush
    >
      {list.data && (
        <div className="row" style={{ padding: 'var(--space-3) var(--space-4)', gap: 'var(--space-5)' }}>
          <span>Ban đầu: <strong>{formatMoney(list.data.originalTotal)}</strong></span>
          <span>Điều chỉnh: <strong>{formatSignedMoney(list.data.adjustmentsTotal)}</strong></span>
          <span>Sau điều chỉnh: <strong>{formatMoney(list.data.adjustedTotal)}</strong></span>
        </div>
      )}
      <DataTable
        columns={columns}
        rows={list.data?.items}
        rowKey={(a) => a.id}
        isLoading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        empty={<EmptyState title="Chưa có điều chỉnh" />}
      />
      <Pagination page={page} pageSize={ADJ_PAGE} total={list.data?.total ?? 0} onChange={setPage} />
      {adding && <AdjustmentModal ws={ws} invoice={invoice} reference={adding.reference} candidates={list.data?.items ?? []} corrected={corrected} onClose={() => setAdding(null)} />}
      {viewing && <AdjustmentDetailModal ws={ws} invoice={invoice} adjustmentId={viewing} onClose={() => setViewing(null)} />}
    </Section>
  );
}

function AdjustmentModal({
  ws,
  invoice,
  reference,
  candidates,
  corrected,
  onClose,
}: {
  ws: string;
  invoice: InvoiceResponse;
  reference?: string;
  candidates: InvoiceAdjustmentResponse[];
  corrected: Set<string | null>;
  onClose: () => void;
}) {
  const create = useCreateAdjustment(ws, invoice.buildingId, invoice.id);
  const toast = useToast();
  // Khóa chống gửi trùng: giữ nguyên khi thử lại cùng nội dung; nội dung đổi = thao tác mới = khóa mới.
  const attempt = useRef<{ key: string; sig: string }>({ key: newIdempotencyKey(), sig: '' });
  const form = useForm<AdjustmentForm>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: { amount: '', reason: '', referenceAdjustmentId: reference ?? '', idempotencyKey: attempt.current.key },
  });
  const e = form.formState.errors;
  return (
    <Modal open title={reference ? 'Sửa lại một điều chỉnh' : 'Thêm điều chỉnh'} description="Số dương = thu thêm, số âm = giảm. Làm tròn 1 đồng; không được bằng 0, không làm tổng hóa đơn âm hoặc thấp hơn số đã thu." onClose={onClose}>
      <form
        className="stack"
        noValidate
        onSubmit={form.handleSubmit(async (v) => {
          const sig = `${v.amount.trim()}|${v.reason.trim()}|${v.referenceAdjustmentId}`;
          if (attempt.current.sig && attempt.current.sig !== sig) attempt.current = { key: newIdempotencyKey(), sig };
          else attempt.current.sig = sig;
          try {
            await create.mutateAsync(toAdjustmentBody({ amount: v.amount, reason: v.reason, idempotencyKey: attempt.current.key, referenceAdjustmentId: v.referenceAdjustmentId || undefined }));
            toast.success('Đã ghi điều chỉnh.');
            onClose();
          } catch (err) {
            const a = toApiError(err);
            if (a.code === 'INVOICE_ADJUSTMENT_INVALID' || a.code === 'INVOICE_ADJUSTMENT_BELOW_PAID') form.setError('amount', { message: invoiceErrorMessage(err) });
            else toast.error(invoiceErrorMessage(err));
          }
        })}
      >
        <FormField label="Số tiền (VND, có dấu)" required error={e.amount?.message} hint="Ví dụ -50000 để giảm 50.000 ₫, hoặc 20000 để thu thêm.">
          <input className="input" inputMode="decimal" {...form.register('amount')} />
        </FormField>
        <FormField label="Lý do" required error={e.reason?.message}>
          <textarea className="textarea" maxLength={500} {...form.register('reason')} />
        </FormField>
        <FormField label="Sửa lại điều chỉnh trước đó (tùy chọn)" error={e.referenceAdjustmentId?.message}>
          <select className="select" {...form.register('referenceAdjustmentId')}>
            <option value="">Không tham chiếu</option>
            {candidates
              .filter((c) => !corrected.has(c.id) || c.id === reference)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {formatSignedMoney(c.amount)} — {c.reason.slice(0, 40)}
                </option>
              ))}
          </select>
        </FormField>
        <div className="form-actions">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" variant="dark" loading={create.isPending}>
            Ghi điều chỉnh
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AdjustmentDetailModal({ ws, invoice, adjustmentId, onClose }: { ws: string; invoice: InvoiceResponse; adjustmentId: string; onClose: () => void }) {
  const detail = useAdjustment(ws, invoice.buildingId, invoice.id, adjustmentId);
  const a = detail.data;
  return (
    <Modal open title="Chi tiết điều chỉnh" onClose={onClose}>
      {detail.isLoading ? (
        <LoadingBlock lines={4} />
      ) : detail.error || !a ? (
        <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
      ) : (
        <KeyValueList
          items={[
            { label: 'Số tiền áp dụng', value: formatSignedMoney(a.amount) },
            { label: 'Số tiền đã nhập', value: a.requestedAmount },
            { label: 'Lý do', value: a.reason },
            { label: 'Sửa lại bút toán', value: a.referenceAdjustmentId ?? '—' },
            { label: 'Người ghi', value: a.createdBy },
            { label: 'Thời điểm', value: formatDateTime(a.createdAt) },
            { label: 'Mã bút toán', value: a.id },
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
