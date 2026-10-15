import { expect, test } from '@playwright/test';
import type { PublicListingPageResponse, PublicListingResponse } from '@rental/shared';

test('REAL READ: API readiness and public listings use the Vite proxy', async ({ request }) => {
  const health = await request.get('/api/v1/health/ready');
  expect(health.status()).toBe(200);
  await expect(health.json()).resolves.toMatchObject({ status: 'ok', database: 'up' });

  const listingResponse = await request.get('/api/v1/listings?page=1&limit=2');
  expect(listingResponse.status()).toBe(200);
  const page = (await listingResponse.json()) as PublicListingPageResponse;
  expect(page.page).toBe(1);
  expect(page.limit).toBe(2);
  expect(page.total).toBeGreaterThanOrEqual(0);
  expect(Array.isArray(page.items)).toBe(true);

  const first = page.items[0];
  if (first) {
    const detailResponse = await request.get(`/api/v1/listings/${encodeURIComponent(first.id)}`);
    expect(detailResponse.status()).toBe(200);
    const detail = (await detailResponse.json()) as PublicListingResponse;
    expect(detail.id).toBe(first.id);
    expect(detail.room.id).toBeTruthy();
    expect(detail.building.addressLine1).toBeTruthy();
  }
});

test('REAL READ: public room UI performs a real /listings request', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  const listingRequest = page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/v1/listings' && response.request().method() === 'GET';
    },
    { timeout: 15_000 },
  );
  await page.goto('/rooms');
  const response = await listingRequest;
  expect(response.ok()).toBe(true);
  const payload = (await response.json()) as PublicListingPageResponse;
  await expect(page.getByTestId('rooms-count')).toHaveText(String(payload.total));

  if (payload.items.length === 0) {
    await expect(page.getByText('Không tìm thấy phòng phù hợp')).toBeVisible();
  } else {
    const listingId = payload.items[0]!.id;
    const detailRequest = page.waitForResponse((candidate) => {
      const url = new URL(candidate.url());
      return url.pathname === `/api/v1/listings/${listingId}`;
    });
    await page.goto(`/rooms/${listingId}`);
    expect((await detailRequest).ok()).toBe(true);
    await expect(page.getByRole('link', { name: /Đặt lịch xem phòng/ })).toHaveAttribute(
      'href',
      `/rooms/${listingId}/viewing`,
    );
  }
  expect(errors).toEqual([]);
});

test('REAL READ: login and register routes render without mutation', async ({ page }) => {
  for (const route of ['/login', '/register']) {
    await page.goto(route);
    await expect(page.locator('main').getByRole('heading').first()).toBeVisible();
  }
});
