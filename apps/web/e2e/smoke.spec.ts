import { expect, test } from '@playwright/test';

test('loads the home page and connects to the real local API', async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Không gian cho một khởi đầu mới.',
  );
  await expect(page.getByText('API đang hoạt động')).toBeVisible();
  await expect(page.getByRole('link', { name: /Xem trạng thái hệ thống/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(pageErrors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('home.png'), fullPage: true });
});

test('supports a direct visit to an unknown route and recovery', async ({ page }) => {
  await page.goto('/missing-page');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Trang này chưa có ở đây.');
  await page.getByRole('link', { name: /Về trang chủ/ }).click();
  await expect(page.getByText('API đang hoạt động')).toBeVisible();
});

test('renders the API failure and retry state', async ({ page }) => {
  await page.route('**/api/v1/health', (route) => route.fulfill({ status: 503, body: '{}' }));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Chưa kết nối được API');
  await page.unroute('**/api/v1/health');
  await page.getByRole('button', { name: 'Thử lại' }).click();
  await expect(page.getByText('API đang hoạt động')).toBeVisible();
});
