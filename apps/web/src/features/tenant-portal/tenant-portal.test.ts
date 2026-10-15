import { beforeEach, describe, expect, it, vi } from 'vitest';

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
const ctl = vi.hoisted(() => ({ record: null as unknown, empty: false }));

vi.mock('@/services/http/httpClient', () => ({ httpClient: http }));
vi.mock('@/mocks/mockUtils', () => ({ simulate: async () => ({ empty: ctl.empty }), notFound: () => { throw new Error('nf'); } }));
vi.mock('@/mocks/handlers/auth.mock', () => ({ requireSession: () => ctl.record, currentMockUser: () => null }));

import { capabilitiesMock } from '@/mocks/handlers/capabilities.mock';
import { tenancyMock } from '@/mocks/handlers/tenancy.mock';
import { tenantPortalMock } from '@/mocks/handlers/tenant-portal.mock';
import { DEMO_INVITATIONS, registerInvitation } from '@/mocks/tenant-links';
import { tenantPortalHttp } from './api';
import { canCancelMaintenance, canRequestMaintenance, invitationSchema, tenantErrorMessage, toCancelBody, toCreateMaintenanceBody } from './model';
import { ApiError } from '@/services/http/ApiError';
import apiSource from './api.ts?raw';
import hooksSource from './hooks.ts?raw';
import modelSource from './model.ts?raw';
import homeSource from '../../pages/tenant/TenantPages.tsx?raw';
import contractsSource from '../../pages/tenant/TenantContractPages.tsx?raw';
import invoicesSource from '../../pages/tenant/TenantInvoicePages.tsx?raw';
import maintenanceSource from '../../pages/tenant/TenantMaintenancePages.tsx?raw';
import layoutSource from '../../layouts/TenantLayout.tsx?raw';
import routerSource from '../../app/router.tsx?raw';
import mockSource from '../../mocks/handlers/tenant-portal.mock.ts?raw';

const ID = '99999999-9999-4999-8999-999999999999';
const H = tenantPortalHttp;
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

beforeEach(() => {
  for (const fn of Object.values(http)) fn.mockReset();
  ctl.empty = false;
});

// ===================================================================== 14 endpoint đúng URL / query / body
describe('HTTP adapter: 14 endpoint /me của backend', () => {
  it('Identity & Linking: accept chỉ gửi { token }; link-requests/me và tenants/me', async () => {
    http.post.mockResolvedValue({});
    await H.acceptInvitation({ token: 'T'.repeat(43) });
    expect(http.post).toHaveBeenLastCalledWith('/tenant-invitations/accept', { token: 'T'.repeat(43) });
    http.get.mockResolvedValue({ items: [], page: 1, limit: 20, total: 0 });
    await H.linkRequests({ status: 'PENDING', page: 2, limit: 10 });
    expect(http.get).toHaveBeenLastCalledWith('/tenant-link-requests/me', { query: { status: 'PENDING', page: 2, limit: 10 } });
    await H.linkRequests({ page: 1, limit: 20 });
    expect(http.get).toHaveBeenLastCalledWith('/tenant-link-requests/me', { query: { status: undefined, page: 1, limit: 20 } });
    http.get.mockResolvedValue([]);
    await H.linkedTenants();
    expect(http.get).toHaveBeenLastCalledWith('/tenants/me');
  });

  it('Contracts: danh sách có status/page/limit, chi tiết và sổ cọc có phân trang riêng', async () => {
    http.get.mockResolvedValue({});
    await H.contracts({ status: 'ENDED', page: 3, limit: 5 });
    expect(http.get).toHaveBeenLastCalledWith('/contracts/me', { query: { status: 'ENDED', page: 3, limit: 5 } });
    await H.contract(ID);
    expect(http.get).toHaveBeenLastCalledWith(`/contracts/me/${ID}`);
    await H.deposit(ID, { page: 2, limit: 7 });
    expect(http.get).toHaveBeenLastCalledWith(`/contracts/me/${ID}/deposit`, { query: { page: 2, limit: 7 } });
  });

  it('Invoices: danh sách theo kỳ, chi tiết, điều chỉnh và thanh toán phân trang độc lập', async () => {
    http.get.mockResolvedValue({});
    await H.invoices({ period: '2026-09', page: 2, limit: 20 });
    expect(http.get).toHaveBeenLastCalledWith('/invoices/me', { query: { period: '2026-09', page: 2, limit: 20 } });
    await H.invoice(ID);
    expect(http.get).toHaveBeenLastCalledWith(`/invoices/me/${ID}`);
    await H.adjustments(ID, { page: 4, limit: 3 });
    expect(http.get).toHaveBeenLastCalledWith(`/invoices/me/${ID}/adjustments`, { query: { page: 4, limit: 3 } });
    await H.payments(ID, { page: 5, limit: 2 });
    expect(http.get).toHaveBeenLastCalledWith(`/invoices/me/${ID}/payments`, { query: { page: 5, limit: 2 } });
  });

  it('Maintenance: tạo đúng DTO, danh sách lọc status, chi tiết, hủy với { reason? }', async () => {
    http.post.mockResolvedValue({});
    await H.createMaintenance({ contractId: ID, title: 'A', description: 'B', priority: 'HIGH' });
    expect(http.post).toHaveBeenLastCalledWith('/maintenance-requests/me', { contractId: ID, title: 'A', description: 'B', priority: 'HIGH' });
    http.get.mockResolvedValue({});
    await H.maintenance({ status: 'OPEN', page: 1, limit: 20 });
    expect(http.get).toHaveBeenLastCalledWith('/maintenance-requests/me', { query: { status: 'OPEN', page: 1, limit: 20 } });
    await H.maintenanceRequest(ID);
    expect(http.get).toHaveBeenLastCalledWith(`/maintenance-requests/me/${ID}`);
    await H.cancelMaintenance(ID, { reason: 'Tự khắc phục' });
    expect(http.post).toHaveBeenLastCalledWith(`/maintenance-requests/me/${ID}/cancel`, { reason: 'Tự khắc phục' });
    await H.cancelMaintenance(ID, {});
    expect(http.post).toHaveBeenLastCalledWith(`/maintenance-requests/me/${ID}/cancel`, {});
  });

  it('không còn URL /tenant/* cũ, không gọi API chủ trọ, và KHÔNG có POST /tenants/:id/link-requests (hoãn theo chủ sản phẩm)', () => {
    const api = strip(apiSource);
    expect(api).not.toMatch(/['"`]\/tenant\//);
    expect(api).not.toMatch(/\/workspaces\//);
    const all = [apiSource, hooksSource, modelSource, homeSource, contractsSource, invoicesSource, maintenanceSource].map(strip).join('\n');
    expect(all).not.toMatch(/tenants\/\$\{[^}]*\}\/link-requests/);
    expect(all).not.toMatch(/requestLink|useRequestLink|createLinkRequest/);
    // đúng 14 hàm HTTP /me (không có hàm thứ 15)
    const calls = api.match(/httpClient\.(get|post|patch|delete)\(/g) ?? [];
    expect(calls).toHaveLength(14);
  });
});

// ===================================================================== Giao diện không còn tính năng chỉ có ở mock
describe('chính sách V1 của Cổng người thuê', () => {
  it('không có minh chứng thanh toán, OTP, mã hợp đồng, form nhập mã hồ sơ UUID hay ảnh', () => {
    const ui = [homeSource, contractsSource, invoicesSource, maintenanceSource, layoutSource].map(strip).join('\n');
    expect(ui).not.toMatch(/proof|minh chứng|OTP|verificationCode|contractCode|inviteCode|ImageUploader|MockBadge|submitPayment|Gửi thanh toán|payments\/new/i);
    expect(ui).not.toMatch(/tenantId\s*[:=]\s*useState|nhập mã hồ sơ|UUID/i);
    expect(strip(routerSource)).not.toMatch(/payments\/new|TenantPaymentPage/);
  });

  it('không dùng mô hình legacy hay API chủ trọ; tiền chỉ định dạng ở UI', () => {
    const files = [apiSource, hooksSource, modelSource, homeSource, contractsSource, invoicesSource, maintenanceSource].map(strip).join('\n');
    expect(files).not.toMatch(/from '@\/features\/(leasing|billing)\b/);
    expect(files).not.toMatch(/from '@\/features\/maintenance\/(owner-api|owner-hooks|types)/);
    expect(files).not.toMatch(/assigneeUserId|comments|images/);
    expect(files).not.toMatch(/parseFloat|\.reduce\(|\+=\s*Number/);
  });

  it('mock Cổng người thuê không còn dữ liệu cũ (OTP, bank, proof)', () => {
    expect(strip(mockSource)).not.toMatch(/DEMO_OTP|proofUrl|submitPayment|\bbank:/);
  });

  it('menu người thuê có Thông báo và Liên kết tài khoản, không có Gửi thanh toán', () => {
    expect(layoutSource).toMatch(/\/notifications/);
    expect(layoutSource).toMatch(/\/tenant\/link-account/);
    expect(layoutSource).not.toMatch(/payments/);
  });
});

// ===================================================================== Model
describe('model', () => {
  it('mã mời phải đúng 43 ký tự base64url', () => {
    expect(invitationSchema.safeParse({ token: DEMO_INVITATIONS.valid }).success).toBe(true);
    expect(invitationSchema.safeParse({ token: `  ${DEMO_INVITATIONS.valid}  ` }).success).toBe(true); // cắt khoảng trắng
    for (const bad of ['', 'abc', 'x'.repeat(42), 'x'.repeat(44), `${'x'.repeat(42)}!`, `${'x'.repeat(42)} `.replace(' ', '+')]) {
      expect(invitationSchema.safeParse({ token: bad }).success, bad).toBe(false);
    }
  });
  it('chỉ hợp đồng ACTIVE đã đến ngày bắt đầu mới gửi được yêu cầu bảo trì; chỉ OPEN mới hủy được', () => {
    expect(canRequestMaintenance({ status: 'ACTIVE', phase: 'IN_EFFECT' })).toBe(true);
    expect(canRequestMaintenance({ status: 'ACTIVE', phase: 'OVERDUE' })).toBe(true);
    expect(canRequestMaintenance({ status: 'ACTIVE', phase: 'UPCOMING' })).toBe(false);
    expect(canRequestMaintenance({ status: 'ENDED', phase: 'ENDED' })).toBe(false);
    expect(canRequestMaintenance({ status: 'ENDED', phase: 'CANCELLED' })).toBe(false);
    expect(canCancelMaintenance({ status: 'OPEN' })).toBe(true);
    for (const s of ['IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELLED'] as const) expect(canCancelMaintenance({ status: s })).toBe(false);
  });
  it('body tạo/hủy: ưu tiên và lý do chỉ gửi khi có; không gửi roomId', () => {
    expect(toCreateMaintenanceBody({ contractId: ID, title: ' A ', description: ' B ', priority: '' })).toEqual({ contractId: ID, title: 'A', description: 'B' });
    expect(toCreateMaintenanceBody({ contractId: ID, title: 'A', description: 'B', priority: 'URGENT' })).toEqual({ contractId: ID, title: 'A', description: 'B', priority: 'URGENT' });
    expect(toCancelBody({ reason: '   ' })).toEqual({});
    expect(toCancelBody({ reason: ' Tự sửa ' })).toEqual({ reason: 'Tự sửa' });
  });
  it('thông báo lỗi theo mã backend', () => {
    const e = (code: string, statusCode = 409) => new ApiError({ statusCode, code, message: 'raw' });
    expect(tenantErrorMessage(e('TENANT_INVITATION_INVALID', 400))).toMatch(/không hợp lệ.*hết hạn.*đã được sử dụng/);
    expect(tenantErrorMessage(e('TENANT_INVITATION_CONFLICT'))).toMatch(/đã có tài khoản liên kết/);
    expect(tenantErrorMessage(e('MAINTENANCE_NOT_ELIGIBLE'))).toMatch(/đang hiệu lực/);
    expect(tenantErrorMessage(e('MAINTENANCE_NOT_CANCELLABLE'))).toMatch(/tiếp nhận/);
    expect(tenantErrorMessage(new ApiError({ statusCode: 500, message: 'Lỗi máy chủ' }))).toBe('Lỗi máy chủ');
  });
});

// ===================================================================== Mock theo đúng backend
const NAM = 'u-tenant';
const as = (id: string, memberships: unknown[] = []) => {
  ctl.record = { user: { id, fullName: id, email: `${id}@x.vn`, globalRole: 'USER', tenantLinked: false }, memberships };
};
const page = { page: 1, limit: 50 };

describe('mock: hợp đồng và sổ cọc', () => {
  beforeEach(() => as(NAM));

  it('một hồ sơ liên kết, không lộ ghi chú nội bộ; hợp đồng đủ pha, tiền là chuỗi thập phân', async () => {
    const tenants = await tenantPortalMock.linkedTenants();
    expect(tenants.map((t) => t.id)).toEqual(['ten-1']);
    expect(tenants[0]).not.toHaveProperty('notes');
    const res = await tenantPortalMock.contracts(page);
    expect(res.total).toBe(4);
    expect(new Set(res.items.map((c) => c.phase))).toEqual(new Set(['IN_EFFECT', 'UPCOMING', 'ENDED', 'CANCELLED']));
    for (const c of res.items) {
      expect(c.monthlyRent).toMatch(/^\d+$/);
      expect(['ACTIVE', 'ENDED']).toContain(c.status);
      expect(c.room.code).toBeTruthy();
      expect(c.tenant.fullName).toBe('Trần Văn Nam');
      for (const legacy of ['code', 'buildingName', 'primaryTenantName', 'deposit', 'occupantIds', 'waterMode']) expect(c).not.toHaveProperty(legacy);
    }
    expect(res.items.map((c) => c.startDate)).toEqual([...res.items.map((c) => c.startDate)].sort().reverse());
    expect((await tenantPortalMock.contracts({ status: 'ENDED', page: 1, limit: 50 })).items.map((c) => c.phase).sort()).toEqual(['CANCELLED', 'ENDED']);
    expect((await tenantPortalMock.contracts({ status: 'ACTIVE', page: 1, limit: 50 })).total).toBe(2);
  });

  it('phân trang thật và kiểm tra tham số như backend', async () => {
    const first = await tenantPortalMock.contracts({ page: 1, limit: 1 });
    expect(first).toMatchObject({ page: 1, limit: 1, total: 4 });
    expect(first.items).toHaveLength(1);
    expect((await tenantPortalMock.contracts({ page: 4, limit: 1 })).items).toHaveLength(1);
    expect((await tenantPortalMock.contracts({ page: 5, limit: 1 })).items).toHaveLength(0);
    await expect(tenantPortalMock.contracts({ page: 0, limit: 20 })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(tenantPortalMock.contracts({ page: 1, limit: 51 })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('xem được hợp đồng tương lai và đã hủy; hợp đồng của người khác là 404', async () => {
    expect((await tenantPortalMock.contract('ctr-t1-upcoming')).phase).toBe('UPCOMING');
    expect((await tenantPortalMock.contract('ctr-t1-cancelled')).phase).toBe('CANCELLED');
    await expect(tenantPortalMock.contract('ctr-2')).rejects.toMatchObject({ status: 404, code: 'CONTRACT_NOT_FOUND' });
    await expect(tenantPortalMock.deposit('ctr-2', page)).rejects.toMatchObject({ status: 404, code: 'CONTRACT_NOT_FOUND' });
  });

  it('sổ cọc: tổng của CẢ hợp đồng (không phải của trang), có bản đảo, hợp đồng hết hạn/hủy/tương lai vẫn xem được', async () => {
    const ended = await tenantPortalMock.deposit('ctr-t1-ended', { page: 1, limit: 1 });
    expect(ended).toMatchObject({ collectedTotal: '3200000', deductedTotal: '300000', refundedTotal: '2900000', balance: '0', total: 3, page: 1, limit: 1 });
    expect(ended.items).toHaveLength(1);
    expect((await tenantPortalMock.deposit('ctr-t1-ended', { page: 3, limit: 1 })).items).toHaveLength(1);
    const active = await tenantPortalMock.deposit('ctr-1', page);
    expect(active.items.map((e) => e.kind).sort()).toEqual(['COLLECTION', 'COLLECTION', 'REVERSAL']);
    expect(active.items.filter((e) => e.reversedByEntryId)).toHaveLength(1);
    expect(Number(active.collectedTotal)).toBe(Number(active.balance));
    expect((await tenantPortalMock.deposit('ctr-t1-upcoming', page)).balance).toBe('3500000');
    expect(await tenantPortalMock.deposit('ctr-t1-cancelled', page)).toMatchObject({ total: 0, items: [], balance: '0', collectedTotal: '0' });
  });
});

describe('mock: hóa đơn, điều chỉnh, thanh toán', () => {
  beforeEach(() => as(NAM));

  it('chỉ thấy hóa đơn ISSUED của mình, tách status và paymentStatus, mới nhất trước, tiền là chuỗi', async () => {
    const res = await tenantPortalMock.invoices(page);
    expect(res.total).toBe(3);
    expect(res.items.every((i) => i.status === 'ISSUED')).toBe(true);
    expect(res.items.map((i) => i.paymentStatus).sort()).toEqual(['PAID', 'PARTIALLY_PAID', 'UNPAID']);
    expect(res.items.map((i) => i.period)).toEqual([...res.items.map((i) => i.period)].sort().reverse());
    for (const i of res.items) {
      for (const v of [i.totalAmount, i.adjustedTotal, i.paidTotal, i.outstanding]) expect(v).toMatch(/^\d+$/);
      expect(i.isComplete).toBe(true);
      expect(i.items.length).toBeGreaterThan(1);
    }
    expect(res.items.every((i) => i.tenantId === 'ten-1')).toBe(true); // không lẫn hóa đơn người khác hay bản nháp
    expect((await tenantPortalMock.invoices({ period: res.items[1]!.period, page: 1, limit: 20 })).items.map((i) => i.id)).toEqual([res.items[1]!.id]);
    const first = await tenantPortalMock.invoices({ page: 1, limit: 2 });
    const second = await tenantPortalMock.invoices({ page: 2, limit: 2 });
    expect([first.items.length, second.items.length, second.total]).toEqual([2, 1, 3]);
  });

  it('chi tiết: hóa đơn nháp hoặc của người khác là 404', async () => {
    const [latest] = (await tenantPortalMock.invoices(page)).items;
    expect((await tenantPortalMock.invoice(latest!.id)).id).toBe(latest!.id);
    await expect(tenantPortalMock.invoice('tinv-ctr-3-x')).rejects.toMatchObject({ status: 404, code: 'INVOICE_NOT_FOUND' });
    const draft = latest!.id.replace(/\d{4}-\d{2}$/, '') + new Date().toISOString().slice(0, 7);
    await expect(tenantPortalMock.invoice(draft)).rejects.toMatchObject({ status: 404 });
    await expect(tenantPortalMock.payments(draft, page)).rejects.toMatchObject({ status: 404 });
    await expect(tenantPortalMock.adjustments(draft, page)).rejects.toMatchObject({ status: 404 });
  });

  it('sổ thanh toán: có PAYMENT và REVERSAL, số liệu của cả hóa đơn không phụ thuộc trang', async () => {
    const paid = (await tenantPortalMock.invoices(page)).items.find((i) => i.paymentStatus === 'PAID' && i.id.includes('ctr-1'))!;
    const full = await tenantPortalMock.payments(paid.id, page);
    expect(full.items.map((p) => p.kind)).toEqual(['PAYMENT', 'REVERSAL', 'PAYMENT']);
    expect(full.items[0]!.reversedByPaymentId).toBe(full.items[1]!.id);
    expect(full.items[1]!.reversesPaymentId).toBe(full.items[0]!.id);
    expect(full).toMatchObject({ amountDue: paid.adjustedTotal, paidTotal: paid.paidTotal, outstanding: '0', paymentStatus: 'PAID' });
    const one = await tenantPortalMock.payments(paid.id, { page: 2, limit: 1 });
    expect(one.items).toHaveLength(1);
    expect(one).toMatchObject({ total: 3, paidTotal: full.paidTotal, amountDue: full.amountDue, paymentStatus: 'PAID' });
    const partial = (await tenantPortalMock.invoices(page)).items.find((i) => i.paymentStatus === 'PARTIALLY_PAID')!;
    const part = await tenantPortalMock.payments(partial.id, page);
    expect(part.paymentStatus).toBe('PARTIALLY_PAID');
    expect(Number(part.outstanding)).toBeGreaterThan(0);
    for (const bad of ['pending', 'proofUrl', 'status']) expect(part.items[0]).not.toHaveProperty(bad);
  });

  it('sổ điều chỉnh: bút toán sửa lại tham chiếu bút toán cũ, tổng theo cả hóa đơn', async () => {
    const adjusted = (await tenantPortalMock.invoices(page)).items.find((i) => i.adjustmentsTotal !== '0')!;
    const adj = await tenantPortalMock.adjustments(adjusted.id, page);
    expect(adj.total).toBe(2);
    expect(adj).toMatchObject({ adjustmentsTotal: '70000' });
    expect(Number(adj.adjustedTotal)).toBe(Number(adj.originalTotal) + 70000);
    expect(adj.adjustedTotal).toBe(adjusted.adjustedTotal);
    expect(adj.items.filter((a) => a.referenceAdjustmentId)).toHaveLength(1);
    const small = await tenantPortalMock.adjustments(adjusted.id, { page: 1, limit: 1 });
    expect(small.items).toHaveLength(1);
    expect(small.adjustmentsTotal).toBe('70000');
    const none = (await tenantPortalMock.invoices(page)).items.find((i) => i.adjustmentsTotal === '0')!;
    expect(await tenantPortalMock.adjustments(none.id, page)).toMatchObject({ total: 0, items: [], adjustmentsTotal: '0' });
  });

  it('trạng thái rỗng khi mock=empty', async () => {
    ctl.empty = true;
    expect((await tenantPortalMock.invoices(page)).items).toEqual([]);
    expect((await tenantPortalMock.contracts(page)).total).toBe(0);
    expect(await tenantPortalMock.linkedTenants()).toEqual([]);
  });
});

describe('mock: bảo trì', () => {
  beforeEach(() => as(NAM));

  it('danh sách và chi tiết: ẩn người phụ trách/người đổi, lọc theo trạng thái, phân trang', async () => {
    const all = await tenantPortalMock.maintenance({ page: 1, limit: 50 });
    expect(all.total).toBeGreaterThanOrEqual(4);
    for (const r of all.items) {
      expect(r.assigneeUserId).toBeNull();
      expect(r.requestedBy).toBeNull();
      expect(r).not.toHaveProperty('history');
    }
    expect((await tenantPortalMock.maintenance({ status: 'IN_PROGRESS', page: 1, limit: 50 })).items.map((r) => r.id)).toEqual(['tmnt-doing']);
    expect((await tenantPortalMock.maintenance({ page: 1, limit: 1 })).items).toHaveLength(1);
    const detail = await tenantPortalMock.maintenanceRequest('tmnt-doing');
    expect(detail.history).toHaveLength(2);
    expect(detail.history!.every((h) => h.assigneeUserId === null && h.changedBy === null)).toBe(true);
    expect(detail.history!.at(-1)).toMatchObject({ fromStatus: 'OPEN', toStatus: 'IN_PROGRESS', note: 'Đã hẹn thợ sửa' });
  });

  it('tạo: hợp đồng đang hiệu lực OK; tương lai → 409 MAINTENANCE_NOT_ELIGIBLE; đã kết thúc/của người khác → 404; dữ liệu sai → 400', async () => {
    const created = await tenantPortalMock.createMaintenance({ contractId: 'ctr-1', title: '  Hỏng khóa ', description: ' Kẹt ' });
    expect(created).toMatchObject({ status: 'OPEN', priority: 'MEDIUM', title: 'Hỏng khóa', description: 'Kẹt', contractId: 'ctr-1', tenantId: 'ten-1', assigneeUserId: null, requestedBy: null });
    expect(created.history).toHaveLength(1);
    expect((await tenantPortalMock.maintenanceRequest(created.id)).id).toBe(created.id);
    expect((await tenantPortalMock.maintenance({ page: 1, limit: 50 })).items.some((r) => r.id === created.id)).toBe(true);
    await expect(tenantPortalMock.createMaintenance({ contractId: 'ctr-t1-upcoming', title: 'A', description: 'B' })).rejects.toMatchObject({ status: 409, code: 'MAINTENANCE_NOT_ELIGIBLE' });
    await expect(tenantPortalMock.createMaintenance({ contractId: 'ctr-t1-ended', title: 'A', description: 'B' })).rejects.toMatchObject({ status: 404, code: 'CONTRACT_NOT_FOUND' });
    await expect(tenantPortalMock.createMaintenance({ contractId: 'ctr-2', title: 'A', description: 'B' })).rejects.toMatchObject({ status: 404, code: 'CONTRACT_NOT_FOUND' });
    await expect(tenantPortalMock.createMaintenance({ contractId: 'ctr-1', title: '   ', description: 'B' })).rejects.toMatchObject({ status: 400 });
    await expect(tenantPortalMock.createMaintenance({ contractId: 'ctr-1', title: 'x'.repeat(151), description: 'B' })).rejects.toMatchObject({ status: 400 });
  });

  it('hủy: chỉ OPEN; ghi lý do vào lịch sử; hủy lại hoặc yêu cầu đã nhận xử lý → 409; của người khác → 404', async () => {
    const r = await tenantPortalMock.createMaintenance({ contractId: 'ctr-1', title: 'Hủy thử', description: 'x', priority: 'LOW' });
    const cancelled = await tenantPortalMock.cancelMaintenance(r.id, { reason: ' Đã tự sửa ' });
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.history!.at(-1)).toMatchObject({ fromStatus: 'OPEN', toStatus: 'CANCELLED', note: 'Đã tự sửa', changedBy: null });
    await expect(tenantPortalMock.cancelMaintenance(r.id, {})).rejects.toMatchObject({ status: 409, code: 'MAINTENANCE_NOT_CANCELLABLE' });
    await expect(tenantPortalMock.cancelMaintenance('tmnt-doing', {})).rejects.toMatchObject({ status: 409, code: 'MAINTENANCE_NOT_CANCELLABLE' });
    await expect(tenantPortalMock.cancelMaintenance('tmnt-done', {})).rejects.toMatchObject({ status: 409 });
    await expect(tenantPortalMock.cancelMaintenance(r.id, { reason: 'x'.repeat(501) })).rejects.toMatchObject({ status: 400 });
    const noReason = await tenantPortalMock.createMaintenance({ contractId: 'ctr-1', title: 'Hủy không lý do', description: 'x' });
    expect((await tenantPortalMock.cancelMaintenance(noReason.id, {})).history!.at(-1)!.note).toBeNull();
    as('u-owner');
    await expect(tenantPortalMock.maintenanceRequest('tmnt-open')).rejects.toMatchObject({ status: 404, code: 'MAINTENANCE_NOT_FOUND' });
    await expect(tenantPortalMock.cancelMaintenance('tmnt-open', {})).rejects.toMatchObject({ status: 404 });
  });
});

describe('mock: lịch sử yêu cầu liên kết (chỉ đọc)', () => {
  it('chỉ của chính tài khoản, mới nhất trước, lọc status, phân trang', async () => {
    as(NAM);
    const all = await tenantPortalMock.linkRequests(page);
    expect(all.items.map((r) => r.status)).toEqual(['PENDING', 'REJECTED', 'APPROVED']);
    expect(all.items.every((r) => r.requesterUserId === NAM && r.tenant.fullName)).toBe(true);
    expect((await tenantPortalMock.linkRequests({ status: 'APPROVED', page: 1, limit: 50 })).items).toHaveLength(1);
    expect(await tenantPortalMock.linkRequests({ page: 2, limit: 1 })).toMatchObject({ total: 3, page: 2, limit: 1 });
    as('u-owner');
    expect((await tenantPortalMock.linkRequests(page)).total).toBe(0);
  });
});

// ===================================================================== Nhận mã mời → quyền, nhiều liên kết, bị gỡ
describe('mock: mã mời, capabilities, nhiều liên kết, liên kết bị gỡ', () => {
  const GUEST = 'u-guest';
  const tenantLinks = async () => (await capabilitiesMock.get()).tenantLinks;

  it('mã sai/lạ, hết hạn, đã dùng đều là 400 TENANT_INVITATION_INVALID; sai định dạng 400; hồ sơ đã có tài khoản 409', async () => {
    as(GUEST);
    expect(await tenantLinks()).toEqual([]);
    expect(await tenantPortalMock.linkedTenants()).toEqual([]);
    expect((await tenantPortalMock.contracts(page)).total).toBe(0); // chưa liên kết: danh sách rỗng, không lỗi
    await expect(tenantPortalMock.contract('ctr-1')).rejects.toMatchObject({ status: 404 });
    for (const bad of ['x'.repeat(43), DEMO_INVITATIONS.expired, DEMO_INVITATIONS.used]) {
      await expect(tenantPortalMock.acceptInvitation({ token: bad })).rejects.toMatchObject({ status: 400, code: 'TENANT_INVITATION_INVALID' });
    }
    await expect(tenantPortalMock.acceptInvitation({ token: 'ngan' })).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    await expect(tenantPortalMock.acceptInvitation({ token: DEMO_INVITATIONS.conflict })).rejects.toMatchObject({ status: 409, code: 'TENANT_INVITATION_CONFLICT' });
    expect(await tenantLinks()).toEqual([]); // mọi lần thất bại đều không đổi quyền
  });

  it('chấp nhận hợp lệ: trả liên kết, capabilities và hồ sơ cập nhật ngay, dữ liệu theo hồ sơ mới xuất hiện', async () => {
    as(GUEST);
    const link = await tenantPortalMock.acceptInvitation({ token: DEMO_INVITATIONS.valid });
    expect(link).toMatchObject({ tenantId: 'ten-2', userId: GUEST, workspaceId: 'ws-an-nhien', revokedAt: null });
    expect(link.linkedAt).toBeTruthy();
    expect(await tenantLinks()).toEqual([{ tenantId: 'ten-2', workspaceId: 'ws-an-nhien', tenantName: 'Lê Hoàng Yến', workspaceName: 'Nhà Trọ An Nhiên Group' }]);
    expect((await tenantPortalMock.linkedTenants()).map((t) => t.id)).toEqual(['ten-2']);
    const contracts = await tenantPortalMock.contracts(page);
    expect(contracts.items.map((c) => c.id).sort()).toEqual(['ctr-2', 'ctr-t2-overdue']);
    expect(contracts.items.find((c) => c.id === 'ctr-t2-overdue')!.phase).toBe('OVERDUE');
    expect((await tenantPortalMock.invoices(page)).items.every((i) => i.tenantId === 'ten-2')).toBe(true);
  });

  it('dùng lại mã đã chấp nhận (replay) bị từ chối; tài khoản đã liên kết trong workspace đó không liên kết thêm hồ sơ khác của cùng workspace', async () => {
    as(GUEST);
    await expect(tenantPortalMock.acceptInvitation({ token: DEMO_INVITATIONS.valid })).rejects.toMatchObject({ status: 400, code: 'TENANT_INVITATION_INVALID' });
    const other = `DEMO-same-workspace_${'y'.repeat(30)}`.slice(0, 43);
    registerInvitation(other, 'ten-6', new Date(Date.now() + 86_400_000).toISOString());
    await expect(tenantPortalMock.acceptInvitation({ token: other })).rejects.toMatchObject({ status: 409, code: 'TENANT_INVITATION_CONFLICT' });
    expect((await tenantPortalMock.linkedTenants()).map((t) => t.id)).toEqual(['ten-2']);
  });

  it('nhiều liên kết khác workspace: hồ sơ, hợp đồng và quyền của cả hai cùng hiện', async () => {
    as(GUEST);
    const link = await tenantPortalMock.acceptInvitation({ token: DEMO_INVITATIONS.validSecondWorkspace });
    expect(link).toMatchObject({ tenantId: 'ten-sh-1', workspaceId: 'ws-sunhouse' });
    expect((await tenantPortalMock.linkedTenants()).map((t) => t.id).sort()).toEqual(['ten-2', 'ten-sh-1']);
    expect((await tenantLinks()).map((l) => l.workspaceName).sort()).toEqual(['Nhà Trọ An Nhiên Group', 'SunHouse Cầu Giấy']);
    expect((await tenantPortalMock.contracts(page)).items.map((c) => c.id)).toContain('ctr-sh-1');
    expect((await tenantPortalMock.contract('ctr-sh-1')).room.code).toBe('S.101');
  });

  it('chủ trọ tạo mã mời (createInvitation) thì người thuê dùng được mã đó', async () => {
    as('u-owner', [{ workspaceId: 'ws-an-nhien', name: 'WS', status: 'ACTIVE', role: 'OWNER' }]);
    const { token } = await tenancyMock.createInvitation('ws-an-nhien', 'ten-7');
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    as('u-admin');
    expect(await tenantPortalMock.acceptInvitation({ token })).toMatchObject({ tenantId: 'ten-7', userId: 'u-admin' });
    await expect(tenantPortalMock.acceptInvitation({ token })).rejects.toMatchObject({ code: 'TENANT_INVITATION_INVALID' });
  });

  it('liên kết bị chủ trọ gỡ: hồ sơ, hợp đồng, hóa đơn và chi tiết biến mất ngay (404)', async () => {
    as(NAM);
    expect((await tenantPortalMock.linkedTenants()).map((t) => t.id)).toEqual(['ten-1']);
    const invoice = (await tenantPortalMock.invoices(page)).items[0]!;
    as('u-owner', [{ workspaceId: 'ws-an-nhien', name: 'WS', status: 'ACTIVE', role: 'OWNER' }]);
    await tenancyMock.revokeLink('ws-an-nhien', `lnk-user-${NAM}`);
    as(NAM);
    expect(await tenantPortalMock.linkedTenants()).toEqual([]);
    expect((await tenantPortalMock.contracts(page)).total).toBe(0);
    expect((await tenantPortalMock.invoices(page)).total).toBe(0);
    expect((await tenantPortalMock.maintenance(page)).total).toBe(0);
    await expect(tenantPortalMock.invoice(invoice.id)).rejects.toMatchObject({ status: 404 });
    await expect(tenantPortalMock.contract('ctr-1')).rejects.toMatchObject({ status: 404 });
    await expect(tenantPortalMock.deposit('ctr-1', page)).rejects.toMatchObject({ status: 404 });
    await expect(tenantPortalMock.maintenanceRequest('tmnt-open')).rejects.toMatchObject({ status: 404 });
    expect(await tenantLinks()).toEqual([]);
    expect((await tenantPortalMock.linkRequests(page)).total).toBe(3); // lịch sử yêu cầu vẫn xem được
  });
});
