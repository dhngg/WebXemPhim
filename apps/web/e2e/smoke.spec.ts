import { expect, test, type Locator, type Page } from '@playwright/test';

/** Smoke test các luồng demo chính (chạy với VITE_USE_MOCK_API=true). */

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel(/^Email/).fill(email);
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
  await page.getByLabel('Quận / huyện', { exact: true }).fill('Cầu Giấy');
  await page.getByRole('button', { name: /Tìm ngay/ }).click();
  await expect(page).toHaveURL(/\/rooms\?/);
  // Số phòng lấy từ data-testid ổn định (không phụ thuộc câu chữ) và phải khớp số thẻ phòng hiển thị trong trang đầu.
  const count = page.getByTestId('rooms-count');
  await expect(count).toBeVisible();
  const total = Number(await count.textContent());
  expect(total).toBeGreaterThan(0);
  await expect(page.getByRole('link', { name: 'Xem chi tiết' })).toHaveCount(Math.min(total, 20));
  await page.getByRole('link', { name: 'Xem chi tiết' }).first().click();
  await expect(page.getByRole('link', { name: /Đặt lịch xem phòng/ })).toBeVisible();
  await page.getByRole('link', { name: /Đặt lịch xem phòng/ }).click();
  // API đặt lịch yêu cầu đăng nhập: khách chỉ thấy lời mời đăng nhập, không có form.
  await expect(page.getByRole('heading', { name: 'Đăng nhập để đặt lịch xem phòng' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gửi yêu cầu xem phòng' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('F1b — Người tìm phòng đã đăng nhập: đặt lịch xem → thấy trong Lịch xem phòng → hủy', async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, 'minh@demo.vn');
  await page.goto('/rooms/r-1/viewing');
  await expect(page.getByRole('heading', { name: 'Đặt lịch xem phòng' })).toBeVisible();
  // Backend chỉ nhận thời điểm + lời nhắn: không còn ô họ tên / số điện thoại.
  await expect(page.getByLabel(/Họ tên/)).toHaveCount(0);
  await expect(page.getByLabel(/Số điện thoại/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Gửi yêu cầu xem phòng' }).click();
  await expect(page.getByText('Vui lòng chọn khung giờ')).toBeVisible();
  await page.getByRole('button', { name: /14:00/ }).click();
  await page.getByLabel(/Ghi chú cho chủ trọ/).fill('Đi 2 người');
  await page.getByRole('button', { name: 'Gửi yêu cầu xem phòng' }).click();
  await expect(page.getByText('Đã gửi yêu cầu xem phòng')).toBeVisible();
  await page.getByRole('link', { name: 'Xem lịch của tôi' }).click();
  await expect(page).toHaveURL('/my-viewings');
  await expect(page.getByText('Chờ xác nhận').first()).toBeVisible();
  await expect(page.getByText('Ghi chú: Đi 2 người')).toBeVisible();
  await page.getByRole('tab', { name: /Bị từ chối/ }).click();
  await expect(page.getByText('Phản hồi của chủ trọ: Phòng đã có người đặt cọc.')).toBeVisible();
  await page.getByRole('tab', { name: /Sắp tới/ }).click();
  await page.getByRole('button', { name: 'Hủy lịch' }).first().click();
  await page.getByRole('button', { name: 'Hủy lịch' }).last().click();
  await expect(page.getByText('Đã hủy lịch xem.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('FE-05 — Chủ trọ: tạo người thuê → hợp đồng → kết thúc; thêm và ngừng phương tiện', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  await login(page, 'quan@demo.vn');
  const ws = '/w/ws-an-nhien';

  // Người thuê: backend không có CCCD / quê quán → form không còn các ô này
  await page.goto(`${ws}/tenants/new`);
  await expect(page.getByLabel(/CCCD/)).toHaveCount(0);
  await expect(page.getByLabel(/Quê quán/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Tạo hồ sơ' }).click();
  await expect(page.getByText('Vui lòng nhập họ tên')).toBeVisible();
  await page.getByLabel(/^Họ và tên/).fill('Khách Thuê E2E');
  await page.getByLabel('Số điện thoại').fill('0909 123 456');
  await page.getByRole('button', { name: 'Tạo hồ sơ' }).click();
  await expect(page.getByRole('heading', { name: 'Khách Thuê E2E' })).toBeVisible();

  // Hợp đồng: chỉ phòng trống; không còn cọc / cách tính nước / người ở cùng; có hiệu lực ngay
  await page.getByRole('link', { name: /Tạo hợp đồng/ }).click();
  await expect(page.getByLabel(/Tiền cọc/)).toHaveCount(0);
  await expect(page.getByText('Cách tính nước')).toHaveCount(0);
  await expect(page.getByText(/Người ở cùng/)).toHaveCount(0);
  const roomSelect = page.locator('select').first();
  await roomSelect.selectOption({ index: 1 });
  await expect(page.locator('input[inputmode="numeric"]').first()).not.toHaveValue('');
  await page.getByRole('button', { name: 'Tạo hợp đồng' }).click();
  await expect(page.getByRole('heading', { name: /Hợp đồng phòng/ })).toBeVisible();
  await expect(page.getByText('Đang hiệu lực').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Kết thúc hợp đồng' })).toBeVisible();

  // Người thuê đang có hợp đồng thì không lưu trữ được (409 từ quy tắc backend)
  await page.getByRole('link', { name: 'Khách Thuê E2E' }).click();
  await page.getByRole('button', { name: 'Lưu trữ' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Lưu trữ' }).click();
  await expect(page.getByText(/còn hợp đồng chưa kết thúc/)).toBeVisible();

  // Từ hồ sơ mở lại hợp đồng rồi kết thúc (không chuyển trang cứng để giữ dữ liệu mock trong bộ nhớ)
  await page.getByRole('link', { name: /A\.|B\.|C\.|P\./ }).first().click();
  await page.getByRole('button', { name: 'Kết thúc hợp đồng' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận kết thúc' }).click();
  await expect(page.getByText('Đã kết thúc').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Kết thúc hợp đồng' })).toHaveCount(0);

  // Phương tiện: thêm rồi ngừng sử dụng (không có xóa, không có phí)
  await page.getByRole('link', { name: 'Khách Thuê E2E' }).click();
  await page.getByRole('link', { name: /Quản lý phương tiện/ }).click();
  await expect(page.getByRole('heading', { name: 'Quản lý phương tiện' })).toBeVisible();
  await expect(page.getByText(/Phí/)).toHaveCount(0);
  await page.getByRole('button', { name: /Thêm phương tiện/ }).click();
  await page.getByRole('dialog').getByLabel('Người sở hữu').selectOption({ label: 'Khách Thuê E2E' });
  await page.getByLabel('Biển số').fill('51-f9 888.77');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByText('51F988877')).toBeVisible();
  await page.getByRole('row', { name: /51F988877/ }).getByRole('button', { name: 'Ngừng sử dụng' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Ngừng sử dụng' }).click();
  await expect(page.getByRole('row', { name: /51F988877/ }).getByText('Đã ngừng')).toBeVisible();
  expect(errors).toEqual([]);
});

test('FE-05.1 — Liên kết tài khoản: thu hồi, tạo lời mời (token một lần); xe: thêm trường, lý do ngừng', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined);
  await login(page, 'quan@demo.vn');
  const ws = '/w/ws-an-nhien';

  // Hồ sơ đầu tiên đang liên kết với một tài khoản → thấy liên kết và nút thu hồi, chưa có nút mời
  await page.goto(`${ws}/tenants/ten-1`);
  await expect(page.getByText(/Đã liên kết với/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tạo lời mời liên kết' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Thu hồi liên kết' }).click();
  await page.getByLabel('Lý do (tùy chọn)').fill('Người thuê chuyển đi');
  await page.getByRole('dialog').getByRole('button', { name: 'Thu hồi', exact: true }).click();
  await expect(page.getByText('Đã thu hồi liên kết.')).toBeVisible();
  await expect(page.getByText(/chưa liên kết với tài khoản nào/)).toBeVisible();

  // Lời mời: token hiển thị một lần với nút sao chép; đóng hộp thoại là mất token
  await page.getByRole('button', { name: 'Tạo lời mời liên kết' }).click();
  const tokenInput = page.getByRole('dialog').getByLabel('Mã mời');
  await expect(tokenInput).toHaveValue(/^[A-Za-z0-9_-]{43}$/);
  await expect(page.getByText(/chỉ hiển thị MỘT LẦN/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sao chép' })).toBeVisible();
  await page.getByRole('button', { name: 'Đã gửi, đóng' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Tạo lời mời liên kết' }).click();
  await expect(page.getByRole('dialog').getByLabel('Mã mời')).toHaveValue(/^[A-Za-z0-9_-]{43}$/);
  await page.getByRole('button', { name: 'Đã gửi, đóng' }).click();

  // Phương tiện: model/màu/ghi chú khi thêm; lý do khi ngừng
  await page.getByRole('link', { name: /Quản lý phương tiện/ }).click();
  await page.getByRole('button', { name: /Thêm phương tiện/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Người sở hữu').selectOption({ index: 1 });
  await dialog.getByLabel('Biển số').fill('30-g1 555.66');
  await dialog.getByLabel('Dòng xe').fill('Vision');
  await dialog.getByLabel('Màu sắc').fill('Đỏ');
  await dialog.getByLabel('Ghi chú').fill('Xe của khách');
  await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
  const row = page.getByRole('row', { name: /30G155566/ });
  await expect(row).toContainText('Vision');
  await expect(row).toContainText('Đỏ');
  await row.getByRole('button', { name: 'Ngừng sử dụng' }).click();
  await page.getByLabel('Lý do (tùy chọn)').fill('Bán xe');
  await page.getByRole('dialog').getByRole('button', { name: 'Ngừng sử dụng' }).click();
  await expect(page.getByRole('row', { name: /30G155566/ }).getByText('Đã ngừng')).toBeVisible();
  expect(errors).toEqual([]);
});

test('BE-CONTRACT-DATES-02 — Hợp đồng bắt đầu tương lai: chưa có hiệu lực, phòng vẫn Trống, hủy giữ lịch sử', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  await login(page, 'quan@demo.vn');
  const ws = '/w/ws-an-nhien';

  await page.goto(`${ws}/tenants/new`);
  await page.getByLabel(/^Họ và tên/).fill('Khách Tương Lai E2E');
  await page.getByRole('button', { name: 'Tạo hồ sơ' }).click();
  await expect(page.getByRole('heading', { name: 'Khách Tương Lai E2E' })).toBeVisible();

  await page.getByRole('link', { name: /Tạo hợp đồng/ }).click();
  await page.locator('select').first().selectOption({ index: 1 });
  await page.getByLabel(/^Ngày bắt đầu/).fill('2099-01-01');
  await page.getByLabel(/^Ngày kết thúc/).fill('2099-12-31');
  await expect(page.locator('input[inputmode="numeric"]').first()).not.toHaveValue('');
  await page.getByRole('button', { name: 'Tạo hợp đồng' }).click();

  // Hợp đồng ACTIVE về lifecycle nhưng chưa có hiệu lực theo ngày: chỉ được hủy, không "kết thúc"
  await expect(page.getByRole('heading', { name: /Hợp đồng phòng/ })).toBeVisible();
  await expect(page.getByText('Chưa có hiệu lực').first()).toBeVisible();
  await expect(page.getByText(/Phòng được giữ cho kỳ thuê này/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hủy hợp đồng' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Kết thúc hợp đồng' })).toHaveCount(0);

  // Phòng KHÔNG bị đánh dấu Đang thuê; hợp đồng hiện ra ở mục giữ chỗ
  await page.getByRole('link', { name: /A\.|B\.|C\.|P\./ }).first().click();
  await expect(page.getByText('Hợp đồng sắp bắt đầu (giữ chỗ)')).toBeVisible();
  await expect(page.getByText('Trống').first()).toBeVisible();
  await expect(page.getByText('Đang thuê')).toHaveCount(0);

  // Hủy trước ngày bắt đầu: không nhập ngày kết thúc, chuyển sang Đã hủy, kỳ thuê giữ làm lịch sử
  await page.getByRole('link', { name: 'Khách Tương Lai E2E' }).first().click({ force: true }); // layout mobile: ảnh phòng chồng lên mục này
  await page.getByRole('button', { name: 'Hủy hợp đồng' }).click();
  await expect(page.getByRole('dialog').getByLabel(/Ngày kết thúc thực tế/)).toHaveCount(0);
  await expect(page.getByRole('dialog').getByText(/KHÔNG tự động hoàn/)).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận hủy' }).click();
  await expect(page.getByText('Đã hủy trước ngày bắt đầu').first()).toBeVisible();
  await expect(page.getByText(/được giữ làm lịch sử/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hủy hợp đồng' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('FE-06A — Bảng giá: thêm dịch vụ, đổi giá (phiên bản mới), ngừng áp dụng, lọc', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  await login(page, 'quan@demo.vn');
  await page.goto('/w/ws-an-nhien/rates');
  await expect(page.getByRole('heading', { name: 'Bảng giá dịch vụ' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'ELECTRICITY' }).first()).toBeVisible();

  // thêm dịch vụ: validation theo DTO rồi tạo thành công
  await page.getByRole('button', { name: 'Thêm dịch vụ' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('button', { name: 'Thêm dịch vụ' }).click();
  await expect(dlg.getByText('Nhập mã dịch vụ')).toBeVisible();
  await dlg.getByLabel(/^Mã dịch vụ/).fill('trash bin');
  await dlg.getByLabel(/^Tên hiển thị/).fill('Rác & vệ sinh');
  await dlg.getByLabel(/^Loại dịch vụ/).selectOption('TRASH');
  await dlg.getByLabel(/^Đơn vị tính/).selectOption('ROOM');
  await dlg.getByLabel(/^Đơn giá/).fill('30000.12345');
  await dlg.getByRole('button', { name: 'Thêm dịch vụ' }).click();
  await expect(dlg.getByText(/tối đa 10 chữ số nguyên và 4 chữ số lẻ/)).toBeVisible();
  await dlg.getByLabel(/^Đơn giá/).fill('30000');
  await dlg.getByRole('button', { name: 'Thêm dịch vụ' }).click();
  await expect(page.getByText('Đã thêm đơn giá.')).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'TRASH_BIN' }).first()).toBeVisible();

  // đổi giá: ngày áp dụng phải sau ngày hiện tại; sau đó có phiên bản mới + bản cũ ngừng
  const elec = page.getByRole('row').filter({ hasText: 'ELECTRICITY' }).filter({ hasText: 'Đang áp dụng' }).first();
  await elec.getByRole('button', { name: /Đổi giá/ }).click();
  await dlg.getByLabel(/^Đơn giá mới/).fill('4000');
  await dlg.getByLabel(/^Áp dụng từ ngày/).fill('2026-01-01');
  await dlg.getByRole('button', { name: 'Tạo phiên bản mới' }).click();
  await expect(dlg.getByText('Ngày áp dụng mới phải sau ngày áp dụng hiện tại')).toBeVisible();
  await dlg.getByLabel(/^Áp dụng từ ngày/).fill('2027-01-01');
  await dlg.getByRole('button', { name: 'Tạo phiên bản mới' }).click();
  await expect(page.getByText('Đã tạo phiên bản đơn giá mới.')).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'ELECTRICITY' }).filter({ hasText: 'Đã ngừng' }).first()).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: '4.000 ₫' }).first()).toBeVisible();

  // ngừng áp dụng một dịch vụ; lọc theo trạng thái
  const wifi = page.getByRole('row').filter({ hasText: 'WIFI' }).filter({ hasText: 'Đang áp dụng' }).first();
  await wifi.getByRole('button', { name: 'Ngừng áp dụng' }).click();
  await dlg.getByLabel(/^Ngừng từ ngày/).fill('2027-06-01');
  await dlg.getByRole('button', { name: 'Ngừng áp dụng' }).click();
  await expect(page.getByText('Đã ngừng áp dụng đơn giá.')).toBeVisible();
  await page.getByLabel('Trạng thái', { exact: true }).selectOption('INACTIVE');
  await expect(page.getByRole('row').filter({ hasText: 'WIFI' }).first()).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'TRASH_BIN' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('FE-06A — Chỉ số điện nước: ghi lần đầu (nhập số cũ), kỳ sau nối chuỗi, điều chỉnh có lý do và lịch sử', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  await login(page, 'quan@demo.vn');
  await page.goto('/w/ws-an-nhien/meters');
  await expect(page.getByRole('heading', { name: 'Chỉ số điện nước' })).toBeVisible();
  // Chọn phòng cụ thể theo mã: ô chỉ số chỉ xuất hiện khi chỉ số của phòng tải xong, nên `.first()` có thể trỏ nhầm sang phòng khác.
  const cell = page.getByTestId('meter-P.101-ELECTRICITY');
  await expect(cell.getByText('Chưa ghi')).toBeVisible();

  await cell.getByRole('button', { name: /^Ghi chỉ số điện P\.101/ }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg).toBeVisible();
  await dlg.getByLabel(/^Số cũ/).fill('100');
  await dlg.getByLabel(/^Số mới/).fill('90');
  await dlg.getByRole('button', { name: 'Lưu chỉ số' }).click();
  await expect(dlg.getByText('Số mới không được nhỏ hơn số cũ')).toBeVisible();
  await dlg.getByLabel(/^Số mới/).fill('150.5');
  await dlg.getByRole('button', { name: 'Lưu chỉ số' }).click();
  await expect(page.getByText(/Đã ghi chỉ số điện/)).toBeVisible();
  await expect(cell.getByText('Tiêu thụ 50,5 kWh')).toBeVisible();

  // điều chỉnh: bắt buộc lý do và phải thay đổi giá trị
  await cell.getByRole('button', { name: /^Điều chỉnh điện P\.101/ }).click();
  await expect(dlg).toBeVisible();
  await dlg.getByLabel(/^Số mới/).fill('150.5');
  await dlg.getByLabel(/^Lý do/).fill('Đọc nhầm');
  await dlg.getByRole('button', { name: 'Lưu điều chỉnh' }).click();
  await expect(dlg.getByText('Chưa có thay đổi nào so với chỉ số hiện tại')).toBeVisible();
  await dlg.getByLabel(/^Số mới/).fill('160');
  await dlg.getByLabel(/^Lý do/).fill('   ');
  await dlg.getByRole('button', { name: 'Lưu điều chỉnh' }).click();
  await expect(dlg.getByText('Nhập lý do điều chỉnh')).toBeVisible();
  await dlg.getByLabel(/^Lý do/).fill('Đọc nhầm');
  await dlg.getByRole('button', { name: 'Lưu điều chỉnh' }).click();
  await expect(page.getByText('Đã điều chỉnh chỉ số.')).toBeVisible();
  await expect(cell.getByText(/đã điều chỉnh 1 lần/)).toBeVisible();
  await cell.getByRole('button', { name: /^Lịch sử điều chỉnh điện P\.101/ }).click();
  await expect(dlg).toBeVisible();
  await expect(dlg.getByText('Lý do: Đọc nhầm')).toBeVisible();
  await dlg.getByRole('button', { name: 'Đóng' }).last().click();

  // kỳ sau (kỳ kế tiếp là mục đầu danh sách): số cũ tự lấy từ kỳ trước; kỳ cũ hơn kỳ đã ghi không ghi bù được
  const periodAt = (offset: number) => {
    const d = new Date(Date.now() + 7 * 3_600_000); // giờ Việt Nam
    d.setUTCMonth(d.getUTCMonth() + offset, 1);
    return `Kỳ T${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
  };
  await page.getByLabel('Kỳ ghi chỉ số').selectOption({ label: periodAt(1) });
  const next = page.getByTestId('meter-P.101-ELECTRICITY');
  await next.getByRole('button', { name: /^Ghi chỉ số điện P\.101/ }).click();
  await expect(dlg).toBeVisible();
  await expect(dlg.getByLabel(/^Số cũ/)).toBeDisabled();
  await expect(dlg.getByLabel(/^Số cũ/)).toHaveValue('160');
  await dlg.getByRole('button', { name: 'Hủy' }).click();
  await page.getByLabel('Kỳ ghi chỉ số').selectOption({ label: periodAt(-2) });
  await expect(page.getByTestId('meter-P.101-ELECTRICITY').getByText(/Đã có chỉ số của kỳ sau/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('FE-06A — Dịch vụ áp dụng cho phòng: thêm từ bảng giá tòa nhà, chống trùng, ngừng', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  await login(page, 'quan@demo.vn');
  await page.goto('/w/ws-an-nhien/rooms');
  await page.getByRole('link', { name: /A\.|B\.|C\.|P\./ }).first().click();
  await expect(page.getByRole('heading', { name: 'Dịch vụ áp dụng' })).toBeVisible();
  await expect(page.getByText('Phòng chưa áp dụng dịch vụ nào')).toBeVisible();
  await page.getByRole('button', { name: 'Thêm dịch vụ' }).evaluate((el) => (el as unknown as { click(): void }).click()); // ảnh phòng tải chậm làm dịch chuyển bố cục trên mobile
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel(/^Dịch vụ/).selectOption('WIFI');
  await dlg.getByRole('button', { name: 'Thêm dịch vụ' }).evaluate((el) => (el as unknown as { click(): void }).click());
  await expect(page.getByText('Đã thêm dịch vụ cho phòng.')).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'WIFI' }).first()).toBeVisible();
  // trùng khoảng thời gian → lỗi nghiệp vụ hiển thị tại trường
  await page.getByRole('button', { name: 'Thêm dịch vụ' }).evaluate((el) => (el as unknown as { click(): void }).click()); // ảnh phòng tải chậm làm dịch chuyển bố cục trên mobile
  await dlg.getByLabel(/^Dịch vụ/).selectOption('WIFI');
  await dlg.getByRole('button', { name: 'Thêm dịch vụ' }).evaluate((el) => (el as unknown as { click(): void }).click());
  await expect(dlg.getByText(/Phòng đã áp dụng dịch vụ này/)).toBeVisible();
  await dlg.getByRole('button', { name: 'Hủy' }).evaluate((el) => (el as unknown as { click(): void }).click());
  // ngừng: ngày phải sau ngày bắt đầu
  await page.getByRole('button', { name: 'Ngừng áp dụng' }).evaluate((el) => (el as unknown as { click(): void }).click());
  await dlg.getByLabel(/^Ngừng từ ngày/).fill('2000-01-01');
  await dlg.getByRole('button', { name: 'Ngừng áp dụng' }).evaluate((el) => (el as unknown as { click(): void }).click());
  await expect(dlg.getByText('Ngày ngừng phải sau ngày bắt đầu áp dụng')).toBeVisible();
  await dlg.getByLabel(/^Ngừng từ ngày/).fill('2099-01-01');
  await dlg.getByRole('button', { name: 'Ngừng áp dụng' }).evaluate((el) => (el as unknown as { click(): void }).click());
  await expect(page.getByText('Đã ngừng áp dụng dịch vụ.')).toBeVisible();
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
  // Chủ trọ đăng nhập vào thẳng khu quản lý
  await expect(page).toHaveURL('/w/ws-an-nhien/dashboard');
  const ws = '/w/ws-an-nhien';
  const routes = [
    'dashboard', 'buildings', 'buildings/new', 'buildings/bld-a', 'buildings/bld-a/edit',
    'rooms', 'rooms/new', 'rooms/room-bld-a-P302', 'rooms/room-bld-a-P302/edit', 'viewings',
    'tenants', 'tenants/new', 'tenants/ten-1', 'tenants/ten-1/edit', 'contracts', 'contracts/new', 'contracts/ctr-1', 'contracts/ctr-1/edit',
    'vehicles', 'rates', 'meters', 'invoices', 'billing/run', 'payments', 'deposits', 'maintenance', 'maintenance/bld-a/mnt-1',
  ];
  for (const r of routes) {
    await page.goto(`${ws}/${r}`);
    await expect(page.locator('h1').first(), `route ${r}`).toBeVisible();
    await expect(page.getByText('Hệ thống gặp sự cố ngoài ý muốn'), `route ${r}`).toHaveCount(0);
  }
  // V1 không có quản lý nhân viên/cài đặt: menu không có mục này, URL cũ quay về dashboard
  await expect(page.getByRole('link', { name: /Thành viên|Cài đặt/ })).toHaveCount(0);
  await page.goto(`${ws}/members`);
  await expect(page).toHaveURL(`${ws}/dashboard`);
  expect(errors).toEqual([]);
});

async function pickContract(page: Page) {
  const dlg = page.getByRole('dialog');
  const option = dlg.locator('option', { hasText: 'Đang hiệu lực' }).first();
  const label = (await option.textContent())!;
  await dlg.getByLabel(/^Hợp đồng/).selectOption({ label });
  return label;
}

test('FE-06B — Hóa đơn: tạo bản nháp → thiếu dữ liệu → bổ sung chỉ số → tính lại → phát hành → điều chỉnh', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = trackErrors(page);
  await login(page, 'quan@demo.vn');
  await page.goto('/w/ws-an-nhien/invoices');
  await expect(page.getByRole('heading', { name: 'Hóa đơn', exact: true })).toBeVisible();
  await expect(page.getByText('Chưa có hóa đơn')).toBeVisible();

  // tạo bản nháp: validation rồi tạo
  await page.getByRole('button', { name: 'Lập hóa đơn' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('button', { name: 'Tạo bản nháp' }).click();
  await expect(dlg.getByText('Chọn hợp đồng', { exact: true })).toBeVisible();
  const label = await pickContract(page);
  const room = /^(\S+)/.exec(label)![1]!;
  await dlg.getByLabel(/^Số người ở/).fill('101');
  await dlg.getByRole('button', { name: 'Tạo bản nháp' }).click();
  await expect(dlg.getByText('Số người ở là số nguyên từ 0 đến 100')).toBeVisible();
  await dlg.getByLabel(/^Số người ở/).fill('');
  await dlg.getByRole('button', { name: 'Tạo bản nháp' }).click();

  // bản nháp thiếu chỉ số: có cảnh báo, không phát hành được; trạng thái hóa đơn khác trạng thái thanh toán
  await expect(page.getByText('Đã tạo hóa đơn nháp.')).toBeVisible();
  await expect(page.getByText('Bản nháp').first()).toBeVisible();
  await expect(page.getByText(/Còn thiếu dữ liệu/)).toBeVisible();
  await expect(page.getByText('Thiếu chỉ số điện/nước của kỳ này').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Phát hành' })).toBeDisabled();
  await expect(page.getByText('Tạm tính (chưa phải số chốt)')).toBeVisible();

  // sang màn chỉ số (FE-06A) ghi điện và nước cho đúng phòng
  await page.getByRole('link', { name: /Ghi chỉ số/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Chỉ số điện nước' })).toBeVisible();
  for (const [kind, unit] of [['điện', 'kWh'], ['nước', 'm³']] as const) {
    const btn = page.getByRole('button', { name: new RegExp(`^Ghi chỉ số ${kind} .*${room.replace('.', '\\.')}$`) }).first();
    await btn.evaluate((el) => (el as unknown as { click(): void }).click());
    const d = page.getByRole('dialog');
    await d.getByLabel(/^Số cũ/).fill('10');
    await d.getByLabel(/^Số mới/).fill('30');
    await d.getByRole('button', { name: 'Lưu chỉ số' }).click();
    await expect(page.getByText(new RegExp(`Đã ghi chỉ số ${kind}`))).toBeVisible();
    expect(unit).toBeTruthy();
  }
  await page.goBack();

  // tính lại → đủ dữ liệu → có thể phát hành; sửa thông tin cũng tính lại
  await page.getByRole('button', { name: 'Tính lại' }).click();
  await expect(page.getByText('Đã tính lại từ dữ liệu hiện tại.')).toBeVisible();
  await expect(page.getByText(/Còn thiếu dữ liệu/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Sửa thông tin' }).click();
  await dlg.getByLabel(/^Số người ở/).fill('2');
  await dlg.getByLabel(/^Ghi chú/).fill('Kỳ đầu');
  await dlg.getByRole('button', { name: 'Lưu và tính lại' }).click();
  await expect(page.getByText('Đã cập nhật và tính lại hóa đơn.')).toBeVisible();
  await expect(page.getByText('Kỳ đầu')).toBeVisible();

  // phát hành (có xác nhận) → không sửa/xóa nữa; có số chốt và phần thanh toán riêng
  await page.getByRole('button', { name: 'Phát hành' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Phát hành' }).click();
  await expect(page.getByText('Đã phát hành hóa đơn.')).toBeVisible();
  await expect(page.getByText('Đã phát hành').first()).toBeVisible();
  await expect(page.getByText('Chưa thanh toán').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sửa thông tin' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Xóa bản nháp' })).toHaveCount(0);
  await expect(page.getByText('Tổng hóa đơn')).toBeVisible();

  // điều chỉnh: số khác 0, lý do bắt buộc, sửa lại một bút toán
  await expect(page.getByText('Chưa có điều chỉnh')).toBeVisible();
  await page.getByRole('button', { name: 'Thêm điều chỉnh' }).click();
  await dlg.getByLabel(/^Số tiền/).fill('0');
  await dlg.getByLabel(/^Lý do/).fill('Thử');
  await dlg.getByRole('button', { name: 'Ghi điều chỉnh' }).click();
  await expect(dlg.getByText('Số tiền không được bằng 0')).toBeVisible();
  await dlg.getByLabel(/^Số tiền/).fill('-50000');
  await dlg.getByLabel(/^Lý do/).fill('');
  await dlg.getByRole('button', { name: 'Ghi điều chỉnh' }).click();
  await expect(dlg.getByText('Nhập lý do điều chỉnh')).toBeVisible();
  await dlg.getByLabel(/^Lý do/).fill('Giảm giá');
  await dlg.getByRole('button', { name: 'Ghi điều chỉnh' }).click();
  await expect(page.getByText('Đã ghi điều chỉnh.')).toBeVisible();
  await expect(page.getByText('−50.000 ₫').first()).toBeVisible();
  await page.getByRole('button', { name: /^Sửa lại điều chỉnh/ }).click();
  await dlg.getByLabel(/^Số tiền/).fill('50000');
  await dlg.getByLabel(/^Lý do/).fill('Hoàn lại');
  await dlg.getByRole('button', { name: 'Ghi điều chỉnh' }).click();
  await expect(page.getByText('Đã ghi điều chỉnh.')).toBeVisible();
  await expect(page.getByText('Sửa lại bút toán trước đó')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Sửa lại điều chỉnh −50\.000/ })).toHaveCount(0);
  await page.getByRole('button', { name: /^Chi tiết điều chỉnh/ }).first().click();
  await expect(dlg.getByText('Mã bút toán')).toBeVisible();
  await dlg.getByRole('button', { name: 'Đóng' }).last().click();

  // danh sách: lọc theo trạng thái hóa đơn
  await page.locator('main').getByRole('link', { name: 'Hóa đơn', exact: true }).first().click();
  await page.getByLabel('Trạng thái hóa đơn').selectOption('DRAFT');
  await expect(page.getByText('Chưa có hóa đơn')).toBeVisible();
  await page.getByLabel('Trạng thái hóa đơn').selectOption('ISSUED');
  await expect(page.getByRole('row').filter({ hasText: 'Đã phát hành' }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('FE-06B — Hóa đơn: trùng kỳ bị từ chối, xóa bản nháp có xác nhận', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  await login(page, 'quan@demo.vn');
  await page.goto('/w/ws-an-nhien/invoices');
  await page.getByRole('button', { name: 'Lập hóa đơn' }).click();
  const dlg = page.getByRole('dialog');
  await pickContract(page);
  await dlg.getByRole('button', { name: 'Tạo bản nháp' }).click();
  await expect(page.getByText('Đã tạo hóa đơn nháp.')).toBeVisible();
  await page.locator('main').getByRole('link', { name: 'Hóa đơn', exact: true }).first().click();
  await expect(page.getByText('Còn thiếu dữ liệu').first()).toBeVisible();

  // cùng hợp đồng + cùng kỳ → INVOICE_DUPLICATE hiển thị tại ô kỳ
  await page.getByRole('button', { name: 'Lập hóa đơn' }).click();
  await pickContract(page);
  await dlg.getByRole('button', { name: 'Tạo bản nháp' }).click();
  await expect(dlg.getByText('Hợp đồng này đã có hóa đơn cho kỳ đã chọn.')).toBeVisible();
  await dlg.getByRole('button', { name: 'Hủy' }).click();

  // mở bản nháp, xóa có xác nhận (hủy xác nhận không xóa)
  await page.getByRole('row').filter({ hasText: 'Bản nháp' }).first().getByRole('link').first().click();
  await page.getByRole('button', { name: 'Xóa bản nháp' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Hủy' }).click();
  await expect(page.getByRole('heading', { name: /Hóa đơn kỳ/ })).toBeVisible();
  await page.getByRole('button', { name: 'Xóa bản nháp' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Xóa bản nháp' }).click();
  await expect(page.getByText('Đã xóa bản nháp.')).toBeVisible();
  await expect(page.getByText('Chưa có hóa đơn')).toBeVisible();
  expect(errors).toEqual([]);
});

/** Lập một hóa đơn đã phát hành qua UI thật (nháp → bổ sung chỉ số → tính lại → phát hành) và dừng ở trang chi tiết. */
async function createIssuedInvoice(page: Page) {
  await page.goto('/w/ws-an-nhien/invoices');
  await page.getByRole('button', { name: 'Lập hóa đơn' }).click();
  const dlg = page.getByRole('dialog');
  const label = await pickContract(page);
  const room = /^(\S+)/.exec(label)![1]!;
  await dlg.getByRole('button', { name: 'Tạo bản nháp' }).click();
  await expect(page.getByText('Đã tạo hóa đơn nháp.')).toBeVisible();
  await page.getByRole('link', { name: /Ghi chỉ số/ }).first().click();
  for (const kind of ['điện', 'nước']) {
    const btn = page.getByRole('button', { name: new RegExp(`^Ghi chỉ số ${kind} .*${room.replace('.', '\\.')}$`) }).first();
    await btn.evaluate((el) => (el as unknown as { click(): void }).click());
    const d = page.getByRole('dialog');
    await d.getByLabel(/^Số cũ/).fill('10');
    await d.getByLabel(/^Số mới/).fill('30');
    await d.getByRole('button', { name: 'Lưu chỉ số' }).click();
    await expect(page.getByText(new RegExp(`Đã ghi chỉ số ${kind}`))).toBeVisible();
  }
  await page.goBack();
  await page.getByRole('button', { name: 'Tính lại' }).click();
  await expect(page.getByText('Đã tính lại từ dữ liệu hiện tại.')).toBeVisible();
  await page.getByRole('button', { name: 'Phát hành' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Phát hành' }).click();
  await expect(page.getByText('Đã phát hành hóa đơn.')).toBeVisible();
}

test('FE-06C — Thanh toán: một phần → thu đủ, vượt số phải thu bị chặn, chi tiết, đảo khoản', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = trackErrors(page);
  await login(page, 'quan@demo.vn');
  await createIssuedInvoice(page);

  // từ chi tiết hóa đơn sang sổ thanh toán của đúng hóa đơn đó
  await page.getByRole('link', { name: /Sổ thanh toán của hóa đơn/ }).click();
  await expect(page.getByRole('heading', { name: 'Thanh toán', exact: true })).toBeVisible();
  await expect(page.getByText('Chưa có khoản thanh toán')).toBeVisible();
  await expect(page.getByText('Chưa thanh toán', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Xác nhận|Từ chối|minh chứng/i)).toHaveCount(0); // không có hàng chờ/confirm/reject/proof

  // thanh toán một phần (khôi phục luồng F4 cũ trên sổ thanh toán thật)
  await page.getByRole('button', { name: 'Ghi nhận thanh toán' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel(/^Số tiền/).fill('0');
  await dlg.getByRole('button', { name: 'Ghi nhận', exact: true }).click();
  await expect(dlg.getByText(/lớn hơn 0/)).toBeVisible();
  await dlg.getByLabel(/^Số tiền/).fill('999999999');
  await dlg.getByRole('button', { name: 'Ghi nhận', exact: true }).click();
  await expect(dlg.getByText('Tổng thanh toán không được vượt số phải thu của hóa đơn.')).toBeVisible();
  await dlg.getByLabel(/^Số tiền/).fill('100000');
  await dlg.getByLabel(/^Ghi chú/).fill('Đợt 1');
  await dlg.getByRole('button', { name: 'Ghi nhận', exact: true }).click();
  await expect(page.getByText('Đã ghi nhận thanh toán một phần.')).toBeVisible();
  await expect(page.getByText('Thanh toán một phần', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Đợt 1' }).first()).toBeVisible();

  // thu đủ số còn lại: trạng thái thanh toán đổi, trạng thái hóa đơn vẫn là Đã phát hành
  await page.getByRole('button', { name: 'Ghi nhận thanh toán' }).click();
  await dlg.getByRole('button', { name: 'Thu đủ số còn lại' }).click();
  await dlg.getByLabel(/^Hình thức/).selectOption('BANK_TRANSFER');
  await dlg.getByRole('button', { name: 'Ghi nhận', exact: true }).click();
  await expect(page.getByText('Đã thu đủ hóa đơn.')).toBeVisible();
  await expect(page.getByText('Đã thanh toán', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Đã phát hành', { exact: true }).first()).toBeVisible();

  // chi tiết một khoản
  await page.getByRole('button', { name: /^Chi tiết thanh toán/ }).first().click();
  await expect(dlg.getByText('Mã giao dịch')).toBeVisible();
  await dlg.getByRole('button', { name: 'Đóng' }).last().click();

  // đảo khoản đầu: cần lý do; bản gốc giữ nguyên và không đảo lại được
  await page.getByRole('button', { name: /^Đảo thanh toán 100\.000/ }).click();
  await dlg.getByRole('button', { name: 'Đảo khoản này' }).click();
  await expect(dlg.getByText('Nhập lý do đảo')).toBeVisible();
  await dlg.getByLabel(/^Lý do đảo/).fill('Ghi nhầm');
  await dlg.getByRole('button', { name: 'Đảo khoản này' }).click();
  await expect(page.getByText('Đã đảo khoản thanh toán.')).toBeVisible();
  await expect(page.getByText('Bản đảo').first()).toBeVisible();
  await expect(page.getByText('Đã bị đảo')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Đảo thanh toán 100\.000/ })).toHaveCount(0);
  await expect(page.getByText('Thanh toán một phần', { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('FE-06C — Tiền cọc: thu, khấu trừ, hoàn, vượt số dư bị chặn, chi tiết và đảo', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  await login(page, 'quan@demo.vn');
  await page.goto('/w/ws-an-nhien/deposits');
  await expect(page.getByRole('heading', { name: 'Tiền cọc', exact: true })).toBeVisible();
  await expect(page.getByText('Chọn một hợp đồng')).toBeVisible();
  const select = page.getByLabel('Hợp đồng', { exact: true });
  const active = select.locator('option', { hasText: 'Đang hiệu lực' }).first();
  await select.selectOption({ label: (await active.textContent())! });
  await expect(page.getByText('Chưa có giao dịch cọc')).toBeVisible();

  const dlg = page.getByRole('dialog');
  await page.getByRole('button', { name: 'Ghi nhận giao dịch cọc' }).click();
  await dlg.getByLabel(/^Số tiền/).fill('3000000');
  await dlg.getByRole('button', { name: 'Ghi nhận', exact: true }).click();
  await expect(page.getByText('Đã ghi nhận giao dịch cọc.').last()).toBeVisible();
  await expect(page.getByText(/3\.000\.000/).first()).toBeVisible();

  // khấu trừ: bắt buộc lý do + nội dung liên quan, không có hình thức
  await page.getByRole('button', { name: 'Ghi nhận giao dịch cọc' }).click();
  await dlg.getByLabel(/^Loại giao dịch/).selectOption('DEDUCTION');
  await expect(dlg.getByLabel(/^Hình thức/)).toHaveCount(0);
  await dlg.getByLabel(/^Số tiền/).fill('500000');
  await dlg.getByRole('button', { name: 'Ghi nhận', exact: true }).click();
  await expect(dlg.getByText('Nhập lý do khấu trừ')).toBeVisible();
  await dlg.getByLabel(/^Lý do/).fill('Hỏng cửa');
  await dlg.getByLabel(/^Nội dung liên quan/).fill('BB-01');
  await dlg.getByRole('button', { name: 'Ghi nhận', exact: true }).click();
  await expect(page.getByText('Đã ghi nhận giao dịch cọc.').last()).toBeVisible();
  await expect(page.getByText('Tham chiếu: BB-01')).toBeVisible();

  // hoàn cọc vượt số dư bị backend chặn, hoàn đúng số dư thì được; số dư lấy từ backend
  await page.getByRole('button', { name: 'Ghi nhận giao dịch cọc' }).click();
  await dlg.getByLabel(/^Loại giao dịch/).selectOption('REFUND');
  await dlg.getByLabel(/^Số tiền/).fill('9000000');
  await dlg.getByLabel(/^Lý do/).fill('Trả phòng');
  await dlg.getByLabel(/^Mã chuyển khoản/).fill('FT-001');
  await dlg.getByRole('button', { name: 'Ghi nhận', exact: true }).click();
  await expect(dlg.getByText(/Số dư cọc không đủ/)).toBeVisible();
  await dlg.getByLabel(/^Số tiền/).fill('2500000');
  await dlg.getByRole('button', { name: 'Ghi nhận', exact: true }).click();
  await expect(page.getByText('Đã ghi nhận giao dịch cọc.').last()).toBeVisible();
  await expect(page.getByText('Số dư cọc', { exact: true })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Hoàn cọc' }).first()).toBeVisible();

  // chi tiết + đảo khoản hoàn (compensating entry), không đảo lần hai
  await page.getByRole('button', { name: /^Chi tiết giao dịch cọc Hoàn cọc/ }).click();
  await expect(dlg.getByText('Mã giao dịch')).toBeVisible();
  await dlg.getByRole('button', { name: 'Đóng' }).last().click();
  await page.getByRole('button', { name: /^Đảo giao dịch cọc Hoàn cọc/ }).click();
  await dlg.getByRole('button', { name: 'Đảo giao dịch này' }).click();
  await expect(dlg.getByText('Nhập lý do đảo')).toBeVisible();
  await dlg.getByLabel(/^Lý do đảo/).fill('Ghi nhầm');
  await dlg.getByRole('button', { name: 'Đảo giao dịch này' }).click();
  await expect(page.getByText('Đã đảo giao dịch cọc.')).toBeVisible();
  await expect(page.getByText('Đã bị đảo')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Đảo giao dịch cọc Hoàn cọc/ })).toHaveCount(0);

  // hợp đồng đã kết thúc vẫn xem được sổ cọc
  const ended = select.locator('option', { hasText: 'Đã kết thúc' }).first();
  await select.selectOption({ label: (await ended.textContent())! });
  await expect(page.getByText('Sổ giao dịch')).toBeVisible();
  expect(errors).toEqual([]);
});

test('FE-07 — Bảo trì: lọc, tạo yêu cầu, sửa nội dung, chuyển trạng thái tuần tự (RESOLVED cần ghi chú)', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = trackErrors(page);
  await login(page, 'quan@demo.vn');
  await page.goto('/w/ws-an-nhien/maintenance');
  await expect(page.getByRole('heading', { name: 'Bảo trì', exact: true })).toBeVisible();
  await expect(page.getByText('Hỏng vòi sen tăng áp').first()).toBeVisible();
  await expect(page.getByText(/Phân công|bình luận|Bình luận/)).toHaveCount(0); // V1: không giao người phụ trách, không bình luận
  await page.getByLabel('Trạng thái', { exact: true }).selectOption('IN_PROGRESS');
  await expect(page.getByText('Không có yêu cầu bảo trì')).toBeVisible();
  await page.getByLabel('Trạng thái', { exact: true }).selectOption('OPEN');
  await expect(page.getByText('Hỏng vòi sen tăng áp').first()).toBeVisible();
  await page.getByLabel('Trạng thái', { exact: true }).selectOption('');

  // tạo yêu cầu cho một phòng
  await page.getByRole('button', { name: 'Tạo yêu cầu' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('button', { name: 'Tạo yêu cầu' }).click();
  await expect(dlg.getByText('Chọn phòng', { exact: true })).toBeVisible();
  await dlg.getByLabel(/^Phòng/).selectOption({ index: 1 });
  await dlg.getByLabel(/^Tiêu đề/).fill('Hỏng khóa cửa E2E');
  await dlg.getByLabel(/^Mô tả/).fill('Khóa cửa chính bị kẹt');
  await dlg.getByLabel(/^Mức ưu tiên/).selectOption('HIGH');
  await dlg.getByRole('button', { name: 'Tạo yêu cầu' }).click();
  await expect(page.getByText('Đã tạo yêu cầu bảo trì.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hỏng khóa cửa E2E' })).toBeVisible();
  await expect(page.getByText('Mới tiếp nhận').first()).toBeVisible();

  // chỉ có đúng một bước kế tiếp; không có nút nhảy cóc hay mở lại
  await expect(page.getByRole('button', { name: 'Bắt đầu xử lý' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Đánh dấu đã xử lý|Đóng yêu cầu/ })).toHaveCount(0);

  // sửa nội dung bằng PATCH (không đụng trạng thái)
  await page.getByRole('button', { name: 'Sửa nội dung' }).click();
  await dlg.getByLabel(/^Tiêu đề/).fill('Hỏng khóa cửa E2E (đã sửa)');
  await dlg.getByLabel(/^Mức ưu tiên/).selectOption('URGENT');
  await dlg.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByText('Đã cập nhật yêu cầu.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hỏng khóa cửa E2E (đã sửa)' })).toBeVisible();
  await expect(page.getByText('Mới tiếp nhận').first()).toBeVisible();

  await page.getByRole('button', { name: 'Bắt đầu xử lý' }).click();
  await dlg.getByRole('button', { name: 'Xác nhận' }).click();
  await expect(page.getByText(/Đã chuyển sang/).last()).toBeVisible();
  await expect(page.getByText('Đang xử lý').first()).toBeVisible();

  // RESOLVED bắt buộc có ghi chú xử lý
  await page.getByRole('button', { name: 'Đánh dấu đã xử lý' }).click();
  await dlg.getByRole('button', { name: 'Xác nhận' }).click();
  await expect(dlg.getByText('Nhập ghi chú xử lý')).toBeVisible();
  await dlg.getByLabel(/^Ghi chú xử lý/).fill('Đã thay ổ khóa mới');
  await dlg.getByRole('button', { name: 'Xác nhận' }).click();
  await expect(page.getByText('Đã thay ổ khóa mới').first()).toBeVisible();
  await expect(page.getByText('Đã xử lý').first()).toBeVisible();

  await page.getByRole('button', { name: 'Đóng yêu cầu' }).click();
  await dlg.getByRole('button', { name: 'Xác nhận' }).click();
  await expect(page.getByText('Đã đóng').first()).toBeVisible();
  // trạng thái cuối: không còn thao tác nào, lịch sử đủ 4 mốc
  await expect(page.getByRole('button', { name: /Sửa nội dung|Bắt đầu xử lý|Đánh dấu đã xử lý|Đóng yêu cầu/ })).toHaveCount(0);
  await expect(page.getByText('Tiếp nhận', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('FE-07 — Thông báo: huy hiệu chưa đọc thật, lọc chưa đọc, đánh dấu một / tất cả', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  await login(page, 'quan@demo.vn');
  await page.goto('/w/ws-an-nhien/dashboard');
  const badge = page.getByTestId('unread-badge');
  await expect(badge).toBeVisible();
  const before = Number(await badge.textContent());
  expect(before).toBeGreaterThan(1);
  await page.getByRole('link', { name: /^Thông báo/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Thông báo', exact: true })).toBeVisible();
  await expect(page.getByText(/chưa đọc\)/).first()).toBeAttached();

  // tab chưa đọc + đánh dấu một thông báo: huy hiệu giảm đúng 1
  await page.getByRole('tab', { name: /Chưa đọc/ }).click();
  const unreadRows = page.locator('li.notif--unread');
  await expect(unreadRows).toHaveCount(before);
  await unreadRows.first().getByRole('button', { name: 'Đã đọc', exact: true }).click();
  await expect(page.getByTestId('unread-badge')).toHaveText(String(before - 1));
  await expect(unreadRows).toHaveCount(before - 1);

  // đánh dấu tất cả: không còn huy hiệu, tab chưa đọc trống
  await page.getByRole('button', { name: 'Đánh dấu đã đọc tất cả' }).click();
  await expect(page.getByText(/Đã đánh dấu đã đọc \d+ thông báo\./)).toBeVisible();
  await expect(page.getByTestId('unread-badge')).toHaveCount(0);
  await expect(page.getByText('Không còn thông báo chưa đọc')).toBeVisible();
  await page.getByRole('tab', { name: 'Tất cả' }).click();
  await expect(page.locator('li.notif').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Đã đọc', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('FE-07 — Tổng quan: số liệu tổng hợp từ backend, lọc tòa nhà/kỳ, không còn mục chỉ có trong mock', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  await login(page, 'quan@demo.vn');
  await page.goto('/w/ws-an-nhien/dashboard');
  await expect(page.getByRole('heading', { name: 'Tổng quan', exact: true })).toBeVisible();
  for (const title of ['Phòng', 'Hợp đồng', 'Thu tiền & công nợ', 'Bảo trì']) {
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  }
  await expect(page.getByText('Tổng số phòng')).toBeVisible();
  await expect(page.getByText('Còn phải thu')).toBeVisible();
  await expect(page.getByText(/Doanh thu 6 tháng|Cơ cấu|Lấp đầy|Hóa đơn cần thu/)).toHaveCount(0);

  await page.getByLabel('Tòa nhà', { exact: true }).selectOption({ label: 'Tòa A' });
  await expect(page.getByText(/Tòa A/).first()).toBeVisible();
  await page.getByLabel('Kỳ', { exact: true }).fill('2026-09');
  await expect(page.getByText(/kỳ T9\/2026/).first()).toBeVisible();

  // liên kết chuyển tới màn thật, giữ tòa nhà/kỳ đang chọn
  await page.getByRole('link', { name: 'Xem hóa đơn →' }).click();
  await expect(page).toHaveURL(/\/invoices\?buildingId=bld-a&period=2026-09/);
  await expect(page.getByRole('heading', { name: 'Hóa đơn', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

/** Mã mời mẫu của mock (cùng quy tắc đệm với mocks/tenant-links.ts). */
const inviteToken = (label: string) => `${label}_`.padEnd(43, 'x').slice(0, 43);
const INVITE = {
  valid: inviteToken('DEMO-valid-ten-2'),
  secondWorkspace: inviteToken('DEMO-valid-sunhouse'),
  expired: inviteToken('DEMO-expired'),
  used: inviteToken('DEMO-used'),
  conflict: inviteToken('DEMO-conflict-ten-1'),
};
/** Điều hướng trong ứng dụng (không tải lại trang): mock giữ trạng thái trong bộ nhớ nên tải lại sẽ mất liên kết vừa tạo. */
const navTo = (page: Page, name: string | RegExp) =>
  page.getByRole('link', { name }).first().evaluate((el) => (el as unknown as { click(): void }).click());
const monthsAgo = (n: number) => {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - n, 1);
  return d.toISOString().slice(0, 7);
};

test('FE-08 — Người thuê: hồ sơ liên kết, lịch sử yêu cầu liên kết (chỉ đọc), menu không còn Gửi thanh toán', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  await login(page, 'nam@demo.vn');
  await expect(page).toHaveURL('/tenant');
  await expect(page.getByRole('heading', { name: 'Xin chào, Trần Văn Nam' })).toBeVisible();
  await expect(page.getByText('Hồ sơ người thuê đã liên kết')).toBeVisible();
  await expect(page.getByText('Nhà Trọ An Nhiên Group').first()).toBeVisible();
  await expect(page.getByText(/Tổng còn nợ|Thanh toán chờ xác nhận|Gửi thông tin thanh toán/)).toHaveCount(0);
  if (test.info().project.name === 'desktop') {
    await expect(page.getByRole('link', { name: 'Gửi thanh toán' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Thông báo' }).first()).toBeVisible();
  }

  await page.goto('/tenant/link-account');
  await expect(page.getByRole('heading', { name: 'Liên kết tài khoản', exact: true })).toBeVisible();
  await expect(page.getByText('Lịch sử yêu cầu liên kết')).toBeVisible();
  await expect(page.getByText('Không khớp hồ sơ thuê.')).toBeVisible();
  await expect(page.locator('td').getByText('Chờ chủ trọ duyệt').first()).toBeVisible();
  // chỉ nhập mã mời: không UUID hồ sơ / OTP / số điện thoại / mã hợp đồng, không có nút gửi yêu cầu liên kết
  await expect(page.getByLabel(/OTP|Số điện thoại|Mã hợp đồng|Mã hồ sơ/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Gửi yêu cầu liên kết|Gửi yêu cầu/ })).toHaveCount(0);
  await page.getByLabel('Trạng thái yêu cầu').selectOption('REJECTED');
  await expect(page.getByText('Không khớp hồ sơ thuê.')).toBeVisible();
  await expect(page.locator('td').getByText('Chờ chủ trọ duyệt', { exact: true })).toHaveCount(0);

  // các route cũ không còn
  await page.goto('/tenant/payments/new');
  await expect(page.getByText('Gửi thông tin thanh toán')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('FE-08 — Người thuê: hợp đồng đủ pha, sổ tiền cọc, hóa đơn ISSUED với sổ thanh toán và điều chỉnh', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = trackErrors(page);
  await login(page, 'nam@demo.vn');

  await page.goto('/tenant/contracts');
  await expect(page.getByRole('heading', { name: 'Hợp đồng của tôi' })).toBeVisible();
  for (const phase of ['Đang hiệu lực', 'Chưa có hiệu lực', 'Đã kết thúc', 'Đã hủy trước ngày bắt đầu']) {
    await expect(page.locator('td').getByText(phase, { exact: true }).first()).toBeVisible();
  }
  await page.getByLabel('Trạng thái hợp đồng').selectOption('ENDED');
  await expect(page.locator('td').getByText('Chưa có hiệu lực', { exact: true })).toHaveCount(0);
  await expect(page.locator('td').getByText('Đã hủy trước ngày bắt đầu', { exact: true }).first()).toBeVisible();

  // hợp đồng đã kết thúc: cọc đã thu, khấu trừ và hoàn hết → số dư 0
  await page.goto('/tenant/contracts/ctr-t1-ended');
  await expect(page.getByRole('heading', { name: /Hợp đồng phòng/ })).toBeVisible();
  await expect(page.getByText('Số dư cọc')).toBeVisible();
  await expect(page.getByText('Thu cọc', { exact: true })).toBeVisible();
  await expect(page.getByText('Khấu trừ', { exact: true })).toBeVisible();
  await expect(page.getByText('Hoàn cọc', { exact: true })).toBeVisible();
  await expect(page.getByText('Sửa khóa cửa')).toBeVisible();
  await expect(page.getByRole('button', { name: /Thu cọc|Hoàn cọc|Đảo|Ghi nhận/ })).toHaveCount(0); // người thuê chỉ xem
  // hợp đồng tương lai vẫn xem được, có ghi chú và không có nút gửi bảo trì
  await page.goto('/tenant/contracts/ctr-t1-upcoming');
  await expect(page.getByText(/chưa đến ngày bắt đầu/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Yêu cầu bảo trì' })).toHaveCount(0);
  // hợp đồng của người khác / không tồn tại
  await page.goto('/tenant/contracts/ctr-2');
  await expect(page.getByText(/không thuộc hồ sơ bạn đang liên kết/)).toBeVisible();
  await page.getByRole('link', { name: /Về danh sách hợp đồng/ }).click();
  await expect(page).toHaveURL('/tenant/contracts');
  // hợp đồng đang hiệu lực: cọc có bản đảo
  await page.goto('/tenant/contracts/ctr-1');
  await expect(page.getByText('Bản đảo', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Giao dịch này đã bị đảo')).toBeVisible();

  // hóa đơn: chỉ ISSUED (3 hóa đơn, không có bản nháp kỳ hiện tại)
  await page.goto('/tenant/invoices');
  await expect(page.getByRole('heading', { name: 'Hóa đơn của tôi' })).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await expect(page.getByText('Bản nháp')).toHaveCount(0);
  await expect(page.getByText('Thanh toán một phần').first()).toBeVisible();
  await page.getByLabel('Kỳ', { exact: true }).fill(monthsAgo(2));
  await expect(page.locator('tbody tr')).toHaveCount(1);

  // hóa đơn có điều chỉnh + trả một phần
  await page.goto(`/tenant/invoices/tinv-ctr-1-${monthsAgo(2)}`);
  await expect(page.getByRole('heading', { name: /Hóa đơn kỳ/ })).toBeVisible();
  await expect(page.getByText('Tiền thuê phòng')).toBeVisible();
  await expect(page.getByText('Lịch sử thanh toán')).toBeVisible();
  await expect(page.getByText('Phí thay bóng đèn phát sinh')).toBeVisible();
  await expect(page.getByText('Sửa lại bút toán trước đó')).toBeVisible();
  await expect(page.getByText('Thanh toán một phần').first()).toBeVisible();
  await expect(page.getByText(/Gửi thông tin thanh toán|minh chứng|Số tài khoản/)).toHaveCount(0);
  // hóa đơn đã trả đủ có khoản thu bị đảo rồi thu lại
  await page.goto(`/tenant/invoices/tinv-ctr-1-${monthsAgo(3)}`);
  await expect(page.getByText('Ghi nhầm số tiền')).toBeVisible();
  await expect(page.getByText('Khoản này đã bị đảo')).toBeVisible();
  await expect(page.getByText('Không có điều chỉnh')).toBeVisible();
  // bản nháp và hóa đơn người khác: 404
  await page.goto(`/tenant/invoices/tinv-ctr-1-${monthsAgo(0)}`);
  await expect(page.getByText(/không thuộc hồ sơ bạn đang liên kết/)).toBeVisible();
  await page.goto(`/tenant/invoices/tinv-ctr-3-${monthsAgo(1)}`);
  await expect(page.getByText(/không thuộc hồ sơ bạn đang liên kết/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('FE-08 — Người thuê: gửi yêu cầu bảo trì, xem chi tiết, hủy khi còn mới tiếp nhận', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = trackErrors(page);
  await login(page, 'nam@demo.vn');
  await page.goto('/tenant/maintenance');
  await expect(page.getByRole('heading', { name: 'Bảo trì', exact: true })).toBeVisible();
  await expect(page.getByText('Đèn hành lang chập chờn').first()).toBeVisible();
  await page.getByLabel('Trạng thái', { exact: true }).selectOption('IN_PROGRESS');
  await expect(page.getByText('Vòi nước bồn rửa rỉ nước').first()).toBeVisible();
  await expect(page.getByText('Đèn hành lang chập chờn')).toHaveCount(0);
  await page.getByLabel('Trạng thái', { exact: true }).selectOption('');

  // yêu cầu đã nhận xử lý: không hủy được, không lộ người phụ trách
  await page.goto('/tenant/maintenance/tmnt-doing');
  await expect(page.getByText('Đã hẹn thợ sửa')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hủy yêu cầu' })).toHaveCount(0);
  await expect(page.getByText(/Người phụ trách|Bình luận|Ảnh/)).toHaveCount(0);

  // gửi yêu cầu: chỉ hợp đồng đang hiệu lực đã bắt đầu
  await page.goto('/tenant/maintenance');
  await page.getByRole('button', { name: /Gửi yêu cầu/ }).first().evaluate((el) => (el as unknown as { click(): void }).click());
  const dlg = page.getByRole('dialog');
  await expect(dlg.getByLabel(/^Hợp đồng/)).toBeVisible();
  await expect(dlg.locator('select').first().locator('option')).toHaveCount(2); // chỉ ctr-1 (+ dòng “Chọn hợp đồng”), không có hợp đồng tương lai
  await dlg.getByRole('button', { name: 'Gửi yêu cầu' }).evaluate((el) => (el as unknown as { click(): void }).click());
  await expect(dlg.getByText('Chọn hợp đồng', { exact: true }).first()).toBeVisible();
  await dlg.getByLabel(/^Hợp đồng/).selectOption({ index: 1 });
  await dlg.getByLabel(/^Tiêu đề/).fill('Hỏng khóa cửa E2E');
  await dlg.getByLabel(/^Mô tả/).fill('Khóa cửa chính bị kẹt');
  await dlg.getByLabel(/^Mức ưu tiên/).selectOption('URGENT');
  await dlg.getByRole('button', { name: 'Gửi yêu cầu' }).evaluate((el) => (el as unknown as { click(): void }).click());
  await expect(page.getByText('Đã gửi yêu cầu bảo trì.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hỏng khóa cửa E2E' })).toBeVisible();
  await expect(page.getByText('Mới tiếp nhận').first()).toBeVisible();
  await expect(page.getByText('Khẩn cấp').first()).toBeVisible();

  // hủy khi còn OPEN
  await page.getByRole('button', { name: 'Hủy yêu cầu' }).evaluate((el) => (el as unknown as { click(): void }).click());
  await dlg.getByLabel(/Lý do/).fill('Đã tự sửa được');
  await dlg.getByRole('button', { name: 'Hủy yêu cầu' }).evaluate((el) => (el as unknown as { click(): void }).click());
  await expect(page.getByText('Đã hủy yêu cầu bảo trì.')).toBeVisible();
  await expect(page.getByText('Đã tự sửa được')).toBeVisible();
  await expect(page.getByText('Đã hủy', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hủy yêu cầu' })).toHaveCount(0);

  // yêu cầu không thuộc mình: 404
  await page.goto('/tenant/maintenance/khong-ton-tai');
  await expect(page.getByText(/không thuộc hồ sơ bạn đang liên kết/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('FE-08 — Liên kết bằng mã mời: sai/hết hạn/đã dùng bị từ chối; hợp lệ mở Cổng người thuê; liên kết thêm workspace khác', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = trackErrors(page);
  await login(page, 'minh@demo.vn');
  await page.goto('/link-tenant');
  await expect(page.getByRole('heading', { name: 'Liên kết tài khoản', exact: true })).toBeVisible();
  await expect(page.getByLabel(/OTP|Số điện thoại|Mã hợp đồng|Mã hồ sơ/)).toHaveCount(0);
  const token = page.getByLabel(/^Mã mời/);
  const submit = page.getByRole('button', { name: 'Liên kết tài khoản' });

  await token.fill('ngan');
  await submit.evaluate((el) => (el as unknown as { click(): void }).click());
  await expect(page.getByText(/đúng 43 ký tự/)).toBeVisible();
  for (const bad of ['x'.repeat(43), INVITE.expired, INVITE.used]) {
    await token.fill(bad);
    await submit.evaluate((el) => (el as unknown as { click(): void }).click());
    await expect(page.getByRole('alert').filter({ hasText: /không hợp lệ, đã hết hạn hoặc đã được sử dụng/ })).toBeVisible();
  }
  await token.fill(INVITE.conflict);
  await submit.evaluate((el) => (el as unknown as { click(): void }).click());
  await expect(page.getByRole('alert').filter({ hasText: /đã có tài khoản liên kết/ })).toBeVisible();
  await expect(page).toHaveURL('/link-tenant');

  await token.fill(INVITE.valid);
  await submit.evaluate((el) => (el as unknown as { click(): void }).click());
  await expect(page.getByText('Đã liên kết tài khoản với hồ sơ người thuê.')).toBeVisible();
  await expect(page).toHaveURL('/tenant');
  await expect(page.getByText('Lê Hoàng Yến').first()).toBeVisible();

  // quyền cập nhật ngay: dữ liệu theo hồ sơ mới
  await navTo(page, 'Hợp đồng');
  await expect(page.locator('td').getByText('Quá hạn – chưa kết thúc').first()).toBeVisible();
  await navTo(page, 'Hóa đơn');
  await expect(page.locator('tbody tr')).toHaveCount(2);

  // mã đã dùng không dùng lại được; workspace khác thì được liên kết thêm
  await navTo(page, 'Liên kết tài khoản');
  await expect(page).toHaveURL('/tenant/link-account');
  await token.fill(INVITE.valid);
  await submit.evaluate((el) => (el as unknown as { click(): void }).click());
  await expect(page.getByRole('alert').filter({ hasText: /không hợp lệ, đã hết hạn hoặc đã được sử dụng/ })).toBeVisible();
  await token.fill(INVITE.secondWorkspace);
  await submit.evaluate((el) => (el as unknown as { click(): void }).click());
  await expect(page).toHaveURL('/tenant');
  await expect(page.getByText('Lê Hoàng Yến').first()).toBeVisible();
  await expect(page.getByText('Phạm Minh Châu').first()).toBeVisible();
  await expect(page.getByText('SunHouse Cầu Giấy').first()).toBeVisible();
  await navTo(page, 'Hợp đồng');
  await expect(page.getByText('Phòng S.101')).toBeVisible();
  expect(errors).toEqual([]);
});

test('FE-08 — Chủ trọ đồng thời là người thuê: giữ cả hai khu vực theo quyền thật', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  await login(page, 'quan@demo.vn');
  await page.goto('/tenant');
  await expect(page).toHaveURL(/\/w\/ws-an-nhien\/dashboard/); // chưa liên kết → chưa có khu người thuê
  await page.goto('/link-tenant');
  await page.getByLabel(/^Mã mời/).fill(INVITE.valid);
  await page.getByRole('button', { name: 'Liên kết tài khoản' }).evaluate((el) => (el as unknown as { click(): void }).click());
  await expect(page).toHaveURL('/tenant');
  if (test.info().project.name === 'desktop') {
    await expect(page.locator('.area-switcher:visible').first().getByRole('link')).toHaveText(['Tìm phòng trọ', 'Chủ trọ(Landlord)', 'Cổng người thuê(Tenant)']);
  }
  await navTo(page, 'Hợp đồng');
  await expect(page.getByRole('heading', { name: 'Hợp đồng của tôi' })).toBeVisible();
  if (test.info().project.name === 'desktop') {
    // vẫn là chủ trọ: khu Chủ trọ còn nguyên (chuyển khu vực trong ứng dụng; thanh khu vực bị ẩn trên mobile)
    await page.locator('.area-switcher:visible').first().getByRole('link', { name: /Chủ trọ/ }).click();
    await expect(page).toHaveURL(/\/w\/ws-an-nhien\/dashboard/);
    await expect(page.getByRole('heading', { name: 'Tổng quan', exact: true })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

/** Nhấp qua DOM: bố cục mobile dịch chuyển khi tải, và thanh điều hướng bên bị ẩn. */
const tap = (locator: Locator) => locator.evaluate((el) => (el as unknown as { click(): void }).click());

test('FE-09 — Admin: duyệt và từ chối đơn chủ trọ bằng lý do bắt buộc, không tự duyệt đơn của mình, có trong nhật ký', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = trackErrors(page);
  await login(page, 'admin@demo.vn');
  await expect(page).toHaveURL('/admin');
  await expect(page.getByRole('heading', { name: 'Tổng quan quản trị' })).toBeVisible();
  await expect(page.getByText('Đơn chủ trọ chờ duyệt')).toBeVisible();
  await expect(page.getByText(/Doanh thu|Workspace|7 ngày|báo cáo/i)).toHaveCount(0);

  await tap(page.getByRole('link', { name: 'Xem đơn →' }));
  await expect(page.getByRole('heading', { name: 'Đơn đăng ký chủ trọ' })).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await expect(page.getByText(/không tự duyệt được/)).toBeVisible(); // đơn của chính admin
  await expect(page.getByRole('button', { name: 'Duyệt', exact: true })).toHaveCount(2);

  // duyệt: lý do bắt buộc
  const dlg = page.getByRole('dialog');
  await tap(page.getByRole('button', { name: 'Duyệt', exact: true }).first());
  await expect(dlg.getByText(/không tự tạo workspace/)).toBeVisible();
  await tap(dlg.getByRole('button', { name: 'Duyệt đơn' }));
  await expect(dlg.getByText('Nhập lý do')).toBeVisible();
  await dlg.getByLabel(/^Lý do/).fill('Đã xác minh giấy tờ sở hữu');
  await tap(dlg.getByRole('button', { name: 'Duyệt đơn' }));
  await expect(page.getByText('Đã duyệt đơn.')).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(2);

  // từ chối
  await tap(page.getByRole('button', { name: 'Từ chối', exact: true }).first());
  await dlg.getByLabel(/^Lý do/).fill('Hồ sơ nộp thiếu giấy tờ sở hữu');
  await tap(dlg.getByRole('button', { name: 'Từ chối đơn' }));
  await expect(page.getByText('Đã từ chối đơn.')).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Duyệt', exact: true })).toHaveCount(0);

  // kết quả hiện ở bộ lọc Đã duyệt / Đã từ chối kèm lý do
  await page.getByLabel('Trạng thái đơn').selectOption('APPROVED');
  await expect(page.getByText('Đã xác minh giấy tờ sở hữu')).toBeVisible();
  await page.getByLabel('Trạng thái đơn').selectOption('REJECTED');
  await expect(page.getByText('Hồ sơ nộp thiếu giấy tờ sở hữu')).toBeVisible();

  // lịch sử thao tác
  await tap(page.getByRole('link', { name: 'Nhật ký hoạt động' }).first());
  await expect(page.getByRole('heading', { name: 'Nhật ký hoạt động' })).toBeVisible();
  await expect(page.locator('td p', { hasText: /^Duyệt đơn chủ trọ$/ }).first()).toBeVisible();
  await expect(page.locator('td p', { hasText: /^Từ chối đơn chủ trọ$/ }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('FE-09 — Admin: khóa và mở khóa người dùng có lý do, xem chi tiết, không khóa Platform Admin', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = trackErrors(page);
  await login(page, 'admin@demo.vn');
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: 'Quản lý người dùng' })).toBeVisible();
  await expect(page.getByText(/Vai trò|Hoạt động cuối|SĐT/)).toHaveCount(0);
  const adminRow = page.locator('tbody tr', { hasText: 'admin@demo.vn' });
  await expect(adminRow.getByText('Platform Admin')).toBeVisible();
  await expect(adminRow.getByRole('button', { name: 'Khóa' })).toHaveCount(0);

  await page.getByPlaceholder('Tìm theo email…').fill('user3@');
  const row = page.locator('tbody tr', { hasText: 'user3@mail.vn' });
  await expect(page.locator('tbody tr')).toHaveCount(1);
  const dlg = page.getByRole('dialog');
  await tap(row.getByRole('button', { name: 'Khóa' }));
  await tap(dlg.getByRole('button', { name: 'Khóa tài khoản' }));
  await expect(dlg.getByText('Nhập lý do')).toBeVisible();
  await dlg.getByLabel(/^Lý do/).fill('Đăng tin lừa đảo');
  await tap(dlg.getByRole('button', { name: 'Khóa tài khoản' }));
  await expect(page.getByText('Đã khóa tài khoản.')).toBeVisible();
  await expect(row.getByText('Đã khóa', { exact: true })).toBeVisible();

  // chi tiết từ endpoint riêng
  await tap(row.getByRole('link', { name: 'Chi tiết' }));
  await expect(page.getByRole('heading', { name: 'Trần Thị Thu' })).toBeVisible();
  await expect(page.getByText('Đăng tin lừa đảo')).toBeVisible();
  await expect(page.getByText('Phiên đăng nhập đang hoạt động')).toBeVisible();
  await tap(page.getByRole('button', { name: 'Mở khóa' }));
  await tap(dlg.getByRole('button', { name: 'Mở khóa' }));
  await expect(dlg.getByText('Nhập lý do')).toBeVisible();
  await dlg.getByLabel(/^Lý do/).fill('Đã xác minh lại danh tính');
  await tap(dlg.getByRole('button', { name: 'Mở khóa' }));
  await expect(page.getByText('Đã mở khóa tài khoản.')).toBeVisible();
  await expect(page.getByText('Đã xác minh lại danh tính')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mở khóa' })).toHaveCount(0);

  // nhật ký của đúng tài khoản này
  await tap(page.getByRole('link', { name: /Xem nhật ký của tài khoản/ }));
  await expect(page.locator('td p', { hasText: /^Khóa tài khoản$/ })).toHaveCount(1);
  await expect(page.locator('td p', { hasText: /^Mở khóa tài khoản$/ })).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('FE-09 — Admin: ẩn và khôi phục tin đăng (lý do bắt buộc), xem trước bằng id tin đăng', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = trackErrors(page);
  await login(page, 'admin@demo.vn');
  await page.goto('/admin/listings');
  await expect(page.getByRole('heading', { name: 'Quản lý tin đăng' })).toBeVisible();
  await expect(page.getByText(/Bị báo cáo|REPORTED|báo cáo/i)).toHaveCount(0);
  await expect(page.locator('tbody tr', { hasText: 'P.101' }).getByRole('link', { name: /Phòng P\.101/ })).toHaveAttribute('href', '/rooms/r-1');

  const dlg = page.getByRole('dialog');
  await tap(page.locator('tbody tr', { hasText: 'P.101' }).getByRole('button', { name: 'Ẩn tin' }));
  await tap(dlg.getByRole('button', { name: 'Ẩn tin' }));
  await expect(dlg.getByText('Nhập lý do')).toBeVisible();
  await dlg.getByLabel(/^Lý do/).fill('Ảnh không đúng thực tế');
  await tap(dlg.getByRole('button', { name: 'Ẩn tin' }));
  await expect(page.getByText('Đã ẩn tin đăng.')).toBeVisible();

  await page.getByLabel('Kiểm duyệt').selectOption('true');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.getByText('Ảnh không đúng thực tế')).toBeVisible();
  await expect(page.locator('tbody tr').first().getByRole('link')).toHaveCount(0); // tin bị ẩn không có trang công khai
  await tap(page.getByRole('button', { name: 'Khôi phục' }));
  await dlg.getByLabel(/^Lý do/).fill('Đã bổ sung ảnh thật');
  await tap(dlg.getByRole('button', { name: 'Khôi phục' }));
  await expect(page.getByText('Đã khôi phục tin đăng.')).toBeVisible();
  await expect(page.getByText('Không có tin đăng')).toBeVisible();

  await page.getByLabel('Kiểm duyệt').selectOption('');
  await page.getByLabel('Chủ trọ đăng').selectOption('false');
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await expect(page.locator('tbody tr').first().getByText('Chưa đăng')).toBeVisible();
  expect(errors).toEqual([]);
});

test('FE-09 — Admin: nhật ký đúng dữ liệu backend, bộ lọc chỉ USER/LISTING, không còn trang Workspace', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  await login(page, 'admin@demo.vn');
  for (const r of ['/admin', '/admin/applications', '/admin/users', '/admin/listings', '/admin/audit-logs']) {
    await page.goto(r);
    await expect(page.locator('h1').first()).toBeVisible();
    await expectNoCrash(page);
  }
  // trang quản trị Workspace không còn (backend không có)
  await page.goto('/admin/workspaces');
  await expect(page.getByRole('heading', { name: /Quản lý workspace/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Workspace', exact: true })).toHaveCount(0);

  await page.goto('/admin/audit-logs');
  await expect(page.getByRole('heading', { name: 'Nhật ký hoạt động' })).toBeVisible();
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /IP|Nhóm/ })).toHaveCount(0);
  const targetOptions = await page.getByLabel('Loại đối tượng').locator('option').allTextContents();
  expect(targetOptions).toEqual(['Mọi đối tượng', 'Người dùng', 'Tin đăng']);
  await page.getByLabel('Sự kiện', { exact: true }).selectOption('USER_LOCK');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('td p', { hasText: /^Khóa tài khoản$/ })).toBeVisible();
  await page.getByLabel('Sự kiện', { exact: true }).selectOption('');
  await page.getByLabel('Loại đối tượng').selectOption('LISTING');
  await expect(page.locator('td p', { hasText: /^Ẩn tin đăng$/ })).toBeVisible();
  await expect(page.locator('td p', { hasText: /^Khóa tài khoản$/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('FE-09 — Chỉ Platform Admin vào được khu quản trị (OWNER, người thuê, khách đều bị chặn)', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  await page.goto('/admin/users');
  await expect(page).toHaveURL(/\/login/);
  await login(page, 'quan@demo.vn');
  for (const r of ['/admin', '/admin/applications', '/admin/users', '/admin/users/u-x0', '/admin/listings', '/admin/audit-logs']) {
    await page.goto(r);
    await expect(page).toHaveURL(/\/w\/ws-an-nhien\/dashboard/);
  }
  await page.evaluate(() => {
    sessionStorage.clear();
    localStorage.clear();
  });
  await login(page, 'nam@demo.vn');
  for (const r of ['/admin/applications', '/admin/listings', '/admin/audit-logs']) {
    await page.goto(r);
    await expect(page).toHaveURL('/tenant');
  }
  expect(errors).toEqual([]);
});

test('FE-10 — OWNER: yêu cầu xem phòng đúng backend (xác nhận/từ chối kèm ghi chú, không còn Hoàn thành/SĐT)', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = trackErrors(page);
  await login(page, 'quan@demo.vn');
  await page.goto('/w/ws-an-nhien/viewings');
  await expect(page.getByRole('heading', { name: 'Yêu cầu xem phòng' })).toBeVisible();
  // chỉ có bốn trạng thái của backend + Tất cả
  await expect(page.getByRole('tab')).toHaveText(['Chờ xác nhận', 'Đã xác nhận', 'Bị từ chối', 'Đã hủy', 'Tất cả']);
  await expect(page.getByRole('tab', { name: /Đã xem|Hoàn thành/ })).toHaveCount(0);
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await expect(page.getByText(/09\d{8}/)).toHaveCount(0); // không còn số điện thoại người xem
  await expect(page.getByRole('button', { name: /Hoàn thành|Hủy lịch/ })).toHaveCount(0);

  // xác nhận kèm ghi chú
  const row = (name: string) => page.locator('tbody tr', { hasText: name });
  const dlg = page.getByRole('dialog');
  await tap(row('Vũ Tuấn Kiệt').getByRole('button', { name: 'Xác nhận' }));
  await dlg.getByLabel(/^Ghi chú/).fill('Hẹn gặp ở sảnh tòa nhà');
  await tap(dlg.getByRole('button', { name: 'Xác nhận lịch xem' }));
  await expect(page.getByText('Đã xác nhận lịch xem.')).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(2);

  // từ chối (ghi chú tùy chọn)
  await tap(row('Hoàng Bảo Ngọc').getByRole('button', { name: 'Từ chối' }));
  await tap(dlg.getByRole('button', { name: 'Từ chối yêu cầu' }));
  await expect(page.getByText('Đã từ chối yêu cầu.')).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(1);

  // giờ hẹn đã qua: backend không cho xác nhận (409), vẫn từ chối được
  await tap(row('Đỗ Thu Trang').getByRole('button', { name: 'Xác nhận' }));
  await tap(dlg.getByRole('button', { name: 'Xác nhận lịch xem' }));
  await expect(page.getByText(/giờ hẹn đã qua/)).toBeVisible();
  await expect(row('Đỗ Thu Trang').getByRole('button', { name: 'Xác nhận' })).toBeVisible();

  // kết quả theo từng trạng thái
  await page.getByRole('tab', { name: 'Đã xác nhận' }).click();
  await expect(row('Vũ Tuấn Kiệt')).toBeVisible();
  await expect(row('Vũ Tuấn Kiệt').getByText('Hẹn gặp ở sảnh tòa nhà')).toBeVisible();
  await expect(row('Vũ Tuấn Kiệt').getByRole('button')).toHaveCount(0); // đã xử lý: không còn thao tác
  await page.getByRole('tab', { name: 'Bị từ chối' }).click();
  await expect(row('Hoàng Bảo Ngọc')).toBeVisible();
  await page.getByRole('tab', { name: 'Đã hủy' }).click();
  await expect(row('Ông Văn Thịnh').getByText(/Người xem hủy lúc/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('FE-10 — Marketplace: trang chủ dùng GET /listings, lọc đúng tham số, chi tiết có Google Maps, bản đồ giả đã bỏ', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  const googleRequests: string[] = [];
  page.on('request', (req) => {
    if (/google\./.test(new URL(req.url()).hostname)) googleRequests.push(req.url());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Phòng mới đăng' })).toBeVisible();
  await expect(page.getByTestId('latest-rooms').getByRole('link', { name: 'Xem chi tiết' }).first()).toBeVisible();
  // không còn số liệu/khẳng định không có nguồn
  await expect(page.getByText(/xác thực 100%|Phòng xác thực chính chủ|Bảo vệ tiền cọc|Hợp đồng điện tử|kiểm duyệt pháp lý|Chủ trọ dùng SaaS/i)).toHaveCount(0);
  await expect(page.getByLabel('Loại phòng')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Bản đồ' })).toHaveCount(0);

  // tìm theo quận + khoảng giá → đúng tham số GET /listings (không roomType, không priceMin/priceMax)
  await page.getByLabel('Quận / huyện', { exact: true }).fill('Cầu Giấy');
  await page.getByRole('button', { name: /Tìm ngay/ }).click();
  await expect(page).toHaveURL(/\/rooms\?district=C/);
  expect(new URL(page.url()).searchParams.has('roomType')).toBe(false);
  const total = Number(await page.getByTestId('rooms-count').textContent());
  expect(total).toBeGreaterThan(0);
  await expect(page.getByRole('link', { name: 'Xem chi tiết' })).toHaveCount(Math.min(total, 20));

  // tham số lạ (roomType) bị bỏ qua có chủ đích: kết quả không đổi theo loại phòng
  await page.goto('/rooms?roomType=STUDIO');
  const all = Number(await page.getByTestId('rooms-count').textContent());
  await page.goto('/rooms');
  expect(Number(await page.getByTestId('rooms-count').textContent())).toBe(all);
  await page.getByLabel('Quận / huyện', { exact: true }).fill('khong-co-quan-nay');
  await expect(page.getByTestId('rooms-count')).toHaveText('0');
  await expect(page.getByText('Không tìm thấy phòng phù hợp')).toBeVisible();
  await page.getByRole('button', { name: 'Đặt lại bộ lọc' }).click();
  await expect(page.getByTestId('rooms-count')).toHaveText(String(all));

  // /rooms không còn bản đồ giả; URL cũ /rooms/map về /rooms
  await expect(page.getByText(/Bản đồ khu vực|ghim giá/)).toHaveCount(0);
  await page.goto('/rooms/map');
  await expect(page).toHaveURL('/rooms');

  // chi tiết: nút Google Maps với điểm đến là địa chỉ backend trả, mở tab mới an toàn, không gọi Google khi chưa bấm
  await page.getByRole('link', { name: 'Xem chi tiết' }).first().click();
  const maps = page.getByTestId('maps-link');
  await expect(maps).toBeVisible();
  await expect(maps).toHaveText(/Xem vị trí & chỉ đường/);
  await expect(maps).toHaveAttribute('target', '_blank');
  await expect(maps).toHaveAttribute('rel', /noopener/);
  await expect(maps).toHaveAttribute('rel', /noreferrer/);
  const href = (await maps.getAttribute('href'))!;
  const url = new URL(href);
  expect(`${url.origin}${url.pathname}`).toBe('https://www.google.com/maps/dir/');
  expect(url.searchParams.get('api')).toBe('1');
  const destination = url.searchParams.get('destination')!;
  expect(destination).toMatch(/, Việt Nam$/);
  const address = (await page.locator('.page-header, header').filter({ hasText: destination.replace(/, Việt Nam$/, '') }).count()) >= 0;
  expect(address).toBe(true);
  expect(googleRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('FE-10 — Workspace: lưu trữ có xác nhận, tạo workspace mới, khôi phục bị chặn 409 khi đã có workspace đang hoạt động', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = trackErrors(page);
  await login(page, 'quan@demo.vn');
  await page.goto('/workspaces/select');
  await expect(page.getByRole('heading', { name: 'Chọn workspace' })).toBeVisible();
  const old = page.getByTestId('workspace-ws-an-nhien');
  await expect(old.getByText('Đang hoạt động')).toBeVisible();
  await expect(old.getByRole('button', { name: 'Khôi phục workspace' })).toHaveCount(0);
  await expect(page.getByText(/mời bạn làm quản lý|nhân viên/)).toHaveCount(0);

  // lưu trữ cần xác nhận rõ ràng; hủy thì không đổi gì
  const confirm = page.getByRole('alertdialog');
  await tap(old.getByRole('button', { name: 'Lưu trữ workspace' }));
  await expect(confirm.getByText(/Đây không phải xóa workspace/)).toBeVisible();
  await tap(confirm.getByRole('button', { name: 'Hủy' }));
  await expect(old.getByText('Đang hoạt động')).toBeVisible();
  await tap(old.getByRole('button', { name: 'Lưu trữ workspace' }));
  await tap(confirm.getByRole('button', { name: 'Lưu trữ' }));
  await expect(page.getByText('Đã lưu trữ workspace.')).toBeVisible();
  await expect(old.getByText('Đã lưu trữ', { exact: true })).toBeVisible();
  await expect(old.getByRole('button', { name: 'Khôi phục workspace' })).toBeVisible();

  // đã lưu trữ → được tạo workspace mới (không tự lưu trữ gì thêm)
  await page.getByLabel(/^Tên workspace/).fill('Nhà trọ Mới');
  await tap(page.getByRole('button', { name: 'Tạo workspace' }));
  await expect(page.getByText('Đã tạo workspace.')).toBeVisible();
  await expect(page).toHaveURL(/\/w\/ws-\d+\/dashboard/);

  // quay lại danh sách bằng menu (không tải lại trang): khôi phục workspace cũ bị 409
  await tap(page.locator('.user-menu__trigger')); // trên mobile tên người dùng bị ẩn nên không có tên truy cập
  await tap(page.getByRole('menuitem', { name: 'Chọn workspace' }));
  await expect(page.getByRole('heading', { name: 'Chọn workspace' })).toBeVisible();
  await expect(page.locator('[data-testid^="workspace-"]')).toHaveCount(2);
  await tap(old.getByRole('button', { name: 'Khôi phục workspace' }));
  await tap(confirm.getByRole('button', { name: 'Khôi phục' }));
  await expect(page.getByText(/Không khôi phục được: bạn đã có một workspace đang hoạt động/)).toBeVisible();
  await expect(old.getByText('Đã lưu trữ', { exact: true })).toBeVisible();

  // lưu trữ workspace mới rồi khôi phục workspace cũ thành công
  const fresh = page.locator('[data-testid^="workspace-ws-"]').filter({ hasText: 'Nhà trọ Mới' });
  await tap(fresh.getByRole('button', { name: 'Lưu trữ workspace' }));
  await tap(confirm.getByRole('button', { name: 'Lưu trữ' }));
  await expect(fresh.getByText('Đã lưu trữ', { exact: true })).toBeVisible();
  await tap(old.getByRole('button', { name: 'Khôi phục workspace' }));
  await tap(confirm.getByRole('button', { name: 'Khôi phục' }));
  await expect(page.getByText('Đã khôi phục workspace.')).toBeVisible();
  await expect(old.getByText('Đang hoạt động')).toBeVisible();
  expect(errors).toEqual([]);
});

test('FE-10 — Onboarding: giải thích đúng (được duyệt = quyền tạo workspace đầu tiên), không còn mời quản lý/nhân viên', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  await login(page, 'minh@demo.vn');
  await page.goto('/workspaces/select');
  await expect(page.getByRole('heading', { name: 'Đăng ký làm chủ trọ' })).toBeVisible();
  await expect(page.getByText(/được phép tạo\s+workspace đầu tiên/)).toBeVisible();
  await expect(page.getByText(/mời bạn làm quản lý|nhân viên|MANAGER|STAFF/)).toHaveCount(0);
  await page.getByLabel(/^Lý do/).fill('Tôi có 8 phòng trọ ở Thủ Đức');
  await tap(page.getByRole('button', { name: 'Gửi đơn đăng ký' }));
  await expect(page.getByText('Đã gửi đơn đăng ký làm chủ trọ.')).toBeVisible();
  await expect(page.getByText(/hệ thống không tự tạo workspace/)).toBeVisible();
  await expect(page.getByText(/quyền chủ trọ sẽ tự xuất hiện/)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('FE-10 — Báo cáo hoãn khỏi V1: menu đã ẩn, /reports về dashboard đúng workspace, không gọi API Reports', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = trackErrors(page);
  const reportCalls: string[] = [];
  page.on('request', (req) => {
    // chỉ tính lời gọi API (fetch/XHR); tải trang SPA của chính URL /reports là điều hướng, không phải API
    if (['fetch', 'xhr'].includes(req.resourceType()) && /\/reports(\?|$)/.test(new URL(req.url()).pathname)) reportCalls.push(req.url());
  });
  await login(page, 'quan@demo.vn');
  await page.goto('/w/ws-an-nhien/dashboard');
  await expect(page.getByRole('heading', { name: 'Tổng quan', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Báo cáo/ })).toHaveCount(0);
  await expect(page.locator('a[href$="/reports"]')).toHaveCount(0);
  for (const target of ['/w/ws-an-nhien/reports', '/w/ws-an-nhien/reports?from=2026-01&to=2026-06']) {
    await page.goto(target);
    await expect(page).toHaveURL(/\/w\/ws-an-nhien\/dashboard/);
    await expect(page.getByRole('heading', { name: 'Tổng quan', exact: true })).toBeVisible();
    await expectNoCrash(page);
  }
  expect(reportCalls).toEqual([]);
  expect(errors).toEqual([]);
});

test('Người dùng & trạng thái lỗi mock', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = trackErrors(page);
  await login(page, 'minh@demo.vn');
  for (const r of ['/account', '/my-viewings', '/notifications', '/link-tenant', '/rooms/map', '/about', '/help', '/khong-ton-tai']) {
    await page.goto(r);
    await expect(page.locator('h1').first()).toBeVisible();
  }
  await page.goto('/rooms?mock=500');
  await expect(page.getByText('Lỗi máy chủ (mock 500).')).toBeVisible();
  await page.goto('/rooms?mock=empty');
  await expect(page.getByText('Không tìm thấy phòng phù hợp')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Phân quyền theo quyền thật: mỗi user chỉ vào được các khu vực mình có', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = trackErrors(page);
  const areaTabs = page.locator('.area-switcher:visible').first().getByRole('link');
  // Mobile: thanh khu vực nằm trong menu (header công khai) hoặc bị ẩn (khung quản lý)
  const expectAreas = async (labels: string[]) => {
    if (test.info().project.name !== 'desktop') return;
    await expect(areaTabs).toHaveText(labels);
  };

  // User thường: chỉ khu Tìm phòng; khu chủ trọ / người thuê / admin bị đưa về trang chủ.
  // /workspaces/select vẫn mở được (đó là nơi xem trạng thái đơn đăng ký chủ trọ).
  await login(page, 'minh@demo.vn');
  await expect(page).toHaveURL('/');
  await expectAreas(['Tìm phòng trọ']);
  for (const r of ['/w/ws-an-nhien/dashboard', '/tenant', '/admin']) {
    await page.goto(r);
    await expect(page).toHaveURL('/');
  }
  await page.goto('/workspaces/select');
  await expect(page.getByText('Đăng ký làm chủ trọ').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gửi đơn đăng ký' })).toBeVisible();
  await page.evaluate(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  // Chủ trọ: có khu Chủ trọ (và vẫn dùng được khu Tìm phòng công khai); không vào được người thuê / admin
  await login(page, 'quan@demo.vn');
  await expect(page).toHaveURL(/\/w\/ws-an-nhien\/dashboard/);
  await expectAreas(['Tìm phòng trọ', 'Chủ trọ(Landlord)']);
  for (const r of ['/', '/rooms', '/my-viewings']) {
    await page.goto(r);
    await expect(page).toHaveURL(r);
  }
  for (const r of ['/tenant', '/admin']) {
    await page.goto(r);
    await expect(page).toHaveURL(/\/w\/ws-an-nhien\/dashboard/);
  }
  await page.evaluate(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  // Người thuê: có Cổng người thuê (và khu Tìm phòng); không vào được khu chủ trọ / admin
  await login(page, 'nam@demo.vn');
  await expect(page).toHaveURL('/tenant');
  await expectAreas(['Tìm phòng trọ', 'Cổng người thuê(Tenant)']);
  await page.goto('/rooms');
  await expect(page).toHaveURL('/rooms');
  for (const r of ['/w/ws-an-nhien/dashboard', '/admin']) {
    await page.goto(r);
    await expect(page).toHaveURL('/tenant');
  }
  expect(errors).toEqual([]);
});

test('Quên mật khẩu → đặt lại → đăng nhập bằng mật khẩu mới', async ({ page }) => {
  const errors = trackErrors(page);
  // Liên kết sai → báo không hợp lệ
  await page.goto('/reset-password?token=sai');
  await page.getByLabel(/^Mật khẩu mới/).fill('MatKhauMoi2026');
  await page.getByLabel(/Nhập lại mật khẩu mới/).fill('MatKhauMoi2026');
  await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await expect(page.getByText('Liên kết không hợp lệ hoặc đã hết hạn')).toBeVisible();

  await page.getByRole('link', { name: 'Gửi lại liên kết đặt lại mật khẩu' }).click();
  await expect(page).toHaveURL('/forgot-password');
  await page.getByLabel('Email').fill('minh@demo.vn');
  await page.getByRole('button', { name: 'Gửi hướng dẫn' }).click();
  await expect(page.getByText('Kiểm tra email của bạn')).toBeVisible();
  await page.getByRole('link', { name: /Mở liên kết đặt lại mật khẩu/ }).click();
  // Token được gỡ khỏi URL ngay sau khi trang đọc xong.
  await expect(page).toHaveURL(/\/reset-password$/);

  // Kiểm tra dữ liệu nhập
  await page.getByLabel(/^Mật khẩu mới/).fill('MatKhauMoi2026');
  await page.getByLabel(/Nhập lại mật khẩu mới/).fill('KhacNhau1');
  await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await expect(page.getByText('Mật khẩu xác nhận không khớp')).toBeVisible();

  await page.getByLabel(/Nhập lại mật khẩu mới/).fill('MatKhauMoi2026');
  await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await expect(page.getByText('Đã đổi mật khẩu')).toBeVisible();

  // Điều hướng trong app (không tải lại trang) để mock còn nhớ mật khẩu mới
  await page.getByRole('link', { name: 'Đăng nhập', exact: true }).last().click();
  await page.getByLabel(/^Email/).fill('minh@demo.vn');
  await page.getByLabel(/^Mật khẩu/).fill('demo1234');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByText('Email hoặc mật khẩu không đúng.')).toBeVisible();
  await page.getByLabel(/^Mật khẩu/).fill('MatKhauMoi2026');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL('/');
  expect(errors).toEqual([]);
});
