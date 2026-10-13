import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  Tabs,
  useToast,
} from '@/components/ui';
import { useCurrentUser, useUpdateProfile } from '@/features/auth/hooks';
import { profileSchema, type ProfileForm } from '@/features/auth/schemas';
import { useCancelViewing, useMyViewings } from '@/features/viewings/hooks';
import { VIEWING_STATUS } from '@/features/viewings/labels';
import { canCancelViewing, type ViewingStatus } from '@/features/viewings/types';
import { useMyWorkspaces, lastWorkspace } from '@/features/workspaces/hooks';
import { useMarkNotification, useNotifications } from '@/features/notifications/api';
import { RoomImage } from '@/features/rooms/components/RoomImage';
import { useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning';
import { roleLabel } from '@/features/workspaces/labels';
import { formatDate, formatDateTime } from '@/lib/format';
import { toApiError } from '@/services/http/ApiError';

/** USR-01 */
export function AccountPage() {
  const { data: user } = useCurrentUser();
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
    values: { fullName: user?.fullName ?? '', phone: user?.phone ?? '' },
  });
  useUnsavedChangesWarning(isDirty && !update.isPending);

  if (!user) return null;

  const onSubmit = handleSubmit(async (values) => {
    try {
      const updated = await update.mutateAsync(profileSchema.parse(values));
      reset({ fullName: updated.fullName, phone: updated.phone });
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
            <FormField label="Số điện thoại" required error={errors.phone?.message}>
              <input className="input" type="tel" autoComplete="tel" {...register('phone')} />
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
                { label: 'Vai trò hệ thống', value: user.globalRole === 'ADMIN' ? 'Quản trị viên' : 'Người dùng' },
                { label: 'Hồ sơ người thuê', value: user.tenantLinked ? <Badge tone="success">Đã liên kết</Badge> : <Badge>Chưa liên kết</Badge> },
                { label: 'Ngày tham gia', value: formatDate(user.createdAt) },
              ]}
            />
          </Section>
          {!user.tenantLinked && (
            <Section title="Bạn đang thuê phòng?">
              <p className="text-sm muted" style={{ marginBottom: 'var(--space-3)' }}>
                Liên kết hồ sơ thuê do chủ trọ tạo để xem hợp đồng và hóa đơn.
              </p>
              <ButtonLink to="/tenant/link-account" variant="soft" block>
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
          { key: 'COMPLETED', label: 'Đã xem', count: count((s) => s === 'COMPLETED') },
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
                  <Link to={`/rooms/${v.roomId}`} className="cell-title" style={{ color: 'var(--color-text)' }}>
                    {v.roomTitle}
                  </Link>
                  <StatusBadge status={v.status} map={VIEWING_STATUS} />
                </div>
                <p className="cell-sub row">
                  <MapPin size={12} aria-hidden="true" /> {v.roomAddress}
                </p>
                <p className="text-sm row">
                  <CalendarClock size={14} aria-hidden="true" /> <strong>{formatDateTime(v.scheduledAt)}</strong>
                </p>
                {v.note && <p className="text-xs muted">Ghi chú: {v.note}</p>}
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
            onError: (e) => toast.error(toApiError(e).message),
            onSettled: () => setCancelId(null),
          })
        }
      />
    </>
  );
}

/** USR-03 */
export function NotificationsPage() {
  const { data, isLoading, error, refetch } = useNotifications();
  const { markRead, markAllRead } = useMarkNotification();
  const navigate = useNavigate();
  const unread = data?.filter((n) => !n.read).length ?? 0;

  return (
    <>
      <PageHeader
        title="Thông báo"
        description="Thông báo trong ứng dụng. Kênh email / SMS / Zalo chưa hoạt động trong bản demo."
        actions={
          <Button variant="secondary" disabled={!unread} loading={markAllRead.isPending} onClick={() => markAllRead.mutate()}>
            <CheckCheck size={16} aria-hidden="true" /> Đánh dấu đã đọc tất cả
          </Button>
        }
      />
      <div className="card" style={{ overflow: 'hidden' }}>
        {isLoading ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : !data?.length ? (
          <EmptyState icon={<Bell size={26} aria-hidden="true" />} title="Chưa có thông báo" />
        ) : (
          <ul className="list-plain">
            {data.map((n) => (
              <li key={n.id} className={n.read ? 'notif' : 'notif notif--unread'}>
                <span className={n.read ? 'notif__dot notif__dot--read' : 'notif__dot'} aria-hidden="true" />
                <div style={{ flex: 1 }}>
                  <p className="cell-title">
                    {n.title} {!n.read && <span className="sr-only">(chưa đọc)</span>}
                  </p>
                  <p className="text-sm muted">{n.body}</p>
                  <p className="cell-sub">{formatDateTime(n.createdAt)}</p>
                </div>
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  {n.link && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        if (!n.read) markRead.mutate(n.id);
                        navigate(n.link!);
                      }}
                    >
                      Xem
                    </Button>
                  )}
                  {!n.read && (
                    <Button size="sm" variant="ghost" onClick={() => markRead.mutate(n.id)}>
                      Đã đọc
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/** USR-04 */
export function WorkspaceSelectPage() {
  const { data, isLoading, error, refetch } = useMyWorkspaces();
  const last = lastWorkspace.get();
  return (
    <>
      <PageHeader title="Chọn workspace" description="Workspace là đơn vị quản lý nhà trọ. Quyền của bạn phụ thuộc vai trò trong từng workspace." />
      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !data?.length ? (
        <div className="card">
          <EmptyState
            icon={<Building2 size={26} aria-hidden="true" />}
            title="Bạn chưa tham gia workspace nào"
            description="Chủ trọ có thể mời bạn làm quản lý / nhân viên. Tạo workspace mới cần backend hỗ trợ đăng ký gói dịch vụ."
            action={
              <Button variant="dark" disabled title="Chờ API tạo workspace">
                <Plus size={16} aria-hidden="true" /> Tạo workspace (chờ API)
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid grid--2">
          {data.map((w) => (
            <Link key={w.workspaceId} to={`/w/${w.workspaceId}/dashboard`} className="card workspace-card">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="brand__logo">
                  <Building2 size={18} aria-hidden="true" />
                </span>
                <div className="row">
                  {last === w.workspaceId && <Badge tone="info">Gần đây</Badge>}
                  <Badge tone={w.status === 'ACTIVE' ? 'success' : 'danger'}>{w.status === 'ACTIVE' ? 'Đang hoạt động' : 'Tạm khóa'}</Badge>
                </div>
              </div>
              <div>
                <p className="cell-title" style={{ fontSize: 'var(--text-lg)' }}>
                  {w.name}
                </p>
                <p className="cell-sub">
                  Vai trò: <strong>{roleLabel(w.role)}</strong> ({w.role})
                </p>
              </div>
              <KeyValueList
                items={[
                  { label: 'Tòa nhà', value: w.buildingCount },
                  { label: 'Phòng', value: `${w.roomCount}/${w.plan.roomLimit}` },
                  { label: 'Gói dịch vụ', value: w.plan.name },
                ]}
              />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
