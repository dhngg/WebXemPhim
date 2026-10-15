import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, EyeOff, Megaphone, Users } from 'lucide-react';
import type { AdminAuditLogResponse } from '@rental/shared';
import {
  Badge,
  Button,
  DataTable,
  DatePicker,
  EmptyState,
  FilterBar,
  KeyValueList,
  PageHeader,
  Pagination,
  Section,
  Select,
  StatCard,
  StatusBadge,
  type Column,
} from '@/components/ui';
import { useCurrentUser } from '@/features/auth/hooks';
import type { AdminLandlordApplication } from '@/features/admin/api';
import { useAdminActions, useAdminApplications, useAdminListings, useAdminUsers, useAuditLogs } from '@/features/admin/hooks';
import {
  APPLICATION_STATUS,
  AUDIT_ACTION,
  FILTERABLE_TARGETS,
  PAGE_SIZE,
  auditActionLabel,
  auditRange,
  auditTargetLabel,
  canDecide,
  isApplicationStatus,
  isFilterableTarget,
  isOwnApplication,
} from '@/features/admin/model';
import { useSearchState } from '@/hooks/useSearchState';
import { formatDateTime } from '@/lib/format';
import { ReasonDialog } from './parts';

/** ADM-01 — tổng quan: chỉ các con số lấy từ chính các endpoint quản trị (không có analytics hay đếm workspace). */
export function AdminDashboardPage() {
  const pending = useAdminApplications({ status: 'PENDING', page: 1, limit: 1 });
  const users = useAdminUsers({ page: 1, limit: 1 });
  const locked = useAdminUsers({ status: 'DISABLED', page: 1, limit: 1 });
  const listings = useAdminListings({ page: 1, limit: 1 });
  const hidden = useAdminListings({ hidden: true, page: 1, limit: 1 });
  const logs = useAuditLogs({ page: 1, limit: 6 });
  const n = (q: { data?: { total: number }; isLoading: boolean }) => (q.data ? q.data.total : q.isLoading ? '…' : '—');
  return (
    <>
      <PageHeader title="Tổng quan quản trị" description="Các việc cần xử lý trên nền tảng." />
      <div className="grid grid--4" style={{ marginBottom: 'var(--space-4)' }}>
        <StatCard label="Đơn chủ trọ chờ duyệt" value={n(pending)} icon={<ClipboardList size={16} />} tone={pending.data?.total ? 'danger' : 'neutral'} footer={<Link to="/admin/applications?status=PENDING">Xem đơn →</Link>} />
        <StatCard label="Tài khoản" value={n(users)} icon={<Users size={16} />} footer={<Link to="/admin/users?status=DISABLED">Đã khóa: {n(locked)}</Link>} />
        <StatCard label="Tin đăng" value={n(listings)} icon={<Megaphone size={16} />} tone="primary" footer={<Link to="/admin/listings">Quản lý tin →</Link>} />
        <StatCard label="Tin đang bị ẩn" value={n(hidden)} icon={<EyeOff size={16} />} footer={<Link to="/admin/listings?hidden=true">Xem tin bị ẩn →</Link>} />
      </div>
      <Section title="Hoạt động quản trị gần đây" actions={<Link to="/admin/audit-logs" className="text-sm">Xem tất cả →</Link>}>
        {logs.isLoading ? (
          <p className="muted text-sm">Đang tải…</p>
        ) : logs.data?.items.length ? (
          <ul className="list-plain stack" style={{ gap: 'var(--space-3)' }}>
            {logs.data.items.map((l) => (
              <li key={l.id}>
                <p className="text-sm">
                  <strong>{auditActionLabel(l.action)}</strong> — {auditTargetLabel(l.targetType)} <span className="muted">{l.targetId}</span>
                </p>
                <p className="cell-sub">
                  {formatDateTime(l.createdAt)} • {l.reason}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted text-sm">Chưa có hoạt động quản trị nào.</p>
        )}
      </Section>
    </>
  );
}

/** ADM-02 — đơn đăng ký chủ trọ: duyệt/từ chối kèm lý do. Duyệt chỉ mở quyền tạo workspace đầu tiên, không tự tạo workspace. */
export function AdminApplicationsPage() {
  const { data: me } = useCurrentUser();
  const actions = useAdminActions();
  const [s, set] = useSearchState(['status', 'page'] as const);
  const page = Math.max(1, Number(s.page) || 1);
  const status = isApplicationStatus(s.status) ? s.status : undefined;
  const list = useAdminApplications({ status, page, limit: PAGE_SIZE });
  const [deciding, setDeciding] = useState<{ app: AdminLandlordApplication; approve: boolean } | null>(null);

  const columns: Column<AdminLandlordApplication>[] = [
    {
      key: 'who',
      header: 'Người nộp đơn',
      render: (a) => (
        <>
          <p className="cell-title">{a.user.displayName ?? a.user.email}</p>
          <p className="cell-sub">{a.user.email}</p>
        </>
      ),
    },
    { key: 'reason', header: 'Lý do nộp đơn', render: (a) => <span style={{ whiteSpace: 'pre-wrap' }}>{a.reason}</span> },
    { key: 'st', header: 'Trạng thái', render: (a) => <StatusBadge status={a.status} map={APPLICATION_STATUS} /> },
    { key: 'at', header: 'Gửi lúc', render: (a) => formatDateTime(a.createdAt) },
    {
      key: 'decision',
      header: 'Quyết định',
      render: (a) =>
        a.decidedAt ? (
          <>
            <p>{a.decisionNote ?? '—'}</p>
            <p className="cell-sub">{formatDateTime(a.decidedAt)}</p>
          </>
        ) : (
          '—'
        ),
    },
    {
      key: 'act',
      header: '',
      render: (a) => {
        if (!canDecide(a)) return null;
        if (isOwnApplication(a, me?.id)) return <span className="cell-sub">Đơn của chính bạn — không tự duyệt được</span>;
        return (
          <div className="row">
            <Button size="sm" variant="dark" onClick={() => setDeciding({ app: a, approve: true })}>
              Duyệt
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setDeciding({ app: a, approve: false })}>
              Từ chối
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader title="Đơn đăng ký chủ trọ" description="Duyệt chỉ mở quyền tạo workspace đầu tiên cho người nộp; hệ thống không tự tạo workspace." />
      <Section flush>
        <FilterBar>
          <Select aria-label="Trạng thái đơn" value={s.status} onChange={(e) => set({ status: e.target.value, page: '' })}>
            <option value="">Mọi trạng thái</option>
            {(Object.keys(APPLICATION_STATUS) as Array<keyof typeof APPLICATION_STATUS>).map((k) => (
              <option key={k} value={k}>
                {APPLICATION_STATUS[k].label}
              </option>
            ))}
          </Select>
        </FilterBar>
        <DataTable
          columns={columns}
          rows={list.data?.items}
          rowKey={(a) => a.id}
          isLoading={list.isLoading}
          error={list.error}
          onRetry={() => list.refetch()}
          empty={<EmptyState title="Không có đơn đăng ký" description={status === 'PENDING' ? 'Không còn đơn nào chờ duyệt.' : undefined} />}
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onChange={(p) => set({ page: String(p) })} />
      </Section>
      {deciding && (
        <ReasonDialog
          title={deciding.approve ? `Duyệt đơn của ${deciding.app.user.email}?` : `Từ chối đơn của ${deciding.app.user.email}?`}
          description={deciding.approve ? 'Người nộp sẽ được phép tạo workspace đầu tiên. Hệ thống không tự tạo workspace.' : 'Người nộp sẽ thấy lý do từ chối và phải chờ một thời gian trước khi nộp lại.'}
          confirmLabel={deciding.approve ? 'Duyệt đơn' : 'Từ chối đơn'}
          success={deciding.approve ? 'Đã duyệt đơn.' : 'Đã từ chối đơn.'}
          danger={!deciding.approve}
          onSubmit={(body) => (deciding.approve ? actions.approveApplication : actions.rejectApplication).mutateAsync({ id: deciding.app.id, body })}
          onClose={() => setDeciding(null)}
        />
      )}
    </>
  );
}

/** ADM-05 — nhật ký quản trị đúng như backend lưu: không có email, IP hay nhãn đối tượng tự suy ra. */
export function AuditLogsPage() {
  const [s, set] = useSearchState(['action', 'targetType', 'actorUserId', 'targetId', 'from', 'to', 'page'] as const);
  const page = Math.max(1, Number(s.page) || 1);
  const list = useAuditLogs({
    action: s.action || undefined,
    targetType: isFilterableTarget(s.targetType) ? s.targetType : undefined,
    actorUserId: s.actorUserId.trim() || undefined,
    targetId: s.targetId.trim() || undefined,
    ...auditRange(s.from, s.to),
    page,
    limit: PAGE_SIZE,
  });

  const columns: Column<AdminAuditLogResponse>[] = [
    { key: 'at', header: 'Thời gian', render: (l) => formatDateTime(l.createdAt) },
    {
      key: 'actor',
      header: 'Người thực hiện',
      render: (l) => (
        <Link to={`/admin/users/${l.actorUserId}`} className="cell-sub">
          {l.actorUserId}
        </Link>
      ),
    },
    {
      key: 'action',
      header: 'Sự kiện',
      render: (l) => (
        <>
          <p className="cell-title">{auditActionLabel(l.action)}</p>
          <p className="cell-sub">{l.action}</p>
        </>
      ),
    },
    {
      key: 'target',
      header: 'Đối tượng',
      render: (l) => (
        <>
          <Badge>{auditTargetLabel(l.targetType)}</Badge>
          <p className="cell-sub">
            {l.targetType === 'USER' ? <Link to={`/admin/users/${l.targetId}`}>{l.targetId}</Link> : l.targetId}
          </p>
        </>
      ),
    },
    { key: 'reason', header: 'Lý do', render: (l) => l.reason },
    {
      key: 'meta',
      header: 'Chi tiết',
      render: (l) => {
        const entries = Object.entries(l.metadata);
        return entries.length ? <KeyValueList items={entries.map(([k, v]) => ({ label: k, value: String(v ?? '—') }))} /> : '—';
      },
    },
  ];

  return (
    <>
      <PageHeader title="Nhật ký hoạt động" description="Lịch sử thao tác của Platform Admin: khóa/mở tài khoản, ẩn/khôi phục tin đăng, duyệt/từ chối đơn chủ trọ." />
      <Section flush>
        <FilterBar>
          <Select aria-label="Sự kiện" value={s.action} onChange={(e) => set({ action: e.target.value })}>
            <option value="">Mọi sự kiện</option>
            {Object.entries(AUDIT_ACTION).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </Select>
          <Select aria-label="Loại đối tượng" value={s.targetType} onChange={(e) => set({ targetType: e.target.value })}>
            <option value="">Mọi đối tượng</option>
            {FILTERABLE_TARGETS.map((t) => (
              <option key={t} value={t}>
                {auditTargetLabel(t)}
              </option>
            ))}
          </Select>
          <input className="input" aria-label="Mã người thực hiện" placeholder="Mã người thực hiện (UUID)" value={s.actorUserId} onChange={(e) => set({ actorUserId: e.target.value })} style={{ minWidth: 220 }} />
          <input className="input" aria-label="Mã đối tượng" placeholder="Mã đối tượng (UUID)" value={s.targetId} onChange={(e) => set({ targetId: e.target.value })} style={{ minWidth: 220 }} />
          <DatePicker aria-label="Từ ngày" value={s.from} onChange={(e) => set({ from: e.target.value })} style={{ width: 160 }} />
          <DatePicker aria-label="Đến ngày" value={s.to} onChange={(e) => set({ to: e.target.value })} style={{ width: 160 }} />
        </FilterBar>
        <DataTable
          columns={columns}
          rows={list.data?.items}
          rowKey={(l) => l.id}
          isLoading={list.isLoading}
          error={list.error}
          onRetry={() => list.refetch()}
          empty={<EmptyState title="Không có sự kiện phù hợp" />}
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onChange={(p) => set({ page: String(p) })} />
      </Section>
    </>
  );
}
