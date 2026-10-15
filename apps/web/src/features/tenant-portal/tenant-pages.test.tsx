import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ContractResponse,
  DepositPageResponse,
  InvoiceAdjustmentPageResponse,
  InvoicePaymentPageResponse,
  InvoiceResponse,
  MaintenanceRequestResponse,
  TenantLinkRequestPageResponse,
} from '@rental/shared';

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock('@/services/http/httpClient', () => ({ httpClient: http }));
vi.mock('@/features/auth/hooks', () => ({ useCurrentUser: () => ({ data: { fullName: 'Nam' } }) }));
vi.mock('@/features/auth/role', () => ({
  useAppRole: () => ({ capabilities: { tenantLinks: [{ tenantId: 'ten-1', workspaceId: 'w', tenantName: 'Nam', workspaceName: 'Nhà trọ A' }] } }),
}));

import { ToastProvider } from '@/components/ui';
import { ApiError } from '@/services/http/ApiError';
import { DEMO_INVITATIONS } from '@/mocks/tenant-links';
import { LinkAccountPage, TenantHomePage } from '@/pages/tenant/TenantPages';
import { TenantContractDetailPage, TenantContractsPage } from '@/pages/tenant/TenantContractPages';
import { TenantInvoiceDetailPage, TenantInvoicesPage } from '@/pages/tenant/TenantInvoicePages';
import { TenantMaintenanceDetailPage, TenantMaintenancePage } from '@/pages/tenant/TenantMaintenancePages';

const T = '2026-10-15T03:00:00.000Z';
const contract = (o: Partial<ContractResponse> = {}): ContractResponse => ({
  id: 'c1', workspaceId: 'w', roomId: 'r1', tenantId: 'ten-1', startDate: '2026-01-01', endDate: '2026-12-31', monthlyRent: '3200000', status: 'ACTIVE', phase: 'IN_EFFECT',
  notes: null, endedAt: null, createdAt: T, updatedAt: T, room: { id: 'r1', code: 'P.302', buildingId: 'b1' }, tenant: { id: 'ten-1', fullName: 'Trần Văn Nam' }, ...o,
});
const invoice = (o: Partial<InvoiceResponse> = {}): InvoiceResponse => ({
  id: 'i1', workspaceId: 'w', buildingId: 'b1', roomId: 'r1', contractId: 'c1', period: '2026-09', status: 'ISSUED', tenantId: 'ten-1', occupantCount: 1, occupantCountConfirmedBy: null, occupantCountConfirmedAt: null,
  billsVehicles: true, dueDate: '2026-10-10', notes: null, missingItems: [], isComplete: true, totalAmount: '3500000', provisionalAmount: null, roundingRule: 'ROUND_HALF_UP_1_VND',
  adjustmentsTotal: '70000', adjustedTotal: '3570000', paidTotal: '1000000', outstanding: '2570000', paymentStatus: 'PARTIALLY_PAID',
  items: [{ id: 'it1', sortOrder: 1, itemType: 'RENT', code: 'RENT', description: 'Tiền thuê phòng', unit: 'tháng', quantity: '1.000', unitPrice: '3200000.0000', prorationNumerator: null, prorationDenominator: null, amount: '3200000', ratePlanId: null, meterReadingId: null, meterRevision: null, details: {} }],
  issuedAt: T, createdAt: T, updatedAt: T, ...o,
});
const request = (o: Partial<MaintenanceRequestResponse> = {}): MaintenanceRequestResponse => ({
  id: 'm1', workspaceId: 'w', buildingId: 'b1', roomId: 'r1', contractId: 'c1', tenantId: 'ten-1', requestedBy: null, title: 'Vòi nước rỉ', description: 'Rỉ nước ở chân vòi', priority: 'HIGH', status: 'OPEN',
  assigneeUserId: null, resolutionNote: null, resolvedAt: null, closedAt: null, createdAt: T, updatedAt: T,
  history: [{ id: 'h1', fromStatus: null, toStatus: 'OPEN', priority: 'HIGH', assigneeUserId: null, note: null, changedBy: null, createdAt: T }], ...o,
});
const page = <I,>(items: I[], total = items.length, extra: object = {}) => ({ items, page: 1, limit: 20, total, ...extra });

type Query = Record<string, unknown> | undefined;
type Handler = unknown | ((query: Query) => unknown);
function serve(table: Record<string, Handler>) {
  http.get.mockImplementation(async (url: string, opts?: { query?: Record<string, unknown> }) => {
    for (const [key, value] of Object.entries(table)) {
      if (url === key) return typeof value === 'function' ? (value as (q: unknown) => unknown)(opts?.query) : value;
    }
    if (url === '/notifications/unread-count') return { unread: 2 };
    throw new Error(`unrouted GET ${url}`);
  });
}

let client: QueryClient;
function mount(entry: string, routes: RouteObject[]) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [entry] });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return router;
}
const err = (statusCode: number, code: string, message = 'raw') => new ApiError({ statusCode, code, message });

beforeEach(() => {
  for (const fn of Object.values(http)) fn.mockReset();
});

describe('Liên kết tài khoản bằng mã mời', () => {
  const linkRequests: TenantLinkRequestPageResponse = page([
    { id: 'lr1', workspaceId: 'w', tenantId: 'ten-1', requesterUserId: 'u', status: 'APPROVED', message: 'Em là người thuê P.302', decisionNote: 'Đã xác nhận', decidedAt: T, createdAt: T, updatedAt: T, tenant: { id: 'ten-1', fullName: 'Trần Văn Nam' }, requester: { id: 'u', email: 'n@x.vn', displayName: 'Nam' } },
    { id: 'lr2', workspaceId: 'w', tenantId: 'ten-3', requesterUserId: 'u', status: 'REJECTED', message: null, decisionNote: 'Không khớp hồ sơ', decidedAt: T, createdAt: T, updatedAt: T, tenant: { id: 'ten-3', fullName: 'Ngô Thị Mai' }, requester: { id: 'u', email: 'n@x.vn', displayName: 'Nam' } },
  ]);
  const routes: RouteObject[] = [
    { path: '/tenant/link-account', element: <LinkAccountPage /> },
    { path: '/tenant', element: <p>TRANG CHU TENANT</p> },
  ];
  const serveLink = () => serve({ '/tenants/me': [], '/tenant-link-requests/me': linkRequests });

  it('chỉ có ô nhập mã mời (không UUID hồ sơ, OTP, số điện thoại, mã hợp đồng) và hiện lịch sử yêu cầu chỉ đọc', async () => {
    serveLink();
    mount('/tenant/link-account', routes);
    expect(await screen.findByText('Không khớp hồ sơ')).toBeTruthy(); // đợi bảng tải xong
    expect(screen.getAllByText('Đã duyệt').length).toBeGreaterThan(1); // nhãn trạng thái (ngoài mục lọc)
    expect(screen.getAllByText('Bị từ chối').length).toBeGreaterThan(1);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.getByLabelText(/Mã mời/)).toBeTruthy();
    expect(screen.queryByText(/OTP|Số điện thoại|Mã hợp đồng|Mã hồ sơ|UUID/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Gửi yêu cầu/ })).toBeNull();
    expect(http.get).toHaveBeenCalledWith('/tenant-link-requests/me', { query: { status: undefined, page: 1, limit: 20 } });
    expect(screen.getByText('Chưa có hồ sơ nào đang liên kết')).toBeTruthy(); // /tenants/me rỗng
  });

  it('mã sai định dạng bị chặn trước khi gửi', async () => {
    serveLink();
    mount('/tenant/link-account', routes);
    await userEvent.type(await screen.findByLabelText(/Mã mời/), 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Liên kết tài khoản' }));
    expect(await screen.findByText(/đúng 43 ký tự/)).toBeTruthy();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('mã không hợp lệ/hết hạn/đã dùng: hiện thông báo theo mã lỗi backend và không đổi quyền', async () => {
    serveLink();
    http.post.mockRejectedValue(err(400, 'TENANT_INVITATION_INVALID'));
    mount('/tenant/link-account', routes);
    await userEvent.type(await screen.findByLabelText(/Mã mời/), DEMO_INVITATIONS.expired);
    await userEvent.click(screen.getByRole('button', { name: 'Liên kết tài khoản' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringMatching(/không hợp lệ, đã hết hạn hoặc đã được sử dụng/));
    expect(http.post).toHaveBeenCalledWith('/tenant-invitations/accept', { token: DEMO_INVITATIONS.expired });
    expect(screen.queryByText('TRANG CHU TENANT')).toBeNull();
  });

  it('hồ sơ đã có liên kết: báo xung đột 409', async () => {
    serveLink();
    http.post.mockRejectedValue(err(409, 'TENANT_INVITATION_CONFLICT'));
    mount('/tenant/link-account', routes);
    await userEvent.type(await screen.findByLabelText(/Mã mời/), `  ${DEMO_INVITATIONS.conflict}  `);
    await userEvent.click(screen.getByRole('button', { name: 'Liên kết tài khoản' }));
    expect(await screen.findByText(/đã có tài khoản liên kết/)).toBeTruthy();
    expect(http.post).toHaveBeenCalledWith('/tenant-invitations/accept', { token: DEMO_INVITATIONS.conflict }); // đã cắt khoảng trắng
  });

  it('thành công: làm mới capabilities và hồ sơ đã liên kết rồi chuyển về Cổng người thuê', async () => {
    serveLink();
    http.post.mockResolvedValue({ id: 'l1', workspaceId: 'w', tenantId: 'ten-2', userId: 'u', linkedAt: T, revokedAt: null });
    const router = mount('/tenant/link-account', routes);
    const spy = vi.spyOn(client, 'invalidateQueries');
    await userEvent.type(await screen.findByLabelText(/Mã mời/), DEMO_INVITATIONS.valid);
    await userEvent.click(screen.getByRole('button', { name: 'Liên kết tài khoản' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/tenant'));
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys).toContain(JSON.stringify(['capabilities']));
    expect(keys).toContain(JSON.stringify(['tenant-portal']));
  });
});

describe('Trang chủ: hồ sơ đã liên kết và thông báo thật', () => {
  it('liệt kê mọi hồ sơ trả về (nhiều liên kết) và số thông báo chưa đọc từ backend', async () => {
    serve({
      '/tenants/me': [
        { id: 'ten-1', workspaceId: 'w', fullName: 'Trần Văn Nam', phone: '0912345889', email: null, dateOfBirth: null, address: 'Đồng Nai', status: 'ACTIVE', archivedAt: null, createdAt: T, updatedAt: T },
        { id: 'ten-sh-1', workspaceId: 'w2', fullName: 'Phạm Minh Châu', phone: null, email: 'c@x.vn', dateOfBirth: '1997-05-12', address: null, status: 'ACTIVE', archivedAt: null, createdAt: T, updatedAt: T },
      ],
    });
    mount('/tenant', [{ path: '/tenant', element: <TenantHomePage /> }]);
    expect(await screen.findByText('Trần Văn Nam')).toBeTruthy();
    expect(screen.getByText('Phạm Minh Châu')).toBeTruthy();
    expect(screen.getByText('Nhà trọ A')).toBeTruthy();
    expect(await screen.findByText('2')).toBeTruthy(); // unread-count
    expect(screen.queryByText(/Tổng còn nợ|Thanh toán chờ xác nhận|Gửi thông tin thanh toán/)).toBeNull();
  });
});

describe('Hợp đồng', () => {
  it('danh sách lọc theo trạng thái ACTIVE/ENDED và hiện pha', async () => {
    serve({
      '/contracts/me': (q: Query) => page([contract({ id: 'c1' }), contract({ id: 'c2', phase: 'UPCOMING', room: { id: 'r2', code: 'P.401', buildingId: 'b1' } })], 2, { limit: Number(q?.limit) }),
    });
    mount('/tenant/contracts', [{ path: '/tenant/contracts', element: <TenantContractsPage /> }]);
    expect(await screen.findByText('Phòng P.302')).toBeTruthy();
    expect(screen.getByText('Chưa có hiệu lực')).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText('Trạng thái hợp đồng'), 'ENDED');
    await waitFor(() => expect(http.get).toHaveBeenLastCalledWith('/contracts/me', { query: { status: 'ENDED', page: 1, limit: 20 } }));
  });

  it('chi tiết hợp đồng tương lai: có ghi chú pha, tiền là chuỗi thập phân, sổ cọc phân trang riêng', async () => {
    const deposit = (p: number): DepositPageResponse => ({
      contractId: 'c1', collectedTotal: '3200000', deductedTotal: '300000', refundedTotal: '0', balance: '2900000',
      items: [{ id: `d${p}`, workspaceId: 'w', contractId: 'c1', kind: p === 1 ? 'COLLECTION' : 'DEDUCTION', amount: p === 1 ? '3200000' : '300000', method: p === 1 ? 'BANK_TRANSFER' : null, occurredAt: T, reason: p === 1 ? null : 'Sửa khóa', reference: p === 1 ? 'FT-1' : 'BB-9', note: null, reversesEntryId: null, reversedByEntryId: null, createdBy: 'o', createdAt: T }],
      page: p, limit: 20, total: 40,
    });
    serve({ '/contracts/me/c1': contract({ phase: 'UPCOMING', startDate: '2026-12-01' }), '/contracts/me/c1/deposit': (q: Query) => deposit(Number(q?.page)) });
    mount('/tenant/contracts/c1', [{ path: '/tenant/contracts/:contractId', element: <TenantContractDetailPage /> }]);
    expect(await screen.findByText(/chưa đến ngày bắt đầu/)).toBeTruthy();
    expect(await screen.findByText('Số dư cọc')).toBeTruthy();
    const body = document.body.textContent!.replace(/\s/g, ' ');
    expect(body).toMatch(/3\.200\.000 ₫/);
    expect(body).toMatch(/2\.900\.000 ₫/);
    expect(screen.queryByRole('link', { name: 'Yêu cầu bảo trì' })).toBeNull(); // chưa có hiệu lực → không gửi bảo trì
    const contractCalls = () => http.get.mock.calls.filter((c) => c[0] === '/contracts/me/c1').length;
    expect(contractCalls()).toBe(1);
    await userEvent.click(screen.getByRole('button', { name: '2' }));
    expect(await screen.findByText('Sửa khóa')).toBeTruthy();
    expect(contractCalls()).toBe(1); // đổi trang sổ cọc không tải lại hợp đồng
    expect(http.get).toHaveBeenLastCalledWith('/contracts/me/c1/deposit', { query: { page: 2, limit: 20 } });
  });

  it('hợp đồng không thuộc hồ sơ đang liên kết (hoặc liên kết đã gỡ): thông báo 404 và đường về danh sách', async () => {
    serve({ '/contracts/me/c9': () => { throw err(404, 'CONTRACT_NOT_FOUND'); } });
    mount('/tenant/contracts/c9', [{ path: '/tenant/contracts/:contractId', element: <TenantContractDetailPage /> }]);
    expect(await screen.findByText(/không thuộc hồ sơ bạn đang liên kết/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Về danh sách hợp đồng/ })).toBeTruthy();
  });
});

describe('Hóa đơn', () => {
  it('danh sách tách trạng thái hóa đơn và trạng thái thanh toán, lọc theo kỳ gửi đúng query', async () => {
    serve({ '/invoices/me': page([invoice(), invoice({ id: 'i2', period: '2026-08', paymentStatus: 'PAID', outstanding: '0', paidTotal: '3570000' })]) });
    mount('/tenant/invoices', [{ path: '/tenant/invoices', element: <TenantInvoicesPage /> }]);
    expect(await screen.findByText('Thanh toán một phần')).toBeTruthy();
    expect(screen.getAllByText('Đã phát hành').length).toBe(2);
    expect(screen.getByText('Đã thanh toán', { selector: '.badge, span' })).toBeTruthy();
    const month = screen.getByLabelText('Kỳ') as HTMLInputElement;
    await userEvent.type(month, '2026-09');
    await waitFor(() => expect(http.get).toHaveBeenLastCalledWith('/invoices/me', { query: { period: '2026-09', page: 1, limit: 20 } }));
  });

  it('chi tiết: sổ thanh toán và sổ điều chỉnh phân trang độc lập, số liệu lấy từ backend (không cộng từ trang)', async () => {
    const payments = (p: number): InvoicePaymentPageResponse => ({
      items: [{ id: `p${p}`, workspaceId: 'w', invoiceId: 'i1', kind: p === 2 ? 'REVERSAL' : 'PAYMENT', amount: '1000000', method: 'BANK_TRANSFER', receivedAt: T, note: p === 2 ? 'Ghi nhầm' : 'Lần 1', reversesPaymentId: p === 2 ? 'p1' : null, reversedByPaymentId: p === 1 ? 'p2' : null, confirmedBy: 'o', createdAt: T }],
      page: p, limit: 20, total: 40, amountDue: '3570000', paidTotal: '1000000', outstanding: '2570000', paymentStatus: 'PARTIALLY_PAID',
    });
    const adjustments = (p: number): InvoiceAdjustmentPageResponse => ({
      items: [{ id: `a${p}`, workspaceId: 'w', invoiceId: 'i1', amount: p === 1 ? '100000' : '-30000', requestedAmount: p === 1 ? '100000.0000' : '-30000.0000', reason: p === 1 ? 'Phí thay bóng đèn' : 'Sửa lại', referenceAdjustmentId: p === 1 ? null : 'a1', createdBy: 'o', createdAt: T }],
      page: p, limit: 20, total: 30, originalTotal: '3500000', adjustmentsTotal: '70000', adjustedTotal: '3570000',
    });
    serve({ '/invoices/me/i1': invoice(), '/invoices/me/i1/payments': (q: Query) => payments(Number(q?.page)), '/invoices/me/i1/adjustments': (q: Query) => adjustments(Number(q?.page)) });
    mount('/tenant/invoices/i1', [{ path: '/tenant/invoices/:invoiceId', element: <TenantInvoiceDetailPage /> }]);
    expect(await screen.findByText('Tiền thuê phòng')).toBeTruthy();
    expect(await screen.findByText('Lịch sử thanh toán')).toBeTruthy();
    expect(await screen.findByText('Phí thay bóng đèn')).toBeTruthy();
    expect(screen.queryByText(/Gửi thông tin thanh toán|Xem minh chứng|Số tài khoản|Chủ tài khoản/)).toBeNull();
    expect(document.body.textContent!.replace(/\s/g, ' ')).toMatch(/Số phải thu.*3\.570\.000 ₫/);
    const [payNav, adjNav] = screen.getAllByRole('navigation', { name: 'Phân trang' });
    await userEvent.click(within(payNav!).getByRole('button', { name: '2' }));
    expect(await screen.findByText('Ghi nhầm')).toBeTruthy();
    expect(http.get).toHaveBeenCalledWith('/invoices/me/i1/payments', { query: { page: 2, limit: 20 } });
    expect(http.get.mock.calls.some((c) => c[0] === '/invoices/me/i1/adjustments' && (c[1] as { query: { page: number } }).query.page === 2)).toBe(false);
    await userEvent.click(within(adjNav!).getByRole('button', { name: '2' }));
    expect(await screen.findByText('Sửa lại')).toBeTruthy();
    expect(http.get).toHaveBeenCalledWith('/invoices/me/i1/adjustments', { query: { page: 2, limit: 20 } });
  });

  it('hóa đơn không thuộc người thuê: 404 có đường về danh sách', async () => {
    serve({ '/invoices/me/i9': () => { throw err(404, 'INVOICE_NOT_FOUND'); } });
    mount('/tenant/invoices/i9', [{ path: '/tenant/invoices/:invoiceId', element: <TenantInvoiceDetailPage /> }]);
    expect(await screen.findByText(/Không tìm thấy hóa đơn/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Về danh sách hóa đơn/ })).toBeTruthy();
  });
});

describe('Bảo trì', () => {
  const routes: RouteObject[] = [
    { path: '/tenant/maintenance', element: <TenantMaintenancePage /> },
    { path: '/tenant/maintenance/:requestId', element: <TenantMaintenanceDetailPage /> },
  ];

  it('gửi yêu cầu: chỉ liệt kê hợp đồng ACTIVE đã bắt đầu, body đúng DTO (không roomId), lỗi 409 hiện đúng thông báo', async () => {
    serve({
      '/maintenance-requests/me': page([request()]),
      '/contracts/me': page([contract({ id: 'c1' }), contract({ id: 'c2', phase: 'UPCOMING', room: { id: 'r2', code: 'P.999', buildingId: 'b1' } }), contract({ id: 'c3', phase: 'OVERDUE', room: { id: 'r3', code: 'P.303', buildingId: 'b1' } })]),
    });
    http.post.mockRejectedValueOnce(err(409, 'MAINTENANCE_NOT_ELIGIBLE'));
    mount('/tenant/maintenance', routes);
    await userEvent.click(await screen.findByRole('button', { name: /Gửi yêu cầu/ }));
    const dlg = await screen.findByRole('dialog');
    const select = within(dlg).getByLabelText(/^Hợp đồng/) as HTMLSelectElement;
    await waitFor(() => expect(select.options.length).toBe(3)); // placeholder + IN_EFFECT + OVERDUE
    expect([...select.options].map((o) => o.textContent)).not.toContain(expect.stringContaining('P.999'));
    expect(http.get).toHaveBeenCalledWith('/contracts/me', { query: { status: 'ACTIVE', page: 1, limit: 50 } });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Gửi yêu cầu' }));
    expect(await within(dlg).findByText('Chọn hợp đồng')).toBeTruthy();
    expect(http.post).not.toHaveBeenCalled();
    await userEvent.selectOptions(select, 'c1');
    await userEvent.type(within(dlg).getByLabelText(/^Tiêu đề/), 'Hỏng ổ khóa');
    await userEvent.type(within(dlg).getByLabelText(/^Mô tả/), 'Kẹt cửa');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Gửi yêu cầu' }));
    await waitFor(() => expect(http.post).toHaveBeenCalledWith('/maintenance-requests/me', { contractId: 'c1', title: 'Hỏng ổ khóa', description: 'Kẹt cửa' }));
    expect(await screen.findByText(/đang hiệu lực và đã đến ngày bắt đầu thuê/)).toBeTruthy();
  });

  it('không có hợp đồng đủ điều kiện: báo rõ và khóa nút gửi', async () => {
    serve({ '/maintenance-requests/me': page([]), '/contracts/me': page([contract({ phase: 'UPCOMING' })]) });
    mount('/tenant/maintenance', routes);
    await userEvent.click(await screen.findByRole('button', { name: /Gửi yêu cầu/ }));
    const dlg = await screen.findByRole('dialog');
    expect(await within(dlg).findByText(/chưa có hợp đồng đủ điều kiện/)).toBeTruthy();
    expect((within(dlg).getByRole('button', { name: 'Gửi yêu cầu' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('chi tiết: chỉ yêu cầu OPEN mới có nút hủy; hủy gửi { reason? } và hiện lỗi 409 khi đã được tiếp nhận', async () => {
    serve({ '/maintenance-requests/me/m1': request() });
    http.post.mockRejectedValueOnce(err(409, 'MAINTENANCE_NOT_CANCELLABLE'));
    mount('/tenant/maintenance/m1', routes);
    await userEvent.click(await screen.findByRole('button', { name: 'Hủy yêu cầu' }));
    const dlg = await screen.findByRole('dialog');
    await userEvent.type(within(dlg).getByLabelText(/Lý do/), 'Đã tự sửa');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Hủy yêu cầu' }));
    await waitFor(() => expect(http.post).toHaveBeenCalledWith('/maintenance-requests/me/m1/cancel', { reason: 'Đã tự sửa' }));
    expect(await screen.findByText(/đã được chủ trọ tiếp nhận xử lý/)).toBeTruthy();
  });

  it('yêu cầu đã nhận xử lý/đã hủy không có nút hủy; không lộ người phụ trách; không có ảnh/bình luận', async () => {
    serve({ '/maintenance-requests/me/m2': request({ id: 'm2', status: 'IN_PROGRESS', history: [{ id: 'h', fromStatus: 'OPEN', toStatus: 'IN_PROGRESS', priority: 'HIGH', assigneeUserId: null, note: 'Đã hẹn thợ', changedBy: null, createdAt: T }] }) });
    mount('/tenant/maintenance/m2', routes);
    expect(await screen.findByText('Đã hẹn thợ')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Hủy yêu cầu' })).toBeNull();
    expect(screen.queryByText(/Người phụ trách|Bình luận|Ảnh/)).toBeNull();
  });

  it('yêu cầu của người khác: 404', async () => {
    serve({ '/maintenance-requests/me/m9': () => { throw err(404, 'MAINTENANCE_NOT_FOUND'); } });
    mount('/tenant/maintenance/m9', routes);
    expect(await screen.findByText(/Không tìm thấy yêu cầu bảo trì/)).toBeTruthy();
  });
});
