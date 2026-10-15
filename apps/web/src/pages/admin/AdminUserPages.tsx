import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AdminListingResponse, AdminUserResponse } from '@rental/shared';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  FilterBar,
  KeyValueList,
  LoadingBlock,
  PageHeader,
  Pagination,
  Section,
  SearchInput,
  Select,
  StatusBadge,
  type Column,
} from '@/components/ui';
import { useCurrentUser } from '@/features/auth/hooks';
import { useAdminActions, useAdminListings, useAdminUser, useAdminUsers } from '@/features/admin/hooks';
import { MODERATION_STATE, PAGE_SIZE, USER_STATUS, adminErrorMessage, isUserStatus } from '@/features/admin/model';
import { formatMoney } from '@/features/property-management/mappers';
import { useSearchState } from '@/hooks/useSearchState';
import { formatDateTime } from '@/lib/format';
import { toApiError } from '@/services/http/ApiError';
import { ReasonDialog } from './parts';

/** Backend không cho khóa chính mình hay Platform Admin khác; giao diện chỉ ẩn nút cho khỏi bấm nhầm. */
const canLock = (u: AdminUserResponse, meId: string | undefined) => u.status === 'ACTIVE' && !u.isPlatformAdmin && u.id !== meId;

type Pending = { user: AdminUserResponse; lock: boolean } | null;

function LockDialog({ pending, onClose }: { pending: NonNullable<Pending>; onClose: () => void }) {
  const actions = useAdminActions();
  const { user, lock } = pending;
  return (
    <ReasonDialog
      title={lock ? `Khóa tài khoản ${user.email}?` : `Mở khóa ${user.email}?`}
      description={lock ? 'Mọi phiên đăng nhập của người này bị thu hồi và họ không đăng nhập được cho tới khi được mở khóa.' : 'Người dùng có thể đăng nhập lại.'}
      confirmLabel={lock ? 'Khóa tài khoản' : 'Mở khóa'}
      success={lock ? 'Đã khóa tài khoản.' : 'Đã mở khóa tài khoản.'}
      danger={lock}
      onSubmit={(body) => (lock ? actions.lockUser : actions.unlockUser).mutateAsync({ id: user.id, body })}
      onClose={onClose}
    />
  );
}

/** ADM-03 — người dùng: lọc trạng thái, tìm theo email, phân trang. Khóa/mở khóa bằng POST riêng kèm lý do. */
export function AdminUsersPage() {
  const { data: me } = useCurrentUser();
  const [s, set] = useSearchState(['status', 'search', 'page'] as const);
  const page = Math.max(1, Number(s.page) || 1);
  const list = useAdminUsers({ status: isUserStatus(s.status) ? s.status : undefined, search: s.search.trim() || undefined, page, limit: PAGE_SIZE });
  const [pending, setPending] = useState<Pending>(null);

  const columns: Column<AdminUserResponse>[] = [
    {
      key: 'u',
      header: 'Người dùng',
      render: (u) => (
        <>
          <Link to={`/admin/users/${u.id}`} className="cell-title">
            {u.displayName ?? u.email}
          </Link>
          <p className="cell-sub">{u.email}</p>
        </>
      ),
    },
    { key: 'st', header: 'Trạng thái', render: (u) => <StatusBadge status={u.status} map={USER_STATUS} /> },
    { key: 'role', header: 'Quyền', render: (u) => (u.isPlatformAdmin ? <Badge tone="primary">Platform Admin</Badge> : <span className="muted">—</span>) },
    { key: 'c', header: 'Tham gia', render: (u) => formatDateTime(u.createdAt) },
    { key: 'd', header: 'Khóa lúc', render: (u) => (u.disabledAt ? formatDateTime(u.disabledAt) : '—') },
    {
      key: 'a',
      header: '',
      render: (u) => (
        <div className="row">
          <Link to={`/admin/users/${u.id}`} className="text-sm">
            Chi tiết
          </Link>
          {canLock(u, me?.id) && (
            <Button size="sm" variant="secondary" onClick={() => setPending({ user: u, lock: true })}>
              Khóa
            </Button>
          )}
          {u.status === 'DISABLED' && (
            <Button size="sm" variant="soft" onClick={() => setPending({ user: u, lock: false })}>
              Mở khóa
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Quản lý người dùng" description="Khóa/mở khóa tài khoản. Mọi thao tác cần lý do và được ghi vào nhật ký." />
      <Section flush>
        <FilterBar>
          <SearchInput value={s.search} onChange={(search) => set({ search, page: '' })} placeholder="Tìm theo email…" label="Tìm theo email" />
          <Select aria-label="Trạng thái tài khoản" value={s.status} onChange={(e) => set({ status: e.target.value, page: '' })}>
            <option value="">Mọi trạng thái</option>
            {(Object.keys(USER_STATUS) as Array<keyof typeof USER_STATUS>).map((k) => (
              <option key={k} value={k}>
                {USER_STATUS[k].label}
              </option>
            ))}
          </Select>
        </FilterBar>
        <DataTable columns={columns} rows={list.data?.items} rowKey={(u) => u.id} isLoading={list.isLoading} error={list.error} onRetry={() => list.refetch()} empty={<EmptyState title="Không tìm thấy người dùng" />} />
        <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onChange={(p) => set({ page: String(p) })} />
      </Section>
      {pending && <LockDialog pending={pending} onClose={() => setPending(null)} />}
    </>
  );
}

/** ADM-03b — chi tiết người dùng từ endpoint riêng. */
export function AdminUserDetailPage() {
  const { userId } = useParams();
  const { data: me } = useCurrentUser();
  const detail = useAdminUser(userId);
  const [pending, setPending] = useState<Pending>(null);
  const u = detail.data;

  if (detail.isLoading) return <LoadingBlock lines={6} />;
  if (detail.error || !u) {
    const notFound = toApiError(detail.error).isNotFound;
    return notFound ? (
      <div className="state state--error" role="alert">
        <p className="state__title">Không tìm thấy người dùng</p>
        <p className="state__desc">{adminErrorMessage(detail.error)}</p>
        <Link to="/admin/users">← Về danh sách người dùng</Link>
      </div>
    ) : (
      <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
    );
  }

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Người dùng', to: '/admin/users' }, { label: u.email }]}
        title={u.displayName ?? u.email}
        eyebrow={
          <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
            <StatusBadge status={u.status} map={USER_STATUS} />
            {u.isPlatformAdmin && <Badge tone="primary">Platform Admin</Badge>}
          </div>
        }
        actions={
          <>
            {canLock(u, me?.id) && (
              <Button variant="secondary" onClick={() => setPending({ user: u, lock: true })}>
                Khóa tài khoản
              </Button>
            )}
            {u.status === 'DISABLED' && (
              <Button variant="dark" onClick={() => setPending({ user: u, lock: false })}>
                Mở khóa
              </Button>
            )}
          </>
        }
      />
      <div className="grid grid--main-side">
        <Section title="Thông tin tài khoản">
          <KeyValueList
            items={[
              { label: 'Email', value: u.email },
              { label: 'Tên hiển thị', value: u.displayName ?? '—' },
              { label: 'Trạng thái', value: USER_STATUS[u.status].label },
              { label: 'Platform Admin', value: u.isPlatformAdmin ? 'Có' : 'Không' },
              { label: 'Tham gia', value: formatDateTime(u.createdAt) },
              { label: 'Khóa lúc', value: u.disabledAt ? formatDateTime(u.disabledAt) : '—' },
              { label: 'Số workspace tham gia', value: String(u.workspaceMembershipCount) },
              { label: 'Phiên đăng nhập đang hoạt động', value: String(u.activeSessionCount) },
              { label: 'Lý do khóa/mở khóa gần nhất', value: u.lastModerationReason ?? '—' },
            ]}
          />
        </Section>
        <Section title="Nhật ký">
          <p className="text-sm muted" style={{ marginBottom: 'var(--space-3)' }}>
            Các thao tác quản trị đã thực hiện lên tài khoản này.
          </p>
          <Link to={`/admin/audit-logs?targetType=USER&targetId=${encodeURIComponent(u.id)}`}>Xem nhật ký của tài khoản →</Link>
        </Section>
      </div>
      {pending && <LockDialog pending={pending} onClose={() => setPending(null)} />}
    </>
  );
}

/** ADM-04 — tin đăng: ẩn/khôi phục kiểm duyệt (không đổi trạng thái đăng của chủ trọ). Xem trước bằng id tin đăng công khai. */
export function AdminListingsPage() {
  const actions = useAdminActions();
  const [s, set] = useSearchState(['hidden', 'published', 'workspaceId', 'page'] as const);
  const page = Math.max(1, Number(s.page) || 1);
  const flag = (v: string) => (v === 'true' ? true : v === 'false' ? false : undefined);
  const list = useAdminListings({ hidden: flag(s.hidden), published: flag(s.published), workspaceId: s.workspaceId.trim() || undefined, page, limit: PAGE_SIZE });
  const [target, setTarget] = useState<{ listing: AdminListingResponse; hide: boolean } | null>(null);

  const columns: Column<AdminListingResponse>[] = [
    {
      key: 't',
      header: 'Tin đăng',
      render: (l) => (
        <>
          {l.isPublished && !l.isHidden ? (
            <Link to={`/rooms/${l.id}`} className="cell-title" target="_blank" rel="noreferrer">
              Phòng {l.roomCode} — {l.buildingName}
            </Link>
          ) : (
            <p className="cell-title">
              Phòng {l.roomCode} — {l.buildingName}
            </p>
          )}
          <p className="cell-sub">
            {l.city} • {formatMoney(l.monthlyRent)}/tháng
          </p>
        </>
      ),
    },
    { key: 'ws', header: 'Workspace', render: (l) => <span className="cell-sub">{l.workspaceId}</span> },
    { key: 'pub', header: 'Chủ trọ đăng', render: (l) => (l.isPublished ? <Badge tone="success">Đã đăng</Badge> : <Badge>Chưa đăng</Badge>) },
    {
      key: 'mod',
      header: 'Kiểm duyệt',
      render: (l) => (
        <>
          <StatusBadge status={l.isHidden ? 'hidden' : 'visible'} map={MODERATION_STATE} />
          {l.moderationReason && <p className="cell-sub">{l.moderationReason}</p>}
          {l.moderatedAt && <p className="cell-sub">{formatDateTime(l.moderatedAt)}</p>}
        </>
      ),
    },
    {
      key: 'a',
      header: '',
      render: (l) =>
        l.isHidden ? (
          <Button size="sm" variant="secondary" onClick={() => setTarget({ listing: l, hide: false })}>
            Khôi phục
          </Button>
        ) : (
          <Button size="sm" variant="danger" onClick={() => setTarget({ listing: l, hide: true })}>
            Ẩn tin
          </Button>
        ),
    },
  ];

  return (
    <>
      <PageHeader title="Quản lý tin đăng" description="Ẩn tin vi phạm khỏi trang Tìm phòng hoặc khôi phục. Việc này không đổi trạng thái đăng tin của chủ trọ." />
      <Section flush>
        <FilterBar>
          <Select aria-label="Kiểm duyệt" value={s.hidden} onChange={(e) => set({ hidden: e.target.value, page: '' })}>
            <option value="">Mọi trạng thái kiểm duyệt</option>
            <option value="true">Đang bị ẩn</option>
            <option value="false">Không bị ẩn</option>
          </Select>
          <Select aria-label="Chủ trọ đăng" value={s.published} onChange={(e) => set({ published: e.target.value, page: '' })}>
            <option value="">Đã đăng hoặc chưa</option>
            <option value="true">Đã đăng</option>
            <option value="false">Chưa đăng</option>
          </Select>
          <input className="input" aria-label="Mã workspace" placeholder="Mã workspace (UUID)" value={s.workspaceId} onChange={(e) => set({ workspaceId: e.target.value, page: '' })} style={{ minWidth: 220 }} />
        </FilterBar>
        <DataTable columns={columns} rows={list.data?.items} rowKey={(l) => l.id} isLoading={list.isLoading} error={list.error} onRetry={() => list.refetch()} empty={<EmptyState title="Không có tin đăng" />} />
        <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onChange={(p) => set({ page: String(p) })} />
      </Section>
      {target && (
        <ReasonDialog
          title={target.hide ? `Ẩn tin phòng ${target.listing.roomCode}?` : `Khôi phục tin phòng ${target.listing.roomCode}?`}
          description={target.hide ? 'Tin biến mất khỏi trang Tìm phòng công khai. Trạng thái đăng của chủ trọ không đổi.' : 'Tin hiển thị lại nếu chủ trọ đang để đăng.'}
          confirmLabel={target.hide ? 'Ẩn tin' : 'Khôi phục'}
          success={target.hide ? 'Đã ẩn tin đăng.' : 'Đã khôi phục tin đăng.'}
          danger={target.hide}
          onSubmit={(body) => (target.hide ? actions.hideListing : actions.restoreListing).mutateAsync({ id: target.listing.id, body })}
          onClose={() => setTarget(null)}
        />
      )}
    </>
  );
}
