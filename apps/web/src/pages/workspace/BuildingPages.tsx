import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Archive, Building2, ArchiveRestore, Pencil, Plus } from 'lucide-react';
import {
  Badge,
  Button,
  ButtonLink,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FilterBar,
  FormField,
  KeyValueList,
  LoadingBlock,
  PageHeader,
  ProgressBar,
  SearchInput,
  Section,
  StatusBadge,
  useToast,
} from '@/components/ui';
import { useBuilding, useBuildingLifecycle, useBuildings, useCreateBuilding, useRooms, useUpdateBuilding } from '@/features/property-management/hooks';
import { BUILDING_STATUS, propertyErrorMessage } from '@/features/property-management/labels';
import { diffBuilding } from '@/features/property-management/mappers';
import type { BuildingInput, ManagedBuilding } from '@/features/property-management/types';
import { useWorkspaceContext } from '@/hooks/useWorkspaceContext';
import { useSearchState } from '@/hooks/useSearchState';
import { useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning';
import { formatDate, formatPercent } from '@/lib/format';
import { toApiError } from '@/services/http/ApiError';
import { RoomTable } from './RoomPages';

/** Địa chỉ hiển thị: chỉ ghép các phần backend thực sự có. */
export function addressLine(b: Pick<ManagedBuilding, 'address' | 'addressLine2' | 'ward' | 'district' | 'city'>): string {
  return [b.address, b.addressLine2, b.ward, b.district, b.city].filter(Boolean).join(', ');
}

/** Có được ghi dữ liệu tài sản không: đúng vai trò (OWNER) và workspace chưa lưu trữ. */
export function useCanWriteProperty() {
  const { can, membership } = useWorkspaceContext();
  return can('rooms.write') && membership.status !== 'ARCHIVED';
}

// ===================================================================== danh sách
/** BLD-01 */
export function BuildingsPage() {
  const { ws, base, can } = useWorkspaceContext();
  const writable = useCanWriteProperty();
  const [s, set] = useSearchState(['q'] as const);
  const { data, isLoading, error, refetch } = useBuildings(ws, s.q || undefined);

  return (
    <>
      <PageHeader
        title="Tòa nhà"
        description="Danh sách tòa nhà / khu trọ trong workspace."
        actions={
          writable && (
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
            description={!s.q && !can('rooms.write') ? 'Chủ trọ hoặc quản lý sẽ thêm tòa nhà.' : undefined}
            action={writable && !s.q ? <ButtonLink to={`${base}/buildings/new`}>Thêm tòa nhà đầu tiên</ButtonLink> : undefined}
          />
        </div>
      ) : (
        <div className="grid grid--3">
          {data.map((b) => {
            const rate = b.roomCount ? b.occupiedCount / b.roomCount : 0;
            return (
              <Link key={b.id} to={`${base}/buildings/${b.id}`} className="card workspace-card" style={b.status === 'ARCHIVED' ? { opacity: 0.75 } : undefined}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="brand__logo">
                    <Building2 size={18} aria-hidden="true" />
                  </span>
                  <StatusBadge status={b.status} map={BUILDING_STATUS} />
                </div>
                <div>
                  <p className="cell-title" style={{ fontSize: 'var(--text-lg)' }}>
                    {b.name}
                  </p>
                  <p className="cell-sub">{addressLine(b)}</p>
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

// ===================================================================== form
const optional = (max: number, label: string) => z.string().trim().max(max, `${label} tối đa ${max} ký tự`);
const coordinate = (min: number, max: number, label: string) =>
  z.union([z.literal(''), z.coerce.number({ invalid_type_error: `${label} phải là số` }).min(min, `${label} từ ${min} đến ${max}`).max(max, `${label} từ ${min} đến ${max}`)]).optional();

export const buildingSchema = z
  .object({
    name: z.string().trim().min(1, 'Nhập tên tòa nhà').max(100, 'Tên tối đa 100 ký tự'),
    address: z.string().trim().min(1, 'Nhập địa chỉ').max(200, 'Địa chỉ tối đa 200 ký tự'),
    addressLine2: optional(200, 'Địa chỉ bổ sung'),
    ward: optional(100, 'Phường/xã'),
    district: optional(100, 'Quận/huyện'),
    city: z.string().trim().min(1, 'Nhập tỉnh/thành').max(100, 'Tỉnh/thành tối đa 100 ký tự'),
    postalCode: optional(20, 'Mã bưu chính'),
    description: optional(5000, 'Mô tả'),
    lat: coordinate(-90, 90, 'Vĩ độ'),
    lng: coordinate(-180, 180, 'Kinh độ'),
  })
  // Backend yêu cầu tọa độ đi theo cặp (cả vĩ độ lẫn kinh độ, hoặc không có).
  .superRefine((v, ctx) => {
    const hasLat = v.lat !== '' && v.lat !== undefined;
    const hasLng = v.lng !== '' && v.lng !== undefined;
    if (hasLat !== hasLng) ctx.addIssue({ code: 'custom', path: [hasLat ? 'lng' : 'lat'], message: 'Nhập cả vĩ độ và kinh độ, hoặc để trống cả hai' });
  });
export type BuildingForm = z.input<typeof buildingSchema>;

/** Form → input đúng DTO (chuỗi rỗng và tọa độ trống không gửi đi). */
export function toBuildingInput(v: z.output<typeof buildingSchema>): BuildingInput {
  const blank = (x: string | undefined) => (x ? x : undefined);
  return {
    name: v.name,
    address: v.address,
    addressLine2: blank(v.addressLine2),
    ward: blank(v.ward),
    district: blank(v.district),
    city: v.city,
    postalCode: blank(v.postalCode),
    description: blank(v.description),
    lat: v.lat === '' || v.lat === undefined ? undefined : Number(v.lat),
    lng: v.lng === '' || v.lng === undefined ? undefined : Number(v.lng),
  };
}

/** Tên field của backend → tên field trong form, để hiện lỗi đúng ô. */
const BUILDING_FIELDS = new Set(['name', 'address', 'addressLine2', 'ward', 'district', 'city', 'postalCode', 'description', 'lat', 'lng']);
const FORM_FIELDS: Record<string, keyof BuildingForm> = { addressLine1: 'address', latitude: 'lat', longitude: 'lng' };

/** BLD-02 / BLD-04 */
export function BuildingFormPage() {
  const { ws, base } = useWorkspaceContext();
  const writable = useCanWriteProperty();
  const { buildingId } = useParams();
  const isEdit = Boolean(buildingId);
  const existing = useBuilding(ws, buildingId);
  const create = useCreateBuilding(ws);
  const update = useUpdateBuilding(ws, buildingId ?? '');
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
      ? {
          name: b.name,
          address: b.address,
          addressLine2: b.addressLine2 ?? '',
          ward: b.ward ?? '',
          district: b.district ?? '',
          city: b.city,
          postalCode: b.postalCode ?? '',
          description: b.description ?? '',
          lat: b.lat ?? '',
          lng: b.lng ?? '',
        }
      : { name: '', address: '', addressLine2: '', ward: '', district: '', city: 'Hà Nội', postalCode: '', description: '', lat: '', lng: '' },
  });
  const unsaved = useUnsavedChangesWarning(isDirty && !isSubmitSuccessful);

  if (!writable) return <ErrorState error={{ status: 403 }} />;
  if (isEdit && existing.isLoading) return <LoadingBlock />;
  if (isEdit && (existing.error || !b)) return <ErrorState error={existing.error ?? { status: 404 }} onRetry={() => existing.refetch()} />;
  const archived = b?.status === 'ARCHIVED';

  const onSubmit = handleSubmit(async (values) => {
    const input = toBuildingInput(buildingSchema.parse(values));
    try {
      if (isEdit && b) {
        if ((b.lat !== undefined || b.lng !== undefined) && input.lat === undefined) {
          setError('lat', { message: 'Không thể xóa tọa độ đã có; hãy nhập tọa độ mới.' });
          return;
        }
        const patch = diffBuilding(b, input);
        if (Object.keys(patch).length === 0) {
          toast.success('Không có thay đổi nào để lưu.');
          unsaved.markSaved();
      navigate(`${base}/buildings/${b.id}`);
          return;
        }
        await update.mutateAsync(patch);
        toast.success('Đã cập nhật tòa nhà.');
        unsaved.markSaved();
      navigate(`${base}/buildings/${b.id}`);
      } else {
        const saved = await create.mutateAsync(input);
        toast.success('Đã tạo tòa nhà.');
        unsaved.markSaved();
      navigate(`${base}/buildings/${saved.id}`);
      }
    } catch (e) {
      const err = toApiError(e);
      const mapped = Object.entries(err.fieldErrors ?? {}).filter(([f]) => BUILDING_FIELDS.has(FORM_FIELDS[f] ?? f));
      mapped.forEach(([f, m]) => setError((FORM_FIELDS[f] ?? f) as keyof BuildingForm, { message: m }));
      if (!mapped.length) toast.error(propertyErrorMessage(e));
    }
  });

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Tòa nhà', to: `${base}/buildings` }, { label: isEdit ? (b?.name ?? '') : 'Thêm mới' }]}
        title={isEdit ? `Sửa ${b?.name ?? 'tòa nhà'}` : 'Thêm tòa nhà'}
      />
      {archived && (
        <p className="alert alert--warning" role="status" style={{ marginBottom: 'var(--space-4)' }}>
          Tòa nhà đã lưu trữ nên không thể chỉnh sửa. Hãy khôi phục tòa nhà ở trang chi tiết trước.
        </p>
      )}
      <form onSubmit={onSubmit} noValidate>
        <fieldset disabled={archived} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <Section title="Thông tin & địa chỉ">
            <div className="form-grid form-grid--2">
              <FormField label="Tên tòa nhà" required error={errors.name?.message}>
                <input className="input" maxLength={100} {...register('name')} placeholder="VD: Tòa D" />
              </FormField>
              <FormField label="Địa chỉ (số nhà, đường)" required error={errors.address?.message}>
                <input className="input" maxLength={200} {...register('address')} />
              </FormField>
              <FormField label="Địa chỉ bổ sung" error={errors.addressLine2?.message}>
                <input className="input" maxLength={200} {...register('addressLine2')} />
              </FormField>
              <FormField label="Phường / Xã" error={errors.ward?.message}>
                <input className="input" maxLength={100} {...register('ward')} />
              </FormField>
              <FormField label="Quận / Huyện" error={errors.district?.message}>
                <input className="input" maxLength={100} {...register('district')} />
              </FormField>
              <FormField label="Tỉnh / Thành phố" required error={errors.city?.message}>
                <input className="input" maxLength={100} {...register('city')} />
              </FormField>
              <FormField label="Mã bưu chính" error={errors.postalCode?.message}>
                <input className="input" maxLength={20} {...register('postalCode')} />
              </FormField>
              <span />
              <FormField label="Vĩ độ (lat)" error={errors.lat?.message} hint="Tùy chọn; nhập cùng kinh độ.">
                <input className="input" inputMode="decimal" {...register('lat')} />
              </FormField>
              <FormField label="Kinh độ (lng)" error={errors.lng?.message}>
                <input className="input" inputMode="decimal" {...register('lng')} />
              </FormField>
            </div>
            <div style={{ marginTop: 'var(--space-4)' }}>
              <FormField label="Mô tả" error={errors.description?.message}>
                <textarea className="textarea" maxLength={5000} {...register('description')} />
              </FormField>
            </div>
            <div className="form-actions">
              <ButtonLink to={isEdit ? `${base}/buildings/${buildingId}` : `${base}/buildings`} variant="secondary">
                Hủy
              </ButtonLink>
              <Button type="submit" variant="dark" loading={create.isPending || update.isPending} disabled={archived}>
                {isEdit ? 'Lưu thay đổi' : 'Tạo tòa nhà'}
              </Button>
            </div>
          </Section>
        </fieldset>
      </form>
    </>
  );
}

// ===================================================================== chi tiết
/** BLD-03 */
export function BuildingDetailPage() {
  const { ws, base, can } = useWorkspaceContext();
  const writable = useCanWriteProperty();
  const { buildingId } = useParams();
  const building = useBuilding(ws, buildingId);
  const rooms = useRooms(ws, { buildingId });
  const lifecycle = useBuildingLifecycle(ws);
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);

  if (building.isLoading) return <LoadingBlock lines={6} />;
  if (building.error || !building.data) return <ErrorState error={building.error ?? { status: 404 }} onRetry={() => building.refetch()} />;
  const b = building.data;
  const archived = b.status === 'ARCHIVED';
  const rate = b.roomCount ? b.occupiedCount / b.roomCount : 0;
  const canArchive = can('buildings.archive') && !building.isFetching;

  const toggle = (action: 'archive' | 'restore') =>
    lifecycle[action].mutate(b.id, {
      onSuccess: () => {
        toast.success(action === 'archive' ? 'Đã lưu trữ tòa nhà.' : 'Đã khôi phục tòa nhà.');
        setConfirm(false);
      },
      onError: (e) => {
        toast.error(propertyErrorMessage(e));
        setConfirm(false);
      },
    });

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Tòa nhà', to: `${base}/buildings` }, { label: b.name }]}
        title={b.name}
        description={addressLine(b)}
        eyebrow={
          <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
            <StatusBadge status={b.status} map={BUILDING_STATUS} />
          </div>
        }
        actions={
          <>
            {writable && !archived && (
              <>
                <ButtonLink to={`${base}/buildings/${b.id}/edit`} variant="secondary">
                  <Pencil size={16} aria-hidden="true" /> Sửa
                </ButtonLink>
                <ButtonLink to={`${base}/rooms/new?buildingId=${b.id}`} variant="dark">
                  <Plus size={16} aria-hidden="true" /> Thêm phòng
                </ButtonLink>
              </>
            )}
            {canArchive && !archived && (
              <Button variant="secondary" onClick={() => setConfirm(true)}>
                <Archive size={16} aria-hidden="true" /> Lưu trữ
              </Button>
            )}
            {canArchive && archived && (
              <Button variant="secondary" loading={lifecycle.restore.isPending} onClick={() => toggle('restore')}>
                <ArchiveRestore size={16} aria-hidden="true" /> Khôi phục
              </Button>
            )}
          </>
        }
      />
      {archived && (
        <p className="alert alert--warning" role="status" style={{ marginBottom: 'var(--space-4)' }}>
          Tòa nhà đã lưu trữ: chỉ xem. {can('buildings.archive') ? 'Bạn có thể khôi phục để tiếp tục chỉnh sửa.' : 'Chỉ chủ sở hữu (OWNER) mới khôi phục được.'}
        </p>
      )}
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
        <Section title="Thông tin">
          <KeyValueList
            items={[
              { label: 'Trạng thái', value: <Badge tone={archived ? 'neutral' : 'success'}>{BUILDING_STATUS[b.status].label}</Badge> },
              { label: 'Tọa độ', value: b.lat !== undefined && b.lng !== undefined ? `${b.lat}, ${b.lng}` : 'Chưa cập nhật' },
              { label: 'Mã bưu chính', value: b.postalCode || '—' },
              { label: 'Ngày tạo', value: formatDate(b.createdAt) },
              { label: 'Mô tả', value: b.description || '—' },
            ]}
          />
        </Section>
      </div>
      <ConfirmDialog
        open={confirm}
        title="Lưu trữ tòa nhà?"
        description={`“${b.name}” sẽ chuyển sang chỉ xem: không thể sửa, thêm phòng hay ghi dữ liệu mới cho tòa này. Dữ liệu và lịch sử được giữ nguyên, bạn có thể khôi phục sau.`}
        confirmLabel="Lưu trữ"
        danger
        loading={lifecycle.archive.isPending}
        onConfirm={() => toggle('archive')}
        onCancel={() => setConfirm(false)}
      />
    </>
  );
}
