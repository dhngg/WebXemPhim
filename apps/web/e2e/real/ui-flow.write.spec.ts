import { expect, request, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import type {
  AdminListingPageResponse,
  BuildingResponse,
  ContractPageResponse,
  ContractResponse,
  DepositPageResponse,
  InvoicePageResponse,
  InvoicePaymentPageResponse,
  InvoiceResponse,
  LandlordApplicationResponse,
  MaintenanceRequestPageResponse,
  PublicListingResponse,
  RoomResponse,
  TenantAccountLinkResponse,
  TenantInvitationResponse,
  TenantResponse,
  TenantUserLinkResponse,
  UserCapabilitiesResponse,
  ViewingRequestPageResponse,
  WorkspaceResponse,
} from '@rental/shared';
import { REAL_API_PREFIX, REAL_WEB_ORIGIN, requireWriteEnvironment } from './support/environment';
import {
  fixtureEmail,
  fixturePassword,
  FixtureRegistry,
  stableIdempotencyKey,
} from './support/fixture-registry';
import { RealApi } from './support/real-api';
import { addDays, businessToday, monthStart, nextMonthStart, shortId, vnd } from './support/scenario';
import { anonymousSession, capture, openSession, optionLabel, watch } from './support/ui';
import type { Session } from './support/ui';

/**
 * REAL UI-DRIVEN WRITE: every mutation under test is made by clicking, typing, selecting and submitting in a real
 * browser (React UI -> Vite proxy -> NestJS -> Neon DEV). The API is used only for prerequisite fixtures
 * (registering accounts, a second landlord for the multi-role case), for read-only persistence checks and for cleanup.
 *
 * Each step also checks, for the request the UI sent: method, endpoint, body keys and a successful status. Only those
 * facts (never bodies, tokens or cookies) reach the manifest.
 */
test.describe.serial('REAL UI WRITE: V1 journeys driven from the browser', () => {
  const fixtures = new FixtureRegistry();
  const sid = shortId(fixtures.runId).toUpperCase();
  const password = fixturePassword();
  const today = businessToday();
  const period = today.slice(0, 7);
  const tomorrow = addDays(today, 1);
  const contractStart = monthStart(today);
  const futureStart = nextMonthStart(today);
  const key = (operation: string) => stableIdempotencyKey(fixtures.runId, operation);
  const email = (persona: string) => fixtureEmail(fixtures.runId, `ui-${persona}`);
  const name = (what: string) => `FE11UI ${what} ${sid}`;

  const ROOM_LISTED = `UL${sid}`;
  const ROOM_RENTED = `UO${sid}`;
  const CITY = `FE11UI-${sid}`;

  // Provocations the steps make on purpose (refund above the balance).
  const EXPECTED_FAILURES = [/POST \/api\/v1\/workspaces\/:id\/contracts\/:id\/deposit\/entries -> (400|409|422)/];

  const sessions: Session[] = [];
  const guards = new Map<Page, ReturnType<typeof watch>>();
  const contexts: APIRequestContext[] = [];
  const pages: Record<string, Page> = {};
  let admin: RealApi;
  let ownerApi: RealApi;
  let tenantApi: RealApi;
  let ownerBApi: RealApi;

  const world = {
    ws: '',
    wsB: '',
    building: '',
    roomListed: '',
    roomRented: '',
    listing: '',
    tenantProfile: '',
    tenantFuture: '',
    tenantB: '',
    contractNow: '',
    contractFuture: '',
    invoice: '',
    inviteToken: '', // memory only: never logged, stored or put in the manifest
    invitationB: '',
    inviteTokenB: '', // memory only
  };

  const wsUrl = (path = '') => `/w/${world.ws}${path}`;
  const buildingApi = () => `/workspaces/${world.ws}/buildings/${world.building}`;
  const invoiceApi = () => `${buildingApi()}/invoices/${world.invoice}`;

  async function newApi(): Promise<RealApi> {
    const context = await request.newContext({ baseURL: REAL_WEB_ORIGIN });
    contexts.push(context);
    return new RealApi(context);
  }

  async function signIn(browser: Parameters<typeof openSession>[0], persona: string, address: string, secret = password) {
    const existing = pages[persona];
    if (existing) return existing;
    const session = await openSession(browser, address, secret);
    sessions.push(session);
    guards.set(session.page, watch(session.page, EXPECTED_FAILURES));
    pages[persona] = session.page;
    return session.page;
  }

  /** Nothing in the console/network may have failed unexpectedly while the step ran. */
  function expectClean(page: Page) {
    const guard = guards.get(page);
    if (!guard) return;
    const { pageErrors, apiFailures } = guard;
    const snapshot = { pageErrors: [...pageErrors], apiFailures: [...apiFailures] };
    pageErrors.length = 0;
    apiFailures.length = 0;
    expect(snapshot).toEqual({ pageErrors: [], apiFailures: [] });
  }

  const idFromUrl = (page: Page, pattern: RegExp): string => {
    const match = pattern.exec(new URL(page.url()).pathname);
    if (!match?.[1]) throw new Error(`The URL did not carry the expected id (${pattern}).`);
    return match[1];
  };


  /** Admin tables are paged and the fixture row can be on any page: walk `?page=n` until the row is on screen. */
  async function openPageWithRow(page: Page, path: string, rowText: string, maxPages = 15) {
    for (let n = 1; n <= maxPages; n += 1) {
      await page.goto(`${path}${path.includes('?') ? '&' : '?'}page=${n}`);
      await page.locator('tbody tr').first().waitFor({ timeout: 20_000 }).catch(() => undefined);
      if ((await page.locator('tbody tr', { hasText: rowText }).count()) > 0) return;
    }
    throw new Error(`Row "${rowText}" was not found in ${maxPages} pages of ${path}.`);
  }

  test.beforeAll(async () => {
    requireWriteEnvironment();
  });

  test.afterAll(async () => {
    test.setTimeout(300_000);
    const cleanupFailures = await fixtures.cleanup();
    await fixtures.writeManifest(cleanupFailures);
    await Promise.all(sessions.map((session) => session.context.close()));
    await Promise.all(contexts.map((context) => context.dispose()));
    expect(cleanupFailures, 'cleanup actions that did not complete (see the manifest)').toEqual([]);
  });

  /* ---------------------------------------------------------------------------------------------- */
  /* 00  Prerequisite fixtures (API): not counted as UI-driven                                         */
  /* ---------------------------------------------------------------------------------------------- */
  test('00 prerequisites: accounts, a second approved landlord with a pending tenant invitation', async () => {
    test.setTimeout(180_000);
    const { adminEmail, adminPassword } = requireWriteEnvironment();
    admin = await newApi();
    ownerApi = await newApi();
    tenantApi = await newApi();
    ownerBApi = await newApi();
    const rejecteeApi = await newApi();
    const register = async (api: RealApi, persona: string) => {
      const result = await api.register({
        email: email(persona),
        password,
        displayName: name(persona),
      });
      fixtures.record('user', result.user.id, 'retained-active');
    };
    await register(ownerApi, 'owner');
    await register(tenantApi, 'tenant');
    await register(ownerBApi, 'ownerb');
    await register(rejecteeApi, 'rejectee');

    await admin.login({ email: adminEmail, password: adminPassword });
    const applicationB = await ownerBApi.post<LandlordApplicationResponse>('/landlord-applications/me', {
      reason: `FE11UI ${fixtures.runId} setup`,
    });
    fixtures.record('landlord-application', applicationB.id, 'pending');
    await admin.post(`/admin/landlord-applications/${applicationB.id}/approve`, { reason: `FE11UI ${fixtures.runId} setup` }, 200);
    fixtures.update('landlord-application', applicationB.id, 'approved-retained');

    const wsB = await ownerBApi.post<WorkspaceResponse>('/workspaces', { name: name('B') });
    world.wsB = wsB.id;
    fixtures.record('workspace', wsB.id, 'active');
    fixtures.defer(`archive-workspace:${wsB.id}`, async () => {
      await ownerBApi.patch(`/workspaces/${wsB.id}/archive`, {});
      fixtures.update('workspace', wsB.id, 'archived');
    });
    const tenantB = await ownerBApi.post<TenantResponse>(`/workspaces/${wsB.id}/tenants`, { fullName: name('Khách B') });
    world.tenantB = tenantB.id;
    fixtures.record('tenant-profile', tenantB.id, 'active');
    fixtures.defer(`archive-tenant:${tenantB.id}`, async () => {
      await ownerBApi.patch(`/workspaces/${wsB.id}/tenants/${tenantB.id}/archive`, {});
      fixtures.update('tenant-profile', tenantB.id, 'archived');
    });
    const invitation = await ownerBApi.post<TenantInvitationResponse>(`/workspaces/${wsB.id}/tenants/${tenantB.id}/invitations`);
    fixtures.record('tenant-invitation', invitation.id, 'issued');
    world.invitationB = invitation.id;
    world.inviteTokenB = invitation.token ?? '';
    expect(world.inviteTokenB).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  /* ---------------------------------------------------------------------------------------------- */
  /* A  Onboarding                                                                                     */
  /* ---------------------------------------------------------------------------------------------- */
  test('A1 UI: two users submit landlord applications with the form', async ({ browser }) => {
    test.setTimeout(240_000);
    for (const persona of ['owner', 'rejectee'] as const) {
      const page = await signIn(browser, persona, email(persona));
      await page.goto('/workspaces/select');
      await expect(page.getByRole('heading', { name: 'Đăng ký làm chủ trọ' })).toBeVisible();
      // Before approval the page offers no way to create a workspace.
      await expect(page.getByRole('button', { name: 'Tạo workspace' })).toHaveCount(0);
      const reason = `FE11UI ${fixtures.runId} ${persona}`;
      await page.getByLabel(/^Lý do/).fill(reason);
      const sent = await capture(page, fixtures, `A1 ${persona} applies`, 'POST', /^\/landlord-applications\/me$/, () =>
        page.getByRole('button', { name: 'Gửi đơn đăng ký' }).click(),
      );
      expect(sent.body).toEqual({ reason });
      await expect(page.getByText('Đã gửi đơn đăng ký làm chủ trọ.')).toBeVisible();
      expectClean(page);
    }
    // Persisted: a separate API session sees both applications as PENDING.
    const ownerView = await ownerApi.get<UserCapabilitiesResponse>('/users/me/capabilities');
    expect(ownerView.landlordApplication?.status).toBe('PENDING');
    fixtures.record('landlord-application', ownerView.landlordApplication!.id, 'pending');
    const rejectee = await newApi();
    await rejectee.login({ email: email('rejectee'), password });
    const rejecteeView = await rejectee.get<UserCapabilitiesResponse>('/users/me/capabilities');
    expect(rejecteeView.landlordApplication?.status).toBe('PENDING');
    fixtures.record('landlord-application', rejecteeView.landlordApplication!.id, 'pending');
  });

  test('A2 UI: Platform Admin approves one application and rejects the other, each with a reason', async ({ browser }) => {
    test.setTimeout(240_000);
    const { adminEmail, adminPassword } = requireWriteEnvironment();
    const page = await signIn(browser, 'admin', adminEmail, adminPassword);
    await openPageWithRow(page, '/admin/applications?status=PENDING', email('owner'));
    await expect(page.getByRole('heading', { name: 'Đơn đăng ký chủ trọ' })).toBeVisible();
    const dialog = page.getByRole('dialog');

    const ownerRow = page.locator('tbody tr', { hasText: email('owner') });
    await ownerRow.getByRole('button', { name: 'Duyệt', exact: true }).click();
    await dialog.getByRole('button', { name: 'Duyệt đơn' }).click();
    await expect(dialog.getByText('Nhập lý do')).toBeVisible(); // reason is required
    const approveReason = `FE11UI ${fixtures.runId} da xac minh`;
    await dialog.getByLabel(/^Lý do/).fill(approveReason);
    const approved = await capture(page, fixtures, 'A2 admin approves', 'POST', /^\/admin\/landlord-applications\/[^/]+\/approve$/, () =>
      dialog.getByRole('button', { name: 'Duyệt đơn' }).click(),
    );
    expect(approved.body).toEqual({ reason: approveReason });
    await expect(page.getByText('Đã duyệt đơn.')).toBeVisible();

    await openPageWithRow(page, '/admin/applications?status=PENDING', email('rejectee'));
    const rejectRow = page.locator('tbody tr', { hasText: email('rejectee') });
    await rejectRow.getByRole('button', { name: 'Từ chối', exact: true }).click();
    const rejectReason = `FE11UI ${fixtures.runId} thieu giay to`;
    await dialog.getByLabel(/^Lý do/).fill(rejectReason);
    const rejected = await capture(page, fixtures, 'A2 admin rejects', 'POST', /^\/admin\/landlord-applications\/[^/]+\/reject$/, () =>
      dialog.getByRole('button', { name: 'Từ chối đơn' }).click(),
    );
    expect(rejected.body).toEqual({ reason: rejectReason });
    await expect(page.getByText('Đã từ chối đơn.')).toBeVisible();

    // Persisted after a reload: both decisions and reasons are listed.
    await openPageWithRow(page, '/admin/applications?status=APPROVED', email('owner'));
    await expect(page.locator('tbody tr', { hasText: email('owner') }).getByText(approveReason)).toBeVisible();
    await openPageWithRow(page, '/admin/applications?status=REJECTED', email('rejectee'));
    await expect(page.locator('tbody tr', { hasText: email('rejectee') }).getByText(rejectReason)).toBeVisible();
    expectClean(page);

    const capabilities = await ownerApi.get<UserCapabilitiesResponse>('/users/me/capabilities');
    expect(capabilities.landlordApplication?.status).toBe('APPROVED');
    fixtures.update('landlord-application', capabilities.landlordApplication!.id, 'approved-retained');
    const rejecteeApi = await newApi();
    await rejecteeApi.login({ email: email('rejectee'), password });
    const rejecteeView = await rejecteeApi.get<UserCapabilitiesResponse>('/users/me/capabilities');
    expect(rejecteeView.landlordApplication?.status).toBe('REJECTED');
    fixtures.update('landlord-application', rejecteeView.landlordApplication!.id, 'rejected-retained');
  });

  test('A3 UI: the approved user creates a workspace; capabilities refresh; the rejected user cannot', async () => {
    test.setTimeout(240_000);
    const page = pages.owner!;
    await page.goto('/workspaces/select'); // a fresh load: capabilities are re-read from the backend
    const workspaceName = name('A');
    await page.getByLabel(/^Tên workspace/).fill(workspaceName);
    const created = await capture(page, fixtures, 'A3 create workspace', 'POST', /^\/workspaces$/, () =>
      page.getByRole('button', { name: 'Tạo workspace' }).click(),
    );
    expect(created.body).toEqual({ name: workspaceName });
    await expect(page.getByText('Đã tạo workspace.')).toBeVisible();
    await page.waitForURL(/\/w\/[0-9a-f-]{36}\/dashboard$/);
    world.ws = idFromUrl(page, /^\/w\/([0-9a-f-]{36})\//);
    fixtures.record('workspace', world.ws, 'active');
    fixtures.defer(`archive-workspace:${world.ws}`, async () => {
      await ownerApi.patch(`/workspaces/${world.ws}/archive`, {});
      fixtures.update('workspace', world.ws, 'archived');
    });
    await expect(page.getByRole('heading', { name: 'Tổng quan', exact: true })).toBeVisible();

    // Capabilities: the workspace is in the list after a reload and in the API.
    await page.goto('/workspaces/select');
    await expect(page.getByTestId(`workspace-${world.ws}`)).toBeVisible();
    const capabilities = await ownerApi.get<UserCapabilitiesResponse>('/users/me/capabilities');
    expect(capabilities.workspaces).toContainEqual(expect.objectContaining({ id: world.ws, role: 'OWNER', status: 'ACTIVE' }));
    expectClean(page);

    const rejectee = pages.rejectee!;
    await rejectee.goto('/workspaces/select');
    await expect(rejectee.getByLabel(/^Tên workspace/)).toHaveCount(0);
    await expect(rejectee.getByRole('button', { name: 'Tạo workspace' })).toHaveCount(0);
    expectClean(rejectee);
  });

  /* ---------------------------------------------------------------------------------------------- */
  /* B  OWNER                                                                                          */
  /* ---------------------------------------------------------------------------------------------- */
  test('B1 UI: OWNER creates a building and two rooms, then publishes one listing', async () => {
    test.setTimeout(300_000);
    const page = pages.owner!;
    await page.goto(wsUrl('/buildings/new'));
    await page.getByLabel(/^Tên tòa nhà/).fill(name('Nhà'));
    await page.getByLabel(/^Địa chỉ \(số nhà, đường\)/).fill(`12 Đường FE11 ${sid}`);
    await page.getByLabel(/^Phường \/ Xã/).fill('Phường 1');
    await page.getByLabel(/^Quận \/ Huyện/).fill('Quận 1');
    await page.getByLabel(/^Tỉnh \/ Thành phố/).fill(CITY);
    const building = await capture(page, fixtures, 'B1 create building', 'POST', /^\/workspaces\/[^/]+\/buildings$/, () =>
      page.getByRole('button', { name: 'Tạo tòa nhà' }).click(),
    );
    expect(building.body).toMatchObject({ name: name('Nhà'), city: CITY });
    await expect(page.getByText('Đã tạo tòa nhà.')).toBeVisible();
    const list = await ownerApi.get<BuildingResponse[]>(`/workspaces/${world.ws}/buildings`);
    const created = list.find((item) => item.name === name('Nhà'));
    expect(created).toBeDefined();
    world.building = created!.id;
    fixtures.record('building', world.building, 'active');
    fixtures.defer(`archive-building:${world.building}`, async () => {
      await ownerApi.patch(`${buildingApi()}/archive`, {});
      fixtures.update('building', world.building, 'archived');
    });
    await page.goto(wsUrl('/buildings'));
    await expect(page.getByText(name('Nhà')).first()).toBeVisible();

    const createRoom = async (code: string, rent: string) => {
      await page.goto(wsUrl(`/rooms/new?buildingId=${world.building}`));
      await page.getByLabel(/^Mã phòng/).fill(code);
      await page.getByLabel(/^Diện tích/).fill('24');
      await page.getByLabel(/^Giá thuê/).fill(rent);
      await page.getByLabel(/^Số người tối đa/).fill('2');
      const sent = await capture(page, fixtures, `B1 create room ${code}`, 'POST', /^\/workspaces\/[^/]+\/buildings\/[^/]+\/rooms$/, () =>
        page.getByRole('button', { name: 'Tạo phòng' }).click(),
      );
      expect(sent.body).toMatchObject({ code });
      await page.waitForURL(/\/rooms\/[0-9a-f-]{36}$/);
      const id = idFromUrl(page, /\/rooms\/([0-9a-f-]{36})$/);
      fixtures.record('room', id, 'vacant');
      fixtures.defer(`archive-room:${id}`, async () => {
        await ownerApi.patch(`${buildingApi()}/rooms/${id}/archive`, {});
        fixtures.update('room', id, 'archived');
      });
      return id;
    };
    world.roomListed = await createRoom(ROOM_LISTED, '3500000');
    world.roomRented = await createRoom(ROOM_RENTED, '3000000');

    // Persisted: both rooms come back from a separate API session with the typed values.
    const rooms = await ownerApi.get<RoomResponse[]>(`${buildingApi()}/rooms`);
    expect(rooms.map((room) => room.code).sort()).toEqual([ROOM_LISTED, ROOM_RENTED].sort());

    // Publish the first room (UI): the public link carries the listing id.
    await page.goto(wsUrl(`/rooms/${world.roomListed}`));
    const published = await capture(page, fixtures, 'B1 publish listing', 'PUT', /\/rooms\/[^/]+\/listing$/, () =>
      page.getByRole('button', { name: 'Đăng tin' }).click(),
    );
    expect(published.body).toEqual({ published: true });
    await expect(page.getByText('Đã đăng tin phòng lên marketplace.')).toBeVisible();
    const href = await page.getByRole('link', { name: /Xem tin công khai/ }).getAttribute('href');
    world.listing = href!.split('/').pop()!;
    expect(world.listing).toMatch(/^[0-9a-f-]{36}$/);
    fixtures.record('listing', world.listing, 'published');
    fixtures.defer(`unpublish-listing:${world.listing}`, async () => {
      await ownerApi.put(`${buildingApi()}/rooms/${world.roomListed}/listing`, { published: false });
      fixtures.update('listing', world.listing, 'unpublished');
    });
    expectClean(page);
  });

  test('B2 UI: the public marketplace shows the new listing without a session', async ({ browser }) => {
    test.setTimeout(180_000);
    const anonymous = await anonymousSession(browser);
    sessions.push(anonymous);
    const page = anonymous.page;
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const detailResponse = page.waitForResponse((r) => new URL(r.url()).pathname === `${REAL_API_PREFIX}/listings/${world.listing}`);
    await page.goto(`/rooms/${world.listing}`);
    expect((await detailResponse).status()).toBe(200);
    await expect(page.getByText(ROOM_LISTED).first()).toBeVisible();
    const maps = page.getByTestId('maps-link');
    await expect(maps).toHaveAttribute('href', /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/);
    await page.goto(`/rooms?city=${encodeURIComponent(CITY)}`);
    await expect(page.getByTestId('rooms-count')).toHaveText('1');
    const publicDetail = (await (await anonymous.context.request.get(`${REAL_API_PREFIX}/listings/${world.listing}`)).json()) as PublicListingResponse;
    expect(publicDetail.room.code).toBe(ROOM_LISTED);
    expect(errors).toEqual([]);
  });

  test('B3 UI: a seeker books two viewings; OWNER confirms one and rejects the other', async ({ browser }) => {
    test.setTimeout(300_000);
    const seeker = await signIn(browser, 'tenant', email('tenant'));
    const book = async (days: number, note: string) => {
      await seeker.goto(`/rooms/${world.listing}/viewing`);
      await seeker.getByLabel('Ngày xem').fill(addDays(today, days));
      await seeker.getByRole('button', { name: /14:00/ }).click();
      await seeker.getByLabel(/Ghi chú cho chủ trọ/).fill(note);
      const sent = await capture(seeker, fixtures, `B3 book viewing +${days}d`, 'POST', /^\/listings\/[^/]+\/viewing-requests$/, () =>
        seeker.getByRole('button', { name: 'Gửi yêu cầu xem phòng' }).click(),
      );
      expect(sent.bodyKeys).toEqual(['message', 'scheduledAt']);
      await expect(seeker.getByText('Đã gửi yêu cầu xem phòng')).toBeVisible();
    };
    await book(2, `FE11UI ${sid} lan 1`);
    await book(3, `FE11UI ${sid} lan 2`);
    expectClean(seeker);

    const owner = pages.owner!;
    await owner.goto(wsUrl('/viewings'));
    await expect(owner.locator('tbody tr')).toHaveCount(2);
    const dialog = owner.getByRole('dialog');
    await owner.locator('tbody tr').first().getByRole('button', { name: 'Xác nhận' }).click();
    await dialog.getByLabel(/^Ghi chú/).fill('Hẹn gặp ở sảnh');
    const confirmed = await capture(owner, fixtures, 'B3 owner confirms viewing', 'PATCH', /\/viewing-requests\/[^/]+\/confirm$/, () =>
      dialog.getByRole('button', { name: 'Xác nhận lịch xem' }).click(),
    );
    expect(confirmed.body).toEqual({ note: 'Hẹn gặp ở sảnh' });
    await expect(owner.getByText('Đã xác nhận lịch xem.')).toBeVisible();
    await expect(owner.locator('tbody tr')).toHaveCount(1);

    await owner.locator('tbody tr').first().getByRole('button', { name: 'Từ chối' }).click();
    await dialog.getByLabel(/^Ghi chú/).fill('Đã có người xem');
    const rejected = await capture(owner, fixtures, 'B3 owner rejects viewing', 'PATCH', /\/viewing-requests\/[^/]+\/reject$/, () =>
      dialog.getByRole('button', { name: 'Từ chối yêu cầu' }).click(),
    );
    expect(rejected.body).toEqual({ note: 'Đã có người xem' });
    await expect(owner.getByText('Đã từ chối yêu cầu.')).toBeVisible();

    // Persisted: reload the tabs, and read the seeker's own list through a separate session.
    await owner.reload();
    await owner.getByRole('tab', { name: 'Đã xác nhận' }).click();
    await expect(owner.getByText('Hẹn gặp ở sảnh')).toBeVisible();
    await owner.getByRole('tab', { name: 'Bị từ chối' }).click();
    await expect(owner.getByText('Đã có người xem')).toBeVisible();
    const mine = await tenantApi.get<ViewingRequestPageResponse>('/viewing-requests/me?page=1&limit=20');
    expect(mine.items.map((item) => item.status).sort()).toEqual(['CONFIRMED', 'REJECTED']);
    for (const item of mine.items) fixtures.record('viewing-request', item.id, `${item.status.toLowerCase()}-retained`);
    await seeker.goto('/my-viewings');
    await expect(seeker.getByText('Hẹn gặp ở sảnh').first()).toBeVisible();
    expectClean(owner);
    expectClean(seeker);
  });

  test('B4 UI: OWNER creates tenant profiles and an invitation; the tenant links the account with the token', async () => {
    test.setTimeout(300_000);
    const owner = pages.owner!;
    const createTenant = async (fullName: string, phone: string) => {
      await owner.goto(wsUrl('/tenants/new'));
      await owner.getByLabel(/^Họ và tên/).fill(fullName);
      await owner.getByLabel('Số điện thoại').fill(phone);
      const sent = await capture(owner, fixtures, `B4 create tenant ${fullName}`, 'POST', /^\/workspaces\/[^/]+\/tenants$/, () =>
        owner.getByRole('button', { name: 'Tạo hồ sơ' }).click(),
      );
      expect(sent.body).toMatchObject({ fullName });
      await expect(owner.getByRole('heading', { name: fullName })).toBeVisible();
      const id = idFromUrl(owner, /\/tenants\/([0-9a-f-]{36})$/);
      fixtures.record('tenant-profile', id, 'active');
      fixtures.defer(`archive-tenant:${id}`, async () => {
        await ownerApi.patch(`/workspaces/${world.ws}/tenants/${id}/archive`, {});
        fixtures.update('tenant-profile', id, 'archived');
      });
      return id;
    };
    world.tenantProfile = await createTenant(name('Khách'), '0901234567');
    world.tenantFuture = await createTenant(name('Khách sau'), '0907654321');

    // Invitation for the first profile: the one-time token is shown once; it is only held in memory.
    await owner.goto(wsUrl(`/tenants/${world.tenantProfile}`));
    await capture(
      owner,
      fixtures,
      'B4 create invitation',
      'POST',
      /\/tenants\/[^/]+\/invitations$/,
      () => owner.getByRole('button', { name: 'Tạo lời mời liên kết' }).click(),
      { sensitive: true },
    );
    const tokenField = owner.getByRole('dialog').getByLabel('Mã mời');
    await expect(tokenField).toHaveValue(/^[A-Za-z0-9_-]{43}$/);
    world.inviteToken = await tokenField.inputValue();
    await owner.getByRole('button', { name: 'Đã gửi, đóng' }).click();
    await expect(owner.getByRole('dialog')).toHaveCount(0);

    const tenant = pages.tenant!;
    await tenant.goto('/link-tenant');
    await expect(tenant.getByRole('heading', { name: 'Liên kết tài khoản', exact: true })).toBeVisible();
    await tenant.getByLabel(/^Mã mời/).fill(world.inviteToken);
    const linked = await capture(
      tenant,
      fixtures,
      'B4 tenant accepts invitation',
      'POST',
      /^\/tenant-invitations\/accept$/,
      () => tenant.getByRole('button', { name: 'Liên kết tài khoản' }).click(),
      { sensitive: true },
    );
    expect(linked.bodyKeys).toEqual(['token']);
    await expect(tenant.getByText('Đã liên kết tài khoản với hồ sơ người thuê.')).toBeVisible();
    await tenant.waitForURL((url) => url.pathname === '/tenant');
    world.inviteToken = ''; // no longer needed; drop it from memory

    // Role refresh: capabilities now list the link, and the owner sees the linked account on the profile.
    const capabilities = await tenantApi.get<UserCapabilitiesResponse>('/users/me/capabilities');
    expect(capabilities.tenantLinks).toContainEqual(
      expect.objectContaining({ tenantId: world.tenantProfile, workspaceId: world.ws }),
    );
    const links = await ownerApi.get<TenantAccountLinkResponse[]>(`/workspaces/${world.ws}/tenants/${world.tenantProfile}/user-links`);
    const active = links.find((item) => item.user.email === email('tenant'));
    expect(active).toBeDefined();
    fixtures.record('tenant-link', active!.id, 'active');
    fixtures.defer(`revoke-tenant-link:${active!.id}`, async () => {
      await ownerApi.patch(`/workspaces/${world.ws}/tenant-user-links/${active!.id}/revoke`, { reason: `FE11UI ${fixtures.runId} cleanup` });
      fixtures.update('tenant-link', active!.id, 'revoked');
    });
    await owner.goto(wsUrl(`/tenants/${world.tenantProfile}`));
    await expect(owner.getByText(/Đã liên kết với/)).toBeVisible();
    await tenant.reload();
    await expect(tenant.getByText(name('Khách')).first()).toBeVisible();
    expectClean(owner);
    expectClean(tenant);
  });

  test('B5 UI: OWNER creates a current and a future contract, and cancels the future one', async () => {
    test.setTimeout(300_000);
    const owner = pages.owner!;
    const createContract = async (roomCode: string, tenantName: string, start: string, end: string) => {
      await owner.goto(wsUrl('/contracts/new'));
      await owner.getByLabel(/^Phòng/).selectOption({ label: await optionLabel(owner, /^Phòng/, roomCode) });
      await owner.getByLabel(/^Người thuê/).selectOption({ label: await optionLabel(owner, /^Người thuê/, tenantName) });
      await owner.getByLabel(/^Ngày bắt đầu/).fill(start);
      await owner.getByLabel(/^Ngày kết thúc/).fill(end);
      await expect(owner.locator('input[inputmode="numeric"]').first()).not.toHaveValue('');
      const sent = await capture(owner, fixtures, `B5 create contract ${roomCode}`, 'POST', /^\/workspaces\/[^/]+\/contracts$/, () =>
        owner.getByRole('button', { name: 'Tạo hợp đồng' }).click(),
      );
      expect(sent.body).toMatchObject({ startDate: start, endDate: end });
      await expect(owner.getByRole('heading', { name: /Hợp đồng phòng/ })).toBeVisible();
      return idFromUrl(owner, /\/contracts\/([0-9a-f-]{36})$/);
    };
    world.contractNow = await createContract(ROOM_RENTED, name('Khách'), contractStart, addDays(today, 365));
    fixtures.record('contract', world.contractNow, 'active');
    fixtures.defer(`end-contract:${world.contractNow}`, async () => {
      await ownerApi.patch(`/workspaces/${world.ws}/contracts/${world.contractNow}/end`, { endDate: today });
      fixtures.update('contract', world.contractNow, 'ended');
    });
    await expect(owner.getByText('Đang hiệu lực').first()).toBeVisible();

    world.contractFuture = await createContract(ROOM_LISTED, name('Khách sau'), futureStart, addDays(futureStart, 365));
    fixtures.record('contract', world.contractFuture, 'active');
    await expect(owner.getByText('Chưa có hiệu lực').first()).toBeVisible();

    // A future contract can only be cancelled, with no end date, and the history stays.
    await owner.getByRole('button', { name: 'Hủy hợp đồng' }).click();
    const cancelled = await capture(owner, fixtures, 'B5 cancel future contract', 'PATCH', /\/contracts\/[^/]+\/end$/, () =>
      owner.getByRole('dialog').getByRole('button', { name: 'Xác nhận hủy' }).click(),
    );
    expect(cancelled.bodyKeys).toEqual([]);
    await expect(owner.getByText('Đã hủy trước ngày bắt đầu').first()).toBeVisible();
    fixtures.update('contract', world.contractFuture, 'cancelled');

    // Persisted: reload shows the lifecycle, and the API agrees.
    await owner.reload();
    await expect(owner.getByText('Đã hủy trước ngày bắt đầu').first()).toBeVisible();
    const contracts = await ownerApi.get<ContractPageResponse>(`/workspaces/${world.ws}/contracts?page=1&limit=20`);
    const phases = Object.fromEntries(contracts.items.map((item: ContractResponse) => [item.id, item.phase]));
    expect(phases[world.contractNow]).toBe('IN_EFFECT');
    expect(phases[world.contractFuture]).toBe('CANCELLED');
    // The tenant sees the current contract in the portal.
    const tenant = pages.tenant!;
    await tenant.goto('/tenant/contracts');
    await expect(tenant.getByText(ROOM_RENTED).first()).toBeVisible();
    expectClean(owner);
    expectClean(tenant);
  });

  test('B6 UI: OWNER adds a rate, applies it to the room and records a meter reading', async () => {
    test.setTimeout(300_000);
    const owner = pages.owner!;
    await owner.goto(wsUrl('/rates'));
    await expect(owner.getByRole('heading', { name: 'Bảng giá dịch vụ' })).toBeVisible();
    await owner.getByRole('button', { name: 'Thêm dịch vụ' }).click();
    const dialog = owner.getByRole('dialog');
    await dialog.getByLabel(/^Mã dịch vụ/).fill('ELEC');
    await dialog.getByLabel(/^Tên hiển thị/).fill('Điện FE11UI');
    await dialog.getByLabel(/^Loại dịch vụ/).selectOption('ELECTRICITY');
    await dialog.getByLabel(/^Đơn vị tính/).selectOption('KWH');
    await dialog.getByLabel(/^Đơn giá/).fill('3500');
    await dialog.getByLabel(/^Áp dụng từ ngày/).fill(contractStart);
    const rate = await capture(owner, fixtures, 'B6 add rate', 'POST', /\/buildings\/[^/]+\/rates$/, () =>
      dialog.getByRole('button', { name: 'Thêm dịch vụ' }).click(),
    );
    expect(rate.body).toMatchObject({ code: 'ELEC', serviceType: 'ELECTRICITY', billingUnit: 'KWH', effectiveFrom: contractStart });
    await expect(owner.getByText('Đã thêm đơn giá.')).toBeVisible();
    const rates = await ownerApi.get<{ items: Array<{ id: string; code: string }> }>(`${buildingApi()}/rates?page=1&limit=20`);
    const created = rates.items.find((item) => item.code === 'ELEC');
    expect(created).toBeDefined();
    fixtures.record('rate-plan', created!.id, 'active');
    fixtures.defer(`stop-rate:${created!.id}`, async () => {
      await ownerApi.patch(`${buildingApi()}/rates/${created!.id}/stop`, { effectiveTo: tomorrow });
      fixtures.update('rate-plan', created!.id, 'stopped');
    });

    // Apply the rate to the rented room.
    await owner.goto(wsUrl(`/rooms/${world.roomRented}`));
    await expect(owner.getByRole('heading', { name: 'Dịch vụ áp dụng' })).toBeVisible();
    await owner.getByRole('button', { name: 'Thêm dịch vụ' }).click();
    await dialog.getByLabel(/^Dịch vụ/).selectOption('ELEC');
    await dialog.getByLabel(/^Áp dụng từ ngày/).fill(contractStart);
    const service = await capture(owner, fixtures, 'B6 apply service to room', 'POST', /\/rooms\/[^/]+\/services$/, () =>
      dialog.getByRole('button', { name: 'Thêm dịch vụ' }).click(),
    );
    expect(service.body).toEqual({ rateCode: 'ELEC', effectiveFrom: contractStart });
    await expect(owner.getByText('Đã thêm dịch vụ cho phòng.')).toBeVisible();
    const services = await ownerApi.get<Array<{ id: string; rateCode: string }>>(`${buildingApi()}/rooms/${world.roomRented}/services`);
    const assignment = services.find((item) => item.rateCode === 'ELEC');
    expect(assignment).toBeDefined();
    fixtures.record('room-service', assignment!.id, 'active');
    fixtures.defer(`stop-service:${assignment!.id}`, async () => {
      await ownerApi.patch(`${buildingApi()}/rooms/${world.roomRented}/services/${assignment!.id}/stop`, { effectiveTo: tomorrow });
      fixtures.update('room-service', assignment!.id, 'stopped');
    });

    // Meter reading (first reading of the room: previous reading is typed in).
    await owner.goto(wsUrl('/meters'));
    const cell = owner.getByTestId(`meter-${ROOM_RENTED}-ELECTRICITY`);
    await cell.getByRole('button', { name: new RegExp(`^Ghi chỉ số điện ${ROOM_RENTED}`) }).click();
    await dialog.getByLabel(/^Số cũ/).fill('100');
    await dialog.getByLabel(/^Số mới/).fill('180');
    const reading = await capture(owner, fixtures, 'B6 record meter reading', 'POST', /\/rooms\/[^/]+\/meter-readings$/, () =>
      dialog.getByRole('button', { name: 'Lưu chỉ số' }).click(),
    );
    expect(reading.body).toMatchObject({ meterType: 'ELECTRICITY', period, previousReading: '100', currentReading: '180' });
    await expect(cell.getByText(/Tiêu thụ 80/)).toBeVisible();
    await owner.reload();
    await expect(owner.getByTestId(`meter-${ROOM_RENTED}-ELECTRICITY`).getByText(/Tiêu thụ 80/)).toBeVisible();
    expectClean(owner);
  });

  test('B7 UI: OWNER creates a DRAFT invoice, issues it and adds an adjustment', async () => {
    test.setTimeout(300_000);
    const owner = pages.owner!;
    await owner.goto(wsUrl('/invoices'));
    await owner.getByRole('button', { name: 'Lập hóa đơn' }).click();
    const dialog = owner.getByRole('dialog');
    await dialog.getByLabel(/^Hợp đồng/).selectOption({ label: await optionLabel(dialog, /^Hợp đồng/, ROOM_RENTED) });
    const draft = await capture(owner, fixtures, 'B7 create draft invoice', 'POST', /\/buildings\/[^/]+\/invoices$/, () =>
      dialog.getByRole('button', { name: 'Tạo bản nháp' }).click(),
    );
    expect(draft.body).toMatchObject({ contractId: world.contractNow, period });
    await expect(owner.getByText('Đã tạo hóa đơn nháp.')).toBeVisible();
    await owner.waitForURL(/\/invoices\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/);
    world.invoice = idFromUrl(owner, /\/invoices\/[0-9a-f-]{36}\/([0-9a-f-]{36})$/);
    fixtures.record('invoice', world.invoice, 'draft');
    // Rent 3,000,000 + 80 kWh x 3,500: complete, so it can be issued.
    await expect(owner.getByText(/Còn thiếu dữ liệu/)).toHaveCount(0);
    await expect(owner.getByText(/3\.280\.000/).first()).toBeVisible();

    await owner.getByRole('button', { name: 'Phát hành' }).click();
    const issued = await capture(owner, fixtures, 'B7 issue invoice', 'POST', /\/invoices\/[^/]+\/issue$/, () =>
      owner.getByRole('alertdialog').getByRole('button', { name: 'Phát hành' }).click(),
    );
    expect(issued.bodyKeys).toEqual([]);
    await expect(owner.getByText('Đã phát hành hóa đơn.')).toBeVisible();
    fixtures.update('invoice', world.invoice, 'issued-retained');

    await owner.getByRole('button', { name: 'Thêm điều chỉnh' }).click();
    await dialog.getByLabel(/^Số tiền/).fill('-280000');
    await dialog.getByLabel(/^Lý do/).fill('Giảm trừ tiền điện');
    const adjustment = await capture(owner, fixtures, 'B7 add adjustment', 'POST', /\/invoices\/[^/]+\/adjustments$/, () =>
      dialog.getByRole('button', { name: 'Ghi điều chỉnh' }).click(),
    );
    expect(adjustment.body).toMatchObject({ amount: '-280000', reason: 'Giảm trừ tiền điện' });
    expect(adjustment.bodyKeys).toContain('idempotencyKey');
    await expect(owner.getByText('Đã ghi điều chỉnh.')).toBeVisible();

    await owner.reload();
    await expect(owner.getByText('Đã phát hành').first()).toBeVisible();
    await expect(owner.getByText('−280.000 ₫').first()).toBeVisible();
    const persisted = await ownerApi.get<InvoiceResponse>(invoiceApi());
    expect(persisted.status).toBe('ISSUED');
    expect(vnd(persisted.totalAmount)).toBe(3_280_000);
    expect(vnd(persisted.adjustedTotal)).toBe(3_000_000);
    expectClean(owner);
  });

  test('B8 UI: OWNER records payments and reverses one; the tenant sees the same ledger', async () => {
    test.setTimeout(300_000);
    const owner = pages.owner!;
    await owner.goto(wsUrl(`/invoices/${world.building}/${world.invoice}`));
    await owner.getByRole('link', { name: /Sổ thanh toán của hóa đơn/ }).click();
    await expect(owner.getByRole('heading', { name: 'Thanh toán', exact: true })).toBeVisible();
    const dialog = owner.getByRole('dialog');

    await owner.getByRole('button', { name: 'Ghi nhận thanh toán' }).click();
    await dialog.getByLabel(/^Số tiền/).fill('1000000');
    await dialog.getByLabel(/^Ghi chú/).fill('Đợt 1');
    const first = await capture(owner, fixtures, 'B8 record partial payment', 'POST', /\/invoices\/[^/]+\/payments$/, () =>
      dialog.getByRole('button', { name: 'Ghi nhận', exact: true }).click(),
    );
    expect(first.body).toMatchObject({ amount: '1000000', note: 'Đợt 1' });
    expect(first.bodyKeys).toEqual(expect.arrayContaining(['amount', 'method', 'receivedAt', 'idempotencyKey']));
    await expect(owner.getByText('Đã ghi nhận thanh toán một phần.')).toBeVisible();

    await owner.getByRole('button', { name: 'Ghi nhận thanh toán' }).click();
    await dialog.getByRole('button', { name: 'Thu đủ số còn lại' }).click();
    await dialog.getByLabel(/^Hình thức/).selectOption('BANK_TRANSFER');
    const second = await capture(owner, fixtures, 'B8 record final payment', 'POST', /\/invoices\/[^/]+\/payments$/, () =>
      dialog.getByRole('button', { name: 'Ghi nhận', exact: true }).click(),
    );
    expect(second.body).toMatchObject({ amount: '2000000', method: 'BANK_TRANSFER' });
    await expect(owner.getByText('Đã thu đủ hóa đơn.')).toBeVisible();

    // Reverse the bank transfer: a compensating entry, the original stays.
    await owner.getByRole('button', { name: /^Đảo thanh toán 2\.000\.000/ }).click();
    await dialog.getByLabel(/^Lý do đảo/).fill('Chuyển khoản nhầm');
    const reversal = await capture(owner, fixtures, 'B8 reverse payment', 'POST', /\/payments\/[^/]+\/reverse$/, () =>
      dialog.getByRole('button', { name: 'Đảo khoản này' }).click(),
    );
    expect(reversal.body).toMatchObject({ reason: 'Chuyển khoản nhầm' });
    await expect(owner.getByText('Đã đảo khoản thanh toán.')).toBeVisible();

    await owner.reload();
    await expect(owner.getByText('Bản đảo').first()).toBeVisible();
    await expect(owner.getByText('Thanh toán một phần', { exact: true }).first()).toBeVisible();
    const ledger = await ownerApi.get<InvoicePaymentPageResponse>(`${invoiceApi()}/payments`);
    expect(ledger.total).toBe(3);
    expect(ledger.paymentStatus).toBe('PARTIALLY_PAID');
    expect(vnd(ledger.paidTotal)).toBe(1_000_000);
    for (const entry of ledger.items) fixtures.record('invoice-payment-entry', entry.id, `${entry.kind.toLowerCase()}-retained`);
    // Cleanup: reverse the payment that is still confirmed (the ledger keeps both entries).
    fixtures.defer(`reverse-remaining-payments:${world.invoice}`, async () => {
      const current = await ownerApi.get<InvoicePaymentPageResponse>(`${invoiceApi()}/payments`);
      for (const entry of current.items) {
        if (entry.kind === 'PAYMENT' && entry.reversedByPaymentId === null) {
          await ownerApi.financialPost(`${invoiceApi()}/payments/${entry.id}/reverse`, { reason: `FE11UI ${fixtures.runId} cleanup` }, key(`cleanup-reverse-${entry.id}`));
        }
      }
    });

    const tenant = pages.tenant!;
    await tenant.goto(`/tenant/invoices/${world.invoice}`);
    await expect(tenant.getByRole('heading', { name: /Hóa đơn kỳ/ })).toBeVisible();
    await expect(tenant.getByText('Lịch sử thanh toán')).toBeVisible();
    await expect(tenant.getByText('Thanh toán một phần').first()).toBeVisible();
    expectClean(owner);
    expectClean(tenant);
  });

  test('B9 UI: OWNER records deposit entries; an over-balance refund is refused; one entry is reversed', async () => {
    test.setTimeout(300_000);
    const owner = pages.owner!;
    await owner.goto(wsUrl('/deposits'));
    await expect(owner.getByRole('heading', { name: 'Tiền cọc', exact: true })).toBeVisible();
    const select = owner.getByLabel('Hợp đồng', { exact: true });
    await select.selectOption({ label: await optionLabel(owner, 'Hợp đồng', ROOM_RENTED) });
    const dialog = owner.getByRole('dialog');

    await owner.getByRole('button', { name: 'Ghi nhận giao dịch cọc' }).click();
    await dialog.getByLabel(/^Số tiền/).fill('3000000');
    const collection = await capture(owner, fixtures, 'B9 deposit collection', 'POST', /\/deposit\/entries$/, () =>
      dialog.getByRole('button', { name: 'Ghi nhận', exact: true }).click(),
    );
    expect(collection.body).toMatchObject({ kind: 'COLLECTION', amount: '3000000' });
    await expect(owner.getByText('Đã ghi nhận giao dịch cọc.').last()).toBeVisible();

    await owner.getByRole('button', { name: 'Ghi nhận giao dịch cọc' }).click();
    await dialog.getByLabel(/^Loại giao dịch/).selectOption('DEDUCTION');
    await dialog.getByLabel(/^Số tiền/).fill('500000');
    await dialog.getByLabel(/^Lý do/).fill('Hỏng cửa');
    await dialog.getByLabel(/^Nội dung liên quan/).fill(`BB-${sid}`);
    const deduction = await capture(owner, fixtures, 'B9 deposit deduction', 'POST', /\/deposit\/entries$/, () =>
      dialog.getByRole('button', { name: 'Ghi nhận', exact: true }).click(),
    );
    expect(deduction.body).toMatchObject({ kind: 'DEDUCTION', amount: '500000' });
    await expect(owner.getByText(`Tham chiếu: BB-${sid}`)).toBeVisible();

    // Refund above the balance: the backend refuses it (insufficient balance), the dialog explains why.
    await owner.getByRole('button', { name: 'Ghi nhận giao dịch cọc' }).click();
    await dialog.getByLabel(/^Loại giao dịch/).selectOption('REFUND');
    await dialog.getByLabel(/^Số tiền/).fill('9000000');
    await dialog.getByLabel(/^Lý do/).fill('Trả phòng');
    await dialog.getByLabel(/^Mã chuyển khoản/).fill(`FT-${sid}`);
    const refused = await capture(
      owner,
      fixtures,
      'B9 deposit refund over balance (refused)',
      'POST',
      /\/deposit\/entries$/,
      () => dialog.getByRole('button', { name: 'Ghi nhận', exact: true }).click(),
      { expectedStatus: [400, 409, 422] },
    );
    expect(refused.status).toBeGreaterThanOrEqual(400);
    await expect(dialog.getByText(/Số dư cọc không đủ/)).toBeVisible();
    await dialog.getByLabel(/^Số tiền/).fill('2500000');
    const refund = await capture(owner, fixtures, 'B9 deposit refund', 'POST', /\/deposit\/entries$/, () =>
      dialog.getByRole('button', { name: 'Ghi nhận', exact: true }).click(),
    );
    expect(refund.body).toMatchObject({ kind: 'REFUND', amount: '2500000' });
    await expect(owner.getByRole('row').filter({ hasText: 'Hoàn cọc' }).first()).toBeVisible();

    await owner.getByRole('button', { name: /^Đảo giao dịch cọc Hoàn cọc/ }).click();
    await dialog.getByLabel(/^Lý do đảo/).fill('Ghi nhầm');
    const reversal = await capture(owner, fixtures, 'B9 deposit reversal', 'POST', /\/deposit\/entries\/[^/]+\/reverse$/, () =>
      dialog.getByRole('button', { name: 'Đảo giao dịch này' }).click(),
    );
    expect(reversal.body).toMatchObject({ reason: 'Ghi nhầm' });
    await expect(owner.getByText('Đã đảo giao dịch cọc.')).toBeVisible();

    // Persisted: owner API and the tenant portal agree, and the reload shows the reversed refund.
    await owner.reload();
    await select.selectOption({ label: await optionLabel(owner, 'Hợp đồng', ROOM_RENTED) });
    await expect(owner.getByText('Đã bị đảo')).toBeVisible();
    const ledger = await ownerApi.get<DepositPageResponse>(`/workspaces/${world.ws}/contracts/${world.contractNow}/deposit`);
    expect(vnd(ledger.collectedTotal)).toBe(3_000_000);
    expect(vnd(ledger.deductedTotal)).toBe(500_000);
    expect(vnd(ledger.refundedTotal)).toBe(0);
    expect(vnd(ledger.balance)).toBe(2_500_000);
    for (const entry of ledger.items) fixtures.record('deposit-entry', entry.id, `${entry.kind.toLowerCase()}-retained`);
    const mine = await tenantApi.get<DepositPageResponse>(`/contracts/me/${world.contractNow}/deposit`);
    expect(vnd(mine.balance)).toBe(2_500_000);
    fixtures.defer(`reverse-deposit-entries:${world.contractNow}`, async () => {
      const current = await ownerApi.get<DepositPageResponse>(`/workspaces/${world.ws}/contracts/${world.contractNow}/deposit`);
      const open = current.items.filter((entry) => entry.kind !== 'REVERSAL' && entry.reversedByEntryId === null);
      // Deductions and refunds first, the collection last (its reversal needs the balance back).
      for (const entry of [...open.filter((item) => item.kind !== 'COLLECTION'), ...open.filter((item) => item.kind === 'COLLECTION')]) {
        await ownerApi.financialPost(`/workspaces/${world.ws}/contracts/${world.contractNow}/deposit/entries/${entry.id}/reverse`, { reason: `FE11UI ${fixtures.runId} cleanup` }, key(`cleanup-deposit-${entry.id}`));
      }
    });
    expectClean(owner);
  });

  /* ---------------------------------------------------------------------------------------------- */
  /* C  Tenant: maintenance, with the OWNER handling it                                                */
  /* ---------------------------------------------------------------------------------------------- */
  test('C1 UI: the tenant sends two maintenance requests and cancels the OPEN one; OWNER works the other to CLOSED', async () => {
    test.setTimeout(300_000);
    const tenant = pages.tenant!;
    const dialog = tenant.getByRole('dialog');
    const send = async (title: string, priority: string) => {
      await tenant.goto('/tenant/maintenance');
      await tenant.getByRole('button', { name: /Gửi yêu cầu/ }).first().click();
      await dialog.getByLabel(/^Hợp đồng/).selectOption({ index: 1 });
      await dialog.getByLabel(/^Tiêu đề/).fill(title);
      await dialog.getByLabel(/^Mô tả/).fill('Mô tả kiểm thử FE-11');
      await dialog.getByLabel(/^Mức ưu tiên/).selectOption(priority);
      const sent = await capture(tenant, fixtures, `C1 tenant sends "${priority}"`, 'POST', /^\/maintenance-requests\/me$/, () =>
        dialog.getByRole('button', { name: 'Gửi yêu cầu' }).click(),
      );
      expect(sent.body).toMatchObject({ contractId: world.contractNow, title, priority });
      await expect(tenant.getByText('Đã gửi yêu cầu bảo trì.')).toBeVisible();
      await expect(tenant.getByRole('heading', { name: title })).toBeVisible();
    };
    const toCancel = name('den hanh lang');
    const toHandle = name('voi nuoc');
    await send(toHandle, 'HIGH');
    await send(toCancel, 'LOW');

    // Cancel the one that is still OPEN (the page is on its detail view right after sending).
    await tenant.getByRole('button', { name: 'Hủy yêu cầu' }).click();
    await dialog.getByLabel(/Lý do/).fill('Đã tự sửa được');
    const cancelled = await capture(tenant, fixtures, 'C1 tenant cancels OPEN request', 'POST', /^\/maintenance-requests\/me\/[^/]+\/cancel$/, () =>
      dialog.getByRole('button', { name: 'Hủy yêu cầu' }).click(),
    );
    expect(cancelled.body).toEqual({ reason: 'Đã tự sửa được' });
    await expect(tenant.getByText('Đã hủy yêu cầu bảo trì.')).toBeVisible();

    // OWNER: sequential lifecycle through the dialogs.
    const owner = pages.owner!;
    await owner.goto(wsUrl('/maintenance'));
    await owner.getByRole('link', { name: toHandle }).first().click();
    await expect(owner.getByRole('heading', { name: toHandle })).toBeVisible();
    const ownerDialog = owner.getByRole('dialog');
    const transition = async (button: string, toStatus: string, note?: string) => {
      await owner.getByRole('button', { name: button }).click();
      if (note) await ownerDialog.getByLabel(/^Ghi chú xử lý/).fill(note);
      const sent = await capture(owner, fixtures, `C1 owner -> ${toStatus}`, 'POST', /\/maintenance-requests\/[^/]+\/transition$/, () =>
        ownerDialog.getByRole('button', { name: 'Xác nhận' }).click(),
      );
      expect(sent.body).toMatchObject({ toStatus });
    };
    await transition('Bắt đầu xử lý', 'IN_PROGRESS');
    await expect(owner.getByText('Đang xử lý').first()).toBeVisible();
    await transition('Đánh dấu đã xử lý', 'RESOLVED', 'Đã thay gioăng vòi');
    await expect(owner.getByText('Đã thay gioăng vòi').first()).toBeVisible();
    await transition('Đóng yêu cầu', 'CLOSED');
    await expect(owner.getByText('Đã đóng').first()).toBeVisible();

    // Persisted: tenant list after a reload, and the API statuses.
    await tenant.goto('/tenant/maintenance');
    await expect(tenant.getByText(toHandle).first()).toBeVisible();
    const mine = await tenantApi.get<MaintenanceRequestPageResponse>('/maintenance-requests/me?page=1&limit=20');
    expect(mine.items.map((item) => item.status).sort()).toEqual(['CANCELLED', 'CLOSED']);
    for (const item of mine.items) fixtures.record('maintenance-request', item.id, `${item.status.toLowerCase()}-retained`);

    // Notifications: the tenant has unread items and marks them all read from the page.
    await tenant.goto('/notifications');
    await expect(tenant.getByRole('heading', { name: 'Thông báo', exact: true })).toBeVisible();
    const readAll = await capture(tenant, fixtures, 'C1 tenant marks notifications read', 'POST', /^\/notifications\/read-all$/, () =>
      tenant.getByRole('button', { name: 'Đánh dấu đã đọc tất cả' }).click(),
    );
    expect(readAll.status).toBeLessThan(300);
    await expect(tenant.getByTestId('unread-badge')).toHaveCount(0);
    expect((await tenantApi.get<{ unread: number }>('/notifications/unread-count')).unread).toBe(0);
    expectClean(tenant);
    expectClean(owner);
  });

  /* ---------------------------------------------------------------------------------------------- */
  /* D  Platform Admin: listing moderation and audit                                                   */
  /* ---------------------------------------------------------------------------------------------- */
  test('D1 UI: Platform Admin hides and restores the listing; the audit log shows both actions', async ({ browser }) => {
    test.setTimeout(300_000);
    const page = pages.admin!;
    const dialog = page.getByRole('dialog');
    fixtures.defer(`restore-listing:${world.listing}`, async () => {
      try {
        await admin.post(`/admin/listings/${world.listing}/restore`, { reason: `FE11UI ${fixtures.runId} cleanup` }, [200, 201]);
      } catch (error) {
        if ((error as { code?: string }).code !== 'ADMIN_STATE_UNCHANGED') throw error;
      }
      fixtures.update('listing', world.listing, 'restored');
    });
    await openPageWithRow(page, '/admin/listings', ROOM_LISTED);
    await expect(page.getByRole('heading', { name: 'Quản lý tin đăng' })).toBeVisible();
    const row = page.locator('tbody tr', { hasText: ROOM_LISTED });
    await row.getByRole('button', { name: 'Ẩn tin' }).click();
    const hideReason = `FE11UI ${fixtures.runId} an tin`;
    await dialog.getByLabel(/^Lý do/).fill(hideReason);
    const hidden = await capture(page, fixtures, 'D1 admin hides listing', 'POST', /^\/admin\/listings\/[^/]+\/hide$/, () =>
      dialog.getByRole('button', { name: 'Ẩn tin' }).click(),
    );
    expect(hidden.body).toEqual({ reason: hideReason });
    await expect(page.getByText('Đã ẩn tin đăng.')).toBeVisible();

    // The public marketplace no longer serves it (a separate, anonymous session).
    const publicSession = await anonymousSession(browser);
    sessions.push(publicSession);
    expect((await publicSession.context.request.get(`${REAL_API_PREFIX}/listings/${world.listing}`)).status()).toBe(404);
    await publicSession.page.goto(`/rooms?city=${encodeURIComponent(CITY)}`);
    await expect(publicSession.page.getByTestId('rooms-count')).toHaveText('0');

    await page.reload();
    await page.getByLabel('Kiểm duyệt').selectOption('true');
    await expect(page.getByText(hideReason)).toBeVisible();
    const restoreReason = `FE11UI ${fixtures.runId} khoi phuc`;
    await page.locator('tbody tr', { hasText: ROOM_LISTED }).getByRole('button', { name: 'Khôi phục' }).click();
    await dialog.getByLabel(/^Lý do/).fill(restoreReason);
    const restored = await capture(page, fixtures, 'D1 admin restores listing', 'POST', /^\/admin\/listings\/[^/]+\/restore$/, () =>
      dialog.getByRole('button', { name: 'Khôi phục' }).click(),
    );
    expect(restored.body).toEqual({ reason: restoreReason });
    await expect(page.getByText('Đã khôi phục tin đăng.')).toBeVisible();
    expect((await publicSession.context.request.get(`${REAL_API_PREFIX}/listings/${world.listing}`)).status()).toBe(200);
    await publicSession.page.reload();
    await expect(publicSession.page.getByTestId('rooms-count')).toHaveText('1');

    await page.goto('/admin/audit-logs');
    await page.getByLabel('Loại đối tượng').selectOption('LISTING');
    await expect(page.getByText(hideReason)).toBeVisible();
    await expect(page.getByText(restoreReason)).toBeVisible();
    const moderation = await admin.get<AdminListingPageResponse>(`/admin/listings?workspaceId=${world.ws}&page=1&limit=10`);
    expect(moderation.items.find((item) => item.id === world.listing)?.isHidden).toBe(false);
    expectClean(page);
  });

  /* ---------------------------------------------------------------------------------------------- */
  /* E  Multi-role                                                                                     */
  /* ---------------------------------------------------------------------------------------------- */
  test('E1 UI: a landlord links a tenant profile in another workspace and keeps both areas', async () => {
    test.setTimeout(240_000);
    const owner = pages.owner!;
    await owner.goto('/link-tenant');
    await owner.getByLabel(/^Mã mời/).fill(world.inviteTokenB);
    await capture(
      owner,
      fixtures,
      'E1 landlord accepts invitation of another workspace',
      'POST',
      /^\/tenant-invitations\/accept$/,
      () => owner.getByRole('button', { name: 'Liên kết tài khoản' }).click(),
      { sensitive: true },
    );
    world.inviteTokenB = '';
    fixtures.update('tenant-invitation', world.invitationB, 'accepted-retained');
    await owner.waitForURL((url) => url.pathname === '/tenant');
    await expect(owner.getByText(name('Khách B')).first()).toBeVisible();

    // Role refresh: both areas are offered and both keep working.
    await expect(owner.locator('.area-switcher:visible').first().getByRole('link', { name: /Chủ trọ/ })).toBeVisible();
    await expect(owner.locator('.area-switcher:visible').first().getByRole('link', { name: /Cổng người thuê/ })).toBeVisible();
    await owner.locator('.area-switcher:visible').first().getByRole('link', { name: /Chủ trọ/ }).click();
    await owner.waitForURL(/\/w\/[0-9a-f-]{36}\/dashboard$/);
    await expect(owner.getByRole('heading', { name: 'Tổng quan', exact: true })).toBeVisible();

    const capabilities = await ownerApi.get<UserCapabilitiesResponse>('/users/me/capabilities');
    expect(capabilities.workspaces.map((item) => item.id)).toContain(world.ws);
    expect(capabilities.workspaces.map((item) => item.id)).not.toContain(world.wsB);
    expect(capabilities.tenantLinks).toContainEqual(expect.objectContaining({ tenantId: world.tenantB, workspaceId: world.wsB }));

    const links = await ownerBApi.get<TenantAccountLinkResponse[]>(`/workspaces/${world.wsB}/tenants/${world.tenantB}/user-links`);
    const link = links.find((item: TenantUserLinkResponse) => item.revokedAt === null);
    expect(link).toBeDefined();
    fixtures.record('tenant-link', link!.id, 'active');
    fixtures.defer(`revoke-tenant-link:${link!.id}`, async () => {
      await ownerBApi.patch(`/workspaces/${world.wsB}/tenant-user-links/${link!.id}/revoke`, { reason: `FE11UI ${fixtures.runId} cleanup` });
      fixtures.update('tenant-link', link!.id, 'revoked');
    });

    // Isolation: the landlord's tenant portal shows only the foreign profile, never workspace A's data.
    const mine = await ownerApi.get<ContractPageResponse>('/contracts/me?page=1&limit=20');
    expect(mine.items).toEqual([]);
    const invoices = await ownerApi.get<InvoicePageResponse>('/invoices/me?page=1&limit=20');
    expect(invoices.items).toEqual([]);
    expectClean(owner);
  });
});
