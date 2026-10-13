import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, CalendarClock, Eye, EyeOff, Pencil, Plus } from 'lucide-react';
import {
  Badge,
  Button,
  ButtonLink,
  CurrencyInput,
  DataTable,
  EmptyState,
  ErrorState,
  FilterBar,
  FormField,
  ImageUploader,
  KeyValueList,
  LoadingBlock,
  PageHeader,
  ProgressBar,
  SearchInput,
  Section,
  Select,
  StatusBadge,
  Tabs,
  useToast,
  type Column,
} from '@/components/ui';
import { useBuilding, useBuildings, useSaveBuilding, useSaveRoom, useSetListingStatus, useSetViewingStatus, useWsRoom, useWsRooms, useWsViewings } from '@/features/property/hooks';
import { LISTING_STATUS, OPERATIONAL_STATUS, WS_VIEWING_STATUS } from '@/features/property/labels';
import type { BuildingInput, ListingStatus, OperationalStatus, WsRoom, WsViewing, WsViewingStatus } from '@/features/property/types';
import { AMENITY_LABELS } from '@/features/rooms/labels';
import type { AmenityCode } from '@/features/rooms/types';
import { useContracts } from '@/features/leasing/hooks';
import { CONTRACT_STATUS } from '@/features/leasing/labels';
import { useWorkspaceContext } from '@/hooks/useWorkspaceContext';
import { useSearchState } from '@/hooks/useSearchState';
import { useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning';
import { formatDate, formatDateTime, formatPercent, formatVnd } from '@/lib/format';
import { toApiError } from '@/services/http/ApiError';
import { RoomImage } from '@/features/rooms/components/RoomImage';

// ===================================================================== Buildings
/** BLD-01 */
export function BuildingsPage() {
  const { ws, base, can } = useWorkspaceContext();
  const [s, set] = useSearchState(['q'] as const);
  const { data, isLoading, error, refetch } = useBuildings(ws, s.q || undefined);

  return (
    <>
      <PageHeader
        title="Tòa nhà"
        description="Danh sách tòa nhà / khu trọ trong workspace."
        actions={
          can('rooms.write') && (
            <ButtonLink to={`${base}/buildings/new`} variant="dark">
              <Plus size={16} aria-hidden="true" /> Thêm tòa nhà
            </ButtonLink>
          )
        }
      />
      <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
        <FilterBar>
          <SearchInput value={s.q} onChange={(q) => set({ q })} placeholder="Tìm theo tên, địa chỉ…" />
        </FilterBar>
      </div>
      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !data?.length ? (
        <div className="card">
          <EmptyState
            icon={<Building2 size={26} aria-hidden="true" />}
            title={s.q ? 'Không tìm thấy tòa nhà phù hợp' : 'Chưa có tòa nhà nào'}
            action={can('rooms.write') && !s.q ? <ButtonLink to={`${base}/buildings/new`}>Thêm tòa nhà đầu tiên</ButtonLink> : undefined}
          />
        </div>
      ) : (
        <div className="grid grid--3">
          {data.map((b) => {
            const rate = b.roomCount ? b.occupiedCount / b.roomCount : 0;
            return (
              <Link key={b.id} to={`${base}/buildings/${b.id}`} className="card workspace-card">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="brand__logo">
                    <Building2 size={18} aria-hidden="true" />
                  </span>
                  <Badge tone="neutral">{b.floors} tầng</Badge>
                </div>
                <div>
                  <p className="cell-title" style={{ fontSize: 'var(--text-lg)' }}>
                    {b.name}
                  </p>
                  <p className="cell-sub">
                    {b.address}, {b.ward}, {b.district}
                  </p>
                </div>
                <div className="stack" style={{ gap: 6 }}>
                  <div className="row text-sm" style={{ justifyContent: 'space-between' }}>
                    <span>
                      {b.occupiedCount}/{b.roomCount} phòng đang thuê
                    </span>
                    <strong>{formatPercent(rate)}</strong>
                  </div>
                  <ProgressBar value={rate} label={`Tỷ lệ lấp đầy ${b.name}`} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

const buildingSchema = z.object({
  name: z.string().trim().min(2, 'Nhập tên tòa nhà'),
  address: z.string().trim().min(3, 'Nhập địa chỉ'),
  ward: z.string().trim().min(1, 'Nhập phường/xã'),
  district: z.string().trim().min(1, 'Nhập quận/huyện'),
  city: z.string().trim().min(1, 'Nhập tỉnh/thành'),
  floors: z.coerce.number().int().min(1, 'Ít nhất 1 tầng').max(50, 'Tối đa 50 tầng'),
  lat: z.union([z.literal(''), z.coerce.number().min(-90).max(90)]).optional(),
  lng: z.union([z.literal(''), z.coerce.number().min(-180).max(180)]).optional(),
  note: z.string().trim().optional(),
});
type BuildingForm = z.input<typeof buildingSchema>;

/** BLD-02 / BLD-04 */
export function BuildingFormPage() {
  const { ws, base, can } = useWorkspaceContext();
  const { buildingId } = useParams();
  const isEdit = Boolean(buildingId);
  const existing = useBuilding(ws, buildingId);
  const save = useSaveBuilding(ws, buildingId);
  const navigate = useNavigate();
  const toast = useToast();
  const b = existing.data;
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isDirty, isSubmitSuccessful },
  } = useForm<BuildingForm>({
    resolver: zodResolver(buildingSchema),
    values: b
      ? { name: b.name, address: b.address, ward: b.ward, district: b.district, city: b.city, floors: b.floors, lat: b.lat ?? '', lng: b.lng ?? '', note: b.note ?? '' }
      : { name: '', address: '', ward: '', district: '', city: 'TP.HCM', floors: 1, lat: '', lng: '', note: '' },
  });
  useUnsavedChangesWarning(isDirty && !isSubmitSuccessful);

  if (!can('rooms.write')) return <ErrorState error={{ status: 403 }} />;
  if (isEdit && existing.isLoading) return <LoadingBlock />;
  if (isEdit && existing.error) return <ErrorState error={existing.error} onRetry={() => existing.refetch()} />;

  const onSubmit = handleSubmit(async (values) => {
    const v = buildingSchema.parse(values);
    const input: BuildingInput = {
      ...v,
      lat: v.lat === '' || v.lat === undefined ? undefined : v.lat,
      lng: v.lng === '' || v.lng === undefined ? undefined : v.lng,
      note: v.note || undefined,
    };
    try {
      const saved = await save.mutateAsync(input);
      toast.success(isEdit ? 'Đã cập nhật tòa nhà.' : 'Đã tạo tòa nhà.');
      navigate(`${base}/buildings/${saved.id}`);
    } catch (e) {
      const err = toApiError(e);
      if (err.isConflict) setError('name', { message: err.message });
      else toast.error(err.message);
    }
  });

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Tòa nhà', to: `${base}/buildings` }, { label: isEdit ? b?.name ?? '' : 'Thêm mới' }]}
        title={isEdit ? `Sửa ${b?.name ?? 'tòa nhà'}` : 'Thêm tòa nhà'}
      />
      <form onSubmit={onSubmit} noValidate>
        <Section title="Thông tin & địa chỉ">
          <div className="form-grid form-grid--2">
            <FormField label="Tên tòa nhà" required error={errors.name?.message}>
              <input className="input" {...register('name')} placeholder="VD: Tòa D" />
            </FormField>
            <FormField label="Số tầng" required error={errors.floors?.message}>
              <input className="input" type="number" min={1} {...register('floors')} />
            </FormField>
            <FormField label="Địa chỉ (số nhà, đường)" required error={errors.address?.message}>
              <input className="input" {...register('address')} />
            </FormField>
            <FormField label="Phường / Xã" required error={errors.ward?.message}>
              <input className="input" {...register('ward')} />
            </FormField>
            <FormField label="Quận / Huyện" required error={errors.district?.message}>
              <input className="input" {...register('district')} />
            </FormField>
            <FormField label="Tỉnh / Thành phố" required error={errors.city?.message}>
              <input className="input" {...register('city')} />
            </FormField>
            <FormField label="Vĩ độ (lat)" error={errors.lat?.message} hint="Tùy chọn — dùng cho bản đồ khi đã chốt map provider.">
              <input className="input" inputMode="decimal" {...register('lat')} />
            </FormField>
            <FormField label="Kinh độ (lng)" error={errors.lng?.message}>
              <input className="input" inputMode="decimal" {...register('lng')} />
            </FormField>
          </div>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <FormField label="Ghi chú">
              <textarea className="textarea" {...register('note')} />
            </FormField>
          </div>
          <div className="form-actions">
            <ButtonLink to={isEdit ? `${base}/buildings/${buildingId}` : `${base}/buildings`} variant="secondary">
              Hủy
            </ButtonLink>
            <Button type="submit" variant="dark" loading={save.isPending}>
              {isEdit ? 'Lưu thay đổi' : 'Tạo tòa nhà'}
            </Button>
          </div>
        </Section>
      </form>
    </>
  );
}

/** BLD-03 */
export function BuildingDetailPage() {
  const { ws, base, can } = useWorkspaceContext();
  const { buildingId } = useParams();
  const building = useBuilding(ws, buildingId);
  const rooms = useWsRooms(ws, { buildingId });

  if (building.isLoading) return <LoadingBlock lines={6} />;
  if (building.error || !building.data) return <ErrorState error={building.error} onRetry={() => building.refetch()} />;
  const b = building.data;
  const rate = b.roomCount ? b.occupiedCount / b.roomCount : 0;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Tòa nhà', to: `${base}/buildings` }, { label: b.name }]}
        title={b.name}
        description={`${b.address}, ${b.ward}, ${b.district}, ${b.city}`}
        actions={
          can('rooms.write') && (
            <>
              <ButtonLink to={`${base}/buildings/${b.id}/edit`} variant="secondary">
                <Pencil size={16} aria-hidden="true" /> Sửa
              </ButtonLink>
              <ButtonLink to={`${base}/rooms/new?buildingId=${b.id}`} variant="dark">
                <Plus size={16} aria-hidden="true" /> Thêm phòng
              </ButtonLink>
            </>
          )
        }
      />
      <div className="grid grid--3" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="card card__body">
          <p className="text-xs muted">Tổng phòng</p>
          <p style={{ fontSize: 'var(--text-2xl)', fontWeight: 800 }}>{b.roomCount}</p>
        </div>
        <div className="card card__body">
          <p className="text-xs muted">Đang thuê</p>
          <p style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--color-success)' }}>{b.occupiedCount}</p>
        </div>
        <div className="card card__body stack" style={{ gap: 6 }}>
          <p className="text-xs muted">Tỷ lệ lấp đầy</p>
          <p style={{ fontSize: 'var(--text-2xl)', fontWeight: 800 }}>{formatPercent(rate)}</p>
          <ProgressBar value={rate} label="Tỷ lệ lấp đầy" />
        </div>
      </div>
      <div className="grid grid--main-side">
        <Section title="Phòng trong tòa" flush>
          <RoomTable rooms={rooms.data} isLoading={rooms.isLoading} error={rooms.error} onRetry={() => rooms.refetch()} />
        </Section>
        <Section title="Cấu hình">
          <KeyValueList
            items={[
              { label: 'Số tầng', value: b.floors },
              { label: 'Tọa độ', value: b.lat && b.lng ? `${b.lat}, ${b.lng}` : 'Chưa cập nhật' },
              { label: 'Ngày tạo', value: formatDate(b.createdAt) },
              { label: 'Ghi chú', value: b.note || '—' },
            ]}
          />
        </Section>
      </div>
    </>
  );
}

// ===================================================================== Rooms
function RoomTable({ rooms, isLoading, error, onRetry }: { rooms?: WsRoom[]; isLoading: boolean; error: unknown; onRetry: () => void }) {
  const { base } = useWorkspaceContext();
  const navigate = useNavigate();
  const columns: Column<WsRoom>[] = [
    {
      key: 'code',
      header: 'Phòng',
      render: (r) => (
        <>
          <Link to={`${base}/rooms/${r.id}`} className="cell-title">
            {r.code}
          </Link>
          <p className="cell-sub">
            {r.buildingName} • Tầng {r.floor}
          </p>
        </>
      ),
    },
    { key: 'area', header: 'Diện tích', align: 'right', render: (r) => `${r.area} m²` },
    { key: 'price', header: 'Giá thuê', align: 'right', render: (r) => formatVnd(r.basePrice) },
    { key: 'op', header: 'Vận hành', render: (r) => <StatusBadge status={r.operationalStatus} map={OPERATIONAL_STATUS} /> },
    { key: 'listing', header: 'Đăng tin', render: (r) => <StatusBadge status={r.listingStatus} map={LISTING_STATUS} /> },
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

/** ROOM-01 */
export function WsRoomsPage() {
  const { ws, base, can } = useWorkspaceContext();
  const [s, set] = useSearchState(['q', 'buildingId', 'operationalStatus', 'listingStatus'] as const);
  const buildings = useBuildings(ws);
  const rooms = useWsRooms(ws, {
    q: s.q || undefined,
    buildingId: s.buildingId || undefined,
    operationalStatus: (s.operationalStatus || undefined) as OperationalStatus | undefined,
    listingStatus: (s.listingStatus || undefined) as ListingStatus | undefined,
  });

  return (
    <>
      <PageHeader
        title="Phòng"
        description="Trạng thái vận hành (trống / đang thuê…) và trạng thái đăng tin được quản lý độc lập."
        actions={
          can('rooms.write') && (
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
          <Select aria-label="Trạng thái vận hành" value={s.operationalStatus} onChange={(e) => set({ operationalStatus: e.target.value })}>
            <option value="">Mọi trạng thái vận hành</option>
            {(Object.keys(OPERATIONAL_STATUS) as OperationalStatus[]).map((k) => (
              <option key={k} value={k}>
                {OPERATIONAL_STATUS[k].label}
              </option>
            ))}
          </Select>
          <Select aria-label="Trạng thái đăng tin" value={s.listingStatus} onChange={(e) => set({ listingStatus: e.target.value })}>
            <option value="">Mọi trạng thái đăng tin</option>
            {(Object.keys(LISTING_STATUS) as ListingStatus[]).map((k) => (
              <option key={k} value={k}>
                {LISTING_STATUS[k].label}
              </option>
            ))}
          </Select>
        </FilterBar>
        <RoomTable rooms={rooms.data} isLoading={rooms.isLoading} error={rooms.error} onRetry={() => rooms.refetch()} />
        {rooms.data && rooms.data.length > 0 && <p className="text-xs muted" style={{ padding: 'var(--space-3) var(--space-5)' }}>{rooms.data.length} phòng</p>}
      </Section>
    </>
  );
}

const roomSchema = z.object({
  buildingId: z.string().min(1, 'Chọn tòa nhà'),
  code: z.string().trim().min(1, 'Nhập mã phòng').max(20, 'Tối đa 20 ký tự'),
  floor: z.coerce.number().int().min(0, 'Tầng không hợp lệ'),
  area: z.coerce.number().positive('Diện tích phải > 0').max(500, 'Diện tích quá lớn'),
  basePrice: z.number({ invalid_type_error: 'Nhập giá thuê', required_error: 'Nhập giá thuê' }).int().min(100_000, 'Tối thiểu 100.000 ₫'),
  maxOccupants: z.coerce.number().int().min(1, 'Tối thiểu 1 người').max(10, 'Tối đa 10 người'),
  amenities: z.array(z.string()),
  images: z.array(z.string()),
  description: z.string().trim().max(1000, 'Tối đa 1000 ký tự'),
  listingStatus: z.enum(['DRAFT', 'PUBLISHED', 'HIDDEN']),
  operationalStatus: z.enum(['VACANT', 'OCCUPIED', 'RESERVED', 'MAINTENANCE']),
});
type RoomForm = z.input<typeof roomSchema>;

/** ROOM-02 / ROOM-04 */
export function WsRoomFormPage() {
  const { ws, base, can } = useWorkspaceContext();
  const { roomId } = useParams();
  const [qs] = useSearchState(['buildingId'] as const);
  const isEdit = Boolean(roomId);
  const existing = useWsRoom(ws, roomId);
  const buildings = useBuildings(ws);
  const save = useSaveRoom(ws, roomId);
  const navigate = useNavigate();
  const toast = useToast();
  const r = existing.data;

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
          floor: r.floor,
          area: r.area,
          basePrice: r.basePrice,
          maxOccupants: r.maxOccupants,
          amenities: r.amenities,
          images: r.images,
          description: r.description,
          listingStatus: r.listingStatus,
          operationalStatus: r.operationalStatus,
        }
      : {
          buildingId: qs.buildingId,
          code: '',
          floor: 1,
          area: 20,
          basePrice: 3_500_000,
          maxOccupants: 2,
          amenities: [],
          images: [],
          description: '',
          listingStatus: 'DRAFT',
          operationalStatus: 'VACANT',
        },
  });
  useUnsavedChangesWarning(isDirty && !isSubmitSuccessful);

  if (!can('rooms.write')) return <ErrorState error={{ status: 403 }} />;
  if (isEdit && existing.isLoading) return <LoadingBlock />;
  if (isEdit && existing.error) return <ErrorState error={existing.error} onRetry={() => existing.refetch()} />;

  const onSubmit = handleSubmit(async (values) => {
    const v = roomSchema.parse(values);
    try {
      const saved = await save.mutateAsync({ ...v, amenities: v.amenities as AmenityCode[] });
      toast.success(isEdit ? 'Đã cập nhật phòng.' : 'Đã tạo phòng.');
      navigate(`${base}/rooms/${saved.id}`);
    } catch (e) {
      const err = toApiError(e);
      if (err.isConflict) setError('code', { message: err.message });
      else toast.error(err.message);
    }
  });

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Phòng', to: `${base}/rooms` }, { label: isEdit ? r?.code ?? '' : 'Thêm mới' }]}
        title={isEdit ? `Sửa phòng ${r?.code ?? ''}` : 'Thêm phòng'}
      />
      <form onSubmit={onSubmit} noValidate className="stack">
        <Section title="Thông tin phòng">
          <div className="form-grid form-grid--2">
            <FormField label="Tòa nhà" required error={errors.buildingId?.message}>
              <select className="select" {...register('buildingId')}>
                <option value="">— Chọn tòa nhà —</option>
                {buildings.data?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Mã phòng" required error={errors.code?.message}>
              <input className="input" {...register('code')} placeholder="VD: P.401" />
            </FormField>
            <FormField label="Tầng" required error={errors.floor?.message}>
              <input className="input" type="number" min={0} {...register('floor')} />
            </FormField>
            <FormField label="Diện tích (m²)" required error={errors.area?.message}>
              <input className="input" type="number" min={1} step="0.5" {...register('area')} />
            </FormField>
            <FormField label="Giá thuê / tháng" required error={errors.basePrice?.message}>
              <Controller control={control} name="basePrice" render={({ field }) => <CurrencyInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} />} />
            </FormField>
            <FormField label="Số người tối đa" required error={errors.maxOccupants?.message}>
              <input className="input" type="number" min={1} {...register('maxOccupants')} />
            </FormField>
          </div>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <FormField label="Mô tả" error={errors.description?.message}>
              <textarea className="textarea" {...register('description')} />
            </FormField>
          </div>
        </Section>
        <Section title="Tiện ích">
          <Controller
            control={control}
            name="amenities"
            render={({ field }) => (
              <div className="amenity-grid" role="group" aria-label="Tiện ích">
                {(Object.keys(AMENITY_LABELS) as AmenityCode[]).map((a) => (
                  <label key={a} className="checkbox" style={{ padding: 'var(--space-2) var(--space-3)', background: 'var(--color-surface-muted)', borderRadius: 'var(--radius-md)' }}>
                    <input
                      type="checkbox"
                      checked={field.value.includes(a)}
                      onChange={(e) => field.onChange(e.target.checked ? [...field.value, a] : field.value.filter((x) => x !== a))}
                    />
                    {AMENITY_LABELS[a]}
                  </label>
                ))}
              </div>
            )}
          />
        </Section>
        <Section title="Ảnh phòng">
          <Controller control={control} name="images" render={({ field }) => <ImageUploader value={field.value} onChange={field.onChange} />} />
        </Section>
        <Section title="Trạng thái" subtitle="Hai trạng thái độc lập: phòng có thể đang thuê nhưng vẫn ẩn/đăng tin, hoặc trống nhưng chưa đăng.">
          <div className="form-grid form-grid--2">
            <FormField label="Trạng thái vận hành" hint={isEdit ? 'Chuyển Trống ↔ Đang thuê thường do hợp đồng tự cập nhật.' : undefined}>
              <select className="select" {...register('operationalStatus')}>
                {(Object.keys(OPERATIONAL_STATUS) as OperationalStatus[]).map((k) => (
                  <option key={k} value={k}>
                    {OPERATIONAL_STATUS[k].label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Trạng thái đăng tin" hint="“Đang đăng” + phòng Trống sẽ hiển thị trên trang Tìm phòng.">
              <select className="select" {...register('listingStatus')}>
                {(Object.keys(LISTING_STATUS) as ListingStatus[]).map((k) => (
                  <option key={k} value={k}>
                    {LISTING_STATUS[k].label}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <div className="form-actions">
            <ButtonLink to={isEdit ? `${base}/rooms/${roomId}` : `${base}/rooms`} variant="secondary">
              Hủy
            </ButtonLink>
            <Button type="submit" variant="dark" loading={save.isPending}>
              {isEdit ? 'Lưu thay đổi' : 'Tạo phòng'}
            </Button>
          </div>
        </Section>
      </form>
    </>
  );
}

/** ROOM-03 */
export function WsRoomDetailPage() {
  const { ws, base, can } = useWorkspaceContext();
  const { roomId } = useParams();
  const room = useWsRoom(ws, roomId);
  const contracts = useContracts(ws, { roomId });
  const listing = useSetListingStatus(ws);
  const toast = useToast();

  if (room.isLoading) return <LoadingBlock lines={6} />;
  if (room.error || !room.data) return <ErrorState error={room.error} onRetry={() => room.refetch()} />;
  const r = room.data;
  const current = contracts.data?.find((c) => c.status === 'ACTIVE');
  const toggleTo: ListingStatus = r.listingStatus === 'PUBLISHED' ? 'HIDDEN' : 'PUBLISHED';

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Phòng', to: `${base}/rooms` }, { label: `${r.buildingName} • ${r.code}` }]}
        title={`Phòng ${r.code}`}
        description={`${r.buildingName} • Tầng ${r.floor} • ${r.area} m² • Tối đa ${r.maxOccupants} người`}
        eyebrow={
          <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
            <StatusBadge status={r.operationalStatus} map={OPERATIONAL_STATUS} />
            <StatusBadge status={r.listingStatus} map={LISTING_STATUS} />
          </div>
        }
        actions={
          can('rooms.write') && (
            <>
              <Button
                variant="secondary"
                loading={listing.isPending}
                onClick={() =>
                  listing.mutate(
                    { id: r.id, status: toggleTo },
                    {
                      onSuccess: () => toast.success(toggleTo === 'PUBLISHED' ? 'Đã đăng tin phòng.' : 'Đã ẩn tin.'),
                      onError: (e) => toast.error(toApiError(e).message),
                    },
                  )
                }
              >
                {toggleTo === 'PUBLISHED' ? <Eye size={16} /> : <EyeOff size={16} />} {toggleTo === 'PUBLISHED' ? 'Đăng tin' : 'Ẩn tin'}
              </Button>
              <ButtonLink to={`${base}/rooms/${r.id}/edit`} variant="secondary">
                <Pencil size={16} aria-hidden="true" /> Sửa
              </ButtonLink>
              {!current && (
                <ButtonLink to={`${base}/contracts/new?roomId=${r.id}`} variant="dark">
                  Tạo hợp đồng
                </ButtonLink>
              )}
            </>
          )
        }
      />
      {r.listingStatus === 'PUBLISHED' && r.operationalStatus === 'VACANT' && (
        <p className="alert alert--info" style={{ marginBottom: 'var(--space-4)' }}>
          Phòng đang hiển thị trên marketplace. <Link to={`/rooms/${r.id}`}>Xem tin đăng công khai →</Link>
        </p>
      )}
      <div className="grid grid--main-side">
        <div className="stack">
          <Section title="Hợp đồng hiện tại">
            {contracts.isLoading ? (
              <LoadingBlock lines={2} />
            ) : current ? (
              <KeyValueList
                items={[
                  { label: 'Mã hợp đồng', value: <Link to={`${base}/contracts/${current.id}`}>{current.code}</Link> },
                  { label: 'Người đứng tên', value: current.primaryTenantName },
                  { label: 'Số người ở', value: current.occupantIds.length },
                  { label: 'Thời hạn', value: `${formatDate(current.startDate)} – ${formatDate(current.endDate)}` },
                  { label: 'Tiền thuê', value: formatVnd(current.monthlyRent) },
                ]}
              />
            ) : (
              <EmptyState title="Phòng chưa có hợp đồng hiệu lực" />
            )}
          </Section>
          <Section title="Lịch sử hợp đồng" flush>
            <DataTable
              rows={contracts.data}
              rowKey={(c) => c.id}
              isLoading={contracts.isLoading}
              error={contracts.error}
              empty={<EmptyState title="Chưa có lịch sử" />}
              columns={[
                { key: 'code', header: 'Mã', render: (c) => <Link to={`${base}/contracts/${c.id}`}>{c.code}</Link> },
                { key: 'tenant', header: 'Người thuê', render: (c) => c.primaryTenantName },
                { key: 'term', header: 'Thời hạn', render: (c) => `${formatDate(c.startDate)} – ${formatDate(c.endDate)}` },
                { key: 'st', header: 'Trạng thái', render: (c) => <StatusBadge status={c.status} map={CONTRACT_STATUS} /> },
              ]}
            />
          </Section>
        </div>
        <div className="stack">
          <Section title="Thông tin">
            <KeyValueList
              items={[
                { label: 'Giá niêm yết', value: formatVnd(r.basePrice) },
                { label: 'Cập nhật', value: formatDateTime(r.updatedAt) },
              ]}
            />
            <div className="room-card__amenities" style={{ marginTop: 'var(--space-3)' }}>
              {r.amenities.map((a) => (
                <Badge key={a}>{AMENITY_LABELS[a]}</Badge>
              ))}
            </div>
            {r.description && <p className="text-sm muted" style={{ marginTop: 'var(--space-3)' }}>{r.description}</p>}
          </Section>
          {r.images.length > 0 && (
            <div className="card" style={{ overflow: 'hidden', aspectRatio: '4/3' }}>
              <RoomImage src={r.images[0]} alt={`Phòng ${r.code}`} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ===================================================================== Viewings
/** VIEW-01 */
export function WsViewingsPage() {
  const { ws } = useWorkspaceContext();
  const [tab, setTab] = useState<WsViewingStatus | 'ALL'>('PENDING');
  const { data, isLoading, error, refetch } = useWsViewings(ws);
  const setStatus = useSetViewingStatus(ws);
  const toast = useToast();
  const rows = (data ?? []).filter((v) => tab === 'ALL' || v.status === tab);
  const count = (s: WsViewingStatus) => data?.filter((v) => v.status === s).length;

  const act = (v: WsViewing, status: WsViewingStatus, msg: string) =>
    setStatus.mutate({ id: v.id, status }, { onSuccess: () => toast.success(msg), onError: (e) => toast.error(toApiError(e).message) });

  const columns: Column<WsViewing>[] = [
    {
      key: 'time',
      header: 'Thời gian',
      render: (v) => (
        <span className="row">
          <CalendarClock size={14} aria-hidden="true" /> {formatDateTime(v.scheduledAt)}
        </span>
      ),
    },
    {
      key: 'visitor',
      header: 'Khách',
      render: (v) => (
        <>
          <p className="cell-title">{v.visitorName}</p>
          <p className="cell-sub">{v.visitorPhone}</p>
        </>
      ),
    },
    { key: 'room', header: 'Phòng', render: (v) => `${v.roomCode} (${v.buildingName})` },
    { key: 'st', header: 'Trạng thái', render: (v) => <StatusBadge status={v.status} map={WS_VIEWING_STATUS} /> },
    {
      key: 'act',
      header: 'Thao tác',
      render: (v) => (
        <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {v.status === 'PENDING' && (
            <Button size="sm" variant="dark" onClick={() => act(v, 'CONFIRMED', 'Đã xác nhận lịch xem.')}>
              Xác nhận
            </Button>
          )}
          {v.status === 'CONFIRMED' && (
            <Button size="sm" variant="soft" onClick={() => act(v, 'COMPLETED', 'Đã đánh dấu hoàn thành.')}>
              Hoàn thành
            </Button>
          )}
          {(v.status === 'PENDING' || v.status === 'CONFIRMED') && (
            <Button size="sm" variant="ghost" onClick={() => act(v, 'CANCELLED', 'Đã hủy lịch.')}>
              Hủy
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Quản lý lịch xem phòng" description="Xác nhận, hoàn thành hoặc hủy yêu cầu xem phòng từ marketplace." />
      <Tabs
        label="Trạng thái lịch xem"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'PENDING', label: 'Chờ xác nhận', count: count('PENDING') },
          { key: 'CONFIRMED', label: 'Đã xác nhận', count: count('CONFIRMED') },
          { key: 'COMPLETED', label: 'Đã xem', count: count('COMPLETED') },
          { key: 'CANCELLED', label: 'Đã hủy', count: count('CANCELLED') },
          { key: 'ALL', label: 'Tất cả', count: data?.length },
        ]}
      />
      <Section flush>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(v) => v.id}
          isLoading={isLoading}
          error={error}
          onRetry={() => refetch()}
          empty={<EmptyState icon={<CalendarClock size={26} />} title="Không có lịch xem ở trạng thái này" />}
        />
      </Section>
    </>
  );
}
