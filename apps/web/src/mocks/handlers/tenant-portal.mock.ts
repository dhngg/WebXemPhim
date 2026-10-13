import type { TenantPortalApi } from '@/features/tenant-portal/api';
import type { LinkRequest } from '@/features/tenant-portal/types';
import type { MaintenanceRequest } from '@/features/maintenance/types';
import type { Payment } from '@/features/billing/types';
import { invoiceBalance } from '@/features/billing/calc';
import { formatVnd } from '@/lib/format';
import { audit, db, nextId } from '../db';
import { conflict, requireLinkedTenant, validation } from '../guard';
import { notFound, simulate } from '../mockUtils';
import { requireSession } from './auth.mock';

/** Mã mời demo cho workspace (do chủ trọ cung cấp cho người thuê). */
export const DEMO_INVITE_CODES: Record<string, string> = { ANNHIEN: 'ws-an-nhien' };
/** Mã OTP giả lập — chưa có dịch vụ gửi OTP thật. */
export const DEMO_OTP = '123456';

function myContracts(tenantId: string) {
  return db.contracts
    .filter((c) => c.occupantIds.includes(tenantId) && c.status !== 'DRAFT')
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
}

function myInvoices(tenantId: string) {
  const ids = new Set(myContracts(tenantId).map((c) => c.id));
  return db.invoices.filter((i) => ids.has(i.contractId) && i.status !== 'DRAFT').sort((a, b) => b.period.localeCompare(a.period));
}

export const tenantPortalMock: TenantPortalApi = {
  async overview() {
    await simulate();
    const { tenantId } = requireLinkedTenant();
    const contract = myContracts(tenantId).find((c) => c.status === 'ACTIVE') ?? null;
    const invoices = myInvoices(tenantId);
    return {
      contract,
      latestInvoice: invoices[0] ?? null,
      outstanding: invoices.reduce((s, i) => s + invoiceBalance(i), 0),
      pendingPayments: db.payments.filter((p) => p.status === 'PENDING' && invoices.some((i) => i.id === p.invoiceId)),
      notices: [
        { id: 'nt-1', title: 'Cắt nước bảo trì bồn chứa 8:00–11:00 Chủ nhật tuần này', at: new Date().toISOString() },
        { id: 'nt-2', title: 'Nhắc nhở: giữ yên lặng sau 22:00', at: new Date(Date.now() - 5 * 86_400_000).toISOString() },
      ],
    };
  },
  async contracts() {
    await simulate();
    const { tenantId } = requireLinkedTenant();
    return myContracts(tenantId);
  },
  async invoices() {
    const { empty } = await simulate();
    const { tenantId } = requireLinkedTenant();
    return empty ? [] : myInvoices(tenantId);
  },
  async invoice(id) {
    await simulate();
    const { tenantId } = requireLinkedTenant();
    const invoice = myInvoices(tenantId).find((i) => i.id === id) ?? notFound('Không tìm thấy hóa đơn.');
    const s = db.settings[invoice.workspaceId];
    return {
      invoice,
      payments: db.payments.filter((p) => p.invoiceId === id).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
      bank: { name: s?.bankName ?? '', account: s?.bankAccount ?? '', holder: s?.contactName ?? '' },
    };
  },
  async submitPayment(input) {
    await simulate();
    const { tenantId, user } = requireLinkedTenant();
    const inv = myInvoices(tenantId).find((i) => i.id === input.invoiceId) ?? notFound('Không tìm thấy hóa đơn.');
    const pending = db.payments.filter((p) => p.invoiceId === inv.id && p.status === 'PENDING').reduce((s, p) => s + p.amount, 0);
    const max = invoiceBalance(inv) - pending;
    if (input.amount <= 0) validation('Số tiền không hợp lệ.', { amount: 'Số tiền phải lớn hơn 0' });
    if (input.amount > max) validation('Số tiền vượt quá số còn nợ.', { amount: `Tối đa ${formatVnd(Math.max(0, max))} (đã trừ khoản đang chờ xác nhận)` });
    if (input.method === 'BANK_TRANSFER' && !input.proofUrl) validation('Thiếu minh chứng.', { proofUrl: 'Vui lòng đính kèm ảnh minh chứng chuyển khoản' });
    const pm: Payment = {
      ...input,
      id: nextId('pay'),
      workspaceId: inv.workspaceId,
      invoiceCode: inv.code,
      roomCode: inv.roomCode,
      tenantName: inv.tenantName,
      status: 'PENDING',
      submittedBy: 'TENANT',
      submittedAt: new Date().toISOString(),
    };
    db.payments.push(pm);
    db.notifications.unshift({
      id: nextId('n'),
      userId: 'u-owner',
      title: 'Người thuê gửi minh chứng thanh toán',
      body: `${inv.tenantName} (${inv.roomCode}) gửi ${formatVnd(input.amount)} cho ${inv.code}.`,
      link: `/w/${inv.workspaceId}/payments`,
      read: false,
      createdAt: pm.submittedAt,
    });
    audit(user.email, `Gửi minh chứng thanh toán ${formatVnd(input.amount)}`, inv.code, 'BILLING');
    return pm;
  },
  async maintenance() {
    const { empty } = await simulate();
    const { tenantId } = requireLinkedTenant();
    if (empty) return [];
    const roomIds = new Set(myContracts(tenantId).filter((c) => c.status === 'ACTIVE').map((c) => c.roomId));
    return db.maintenance.filter((m) => roomIds.has(m.roomId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async createMaintenance(input) {
    await simulate();
    const { tenantId, user } = requireLinkedTenant();
    const contract = myContracts(tenantId).find((c) => c.status === 'ACTIVE');
    if (!contract) conflict('Bạn không có hợp đồng đang hiệu lực.');
    const now = new Date().toISOString();
    const m: MaintenanceRequest = {
      ...input,
      id: nextId('mnt'),
      workspaceId: contract.workspaceId,
      roomId: contract.roomId,
      roomCode: contract.roomCode,
      buildingName: contract.buildingName,
      tenantName: user.fullName,
      status: 'OPEN',
      createdAt: now,
      updatedAt: now,
      comments: [{ id: nextId('cmt'), author: user.fullName, role: 'TENANT', text: input.description, at: now }],
    };
    db.maintenance.unshift(m);
    return m;
  },
  async linkRequests() {
    await simulate();
    const { user } = requireSession();
    return db.linkRequests[user.id] ?? [];
  },
  async requestLink(input) {
    await simulate();
    const { user } = requireSession();
    const errors: Record<string, string> = {};
    const ws = DEMO_INVITE_CODES[input.inviteCode.trim().toUpperCase()];
    if (!ws) errors.inviteCode = 'Mã mời không đúng (demo: ANNHIEN)';
    if (input.verificationCode !== DEMO_OTP) errors.verificationCode = 'Mã xác minh không đúng (demo: 123456)';
    if (Object.keys(errors).length) validation('Thông tin xác minh không hợp lệ.', errors);
    const contract = db.contracts.find((c) => c.workspaceId === ws && c.code.toUpperCase() === input.contractCode.trim().toUpperCase());
    const tenant = contract && db.tenants.find((t) => t.id === contract.primaryTenantId);
    // Xác minh: SĐT khai báo phải khớp hồ sơ người đứng tên — đây là BƯỚC XÁC MINH,
    // không phải tự liên kết; chủ trọ vẫn phải duyệt (BR-07).
    if (!contract || !tenant || tenant.phone !== input.phone.replace(/\s/g, '')) {
      validation('Không tìm thấy hợp đồng khớp thông tin.', { contractCode: 'Mã hợp đồng hoặc SĐT không khớp hồ sơ' });
    }
    if (tenant.accountLinkStatus !== 'UNLINKED') conflict('Hồ sơ này đã liên kết hoặc đang chờ duyệt.');
    tenant.accountLinkStatus = 'PENDING';
    db.pendingLinks[tenant.id] = user.id;
    const req: LinkRequest = {
      id: nextId('lr'),
      workspaceName: db.settings[ws!]?.name ?? '',
      contractCode: contract.code,
      phone: input.phone,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };
    db.linkRequests[user.id] = [req, ...(db.linkRequests[user.id] ?? [])];
    audit(user.email, 'Gửi yêu cầu liên kết hồ sơ thuê', contract.code, 'USER');
    return req;
  },
};
