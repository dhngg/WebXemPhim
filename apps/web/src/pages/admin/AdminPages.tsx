import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Building, Flag, Megaphone, Users } from 'lucide-react';
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  FilterBar,
  LoadingBlock,
  PageHeader,
  SearchInput,
  Section,
  Select,
  StatCard,
  StatusBadge,
  DatePicker,
  useToast,
  type Column,
} from '@/components/ui';
import { BarChart } from '@/components/charts/BarChart';
import {
  AUDIT_CATEGORY,
  LISTING_ADMIN_STATUS,
  useAdminListings,
  useAdminMutations,
  useAdminOverview,
  useAdminUsers,
  useAdminWorkspaces,
  useAuditLogs,
} from '@/features/admin/api';
import type { AdminListing, AdminListingStatus, AdminUser, AdminWorkspace, AuditLog } from '@/features/admin/types';
import { useSearchState } from '@/hooks/useSearchState';
import { formatDate, formatDateTime, formatNumber, formatVnd } from '@/lib/format';
import { toApiError } from '@/services/http/ApiError';

/** ADM-01 */
export function AdminDashboardPage() {
  const { data, isLoading, error, refetch } = useAdminOverview();
  const logs = useAuditLogs({});
  if (isLoading) return <LoadingBlock lines={6} />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;
  return (
    <>
      <PageHeader title="Dashboard quản trị" description="Tổng quan nền tảng." />
      <div className="grid grid--4" style={{ marginBottom: 'var(--space-4)' }}>
        <StatCard label="Người dùng" value={formatNumber(data.users)} icon={<Users size={16} />} footer={`+${data.newUsers7d} trong 7 ngày`} />
        <StatCard label="Workspace" value={data.workspaces} icon={<Building size={16} />} />
        <StatCard label="Tin đang hiển thị" value={data.activeListings} icon={<Megaphone size={16} />} tone="primary" />
        <StatCard
          label="Tin bị báo cáo"
          value={data.reportedListings}
          icon={<Flag size={16} />}
          tone="danger"
          footer={<Link to="/admin/listings?status=REPORTED">Xử lý ngay →</Link>}
        />
      </div>
      <div className="dash-grid">
        <Section title="Đăng ký mới 14 ngày gần nhất">
          <BarChart
            title="Đăng ký mới 14 ngày gần nhất"
            data={data.signupsByDay.map((d) => ({ label: d.date.slice(8, 10) + '/' + d.date.slice(5, 7), values: { count: d.count } }))}
            series={[{ key: 'count', label: 'Người dùng mới', color: 'var(--chart-1)' }]}
            format={(v) => `${v} người`}
            formatAxis={(v) => String(Math.round(v))}
            height={200}
          />
        </Section>
        <Section title="Hoạt động gần đây" actions={<Link to="/admin/audit-logs" className="text-sm">Xem tất cả →</Link>}>
          <ul className="list-plain stack" style={{ gap: 'var(--space-3)' }}>
            {(logs.data ?? []).slice(0, 6).map((l) => (
              <li key={l.id}>
                <p className="text-sm">
                  <strong>{l.actor}</strong> {l.action.toLowerCase()} — {l.target}
                </p>
                <p className="cell-sub">{formatDateTime(l.at)}</p>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </>
  );
}

/** ADM-02 */
export function AdminUsersPage() {
  const [s, set] = useSearchState(['q'] as const);
  const { data, isLoading, error, refetch } = useAdminUsers(s.q || undefined);
  const { setUserLocked } = useAdminMutations();
  const toast = useToast();
  const [target, setTarget] = useState<AdminUser | null>(null);

  const columns: Column<AdminUser>[] = [
    {
      key: 'n',
      header: 'Người dùng',
      render: (u) => (
        <>
          <p className="cell-title">{u.fullName}</p>
          <p className="cell-sub">
            {u.email} • {u.phone}
          </p>
        </>
      ),
    },
    { key: 'r', header: 'Vai trò', render: (u) => <Badge tone={u.globalRole === 'ADMIN' ? 'primary' : 'neutral'}>{u.globalRole}</Badge> },
    { key: 'w', header: 'Workspace', align: 'right', render: (u) => u.workspaceCount },
    { key: 'c', header: 'Tham gia', render: (u) => formatDate(u.createdAt) },
    { key: 's', header: 'Trạng thái', render: (u) => <Badge tone={u.status === 'ACTIVE' ? 'success' : 'danger'}>{u.status === 'ACTIVE' ? 'Hoạt động' : 'Đã khóa'}</Badge> },
    {
      key: 'a',
      header: '',
      render: (u) =>
        u.globalRole !== 'ADMIN' && (
          <Button size="sm" variant={u.status === 'ACTIVE' ? 'secondary' : 'soft'} onClick={() => setTarget(u)}>
            {u.status === 'ACTIVE' ? 'Khóa' : 'Mở khóa'}
          </Button>
        ),
    },
  ];

  return (
    <>
      <PageHeader title="Quản lý người dùng" description="Khóa/mở tài khoản. Mọi thao tác được ghi audit log." />
      <Section flush>
        <FilterBar>
          <SearchInput value={s.q} onChange={(q) => set({ q })} placeholder="Tên, email, SĐT…" />
        </FilterBar>
        <DataTable columns={columns} rows={data} rowKey={(u) => u.id} isLoading={isLoading} error={error} onRetry={() => refetch()} empty={<EmptyState title="Không tìm thấy người dùng" />} />
      </Section>
      <ConfirmDialog
        open={Boolean(target)}
        title={target?.status === 'ACTIVE' ? `Khóa tài khoản ${target?.email}?` : `Mở khóa ${target?.email}?`}
        description={target?.status === 'ACTIVE' ? 'Người dùng sẽ không thể đăng nhập cho tới khi được mở khóa.' : undefined}
        danger={target?.status === 'ACTIVE'}
        confirmLabel={target?.status === 'ACTIVE' ? 'Khóa' : 'Mở khóa'}
        loading={setUserLocked.isPending}
        onCancel={() => setTarget(null)}
        onConfirm={() =>
          setUserLocked.mutate(
            { id: target!.id, locked: target!.status === 'ACTIVE' },
            { onSuccess: () => toast.success('Đã cập nhật.'), onError: (e) => toast.error(toApiError(e).message), onSettled: () => setTarget(null) },
          )
        }
      />
    </>
  );
}

/** ADM-03 */
export function AdminWorkspacesPage() {
  const [s, set] = useSearchState(['q'] as const);
  const { data, isLoading, error, refetch } = useAdminWorkspaces(s.q || undefined);
  const { setWorkspaceStatus } = useAdminMutations();
  const toast = useToast();
  const [target, setTarget] = useState<AdminWorkspace | null>(null);

  const columns: Column<AdminWorkspace>[] = [
    {
      key: 'n',
      header: 'Workspace',
      render: (w) => (
        <>
          <p className="cell-title">{w.name}</p>
          <p className="cell-sub">Chủ: {w.ownerName}</p>
        </>
      ),
    },
    { key: 'sc', header: 'Quy mô', render: (w) => `${w.buildingCount} tòa • ${w.roomCount} phòng` },
    { key: 'p', header: 'Gói', render: (w) => w.plan },
    { key: 'c', header: 'Tạo', render: (w) => formatDate(w.createdAt) },
    { key: 's', header: 'Trạng thái', render: (w) => <Badge tone={w.status === 'ACTIVE' ? 'success' : 'danger'}>{w.status}</Badge> },
    {
      key: 'a',
      header: '',
      render: (w) => (
        <Button size="sm" variant={w.status === 'ACTIVE' ? 'secondary' : 'soft'} onClick={() => setTarget(w)}>
          {w.status === 'ACTIVE' ? 'Tạm khóa' : 'Kích hoạt'}
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Quản lý workspace" description="Trạng thái ACTIVE / SUSPENDED." />
      <Section flush>
        <FilterBar>
          <SearchInput value={s.q} onChange={(q) => set({ q })} placeholder="Tên workspace, chủ sở hữu…" />
        </FilterBar>
        <DataTable columns={columns} rows={data} rowKey={(w) => w.id} isLoading={isLoading} error={error} onRetry={() => refetch()} empty={<EmptyState title="Không có workspace" />} />
      </Section>
      <ConfirmDialog
        open={Boolean(target)}
        title={target?.status === 'ACTIVE' ? `Tạm khóa ${target?.name}?` : `Kích hoạt lại ${target?.name}?`}
        description={target?.status === 'ACTIVE' ? 'Thành viên workspace sẽ không thể thao tác nghiệp vụ cho tới khi kích hoạt lại.' : undefined}
        danger={target?.status === 'ACTIVE'}
        confirmLabel={target?.status === 'ACTIVE' ? 'Tạm khóa' : 'Kích hoạt'}
        loading={setWorkspaceStatus.isPending}
        onCancel={() => setTarget(null)}
        onConfirm={() =>
          setWorkspaceStatus.mutate(
            { id: target!.id, status: target!.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' },
            { onSuccess: () => toast.success('Đã cập nhật trạng thái workspace.'), onError: (e) => toast.error(toApiError(e).message), onSettled: () => setTarget(null) },
          )
        }
      />
    </>
  );
}

/** ADM-04 */
export function AdminListingsPage() {
  const [s, set] = useSearchState(['status'] as const);
  const { data, isLoading, error, refetch } = useAdminListings((s.status || undefined) as AdminListingStatus | undefined);
  const { setListingStatus } = useAdminMutations();
  const toast = useToast();
  const act = (l: AdminListing, status: AdminListingStatus) =>
    setListingStatus.mutate({ id: l.id, status }, { onSuccess: () => toast.success(status === 'REMOVED' ? 'Đã gỡ tin.' : 'Đã khôi phục tin.'), onError: (e) => toast.error(toApiError(e).message) });

  const columns: Column<AdminListing>[] = [
    {
      key: 't',
      header: 'Tin đăng',
      render: (l) => (
        <>
          <Link to={`/rooms/${l.roomId}`} className="cell-title" target="_blank">
            {l.title}
          </Link>
          <p className="cell-sub">
            {l.workspaceName} • {formatVnd(l.price)}
          </p>
        </>
      ),
    },
    {
      key: 'r',
      header: 'Báo cáo',
      render: (l) =>
        l.reportCount ? (
          <>
            <Badge tone="danger">{l.reportCount} báo cáo</Badge>
            <p className="cell-sub">{l.reportReason}</p>
          </>
        ) : (
          <span className="muted">—</span>
        ),
    },
    { key: 'd', header: 'Đăng', render: (l) => formatDate(l.postedAt) },
    { key: 's', header: 'Trạng thái', render: (l) => <StatusBadge status={l.status} map={LISTING_ADMIN_STATUS} /> },
    {
      key: 'a',
      header: '',
      render: (l) => (
        <div className="row">
          {l.status !== 'REMOVED' && (
            <Button size="sm" variant="danger" onClick={() => act(l, 'REMOVED')}>
              Gỡ tin
            </Button>
          )}
          {l.status !== 'ACTIVE' && (
            <Button size="sm" variant="secondary" onClick={() => act(l, 'ACTIVE')}>
              {l.status === 'REPORTED' ? 'Bỏ qua báo cáo' : 'Khôi phục'}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Quản lý tin đăng" description="Xem và xử lý tin vi phạm. Tin bị gỡ sẽ ẩn khỏi trang Tìm phòng." />
      <Section flush>
        <FilterBar>
          <Select aria-label="Trạng thái" value={s.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">Mọi trạng thái</option>
            {(Object.keys(LISTING_ADMIN_STATUS) as AdminListingStatus[]).map((k) => (
              <option key={k} value={k}>
                {LISTING_ADMIN_STATUS[k].label}
              </option>
            ))}
          </Select>
        </FilterBar>
        <DataTable columns={columns} rows={data} rowKey={(l) => l.id} isLoading={isLoading} error={error} onRetry={() => refetch()} empty={<EmptyState title="Không có tin đăng" />} />
      </Section>
    </>
  );
}

/** ADM-05 */
export function AuditLogsPage() {
  const [s, set] = useSearchState(['q', 'category', 'from', 'to'] as const);
  const { data, isLoading, error, refetch } = useAuditLogs({
    q: s.q || undefined,
    category: (s.category || undefined) as AuditLog['category'] | undefined,
    from: s.from || undefined,
    to: s.to || undefined,
  });
  const columns: Column<AuditLog>[] = [
    { key: 'at', header: 'Thời gian', render: (l) => formatDateTime(l.at) },
    { key: 'actor', header: 'Người thực hiện', render: (l) => <strong>{l.actor}</strong> },
    { key: 'action', header: 'Sự kiện', render: (l) => l.action },
    { key: 'target', header: 'Đối tượng', render: (l) => l.target },
    { key: 'cat', header: 'Nhóm', render: (l) => <Badge>{AUDIT_CATEGORY[l.category]}</Badge> },
    { key: 'ip', header: 'IP', render: (l) => <span className="cell-sub">{l.ip ?? '—'}</span> },
  ];
  return (
    <>
      <PageHeader title="Nhật ký hoạt động" description="Lọc theo sự kiện, người thực hiện, thời gian." />
      <Section flush>
        <FilterBar>
          <SearchInput value={s.q} onChange={(q) => set({ q })} placeholder="Người thực hiện, sự kiện, đối tượng…" />
          <Select aria-label="Nhóm sự kiện" value={s.category} onChange={(e) => set({ category: e.target.value })}>
            <option value="">Mọi nhóm</option>
            {(Object.keys(AUDIT_CATEGORY) as AuditLog['category'][]).map((k) => (
              <option key={k} value={k}>
                {AUDIT_CATEGORY[k]}
              </option>
            ))}
          </Select>
          <DatePicker aria-label="Từ ngày" value={s.from} onChange={(e) => set({ from: e.target.value })} style={{ width: 160 }} />
          <DatePicker aria-label="Đến ngày" value={s.to} onChange={(e) => set({ to: e.target.value })} style={{ width: 160 }} />
        </FilterBar>
        <DataTable columns={columns} rows={data} rowKey={(l) => l.id} isLoading={isLoading} error={error} onRetry={() => refetch()} empty={<EmptyState title="Không có sự kiện phù hợp" />} />
      </Section>
    </>
  );
}
