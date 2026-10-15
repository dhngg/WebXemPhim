import { expect } from '@playwright/test';
import type { Browser, BrowserContext, Locator, Page, Response } from '@playwright/test';
import { REAL_API_PREFIX, REAL_WEB_ORIGIN } from './environment';
import type { FixtureRegistry } from './fixture-registry';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export interface CapturedRequest {
  method: string;
  path: string;
  status: number;
  /** Parsed request body. Never present for requests flagged sensitive. */
  body: Record<string, unknown> | null;
  bodyKeys: string[];
}

/**
 * Runs a browser action and waits for the API request it triggers. The request/response are checked by the
 * caller; only method, path template, status and body key names are stored as evidence. Bodies flagged
 * `sensitive` (invitation token) are never read into the result.
 */
export async function capture(
  page: Page,
  fixtures: FixtureRegistry,
  step: string,
  method: string,
  pathPattern: RegExp,
  action: () => Promise<unknown>,
  options: { expectedStatus?: readonly number[]; sensitive?: boolean } = {},
): Promise<CapturedRequest> {
  const expected = options.expectedStatus ?? [200, 201];
  const matches = (response: Response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === method &&
      url.pathname.startsWith(REAL_API_PREFIX) &&
      pathPattern.test(url.pathname.slice(REAL_API_PREFIX.length))
    );
  };
  const pending = page.waitForResponse(matches, { timeout: 30_000 });
  await action();
  const response = await pending;

  let body: Record<string, unknown> | null = null;
  let bodyKeys: string[] = [];
  const raw = response.request().postData();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      bodyKeys = Object.keys(parsed).sort();
      body = options.sensitive ? null : parsed;
    } catch {
      // not JSON: nothing to record
    }
  }
  const path = new URL(response.url()).pathname.slice(REAL_API_PREFIX.length).replace(UUID, ':id');
  const captured = { method, path, status: response.status(), body, bodyKeys };
  fixtures.evidence({ step, method, path, status: captured.status, bodyKeys });
  expect(expected, `${method} ${path} -> ${captured.status}`).toContain(captured.status);
  return captured;
}

/** Collects uncaught page errors and unexpected API failures; `allow` lists responses a step provokes on purpose. */
export function watch(page: Page, allow: RegExp[] = []) {
  const pageErrors: string[] = [];
  const apiFailures: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith(REAL_API_PREFIX) || response.status() < 400) return;
    const label = `${response.request().method()} ${url.pathname.replace(UUID, ':id')} -> ${response.status()}`;
    const anonymousRefresh = url.pathname.endsWith('/auth/refresh') && response.status() === 401;
    if (!anonymousRefresh && !allow.some((pattern) => pattern.test(label))) apiFailures.push(label);
  });
  return { pageErrors, apiFailures };
}

export interface Session {
  context: BrowserContext;
  page: Page;
}

/** A separate browser profile that signs in through the real login form. */
export async function openSession(
  browser: Browser,
  email: string,
  password: string,
  expectedUrl: RegExp | ((url: URL) => boolean) = (url) => !url.pathname.startsWith('/login'),
): Promise<Session> {
  const context = await browser.newContext({ baseURL: REAL_WEB_ORIGIN, serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Mật khẩu/).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL(expectedUrl, { timeout: 60_000 });
  return { context, page };
}

export async function anonymousSession(browser: Browser): Promise<Session> {
  const context = await browser.newContext({ baseURL: REAL_WEB_ORIGIN, serviceWorkers: 'block' });
  return { context, page: await context.newPage() };
}

/** Text of the `<option>` that contains `text` inside the select labelled `label`. */
export async function optionLabel(root: Page | Locator, selectLabel: RegExp | string, text: string | RegExp): Promise<string> {
  const option = root.getByLabel(selectLabel).locator('option', { hasText: text }).first();
  await expect(option, `option ${String(text)} in ${String(selectLabel)}`).toBeAttached();
  return (await option.textContent())!;
}
