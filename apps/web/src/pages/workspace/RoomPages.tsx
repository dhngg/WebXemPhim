import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Archive, ArchiveRestore, Eye, EyeOff, Pencil, Plus } from 'lucide-react';
import {
  Button,
  ButtonLink,
  ConfirmDialog,
  CurrencyInput,
  DataTable,
  EmptyState,
  ErrorState,
  FilterBar,
  FormField,
  KeyValueList,
  LoadingBlock,
  PageHeader,
  SearchInput,
  Section,
  Select,
  StatusBadge,
  useToast,
  type Column,
} from '@/components/ui';
import {
  useBuildings,
  useCreateRoom,
  useRoom,
  useRoomLifecycle,
  useRooms,
  useSetListing,
  useUpdateRoom,
} from '@/features/property-management/hooks';
import { ROOM_STATUS, propertyErrorMessage } from '@/features/property-management/labels';
import { diffRoom, formatArea, formatMoney } from '@/features/property-management/mappers';
import type { ManagedRoom, RoomInput, RoomStatus } from '@/features/property-management/types';
import { useContractList } from '@/features/tenancy/hooks';
import { CONTRACT_PHASE } from '@/features/tenancy/labels';
import { useWorkspaceContext } from '@/hooks/useWorkspaceContext';
import { useSearchState } from '@/hooks/useSearchState';
import { useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning';
import { formatDate, formatDateTime } from '@/lib/format';
import { toApiError } from '@/services/http/ApiError';
import { RoomImage } from '@/features/rooms/components/RoomImage';
import { RoomAmenitiesEditor } from './room-parts/RoomAmenitiesEditor';
import { RoomImagesManager } from './room-parts/RoomImagesManager';
import { RoomServicesPanel } from './room-parts/RoomServicesPanel';

function useCanWrite() {
  const { can, membership } = useWorkspaceContext();
  return can('rooms.write') && membership.status !== 'ARCHIVED';
}

// ===================================================================== bảng phòng (dùng chung)
export function RoomTable({ rooms, isLoading, error, onRetry }: { rooms?: ManagedRoom[]; isLoading: boolean; error: unknown; onRetry: () => void }) {
  const { base } = useWorkspaceContext();
  const navigate = useNavigate();
  const columns: Column<ManagedRoom>[] = [
    {
      key: 'code',
      header: 'Phòng',
      render: (r) => (
        <>
          <Link to={`${base}/rooms/${r.id}`} className="cell-title">
            {r.code}
          </Link>
          <p className="cell-sub">{r.buildingName}</p>
        </>
      ),
    },
    { key: 'area', header: 'Diện tích', align: 'right', render: (r) => `${formatArea(r.areaSqm)} m²` },
    { key: 'price', header: 'Giá thuê', align: 'right', render: (r) => formatMoney(r.monthlyRent) },
    { key: 'cap', header: 'Tối đa', align: 'right', render: (r) => `${r.maxOccupants} người` },
    { key: 'st', header: 'Trạng thái', render: (r) => <StatusBadge status={r.status} map={ROOM_STATUS} /> },
  ];
  return (
    <DataTable
      columns={columns}
      rows={rooms}
      rowKey={(r) => r.id}
      isLoading={isLoading}
      error={error}
      onRetry={onRetry}
      onRowClick={(r) => navigate(`${base}/rooms/${r.id}`)}
      empty={<EmptyState title="Không có phòng phù hợp" />}
    />
  );
}

// ===================================================================== danh sách
/** ROOM-01 */
export function WsRoomsPage() {
  const { ws, base } = useWorkspaceContext();
  const writable = useCanWrite();
  const [s, set] = useSearchState(['q', 'buildingId', 'status'] as const);
  const buildings = useBuildings(ws);
  const rooms = useRooms(ws, {
    q: s.q || undefined,
    buildingId: s.buildingId || undefined,
    status: (s.status || undefined) as RoomStatus | undefined,
  });

  return (
    <>
      <PageHeader
        title="Phòng"
        description="Phòng thuộc từng tòa nhà. Trạng thái “Đang thuê” do hợp đồng quyết định; phòng đã lưu trữ chỉ hiện khi lọc đúng trạng thái."
        actions={
          writable && (
            <ButtonLink to={`${base}/rooms/new`} variant="dark">
              <Plus size={16} aria-hidden="true" /> Thêm phòng
            </ButtonLink>
          )
        }
      />
      <Section flush>
        <FilterBar>
          <SearchInput value={s.q} onChange={(q) => set({ q })} placeholder="Tìm mã phòng…" />
          <Select aria-label="Tòa nhà" value={s.buildingId} onChange={(e) => set({ buildingId: e.target.value })}>
            <option value="">Tất cả tòa nhà</option>
            {buildings.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
          <Select aria-label="Trạng thái phòng" value={s.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">Phòng đang quản lý</option>
            {(Object.keys(ROOM_STATUS) as RoomStatus[]).map((k) => (
              <option key={k} value={k}>
                {ROOM_STATUS[k].label}
              </option>
            ))}
          </Select>
        </FilterBar>
        <RoomTable rooms={rooms.data} isLoading={rooms.isLoading} error={rooms.error} onRetry={() => rooms.refetch()} />
        {rooms.data && rooms.data.length > 0 && (
          <p className="text-xs muted" style={{ padding: 'var(--space-3) var(--space-5)' }}>
            {rooms.data.length} phòng
          </p>
        )}
      </Section>
    </>
  );
}

// ===================================================================== form
const AREA_PATTERN = /^(?:0\.(?:0[1-9]|[1-9]\d?)|[1-9]\d{0,7}(?:\.\d{1,2})?)$/;

export const roomSchema = z.object({
  buildingId: z.string().min(1, 'Chọn tòa nhà'),
  code: z.string().trim().min(1, 'Nhập mã phòng').max(50, 'Tối đa 50 ký tự'),
  areaSqm: z
    .string()
    .trim()
    .transform((v) => v.replace(',', '.'))
    .pipe(z.string().regex(AREA_PATTERN, 'Diện tích lớn hơn 0, tối đa 2 chữ số thập phân')),
  monthlyRent: z
    .number({ invalid_type_error: 'Nhập giá thuê', required_error: 'Nhập giá thuê' })
    .int('Giá thuê là số nguyên VND')
    .min(0, 'Giá thuê không được âm')
    .max(999_999_999_999, 'Giá thuê quá lớn'),
  maxOccupants: z.coerce.number({ invalid_type_error: 'Nhập số người' }).int('Số người là số nguyên').min(1, 'Tối thiểu 1 người').max(100, 'Tối đa 100 người'),
  description: z.string().trim().max(1000, 'Tối đa 1000 ký tự'),
  status: z.enum(['VACANT', 'UNAVAILABLE']),
});
export type RoomForm = z.input<typeof roomSchema>;
type RoomFormOut = z.output<typeof roomSchema>;

export function toRoomInput(v: RoomFormOut): RoomInput {
  return {
    buildingId: v.buildingId,
    code: v.code,
    areaSqm: v.areaSqm,
    monthlyRent: String(v.monthlyRent),
    maxOccupants: v.maxOccupants,
    ...(v.description ? { description: v.description } : {}),
    status: v.status,
  };
}

/** ROOM-02 / ROOM-04 */
export function WsRoomFormPage() {
  const { ws, base } = useWorkspaceContext();
  const writable = useCanWrite();
  const { roomId } = useParams();
  const [qs] = useSearchState(['buildingId'] as const);
  const isEdit = Boolean(roomId);
  const existing = useRoom(ws, roomId);
  const buildings = useBuildings(ws);
  const create = useCreateRoom(ws);
  const update = useUpdateRoom(ws);
  const navigate = useNavigate();
  const toast = useToast();
  const r = existing.data;
  const lockedStatus = r?.status === 'OCCUPIED';
  const archived = r?.status === 'ARCHIVED';

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isDirty, isSubmitSuccessful },
  } = useForm<RoomForm>({
    resolver: zodResolver(roomSchema),
    values: r
      ? {
          buildingId: r.buildingId,
          code: r.code,
          areaSqm: r.areaSqm,
          monthlyRent: Number(r.monthlyRent),
          maxOccupants: r.maxOccupants,
          description: r.description,
          status: r.status === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'VACANT',
        }
      : { buildingId: qs.buildingId, code: '', areaSqm: '', monthlyRent: undefined as unknown as number, maxOccupants: 1, description: '', status: 'VACANT' },
  });
  const unsaved = useUnsavedChangesWarning(isDirty && !isSubmitSuccessful);

  if (!writable) return <ErrorState error={{ status: 403 }} />;
  if (isEdit && existing.isLoading) return <LoadingBlock />;
  if (isEdit && (existing.error || !r)) return <ErrorState error={existing.error ?? { status: 404 }} onRetry={() => existing.refetch()} />;

  const onSubmit = handleSubmit(async (values) => {
    const v = roomSchema.parse(values);
    try {
      if (isEdit && r) {
        const patch = diffRoom(r, { ...v, monthlyRent: String(v.monthlyRent), status: lockedStatus ? undefined : v.status });
        if (Object.keys(patch).length === 0) {
          toast.success('Không có thay đổi nào để lưu.');
          unsaved.markSaved();
      navigate(`${base}/rooms/${r.id}`);
          return;
        }
        await update.mutateAsync({ buildingId: r.buildingId, id: r.id, patch });
        toast.success('Đã cập nhật phòng.');
        unsaved.markSaved();
      navigate(`${base}/rooms/${r.id}`);
      } else {
        const saved = await create.mutateAsync(toRoomInput(v));
        toast.success('Đã tạo phòng. Bạn có thể gán tiện ích và thêm ảnh ở trang chi tiết.');
        unsaved.markSaved();
      navigate(`${base}/rooms/${saved.id}`);
      }
    } catch (e) {
      const err = toApiError(e);
      if (err.code === 'ROOM_CODE_CONFLICT') setError('code', { message: propertyErrorMessage(e) });
      else {
        const known = ['code', 'areaSqm', 'monthlyRent', 'maxOccupants', 'description', 'status'];
        const mapped = Object.entries(err.fieldErrors ?? {}).filter(([f]) => known.includes(f));
        mapped.forEach(([f, m]) => setError(f as keyof RoomForm, { message: m }));
        if (!mapped.length) toast.error(propertyErrorMessage(e));
      }
    }
  });

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Phòng', to: `${base}/rooms` }, { label: isEdit ? (r?.code ?? '') : 'Thêm mới' }]}
        title={isEdit ? `Sửa phòng ${r?.code ?? ''}` : 'Thêm phòng'}
      />
      {archived && (
        <p className="alert alert--warning" role="status" style={{ marginBottom: 'var(--space-4)' }}>
          Phòng đã lưu trữ nên không thể chỉnh sửa. Hãy khôi phục ở trang chi tiết trước.
        </p>
      )}
      <form onSubmit={onSubmit} noValidate className="stack">
        <fieldset disabled={archived} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <Section title="Thông tin phòng">
            <div className="form-grid form-grid--2">
              <FormField label="Tòa nhà" required error={errors.buildingId?.message} hint={isEdit ? 'Không thể chuyển phòng sang tòa nhà khác.' : undefined}>
                <select className="select" disabled={isEdit} {...register('buildingId')}>
                  <option value="">— Chọn tòa nhà —</option>
                  {buildings.data
                    ?.filter((b) => b.status === 'ACTIVE' || b.id === r?.buildingId)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                </select>
              </FormField>
              <FormField label="Mã phòng" required error={errors.code?.message}>
                <input className="input" maxLength={50} {...register('code')} placeholder="VD: P.401" />
              </FormField>
              <FormField label="Diện tích (m²)" required error={errors.areaSqm?.message} hint="Ví dụ 25 hoặc 25,5.">
                <input className="input" inputMode="decimal" {...register('areaSqm')} />
              </FormField>
              <FormField label="Giá thuê / tháng" required error={errors.monthlyRent?.message}>
                <Controller control={control} name="monthlyRent" render={({ field }) => <CurrencyInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} />} />
              </FormField>
              <FormField label="Số người tối đa" required error={errors.maxOccupants?.message}>
                <input className="input" type="number" min={1} max={100} {...register('maxOccupants')} />
              </FormField>
              <FormField
                label="Trạng thái cho thuê"
                error={errors.status?.message}
                hint={lockedStatus ? 'Phòng đang có hợp đồng nên trạng thái do hợp đồng quản lý.' : 'Chọn “Tạm ngưng” khi phòng không cho thuê (ví dụ đang sửa chữa).'}
              >
                <select className="select" disabled={lockedStatus} {...register('status')}>
                  <option value="VACANT">Trống</option>
                  <option value="UNAVAILABLE">Tạm ngưng cho thuê</option>
                </select>
              </FormField>
            </div>
            <div style={{ marginTop: 'var(--space-4)' }}>
              <FormField label="Mô tả" error={errors.description?.message}>
                <textarea className="textarea" maxLength={1000} {...register('description')} />
              </FormField>
            </div>
            <div className="form-actions">
              <ButtonLink to={isEdit ? `${base}/rooms/${roomId}` : `${base}/rooms`} variant="secondary">
                Hủy
              </ButtonLink>
              <Button type="submit" variant="dark" loading={create.isPending || update.isPending} disabled={archived}>
                {isEdit ? 'Lưu thay đổi' : 'Tạo phòng'}
              </Button>
            </div>
          </Section>
        </fieldset>
      </form>
    </>
  );
}

// ===================================================================== chi tiết
/** Hợp đồng của phòng: lấy danh sách hợp đồng của workspace rồi lọc theo phòng (API chưa có bộ lọc theo phòng). */
function RoomContracts({ roomId }: { roomId: string }) {
  const { ws, base } = useWorkspaceContext();
  const all = useContractList(ws);
  const rows = all.data?.filter((c) => c.roomId === roomId);
  // "Hiện tại" = đã bắt đầu và chưa kết thúc (kể cả quá hạn); hợp đồng tương lai chỉ giữ chỗ cho kỳ thuê của nó.
  const current = rows?.find((c) => c.phase === 'IN_EFFECT' || c.phase === 'OVERDUE');
  const upcoming = rows?.filter((c) => c.phase === 'UPCOMING').sort((a, b) => a.startDate.localeCompare(b.startDate));
  return (
    <>
      <Section title="Hợp đồng hiện tại">
        {all.isLoading ? (
          <LoadingBlock lines={2} />
        ) : all.error ? (
          <ErrorState error={all.error} onRetry={() => all.refetch()} />
        ) : current ? (
          <KeyValueList
            items={[
              { label: 'Hợp đồng', value: <Link to={`${base}/contracts/${current.id}`}>{`Phòng ${current.roomCode}`}</Link> },
              { label: 'Người thuê', value: current.tenantName },
              { label: 'Thời hạn', value: `${formatDate(current.startDate)} – ${formatDate(current.endDate)}` },
              { label: 'Tiền thuê', value: `${formatMoney(current.monthlyRent)}/tháng` },
            ]}
          />
        ) : (
          <EmptyState title="Phòng chưa có hợp đồng đang hiệu lực" />
        )}
      </Section>
      {upcoming && upcoming.length > 0 && (
        <Section title="Hợp đồng sắp bắt đầu (giữ chỗ)">
          <ul className="list-plain stack" style={{ gap: 'var(--space-2)' }}>
            {upcoming.map((c) => (
              <li key={c.id}>
                <Link to={`${base}/contracts/${c.id}`}>{c.tenantName}</Link> • {formatDate(c.startDate)} – {formatDate(c.endDate)}
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="Lịch sử hợp đồng" flush>
        <DataTable
          rows={rows}
          rowKey={(c) => c.id}
          isLoading={all.isLoading}
          error={all.error}
          empty={<EmptyState title="Chưa có lịch sử" />}
          columns={[
            { key: 'tenant', header: 'Người thuê', render: (c) => <Link to={`${base}/contracts/${c.id}`}>{c.tenantName}</Link> },
            { key: 'term', header: 'Thời hạn', render: (c) => `${formatDate(c.startDate)} – ${formatDate(c.endDate)}` },
            { key: 'st', header: 'Trạng thái', render: (c) => <StatusBadge status={c.phase} map={CONTRACT_PHASE} /> },
          ]}
        />
      </Section>
    </>
  );
}

/** ROOM-03 */
export function WsRoomDetailPage() {
  const { ws, base } = useWorkspaceContext();
  const writable = useCanWrite();
  const { roomId } = useParams();
  const room = useRoom(ws, roomId);
  const lifecycle = useRoomLifecycle(ws);
  const listing = useSetListing(ws);
  const toast = useToast();
  const [confirmArchive, setConfirmArchive] = useState(false);
  // Backend chỉ cho đặt (PUT) trạng thái đăng tin, không có API đọc: ghi nhận kết quả của lần thao tác gần nhất.
  const [published, setPublished] = useState<{ id: string; published: boolean } | null>(null);

  if (room.isLoading) return <LoadingBlock lines={6} />;
  if (room.error || !room.data) return <ErrorState error={room.error ?? { status: 404 }} onRetry={() => room.refetch()} />;
  const r = room.data;
  const archived = r.status === 'ARCHIVED';
  const occupied = r.status === 'OCCUPIED';

  const archiveToggle = (action: 'archive' | 'restore') =>
    lifecycle[action].mutate(
      { buildingId: r.buildingId, id: r.id },
      {
        onSuccess: () => {
          toast.success(action === 'archive' ? 'Đã lưu trữ phòng.' : 'Đã khôi phục phòng.');
          setConfirmArchive(false);
        },
        onError: (e) => {
          toast.error(propertyErrorMessage(e));
          setConfirmArchive(false);
        },
      },
    );

  const setListing = (value: boolean) =>
    listing.mutate(
      { buildingId: r.buildingId, roomId: r.id, published: value },
      {
        onSuccess: (res) => {
          setPublished(res);
          toast.success(value ? 'Đã đăng tin phòng lên marketplace.' : 'Đã gỡ tin phòng.');
        },
        onError: (e) => toast.error(propertyErrorMessage(e)),
      },
    );

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Phòng', to: `${base}/rooms` }, { label: `${r.buildingName} • ${r.code}` }]}
        title={`Phòng ${r.code}`}
        description={`${r.buildingName} • ${formatArea(r.areaSqm)} m² • Tối đa ${r.maxOccupants} người`}
        eyebrow={
          <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
            <StatusBadge status={r.status} map={ROOM_STATUS} />
          </div>
        }
        actions={
          writable && (
            <>
              {!archived && (
                <ButtonLink to={`${base}/rooms/${r.id}/edit`} variant="secondary">
                  <Pencil size={16} aria-hidden="true" /> Sửa
                </ButtonLink>
              )}
              {!archived && !occupied && (
                <Button variant="secondary" onClick={() => setConfirmArchive(true)}>
                  <Archive size={16} aria-hidden="true" /> Lưu trữ
                </Button>
              )}
              {archived && (
                <Button variant="secondary" loading={lifecycle.restore.isPending} onClick={() => archiveToggle('restore')}>
                  <ArchiveRestore size={16} aria-hidden="true" /> Khôi phục
                </Button>
              )}
            </>
          )
        }
      />
      {archived && (
        <p className="alert alert--warning" role="status" style={{ marginBottom: 'var(--space-4)' }}>
          Phòng đã lưu trữ: chỉ xem.
        </p>
      )}
      {occupied && writable && (
        <p className="alert alert--info" role="status" style={{ marginBottom: 'var(--space-4)' }}>
          Phòng đang có hợp đồng nên không thể lưu trữ hoặc đổi trạng thái cho thuê cho tới khi hợp đồng kết thúc.
        </p>
      )}
      <div className="grid grid--main-side">
        <div className="stack">
          <Section title="Tiện ích">
            <RoomAmenitiesEditor ws={ws} room={r} canWrite={writable && !archived} />
          </Section>
          <Section title="Ảnh phòng" subtitle="Ảnh đầu tiên là ảnh đại diện trên marketplace.">
            <RoomImagesManager ws={ws} room={r} canWrite={writable && !archived} />
          </Section>
          <Section title="Dịch vụ áp dụng" subtitle="Dịch vụ từ bảng giá tòa nhà được tính vào hóa đơn của phòng.">
            <RoomServicesPanel ws={ws} room={r} canWrite={writable && !archived} />
          </Section>
          <RoomContracts roomId={r.id} />
        </div>
        <div className="stack">
          <Section title="Thông tin">
            <KeyValueList
              items={[
                { label: 'Giá thuê / tháng', value: formatMoney(r.monthlyRent) },
                { label: 'Diện tích', value: `${formatArea(r.areaSqm)} m²` },
                { label: 'Sức chứa', value: `${r.maxOccupants} người` },
                { label: 'Cập nhật', value: formatDateTime(r.updatedAt) },
              ]}
            />
            {r.description && (
              <p className="text-sm muted" style={{ marginTop: 'var(--space-3)' }}>
                {r.description}
              </p>
            )}
          </Section>
          {r.images?.[0] && (
            <div className="card" style={{ overflow: 'hidden', aspectRatio: '4/3' }}>
              <RoomImage src={r.images[0].url} alt={r.images[0].altText || `Phòng ${r.code}`} />
            </div>
          )}
          {writable && !archived && (
            <Section title="Đăng tin" subtitle="Tin công khai chỉ hiển thị khi phòng ở trạng thái Trống.">
              <div className="stack">
                <div className="row" style={{ flexWrap: 'wrap' }}>
                  <Button variant="secondary" loading={listing.isPending} onClick={() => setListing(true)}>
                    <Eye size={16} aria-hidden="true" /> Đăng tin
                  </Button>
                  <Button variant="ghost" loading={listing.isPending} onClick={() => setListing(false)}>
                    <EyeOff size={16} aria-hidden="true" /> Gỡ tin
                  </Button>
                </div>
                {published?.published && (
                  <p className="text-sm">
                    Tin đang bật. <Link to={`/rooms/${published.id}`}>Xem tin công khai →</Link>
                  </p>
                )}
                {published && !published.published && <p className="text-sm muted">Tin đã được gỡ.</p>}
              </div>
            </Section>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirmArchive}
        title="Lưu trữ phòng?"
        description={`Phòng ${r.code} sẽ chuyển sang chỉ xem và không còn nằm trong danh sách phòng đang quản lý. Lịch sử được giữ nguyên, bạn có thể khôi phục sau.`}
        confirmLabel="Lưu trữ"
        danger
        loading={lifecycle.archive.isPending}
        onConfirm={() => archiveToggle('archive')}
        onCancel={() => setConfirmArchive(false)}
      />
    </>
  );
}
