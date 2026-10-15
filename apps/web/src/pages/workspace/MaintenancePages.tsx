import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { MAINTENANCE_PRIORITIES, MAINTENANCE_STATUSES, type MaintenanceRequestResponse, type MaintenanceStatus } from '@rental/shared';
import {
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
import { useCreateMaintenance, useMaintenanceRequest, useMaintenanceRequests, useTransitionMaintenance, useUpdateMaintenance } from '@/features/maintenance/owner-hooks';
import {
  PRIORITY_LABEL,
  STATUS_LABEL,
  TRANSITION_ACTION,
  canEdit,
  createSchema,
  diffEdit,
  editSchema,
  maintenanceErrorMessage,
  nextStatus,
  noteRequired,
  toCreateBody,
  transitionSchema,
  type CreateForm,
  type EditForm,
  type TransitionForm,
} from '@/features/maintenance/owner-model';
import { useBuildings, useRooms } from '@/features/property-management/hooks';
import { useContractDetail } from '@/features/tenancy/hooks';
import { useWorkspaceContext } from '@/hooks/useWorkspaceContext';
import { useSearchState } from '@/hooks/useSearchState';
import { formatDateTime } from '@/lib/format';
import { toApiError } from '@/services/http/ApiError';
import { BuildingSelect, NoBuilding } from './UtilityPages';

const PAGE = 20;

/** Chỉ OWNER ghi dữ liệu, và workspace chưa lưu trữ. */
function useCanWrite() {
  const { can, membership } = useWorkspaceContext();
  return can('rooms.write') && membership.status !== 'ARCHIVED';
}

// ===================================================================== Danh sách
/** MNT-01 — yêu cầu bảo trì theo tòa nhà: lọc theo trạng thái/ưu tiên/phòng, phân trang thật, tạo yêu cầu cho một phòng. */
export function MaintenancePage() {
  const { ws, base } = useWorkspaceContext();
  const writable = useCanWrite();
  const navigate = useNavigate();
  const buildings = useBuildings(ws);
  const [s, set] = useSearchState(['buildingId', 'status', 'priority', 'roomId', 'page'] as const);
  const active = useMemo(() => (buildings.data ?? []).filter((b) => b.status === 'ACTIVE'), [buildings.data]);
  const buildingId = active.find((b) => b.id === s.buildingId)?.id ?? active[0]?.id;
  const page = Math.max(1, Number(s.page) || 1);
  const filters = {
    status: (s.status || undefined) as MaintenanceStatus | undefined,
    priority: (s.priority || undefined) as (typeof MAINTENANCE_PRIORITIES)[number] | undefined,
    roomId: s.roomId || undefined,
  };
  const list = useMaintenanceRequests(ws, buildingId, filters, { page, limit: PAGE });
  const rooms = useRooms(ws, { buildingId });
  const roomCode = (id: string) => rooms.data?.find((r) => r.id === id)?.code ?? '—';
  const [creating, setCreating] = useState(false);

  const columns: Column<MaintenanceRequestResponse>[] = [
    {
      key: 'title',
      header: 'Yêu cầu',
      render: (r) => (
        <Link to={`${base}/maintenance/${r.buildingId}/${r.id}`} className="cell-title">
          {r.title}
        </Link>
      ),
    },
    { key: 'room', header: 'Phòng', render: (r) => roomCode(r.roomId) },
    { key: 'prio', header: 'Ưu tiên', render: (r) => <StatusBadge status={r.priority} map={PRIORITY_LABEL} /> },
    { key: 'st', header: 'Trạng thái', render: (r) => <StatusBadge status={r.status} map={STATUS_LABEL} /> },
    { key: 'at', header: 'Tạo lúc', render: (r) => formatDateTime(r.createdAt) },
  ];

  return (
    <>
      <PageHeader
        title="Bảo trì"
        description="Yêu cầu sửa chữa theo từng tòa nhà. Chủ trọ tự xử lý: Mới → Đang xử lý → Đã xử lý → Đã đóng, không giao người phụ trách."
        actions={
          writable &&
          buildingId && (
            <Button variant="dark" onClick={() => setCreating(true)}>
              <Plus size={16} aria-hidden="true" /> Tạo yêu cầu
            </Button>
          )
        }
      />
      {!buildingId ? (
        <NoBuilding loading={buildings.isLoading} error={buildings.error} onRetry={() => buildings.refetch()} />
      ) : (
        <Section flush>
          <FilterBar>
            <BuildingSelect value={buildingId} options={active} onChange={(id) => set({ buildingId: id, roomId: '', page: '' })} />
            <Select aria-label="Trạng thái" value={s.status} onChange={(e) => set({ status: e.target.value, page: '' })}>
              <option value="">Mọi trạng thái</option>
              {MAINTENANCE_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {STATUS_LABEL[st].label}
                </option>
              ))}
            </Select>
            <Select aria-label="Ưu tiên" value={s.priority} onChange={(e) => set({ priority: e.target.value, page: '' })}>
              <option value="">Mọi mức ưu tiên</option>
              {MAINTENANCE_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p].label}
                </option>
              ))}
            </Select>
            <Select aria-label="Phòng" value={s.roomId} onChange={(e) => set({ roomId: e.target.value, page: '' })}>
              <option value="">Mọi phòng</option>
              {(rooms.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code}
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
            onRowClick={(r) => navigate(`${base}/maintenance/${r.buildingId}/${r.id}`)}
            empty={<EmptyState title="Không có yêu cầu bảo trì" description="Tạo yêu cầu cho một phòng khi có sự cố cần sửa." />}
          />
          <Pagination page={page} pageSize={PAGE} total={list.data?.total ?? 0} onChange={(p) => set({ page: String(p) })} />
        </Section>
      )}
      {creating && buildingId && (
        <CreateMaintenanceModal ws={ws} buildingId={buildingId} rooms={(rooms.data ?? []).filter((r) => r.status !== 'ARCHIVED')} onClose={() => setCreating(false)} onCreated={(id) => navigate(`${base}/maintenance/${buildingId}/${id}`)} />
      )}
    </>
  );
}

function CreateMaintenanceModal({ ws, buildingId, rooms, onClose, onCreated }: { ws: string; buildingId: string; rooms: Array<{ id: string; code: string }>; onClose: () => void; onCreated: (id: string) => void }) {
  const create = useCreateMaintenance(ws, buildingId);
  const toast = useToast();
  const form = useForm<CreateForm>({ resolver: zodResolver(createSchema), defaultValues: { roomId: '', title: '', description: '', priority: '' } });
  const e = form.formState.errors;
  return (
    <Modal open title="Tạo yêu cầu bảo trì" description="Hệ thống tự gắn hợp đồng đang hiệu lực của phòng (nếu có). Hợp đồng chưa bắt đầu không được gắn." onClose={onClose}>
      <form
        className="stack"
        noValidate
        onSubmit={form.handleSubmit(async (v) => {
          try {
            const created = await create.mutateAsync(toCreateBody(v));
            toast.success('Đã tạo yêu cầu bảo trì.');
            onCreated(created.id);
          } catch (err) {
            const a = toApiError(err);
            if (a.code === 'ROOM_NOT_FOUND') form.setError('roomId', { message: maintenanceErrorMessage(err) });
            else toast.error(maintenanceErrorMessage(err));
          }
        })}
      >
        <FormField label="Phòng" required error={e.roomId?.message}>
          <select className="select" {...form.register('roomId')}>
            <option value="">— Chọn phòng —</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.code}
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
          <Button type="submit" variant="dark" loading={create.isPending}>
            Tạo yêu cầu
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ===================================================================== Chi tiết
/** MNT-02 — chi tiết + lịch sử trạng thái; sửa nội dung (PATCH) và chuyển trạng thái (endpoint riêng, tuần tự). */
export function MaintenanceDetailPage() {
  const { ws, base } = useWorkspaceContext();
  const { buildingId, requestId } = useParams();
  const writable = useCanWrite();
  const detail = useMaintenanceRequest(ws, buildingId, requestId);
  const rooms = useRooms(ws, { buildingId });
  const r = detail.data;
  const contract = useContractDetail(ws, r?.contractId ?? undefined);
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState<MaintenanceStatus | null>(null);

  if (detail.isLoading) return <LoadingBlock lines={6} />;
  if (detail.error || !r) return <ErrorState error={detail.error} onRetry={() => detail.refetch()} />;
  const room = rooms.data?.find((x) => x.id === r.roomId);
  const next = nextStatus(r.status);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Bảo trì', to: `${base}/maintenance?buildingId=${r.buildingId}` }, { label: r.title }]}
        title={r.title}
        eyebrow={
          <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
            <StatusBadge status={r.status} map={STATUS_LABEL} />
            <StatusBadge status={r.priority} map={PRIORITY_LABEL} />
          </div>
        }
        actions={
          writable && (
            <>
              {canEdit(r) && (
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  Sửa nội dung
                </Button>
              )}
              {next && (
                <Button variant="dark" onClick={() => setMoving(next)}>
                  {TRANSITION_ACTION[next]}
                </Button>
              )}
            </>
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
                    <strong>{h.fromStatus === null ? 'Tiếp nhận' : h.fromStatus === h.toStatus ? `Đổi mức ưu tiên: ${PRIORITY_LABEL[h.priority].label}` : `${STATUS_LABEL[h.fromStatus].label} → ${STATUS_LABEL[h.toStatus].label}`}</strong>
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
              { label: 'Phòng', value: room ? <Link to={`${base}/rooms/${room.id}`}>{room.code}</Link> : '—' },
              {
                label: 'Hợp đồng',
                value: r.contractId ? (contract.data ? <Link to={`${base}/contracts/${contract.data.id}`}>{contract.data.tenantName}</Link> : 'Đang tải…') : 'Chưa gắn hợp đồng (phòng chưa có hợp đồng đang hiệu lực khi tạo)',
              },
              { label: 'Tạo lúc', value: formatDateTime(r.createdAt) },
              { label: 'Cập nhật', value: formatDateTime(r.updatedAt) },
              ...(r.resolvedAt ? [{ label: 'Đã xử lý lúc', value: formatDateTime(r.resolvedAt) }] : []),
              ...(r.closedAt ? [{ label: 'Đóng lúc', value: formatDateTime(r.closedAt) }] : []),
            ]}
          />
        </Section>
      </div>
      {editing && <EditMaintenanceModal ws={ws} request={r} onClose={() => setEditing(false)} />}
      {moving && <TransitionModal ws={ws} request={r} to={moving} onClose={() => setMoving(null)} />}
    </>
  );
}

function EditMaintenanceModal({ ws, request, onClose }: { ws: string; request: MaintenanceRequestResponse; onClose: () => void }) {
  const update = useUpdateMaintenance(ws, request.buildingId, request.id);
  const toast = useToast();
  const form = useForm<EditForm>({ resolver: zodResolver(editSchema), defaultValues: { title: request.title, description: request.description, priority: request.priority } });
  const e = form.formState.errors;
  return (
    <Modal open title="Sửa nội dung yêu cầu" description="Chỉ sửa tiêu đề, mô tả và mức ưu tiên. Trạng thái đổi bằng nút chuyển trạng thái." onClose={onClose}>
      <form
        className="stack"
        noValidate
        onSubmit={form.handleSubmit(async (v) => {
          const patch = diffEdit(request, v);
          if (Object.keys(patch).length === 0) {
            toast.success('Không có thay đổi để lưu.');
            onClose();
            return;
          }
          try {
            await update.mutateAsync(patch);
            toast.success('Đã cập nhật yêu cầu.');
            onClose();
          } catch (err) {
            toast.error(maintenanceErrorMessage(err));
          }
        })}
      >
        <FormField label="Tiêu đề" required error={e.title?.message}>
          <input className="input" maxLength={150} {...form.register('title')} />
        </FormField>
        <FormField label="Mô tả" required error={e.description?.message}>
          <textarea className="textarea" maxLength={5000} {...form.register('description')} />
        </FormField>
        <FormField label="Mức ưu tiên" error={e.priority?.message}>
          <select className="select" {...form.register('priority')}>
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
          <Button type="submit" variant="dark" loading={update.isPending}>
            Lưu
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function TransitionModal({ ws, request, to, onClose }: { ws: string; request: MaintenanceRequestResponse; to: MaintenanceStatus; onClose: () => void }) {
  const move = useTransitionMaintenance(ws, request.buildingId, request.id);
  const toast = useToast();
  const required = noteRequired(to);
  const form = useForm<TransitionForm>({ resolver: zodResolver(transitionSchema(to)), defaultValues: { note: '' } });
  return (
    <Modal
      open
      title={`${TRANSITION_ACTION[to]}?`}
      description={`${STATUS_LABEL[request.status].label} → ${STATUS_LABEL[to].label}. Trạng thái chỉ đi tiếp, không mở lại.`}
      onClose={onClose}
    >
      <form
        className="stack"
        noValidate
        onSubmit={form.handleSubmit(async (v) => {
          try {
            await move.mutateAsync({ toStatus: to, note: v.note.trim() || undefined });
            toast.success(`Đã chuyển sang “${STATUS_LABEL[to].label}”.`);
            onClose();
          } catch (err) {
            const a = toApiError(err);
            if (a.code === 'VALIDATION_ERROR') form.setError('note', { message: maintenanceErrorMessage(err) });
            else toast.error(maintenanceErrorMessage(err));
          }
        })}
      >
        <FormField label={required ? 'Ghi chú xử lý' : 'Ghi chú (tùy chọn)'} required={required} error={form.formState.errors.note?.message} hint={required ? 'Nội dung này được lưu làm ghi chú xử lý của yêu cầu.' : undefined}>
          <textarea className="textarea" maxLength={1000} {...form.register('note')} />
        </FormField>
        <div className="form-actions">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" variant="dark" loading={move.isPending}>
            Xác nhận
          </Button>
        </div>
      </form>
    </Modal>
  );
}
