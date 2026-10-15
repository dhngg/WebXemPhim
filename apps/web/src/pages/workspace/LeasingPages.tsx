import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Archive, ArchiveRestore, Copy, Link2, Link2Off, Pencil, Plus, UserPlus } from 'lucide-react';
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
  useContractDetail,
  useContractList,
  useCreateContract,
  useCreateInvitation,
  useCreateTenant,
  useCreateVehicle,
  useDecideLinkRequest,
  useEndContract,
  usePendingLinkRequests,
  useRevokeLink,
  useStopVehicle,
  useTenantLifecycle,
  useTenantLinks,
  useTenantList,
  useTenantProfile,
  useUpdateContract,
  useUpdateTenant,
  useUpdateVehicle,
  useVehicleList,
} from '@/features/tenancy/hooks';
import { CONTRACT_PHASE, TENANT_STATUS, VEHICLE_STATUS, VEHICLE_TYPE_OPTIONS, tenancyErrorMessage, vehicleTypeLabel } from '@/features/tenancy/labels';
import { canEditContract, diffContract, diffTenant, diffVehicle, overlappingContracts, rentFormValue } from '@/features/tenancy/mappers';
import { contractSchema, tenantSchema, vehicleSchema, type ContractForm, type TenantForm, type VehicleForm } from '@/features/tenancy/schemas';
import type { ContractPhase, ManagedVehicle, TenancyContract, TenantProfile, TenantStatus } from '@/features/tenancy/types';
import { formatMoney } from '@/features/property-management/mappers';
import { useRooms } from '@/features/property-management/hooks';
import { useWorkspaceContext } from '@/hooks/useWorkspaceContext';
import { useSearchState } from '@/hooks/useSearchState';
import { useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning';
import { addDays, inclusiveDays, todayVN } from '@/lib/dates';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { toApiError } from '@/services/http/ApiError';
import { ForbiddenPage } from '@/pages/system/ErrorPages';

/** Chỉ OWNER ghi dữ liệu, và workspace chưa lưu trữ. */
function useCanWrite() {
  const { can, membership } = useWorkspaceContext();
  return can('rooms.write') && membership.status !== 'ARCHIVED';
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();
const matches = (haystack: string, q?: string) => !q?.trim() || fold(haystack).includes(fold(q.trim()));

// ===================================================================== Tenants
/** TEN-01 */
export function TenantsPage() {
  const { ws, base } = useWorkspaceContext();
  const writable = useCanWrite();
  const [s, set] = useSearchState(['q', 'status'] as const);
  const navigate = useNavigate();
  const status = (s.status || undefined) as TenantStatus | undefined;
  const { data, isLoading, error, refetch } = useTenantList(ws, status);
  const contracts = useContractList(ws, 'ACTIVE');
  // Chỉ hợp đồng đã bắt đầu mới là "đang ở"; hợp đồng tương lai chỉ giữ chỗ.
  const roomOf = (t: TenantProfile) => contracts.data?.find((c) => c.tenantId === t.id && (c.phase === 'IN_EFFECT' || c.phase === 'OVERDUE'));
  const upcomingOf = (t: TenantProfile) => contracts.data?.find((c) => c.tenantId === t.id && c.phase === 'UPCOMING');
  const rows = useMemo(() => data?.filter((t) => matches(`${t.fullName} ${t.phone ?? ''} ${t.email ?? ''}`, s.q)), [data, s.q]);

  const columns: Column<TenantProfile>[] = [
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
    { key: 'phone', header: 'Điện thoại', render: (t) => t.phone ?? '—' },
    {
      key: 'room',
      header: 'Phòng đang ở',
      render: (t) => {
        const c = roomOf(t);
        if (c) return `${c.roomCode}${c.buildingName ? ` (${c.buildingName})` : ''}`;
        const next = upcomingOf(t);
        return next ? <span className="muted">Sắp vào: {next.roomCode} từ {formatDate(next.startDate)}</span> : <span className="muted">—</span>;
      },
    },
    { key: 'status', header: 'Trạng thái', render: (t) => <StatusBadge status={t.status} map={TENANT_STATUS} /> },
  ];

  return (
    <>
      <PageHeader
        title="Người thuê"
        description="Hồ sơ người thuê do chủ trọ tạo. Liên kết tài khoản chỉ qua yêu cầu của người thuê và do chủ trọ duyệt — không tự liên kết theo số điện thoại."
        actions={
          writable && (
            <ButtonLink to={`${base}/tenants/new`} variant="dark">
              <UserPlus size={16} aria-hidden="true" /> Thêm người thuê
            </ButtonLink>
          )
        }
      />
      <Section flush>
        <FilterBar>
          <SearchInput value={s.q} onChange={(q) => set({ q })} placeholder="Tìm tên, SĐT, email…" />
          <Select aria-label="Trạng thái hồ sơ" value={s.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">Mọi trạng thái</option>
            {(Object.keys(TENANT_STATUS) as TenantStatus[]).map((k) => (
              <option key={k} value={k}>
                {TENANT_STATUS[k].label}
              </option>
            ))}
          </Select>
        </FilterBar>
        <DataTable
          columns={columns}
          rows={rows}
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

const blankTenant: TenantForm = { fullName: '', phone: '', email: '', dateOfBirth: '', address: '', notes: '' };

/** TEN-02 (+ sửa hồ sơ) */
export function TenantFormPage() {
  const { ws, base } = useWorkspaceContext();
  const writable = useCanWrite();
  const { tenantId } = useParams();
  const isEdit = Boolean(tenantId);
  const existing = useTenantProfile(ws, tenantId);
  const create = useCreateTenant(ws);
  const update = useUpdateTenant(ws, tenantId ?? '');
  const navigate = useNavigate();
  const toast = useToast();
  const t = existing.data;
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isDirty, isSubmitSuccessful },
  } = useForm<TenantForm>({
    resolver: zodResolver(tenantSchema),
    values: t
      ? { fullName: t.fullName, phone: t.phone ?? '', email: t.email ?? '', dateOfBirth: t.dateOfBirth ?? '', address: t.address ?? '', notes: t.notes ?? '' }
      : blankTenant,
  });
  const unsaved = useUnsavedChangesWarning(isDirty && !isSubmitSuccessful);

  if (!writable) return <ForbiddenPage />;
  if (isEdit && existing.isLoading) return <LoadingBlock />;
  if (isEdit && existing.error) return <ErrorState error={existing.error} onRetry={() => existing.refetch()} />;
  if (t?.status === 'ARCHIVED')
    return <ErrorState error={{ status: 409, message: tenancyErrorMessage(toApiError({ statusCode: 409, code: 'TENANT_ARCHIVED', message: '' })) }} onRetry={() => navigate(`${base}/tenants/${t.id}`)} />;

  const onSubmit = handleSubmit(async (values) => {
    try {
      let savedId = tenantId ?? '';
      if (t) {
        const patch = diffTenant(t, values);
        if (Object.keys(patch).length === 0) {
          toast.success('Không có thay đổi để lưu.');
          unsaved.markSaved();
      return navigate(`${base}/tenants/${t.id}`);
        }
        await update.mutateAsync(patch);
        toast.success('Đã cập nhật hồ sơ.');
      } else {
        savedId = (await create.mutateAsync(values)).id;
        toast.success('Đã tạo hồ sơ người thuê.');
      }
      unsaved.markSaved();
      navigate(`${base}/tenants/${savedId}`);
    } catch (e) {
      const err = toApiError(e);
      Object.entries(err.fieldErrors ?? {}).forEach(([f, m]) => {
        const field = f === 'notes' || f === 'address' || f === 'email' || f === 'phone' || f === 'dateOfBirth' || f === 'fullName' ? f : null;
        if (field) setError(field, { message: m });
      });
      toast.error(tenancyErrorMessage(e));
    }
  });

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Người thuê', to: `${base}/tenants` }, { label: isEdit ? t?.fullName ?? '' : 'Thêm mới' }]}
        title={isEdit ? 'Sửa hồ sơ người thuê' : 'Tạo hồ sơ người thuê'}
      />
      <form onSubmit={onSubmit} noValidate>
        <Section title="Thông tin liên hệ">
          <p className="alert alert--info" style={{ marginBottom: 'var(--space-4)' }}>
            Hồ sơ này KHÔNG tự liên kết với tài khoản người dùng, kể cả khi trùng số điện thoại. Người thuê tự gửi yêu cầu liên kết, sau đó bạn duyệt.
          </p>
          <div className="form-grid form-grid--2">
            <FormField label="Họ và tên" required error={errors.fullName?.message}>
              <input className="input" maxLength={150} {...register('fullName')} />
            </FormField>
            <FormField label="Số điện thoại" error={errors.phone?.message}>
              <input className="input" type="tel" {...register('phone')} />
            </FormField>
            <FormField label="Email" error={errors.email?.message}>
              <input className="input" type="email" {...register('email')} />
            </FormField>
            <FormField label="Ngày sinh" error={errors.dateOfBirth?.message}>
              <DatePicker max={todayVN()} {...register('dateOfBirth')} />
            </FormField>
            <FormField label="Địa chỉ" error={errors.address?.message}>
              <input className="input" maxLength={500} {...register('address')} />
            </FormField>
          </div>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <FormField label="Ghi chú" error={errors.notes?.message}>
              <textarea className="textarea" {...register('notes')} />
            </FormField>
          </div>
          <div className="form-actions">
            <ButtonLink to={isEdit ? `${base}/tenants/${tenantId}` : `${base}/tenants`} variant="secondary">
              Hủy
            </ButtonLink>
            <Button type="submit" variant="dark" loading={create.isPending || update.isPending}>
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
  const { ws, base } = useWorkspaceContext();
  const writable = useCanWrite();
  const { tenantId } = useParams();
  const tenant = useTenantProfile(ws, tenantId);
  const contracts = useContractList(ws);
  const vehicles = useVehicleList(ws);
  const pending = usePendingLinkRequests(ws);
  const decide = useDecideLinkRequest(ws);
  const links = useTenantLinks(ws, tenantId);
  const revoke = useRevokeLink(ws);
  const invite = useCreateInvitation(ws);
  const lifecycle = useTenantLifecycle(ws);
  const toast = useToast();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [decisionNote, setDecisionNote] = useState('');
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');
  // Token chỉ giữ trong bộ nhớ của hộp thoại này; đóng hộp thoại là mất, không ghi log hay lưu lại.
  const [invitation, setInvitation] = useState<{ token: string; expiresAt: string } | null>(null);

  if (tenant.isLoading) return <LoadingBlock lines={6} />;
  if (tenant.error || !tenant.data) return <ErrorState error={tenant.error} onRetry={() => tenant.refetch()} />;
  const t = tenant.data;
  const archived = t.status === 'ARCHIVED';
  const myContracts = contracts.data?.filter((c) => c.tenantId === t.id);
  const myVehicles = vehicles.data?.filter((v) => v.tenantId === t.id && v.status === 'ACTIVE') ?? [];
  const myRequests = pending.data?.filter((r) => r.tenantId === t.id) ?? [];

  const activeLink = links.data?.[0];
  const closeInvitation = () => {
    setInvitation(null);
    invite.reset();
  };
  const copyToken = async () => {
    if (!invitation) return;
    try {
      await navigator.clipboard.writeText(invitation.token);
      toast.success('Đã sao chép mã mời.');
    } catch {
      toast.error('Không sao chép được. Hãy chọn mã và sao chép thủ công.');
    }
  };

  const review = (id: string, approve: boolean) =>
    decide.mutate(
      { id, approve, note: decisionNote.trim() || undefined },
      {
        onSuccess: () => {
          setDecisionNote('');
          toast.success(approve ? 'Đã duyệt liên kết tài khoản.' : 'Đã từ chối yêu cầu liên kết.');
        },
        onError: (e) => toast.error(tenancyErrorMessage(e)),
      },
    );

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Người thuê', to: `${base}/tenants` }, { label: t.fullName }]}
        title={t.fullName}
        description={[t.phone, t.email].filter(Boolean).join(' • ') || undefined}
        eyebrow={<div style={{ marginBottom: 'var(--space-2)' }}><StatusBadge status={t.status} map={TENANT_STATUS} /></div>}
        actions={
          writable && (
            <>
              {archived ? (
                <Button
                  variant="secondary"
                  loading={lifecycle.isPending}
                  onClick={() =>
                    lifecycle.mutate(
                      { id: t.id, archive: false },
                      { onSuccess: () => toast.success('Đã khôi phục hồ sơ.'), onError: (e) => toast.error(tenancyErrorMessage(e)) },
                    )
                  }
                >
                  <ArchiveRestore size={16} aria-hidden="true" /> Khôi phục
                </Button>
              ) : (
                <>
                  <ButtonLink to={`${base}/tenants/${t.id}/edit`} variant="secondary">
                    <Pencil size={16} aria-hidden="true" /> Sửa hồ sơ
                  </ButtonLink>
                  <Button variant="secondary" onClick={() => setConfirmArchive(true)}>
                    <Archive size={16} aria-hidden="true" /> Lưu trữ
                  </Button>
                  <ButtonLink to={`${base}/contracts/new?tenantId=${t.id}`} variant="dark">
                    <Plus size={16} aria-hidden="true" /> Tạo hợp đồng
                  </ButtonLink>
                </>
              )}
            </>
          )
        }
      />
      {archived && (
        <p className="alert alert--info" style={{ marginBottom: 'var(--space-4)' }}>
          Hồ sơ đã lưu trữ: chỉ xem được. Khôi phục để chỉnh sửa hoặc tạo hợp đồng mới.
        </p>
      )}
      {myRequests.map((r) => (
        <div key={r.id} className="alert alert--warning" style={{ marginBottom: 'var(--space-4)', alignItems: 'center', flexWrap: 'wrap' }}>
          <AlertTriangle size={18} aria-hidden="true" />
          <span style={{ flex: 1 }}>
            Tài khoản <strong>{r.requesterEmail}</strong> yêu cầu liên kết với hồ sơ này
            {r.message ? ` — “${r.message}”` : ''}. Hệ thống không tự xác minh theo email hay số điện thoại; hãy kiểm tra trước khi duyệt.
          </span>
          {writable && (
            <input
              className="input"
              style={{ flexBasis: '100%' }}
              aria-label="Ghi chú quyết định"
              placeholder="Ghi chú cho quyết định (tùy chọn)"
              maxLength={500}
              value={decisionNote}
              onChange={(e) => setDecisionNote(e.target.value)}
            />
          )}
          {writable && (
            <div className="row">
              <Button size="sm" variant="secondary" onClick={() => review(r.id, false)} disabled={decide.isPending}>
                Từ chối
              </Button>
              <Button size="sm" variant="dark" onClick={() => review(r.id, true)} loading={decide.isPending}>
                Duyệt liên kết
              </Button>
            </div>
          )}
        </div>
      ))}
      <div className="grid grid--main-side">
        <div className="stack">
          <Section title="Liên kết tài khoản">
            {links.isLoading ? (
              <LoadingBlock lines={2} />
            ) : links.error ? (
              <ErrorState error={links.error} onRetry={() => links.refetch()} />
            ) : activeLink ? (
              <div className="stack">
                <p className="row">
                  <Link2 size={16} aria-hidden="true" /> Đã liên kết với <strong>{activeLink.userName ?? activeLink.userEmail}</strong>
                  {activeLink.userName ? ` (${activeLink.userEmail})` : ''}
                </p>
                <p className="text-xs muted">Từ {formatDateTime(activeLink.linkedAt)}. Thu hồi sẽ ngắt quyền truy cập hồ sơ thuê của tài khoản này; lịch sử liên kết vẫn được giữ.</p>
                {writable && (
                  <div>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setRevokeReason('');
                        setRevokeOpen(true);
                      }}
                    >
                      <Link2Off size={16} aria-hidden="true" /> Thu hồi liên kết
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="stack">
                <p className="text-sm muted">Hồ sơ chưa liên kết với tài khoản nào. Tạo lời mời và gửi mã cho người thuê tự nhập sau khi đăng nhập.</p>
                {writable && !archived && (
                  <div>
                    <Button
                      variant="secondary"
                      loading={invite.isPending}
                      onClick={() =>
                        invite.mutate(t.id, {
                          onSuccess: (inv) => setInvitation(inv),
                          onError: (e) => toast.error(tenancyErrorMessage(e)),
                        })
                      }
                    >
                      <Link2 size={16} aria-hidden="true" /> Tạo lời mời liên kết
                    </Button>
                  </div>
                )}
              </div>
            )}
          </Section>
          <Section title="Hợp đồng" flush>
            <DataTable
              rows={myContracts}
              rowKey={(c) => c.id}
              isLoading={contracts.isLoading}
              error={contracts.error}
              empty={<EmptyState title="Chưa có hợp đồng" />}
              columns={[
                { key: 'room', header: 'Phòng', render: (c) => <Link to={`${base}/contracts/${c.id}`}>{`${c.roomCode}${c.buildingName ? ` (${c.buildingName})` : ''}`}</Link> },
                { key: 'term', header: 'Thời hạn', render: (c) => `${formatDate(c.startDate)} – ${formatDate(c.endDate)}` },
                { key: 'st', header: 'Trạng thái', render: (c) => <StatusBadge status={c.phase} map={CONTRACT_PHASE} /> },
              ]}
            />
          </Section>
          <Section title="Phương tiện" actions={<Link to={`${base}/vehicles`} className="text-sm">Quản lý phương tiện →</Link>}>
            {myVehicles.length ? (
              <ul className="list-plain stack" style={{ gap: 'var(--space-2)' }}>
                {myVehicles.map((v) => (
                  <li key={v.id}>
                    <strong>{v.licensePlate}</strong> — {vehicleTypeLabel(v.vehicleType)} {v.brand ?? ''}
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
              { label: 'Ngày sinh', value: t.dateOfBirth ? formatDate(t.dateOfBirth) : '—' },
              { label: 'Địa chỉ', value: t.address ?? '—' },
              { label: 'Ngày tạo hồ sơ', value: formatDate(t.createdAt) },
              { label: 'Ghi chú', value: t.notes ?? '—' },
            ]}
          />
        </Section>
      </div>
      <Modal open={Boolean(invitation)} title="Lời mời liên kết tài khoản" onClose={closeInvitation}>
        <div className="stack">
          <p className="alert alert--warning">Mã này chỉ hiển thị MỘT LẦN. Hãy sao chép và gửi cho người thuê ngay; đóng hộp thoại là không xem lại được.</p>
          <FormField label="Mã mời" hint={invitation ? `Hết hạn lúc ${formatDateTime(invitation.expiresAt)} (7 ngày). Dùng được một lần.` : undefined}>
            <input className="input" readOnly value={invitation?.token ?? ''} onFocus={(e) => e.currentTarget.select()} />
          </FormField>
          <p className="text-xs muted">Hệ thống không gửi email hay SMS. Người thuê đăng nhập tài khoản của mình rồi nhập mã này để liên kết.</p>
          <div className="form-actions">
            <Button variant="secondary" onClick={copyToken}>
              <Copy size={16} aria-hidden="true" /> Sao chép
            </Button>
            <Button variant="dark" onClick={closeInvitation}>
              Đã gửi, đóng
            </Button>
          </div>
        </div>
      </Modal>
      <Modal open={revokeOpen} title="Thu hồi liên kết tài khoản?" onClose={() => setRevokeOpen(false)}>
        <div className="stack">
          <p className="text-sm">
            Tài khoản {activeLink?.userEmail} sẽ không còn truy cập hồ sơ thuê của {t.fullName}. Hồ sơ, hợp đồng và lịch sử liên kết vẫn được giữ.
          </p>
          <FormField label="Lý do (tùy chọn)" error={revokeReason.length > 500 ? 'Lý do tối đa 500 ký tự' : undefined}>
            <textarea className="textarea" maxLength={500} value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} />
          </FormField>
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setRevokeOpen(false)}>
              Hủy
            </Button>
            <Button
              variant="danger"
              loading={revoke.isPending}
              onClick={() =>
                revoke.mutate(
                  { id: activeLink!.id, reason: revokeReason.trim() || undefined },
                  {
                    onSuccess: () => {
                      toast.success('Đã thu hồi liên kết.');
                      setRevokeOpen(false);
                    },
                    onError: (e) => toast.error(tenancyErrorMessage(e)),
                  },
                )
              }
            >
              Thu hồi
            </Button>
          </div>
        </div>
      </Modal>
      <ConfirmDialog
        open={confirmArchive}
        title="Lưu trữ hồ sơ người thuê?"
        description="Hồ sơ vẫn được giữ trong lịch sử nhưng không thể sửa hay tạo hợp đồng mới cho tới khi khôi phục. Hệ thống từ chối nếu người thuê còn hợp đồng đang hiệu lực."
        confirmLabel="Lưu trữ"
        loading={lifecycle.isPending}
        onCancel={() => setConfirmArchive(false)}
        onConfirm={() =>
          lifecycle.mutate(
            { id: t.id, archive: true },
            {
              onSuccess: () => toast.success('Đã lưu trữ hồ sơ.'),
              onError: (e) => toast.error(tenancyErrorMessage(e)),
              onSettled: () => setConfirmArchive(false),
            },
          )
        }
      />
    </>
  );
}

// ===================================================================== Contracts
const roomLine = (c: Pick<TenancyContract, 'roomCode' | 'buildingName'>) => `${c.roomCode}${c.buildingName ? ` • ${c.buildingName}` : ''}`;

/** CTR-01 */
export function ContractsPage() {
  const { ws, base } = useWorkspaceContext();
  const writable = useCanWrite();
  const [s, set] = useSearchState(['q', 'status'] as const);
  const navigate = useNavigate();
  const phase = (s.status || undefined) as ContractPhase | undefined;
  const { data, isLoading, error, refetch } = useContractList(ws);
  const rows = useMemo(
    () => data?.filter((c) => (!phase || c.phase === phase) && matches(`${c.roomCode} ${c.buildingName ?? ''} ${c.tenantName}`, s.q)),
    [data, phase, s.q],
  );
  const today = todayVN();

  const columns: Column<TenancyContract>[] = [
    {
      key: 'room',
      header: 'Hợp đồng',
      render: (c) => (
        <>
          <Link to={`${base}/contracts/${c.id}`} className="cell-title">
            Phòng {c.roomCode}
          </Link>
          <p className="cell-sub">{c.buildingName ?? '—'}</p>
        </>
      ),
    },
    { key: 'tenant', header: 'Người thuê', render: (c) => c.tenantName },
    {
      key: 'term',
      header: 'Thời hạn',
      render: (c) => {
        const left = inclusiveDays(today, c.endDate) - 1;
        const untilStart = inclusiveDays(today, c.startDate) - 1;
        return (
          <>
            <p className="text-sm">
              {formatDate(c.startDate)} – {formatDate(c.endDate)}
            </p>
            {c.phase === 'UPCOMING' && <Badge tone="info">Bắt đầu sau {untilStart} ngày</Badge>}
            {c.phase === 'IN_EFFECT' && left <= 30 && left >= 0 && <Badge tone="warning">Còn {left} ngày</Badge>}
          </>
        );
      },
    },
    { key: 'rent', header: 'Tiền thuê', align: 'right', render: (c) => formatMoney(c.monthlyRent) },
    { key: 'st', header: 'Trạng thái', render: (c) => <StatusBadge status={c.phase} map={CONTRACT_PHASE} /> },
  ];

  return (
    <>
      <PageHeader
        title="Hợp đồng"
        description="Hiệu lực tính theo ngày bắt đầu và kết thúc (giờ Việt Nam, tính bao gồm hai đầu); hợp đồng quá hạn không tự đóng, chủ nhà kết thúc thủ công."
        actions={
          writable && (
            <ButtonLink to={`${base}/contracts/new`} variant="dark">
              <Plus size={16} aria-hidden="true" /> Tạo hợp đồng
            </ButtonLink>
          )
        }
      />
      <Section flush>
        <FilterBar>
          <SearchInput value={s.q} onChange={(q) => set({ q })} placeholder="Phòng, tòa nhà, người thuê…" />
          <Select aria-label="Trạng thái" value={s.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">Mọi trạng thái</option>
            {(Object.keys(CONTRACT_PHASE) as ContractPhase[]).map((k) => (
              <option key={k} value={k}>
                {CONTRACT_PHASE[k].label}
              </option>
            ))}
          </Select>
        </FilterBar>
        <DataTable
          columns={columns}
          rows={rows}
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

/** CTR-02 / CTR-04 — tạo hợp đồng (có thể bắt đầu trong tương lai); chỉ sửa được hợp đồng chưa kết thúc. */
export function ContractFormPage() {
  const { ws, base } = useWorkspaceContext();
  const writable = useCanWrite();
  const { contractId } = useParams();
  const [qs] = useSearchState(['roomId', 'tenantId'] as const);
  const isEdit = Boolean(contractId);
  const existing = useContractDetail(ws, contractId);
  const rooms = useRooms(ws, {});
  const tenants = useTenantList(ws, 'ACTIVE');
  const allContracts = useContractList(ws, 'ACTIVE');
  const create = useCreateContract(ws);
  const update = useUpdateContract(ws, contractId ?? '');
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
      ? { roomId: c.roomId, tenantId: c.tenantId, startDate: c.startDate, endDate: c.endDate, monthlyRent: rentFormValue(c.monthlyRent), notes: c.notes ?? '' }
      : {
          roomId: qs.roomId,
          tenantId: qs.tenantId,
          startDate: today,
          endDate: addDays(addDays(today, 365), -1),
          monthlyRent: undefined as unknown as number,
          notes: '',
        },
  });
  const unsaved = useUnsavedChangesWarning(isDirty && !isSubmitSuccessful);

  const [roomId, startDate, endDate] = useWatch({ control, name: ['roomId', 'startDate', 'endDate'] });
  const overlaps = useMemo(
    () => (roomId && startDate && endDate && allContracts.data ? overlappingContracts(allContracts.data, { id: contractId, roomId, startDate, endDate }) : []),
    [allContracts.data, roomId, startDate, endDate, contractId],
  );
  // Phòng đang thuê vẫn chọn được để ký hợp đồng nối tiếp; backend từ chối nếu kỳ thuê giao nhau.
  const rentableRooms = rooms.data
    ?.filter((r) => r.status === 'VACANT' || r.status === 'OCCUPIED')
    .sort((a, b) => Number(a.status === 'OCCUPIED') - Number(b.status === 'OCCUPIED')); // phòng trống lên trước

  if (!writable) return <ForbiddenPage />;
  if (isEdit && existing.isLoading) return <LoadingBlock />;
  if (isEdit && existing.error) return <ErrorState error={existing.error} onRetry={() => existing.refetch()} />;
  if (c && !canEditContract(c))
    return <ErrorState error={{ status: 409, message: c.phase === 'OVERDUE' ? 'Hợp đồng đã quá hạn nên không sửa được; hãy kết thúc hợp đồng.' : 'Chỉ sửa được hợp đồng chưa kết thúc.' }} onRetry={() => navigate(`${base}/contracts/${c.id}`)} />;

  const onSubmit = handleSubmit(async (values) => {
    const v = contractSchema.parse(values);
    try {
      let savedId = contractId ?? '';
      if (c) {
        const patch = diffContract(c, { startDate: v.startDate, endDate: v.endDate, monthlyRent: String(v.monthlyRent), notes: v.notes });
        if (Object.keys(patch).length === 0) {
          toast.success('Không có thay đổi để lưu.');
          unsaved.markSaved();
      return navigate(`${base}/contracts/${c.id}`);
        }
        await update.mutateAsync(patch);
        toast.success('Đã cập nhật hợp đồng.');
      } else {
        savedId = (await create.mutateAsync({ roomId: v.roomId, tenantId: v.tenantId, startDate: v.startDate, endDate: v.endDate, monthlyRent: String(v.monthlyRent), notes: v.notes })).id;
        toast.success(
          v.startDate > today
            ? `Đã tạo hợp đồng. Phòng được giữ cho kỳ thuê từ ${formatDate(v.startDate)}, chưa chuyển sang Đang thuê.`
            : 'Đã tạo hợp đồng. Phòng chuyển sang Đang thuê.',
        );
      }
      unsaved.markSaved();
      navigate(`${base}/contracts/${savedId}`);
    } catch (e) {
      const err = toApiError(e);
      Object.entries(err.fieldErrors ?? {}).forEach(([f, m]) => {
        if (f in v) setError(f as keyof ContractForm, { message: m });
      });
      toast.error(tenancyErrorMessage(e));
    }
  });

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Hợp đồng', to: `${base}/contracts` }, { label: isEdit ? (c ? `Phòng ${c.roomCode}` : '') : 'Tạo mới' }]}
        title={isEdit ? 'Sửa hợp đồng' : 'Tạo hợp đồng'}
        description={
          isEdit
            ? 'Phòng và người thuê không đổi được sau khi tạo.'
            : 'Ngày bắt đầu có thể ở tương lai: phòng chỉ được giữ cho kỳ thuê đã đăng ký và chỉ chuyển sang Đang thuê từ ngày bắt đầu. Kỳ thuê không được giao nhau với hợp đồng khác của phòng.'
        }
      />
      <form onSubmit={onSubmit} noValidate className="stack">
        <Section title="Phòng & người thuê">
          <div className="form-grid form-grid--2">
            <FormField label="Phòng" required error={errors.roomId?.message}>
              {isEdit ? (
                <input className="input" value={c ? roomLine(c) : ''} disabled readOnly />
              ) : (
                <select
                  className="select"
                  {...register('roomId', {
                    onChange: (e) => {
                      const r = rooms.data?.find((x) => x.id === e.target.value);
                      const rent = r ? Number(r.monthlyRent) : NaN;
                      if (Number.isInteger(rent)) setValue('monthlyRent', rent, { shouldDirty: true });
                    },
                  })}
                >
                  <option value="">— Chọn phòng —</option>
                  {rentableRooms?.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.buildingName} • {r.code}
                      {r.status === 'OCCUPIED' ? ' (đang thuê – chỉ ký nối tiếp)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
            <FormField label="Người thuê" required error={errors.tenantId?.message} hint={isEdit ? undefined : <Link to={`${base}/tenants/new`}>+ Tạo hồ sơ người thuê mới</Link>}>
              {isEdit ? (
                <input className="input" value={c?.tenantName ?? ''} disabled readOnly />
              ) : (
                <select className="select" {...register('tenantId')}>
                  <option value="">— Chọn người thuê —</option>
                  {tenants.data?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.fullName}
                      {t.phone ? ` – ${t.phone}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          </div>
        </Section>
        <Section title="Thời hạn & chi phí">
          <div className="form-grid form-grid--2">
            <FormField label="Ngày bắt đầu" required error={errors.startDate?.message}>
              <DatePicker max={isEdit && c && c.startDate <= today ? today : undefined} {...register('startDate')} />
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
              <Controller
                control={control}
                name="monthlyRent"
                render={({ field }) =>
                  typeof field.value === 'string' ? (
                    // Hợp đồng có tiền lẻ (vd 3500000.50): giữ nguyên chuỗi thập phân, không ép sang số.
                    <input className="input" inputMode="decimal" value={field.value} onChange={(e) => field.onChange(e.target.value)} onBlur={field.onBlur} />
                  ) : (
                    <CurrencyInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
                  )
                }
              />
            </FormField>
          </div>
          {overlaps.length > 0 && (
            <div className="alert alert--warning" role="alert" style={{ marginTop: 'var(--space-4)' }}>
              <AlertTriangle size={18} aria-hidden="true" />
              <div>
                <strong>Cảnh báo trùng lịch:</strong> phòng đã có hợp đồng chưa kết thúc trùng thời gian thuê:{' '}
                {overlaps.map((o) => `${formatDate(o.startDate)} – ${formatDate(o.endDate)}`).join(', ')}. Hệ thống sẽ từ chối khi lưu.
              </div>
            </div>
          )}
          <div style={{ marginTop: 'var(--space-4)' }}>
            <FormField label="Ghi chú / điều khoản thêm" error={errors.notes?.message}>
              <textarea className="textarea" {...register('notes')} />
            </FormField>
          </div>
          <div className="form-actions">
            <ButtonLink to={isEdit ? `${base}/contracts/${contractId}` : `${base}/contracts`} variant="secondary">
              Hủy
            </ButtonLink>
            <Button type="submit" variant="dark" loading={create.isPending || update.isPending}>
              {isEdit ? 'Lưu thay đổi' : 'Tạo hợp đồng'}
            </Button>
          </div>
        </Section>
      </form>
    </>
  );
}

/** CTR-03 */
export function ContractDetailPage() {
  const { ws, base } = useWorkspaceContext();
  const writable = useCanWrite();
  const { contractId } = useParams();
  const contract = useContractDetail(ws, contractId);
  const end = useEndContract(ws);
  const toast = useToast();
  const [endOpen, setEndOpen] = useState(false);
  const [endDate, setEndDate] = useState(todayVN());

  if (contract.isLoading) return <LoadingBlock lines={6} />;
  if (contract.error || !contract.data) return <ErrorState error={contract.error} onRetry={() => contract.refetch()} />;
  const c = contract.data;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Hợp đồng', to: `${base}/contracts` }, { label: `Phòng ${c.roomCode}` }]}
        title={`Hợp đồng phòng ${c.roomCode}`}
        description={`${c.buildingName ?? ''}${c.buildingName ? ' • ' : ''}Người thuê: ${c.tenantName}`}
        eyebrow={<div style={{ marginBottom: 'var(--space-2)' }}><StatusBadge status={c.phase} map={CONTRACT_PHASE} /></div>}
        actions={
          writable &&
          c.status === 'ACTIVE' && (
            <>
              {canEditContract(c) && (
                <ButtonLink to={`${base}/contracts/${c.id}/edit`} variant="secondary">
                  <Pencil size={16} aria-hidden="true" /> Sửa hợp đồng
                </ButtonLink>
              )}
              {c.phase === 'UPCOMING' ? (
                <Button variant="secondary" onClick={() => setEndOpen(true)}>
                  Hủy hợp đồng
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => setEndOpen(true)}>
                  Kết thúc hợp đồng
                </Button>
              )}
            </>
          )
        }
      />
      {c.phase === 'UPCOMING' && (
        <div className="alert alert--info" role="status">
          Hợp đồng chưa có hiệu lực: bắt đầu từ {formatDate(c.startDate)}. Phòng được giữ cho kỳ thuê này nhưng chỉ chuyển sang Đang thuê từ ngày bắt đầu; hóa đơn không tính cho thời gian trước ngày đó. Có thể ghi nhận tiền cọc trước.
        </div>
      )}
      {c.phase === 'OVERDUE' && (
        <div className="alert alert--warning" role="status">
          Đã quá ngày kết thúc {formatDate(c.endDate)} nhưng hợp đồng chưa được kết thúc. Hệ thống không tự đóng hợp đồng; hãy kết thúc thủ công khi người thuê trả phòng.
        </div>
      )}
      {c.phase === 'CANCELLED' && (
        <div className="alert alert--info" role="status">
          Hợp đồng đã được hủy trước ngày bắt đầu{c.endedAt ? ` (${formatDateTime(c.endedAt)})` : ''}. Kỳ thuê đã đăng ký {formatDate(c.startDate)} – {formatDate(c.endDate)} được giữ làm lịch sử, không phát sinh hiệu lực hay hóa đơn.
        </div>
      )}
      <div className="grid grid--main-side">
        <div className="stack">
          <Section title="Kỳ hạn & chi phí">
            <KeyValueList
              items={[
                { label: 'Phòng', value: <Link to={`${base}/rooms/${c.roomId}`}>{roomLine(c)}</Link> },
                { label: 'Thời hạn', value: `${formatDate(c.startDate)} – ${formatDate(c.endDate)} (${formatNumber(inclusiveDays(c.startDate, c.endDate))} ngày, tính bao gồm)` },
                { label: 'Tiền thuê', value: `${formatMoney(c.monthlyRent)}/tháng` },
                ...(c.endedAt ? [{ label: c.phase === 'CANCELLED' ? 'Hủy lúc' : 'Kết thúc lúc', value: formatDateTime(c.endedAt) }] : []),
                { label: 'Ghi chú', value: c.notes ?? '—' },
              ]}
            />
          </Section>
          <Section title="Người thuê">
            <Link to={`${base}/tenants/${c.tenantId}`}>{c.tenantName}</Link>
          </Section>
        </div>
        <Section title="Hóa đơn & tiền cọc">
          <p className="text-sm muted">Hóa đơn và tiền cọc của hợp đồng sẽ hiển thị khi tích hợp thanh toán.</p>
        </Section>
      </div>

      <Modal open={endOpen} title={c.phase === 'UPCOMING' ? 'Hủy hợp đồng chưa bắt đầu' : 'Kết thúc hợp đồng'} onClose={() => setEndOpen(false)}>
        <div className="stack">
          {c.phase === 'UPCOMING' ? (
            <p className="text-sm">
              Hợp đồng chuyển sang Đã kết thúc (hủy trước ngày bắt đầu). Kỳ thuê đã đăng ký được giữ làm lịch sử và phòng được giải phóng cho kỳ này. Tiền cọc đã ghi nhận KHÔNG tự động hoàn; hoàn/khấu trừ xử lý ở mục Tiền cọc.
            </p>
          ) : (
            <>
              <FormField label="Ngày kết thúc thực tế (tính bao gồm)" required hint="Từ ngày bắt đầu hợp đồng đến hôm nay.">
                <DatePicker value={endDate} min={c.startDate} max={todayVN()} onChange={(e) => setEndDate(e.target.value)} />
              </FormField>
              <p className="text-xs muted">Phòng trở về Trống nếu không còn hợp đồng nào khác đang có hiệu lực. Việc hoàn/khấu trừ cọc xử lý ở mục Tiền cọc.</p>
            </>
          )}
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setEndOpen(false)}>
              Hủy
            </Button>
            <Button
              variant="danger"
              disabled={c.phase !== 'UPCOMING' && !endDate}
              loading={end.isPending}
              onClick={() =>
                end.mutate(
                  { id: c.id, endDate: c.phase === 'UPCOMING' ? undefined : endDate },
                  {
                    onSuccess: () => {
                      toast.success(c.phase === 'UPCOMING' ? 'Đã hủy hợp đồng chưa bắt đầu.' : 'Đã kết thúc hợp đồng.');
                      setEndOpen(false);
                    },
                    onError: (e) => toast.error(tenancyErrorMessage(e)),
                  },
                )
              }
            >
              {c.phase === 'UPCOMING' ? 'Xác nhận hủy' : 'Xác nhận kết thúc'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ===================================================================== Vehicles
const blankVehicle: VehicleForm = { tenantId: '', vehicleType: 'MOTORBIKE', licensePlate: '', brand: '', model: '', color: '', notes: '' };

/** VEH-01 */
export function VehiclesPage() {
  const { ws } = useWorkspaceContext();
  const writable = useCanWrite();
  const [s, set] = useSearchState(['q', 'status'] as const);
  const { data, isLoading, error, refetch } = useVehicleList(ws, (s.status || undefined) as 'ACTIVE' | 'INACTIVE' | undefined);
  const tenants = useTenantList(ws, 'ACTIVE');
  const create = useCreateVehicle(ws);
  const update = useUpdateVehicle(ws);
  const stop = useStopVehicle(ws);
  const toast = useToast();
  const [editing, setEditing] = useState<ManagedVehicle | 'new' | null>(null);
  const [stopping, setStopping] = useState<ManagedVehicle | null>(null);
  const [stopReason, setStopReason] = useState('');
  const form = useForm<VehicleForm>({ resolver: zodResolver(vehicleSchema), defaultValues: blankVehicle });
  const rows = useMemo(() => data?.filter((v) => matches(`${v.licensePlate} ${v.tenantName} ${v.brand ?? ''}`, s.q)), [data, s.q]);

  const open = (v: ManagedVehicle | 'new') => {
    setEditing(v);
    form.reset(
      v === 'new'
        ? blankVehicle
        : { tenantId: v.tenantId, vehicleType: v.vehicleType, licensePlate: v.licensePlate, brand: v.brand ?? '', model: v.model ?? '', color: v.color ?? '', notes: v.notes ?? '' },
    );
  };
  const editingVehicle = editing && editing !== 'new' ? editing : null;
  const typeOptions = { ...VEHICLE_TYPE_OPTIONS, ...(editingVehicle && !(editingVehicle.vehicleType in VEHICLE_TYPE_OPTIONS) ? { [editingVehicle.vehicleType]: editingVehicle.vehicleType } : {}) };

  const columns: Column<ManagedVehicle>[] = [
    { key: 'plate', header: 'Biển số', render: (v) => <strong>{v.licensePlate}</strong> },
    { key: 'type', header: 'Loại', render: (v) => [vehicleTypeLabel(v.vehicleType), v.brand, v.model, v.color].filter(Boolean).join(' • ') },
    { key: 'owner', header: 'Người sở hữu', render: (v) => <p className="cell-title">{v.tenantName}</p> },
    { key: 'st', header: 'Trạng thái', render: (v) => <StatusBadge status={v.status} map={VEHICLE_STATUS} /> },
    {
      key: 'act',
      header: '',
      render: (v) =>
        writable && v.status === 'ACTIVE' ? (
          <div className="row">
            <Button size="sm" variant="secondary" onClick={() => open(v)}>
              <Pencil size={14} /> Sửa
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setStopReason('');
                setStopping(v);
              }}
            >
              Ngừng sử dụng
            </Button>
          </div>
        ) : null,
    },
  ];

  const submit = form.handleSubmit(async (values) => {
    try {
      if (editingVehicle) {
        const patch = diffVehicle(editingVehicle, values);
        if (Object.keys(patch).length) await update.mutateAsync({ id: editingVehicle.id, patch });
      } else {
        await create.mutateAsync(values);
      }
      toast.success('Đã lưu phương tiện.');
      setEditing(null);
    } catch (e) {
      const err = toApiError(e);
      if (err.code === 'VEHICLE_ALREADY_EXISTS') form.setError('licensePlate', { message: tenancyErrorMessage(e) });
      else toast.error(tenancyErrorMessage(e));
    }
  });

  return (
    <>
      <PageHeader
        title="Quản lý phương tiện"
        description="Phương tiện gắn với người thuê. Biển số là duy nhất trong workspace, kể cả xe đã ngừng sử dụng."
        actions={
          writable && (
            <Button variant="dark" onClick={() => open('new')}>
              <Plus size={16} aria-hidden="true" /> Thêm phương tiện
            </Button>
          )
        }
      />
      <Section flush>
        <FilterBar>
          <SearchInput value={s.q} onChange={(q) => set({ q })} placeholder="Biển số, chủ xe…" />
          <Select aria-label="Trạng thái" value={s.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">Mọi trạng thái</option>
            <option value="ACTIVE">{VEHICLE_STATUS.ACTIVE.label}</option>
            <option value="INACTIVE">{VEHICLE_STATUS.INACTIVE.label}</option>
          </Select>
        </FilterBar>
        <DataTable columns={columns} rows={rows} rowKey={(v) => v.id} isLoading={isLoading} error={error} onRetry={() => refetch()} empty={<EmptyState title="Chưa có phương tiện" />} />
      </Section>

      <Modal open={editing !== null} title={editing === 'new' ? 'Thêm phương tiện' : 'Sửa phương tiện'} onClose={() => setEditing(null)}>
        <form className="stack" noValidate onSubmit={submit}>
          <FormField label="Người sở hữu" required error={form.formState.errors.tenantId?.message} hint={editingVehicle ? 'Không đổi được người sở hữu sau khi tạo.' : undefined}>
            {editingVehicle ? (
              <input className="input" value={editingVehicle.tenantName} disabled readOnly />
            ) : (
              <select className="select" {...form.register('tenantId')}>
                <option value="">— Chọn người thuê —</option>
                {tenants.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <div className="form-grid form-grid--2">
            <FormField label="Loại xe" required error={form.formState.errors.vehicleType?.message}>
              <select className="select" {...form.register('vehicleType')}>
                {Object.entries(typeOptions).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Biển số" required error={form.formState.errors.licensePlate?.message}>
              <input className="input" {...form.register('licensePlate')} placeholder="59-X1 123.45" />
            </FormField>
            <FormField label="Hãng" error={form.formState.errors.brand?.message}>
              <input className="input" maxLength={100} {...form.register('brand')} />
            </FormField>
            <FormField label="Dòng xe" error={form.formState.errors.model?.message}>
              <input className="input" maxLength={100} {...form.register('model')} />
            </FormField>
            <FormField label="Màu sắc" error={form.formState.errors.color?.message}>
              <input className="input" maxLength={50} {...form.register('color')} />
            </FormField>
          </div>
          <FormField label="Ghi chú" error={form.formState.errors.notes?.message}>
            <textarea className="textarea" {...form.register('notes')} />
          </FormField>
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Hủy
            </Button>
            <Button type="submit" variant="dark" loading={create.isPending || update.isPending}>
              Lưu
            </Button>
          </div>
        </form>
      </Modal>
      <Modal open={Boolean(stopping)} title={`Ngừng sử dụng phương tiện ${stopping?.licensePlate ?? ''}?`} onClose={() => setStopping(null)}>
        <div className="stack">
          <p className="text-sm">Phương tiện được giữ trong lịch sử nhưng không thể sửa nữa và biển số vẫn được giữ chỗ.</p>
          <FormField label="Lý do (tùy chọn)" error={stopReason.length > 500 ? 'Lý do tối đa 500 ký tự' : undefined}>
            <textarea className="textarea" maxLength={500} value={stopReason} onChange={(e) => setStopReason(e.target.value)} />
          </FormField>
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setStopping(null)}>
              Hủy
            </Button>
            <Button
              variant="danger"
              loading={stop.isPending}
              onClick={() =>
                stop.mutate(
                  { id: stopping!.id, reason: stopReason.trim() || undefined },
                  {
                    onSuccess: () => toast.success('Đã ngừng sử dụng phương tiện.'),
                    onError: (e) => toast.error(tenancyErrorMessage(e)),
                    onSettled: () => setStopping(null),
                  },
                )
              }
            >
              Ngừng sử dụng
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
