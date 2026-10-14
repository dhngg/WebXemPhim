import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Lock, Trash2, Unlock, UserPlus } from 'lucide-react';
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  ErrorState,
  FormField,
  LoadingBlock,
  Modal,
  PageHeader,
  Section,
  Select,
  useToast,
  type Column,
} from '@/components/ui';
import { useMemberMutations, useMembers, useUpdateWorkspaceSettings, useWorkspaceSettings } from '@/features/members/api';
import type { Member, WorkspaceSettingsInput } from '@/features/members/types';
import { vnPhoneSchema } from '@/features/auth/schemas';
import { useWorkspaceContext } from '@/hooks/useWorkspaceContext';
import { useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning';
import { roleLabel } from '@/features/workspaces/labels';
import { formatDate } from '@/lib/format';
import { toApiError } from '@/services/http/ApiError';
import { ForbiddenPage } from '@/pages/system/ErrorPages';

const settingsSchema = z.object({
  name: z.string().trim().min(3, 'Tên tối thiểu 3 ký tự'),
  description: z.string().trim().max(300, 'Tối đa 300 ký tự'),
  contactName: z.string().trim().min(2, 'Nhập người quản lý'),
  contactPhone: vnPhoneSchema,
  address: z.string().trim().min(5, 'Nhập địa chỉ'),
  bankName: z.string().trim(),
  bankAccount: z.string().trim().regex(/^\d{0,20}$/, 'Số tài khoản chỉ gồm chữ số'),
  invoiceDueDay: z.coerce.number().int().min(1, '1–28').max(28, '1–28'),
});
type SettingsForm = z.input<typeof settingsSchema>;

/** WSP-02 */
export function WorkspaceSettingsPage() {
  const { ws, can } = useWorkspaceContext();
  const { data, isLoading, error, refetch } = useWorkspaceSettings(ws);
  const update = useUpdateWorkspaceSettings(ws);
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    values: data
      ? {
          name: data.name,
          description: data.description,
          contactName: data.contactName,
          contactPhone: data.contactPhone,
          address: data.address,
          bankName: data.bankName,
          bankAccount: data.bankAccount,
          invoiceDueDay: data.invoiceDueDay,
        }
      : undefined,
  });
  useUnsavedChangesWarning(isDirty && !update.isPending);

  if (!can('workspace.settings')) return <ForbiddenPage message="Chỉ chủ sở hữu (OWNER) được chỉnh cài đặt workspace." />;
  if (isLoading) return <LoadingBlock lines={6} />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;

  const onSubmit = handleSubmit(async (values) => {
    try {
      await update.mutateAsync(settingsSchema.parse(values) as WorkspaceSettingsInput);
      reset(values);
      toast.success('Đã lưu cài đặt workspace.');
    } catch (e) {
      toast.error(toApiError(e).message);
    }
  });

  return (
    <>
      <PageHeader
        title="Cài đặt workspace"
        description="Thông tin hiển thị trên hóa đơn, thông tin chuyển khoản và hạn nộp mặc định."
        actions={<Badge tone={data.status === 'ACTIVE' ? 'success' : 'danger'}>{data.status === 'ACTIVE' ? 'Đang hoạt động' : 'Tạm khóa (bởi Admin)'}</Badge>}
      />
      <form onSubmit={onSubmit} noValidate className="stack">
        <Section title="Thông tin chung">
          <div className="form-grid form-grid--2">
            <FormField label="Tên workspace" required error={errors.name?.message}>
              <input className="input" {...register('name')} />
            </FormField>
            <FormField label="Địa chỉ văn phòng" required error={errors.address?.message}>
              <input className="input" {...register('address')} />
            </FormField>
          </div>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <FormField label="Mô tả" error={errors.description?.message}>
              <textarea className="textarea" {...register('description')} />
            </FormField>
          </div>
        </Section>
        <Section title="Người quản lý & thanh toán">
          <div className="form-grid form-grid--2">
            <FormField label="Người quản lý" required error={errors.contactName?.message}>
              <input className="input" {...register('contactName')} />
            </FormField>
            <FormField label="Số điện thoại" required error={errors.contactPhone?.message}>
              <input className="input" type="tel" {...register('contactPhone')} />
            </FormField>
            <FormField label="Ngân hàng" error={errors.bankName?.message}>
              <input className="input" {...register('bankName')} />
            </FormField>
            <FormField label="Số tài khoản" error={errors.bankAccount?.message}>
              <input className="input" inputMode="numeric" {...register('bankAccount')} />
            </FormField>
            <FormField label="Hạn nộp mặc định (ngày trong tháng)" required error={errors.invoiceDueDay?.message} hint="Áp dụng khi lập hóa đơn tháng.">
              <input className="input" type="number" min={1} max={28} {...register('invoiceDueDay')} />
            </FormField>
          </div>
          <div className="form-actions">
            <Button variant="secondary" disabled={!isDirty} onClick={() => reset()}>
              Hủy thay đổi
            </Button>
            <Button type="submit" variant="dark" disabled={!isDirty} loading={update.isPending}>
              Lưu cài đặt
            </Button>
          </div>
        </Section>
      </form>
    </>
  );
}

const inviteSchema = z.object({
  email: z.string().trim().email('Email không hợp lệ'),
  role: z.enum(['MANAGER', 'STAFF']),
});

/** WSP-03 */
export function MembersPage() {
  const { ws, can, membership } = useWorkspaceContext();
  const { data, isLoading, error, refetch } = useMembers(ws);
  const m = useMemberMutations(ws);
  const toast = useToast();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const manage = can('members.manage');
  const form = useForm<z.input<typeof inviteSchema>>({ resolver: zodResolver(inviteSchema), defaultValues: { email: '', role: 'STAFF' } });

  const run = (p: Promise<unknown>, msg: string) => p.then(() => toast.success(msg)).catch((e) => toast.error(toApiError(e).message));

  const columns: Column<Member>[] = [
    {
      key: 'name',
      header: 'Thành viên',
      render: (r) => (
        <>
          <p className="cell-title">{r.fullName}</p>
          <p className="cell-sub">{r.email}</p>
        </>
      ),
    },
    {
      key: 'role',
      header: 'Vai trò',
      render: (r) =>
        manage && r.role !== 'OWNER' ? (
          <Select
            aria-label={`Vai trò của ${r.fullName}`}
            value={r.role}
            style={{ width: 150, minHeight: 34 }}
            onChange={(e) => run(m.updateRole.mutateAsync({ id: r.id, role: e.target.value as 'MANAGER' | 'STAFF' }), 'Đã cập nhật vai trò.')}
          >
            <option value="MANAGER">Quản lý (MANAGER)</option>
            <option value="STAFF">Nhân viên (STAFF)</option>
          </Select>
        ) : (
          <Badge tone={r.role === 'OWNER' ? 'primary' : 'neutral'}>{roleLabel(r.role)}</Badge>
        ),
    },
    { key: 'status', header: 'Trạng thái', render: (r) => <Badge tone={r.status === 'ACTIVE' ? 'success' : 'danger'}>{r.status === 'ACTIVE' ? 'Hoạt động' : 'Đã khóa'}</Badge> },
    { key: 'joined', header: 'Tham gia', render: (r) => formatDate(r.joinedAt) },
    {
      key: 'act',
      header: '',
      render: (r) =>
        manage && r.role !== 'OWNER' ? (
          <div className="row">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => run(m.setLocked.mutateAsync({ id: r.id, locked: r.status === 'ACTIVE' }), r.status === 'ACTIVE' ? 'Đã khóa thành viên.' : 'Đã mở khóa.')}
            >
              {r.status === 'ACTIVE' ? <Lock size={14} /> : <Unlock size={14} />} {r.status === 'ACTIVE' ? 'Khóa' : 'Mở khóa'}
            </Button>
            <Button size="sm" variant="ghost" aria-label={`Xóa ${r.fullName}`} onClick={() => setRemoveTarget(r)}>
              <Trash2 size={14} />
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Thành viên & phân quyền"
        description={`Vai trò của bạn: ${roleLabel(membership.role)}. Quyền thao tác do backend kiểm tra theo permission matrix.`}
        actions={
          manage && (
            <Button variant="dark" onClick={() => setInviteOpen(true)}>
              <UserPlus size={16} aria-hidden="true" /> Thêm thành viên
            </Button>
          )
        }
      />
      <Section flush>
        <DataTable columns={columns} rows={data} rowKey={(r) => r.id} isLoading={isLoading} error={error} onRetry={() => refetch()} />
      </Section>
      <div style={{ height: 'var(--space-4)' }} />
      <Section title="Ma trận quyền (đề xuất, chờ backend chốt)">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Quyền</th>
                <th>OWNER</th>
                <th>MANAGER</th>
                <th>STAFF</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Cài đặt workspace', true, false, false],
                ['Quản lý thành viên', true, false, false],
                ['Tòa nhà / phòng / người thuê / hợp đồng', true, true, true],
                ['Lập hóa đơn, bảng giá', true, true, false],
                ['Xác nhận thanh toán, tiền cọc', true, true, false],
              ].map(([label, ...cells]) => (
                <tr key={String(label)}>
                  <td>{label}</td>
                  {cells.map((c, i) => (
                    <td key={i}>{c ? '✓' : '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Modal
        open={inviteOpen}
        title="Thêm thành viên"
        description="Gửi lời mời qua email chưa hoạt động (mock) — thành viên được thêm ngay."
        onClose={() => setInviteOpen(false)}
      >
        <form
          className="stack"
          noValidate
          onSubmit={form.handleSubmit(async (v) => {
            try {
              await m.invite.mutateAsync(inviteSchema.parse(v));
              toast.success('Đã thêm thành viên.');
              form.reset();
              setInviteOpen(false);
            } catch (e) {
              toast.error(toApiError(e).message);
            }
          })}
        >
          <FormField label="Email" required error={form.formState.errors.email?.message}>
            <input className="input" type="email" {...form.register('email')} />
          </FormField>
          <FormField label="Vai trò" required>
            <select className="select" {...form.register('role')}>
              <option value="STAFF">Nhân viên (STAFF)</option>
              <option value="MANAGER">Quản lý (MANAGER)</option>
            </select>
          </FormField>
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setInviteOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" variant="dark" loading={m.invite.isPending}>
              Thêm
            </Button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog
        open={Boolean(removeTarget)}
        title={`Xóa ${removeTarget?.fullName ?? ''} khỏi workspace?`}
        description="Thành viên sẽ mất quyền truy cập ngay lập tức."
        confirmLabel="Xóa thành viên"
        danger
        loading={m.remove.isPending}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => run(m.remove.mutateAsync(removeTarget!.id), 'Đã xóa thành viên.').finally(() => setRemoveTarget(null))}
      />
    </>
  );
}
