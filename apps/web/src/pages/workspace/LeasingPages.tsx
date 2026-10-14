import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
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
  KeyValueList,
  LoadingBlock,
  Modal,
  PageHeader,
  SearchInput,
  Section,
  Select,
  StatusBadge,
  useToast,
  type Column,
} from '@/components/ui';
import {
  useActivateContract,
  useContract,
  useContracts,
  useDeleteVehicle,
  useReviewLinkRequest,
  useSaveContract,
  useSaveTenant,
  useSaveVehicle,
  useTenant,
  useTenants,
  useTerminateContract,
  useVehicles,
} from '@/features/leasing/hooks';
import { CONTRACT_STATUS, LINK_STATUS, VEHICLE_TYPE, WATER_MODE } from '@/features/leasing/labels';
import { contractSchema, tenantSchema, vehicleSchema, type ContractForm, type TenantForm, type VehicleForm } from '@/features/leasing/schemas';
import type { AccountLinkStatus, Contract, ContractStatus, Tenant, Vehicle, VehicleType } from '@/features/leasing/types';
import { useWsRooms } from '@/features/property/hooks';
import { useDeposits, useInvoices } from '@/features/billing/hooks';
import { DEPOSIT_TYPE, INVOICE_STATUS } from '@/features/billing/labels';
import { findOverlappingContracts, invoiceBalance } from '@/features/billing/calc';
import { useWorkspaceContext } from '@/hooks/useWorkspaceContext';
import { useSearchState } from '@/hooks/useSearchState';
import { useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning';
import { addDays, inclusiveDays, todayVN } from '@/lib/dates';
import { formatDate, formatDateTime, formatVnd, formatNumber } from '@/lib/format';
import { periodLabel } from '@/lib/dates';
import { toApiError } from '@/services/http/ApiError';
import { ForbiddenPage } from '@/pages/system/ErrorPages';

// ===================================================================== Tenants
/** TEN-01 */
export function TenantsPage() {
  const { ws, base, can } = useWorkspaceContext();
  const [s, set] = useSearchState(['q', 'link'] as const);
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useTenants(ws, { q: s.q || undefined, linkStatus: (s.link || undefined) as AccountLinkStatus | undefined });
  const contracts = useContracts(ws, { status: 'ACTIVE' });
  const roomOf = (t: Tenant) => contracts.data?.find((c) => c.occupantIds.includes(t.id));

  const columns: Column<Tenant>[] = [
    {
      key: 'name',
      header: 'Người thuê',
      render: (t) => (
        <>
          <Link to={`${base}/tenants/${t.id}`} className="cell-title">
            {t.fullName}
          </Link>
          <p className="cell-sub">{t.email ?? '—'}</p>
        </>
      ),
    },
    { key: 'phone', header: 'Điện thoại', render: (t) => t.phone },
    {
      key: 'room',
      header: 'Phòng đang ở',
      render: (t) => {
        const c = roomOf(t);
        return c ? `${c.roomCode} (${c.buildingName})` : <span className="muted">—</span>;
      },
    },
    { key: 'link', header: 'Liên kết tài khoản', render: (t) => <StatusBadge status={t.accountLinkStatus} map={LINK_STATUS} /> },
  ];

  return (
    <>
      <PageHeader
        title="Người thuê"
        description="Hồ sơ người thuê do chủ trọ tạo. Liên kết tài khoản chỉ qua yêu cầu có xác minh — không tự liên kết theo số điện thoại."
        actions={
          can('rooms.write') && (
            <ButtonLink to={`${base}/tenants/new`} variant="dark">
              <UserPlus size={16} aria-hidden="true" /> Thêm người thuê
            </ButtonLink>
          )
        }
      />
      <Section flush>
        <FilterBar>
          <SearchInput value={s.q} onChange={(q) => set({ q })} placeholder="Tìm tên, SĐT, email…" />
          <Select aria-label="Trạng thái liên kết" value={s.link} onChange={(e) => set({ link: e.target.value })}>
            <option value="">Mọi trạng thái liên kết</option>
            {(Object.keys(LINK_STATUS) as AccountLinkStatus[]).map((k) => (
              <option key={k} value={k}>
                {LINK_STATUS[k].label}
              </option>
            ))}
          </Select>
        </FilterBar>
        <DataTable
          columns={columns}
          rows={data}
          rowKey={(t) => t.id}
          isLoading={isLoading}
          error={error}
          onRetry={() => refetch()}
          onRowClick={(t) => navigate(`${base}/tenants/${t.id}`)}
          empty={<EmptyState title="Không có người thuê phù hợp" />}
        />
      </Section>
    </>
  );
}

/** TEN-02 (+ sửa hồ sơ) */
export function TenantFormPage() {
  const { ws, base, can } = useWorkspaceContext();
  const { tenantId } = useParams();
  const isEdit = Boolean(tenantId);
  const existing = useTenant(ws, tenantId);
  const save = useSaveTenant(ws, tenantId);
  const navigate = useNavigate();
  const toast = useToast();
  const t = existing.data;
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty, isSubmitSuccessful },
  } = useForm<TenantForm>({
    resolver: zodResolver(tenantSchema),
    values: t
      ? { fullName: t.fullName, phone: t.phone, email: t.email ?? '', idNumber: t.idNumber ?? '', dateOfBirth: t.dateOfBirth ?? '', hometown: t.hometown ?? '', note: t.note ?? '' }
      : { fullName: '', phone: '', email: '', idNumber: '', dateOfBirth: '', hometown: '', note: '' },
  });
  useUnsavedChangesWarning(isDirty && !isSubmitSuccessful);

  if (!can('rooms.write')) return <ForbiddenPage />;
  if (isEdit && existing.isLoading) return <LoadingBlock />;
  if (isEdit && existing.error) return <ErrorState error={existing.error} onRetry={() => existing.refetch()} />;

  const onSubmit = handleSubmit(async (values) => {
    try {
      const saved = await save.mutateAsync(tenantSchema.parse(values));
      toast.success(isEdit ? 'Đã cập nhật hồ sơ.' : 'Đã tạo hồ sơ người thuê.');
      navigate(`${base}/tenants/${saved.id}`);
    } catch (e) {
      toast.error(toApiError(e).message);
    }
  });

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Người thuê', to: `${base}/tenants` }, { label: isEdit ? t?.fullName ?? '' : 'Thêm mới' }]}
        title={isEdit ? 'Sửa hồ sơ người thuê' : 'Tạo hồ sơ người thuê'}
      />
      <form onSubmit={onSubmit} noValidate>
        <Section title="Thông tin liên hệ & định danh">
          <p className="alert alert--info" style={{ marginBottom: 'var(--space-4)' }}>
            Hồ sơ này KHÔNG tự liên kết với tài khoản người dùng, kể cả khi trùng số điện thoại. Người thuê tự gửi yêu cầu liên kết có xác minh, sau đó bạn duyệt.
          </p>
          <div className="form-grid form-grid--2">
            <FormField label="Họ và tên" required error={errors.fullName?.message}>
              <input className="input" {...register('fullName')} />
            </FormField>
            <FormField label="Số điện thoại" required error={errors.phone?.message}>
              <input className="input" type="tel" {...register('phone')} />
            </FormField>
            <FormField label="Email" error={errors.email?.message}>
              <input className="input" type="email" {...register('email')} />
            </FormField>
            <FormField label="CCCD/CMND" error={errors.idNumber?.message}>
              <input className="input" inputMode="numeric" {...register('idNumber')} />
            </FormField>
            <FormField label="Ngày sinh" error={errors.dateOfBirth?.message}>
              <DatePicker max={todayVN()} {...register('dateOfBirth')} />
            </FormField>
            <FormField label="Quê quán" error={errors.hometown?.message}>
              <input className="input" {...register('hometown')} />
            </FormField>
          </div>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <FormField label="Ghi chú">
              <textarea className="textarea" {...register('note')} />
            </FormField>
          </div>
          <div className="form-actions">
            <ButtonLink to={isEdit ? `${base}/tenants/${tenantId}` : `${base}/tenants`} variant="secondary">
              Hủy
            </ButtonLink>
            <Button type="submit" variant="dark" loading={save.isPending}>
              {isEdit ? 'Lưu thay đổi' : 'Tạo hồ sơ'}
            </Button>
          </div>
        </Section>
      </form>
    </>
  );
}

/** TEN-03 */
export function TenantDetailPage() {
  const { ws, base, can } = useWorkspaceContext();
  const { tenantId } = useParams();
  const tenant = useTenant(ws, tenantId);
  const contracts = useContracts(ws, { tenantId });
  const vehicles = useVehicles(ws);
  const review = useReviewLinkRequest(ws);
  const toast = useToast();

  if (tenant.isLoading) return <LoadingBlock lines={6} />;
  if (tenant.error || !tenant.data) return <ErrorState error={tenant.error} onRetry={() => tenant.refetch()} />;
  const t = tenant.data;
  const myVehicles = vehicles.data?.filter((v) => v.tenantId === t.id) ?? [];

  const decide = (approve: boolean) =>
    review.mutate(
      { tenantId: t.id, approve },
      { onSuccess: () => toast.success(approve ? 'Đã duyệt liên kết tài khoản.' : 'Đã từ chối yêu cầu liên kết.'), onError: (e) => toast.error(toApiError(e).message) },
    );

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Người thuê', to: `${base}/tenants` }, { label: t.fullName }]}
        title={t.fullName}
        description={`${t.phone}${t.email ? ` • ${t.email}` : ''}`}
        eyebrow={<div style={{ marginBottom: 'var(--space-2)' }}><StatusBadge status={t.accountLinkStatus} map={LINK_STATUS} /></div>}
        actions={
          can('rooms.write') && (
            <>
              <ButtonLink to={`${base}/tenants/${t.id}/edit`} variant="secondary">
                <Pencil size={16} aria-hidden="true" /> Sửa hồ sơ
              </ButtonLink>
              <ButtonLink to={`${base}/contracts/new?tenantId=${t.id}`} variant="dark">
                <Plus size={16} aria-hidden="true" /> Tạo hợp đồng
              </ButtonLink>
            </>
          )
        }
      />
      {t.accountLinkStatus === 'PENDING' && (
        <div className="alert alert--warning" style={{ marginBottom: 'var(--space-4)', alignItems: 'center', flexWrap: 'wrap' }}>
          <AlertTriangle size={18} aria-hidden="true" />
          <span style={{ flex: 1 }}>Có yêu cầu liên kết tài khoản đã qua bước xác minh (mã hợp đồng + SĐT + OTP). Vui lòng kiểm tra trước khi duyệt.</span>
          {can('rooms.write') && (
            <div className="row">
              <Button size="sm" variant="secondary" onClick={() => decide(false)} disabled={review.isPending}>
                Từ chối
              </Button>
              <Button size="sm" variant="dark" onClick={() => decide(true)} loading={review.isPending}>
                Duyệt liên kết
              </Button>
            </div>
          )}
        </div>
      )}
      <div className="grid grid--main-side">
        <div className="stack">
          <Section title="Hợp đồng" flush>
            <DataTable
              rows={contracts.data}
              rowKey={(c) => c.id}
              isLoading={contracts.isLoading}
              error={contracts.error}
              empty={<EmptyState title="Chưa có hợp đồng" />}
              columns={[
                { key: 'code', header: 'Mã', render: (c) => <Link to={`${base}/contracts/${c.id}`}>{c.code}</Link> },
                { key: 'room', header: 'Phòng', render: (c) => `${c.roomCode} (${c.buildingName})` },
                { key: 'role', header: 'Vai trò', render: (c) => (c.primaryTenantId === t.id ? 'Đứng tên' : 'Ở cùng') },
                { key: 'term', header: 'Thời hạn', render: (c) => `${formatDate(c.startDate)} – ${formatDate(c.endDate)}` },
                { key: 'st', header: 'Trạng thái', render: (c) => <StatusBadge status={c.status} map={CONTRACT_STATUS} /> },
              ]}
            />
          </Section>
          <Section title="Phương tiện" actions={<Link to={`${base}/vehicles`} className="text-sm">Quản lý phương tiện →</Link>}>
            {myVehicles.length ? (
              <ul className="list-plain stack" style={{ gap: 'var(--space-2)' }}>
                {myVehicles.map((v) => (
                  <li key={v.id} className="row" style={{ justifyContent: 'space-between' }}>
                    <span>
                      <strong>{v.plate}</strong> — {VEHICLE_TYPE[v.type]} {v.brand}
                    </span>
                    <span className="text-sm">{formatVnd(v.monthlyFee)}/tháng</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted text-sm">Chưa đăng ký phương tiện.</p>
            )}
          </Section>
        </div>
        <Section title="Hồ sơ">
          <KeyValueList
            items={[
              { label: 'CCCD/CMND', value: t.idNumber ?? '—' },
              { label: 'Ngày sinh', value: t.dateOfBirth ? formatDate(t.dateOfBirth) : '—' },
              { label: 'Quê quán', value: t.hometown ?? '—' },
              { label: 'Ngày tạo hồ sơ', value: formatDate(t.createdAt) },
              { label: 'Ghi chú', value: t.note ?? '—' },
            ]}
          />
        </Section>
      </div>
    </>
  );
}

// ===================================================================== Contracts
/** CTR-01 */
export function ContractsPage() {
  const { ws, base, can } = useWorkspaceContext();
  const [s, set] = useSearchState(['q', 'status'] as const);
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useContracts(ws, { q: s.q || undefined, status: (s.status || undefined) as ContractStatus | undefined });
  const today = todayVN();

  const columns: Column<Contract>[] = [
    {
      key: 'code',
      header: 'Hợp đồng',
      render: (c) => (
        <>
          <Link to={`${base}/contracts/${c.id}`} className="cell-title">
            {c.code}
          </Link>
          <p className="cell-sub">
            {c.roomCode} • {c.buildingName}
          </p>
        </>
      ),
    },
    { key: 'tenant', header: 'Người đứng tên', render: (c) => `${c.primaryTenantName}${c.occupantIds.length > 1 ? ` (+${c.occupantIds.length - 1})` : ''}` },
    {
      key: 'term',
      header: 'Thời hạn',
      render: (c) => {
        const left = inclusiveDays(today, c.endDate) - 1;
        return (
          <>
            <p className="text-sm">
              {formatDate(c.startDate)} – {formatDate(c.endDate)}
            </p>
            {c.status === 'ACTIVE' && left <= 30 && left >= 0 && <Badge tone="warning">Còn {left} ngày</Badge>}
          </>
        );
      },
    },
    { key: 'rent', header: 'Tiền thuê', align: 'right', render: (c) => formatVnd(c.monthlyRent) },
    { key: 'st', header: 'Trạng thái', render: (c) => <StatusBadge status={c.status} map={CONTRACT_STATUS} /> },
  ];

  return (
    <>
      <PageHeader
        title="Hợp đồng"
        description="Hợp đồng có thời hạn cố định; ngày kết thúc tính bao gồm."
        actions={
          can('rooms.write') && (
            <ButtonLink to={`${base}/contracts/new`} variant="dark">
              <Plus size={16} aria-hidden="true" /> Tạo hợp đồng
            </ButtonLink>
          )
        }
      />
      <Section flush>
        <FilterBar>
          <SearchInput value={s.q} onChange={(q) => set({ q })} placeholder="Mã HĐ, phòng, người thuê…" />
          <Select aria-label="Trạng thái" value={s.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">Mọi trạng thái</option>
            {(Object.keys(CONTRACT_STATUS) as ContractStatus[]).map((k) => (
              <option key={k} value={k}>
                {CONTRACT_STATUS[k].label}
              </option>
            ))}
          </Select>
        </FilterBar>
        <DataTable
          columns={columns}
          rows={data}
          rowKey={(c) => c.id}
          isLoading={isLoading}
          error={error}
          onRetry={() => refetch()}
          onRowClick={(c) => navigate(`${base}/contracts/${c.id}`)}
          empty={<EmptyState title="Không có hợp đồng phù hợp" />}
        />
      </Section>
    </>
  );
}

/** CTR-02 / CTR-04 — chỉ sửa được hợp đồng Nháp. */
export function ContractFormPage() {
  const { ws, base, can } = useWorkspaceContext();
  const { contractId } = useParams();
  const [qs] = useSearchState(['roomId', 'tenantId'] as const);
  const isEdit = Boolean(contractId);
  const existing = useContract(ws, contractId);
  const rooms = useWsRooms(ws);
  const tenants = useTenants(ws);
  const allContracts = useContracts(ws);
  const save = useSaveContract(ws, contractId);
  const navigate = useNavigate();
  const toast = useToast();
  const c = existing.data;
  const today = todayVN();

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors, isDirty, isSubmitSuccessful },
  } = useForm<ContractForm>({
    resolver: zodResolver(contractSchema),
    values: c
      ? {
          roomId: c.roomId,
          primaryTenantId: c.primaryTenantId,
          occupantIds: c.occupantIds.filter((id) => id !== c.primaryTenantId),
          startDate: c.startDate,
          endDate: c.endDate,
          monthlyRent: c.monthlyRent,
          deposit: c.deposit,
          waterMode: c.waterMode,
          note: c.note ?? '',
        }
      : {
          roomId: qs.roomId,
          primaryTenantId: qs.tenantId,
          occupantIds: [],
          startDate: today,
          endDate: addDays(addDays(today, 365), -1),
          monthlyRent: undefined as unknown as number,
          deposit: undefined as unknown as number,
          waterMode: 'PER_PERSON',
          note: '',
        },
  });
  useUnsavedChangesWarning(isDirty && !isSubmitSuccessful);

  const [roomId, startDate, endDate, primaryTenantId, occupantIds] = useWatch({ control, name: ['roomId', 'startDate', 'endDate', 'primaryTenantId', 'occupantIds'] });
  const room = rooms.data?.find((r) => r.id === roomId);
  const overlaps = useMemo(
    () => (roomId && startDate && endDate && allContracts.data ? findOverlappingContracts(allContracts.data, { id: contractId, roomId, startDate, endDate }) : []),
    [allContracts.data, roomId, startDate, endDate, contractId],
  );
  const totalPeople = (primaryTenantId ? 1 : 0) + (occupantIds?.length ?? 0);

  if (!can('rooms.write')) return <ForbiddenPage />;
  if (isEdit && existing.isLoading) return <LoadingBlock />;
  if (isEdit && existing.error) return <ErrorState error={existing.error} onRetry={() => existing.refetch()} />;
  if (c && c.status !== 'DRAFT')
    return (
      <ErrorState
        error={{ status: 409, message: 'Chỉ sửa được hợp đồng ở trạng thái Nháp.' }}
        onRetry={() => navigate(`${base}/contracts/${c.id}`)}
      />
    );

  const onSubmit = handleSubmit(async (values) => {
    const v = contractSchema.parse(values);
    try {
      const saved = await save.mutateAsync({ ...v, occupantIds: v.occupantIds });
      toast.success(isEdit ? 'Đã cập nhật hợp đồng nháp.' : 'Đã tạo hợp đồng nháp. Kích hoạt để bắt đầu tính tiền.');
      navigate(`${base}/contracts/${saved.id}`);
    } catch (e) {
      const err = toApiError(e);
      Object.entries(err.fieldErrors ?? {}).forEach(([f, m]) => setError(f as keyof ContractForm, { message: m }));
      toast.error(err.message);
    }
  });

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Hợp đồng', to: `${base}/contracts` }, { label: isEdit ? c?.code ?? '' : 'Tạo mới' }]}
        title={isEdit ? `Sửa hợp đồng nháp ${c?.code ?? ''}` : 'Tạo hợp đồng'}
        description="Hợp đồng được lưu ở trạng thái Nháp; kích hoạt ở trang chi tiết."
      />
      <form onSubmit={onSubmit} noValidate className="stack">
        <Section title="Phòng & người thuê">
          <div className="form-grid form-grid--2">
            <FormField label="Phòng" required error={errors.roomId?.message}>
              <select
                className="select"
                {...register('roomId', {
                  onChange: (e) => {
                    const r = rooms.data?.find((x) => x.id === e.target.value);
                    if (r) {
                      setValue('monthlyRent', r.basePrice, { shouldDirty: true });
                      setValue('deposit', r.basePrice, { shouldDirty: true });
                    }
                  },
                })}
              >
                <option value="">— Chọn phòng —</option>
                {rooms.data?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.buildingName} • {r.code} ({r.operationalStatus === 'VACANT' ? 'Trống' : r.operationalStatus === 'OCCUPIED' ? 'Đang thuê' : r.operationalStatus})
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Người đứng tên" required error={errors.primaryTenantId?.message} hint={<Link to={`${base}/tenants/new`}>+ Tạo hồ sơ người thuê mới</Link>}>
              <select className="select" {...register('primaryTenantId')}>
                <option value="">— Chọn người thuê —</option>
                {tenants.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName} – {t.phone}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <Controller
            control={control}
            name="occupantIds"
            render={({ field }) => (
              <fieldset className="field" style={{ border: 0, padding: 0, margin: 'var(--space-4) 0 0' }}>
                <legend className="field__label">Người ở cùng ({totalPeople} người{room ? ` / tối đa ${room.maxOccupants}` : ''})</legend>
                <div className="row" style={{ flexWrap: 'wrap' }}>
                  {field.value.map((id) => {
                    const t = tenants.data?.find((x) => x.id === id);
                    return (
                      <button key={id} type="button" className="chip" aria-pressed="true" onClick={() => field.onChange(field.value.filter((x) => x !== id))}>
                        {t?.fullName ?? id} ✕
                      </button>
                    );
                  })}
                  <select
                    className="select"
                    style={{ width: 'auto', minWidth: 200 }}
                    aria-label="Thêm người ở cùng"
                    value=""
                    onChange={(e) => e.target.value && field.onChange([...field.value, e.target.value])}
                  >
                    <option value="">+ Thêm người ở cùng</option>
                    {tenants.data
                      ?.filter((t) => t.id !== primaryTenantId && !field.value.includes(t.id))
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.fullName}
                        </option>
                      ))}
                  </select>
                </div>
                {room && totalPeople > room.maxOccupants && (
                  <span className="field__error" role="alert">
                    Vượt quá số người tối đa của phòng.
                  </span>
                )}
                <span className="field__hint">Số người ở tại ngày cuối kỳ dùng để tính nước theo đầu người.</span>
              </fieldset>
            )}
          />
        </Section>
        <Section title="Thời hạn & chi phí">
          <div className="form-grid form-grid--2">
            <FormField label="Ngày bắt đầu" required error={errors.startDate?.message}>
              <DatePicker {...register('startDate')} />
            </FormField>
            <FormField
              label="Ngày kết thúc (tính bao gồm)"
              required
              error={errors.endDate?.message}
              hint={startDate && endDate && endDate >= startDate ? `Tổng ${formatNumber(inclusiveDays(startDate, endDate))} ngày` : undefined}
            >
              <DatePicker min={startDate} {...register('endDate')} />
            </FormField>
            <FormField label="Tiền thuê / tháng" required error={errors.monthlyRent?.message}>
              <Controller control={control} name="monthlyRent" render={({ field }) => <CurrencyInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} />} />
            </FormField>
            <FormField label="Tiền cọc" required error={errors.deposit?.message} hint="Theo dõi riêng, không tính vào doanh thu thuê.">
              <Controller control={control} name="deposit" render={({ field }) => <CurrencyInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} />} />
            </FormField>
            <FormField label="Cách tính nước" required>
              <select className="select" {...register('waterMode')}>
                <option value="PER_PERSON">{WATER_MODE.PER_PERSON}</option>
                <option value="METER">{WATER_MODE.METER}</option>
              </select>
            </FormField>
          </div>
          {overlaps.length > 0 && (
            <div className="alert alert--warning" role="alert" style={{ marginTop: 'var(--space-4)' }}>
              <AlertTriangle size={18} aria-hidden="true" />
              <div>
                <strong>Cảnh báo trùng lịch:</strong> phòng đã có hợp đồng ĐANG HIỆU LỰC trùng thời gian:{' '}
                {overlaps.map((o) => `${o.code} (${formatDate(o.startDate)} – ${formatDate(o.endDate)})`).join(', ')}. Bạn vẫn có thể lưu nháp, nhưng hệ thống sẽ từ chối khi kích hoạt.
              </div>
            </div>
          )}
          <div style={{ marginTop: 'var(--space-4)' }}>
            <FormField label="Ghi chú / điều khoản thêm">
              <textarea className="textarea" {...register('note')} />
            </FormField>
          </div>
          <div className="form-actions">
            <ButtonLink to={isEdit ? `${base}/contracts/${contractId}` : `${base}/contracts`} variant="secondary">
              Hủy
            </ButtonLink>
            <Button type="submit" variant="dark" loading={save.isPending}>
              {isEdit ? 'Lưu nháp' : 'Tạo hợp đồng nháp'}
            </Button>
          </div>
        </Section>
      </form>
    </>
  );
}

/** CTR-03 */
export function ContractDetailPage() {
  const { ws, base, can } = useWorkspaceContext();
  const { contractId } = useParams();
  const contract = useContract(ws, contractId);
  const tenants = useTenants(ws);
  const invoices = useInvoices(ws, { contractId });
  const deposits = useDeposits(ws, contractId);
  const activate = useActivateContract(ws);
  const terminate = useTerminateContract(ws);
  const toast = useToast();
  const [confirmActivate, setConfirmActivate] = useState(false);
  const [terminateOpen, setTerminateOpen] = useState(false);
  const [endDate, setEndDate] = useState(todayVN());
  const [reason, setReason] = useState('');

  if (contract.isLoading) return <LoadingBlock lines={6} />;
  if (contract.error || !contract.data) return <ErrorState error={contract.error} onRetry={() => contract.refetch()} />;
  const c = contract.data;
  const occupants = c.occupantIds.map((id) => tenants.data?.find((t) => t.id === id)).filter(Boolean) as Tenant[];
  const depositHeld = (deposits.data ?? []).reduce((s, d) => s + DEPOSIT_TYPE[d.type].sign * d.amount, 0);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Hợp đồng', to: `${base}/contracts` }, { label: c.code }]}
        title={`Hợp đồng ${c.code}`}
        description={`${c.roomCode} • ${c.buildingName} • Người đứng tên: ${c.primaryTenantName}`}
        eyebrow={<div style={{ marginBottom: 'var(--space-2)' }}><StatusBadge status={c.status} map={CONTRACT_STATUS} /></div>}
        actions={
          can('rooms.write') && (
            <>
              {c.status === 'DRAFT' && (
                <>
                  <ButtonLink to={`${base}/contracts/${c.id}/edit`} variant="secondary">
                    <Pencil size={16} aria-hidden="true" /> Sửa nháp
                  </ButtonLink>
                  <Button variant="dark" onClick={() => setConfirmActivate(true)}>
                    Kích hoạt hợp đồng
                  </Button>
                </>
              )}
              {c.status === 'ACTIVE' && (
                <Button variant="secondary" onClick={() => setTerminateOpen(true)}>
                  Chấm dứt hợp đồng
                </Button>
              )}
            </>
          )
        }
      />
      <div className="grid grid--main-side">
        <div className="stack">
          <Section title="Kỳ hạn & chi phí">
            <KeyValueList
              items={[
                { label: 'Phòng', value: <Link to={`${base}/rooms/${c.roomId}`}>{`${c.roomCode} (${c.buildingName})`}</Link> },
                { label: 'Thời hạn', value: `${formatDate(c.startDate)} – ${formatDate(c.endDate)} (${formatNumber(inclusiveDays(c.startDate, c.endDate))} ngày, tính bao gồm)` },
                { label: 'Tiền thuê', value: `${formatVnd(c.monthlyRent)}/tháng` },
                { label: 'Tiền cọc theo HĐ', value: formatVnd(c.deposit) },
                { label: 'Cách tính nước', value: WATER_MODE[c.waterMode] },
                { label: 'Ghi chú', value: c.note ?? '—' },
              ]}
            />
          </Section>
          <Section title={`Người ở (${occupants.length})`}>
            <ul className="list-plain stack" style={{ gap: 'var(--space-2)' }}>
              {occupants.map((t) => (
                <li key={t.id} className="row" style={{ justifyContent: 'space-between' }}>
                  <Link to={`${base}/tenants/${t.id}`}>{t.fullName}</Link>
                  <span className="row text-sm muted">
                    {t.phone} {t.id === c.primaryTenantId && <Badge tone="primary">Đứng tên</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Hóa đơn" flush>
            <DataTable
              rows={invoices.data}
              rowKey={(i) => i.id}
              isLoading={invoices.isLoading}
              error={invoices.error}
              empty={<EmptyState title="Chưa có hóa đơn" />}
              columns={[
                { key: 'p', header: 'Kỳ', render: (i) => <Link to={`${base}/invoices/${i.id}`}>{periodLabel(i.period)}</Link> },
                { key: 't', header: 'Tổng', align: 'right', render: (i) => formatVnd(i.total) },
                { key: 'b', header: 'Còn nợ', align: 'right', render: (i) => formatVnd(invoiceBalance(i)) },
                { key: 's', header: 'Trạng thái', render: (i) => <StatusBadge status={i.status} map={INVOICE_STATUS} /> },
              ]}
            />
          </Section>
        </div>
        <div className="stack">
          <Section title="Tiền cọc" actions={<Link to={`${base}/deposits`} className="text-sm">Giao dịch cọc →</Link>}>
            <p style={{ fontSize: 'var(--text-xl)', fontWeight: 800 }}>{formatVnd(depositHeld)}</p>
            <p className="text-xs muted">Đang giữ — theo dõi riêng, không gộp doanh thu.</p>
          </Section>
          <Section title="Lịch sử">
            <ol className="timeline">
              {[...c.history].reverse().map((h, i) => (
                <li key={i}>
                  <div>
                    <p>{h.action}</p>
                    <p className="cell-sub">
                      {formatDateTime(h.at)} • {h.by}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        </div>
      </div>

      <ConfirmDialog
        open={confirmActivate}
        title="Kích hoạt hợp đồng?"
        description="Phòng sẽ chuyển sang Đang thuê, tiền cọc được ghi nhận. Hệ thống sẽ từ chối nếu trùng thời gian với hợp đồng đang hiệu lực khác."
        confirmLabel="Kích hoạt"
        loading={activate.isPending}
        onCancel={() => setConfirmActivate(false)}
        onConfirm={() =>
          activate.mutate(c.id, {
            onSuccess: () => toast.success('Hợp đồng đã có hiệu lực.'),
            onError: (e) => toast.error(toApiError(e).message),
            onSettled: () => setConfirmActivate(false),
          })
        }
      />
      <Modal open={terminateOpen} title="Chấm dứt hợp đồng" onClose={() => setTerminateOpen(false)}>
        <div className="stack">
          <FormField label="Ngày kết thúc thực tế (tính bao gồm)" required>
            <DatePicker value={endDate} min={c.startDate} onChange={(e) => setEndDate(e.target.value)} />
          </FormField>
          <FormField label="Lý do" required error={reason.trim() ? undefined : 'Bắt buộc ghi lý do'}>
            <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} />
          </FormField>
          <p className="text-xs muted">Hóa đơn kỳ cuối sẽ prorate theo số ngày còn hiệu lực. Xử lý hoàn/khấu trừ cọc ở mục Tiền cọc.</p>
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setTerminateOpen(false)}>
              Hủy
            </Button>
            <Button
              variant="danger"
              disabled={!reason.trim()}
              loading={terminate.isPending}
              onClick={() =>
                terminate.mutate(
                  { id: c.id, endDate, reason: reason.trim() },
                  {
                    onSuccess: () => {
                      toast.success('Đã chấm dứt hợp đồng.');
                      setTerminateOpen(false);
                    },
                    onError: (e) => toast.error(toApiError(e).message),
                  },
                )
              }
            >
              Xác nhận chấm dứt
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ===================================================================== Vehicles
/** VEH-01 */
export function VehiclesPage() {
  const { ws, can } = useWorkspaceContext();
  const [s, set] = useSearchState(['q'] as const);
  const { data, isLoading, error, refetch } = useVehicles(ws, s.q || undefined);
  const tenants = useTenants(ws);
  const save = useSaveVehicle(ws);
  const del = useDeleteVehicle(ws);
  const toast = useToast();
  const [editing, setEditing] = useState<Vehicle | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Vehicle | null>(null);
  const form = useForm<VehicleForm>({ resolver: zodResolver(vehicleSchema) });

  const open = (v: Vehicle | 'new') => {
    setEditing(v);
    form.reset(v === 'new' ? { tenantId: '', type: 'MOTORBIKE', plate: '', brand: '', monthlyFee: 100_000 } : { tenantId: v.tenantId, type: v.type, plate: v.plate, brand: v.brand, monthlyFee: v.monthlyFee });
  };
  const total = (data ?? []).reduce((sum, v) => sum + v.monthlyFee, 0);

  const columns: Column<Vehicle>[] = [
    { key: 'plate', header: 'Biển số', render: (v) => <strong>{v.plate}</strong> },
    { key: 'type', header: 'Loại', render: (v) => `${VEHICLE_TYPE[v.type]} • ${v.brand}` },
    {
      key: 'owner',
      header: 'Người sở hữu',
      render: (v) => (
        <>
          <p className="cell-title">{v.tenantName}</p>
          <p className="cell-sub">Phòng {v.roomCode}</p>
        </>
      ),
    },
    { key: 'fee', header: 'Phí / tháng', align: 'right', render: (v) => formatVnd(v.monthlyFee) },
    {
      key: 'act',
      header: '',
      render: (v) =>
        can('rooms.write') ? (
          <div className="row">
            <Button size="sm" variant="secondary" onClick={() => open(v)}>
              <Pencil size={14} /> Sửa
            </Button>
            <Button size="sm" variant="ghost" aria-label={`Xóa ${v.plate}`} onClick={() => setDeleting(v)}>
              <Trash2 size={14} />
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Quản lý phương tiện"
        description={`Phí gửi xe được cộng vào hóa đơn tháng. Tổng phí: ${formatVnd(total)}/tháng.`}
        actions={
          can('rooms.write') && (
            <Button variant="dark" onClick={() => open('new')}>
              <Plus size={16} aria-hidden="true" /> Thêm phương tiện
            </Button>
          )
        }
      />
      <Section flush>
        <FilterBar>
          <SearchInput value={s.q} onChange={(q) => set({ q })} placeholder="Biển số, chủ xe, phòng…" />
        </FilterBar>
        <DataTable columns={columns} rows={data} rowKey={(v) => v.id} isLoading={isLoading} error={error} onRetry={() => refetch()} empty={<EmptyState title="Chưa có phương tiện" />} />
      </Section>

      <Modal open={editing !== null} title={editing === 'new' ? 'Thêm phương tiện' : 'Sửa phương tiện'} onClose={() => setEditing(null)}>
        <form
          className="stack"
          noValidate
          onSubmit={form.handleSubmit(async (v) => {
            try {
              await save.mutateAsync({ input: vehicleSchema.parse(v) as VehicleForm & { type: VehicleType; monthlyFee: number }, id: editing && editing !== 'new' ? editing.id : undefined });
              toast.success('Đã lưu phương tiện.');
              setEditing(null);
            } catch (e) {
              const err = toApiError(e);
              if (err.isConflict) form.setError('plate', { message: err.message });
              else toast.error(err.message);
            }
          })}
        >
          <FormField label="Người sở hữu" required error={form.formState.errors.tenantId?.message}>
            <select className="select" {...form.register('tenantId')}>
              <option value="">— Chọn người thuê —</option>
              {tenants.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.fullName}
                </option>
              ))}
            </select>
          </FormField>
          <div className="form-grid form-grid--2">
            <FormField label="Loại xe" required>
              <select className="select" {...form.register('type')}>
                {(Object.keys(VEHICLE_TYPE) as VehicleType[]).map((k) => (
                  <option key={k} value={k}>
                    {VEHICLE_TYPE[k]}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Biển số" required error={form.formState.errors.plate?.message}>
              <input className="input" {...form.register('plate')} placeholder="59-X1 123.45" />
            </FormField>
            <FormField label="Hãng / dòng xe" required error={form.formState.errors.brand?.message}>
              <input className="input" {...form.register('brand')} />
            </FormField>
            <FormField label="Phí gửi / tháng" required error={form.formState.errors.monthlyFee?.message}>
              <Controller control={form.control} name="monthlyFee" render={({ field }) => <CurrencyInput value={field.value} onChange={field.onChange} />} />
            </FormField>
          </div>
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Hủy
            </Button>
            <Button type="submit" variant="dark" loading={save.isPending}>
              Lưu
            </Button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Xóa phương tiện ${deleting?.plate ?? ''}?`}
        description="Phí gửi xe sẽ không còn được cộng vào hóa đơn các kỳ sau."
        confirmLabel="Xóa"
        danger
        loading={del.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() =>
          del.mutate(deleting!.id, {
            onSuccess: () => toast.success('Đã xóa phương tiện.'),
            onError: (e) => toast.error(toApiError(e).message),
            onSettled: () => setDeleting(null),
          })
        }
      />
    </>
  );
}
