import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, Copy, FileSignature, KeyRound, Plus, Receipt, Wrench } from 'lucide-react';
import {
  Badge,
  Button,
  ButtonLink,
  CurrencyInput,
  DataTable,
  EmptyState,
  ErrorState,
  FormField,
  ImageUploader,
  KeyValueList,
  LoadingBlock,
  MockBadge,
  Modal,
  PageHeader,
  Section,
  StatCard,
  StatusBadge,
  useToast,
} from '@/components/ui';
import {
  useCreateTenantMaintenance,
  useLinkRequests,
  useRequestLink,
  useSubmitTenantPayment,
  useTenantContracts,
  useTenantInvoice,
  useTenantInvoices,
  useTenantMaintenance,
  useTenantOverview,
} from '@/features/tenant-portal/api';
import { useCurrentUser } from '@/features/auth/hooks';
import { vnPhoneSchema } from '@/features/auth/schemas';
import { CONTRACT_STATUS, WATER_MODE } from '@/features/leasing/labels';
import { INVOICE_STATUS, PAYMENT_METHOD, PAYMENT_STATUS } from '@/features/billing/labels';
import { invoiceBalance, invoiceGrandTotal } from '@/features/billing/calc';
import { MAINTENANCE_PRIORITY, MAINTENANCE_STATUS } from '@/features/maintenance/api';
import { InvoiceLinesTable } from '@/pages/workspace/BillingPages';
import { useSearchState } from '@/hooks/useSearchState';
import { inclusiveDays, periodLabel, todayVN } from '@/lib/dates';
import { formatDate, formatDateTime, formatVnd } from '@/lib/format';
import { toApiError } from '@/services/http/ApiError';
import { env } from '@/lib/env';

/** TPT-01 */
export function TenantHomePage() {
  const { data: user } = useCurrentUser();
  const { data, isLoading, error, refetch } = useTenantOverview();
  if (isLoading) return <LoadingBlock lines={6} />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;
  const c = data.contract;
  const inv = data.latestInvoice;

  return (
    <>
      <PageHeader title={`Xin chào, ${user?.fullName ?? ''}`} description="Tổng quan phòng đang thuê, hóa đơn và thông báo từ chủ trọ." />
      <div className="grid grid--3" style={{ marginBottom: 'var(--space-4)' }}>
        <StatCard label="Phòng đang thuê" value={c ? c.roomCode : '—'} footer={c ? c.buildingName : 'Không có hợp đồng hiệu lực'} icon={<FileSignature size={16} />} />
        <StatCard label="Tổng còn nợ" value={formatVnd(data.outstanding)} tone={data.outstanding > 0 ? 'danger' : 'success'} icon={<Receipt size={16} />} />
        <StatCard
          label="Thanh toán chờ xác nhận"
          value={data.pendingPayments.length}
          footer={data.pendingPayments.length ? `${formatVnd(data.pendingPayments.reduce((s, p) => s + p.amount, 0))} — chưa tính là đã trả` : 'Không có'}
        />
      </div>
      <div className="grid grid--main-side">
        <Section
          title="Hóa đơn gần nhất"
          actions={inv && <ButtonLink to={`/tenant/invoices/${inv.id}`} size="sm" variant="secondary">Chi tiết</ButtonLink>}
        >
          {inv ? (
            <div className="stack">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>Kỳ {periodLabel(inv.period)}</strong>
                <StatusBadge status={inv.status} map={INVOICE_STATUS} />
              </div>
              <KeyValueList
                items={[
                  { label: 'Tổng tiền', value: formatVnd(invoiceGrandTotal(inv)) },
                  { label: 'Đã thanh toán (xác nhận)', value: formatVnd(inv.paidConfirmed) },
                  { label: 'Còn nợ', value: <span className={invoiceBalance(inv) ? 'danger-text' : undefined}>{formatVnd(invoiceBalance(inv))}</span> },
                  { label: 'Hạn nộp', value: formatDate(inv.dueDate) },
                ]}
              />
              {invoiceBalance(inv) > 0 && (
                <ButtonLink to={`/tenant/payments/new?invoice=${inv.id}`} variant="dark" block>
                  Gửi thông tin thanh toán
                </ButtonLink>
              )}
            </div>
          ) : (
            <EmptyState title="Chưa có hóa đơn" />
          )}
        </Section>
        <div className="stack">
          {c && (
            <Section title="Hợp đồng">
              <KeyValueList
                items={[
                  { label: 'Mã', value: c.code },
                  { label: 'Thời hạn', value: `${formatDate(c.startDate)} – ${formatDate(c.endDate)}` },
                  { label: 'Còn lại', value: `${Math.max(0, inclusiveDays(todayVN(), c.endDate) - 1)} ngày` },
                ]}
              />
            </Section>
          )}
          <Section title="Thông báo từ chủ trọ">
            <ul className="list-plain stack" style={{ gap: 'var(--space-3)' }}>
              {data.notices.map((n) => (
                <li key={n.id}>
                  <p className="text-sm">{n.title}</p>
                  <p className="cell-sub">{formatDate(n.at)}</p>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </>
  );
}

/** TPT-02 */
export function TenantContractsPage() {
  const { data, isLoading, error, refetch } = useTenantContracts();
  return (
    <>
      <PageHeader title="Hợp đồng của tôi" description="Chỉ hiển thị hợp đồng thuộc hồ sơ đã liên kết hợp lệ." />
      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !data?.length ? (
        <EmptyState title="Chưa có hợp đồng" />
      ) : (
        <div className="stack">
          {data.map((c) => (
            <Section key={c.id} title={`${c.code} • ${c.roomCode} (${c.buildingName})`} actions={<StatusBadge status={c.status} map={CONTRACT_STATUS} />}>
              <KeyValueList
                items={[
                  { label: 'Thời hạn', value: `${formatDate(c.startDate)} – ${formatDate(c.endDate)} (tính bao gồm ngày kết thúc)` },
                  { label: 'Tiền thuê', value: `${formatVnd(c.monthlyRent)}/tháng` },
                  { label: 'Tiền cọc', value: formatVnd(c.deposit) },
                  { label: 'Cách tính nước', value: WATER_MODE[c.waterMode] },
                  { label: 'Số người ở', value: c.occupantIds.length },
                  { label: 'Người đứng tên', value: c.primaryTenantName },
                ]}
              />
            </Section>
          ))}
        </div>
      )}
    </>
  );
}

/** TPT-03 */
export function TenantInvoicesPage() {
  const { data, isLoading, error, refetch } = useTenantInvoices();
  const navigate = useNavigate();
  return (
    <>
      <PageHeader title="Hóa đơn của tôi" />
      <Section flush>
        <DataTable
          rows={data}
          rowKey={(i) => i.id}
          isLoading={isLoading}
          error={error}
          onRetry={() => refetch()}
          onRowClick={(i) => navigate(`/tenant/invoices/${i.id}`)}
          empty={<EmptyState icon={<Receipt size={26} />} title="Chưa có hóa đơn" />}
          columns={[
            { key: 'p', header: 'Kỳ', render: (i) => <Link to={`/tenant/invoices/${i.id}`} className="cell-title">{periodLabel(i.period)}</Link> },
            { key: 't', header: 'Tổng tiền', align: 'right', render: (i) => formatVnd(invoiceGrandTotal(i)) },
            { key: 'b', header: 'Còn nợ', align: 'right', render: (i) => <strong className={invoiceBalance(i) ? 'danger-text' : undefined}>{formatVnd(invoiceBalance(i))}</strong> },
            { key: 'd', header: 'Hạn nộp', render: (i) => formatDate(i.dueDate) },
            { key: 's', header: 'Trạng thái', render: (i) => <StatusBadge status={i.status} map={INVOICE_STATUS} /> },
          ]}
        />
      </Section>
    </>
  );
}

/** TPT-04 */
export function TenantInvoiceDetailPage() {
  const { invoiceId } = useParams();
  const { data, isLoading, error, refetch } = useTenantInvoice(invoiceId);
  const toast = useToast();
  if (isLoading) return <LoadingBlock lines={6} />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;
  const { invoice: inv, payments, bank } = data;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Hóa đơn', to: '/tenant/invoices' }, { label: periodLabel(inv.period) }]}
        title={`Hóa đơn kỳ ${periodLabel(inv.period)}`}
        description={`${inv.code} • ${inv.roomCode} (${inv.buildingName}) • Hạn nộp ${formatDate(inv.dueDate)}`}
        eyebrow={<div style={{ marginBottom: 'var(--space-2)' }}><StatusBadge status={inv.status} map={INVOICE_STATUS} /></div>}
        actions={
          invoiceBalance(inv) > 0 && (
            <ButtonLink to={`/tenant/payments/new?invoice=${inv.id}`} variant="dark">
              Gửi thông tin thanh toán
            </ButtonLink>
          )
        }
      />
      <div className="grid grid--main-side">
        <Section title="Các khoản phí" flush>
          <InvoiceLinesTable invoice={inv} />
        </Section>
        <div className="stack">
          <Section title="Chuyển khoản" actions={<MockBadge>Chưa có cổng thanh toán</MockBadge>}>
            <KeyValueList
              items={[
                { label: 'Ngân hàng', value: bank.name || '—' },
                {
                  label: 'Số tài khoản',
                  value: bank.account ? (
                    <span className="row">
                      {bank.account}
                      <button
                        className="icon-btn"
                        style={{ width: 28, height: 28 }}
                        aria-label="Sao chép số tài khoản"
                        onClick={() => navigator.clipboard?.writeText(bank.account).then(() => toast.success('Đã sao chép.'))}
                      >
                        <Copy size={14} />
                      </button>
                    </span>
                  ) : (
                    '—'
                  ),
                },
                { label: 'Chủ tài khoản', value: bank.holder },
                { label: 'Nội dung', value: `${inv.code} ${inv.roomCode}` },
              ]}
            />
          </Section>
          <Section title="Chứng từ & thanh toán">
            {!payments.length ? (
              <p className="text-sm muted">Chưa có thanh toán.</p>
            ) : (
              <ul className="list-plain stack" style={{ gap: 'var(--space-3)' }}>
                {payments.map((p) => (
                  <li key={p.id}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <strong>{formatVnd(p.amount)}</strong>
                      <StatusBadge status={p.status} map={PAYMENT_STATUS} />
                    </div>
                    <p className="cell-sub">
                      {PAYMENT_METHOD[p.method]} • {formatDateTime(p.submittedAt)}
                    </p>
                    {p.note && <p className="cell-sub">{p.note}</p>}
                    {p.proofUrl && (
                      <a href={p.proofUrl} target="_blank" rel="noreferrer" className="text-xs">
                        Xem minh chứng
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}

const tenantPaymentSchema = z.object({
  invoiceId: z.string().min(1, 'Chọn hóa đơn'),
  amount: z.number({ invalid_type_error: 'Nhập số tiền', required_error: 'Nhập số tiền' }).int().positive('Số tiền phải > 0'),
  method: z.enum(['BANK_TRANSFER', 'CASH']),
  note: z.string().max(300).optional(),
});
type TenantPaymentForm = z.input<typeof tenantPaymentSchema>;

/** TPT-05 */
export function TenantPaymentPage() {
  const [s] = useSearchState(['invoice'] as const);
  const invoices = useTenantInvoices();
  const submit = useSubmitTenantPayment();
  const toast = useToast();
  const [proof, setProof] = useState<string[]>([]);
  const [proofError, setProofError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const open = (invoices.data ?? []).filter((i) => invoiceBalance(i) > 0);
  const form = useForm<TenantPaymentForm>({ resolver: zodResolver(tenantPaymentSchema), values: { invoiceId: s.invoice || open[0]?.id || '', method: 'BANK_TRANSFER', amount: undefined as unknown as number, note: '' } });
  const selected = open.find((i) => i.id === form.watch('invoiceId'));

  if (done)
    return (
      <div className="card card__body state" role="status" style={{ maxWidth: 560 }}>
        <div className="state__icon" style={{ background: 'var(--color-success-soft)', color: 'var(--color-success)' }}>
          <CheckCircle2 size={28} />
        </div>
        <p className="state__title">Đã gửi thông tin thanh toán</p>
        <p className="state__desc">
          Khoản {done} đang <strong>chờ chủ trọ xác nhận</strong>. Hóa đơn chỉ được tính là đã thanh toán sau khi chủ trọ xác nhận đã nhận tiền.
        </p>
        <div className="row">
          <ButtonLink to="/tenant/invoices" variant="dark">
            Theo dõi hóa đơn
          </ButtonLink>
          <Button variant="secondary" onClick={() => setDone(null)}>
            Gửi khoản khác
          </Button>
        </div>
      </div>
    );

  return (
    <>
      <PageHeader title="Gửi thông tin thanh toán" description="Sau khi chuyển khoản/trả tiền mặt, gửi minh chứng để chủ trọ xác nhận." />
      {invoices.isLoading ? (
        <LoadingBlock />
      ) : invoices.error ? (
        <ErrorState error={invoices.error} onRetry={() => invoices.refetch()} />
      ) : !open.length ? (
        <EmptyState icon={<CheckCircle2 size={26} />} title="Bạn không còn hóa đơn nào cần thanh toán" />
      ) : (
        <Section>
          <form
            className="stack"
            noValidate
            onSubmit={form.handleSubmit(async (v) => {
              const parsed = tenantPaymentSchema.parse(v);
              if (parsed.method === 'BANK_TRANSFER' && !proof.length) {
                setProofError('Vui lòng đính kèm ảnh minh chứng chuyển khoản');
                return;
              }
              setProofError(null);
              try {
                await submit.mutateAsync({ ...parsed, proofUrl: proof[0], note: parsed.note || undefined });
                setDone(formatVnd(parsed.amount));
                setProof([]);
              } catch (e) {
                const err = toApiError(e);
                if (err.fieldErrors?.amount) form.setError('amount', { message: err.fieldErrors.amount });
                else toast.error(err.message);
              }
            })}
          >
            <FormField label="Hóa đơn" required error={form.formState.errors.invoiceId?.message}>
              <select className="select" {...form.register('invoiceId')}>
                {open.map((i) => (
                  <option key={i.id} value={i.id}>
                    Kỳ {periodLabel(i.period)} — còn nợ {formatVnd(invoiceBalance(i))}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField
              label="Số tiền"
              required
              error={form.formState.errors.amount?.message}
              hint={selected ? `Còn nợ ${formatVnd(invoiceBalance(selected))}. Có thể thanh toán một phần.` : undefined}
            >
              <Controller control={form.control} name="amount" render={({ field }) => <CurrencyInput value={field.value} onChange={field.onChange} />} />
            </FormField>
            <FormField label="Phương thức" required>
              <select className="select" {...form.register('method')}>
                <option value="BANK_TRANSFER">Chuyển khoản</option>
                <option value="CASH">Tiền mặt (đã đưa trực tiếp)</option>
              </select>
            </FormField>
            <ImageUploader label="Ảnh minh chứng" value={proof} onChange={setProof} max={1} />
            {proofError && (
              <span className="field__error" role="alert">
                {proofError}
              </span>
            )}
            <FormField label="Ghi chú">
              <textarea className="textarea" {...form.register('note')} />
            </FormField>
            <div className="form-actions">
              <Button type="submit" variant="dark" loading={submit.isPending}>
                Gửi chờ xác nhận
              </Button>
            </div>
          </form>
        </Section>
      )}
    </>
  );
}

const maintenanceSchema = z.object({
  title: z.string().trim().min(3, 'Nhập tiêu đề'),
  description: z.string().trim().min(5, 'Mô tả sự cố'),
  priority: z.enum(['URGENT', 'MEDIUM', 'LOW']),
});

/** TPT-06 */
export function TenantMaintenancePage() {
  const { data, isLoading, error, refetch } = useTenantMaintenance();
  const create = useCreateTenantMaintenance();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const form = useForm<z.input<typeof maintenanceSchema>>({ resolver: zodResolver(maintenanceSchema), defaultValues: { title: '', description: '', priority: 'MEDIUM' } });

  return (
    <>
      <PageHeader
        title="Yêu cầu bảo trì"
        actions={
          <Button variant="dark" onClick={() => setOpen(true)}>
            <Plus size={16} aria-hidden="true" /> Tạo yêu cầu
          </Button>
        }
      />
      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !data?.length ? (
        <div className="card">
          <EmptyState icon={<Wrench size={26} />} title="Chưa có yêu cầu nào" description="Gặp sự cố trong phòng? Tạo yêu cầu để chủ trọ xử lý." />
        </div>
      ) : (
        <div className="stack">
          {data.map((m) => (
            <Section
              key={m.id}
              title={m.title}
              subtitle={`${m.roomCode} • ${formatDateTime(m.createdAt)}`}
              actions={
                <>
                  <StatusBadge status={m.priority} map={MAINTENANCE_PRIORITY} />
                  <StatusBadge status={m.status} map={MAINTENANCE_STATUS} />
                </>
              }
            >
              <p className="text-sm">{m.description}</p>
              {m.comments.filter((c) => c.role === 'STAFF').slice(-1).map((c) => (
                <div key={c.id} className="comment comment--staff" style={{ marginTop: 'var(--space-3)' }}>
                  <p className="comment__meta">
                    Phản hồi mới nhất từ {c.author} • {formatDateTime(c.at)}
                  </p>
                  <p>{c.text}</p>
                </div>
              ))}
            </Section>
          ))}
        </div>
      )}
      <Modal open={open} title="Yêu cầu bảo trì mới" onClose={() => setOpen(false)}>
        <form
          className="stack"
          noValidate
          onSubmit={form.handleSubmit(async (v) => {
            try {
              await create.mutateAsync({ ...maintenanceSchema.parse(v), images });
              toast.success('Đã gửi yêu cầu. Chủ trọ sẽ phản hồi sớm.');
              form.reset();
              setImages([]);
              setOpen(false);
            } catch (e) {
              toast.error(toApiError(e).message);
            }
          })}
        >
          <FormField label="Tiêu đề" required error={form.formState.errors.title?.message}>
            <input className="input" {...form.register('title')} placeholder="VD: Bóng đèn WC hỏng" />
          </FormField>
          <FormField label="Mô tả" required error={form.formState.errors.description?.message}>
            <textarea className="textarea" {...form.register('description')} />
          </FormField>
          <FormField label="Mức độ" required>
            <select className="select" {...form.register('priority')}>
              <option value="URGENT">Gấp</option>
              <option value="MEDIUM">Trung bình</option>
              <option value="LOW">Thấp</option>
            </select>
          </FormField>
          <ImageUploader label="Ảnh sự cố" value={images} onChange={setImages} max={4} />
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" variant="dark" loading={create.isPending}>
              Gửi yêu cầu
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

const linkSchema = z.object({
  inviteCode: z.string().trim().min(3, 'Nhập mã mời do chủ trọ cung cấp'),
  contractCode: z.string().trim().min(3, 'Nhập mã hợp đồng'),
  phone: vnPhoneSchema,
  verificationCode: z.string().trim().regex(/^\d{6}$/, 'Mã xác minh gồm 6 chữ số'),
});
type LinkForm = z.input<typeof linkSchema>;

/** TPT-07 */
export function LinkAccountPage() {
  const { data: user } = useCurrentUser();
  const requests = useLinkRequests();
  const link = useRequestLink();
  const toast = useToast();
  const [otpSent, setOtpSent] = useState(false);
  const form = useForm<LinkForm>({ resolver: zodResolver(linkSchema), defaultValues: { inviteCode: '', contractCode: '', phone: user?.phone ?? '', verificationCode: '' } });
  const pending = useMemo(() => requests.data?.some((r) => r.status === 'PENDING'), [requests.data]);

  return (
    <>
      <PageHeader
        title="Liên kết hồ sơ thuê"
        description="Kết nối tài khoản của bạn với hồ sơ người thuê do chủ trọ tạo để xem hợp đồng, hóa đơn và gửi thanh toán."
      />
      {user?.tenantLinked && (
        <div className="alert alert--success" style={{ marginBottom: 'var(--space-4)' }}>
          <CheckCircle2 size={18} aria-hidden="true" /> Tài khoản đã được liên kết. <Link to="/tenant">Vào Cổng người thuê →</Link>
        </div>
      )}
      <div className="grid grid--main-side">
        <Section title="Gửi yêu cầu liên kết" subtitle="Hệ thống KHÔNG tự liên kết theo số điện thoại. Cần xác minh + chủ trọ duyệt.">
          <form
            className="stack"
            noValidate
            onSubmit={form.handleSubmit(async (v) => {
              try {
                await link.mutateAsync(linkSchema.parse(v));
                toast.success('Đã gửi yêu cầu. Vui lòng chờ chủ trọ duyệt.');
                form.reset({ inviteCode: '', contractCode: '', phone: v.phone, verificationCode: '' });
                setOtpSent(false);
              } catch (e) {
                const err = toApiError(e);
                Object.entries(err.fieldErrors ?? {}).forEach(([f, m]) => form.setError(f as keyof LinkForm, { message: m }));
                if (!err.fieldErrors) toast.error(err.message);
              }
            })}
          >
            <div className="form-grid form-grid--2">
              <FormField label="Mã mời của nhà trọ" required error={form.formState.errors.inviteCode?.message} hint={env.useMockApi ? 'Demo: ANNHIEN' : undefined}>
                <input className="input" {...form.register('inviteCode')} style={{ textTransform: 'uppercase' }} />
              </FormField>
              <FormField label="Mã hợp đồng" required error={form.formState.errors.contractCode?.message} hint="In trên hợp đồng, VD: HĐ-1024">
                <input className="input" {...form.register('contractCode')} />
              </FormField>
              <FormField label="SĐT đăng ký trong hợp đồng" required error={form.formState.errors.phone?.message}>
                <input className="input" type="tel" {...form.register('phone')} />
              </FormField>
              <FormField label="Mã xác minh (OTP)" required error={form.formState.errors.verificationCode?.message} hint={env.useMockApi ? 'Demo OTP: 123456' : undefined}>
                <div className="row">
                  <input className="input" inputMode="numeric" maxLength={6} {...form.register('verificationCode')} />
                  <Button variant="secondary" onClick={() => setOtpSent(true)} disabled={otpSent}>
                    {otpSent ? 'Đã gửi' : 'Gửi mã'}
                  </Button>
                </div>
              </FormField>
            </div>
            {otpSent && (
              <p className="alert alert--info">
                <MockBadge>Mock</MockBadge> OTP chưa được gửi thật qua SMS. Trong bản demo dùng mã 123456.
              </p>
            )}
            <div className="form-actions">
              <Button type="submit" variant="dark" loading={link.isPending} disabled={pending}>
                <KeyRound size={16} aria-hidden="true" /> {pending ? 'Đang có yêu cầu chờ duyệt' : 'Gửi yêu cầu liên kết'}
              </Button>
            </div>
          </form>
        </Section>
        <Section title="Yêu cầu của bạn">
          {requests.isLoading ? (
            <LoadingBlock lines={2} />
          ) : !requests.data?.length ? (
            <p className="text-sm muted">Chưa có yêu cầu nào.</p>
          ) : (
            <ul className="list-plain stack" style={{ gap: 'var(--space-3)' }}>
              {requests.data.map((r) => (
                <li key={r.id}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <strong>{r.contractCode}</strong>
                    <Badge tone={r.status === 'APPROVED' ? 'success' : r.status === 'PENDING' ? 'warning' : 'danger'}>
                      {r.status === 'APPROVED' ? 'Đã duyệt' : r.status === 'PENDING' ? 'Chờ chủ trọ duyệt' : 'Bị từ chối'}
                    </Badge>
                  </div>
                  <p className="cell-sub">
                    {r.workspaceName} • {formatDateTime(r.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
