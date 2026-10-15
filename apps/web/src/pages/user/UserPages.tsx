import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Bell, Building2, CalendarClock, CheckCheck, KeyRound, MapPin, Plus } from 'lucide-react';
import {
  Badge,
  Button,
  ButtonLink,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FormField,
  KeyValueList,
  LoadingBlock,
  PageHeader,
  Section,
  StatusBadge,
  Pagination,
  Tabs,
  useToast,
} from '@/components/ui';
import { useCurrentUser, useUpdateProfile } from '@/features/auth/hooks';
import { useAppRole } from '@/features/auth/role';
import { profileSchema, type ProfileForm } from '@/features/auth/schemas';
import { useCancelViewing, useMyViewings } from '@/features/viewings/hooks';
import { VIEWING_STATUS, viewingErrorMessage } from '@/features/viewings/labels';
import { canCancelViewing, type ViewingStatus } from '@/features/viewings/types';
import { useMyWorkspaces, lastWorkspace, useWorkspaceLifecycle } from '@/features/workspaces/hooks';
import { lifecycleErrorMessage } from '@/features/workspaces/creation';
import type { WorkspaceMembership } from '@/features/workspaces/types';
import { WorkspaceCreationSection } from './WorkspaceCreationSection';
import { useMarkNotification, useNotificationPage, useUnreadCount } from '@/features/notifications/api';
import { NOTIFICATION_TYPE } from '@/features/notifications/labels';
import { RoomImage } from '@/features/rooms/components/RoomImage';
import { useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning';
import { roleLabel } from '@/features/workspaces/labels';
import { formatDate, formatDateTime } from '@/lib/format';
import { toApiError } from '@/services/http/ApiError';

/** USR-01 */
export function AccountPage() {
  const { data: user } = useCurrentUser();
  const { has, capabilities } = useAppRole();
  const update = useUpdateProfile();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    values: { fullName: user?.fullName ?? '' },
  });
  useUnsavedChangesWarning(isDirty && !update.isPending);

  if (!user) return null;

  const onSubmit = handleSubmit(async (values) => {
    try {
      const updated = await update.mutateAsync(profileSchema.parse(values));
      reset({ fullName: updated.fullName });
      toast.success('Đã cập nhật hồ sơ.');
    } catch (e) {
      const err = toApiError(e);
      Object.entries(err.fieldErrors ?? {}).forEach(([f, m]) => setError(f as keyof ProfileForm, { message: m }));
      toast.error(err.message);
    }
  });

  return (
    <>
      <PageHeader title="Hồ sơ cá nhân" description="Thông tin dùng khi đặt lịch xem phòng và liên hệ chủ trọ." />
      <div className="grid grid--main-side">
        <Section title="Thông tin cá nhân">
          <form className="stack" onSubmit={onSubmit} noValidate>
            <FormField label="Họ và tên" required error={errors.fullName?.message}>
              <input className="input" autoComplete="name" {...register('fullName')} />
            </FormField>
            <FormField label="Email" hint="Đổi email cần xác minh — chờ API.">
              <input className="input" value={user.email} disabled readOnly />
            </FormField>
            <div className="form-actions">
              <Button variant="secondary" disabled={!isDirty} onClick={() => reset()}>
                Hủy thay đổi
              </Button>
              <Button type="submit" variant="dark" disabled={!isDirty} loading={update.isPending}>
                Lưu thay đổi
              </Button>
            </div>
          </form>
        </Section>
        <div className="stack">
          <Section title="Tài khoản">
            <KeyValueList
              items={[
                {
                  label: 'Quyền hiện có',
                  value: (
                    <span className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
                      <Badge>Người tìm phòng</Badge>
                      {has('landlord') && <Badge tone="info">Chủ trọ ({capabilities?.workspaces.length} workspace)</Badge>}
                      {has('tenant') && <Badge tone="success">Người thuê</Badge>}
                      {has('admin') && <Badge tone="primary">Quản trị viên</Badge>}
                    </span>
                  ),
                },
                { label: 'Hồ sơ người thuê', value: has('tenant') ? <Badge tone="success">Đã liên kết</Badge> : <Badge>Chưa liên kết</Badge> },
                { label: 'Ngày tham gia', value: formatDate(user.createdAt) },
              ]}
            />
          </Section>
          {!has('tenant') && (
            <Section title="Bạn đã thuê phòng?">
              <p className="text-sm muted" style={{ marginBottom: 'var(--space-3)' }}>
                Liên kết hồ sơ thuê do chủ trọ tạo. Sau khi chủ trọ duyệt, tài khoản chuyển sang Cổng người thuê để xem hợp đồng và hóa đơn.
              </p>
              <ButtonLink to="/link-tenant" variant="soft" block>
                <KeyRound size={16} aria-hidden="true" /> Liên kết hồ sơ thuê
              </ButtonLink>
            </Section>
          )}
        </div>
      </div>
    </>
  );
}

type ViewingTab = 'upcoming' | ViewingStatus | 'all';

/** USR-02 */
export function MyViewingsPage() {
  const { data, isLoading, error, refetch } = useMyViewings();
  const cancel = useCancelViewing();
  const toast = useToast();
  const [tab, setTab] = useState<ViewingTab>('upcoming');
  const [cancelId, setCancelId] = useState<string | null>(null);

  const list = (data ?? []).filter((v) =>
    tab === 'all' ? true : tab === 'upcoming' ? v.status === 'PENDING' || v.status === 'CONFIRMED' : v.status === tab,
  );
  const count = (pred: (s: ViewingStatus) => boolean) => (data ?? []).filter((v) => pred(v.status)).length;

  return (
    <>
      <PageHeader
        title="Lịch xem phòng"
        description="Theo dõi các yêu cầu xem phòng bạn đã gửi."
        actions={
          <ButtonLink to="/rooms" variant="dark">
            <Plus size={16} aria-hidden="true" /> Tìm phòng mới
          </ButtonLink>
        }
      />
      <Tabs
        label="Lọc lịch xem"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'upcoming', label: 'Sắp tới', count: count((s) => s === 'PENDING' || s === 'CONFIRMED') },
          { key: 'REJECTED', label: 'Bị từ chối', count: count((s) => s === 'REJECTED') },
          { key: 'CANCELLED', label: 'Đã hủy', count: count((s) => s === 'CANCELLED') },
          { key: 'all', label: 'Tất cả', count: data?.length },
        ]}
      />
      {isLoading ? (
        <LoadingBlock lines={4} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !list.length ? (
        <div className="card">
          <EmptyState
            icon={<CalendarClock size={26} aria-hidden="true" />}
            title="Không có lịch xem nào"
            description="Tìm phòng ưng ý và đặt lịch xem trực tiếp với chủ trọ."
            action={<ButtonLink to="/rooms">Tìm phòng</ButtonLink>}
          />
        </div>
      ) : (
        <div className="stack">
          {list.map((v) => (
            <article key={v.id} className="card" style={{ display: 'flex', overflow: 'hidden', flexWrap: 'wrap' }}>
              <div style={{ width: 160, minHeight: 120, flexShrink: 0 }}>
                <RoomImage src={v.roomImage} alt={v.roomTitle} />
              </div>
              <div className="card__body stack" style={{ flex: 1, minWidth: 240, gap: 'var(--space-2)' }}>
                <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <Link to={`/rooms/${v.listingId}`} className="cell-title" style={{ color: 'var(--color-text)' }}>
                    {v.roomTitle}
                  </Link>
                  <StatusBadge status={v.status} map={VIEWING_STATUS} />
                </div>
                {v.roomAddress && (
                  <p className="cell-sub row">
                    <MapPin size={12} aria-hidden="true" /> {v.roomAddress}
                  </p>
                )}
                <p className="text-sm row">
                  <CalendarClock size={14} aria-hidden="true" /> <strong>{formatDateTime(v.scheduledAt)}</strong>
                </p>
                {v.note && <p className="text-xs muted">Ghi chú: {v.note}</p>}
                {v.decisionNote && <p className="text-xs muted">Phản hồi của chủ trọ: {v.decisionNote}</p>}
                {canCancelViewing(v.status) && (
                  <div className="row" style={{ justifyContent: 'flex-end' }}>
                    <Button variant="secondary" size="sm" onClick={() => setCancelId(v.id)}>
                      Hủy lịch
                    </Button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={Boolean(cancelId)}
        title="Hủy lịch xem phòng?"
        description="Chủ trọ sẽ thấy lịch này ở trạng thái Đã hủy. Bạn có thể đặt lại sau."
        confirmLabel="Hủy lịch"
        danger
        loading={cancel.isPending}
        onCancel={() => setCancelId(null)}
        onConfirm={() =>
          cancel.mutate(cancelId!, {
            onSuccess: () => toast.success('Đã hủy lịch xem.'),
            onError: (e) => toast.error(viewingErrorMessage(e)),
            onSettled: () => setCancelId(null),
          })
        }
      />
    </>
  );
}

/** USR-03 — thông báo của chính người đăng nhập: lọc chưa đọc, phân trang, đánh dấu đã đọc từng cái hoặc tất cả. */
export function NotificationsPage() {
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useNotificationPage({ unreadOnly: tab === 'unread', page, limit: 20 });
  const unreadCount = useUnreadCount();
  const { markRead, markAllRead } = useMarkNotification();
  const toast = useToast();
  const unread = unreadCount.data?.unread ?? 0;

  return (
    <>
      <PageHeader
        title="Thông báo"
        description="Thông báo trong ứng dụng. Chưa có email, SMS hay thông báo đẩy."
        actions={
          <Button
            variant="secondary"
            disabled={!unread}
            loading={markAllRead.isPending}
            onClick={() => markAllRead.mutate(undefined, { onSuccess: (r) => toast.success(`Đã đánh dấu đã đọc ${r.updated} thông báo.`), onError: (e) => toast.error(toApiError(e).message) })}
          >
            <CheckCheck size={16} aria-hidden="true" /> Đánh dấu đã đọc tất cả
          </Button>
        }
      />
      <Tabs
        label="Lọc thông báo"
        tabs={[
          { key: 'all', label: 'Tất cả' },
          { key: 'unread', label: 'Chưa đọc', count: unread },
        ]}
        value={tab}
        onChange={(v) => {
          setTab(v);
          setPage(1);
        }}
      />
      <div className="card" style={{ overflow: 'hidden' }}>
        {isLoading ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : !data?.items.length ? (
          <EmptyState icon={<Bell size={26} aria-hidden="true" />} title={tab === 'unread' ? 'Không còn thông báo chưa đọc' : 'Chưa có thông báo'} />
        ) : (
          <ul className="list-plain">
            {data.items.map((n) => {
              const isRead = n.readAt !== null;
              return (
                <li key={n.id} className={isRead ? 'notif' : 'notif notif--unread'}>
                  <span className={isRead ? 'notif__dot notif__dot--read' : 'notif__dot'} aria-hidden="true" />
                  <div style={{ flex: 1 }}>
                    <p className="cell-title">
                      {n.title} {!isRead && <span className="sr-only">(chưa đọc)</span>}
                    </p>
                    {n.body && <p className="text-sm muted">{n.body}</p>}
                    <p className="cell-sub">
                      {NOTIFICATION_TYPE[n.type]} • {formatDateTime(n.createdAt)}
                    </p>
                  </div>
                  {!isRead && (
                    <div className="row" style={{ alignItems: 'flex-start' }}>
                      <Button size="sm" variant="ghost" loading={markRead.isPending && markRead.variables === n.id} onClick={() => markRead.mutate(n.id, { onError: (e) => toast.error(toApiError(e).message) })}>
                        Đã đọc
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <Pagination page={page} pageSize={20} total={data?.total ?? 0} onChange={setPage} />
      </div>
    </>
  );
}

/** USR-04 */
export function WorkspaceSelectPage() {
  const { data, isLoading, error, refetch } = useMyWorkspaces();
  const last = lastWorkspace.get();
  const lifecycle = useWorkspaceLifecycle();
  const toast = useToast();
  const [pending, setPending] = useState<{ workspace: WorkspaceMembership; archive: boolean } | null>(null);

  const confirmLifecycle = () => {
    if (!pending) return;
    const { workspace, archive } = pending;
    (archive ? lifecycle.archive : lifecycle.restore).mutate(workspace.workspaceId, {
      onSuccess: () => toast.success(archive ? 'Đã lưu trữ workspace.' : 'Đã khôi phục workspace.'),
      onError: (e) => toast.error(lifecycleErrorMessage(toApiError(e), archive ? 'archive' : 'restore')),
      onSettled: () => setPending(null),
    });
  };

  return (
    <>
      <PageHeader title="Chọn workspace" description="Workspace là đơn vị quản lý nhà trọ của chủ trọ (OWNER). Bạn có thể lưu trữ hoặc khôi phục workspace của mình tại đây." />
      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !data?.length ? (
        <WorkspaceCreationSection />
      ) : (
        <>
        <div className="grid grid--2">
          {data.map((w) => (
            <div key={w.workspaceId} className="card workspace-card" data-testid={`workspace-${w.workspaceId}`}>
              <Link to={`/w/${w.workspaceId}/dashboard`} className="stack" style={{ color: 'inherit', textDecoration: 'none' }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="brand__logo">
                    <Building2 size={18} aria-hidden="true" />
                  </span>
                  <div className="row">
                    {last === w.workspaceId && <Badge tone="info">Gần đây</Badge>}
                    <Badge tone={w.status === 'ACTIVE' ? 'success' : 'danger'}>{w.status === 'ACTIVE' ? 'Đang hoạt động' : 'Đã lưu trữ'}</Badge>
                  </div>
                </div>
                <div>
                  <p className="cell-title" style={{ fontSize: 'var(--text-lg)' }}>
                    {w.name}
                  </p>
                  <p className="cell-sub">
                    Vai trò: <strong>{roleLabel(w.role)}</strong> ({w.role})
                  </p>
                  {w.status === 'ARCHIVED' && <p className="cell-sub">Workspace đã lưu trữ: chỉ xem, không ghi thêm dữ liệu.</p>}
                </div>
                {w.plan && (
                  <KeyValueList
                    items={[
                      { label: 'Tòa nhà', value: w.buildingCount ?? 0 },
                      { label: 'Phòng', value: `${w.roomCount ?? 0}/${w.plan.roomLimit}` },
                      { label: 'Gói dịch vụ', value: w.plan.name },
                    ]}
                  />
                )}
              </Link>
              {w.role === 'OWNER' && (
                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  {w.status === 'ACTIVE' ? (
                    <Button size="sm" variant="secondary" onClick={() => setPending({ workspace: w, archive: true })}>
                      Lưu trữ workspace
                    </Button>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => setPending({ workspace: w, archive: false })}>
                      Khôi phục workspace
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        <WorkspaceCreationSection />
        </>
      )}
      <ConfirmDialog
        open={Boolean(pending)}
        title={pending?.archive ? `Lưu trữ workspace “${pending.workspace.name}”?` : `Khôi phục workspace “${pending?.workspace.name ?? ''}”?`}
        description={
          pending?.archive
            ? 'Workspace chuyển sang chỉ xem: không ghi thêm hợp đồng, hóa đơn, bảo trì… Dữ liệu và lịch sử được giữ nguyên, có thể khôi phục sau. Đây không phải xóa workspace. Sau khi lưu trữ bạn có thể tạo workspace mới (tối đa 2 workspace sở hữu).'
            : 'Workspace hoạt động trở lại. Chỉ khôi phục được khi bạn chưa có workspace nào khác đang hoạt động.'
        }
        confirmLabel={pending?.archive ? 'Lưu trữ' : 'Khôi phục'}
        danger={pending?.archive}
        loading={lifecycle.archive.isPending || lifecycle.restore.isPending}
        onCancel={() => setPending(null)}
        onConfirm={confirmLifecycle}
      />
    </>
  );
}
