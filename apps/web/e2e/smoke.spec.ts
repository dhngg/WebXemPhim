import { expect, test, type Page } from '@playwright/test';

/** Smoke test các luồng demo chính (chạy với VITE_USE_MOCK_API=true). */

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel(/Email hoặc số điện thoại/).fill(email);
  await page.getByLabel(/^Mật khẩu/).fill('demo1234');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function expectNoCrash(page: Page) {
  await expect(page.getByText('Hệ thống gặp sự cố ngoài ý muốn')).toHaveCount(0);
}

test('F1 — Khách: trang chủ → lọc → chi tiết → đặt lịch → chờ xác nhận', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Tìm phòng trọ phù hợp/ })).toBeVisible();
  await page.getByRole('button', { name: /Tìm ngay/ }).click();
  await expect(page).toHaveURL(/\/rooms\?/);
  await expect(page.getByText(/Tìm thấy \d+ phòng/)).toBeVisible();
  await page.getByRole('link', { name: 'Xem chi tiết' }).first().click();
  await expect(page.getByRole('link', { name: /Đặt lịch xem phòng/ })).toBeVisible();
  await page.getByRole('link', { name: /Đặt lịch xem phòng/ }).click();
  await page.getByRole('button', { name: /14:00/ }).click();
  await page.getByLabel(/Họ tên/).fill('Khách Demo');
  await page.getByLabel(/Số điện thoại/).fill('0909123456');
  await page.getByRole('button', { name: 'Gửi yêu cầu xem phòng' }).click();
  await expect(page.getByText('Đã gửi yêu cầu xem phòng')).toBeVisible();
  await expect(page.getByText('Chờ xác nhận')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Route guard: chưa đăng nhập vào workspace bị chuyển tới login', async ({ page }) => {
  await page.goto('/w/ws-an-nhien/dashboard');
  await expect(page).toHaveURL(/\/login\?redirect=/);
});

test('F2/F4 — Chủ trọ: mọi màn hình workspace render không lỗi', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = trackErrors(page);
  await login(page, 'quan@demo.vn');
  await expect(page).toHaveURL('/');
  const ws = '/w/ws-an-nhien';
  const routes = [
    'dashboard', 'settings', 'members', 'buildings', 'buildings/new', 'buildings/bld-a', 'buildings/bld-a/edit',
    'rooms', 'rooms/new', 'rooms/room-bld-a-P302', 'rooms/room-bld-a-P302/edit', 'viewings',
    'tenants', 'tenants/new', 'tenants/ten-1', 'tenants/ten-1/edit', 'contracts', 'contracts/new', 'contracts/ctr-1', 'contracts/ctr-draft/edit',
    'vehicles', 'rates', 'meters', 'invoices', 'billing/run', 'payments', 'deposits', 'maintenance', 'maintenance/mnt-1', 'reports',
  ];
  for (const r of routes) {
    await page.goto(`${ws}/${r}`);
    await expect(page.locator('h1').first()).toBeVisible();
    await expectNoCrash(page);
  }
  // Mở chi tiết một hóa đơn từ danh sách
  await page.goto(`${ws}/invoices`);
  await page.locator('table a').first().click();
  await expect(page.getByText('Chi tiết khoản phí')).toBeVisible();
  expect(errors).toEqual([]);
});

test('F4 — Chủ trọ: xem trước & lập hóa đơn, xác nhận thanh toán một phần', async ({ page }) => {
  test.setTimeout(90_000);
  await login(page, 'quan@demo.vn');
  await page.goto('/w/ws-an-nhien/billing/run');
  await page.getByRole('button', { name: 'Xem trước' }).click();
  await expect(page.getByText('Thiếu chỉ số').first()).toBeVisible();
  await page.getByRole('button', { name: /Bước 3 — Phát hành/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Phát hành' }).click();
  await expect(page.getByText(/Đã tạo \d+ hóa đơn/).first()).toBeVisible();

  await page.goto('/w/ws-an-nhien/payments');
  await page.getByLabel(/Hóa đơn còn nợ/).selectOption({ index: 1 });
  await page.getByLabel('Số tiền', { exact: false }).fill('100000');
  await page.getByRole('button', { name: 'Ghi nhận & xác nhận' }).click();
  await expect(page.getByText('Đã ghi nhận thanh toán một phần.')).toBeVisible();
});

test('F5 — Người thuê: xem hóa đơn và gửi minh chứng', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = trackErrors(page);
  await login(page, 'nam@demo.vn');
  await expect(page).toHaveURL('/tenant');
  for (const r of ['/tenant', '/tenant/contracts', '/tenant/invoices', '/tenant/maintenance', '/tenant/link-account', '/tenant/payments/new']) {
    await page.goto(r);
    await expect(page.locator('h1').first()).toBeVisible();
    await expectNoCrash(page);
  }
  await page.goto('/tenant/invoices');
  await page.locator('table a').first().click();
  await expect(page.getByText('Các khoản phí')).toBeVisible();
  expect(errors).toEqual([]);
});

test('F6 — Admin: quản lý workspace / người dùng', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = trackErrors(page);
  await login(page, 'admin@demo.vn');
  await expect(page).toHaveURL('/admin');
  for (const r of ['/admin', '/admin/users', '/admin/workspaces', '/admin/listings', '/admin/audit-logs']) {
    await page.goto(r);
    await expect(page.locator('h1').first()).toBeVisible();
    await expectNoCrash(page);
  }
  await page.goto('/admin/workspaces');
  await page.getByRole('button', { name: 'Tạm khóa' }).first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Tạm khóa' }).click();
  await expect(page.getByText('Đã cập nhật trạng thái workspace.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Người dùng & trạng thái lỗi mock', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = trackErrors(page);
  await login(page, 'minh@demo.vn');
  for (const r of ['/account', '/my-viewings', '/notifications', '/workspaces/select', '/rooms/map', '/about', '/help', '/khong-ton-tai']) {
    await page.goto(r);
    await expect(page.locator('h1').first()).toBeVisible();
  }
  await page.goto('/rooms?mock=500');
  await expect(page.getByText('Lỗi máy chủ (mock 500).')).toBeVisible();
  await page.goto('/rooms?mock=empty');
  await expect(page.getByText('Không tìm thấy phòng phù hợp')).toBeVisible();
  await page.goto('/w/ws-an-nhien/dashboard');
  await expect(page.getByText('403')).toBeVisible();
  expect(errors).toEqual([]);
});
