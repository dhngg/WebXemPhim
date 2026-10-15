import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Bell, FileSignature, Receipt, Wrench } from 'lucide-react';
import { TENANT_LINK_REQUEST_STATUSES, type TenantLinkRequestResponse, type TenantLinkRequestStatus, type TenantSelfResponse } from '@rental/shared';
import {
  Button,
  ButtonLink,
  DataTable,
  EmptyState,
  ErrorState,
  FilterBar,
  FormField,
  KeyValueList,
  LoadingBlock,
  PageHeader,
  Pagination,
  Section,
  Select,
  StatCard,
  StatusBadge,
  useToast,
  type Column,
} from '@/components/ui';
import { useCurrentUser } from '@/features/auth/hooks';
import { useAppRole } from '@/features/auth/role';
import { useUnreadCount } from '@/features/notifications/api';
import { TENANT_STATUS } from '@/features/tenancy/labels';
import { useAcceptInvitation, useLinkRequests, useLinkedTenants } from '@/features/tenant-portal/hooks';
import { invitationSchema, LINK_REQUEST_STATUS, PAGE_SIZE, tenantErrorMessage, type InvitationForm } from '@/features/tenant-portal/model';
import { useSearchState } from '@/hooks/useSearchState';
import { formatDate, formatDateTime } from '@/lib/format';

/** Hồ sơ người thuê đang liên kết với tài khoản (nhiều workspace thì nhiều hồ sơ). Liên kết đã bị gỡ không còn xuất hiện. */
function LinkedTenants() {
  const tenants = useLinkedTenants();
  const { capabilities } = useAppRole();
  const workspaceOf = (t: TenantSelfResponse) => capabilities?.tenantLinks.find((l) => l.tenantId === t.id)?.workspaceName;

  return (
    <Section title="Hồ sơ người thuê đã liên kết">
      {tenants.isLoading ? (
        <LoadingBlock lines={3} />
      ) : tenants.error ? (
        <ErrorState error={tenants.error} onRetry={() => tenants.refetch()} />
      ) : !tenants.data?.length ? (
        <EmptyState
          title="Chưa có hồ sơ nào đang liên kết"
          description="Nếu liên kết trước đây đã bị chủ trọ gỡ, hãy xin chủ trọ một mã mời mới rồi nhập ở trang Liên kết tài khoản."
          action={<ButtonLink to="/tenant/link-account" variant="secondary">Nhập mã mời</ButtonLink>}
        />
      ) : (
        <ul className="list-plain stack">
          {tenants.data.map((t) => (
            <li key={t.id} className="stack" style={{ gap: 'var(--space-2)' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>{t.fullName}</strong>
                <StatusBadge status={t.status} map={TENANT_STATUS} />
              </div>
              <KeyValueList
                items={[
                  { label: 'Workspace', value: workspaceOf(t) ?? '—' },
                  { label: 'Số điện thoại', value: t.phone ?? '—' },
                  { label: 'Email', value: t.email ?? '—' },
                  { label: 'Ngày sinh', value: t.dateOfBirth ? formatDate(t.dateOfBirth) : '—' },
                  { label: 'Quê quán / địa chỉ', value: t.address ?? '—' },
                ]}
              />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** TPT-01 — trang chủ Cổng người thuê: hồ sơ đã liên kết, lối tắt và số thông báo chưa đọc (thật). */
export function TenantHomePage() {
  const { data: user } = useCurrentUser();
  const unread = useUnreadCount();
  return (
    <>
      <PageHeader title={`Xin chào, ${user?.fullName ?? ''}`} description="Xem hợp đồng, hóa đơn và gửi yêu cầu bảo trì cho các hồ sơ thuê đã liên kết với tài khoản của bạn." />
      <div className="grid grid--3" style={{ marginBottom: 'var(--space-4)' }}>
        <StatCard label="Hợp đồng" value={<Link to="/tenant/contracts">Xem hợp đồng</Link>} icon={<FileSignature size={16} />} />
        <StatCard label="Hóa đơn" value={<Link to="/tenant/invoices">Xem hóa đơn</Link>} icon={<Receipt size={16} />} />
        <StatCard label="Bảo trì" value={<Link to="/tenant/maintenance">Yêu cầu bảo trì</Link>} icon={<Wrench size={16} />} />
      </div>
      <div className="grid grid--main-side">
        <LinkedTenants />
        <div className="stack">
          <StatCard
            label="Thông báo chưa đọc"
            value={unread.data ? unread.data.unread : '—'}
            tone={unread.data && unread.data.unread > 0 ? 'danger' : undefined}
            footer={<Link to="/notifications">Mở thông báo</Link>}
            icon={<Bell size={16} />}
          />
          <Section title="Liên kết thêm hồ sơ">
            <p className="text-sm muted" style={{ marginBottom: 'var(--space-3)' }}>
              Có mã mời mới từ chủ trọ khác? Nhập mã để liên kết thêm một hồ sơ thuê.
            </p>
            <ButtonLink to="/tenant/link-account" variant="secondary">Liên kết tài khoản</ButtonLink>
          </Section>
        </div>
      </div>
    </>
  );
}

/**
 * Liên kết tài khoản với hồ sơ người thuê BẰNG MÃ MỜI do chủ trọ cung cấp (43 ký tự), kèm danh sách hồ sơ đã liên kết
 * và lịch sử yêu cầu liên kết (chỉ xem). Không có gửi yêu cầu bằng mã hồ sơ, OTP hay mã hợp đồng.
 */
export function LinkAccountPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const accept = useAcceptInvitation();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<InvitationForm>({ resolver: zodResolver(invitationSchema), defaultValues: { token: '' } });
  const [s, set] = useSearchState(['status', 'page'] as const);
  const page = Math.max(1, Number(s.page) || 1);
  const status = (TENANT_LINK_REQUEST_STATUSES as readonly string[]).includes(s.status) ? (s.status as TenantLinkRequestStatus) : undefined;
  const requests = useLinkRequests({ status, page, limit: PAGE_SIZE });

  const columns: Column<TenantLinkRequestResponse>[] = [
    { key: 'tenant', header: 'Hồ sơ người thuê', render: (r) => <span className="cell-title">{r.tenant.fullName}</span> },
    { key: 'st', header: 'Trạng thái', render: (r) => <StatusBadge status={r.status} map={LINK_REQUEST_STATUS} /> },
    { key: 'msg', header: 'Lời nhắn của bạn', render: (r) => r.message ?? '—' },
    { key: 'note', header: 'Phản hồi của chủ trọ', render: (r) => r.decisionNote ?? '—' },
    { key: 'at', header: 'Gửi lúc', render: (r) => formatDateTime(r.createdAt) },
    { key: 'dec', header: 'Xử lý lúc', render: (r) => (r.decidedAt ? formatDateTime(r.decidedAt) : '—') },
  ];

  return (
    <>
      <PageHeader title="Liên kết tài khoản" description="Nhập mã mời do chủ trọ gửi để liên kết tài khoản của bạn với hồ sơ người thuê." />
      <div className="stack">
        <Section title="Nhập mã mời" subtitle="Mã gồm 43 ký tự, chỉ dùng được một lần và có thời hạn.">
          <form
            className="stack"
            noValidate
            onSubmit={form.handleSubmit(async (v) => {
              setServerError(null);
              try {
                await accept.mutateAsync({ token: v.token.trim() });
                toast.success('Đã liên kết tài khoản với hồ sơ người thuê.');
                form.reset();
                navigate('/tenant');
              } catch (err) {
                setServerError(tenantErrorMessage(err));
              }
            })}
          >
            <FormField label="Mã mời" required error={form.formState.errors.token?.message}>
              <input className="input" autoComplete="off" spellCheck={false} {...form.register('token')} />
            </FormField>
            {serverError && (
              <p className="alert alert--danger" role="alert">
                {serverError}
              </p>
            )}
            <div className="form-actions">
              <Button type="submit" variant="dark" loading={accept.isPending}>
                Liên kết tài khoản
              </Button>
            </div>
          </form>
        </Section>

        <LinkedTenants />

        <Section title="Lịch sử yêu cầu liên kết" subtitle="Chỉ xem. Yêu cầu do chủ trọ duyệt hoặc từ chối." flush>
          <FilterBar>
            <Select aria-label="Trạng thái yêu cầu" value={s.status} onChange={(e) => set({ status: e.target.value, page: '' })}>
              <option value="">Mọi trạng thái</option>
              {TENANT_LINK_REQUEST_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {LINK_REQUEST_STATUS[st].label}
                </option>
              ))}
            </Select>
          </FilterBar>
          <DataTable
            columns={columns}
            rows={requests.data?.items}
            rowKey={(r) => r.id}
            isLoading={requests.isLoading}
            error={requests.error}
            onRetry={() => requests.refetch()}
            empty={<EmptyState title="Chưa có yêu cầu liên kết" description="Các yêu cầu liên kết của tài khoản này sẽ hiện ở đây." />}
          />
          <Pagination page={page} pageSize={PAGE_SIZE} total={requests.data?.total ?? 0} onChange={(p) => set({ page: String(p) })} />
        </Section>
      </div>
    </>
  );
}
