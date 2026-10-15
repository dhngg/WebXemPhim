import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { MAINTENANCE_PRIORITIES, MAINTENANCE_STATUSES, type MaintenanceRequestResponse, type MaintenanceStatus } from '@rental/shared';
import {
  Button,
  DataTable,
  EmptyState,
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
import { PRIORITY_LABEL, STATUS_LABEL } from '@/features/maintenance/owner-model';
import { useCancelTenantMaintenance, useCreateTenantMaintenance, useEligibleContracts, useTenantMaintenance, useTenantMaintenanceRequest } from '@/features/tenant-portal/hooks';
import {
  PAGE_SIZE,
  cancelSchema,
  canCancelMaintenance,
  createMaintenanceSchema,
  tenantErrorMessage,
  toCancelBody,
  toCreateMaintenanceBody,
  type CancelForm,
  type CreateMaintenanceForm,
} from '@/features/tenant-portal/model';
import { useSearchState } from '@/hooks/useSearchState';
import { formatDate, formatDateTime } from '@/lib/format';
import { DetailError } from './parts';

/** TPT-06 — yêu cầu bảo trì của tôi: lọc theo trạng thái, phân trang thật, gửi yêu cầu mới cho hợp đồng đủ điều kiện. */
export function TenantMaintenancePage() {
  const navigate = useNavigate();
  const [s, set] = useSearchState(['status', 'page'] as const);
  const page = Math.max(1, Number(s.page) || 1);
  const status = (MAINTENANCE_STATUSES as readonly string[]).includes(s.status) ? (s.status as MaintenanceStatus) : undefined;
  const list = useTenantMaintenance({ status, page, limit: PAGE_SIZE });
  const [creating, setCreating] = useState(false);

  const columns: Column<MaintenanceRequestResponse>[] = [
    {
      key: 'title',
      header: 'Yêu cầu',
      render: (r) => (
        <Link to={`/tenant/maintenance/${r.id}`} className="cell-title">
          {r.title}
        </Link>
      ),
    },
    { key: 'prio', header: 'Ưu tiên', render: (r) => <StatusBadge status={r.priority} map={PRIORITY_LABEL} /> },
    { key: 'st', header: 'Trạng thái', render: (r) => <StatusBadge status={r.status} map={STATUS_LABEL} /> },
    { key: 'at', header: 'Gửi lúc', render: (r) => formatDateTime(r.createdAt) },
  ];

  return (
    <>
      <PageHeader
        title="Bảo trì"
        description="Gửi yêu cầu sửa chữa cho phòng bạn đang thuê và theo dõi tiến độ xử lý."
        actions={
          <Button variant="dark" onClick={() => setCreating(true)}>
            <Plus size={16} aria-hidden="true" /> Gửi yêu cầu
          </Button>
        }
      />
      <Section flush>
        <FilterBar>
          <Select aria-label="Trạng thái" value={s.status} onChange={(e) => set({ status: e.target.value, page: '' })}>
            <option value="">Mọi trạng thái</option>
            {MAINTENANCE_STATUSES.map((st) => (
              <option key={st} value={st}>
                {STATUS_LABEL[st].label}
              </option>
            ))}
          </Select>
        </FilterBar>
        <DataTable
          columns={columns}
          rows={list.data?.items}
          rowKey={(r) => r.id}
          isLoading={list.isLoading}
          error={list.error}
          onRetry={() => list.refetch()}
          onRowClick={(r) => navigate(`/tenant/maintenance/${r.id}`)}
          empty={<EmptyState title="Chưa có yêu cầu bảo trì" description="Gửi yêu cầu khi phòng có sự cố cần sửa." />}
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onChange={(p) => set({ page: String(p) })} />
      </Section>
      {creating && <CreateRequestModal onClose={() => setCreating(false)} onCreated={(id) => navigate(`/tenant/maintenance/${id}`)} />}
    </>
  );
}

function CreateRequestModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const contracts = useEligibleContracts(true);
  const create = useCreateTenantMaintenance();
  const toast = useToast();
  const form = useForm<CreateMaintenanceForm>({
    resolver: zodResolver(createMaintenanceSchema),
    defaultValues: { contractId: '', title: '', description: '', priority: '' },
  });
  const e = form.formState.errors;
  const none = !contracts.isLoading && !contracts.error && !contracts.data?.length;

  return (
    <Modal open title="Gửi yêu cầu bảo trì" description="Chỉ hợp đồng đang hiệu lực và đã đến ngày bắt đầu mới gửi được yêu cầu." onClose={onClose}>
      <form
        className="stack"
        noValidate
        onSubmit={form.handleSubmit(async (v) => {
          try {
            const created = await create.mutateAsync(toCreateMaintenanceBody(v));
            toast.success('Đã gửi yêu cầu bảo trì.');
            onCreated(created.id);
          } catch (err) {
            toast.error(tenantErrorMessage(err));
          }
        })}
      >
        {contracts.isLoading && <LoadingBlock lines={1} />}
        {contracts.error && (
          <p className="alert alert--danger" role="alert">
            {tenantErrorMessage(contracts.error)}
          </p>
        )}
        {none && (
          <p className="alert alert--info" role="status">
            Bạn chưa có hợp đồng đủ điều kiện (đang hiệu lực và đã đến ngày bắt đầu) nên chưa gửi được yêu cầu bảo trì.
          </p>
        )}
        <FormField label="Hợp đồng" required error={e.contractId?.message}>
          <select className="select" disabled={none} {...form.register('contractId')}>
            <option value="">— Chọn hợp đồng —</option>
            {(contracts.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {`Phòng ${c.room.code} • ${formatDate(c.startDate)} – ${formatDate(c.endDate)}`}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Tiêu đề" required error={e.title?.message}>
          <input className="input" maxLength={150} {...form.register('title')} />
        </FormField>
        <FormField label="Mô tả" required error={e.description?.message}>
          <textarea className="textarea" maxLength={5000} {...form.register('description')} />
        </FormField>
        <FormField label="Mức ưu tiên" error={e.priority?.message} hint="Để trống thì hệ thống dùng mức mặc định.">
          <select className="select" {...form.register('priority')}>
            <option value="">Mặc định của hệ thống</option>
            {MAINTENANCE_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p].label}
              </option>
            ))}
          </select>
        </FormField>
        <div className="form-actions">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" variant="dark" loading={create.isPending} disabled={none}>
            Gửi yêu cầu
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** TPT-07 — chi tiết yêu cầu: trạng thái, ghi chú xử lý, lịch sử; hủy được khi còn “Mới tiếp nhận”. */
export function TenantMaintenanceDetailPage() {
  const { requestId } = useParams();
  const detail = useTenantMaintenanceRequest(requestId);
  const [cancelling, setCancelling] = useState(false);
  const r = detail.data;

  if (detail.isLoading) return <LoadingBlock lines={6} />;
  if (detail.error || !r) return <DetailError error={detail.error} onRetry={() => detail.refetch()} backTo="/tenant/maintenance" backLabel="Về danh sách yêu cầu" />;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Bảo trì', to: '/tenant/maintenance' }, { label: r.title }]}
        title={r.title}
        eyebrow={
          <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
            <StatusBadge status={r.status} map={STATUS_LABEL} />
            <StatusBadge status={r.priority} map={PRIORITY_LABEL} />
          </div>
        }
        actions={
          canCancelMaintenance(r) && (
            <Button variant="secondary" onClick={() => setCancelling(true)}>
              Hủy yêu cầu
            </Button>
          )
        }
      />
      <div className="grid grid--main-side">
        <div className="stack">
          <Section title="Mô tả">
            <p style={{ whiteSpace: 'pre-wrap' }}>{r.description}</p>
          </Section>
          {r.resolutionNote && (
            <Section title="Ghi chú xử lý">
              <p style={{ whiteSpace: 'pre-wrap' }}>{r.resolutionNote}</p>
            </Section>
          )}
          <Section title="Lịch sử trạng thái">
            {r.history?.length ? (
              <ol className="list-plain stack">
                {r.history.map((h) => (
                  <li key={h.id}>
                    <strong>
                      {h.fromStatus === null
                        ? 'Đã gửi yêu cầu'
                        : h.fromStatus === h.toStatus
                          ? `Đổi mức ưu tiên: ${PRIORITY_LABEL[h.priority].label}`
                          : `${STATUS_LABEL[h.fromStatus].label} → ${STATUS_LABEL[h.toStatus].label}`}
                    </strong>
                    <p className="cell-sub">{formatDateTime(h.createdAt)}</p>
                    {h.note && <p className="text-sm">{h.note}</p>}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted text-sm">Chưa có lịch sử.</p>
            )}
          </Section>
        </div>
        <Section title="Thông tin">
          <KeyValueList
            items={[
              { label: 'Hợp đồng', value: r.contractId ? <Link to={`/tenant/contracts/${r.contractId}`}>Xem hợp đồng</Link> : '—' },
              { label: 'Gửi lúc', value: formatDateTime(r.createdAt) },
              { label: 'Cập nhật', value: formatDateTime(r.updatedAt) },
              ...(r.resolvedAt ? [{ label: 'Đã xử lý lúc', value: formatDateTime(r.resolvedAt) }] : []),
              ...(r.closedAt ? [{ label: 'Đóng lúc', value: formatDateTime(r.closedAt) }] : []),
            ]}
          />
        </Section>
      </div>
      {cancelling && <CancelRequestModal request={r} onClose={() => setCancelling(false)} />}
    </>
  );
}

function CancelRequestModal({ request, onClose }: { request: MaintenanceRequestResponse; onClose: () => void }) {
  const cancel = useCancelTenantMaintenance(request.id);
  const toast = useToast();
  const form = useForm<CancelForm>({ resolver: zodResolver(cancelSchema), defaultValues: { reason: '' } });
  return (
    <Modal open title="Hủy yêu cầu bảo trì" description="Chỉ hủy được khi chủ trọ chưa tiếp nhận xử lý. Việc hủy không hoàn tác." onClose={onClose}>
      <form
        className="stack"
        noValidate
        onSubmit={form.handleSubmit(async (v) => {
          try {
            await cancel.mutateAsync(toCancelBody(v));
            toast.success('Đã hủy yêu cầu bảo trì.');
          } catch (err) {
            toast.error(tenantErrorMessage(err));
          } finally {
            onClose();
          }
        })}
      >
        <FormField label="Lý do (không bắt buộc)" error={form.formState.errors.reason?.message}>
          <textarea className="textarea" maxLength={500} {...form.register('reason')} />
        </FormField>
        <div className="form-actions">
          <Button variant="secondary" onClick={onClose}>
            Giữ yêu cầu
          </Button>
          <Button type="submit" variant="dark" loading={cancel.isPending}>
            Hủy yêu cầu
          </Button>
        </div>
      </form>
    </Modal>
  );
}
