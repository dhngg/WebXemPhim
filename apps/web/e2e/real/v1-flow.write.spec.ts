import { expect, request, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import type {
  AdminAuditLogPageResponse,
  AdminListingPageResponse,
  AdminListingResponse,
  AmenityResponse,
  BuildingResponse,
  ContractResponse,
  DashboardResponse,
  DepositEntryResponse,
  DepositPageResponse,
  InvoiceAdjustmentPageResponse,
  InvoiceAdjustmentResponse,
  InvoicePageResponse,
  InvoicePaymentPageResponse,
  InvoicePaymentResponse,
  InvoiceResponse,
  LandlordApplicationResponse,
  ListingManagementResponse,
  MaintenanceRequestPageResponse,
  MaintenanceRequestResponse,
  MeterReadingResponse,
  MyContractPageResponse,
  NotificationPageResponse,
  PublicListingPageResponse,
  PublicListingResponse,
  RatePlanResponse,
  RoomResponse,
  RoomServiceResponse,
  TenantAccountLinkResponse,
  TenantInvitationResponse,
  TenantResponse,
  TenantSelfResponse,
  TenantUserLinkResponse,
  UnreadCountResponse,
  UserCapabilitiesResponse,
  VehicleResponse,
  ViewingRequestPageResponse,
  ViewingRequestResponse,
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
import {
  addDays,
  businessToday,
  expectApiError,
  expectDenied,
  isoDaysFromNow,
  isoMinutesAgo,
  monthStart,
  nextMonthStart,
  shortId,
  vnd,
} from './support/scenario';

/**
 * REAL WRITE: the V1 cross-role journey on the approved Neon development database.
 *
 * Every record belongs to one run (`runId`). Nothing is hard-deleted: history that the product keeps
 * (applications, audit, issued invoices, adjustments, ledgers, reversals) stays, and the cleanup only uses
 * the same state transitions the product offers (end, stop, revoke, archive, reverse, unpublish).
 */
test.describe.serial('REAL WRITE: V1 cross-role journey', () => {
  const fixtures = new FixtureRegistry();
  // The backend stores room codes in upper case, so the suffix is upper case from the start.
  const sid = shortId(fixtures.runId).toUpperCase();
  const password = fixturePassword();
  const today = businessToday();
  const period = today.slice(0, 7);
  const tomorrow = addDays(today, 1);
  const contractStart = monthStart(today);
  const futureStart = nextMonthStart(today);
  const key = (operation: string) => stableIdempotencyKey(fixtures.runId, operation);

  const contexts: APIRequestContext[] = [];
  let admin: RealApi;
  let owner: RealApi;
  let owner2: RealApi;
  let tenant: RealApi;
  let outsider: RealApi;
  const email = (persona: string) => fixtureEmail(fixtures.runId, persona);

  const world = {
    ownerId: '',
    owner2Id: '',
    tenantUserId: '',
    outsiderId: '',
    wsA: '',
    wsB: '',
    building: '',
    room1: '', // listed room: stays VACANT, hosts the future contract
    room2: '', // occupied room: current contract, services, meters and invoice
    listing: '',
    tenantProfile: '', // linked to the tenant account, current contract
    futureTenantProfile: '',
    foreignTenantProfile: '', // lives in workspace B and is linked to the OWNER account (multi-role)
    contractNow: '',
    contractFuture: '',
    invoice: '',
    meter: '',
    rate: '',
    service: '',
    paymentCash: '',
    paymentBank: '',
    depositCollection: '',
    depositDeduction: '',
    maintenanceClosed: '',
    linkId: '',
    foreignLinkId: '',
    viewingConfirmed: '',
  };

  const wsPath = (workspaceId: string) => `/workspaces/${workspaceId}`;
  const buildingPath = () => `${wsPath(world.wsA)}/buildings/${world.building}`;
  const invoicePath = (invoiceId = world.invoice) => `${buildingPath()}/invoices/${invoiceId}`;

  test.beforeAll(async () => {
    requireWriteEnvironment();
  });

  test.afterAll(async () => {
    test.setTimeout(300_000);
    const cleanupFailures = await fixtures.cleanup();
    await fixtures.writeManifest(cleanupFailures);
    await Promise.all(contexts.map((context) => context.dispose()));
    expect(cleanupFailures, 'cleanup actions that did not complete (see the manifest)').toEqual([]);
  });

  async function newApi(): Promise<RealApi> {
    const context = await request.newContext({ baseURL: REAL_WEB_ORIGIN });
    contexts.push(context);
    return new RealApi(context);
  }

  test('01 accounts, landlord applications and the Platform Admin decision', async () => {
    const { adminEmail, adminPassword } = requireWriteEnvironment();
    [admin, owner, owner2, tenant, outsider] = await Promise.all([
      newApi(),
      newApi(),
      newApi(),
      newApi(),
      newApi(),
    ]);

    const register = async (api: RealApi, persona: string) => {
      const result = await api.register({
        email: email(persona),
        password,
        displayName: `FE11 ${persona} ${sid}`,
      });
      fixtures.record('user', result.user.id, 'retained-active');
      return result.user.id;
    };
    world.ownerId = await register(owner, 'owner');
    world.owner2Id = await register(owner2, 'owner2');
    world.tenantUserId = await register(tenant, 'tenant');
    world.outsiderId = await register(outsider, 'outsider');

    const applicationOwner = await owner.post<LandlordApplicationResponse>(
      '/landlord-applications/me',
      { reason: `FE11 ${fixtures.runId} owner` },
    );
    const applicationOwner2 = await owner2.post<LandlordApplicationResponse>(
      '/landlord-applications/me',
      { reason: `FE11 ${fixtures.runId} owner2` },
    );
    fixtures.record('landlord-application', applicationOwner.id, 'pending');
    fixtures.record('landlord-application', applicationOwner2.id, 'pending');

    await admin.login({ email: adminEmail, password: adminPassword });
    // Applications are append-only history: they are decided, never removed.
    for (const application of [applicationOwner, applicationOwner2]) {
      const decided = await admin.post<LandlordApplicationResponse>(
        `/admin/landlord-applications/${application.id}/approve`,
        { reason: `FE11 ${fixtures.runId} approved` },
        200,
      );
      expect(decided.status).toBe('APPROVED');
      fixtures.update('landlord-application', application.id, 'approved-retained');
    }

    // An ordinary account must not reach Platform Admin APIs.
    await expectApiError(owner.get('/admin/users'), 'PLATFORM_ADMIN_REQUIRED', 403);
    await expectDenied(outsider.get('/admin/audit-logs'));
  });

  test('02 session, Origin and CSRF protection answer through the Vite proxy', async () => {
    const probe = await request.newContext({ baseURL: REAL_WEB_ORIGIN });
    contexts.push(probe);
    const wrongBody = { email: 'fe11-csrf-probe@example.com', password: 'NotARealPassword123!' };
    const withoutCsrf = await probe.fetch(`${REAL_API_PREFIX}/auth/login`, {
      method: 'POST',
      headers: { Origin: REAL_WEB_ORIGIN },
      data: wrongBody,
    });
    expect(withoutCsrf.status()).toBe(403);
    const foreignOrigin = await probe.fetch(`${REAL_API_PREFIX}/auth/login`, {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'X-CSRF-Protection': '1' },
      data: wrongBody,
    });
    expect(foreignOrigin.status()).toBe(403);
    const anonymous = await probe.fetch(`${REAL_API_PREFIX}/users/me`, {
      headers: { Origin: REAL_WEB_ORIGIN },
    });
    expect(anonymous.status()).toBe(401);
  });

  test('03 workspaces, capabilities and a second isolated workspace', async () => {
    const wsA = await owner.post<WorkspaceResponse>('/workspaces', { name: `FE11 A ${sid}` });
    world.wsA = wsA.id;
    fixtures.record('workspace', wsA.id, 'active');
    fixtures.defer(`archive-workspace:${wsA.id}`, async () => {
      const archived = await owner.patch<WorkspaceResponse>(`${wsPath(wsA.id)}/archive`, {});
      expect(archived.status).toBe('ARCHIVED');
      fixtures.update('workspace', wsA.id, 'archived');
    });
    const wsB = await owner2.post<WorkspaceResponse>('/workspaces', { name: `FE11 B ${sid}` });
    world.wsB = wsB.id;
    fixtures.record('workspace', wsB.id, 'active');
    fixtures.defer(`archive-workspace:${wsB.id}`, async () => {
      const archived = await owner2.patch<WorkspaceResponse>(`${wsPath(wsB.id)}/archive`, {});
      expect(archived.status).toBe('ARCHIVED');
      fixtures.update('workspace', wsB.id, 'archived');
    });
    expect(wsA.currentMembership.role).toBe('OWNER');

    const capabilities = await owner.get<UserCapabilitiesResponse>('/users/me/capabilities');
    expect(capabilities.workspaces).toContainEqual(
      expect.objectContaining({ id: wsA.id, role: 'OWNER', status: 'ACTIVE' }),
    );
    expect(capabilities.tenantLinks).toEqual([]);
    expect(capabilities.isPlatformAdmin).toBe(false);

    // The other landlord and an outsider cannot see workspace A at all.
    await expectDenied(owner2.get(wsPath(wsA.id)));
    await expectDenied(outsider.get(wsPath(wsA.id)));
    await expectDenied(outsider.post(`${wsPath(wsA.id)}/buildings`, { name: 'x', addressLine1: 'x', city: 'x' }));
  });

  test('04 building, rooms, amenity, image and the published listing', async () => {
    const building = await owner.post<BuildingResponse>(`${wsPath(world.wsA)}/buildings`, {
      name: `FE11 Nhà ${sid}`,
      description: 'Tòa nhà kiểm thử REAL HTTP',
      addressLine1: `12 Đường FE11 ${sid}`,
      ward: 'Phường 1',
      district: 'Quận 1',
      city: `FE11-${sid}`,
      latitude: 10.7769,
      longitude: 106.7009,
    });
    world.building = building.id;
    fixtures.record('building', building.id, 'active');
    fixtures.defer(`archive-building:${building.id}`, async () => {
      await owner.patch<BuildingResponse>(`${buildingPath()}/archive`, {});
      fixtures.update('building', building.id, 'archived');
    });
    expect(building.status).toBe('ACTIVE');

    const createRoom = async (code: string, rent: string) => {
      const room = await owner.post<RoomResponse>(`${buildingPath()}/rooms`, {
        code,
        areaSqm: '24.5',
        monthlyRent: rent,
        maxOccupants: 2,
        description: 'Phòng kiểm thử REAL HTTP',
      });
      fixtures.record('room', room.id, 'vacant');
      fixtures.defer(`archive-room:${room.id}`, async () => {
        await owner.patch<RoomResponse>(`${buildingPath()}/rooms/${room.id}/archive`, {});
        fixtures.update('room', room.id, 'archived');
      });
      return room;
    };
    const room1 = await createRoom(`L${sid}`, '3500000');
    const room2 = await createRoom(`O${sid}`, '3000000');
    world.room1 = room1.id;
    world.room2 = room2.id;
    expect(room1.status).toBe('VACANT');

    const amenity = await owner.post<AmenityResponse>(`${wsPath(world.wsA)}/amenities`, {
      name: `WiFi ${sid}`,
    });
    fixtures.record('amenity', amenity.id, 'retained');
    await owner.post(`${buildingPath()}/rooms/${room1.id}/amenities/${amenity.id}`, undefined, [
      200,
      201,
      204,
    ]);
    await owner.post(`${buildingPath()}/rooms/${room1.id}/images`, {
      url: `https://example.com/fe11/${sid}.jpg`,
      altText: `Ảnh phòng ${sid}`,
    });

    const listing = await owner.put<ListingManagementResponse>(
      `${buildingPath()}/rooms/${room1.id}/listing`,
      { published: true },
    );
    world.listing = listing.id;
    fixtures.record('listing', listing.id, 'published');
    fixtures.defer(`unpublish-listing:${listing.id}`, async () => {
      await owner.put<ListingManagementResponse>(`${buildingPath()}/rooms/${room1.id}/listing`, {
        published: false,
      });
      fixtures.update('listing', listing.id, 'unpublished');
    });
    expect(listing.published).toBe(true);

    // Public discovery needs no session.
    const publicContext = await request.newContext({ baseURL: REAL_WEB_ORIGIN });
    contexts.push(publicContext);
    const found = await publicContext.get(
      `${REAL_API_PREFIX}/listings?city=${encodeURIComponent(`FE11-${sid}`)}&page=1&limit=10`,
    );
    expect(found.status()).toBe(200);
    const page = (await found.json()) as PublicListingPageResponse;
    expect(page.items.map((item) => item.id)).toContain(listing.id);
    const detail = (await (
      await publicContext.get(`${REAL_API_PREFIX}/listings/${listing.id}`)
    ).json()) as PublicListingResponse;
    expect(detail.room.code).toBe(`L${sid}`);
    expect(detail.building.city).toBe(`FE11-${sid}`);
    expect(detail.room.images).toHaveLength(1);
    expect(detail.room.amenities.map((item) => item.name)).toContain(`WiFi ${sid}`);
  });

  test('05 viewing requests: seeker books, OWNER confirms / rejects, seeker cancels', async () => {
    const book = (days: number, message: string) =>
      tenant.post<ViewingRequestResponse>(`/listings/${world.listing}/viewing-requests`, {
        scheduledAt: isoDaysFromNow(days),
        message,
      });
    const first = await book(3, `FE11 ${sid} xem lần 1`);
    expect(first.status).toBe('PENDING');
    expect(first.room.code).toBe(`L${sid}`);
    fixtures.record('viewing-request', first.id, 'pending');

    const ownerList = await owner.get<ViewingRequestPageResponse>(
      `${wsPath(world.wsA)}/viewing-requests?page=1&limit=50`,
    );
    expect(ownerList.items.map((item) => item.id)).toContain(first.id);
    await expectDenied(outsider.get(`${wsPath(world.wsA)}/viewing-requests`));
    await expectDenied(owner2.get(`${wsPath(world.wsA)}/viewing-requests`));
    // The seeker cannot decide their own request.
    await expectDenied(
      tenant.patch(`${wsPath(world.wsA)}/viewing-requests/${first.id}/confirm`, {}),
    );

    const confirmed = await owner.patch<ViewingRequestResponse>(
      `${wsPath(world.wsA)}/viewing-requests/${first.id}/confirm`,
      { note: 'Hẹn gặp tại cổng' },
    );
    expect(confirmed.status).toBe('CONFIRMED');
    world.viewingConfirmed = confirmed.id;
    fixtures.update('viewing-request', first.id, 'confirmed-retained');
    await expectApiError(
      owner.patch(`${wsPath(world.wsA)}/viewing-requests/${first.id}/reject`, {}),
      'VIEWING_REQUEST_INVALID_TRANSITION',
    );

    const second = await book(4, `FE11 ${sid} xem lần 2`);
    fixtures.record('viewing-request', second.id, 'pending');
    const rejected = await owner.patch<ViewingRequestResponse>(
      `${wsPath(world.wsA)}/viewing-requests/${second.id}/reject`,
      { note: 'Đã có người xem' },
    );
    expect(rejected.status).toBe('REJECTED');
    fixtures.update('viewing-request', second.id, 'rejected-retained');

    const third = await book(5, `FE11 ${sid} xem lần 3`);
    fixtures.record('viewing-request', third.id, 'pending');
    const cancelled = await tenant.patch<ViewingRequestResponse>(
      `/viewing-requests/${third.id}/cancel`,
      {},
    );
    expect(cancelled.status).toBe('CANCELLED');
    fixtures.update('viewing-request', third.id, 'cancelled-retained');

    const mine = await tenant.get<ViewingRequestPageResponse>('/viewing-requests/me?page=1&limit=20');
    expect(mine.items.map((item) => item.status).sort()).toEqual(['CANCELLED', 'CONFIRMED', 'REJECTED']);

    const ownerNotifications = await owner.get<NotificationPageResponse>('/notifications?page=1&limit=50');
    expect(ownerNotifications.items.map((item) => item.type)).toContain('VIEWING_REQUESTED');
    const seekerNotifications = await tenant.get<NotificationPageResponse>('/notifications?page=1&limit=50');
    const seekerTypes = seekerNotifications.items.map((item) => item.type);
    expect(seekerTypes).toContain('VIEWING_CONFIRMED');
    expect(seekerTypes).toContain('VIEWING_REJECTED');
  });

  test('06 tenant profiles, invitation, role refresh and account link', async () => {
    const makeTenant = async (fullName: string, phone: string, contactEmail?: string) => {
      const profile = await owner.post<TenantResponse>(`${wsPath(world.wsA)}/tenants`, {
        fullName,
        phone,
        email: contactEmail,
        notes: `FE11 ${fixtures.runId}`,
      });
      fixtures.record('tenant-profile', profile.id, 'active');
      fixtures.defer(`archive-tenant:${profile.id}`, async () => {
        await owner.patch<TenantResponse>(`${wsPath(world.wsA)}/tenants/${profile.id}/archive`, {});
        fixtures.update('tenant-profile', profile.id, 'archived');
      });
      return profile;
    };
    const profile = await makeTenant(`FE11 Khách ${sid}`, '0901234567', email('tenant'));
    const futureProfile = await makeTenant(`FE11 Khách sau ${sid}`, '0907654321');
    world.tenantProfile = profile.id;
    world.futureTenantProfile = futureProfile.id;

    // The tenant account has no workspace link before the invitation.
    const before = await tenant.get<UserCapabilitiesResponse>('/users/me/capabilities');
    expect(before.tenantLinks).toEqual([]);
    await expectDenied(tenant.get(`${wsPath(world.wsA)}/tenants`));

    const invitation = await owner.post<TenantInvitationResponse>(
      `${wsPath(world.wsA)}/tenants/${profile.id}/invitations`,
    );
    expect(invitation.acceptedAt).toBeNull();
    const token = invitation.token;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    fixtures.record('tenant-invitation', invitation.id, 'issued');

    // Another account cannot use the owner's invitation after the tenant accepts it.
    const link = await tenant.post<TenantUserLinkResponse>(
      '/tenant-invitations/accept',
      { token },
      [200, 201],
    );
    expect(link.tenantId).toBe(profile.id);
    expect(link.userId).toBe(world.tenantUserId);
    fixtures.record('tenant-link', link.id, 'active');
    fixtures.update('tenant-invitation', invitation.id, 'accepted-retained');
    await expectApiError(
      outsider.post('/tenant-invitations/accept', { token }, [200, 201]),
      'TENANT_INVITATION_INVALID',
    );

    const links = await owner.get<TenantAccountLinkResponse[]>(
      `${wsPath(world.wsA)}/tenants/${profile.id}/user-links`,
    );
    const active = links.find((item) => item.userId === world.tenantUserId);
    expect(active?.revokedAt ?? null).toBeNull();
    world.linkId = link.id;
    fixtures.defer(`revoke-tenant-link:${link.id}`, async () => {
      await owner.patch(`${wsPath(world.wsA)}/tenant-user-links/${link.id}/revoke`, {
        reason: `FE11 ${fixtures.runId} cleanup`,
      });
      fixtures.update('tenant-link', link.id, 'revoked');
    });

    // Role refresh: the very next capabilities read already lists the tenant link.
    const after = await tenant.get<UserCapabilitiesResponse>('/users/me/capabilities');
    expect(after.tenantLinks).toContainEqual(
      expect.objectContaining({ tenantId: profile.id, workspaceId: world.wsA }),
    );
    expect(after.workspaces).toEqual([]);
    const self = await tenant.get<TenantSelfResponse[]>('/tenants/me');
    expect(self.map((item) => item.id)).toContain(profile.id);
  });

  test('07 current and future contracts, overlap guard, room state, vehicle', async () => {
    const endDate = addDays(today, 365);
    const current = await owner.post<ContractResponse>(`${wsPath(world.wsA)}/contracts`, {
      roomId: world.room2,
      tenantId: world.tenantProfile,
      startDate: contractStart,
      endDate,
      monthlyRent: '3000000',
      notes: `FE11 ${fixtures.runId} hiện tại`,
    });
    world.contractNow = current.id;
    fixtures.record('contract', current.id, 'active');
    fixtures.defer(`end-contract:${current.id}`, async () => {
      await owner.patch<ContractResponse>(`${wsPath(world.wsA)}/contracts/${current.id}/end`, {
        endDate: today,
      });
      fixtures.update('contract', current.id, 'ended');
    });
    expect(current.phase).toBe('IN_EFFECT');

    const future = await owner.post<ContractResponse>(`${wsPath(world.wsA)}/contracts`, {
      roomId: world.room1,
      tenantId: world.futureTenantProfile,
      startDate: futureStart,
      endDate: addDays(futureStart, 365),
      monthlyRent: '3500000',
    });
    world.contractFuture = future.id;
    fixtures.record('contract', future.id, 'active');
    fixtures.defer(`cancel-contract:${future.id}`, async () => {
      // Not started yet: ending without a date cancels it and keeps the registered period.
      await owner.patch<ContractResponse>(`${wsPath(world.wsA)}/contracts/${future.id}/end`, {});
      fixtures.update('contract', future.id, 'cancelled');
    });
    expect(future.phase).toBe('UPCOMING');

    // A second contract over the same room and dates is refused.
    await expectApiError(
      owner.post(`${wsPath(world.wsA)}/contracts`, {
        roomId: world.room2,
        tenantId: world.futureTenantProfile,
        startDate: addDays(today, 5),
        endDate: addDays(today, 40),
        monthlyRent: '3000000',
      }),
      'CONTRACT_CONFLICT',
    );

    const rooms = await owner.get<RoomResponse[]>(`${buildingPath()}/rooms`);
    const statusOf = (id: string) => rooms.find((room) => room.id === id)?.status;
    expect(statusOf(world.room2)).toBe('OCCUPIED');
    // A future contract only reserves its period: the listed room is still VACANT and bookable.
    expect(statusOf(world.room1)).toBe('VACANT');
    await expectApiError(
      owner.put(`${buildingPath()}/rooms/${world.room2}/listing`, { published: true }),
      'LISTING_NOT_ELIGIBLE',
    );

    // Vehicle: registered and stopped before billing so it never changes the invoice.
    const plate = `59FE${sid.toUpperCase().replace(/[^A-Z0-9]/g, '0')}`;
    const vehicle = await owner.post<VehicleResponse>(`${wsPath(world.wsA)}/vehicles`, {
      tenantId: world.tenantProfile,
      licensePlate: plate,
      vehicleType: 'MOTORBIKE',
      brand: 'FE11',
    });
    fixtures.record('vehicle', vehicle.id, 'active');
    const stopped = await owner.patch<VehicleResponse>(
      `${wsPath(world.wsA)}/vehicles/${vehicle.id}/stop`,
      { reason: 'Kết thúc kiểm thử' },
    );
    expect(stopped.status).toBe('INACTIVE');
    fixtures.update('vehicle', vehicle.id, 'stopped');

    // The tenant account reads exactly its own contract; the others see nothing of it.
    const mine = await tenant.get<MyContractPageResponse>('/contracts/me?page=1&limit=20');
    expect(mine.items.map((item) => item.id)).toEqual([current.id]);
    expect((await outsider.get<MyContractPageResponse>('/contracts/me?page=1&limit=20')).items).toEqual([]);
    await expectDenied(outsider.get(`/contracts/me/${current.id}`));
    await expectDenied(tenant.get(`${wsPath(world.wsA)}/contracts`));
  });

  test('08 rates, room service, meter reading and adjustment', async () => {
    const rate = await owner.post<RatePlanResponse>(`${buildingPath()}/rates`, {
      code: 'ELEC',
      name: 'Điện FE11',
      serviceType: 'ELECTRICITY',
      billingUnit: 'KWH',
      unitPrice: '3500',
      effectiveFrom: contractStart,
    });
    world.rate = rate.id;
    fixtures.record('rate-plan', rate.id, 'active');
    fixtures.defer(`stop-rate:${rate.id}`, async () => {
      await owner.patch<RatePlanResponse>(`${buildingPath()}/rates/${rate.id}/stop`, {
        effectiveTo: tomorrow,
      });
      fixtures.update('rate-plan', rate.id, 'stopped');
    });

    const service = await owner.post<RoomServiceResponse>(
      `${buildingPath()}/rooms/${world.room2}/services`,
      { rateCode: 'ELEC', effectiveFrom: contractStart },
    );
    world.service = service.id;
    fixtures.record('room-service', service.id, 'active');
    fixtures.defer(`stop-service:${service.id}`, async () => {
      await owner.patch<RoomServiceResponse>(
        `${buildingPath()}/rooms/${world.room2}/services/${service.id}/stop`,
        { effectiveTo: tomorrow },
      );
      fixtures.update('room-service', service.id, 'stopped');
    });

    const reading = await owner.post<MeterReadingResponse>(
      `${buildingPath()}/rooms/${world.room2}/meter-readings`,
      { meterType: 'ELECTRICITY', period, previousReading: '100', currentReading: '170' },
    );
    world.meter = reading.id;
    fixtures.record('meter-reading', reading.id, 'recorded');
    expect(vnd(reading.consumption)).toBe(70);
    await expectApiError(
      owner.post(`${buildingPath()}/rooms/${world.room2}/meter-readings`, {
        meterType: 'ELECTRICITY',
        period,
        previousReading: '100',
        currentReading: '175',
      }),
      'METER_READING_DUPLICATE',
    );
    const adjusted = await owner.patch<MeterReadingResponse>(
      `${buildingPath()}/rooms/${world.room2}/meter-readings/${reading.id}/adjust`,
      { currentReading: '180', previousReading: '100', reason: 'Ghi nhầm chỉ số' },
    );
    expect(vnd(adjusted.consumption)).toBe(80);
    expect(adjusted.revision).toBe(2);
    expect(adjusted.adjustments).toHaveLength(1);
    fixtures.update('meter-reading', reading.id, 'adjusted-retained');
  });

  test('09 invoice DRAFT -> ISSUED, adjustment and duplicate guard', async () => {
    const draft = await owner.post<InvoiceResponse>(`${buildingPath()}/invoices`, {
      contractId: world.contractNow,
      period,
      dueDate: addDays(today, 10),
      notes: `FE11 ${fixtures.runId}`,
    });
    world.invoice = draft.id;
    fixtures.record('invoice', draft.id, 'draft');
    expect(draft.status).toBe('DRAFT');
    expect(draft.isComplete).toBe(true);
    // Rent 3,000,000 + 80 kWh x 3,500.
    expect(vnd(draft.provisionalAmount)).toBe(3_280_000);
    expect(draft.items.map((item) => item.itemType).sort()).toEqual(['ELECTRICITY', 'RENT']);
    await expectApiError(
      owner.post(`${buildingPath()}/invoices`, { contractId: world.contractNow, period }),
      'INVOICE_DUPLICATE',
    );

    const edited = await owner.patch<InvoiceResponse>(invoicePath(), { notes: `FE11 ${sid} sửa` });
    expect(edited.notes).toBe(`FE11 ${sid} sửa`);

    // A DRAFT that is not needed can be discarded: bill the future contract's own month, then delete it.
    const throwaway = await owner.post<InvoiceResponse>(`${buildingPath()}/invoices`, {
      contractId: world.contractFuture,
      period: futureStart.slice(0, 7),
    });
    expect(throwaway.status).toBe('DRAFT');
    await owner.delete(invoicePath(throwaway.id));
    await expectDenied(owner.get(invoicePath(throwaway.id)));

    const issued = await owner.post<InvoiceResponse>(`${invoicePath()}/issue`, undefined, [200, 201]);
    expect(issued.status).toBe('ISSUED');
    expect(vnd(issued.totalAmount)).toBe(3_280_000);
    fixtures.update('invoice', draft.id, 'issued-retained');
    await expectApiError(owner.patch(invoicePath(), { notes: 'đã phát hành' }), 'INVOICE_NOT_EDITABLE');
    await expectApiError(owner.delete(invoicePath()), 'INVOICE_NOT_EDITABLE');

    const adjustmentBody = {
      amount: '-280000',
      reason: 'Giảm trừ tiền điện (kiểm thử)',
    };
    const adjustment = await owner.financialPost<InvoiceAdjustmentResponse>(
      `${invoicePath()}/adjustments`,
      adjustmentBody,
      key('adjustment-1'),
    );
    fixtures.record('invoice-adjustment', adjustment.id, 'retained');
    const replay = await owner.financialPost<InvoiceAdjustmentResponse>(
      `${invoicePath()}/adjustments`,
      adjustmentBody,
      key('adjustment-1'),
    );
    expect(replay.id).toBe(adjustment.id);
    await expectApiError(
      owner.financialPost(`${invoicePath()}/adjustments`, { ...adjustmentBody, amount: '-1000' }, key('adjustment-1')),
      'INVOICE_ADJUSTMENT_IDEMPOTENCY_CONFLICT',
    );
    const adjustments = await owner.get<InvoiceAdjustmentPageResponse>(`${invoicePath()}/adjustments`);
    expect(adjustments.total).toBe(1);
    expect(vnd(adjustments.adjustedTotal)).toBe(3_000_000);

    const current = await owner.get<InvoiceResponse>(invoicePath());
    expect(vnd(current.adjustedTotal)).toBe(3_000_000);
    expect(current.paymentStatus).toBe('UNPAID');
  });

  test('10 payments: idempotency, over-payment guard and append-only reversal', async () => {
    const received = isoMinutesAgo(2);
    const payCash = await owner.financialPost<InvoicePaymentResponse>(
      `${invoicePath()}/payments`,
      { amount: '1000000', method: 'CASH', receivedAt: received, note: 'FE11 đợt 1' },
      key('payment-cash'),
    );
    world.paymentCash = payCash.id;
    fixtures.record('invoice-payment', payCash.id, 'confirmed');
    fixtures.defer(`reverse-payment:${payCash.id}`, async () => {
      const reversal = await owner.financialPost<InvoicePaymentResponse>(
        `${invoicePath()}/payments/${payCash.id}/reverse`,
        { reason: `FE11 ${fixtures.runId} cleanup` },
        key('cleanup-reverse-cash'),
      );
      fixtures.record('invoice-payment-reversal', reversal.id, 'retained');
      fixtures.update('invoice-payment', payCash.id, 'reversed-retained');
    });
    const replay = await owner.financialPost<InvoicePaymentResponse>(
      `${invoicePath()}/payments`,
      { amount: '1000000', method: 'CASH', receivedAt: received, note: 'FE11 đợt 1' },
      key('payment-cash'),
    );
    expect(replay.id).toBe(payCash.id);
    await expectApiError(
      owner.financialPost(
        `${invoicePath()}/payments`,
        { amount: '1000001', method: 'CASH', receivedAt: received },
        key('payment-cash'),
      ),
      'INVOICE_PAYMENT_IDEMPOTENCY_CONFLICT',
    );

    const payBank = await owner.financialPost<InvoicePaymentResponse>(
      `${invoicePath()}/payments`,
      { amount: '2000000', method: 'BANK_TRANSFER', receivedAt: received },
      key('payment-bank'),
    );
    world.paymentBank = payBank.id;
    fixtures.record('invoice-payment', payBank.id, 'confirmed');
    await expectApiError(
      owner.financialPost(
        `${invoicePath()}/payments`,
        { amount: '1', method: 'CASH', receivedAt: received },
        key('payment-over'),
      ),
      'INVOICE_PAYMENT_EXCEEDS_DUE',
    );

    let ledger = await owner.get<InvoicePaymentPageResponse>(`${invoicePath()}/payments`);
    expect(ledger.paymentStatus).toBe('PAID');
    expect(vnd(ledger.outstanding)).toBe(0);

    const reversal = await owner.financialPost<InvoicePaymentResponse>(
      `${invoicePath()}/payments/${payBank.id}/reverse`,
      { reason: 'FE11 chuyển khoản nhầm' },
      key('reverse-bank'),
    );
    fixtures.record('invoice-payment-reversal', reversal.id, 'retained');
    fixtures.update('invoice-payment', payBank.id, 'reversed-retained');
    expect(reversal.kind).toBe('REVERSAL');
    expect(reversal.reversesPaymentId).toBe(payBank.id);
    const sameReversal = await owner.financialPost<InvoicePaymentResponse>(
      `${invoicePath()}/payments/${payBank.id}/reverse`,
      { reason: 'FE11 chuyển khoản nhầm' },
      key('reverse-bank'),
    );
    expect(sameReversal.id).toBe(reversal.id);

    ledger = await owner.get<InvoicePaymentPageResponse>(`${invoicePath()}/payments`);
    // Append-only: both payments and the reversal are still listed.
    expect(ledger.total).toBe(3);
    expect(ledger.paymentStatus).toBe('PARTIALLY_PAID');
    expect(vnd(ledger.paidTotal)).toBe(1_000_000);
    expect(vnd(ledger.outstanding)).toBe(2_000_000);
  });

  test('11 deposit ledger: collection, deduction, refund, insufficient balance, reversal', async () => {
    const base = `${wsPath(world.wsA)}/contracts/${world.contractNow}/deposit`;
    const occurredAt = isoMinutesAgo(5);
    const collection = await owner.financialPost<DepositEntryResponse>(
      `${base}/entries`,
      { kind: 'COLLECTION', amount: '5000000', method: 'CASH', occurredAt },
      key('deposit-collection'),
    );
    world.depositCollection = collection.id;
    fixtures.record('deposit-entry', collection.id, 'recorded');
    fixtures.defer(`reverse-deposit-collection:${collection.id}`, async () => {
      const reversal = await owner.financialPost<DepositEntryResponse>(
        `${base}/entries/${collection.id}/reverse`,
        { reason: `FE11 ${fixtures.runId} cleanup` },
        key('cleanup-reverse-collection'),
      );
      fixtures.record('deposit-entry-reversal', reversal.id, 'retained');
      fixtures.update('deposit-entry', collection.id, 'reversed-retained');
    });
    const deduction = await owner.financialPost<DepositEntryResponse>(
      `${base}/entries`,
      {
        kind: 'DEDUCTION',
        amount: '500000',
        occurredAt,
        reason: 'Hư hỏng nhỏ',
        reference: `FE11-${sid}-damage`,
      },
      key('deposit-deduction'),
    );
    world.depositDeduction = deduction.id;
    fixtures.record('deposit-entry', deduction.id, 'recorded');
    fixtures.defer(`reverse-deposit-deduction:${deduction.id}`, async () => {
      const reversal = await owner.financialPost<DepositEntryResponse>(
        `${base}/entries/${deduction.id}/reverse`,
        { reason: `FE11 ${fixtures.runId} cleanup` },
        key('cleanup-reverse-deduction'),
      );
      fixtures.record('deposit-entry-reversal', reversal.id, 'retained');
      fixtures.update('deposit-entry', deduction.id, 'reversed-retained');
    });
    const refund = await owner.financialPost<DepositEntryResponse>(
      `${base}/entries`,
      {
        kind: 'REFUND',
        amount: '1000000',
        method: 'BANK_TRANSFER',
        occurredAt,
        reason: 'Hoàn một phần',
        reference: `FE11-${sid}-refund`,
      },
      key('deposit-refund'),
    );
    fixtures.record('deposit-entry', refund.id, 'recorded');

    await expectApiError(
      owner.financialPost(
        `${base}/entries`,
        {
          kind: 'REFUND',
          amount: '99000000',
          method: 'CASH',
          occurredAt,
          reason: 'Quá số dư',
          reference: `FE11-${sid}-over`,
        },
        key('deposit-over'),
      ),
      'DEPOSIT_INSUFFICIENT_BALANCE',
    );

    let summary = await owner.get<DepositPageResponse>(base);
    expect(vnd(summary.collectedTotal)).toBe(5_000_000);
    expect(vnd(summary.deductedTotal)).toBe(500_000);
    expect(vnd(summary.refundedTotal)).toBe(1_000_000);
    expect(vnd(summary.balance)).toBe(3_500_000);

    // The tenant sees the same ledger, read-only; another account does not.
    const tenantView = await tenant.get<DepositPageResponse>(
      `/contracts/me/${world.contractNow}/deposit`,
    );
    expect(vnd(tenantView.balance)).toBe(3_500_000);
    await expectDenied(outsider.get(`/contracts/me/${world.contractNow}/deposit`));

    const reversal = await owner.financialPost<DepositEntryResponse>(
      `${base}/entries/${refund.id}/reverse`,
      { reason: 'FE11 hoàn nhầm' },
      key('reverse-refund'),
    );
    fixtures.record('deposit-entry-reversal', reversal.id, 'retained');
    fixtures.update('deposit-entry', refund.id, 'reversed-retained');
    expect(reversal.kind).toBe('REVERSAL');
    summary = await owner.get<DepositPageResponse>(base);
    expect(vnd(summary.refundedTotal)).toBe(0);
    expect(vnd(summary.balance)).toBe(4_500_000);
    // Append-only: collection, deduction, refund and the reversal.
    expect(summary.total).toBe(4);
  });

  test('12 maintenance: tenant request, OWNER lifecycle, cancel, notifications', async () => {
    const created = await tenant.post<MaintenanceRequestResponse>('/maintenance-requests/me', {
      contractId: world.contractNow,
      title: `FE11 ${sid} vòi nước rò`,
      description: 'Vòi nước bồn rửa bị rò rỉ',
      priority: 'HIGH',
    });
    world.maintenanceClosed = created.id;
    fixtures.record('maintenance-request', created.id, 'open');
    expect(created.status).toBe('OPEN');
    expect(created.roomId).toBe(world.room2);

    const maintenanceBase = `${buildingPath()}/maintenance-requests`;
    const ownerList = await owner.get<MaintenanceRequestPageResponse>(`${maintenanceBase}?page=1&limit=50`);
    expect(ownerList.items.map((item) => item.id)).toContain(created.id);
    await expectDenied(outsider.get(`/maintenance-requests/me/${created.id}`));
    await expectDenied(outsider.post(`/maintenance-requests/me/${created.id}/cancel`, {}));
    await expectDenied(tenant.get(maintenanceBase));

    await expectApiError(
      owner.post(`${maintenanceBase}/${created.id}/transition`, { toStatus: 'CLOSED' }, [200, 201]),
      'MAINTENANCE_INVALID_TRANSITION',
    );
    const transition = (toStatus: string, note?: string) =>
      owner.post<MaintenanceRequestResponse>(
        `${maintenanceBase}/${created.id}/transition`,
        { toStatus, note },
        [200, 201],
      );
    expect((await transition('IN_PROGRESS')).status).toBe('IN_PROGRESS');
    const resolved = await transition('RESOLVED', 'Đã thay gioăng vòi');
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.resolutionNote).toBe('Đã thay gioăng vòi');
    expect((await transition('CLOSED')).status).toBe('CLOSED');
    fixtures.update('maintenance-request', created.id, 'closed-retained');

    const second = await tenant.post<MaintenanceRequestResponse>('/maintenance-requests/me', {
      contractId: world.contractNow,
      title: `FE11 ${sid} đèn hành lang`,
      description: 'Đèn hành lang chập chờn',
    });
    fixtures.record('maintenance-request', second.id, 'open');
    const cancelled = await tenant.post<MaintenanceRequestResponse>(
      `/maintenance-requests/me/${second.id}/cancel`,
      { reason: 'Không còn cần' },
      [200, 201],
    );
    expect(cancelled.status).toBe('CANCELLED');
    fixtures.update('maintenance-request', second.id, 'cancelled-retained');

    const mine = await tenant.get<MaintenanceRequestPageResponse>('/maintenance-requests/me?page=1&limit=20');
    expect(mine.items.map((item) => item.status).sort()).toEqual(['CANCELLED', 'CLOSED']);

    const ownerTypes = (
      await owner.get<NotificationPageResponse>('/notifications?page=1&limit=50')
    ).items.map((item) => item.type);
    expect(ownerTypes).toContain('MAINTENANCE_CREATED');
    const tenantNotifications = await tenant.get<NotificationPageResponse>('/notifications?page=1&limit=50');
    const tenantTypes = tenantNotifications.items.map((item) => item.type);
    expect(tenantTypes).toContain('MAINTENANCE_STATUS_CHANGED');
    expect(tenantTypes).toContain('INVOICE_ISSUED');

    const unread = await tenant.get<UnreadCountResponse>('/notifications/unread-count');
    expect(unread.unread).toBeGreaterThan(0);
    const firstUnread = tenantNotifications.items.find((item) => item.readAt === null);
    expect(firstUnread).toBeDefined();
    await tenant.post(`/notifications/${firstUnread!.id}/read`, undefined, [200, 201, 204]);
    expect((await tenant.get<UnreadCountResponse>('/notifications/unread-count')).unread).toBe(unread.unread - 1);
    await tenant.post('/notifications/read-all', undefined, [200, 201]);
    expect((await tenant.get<UnreadCountResponse>('/notifications/unread-count')).unread).toBe(0);
    // Notifications are per account.
    await expectDenied(outsider.post(`/notifications/${firstUnread!.id}/read`, undefined, [200, 201, 204]));
  });

  test('13 tenant portal reads real data; dashboard reflects the persisted ledgers', async () => {
    const invoices = await tenant.get<InvoicePageResponse>('/invoices/me?page=1&limit=20');
    expect(invoices.items.map((item) => item.id)).toEqual([world.invoice]);
    const own = await tenant.get<InvoiceResponse>(`/invoices/me/${world.invoice}`);
    expect(own.status).toBe('ISSUED');
    expect(vnd(own.adjustedTotal)).toBe(3_000_000);
    expect(vnd(own.paidTotal)).toBe(1_000_000);
    expect(own.paymentStatus).toBe('PARTIALLY_PAID');
    const payments = await tenant.get<InvoicePaymentPageResponse>(`/invoices/me/${world.invoice}/payments`);
    expect(payments.total).toBe(3);
    const adjustments = await tenant.get<InvoiceAdjustmentPageResponse>(
      `/invoices/me/${world.invoice}/adjustments`,
    );
    expect(adjustments.total).toBe(1);

    await expectDenied(outsider.get(`/invoices/me/${world.invoice}`));
    await expectDenied(outsider.get(`/invoices/me/${world.invoice}/payments`));
    await expectDenied(outsider.get(`/invoices/me/${world.invoice}/adjustments`));
    // Tenants never reach the OWNER view of the same invoice.
    await expectDenied(tenant.get(invoicePath()));

    const dashboard = await owner.get<DashboardResponse>(
      `${wsPath(world.wsA)}/dashboard?period=${period}`,
    );
    expect(dashboard.rooms).toMatchObject({ total: 2, occupied: 1, vacant: 1 });
    expect(dashboard.contracts).toMatchObject({ active: 2, inEffect: 1, upcoming: 1 });
    expect(dashboard.invoices).toMatchObject({ issued: 1, issuedInPeriod: 1, partiallyPaid: 1 });
    expect(vnd(dashboard.invoices.billedInPeriod)).toBe(3_000_000);
    expect(vnd(dashboard.revenue.collected)).toBe(1_000_000);
    expect(vnd(dashboard.receivables.outstanding)).toBe(2_000_000);
    expect(dashboard.maintenance).toMatchObject({ closed: 1, cancelled: 1 });
    await expectDenied(tenant.get(`${wsPath(world.wsA)}/dashboard`));
    await expectDenied(owner2.get(`${wsPath(world.wsA)}/dashboard`));
  });

  test('14 Platform Admin hides and restores the listing; audit trail is recorded', async () => {
    const hide = await admin.post<AdminListingResponse>(
      `/admin/listings/${world.listing}/hide`,
      { reason: `FE11 ${fixtures.runId} ẩn tin` },
      [200, 201],
    );
    expect(hide.isHidden).toBe(true);
    fixtures.record('listing-moderation', world.listing, 'hidden');
    // Restored below; the deferred action keeps the listing from staying hidden if a step fails.
    fixtures.defer(`restore-listing:${world.listing}`, async () => {
      try {
        await admin.post(
          `/admin/listings/${world.listing}/restore`,
          { reason: `FE11 ${fixtures.runId} cleanup` },
          [200, 201],
        );
      } catch (error) {
        // Already restored by the scenario itself.
        if ((error as { code?: string }).code !== 'ADMIN_STATE_UNCHANGED') throw error;
      }
      fixtures.update('listing-moderation', world.listing, 'restored');
    });

    const hidden = await admin.get<AdminListingPageResponse>(
      `/admin/listings?workspaceId=${world.wsA}&hidden=true&page=1&limit=20`,
    );
    expect(hidden.items.map((item) => item.id)).toContain(world.listing);

    const publicContext = await request.newContext({ baseURL: REAL_WEB_ORIGIN });
    contexts.push(publicContext);
    expect((await publicContext.get(`${REAL_API_PREFIX}/listings/${world.listing}`)).status()).toBe(404);
    const search = (await (
      await publicContext.get(
        `${REAL_API_PREFIX}/listings?city=${encodeURIComponent(`FE11-${sid}`)}&page=1&limit=10`,
      )
    ).json()) as PublicListingPageResponse;
    expect(search.items.map((item) => item.id)).not.toContain(world.listing);
    await expectApiError(
      tenant.post(`/listings/${world.listing}/viewing-requests`, {
        scheduledAt: isoDaysFromNow(6),
        message: 'Không được phép',
      }),
      'VIEWING_REQUEST_NOT_ELIGIBLE',
    );
    // Moderation is an admin power: the OWNER cannot undo it.
    await expectDenied(owner.post(`/admin/listings/${world.listing}/restore`, { reason: 'x' }, [200, 201]));

    const restored = await admin.post<AdminListingResponse>(
      `/admin/listings/${world.listing}/restore`,
      { reason: `FE11 ${fixtures.runId} khôi phục` },
      [200, 201],
    );
    expect(restored.isHidden).toBe(false);
    expect((await publicContext.get(`${REAL_API_PREFIX}/listings/${world.listing}`)).status()).toBe(200);

    const audit = await admin.get<AdminAuditLogPageResponse>(
      `/admin/audit-logs?targetType=LISTING&targetId=${world.listing}&page=1&limit=20`,
    );
    expect(audit.total).toBeGreaterThanOrEqual(2);
    expect(audit.items.map((item) => item.reason)).toEqual(
      expect.arrayContaining([
        `FE11 ${fixtures.runId} ẩn tin`,
        `FE11 ${fixtures.runId} khôi phục`,
      ]),
    );
  });

  test('15 multi-role: a landlord is also a tenant elsewhere; isolation both ways', async () => {
    const foreign = await owner2.post<TenantResponse>(`${wsPath(world.wsB)}/tenants`, {
      fullName: `FE11 Khách B ${sid}`,
      phone: '0911222333',
    });
    world.foreignTenantProfile = foreign.id;
    fixtures.record('tenant-profile', foreign.id, 'active');
    fixtures.defer(`archive-tenant:${foreign.id}`, async () => {
      await owner2.patch<TenantResponse>(`${wsPath(world.wsB)}/tenants/${foreign.id}/archive`, {});
      fixtures.update('tenant-profile', foreign.id, 'archived');
    });
    const invitation = await owner2.post<TenantInvitationResponse>(
      `${wsPath(world.wsB)}/tenants/${foreign.id}/invitations`,
    );
    fixtures.record('tenant-invitation', invitation.id, 'issued');
    const link = await owner.post<TenantUserLinkResponse>(
      '/tenant-invitations/accept',
      { token: invitation.token },
      [200, 201],
    );
    world.foreignLinkId = link.id;
    fixtures.record('tenant-link', link.id, 'active');
    fixtures.update('tenant-invitation', invitation.id, 'accepted-retained');
    fixtures.defer(`revoke-tenant-link:${link.id}`, async () => {
      await owner2.patch(`${wsPath(world.wsB)}/tenant-user-links/${link.id}/revoke`, {
        reason: `FE11 ${fixtures.runId} cleanup`,
      });
      fixtures.update('tenant-link', link.id, 'revoked');
    });

    const capabilities = await owner.get<UserCapabilitiesResponse>('/users/me/capabilities');
    expect(capabilities.workspaces).toContainEqual(
      expect.objectContaining({ id: world.wsA, role: 'OWNER' }),
    );
    expect(capabilities.workspaces.map((item) => item.id)).not.toContain(world.wsB);
    expect(capabilities.tenantLinks).toContainEqual(
      expect.objectContaining({ tenantId: foreign.id, workspaceId: world.wsB }),
    );

    // Tenant role in B does not grant any OWNER power in B, and A's data is not mixed into the tenant view.
    await expectDenied(owner.get(`${wsPath(world.wsB)}/tenants`));
    await expectDenied(owner.get(`${wsPath(world.wsB)}/dashboard`));
    expect((await owner.get<MyContractPageResponse>('/contracts/me?page=1&limit=20')).items).toEqual([]);
    expect((await owner.get<InvoicePageResponse>('/invoices/me?page=1&limit=20')).items).toEqual([]);
    expect((await owner.get<TenantSelfResponse[]>('/tenants/me')).map((item) => item.id)).toEqual([foreign.id]);
    await expectDenied(owner.get(`/invoices/me/${world.invoice}`));
    // The other landlord cannot reach workspace A through workspace B URLs either.
    await expectDenied(owner2.get(`${wsPath(world.wsB)}/buildings/${world.building}`));
    await expectDenied(owner2.get(`${wsPath(world.wsB)}/contracts/${world.contractNow}`));
    // The OWNER keeps full access to its own workspace while holding a tenant link.
    expect((await owner.get<DashboardResponse>(`${wsPath(world.wsA)}/dashboard`)).workspaceId).toBe(world.wsA);
  });

  /* ---- Browser (desktop): the same data through the real UI, session cookies and CSRF ---- */

  function watchApi(page: Page) {
    const failures: string[] = [];
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (!url.pathname.startsWith(REAL_API_PREFIX)) return;
      const expectedAnonymousRefresh = url.pathname.endsWith('/auth/refresh') && response.status() === 401;
      if (response.status() >= 400 && !expectedAnonymousRefresh) {
        failures.push(`${response.request().method()} ${url.pathname} -> ${response.status()}`);
      }
    });
    return { failures, pageErrors };
  }

  async function signIn(page: Page, address: string) {
    await page.goto('/login');
    await page.getByLabel(/^Email/).fill(address);
    await page.getByLabel(/^Mật khẩu/).fill(password);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  }

  test('16 UI: OWNER signs in and reads the workspace data', async ({ page }) => {
    const watch = watchApi(page);
    await signIn(page, email('owner'));
    await page.goto('/workspaces/select');
    await expect(page.getByText(`FE11 A ${sid}`).first()).toBeVisible();

    await page.goto(`/w/${world.wsA}/dashboard`);
    await expect(page.getByRole('heading', { name: 'Tổng quan', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /Báo cáo/ })).toHaveCount(0);

    for (const [route, text] of [
      ['tenants', `FE11 Khách ${sid}`],
      ['contracts', `FE11 Khách ${sid}`],
      ['rooms', `L${sid}`],
      ['viewings?status=ALL', `FE11 ${sid} xem lần 1`],
    ] as const) {
      await page.goto(`/w/${world.wsA}/${route}`);
      await expect(page.getByText(text).first(), `${route} must show ${text}`).toBeVisible();
    }
    for (const route of ['invoices', 'payments', 'deposits', 'maintenance', 'rates', 'meters', 'buildings']) {
      await page.goto(`/w/${world.wsA}/${route}`);
      await expect(page.locator('main')).toBeVisible();
    }

    // Retired Reports route keeps the workspace and never calls a Reports API.
    await page.goto(`/w/${world.wsA}/reports`);
    await expect(page).toHaveURL(new RegExp(`/w/${world.wsA}/dashboard$`));
    expect(watch.pageErrors).toEqual([]);
    expect(watch.failures).toEqual([]);
  });

  test('17 UI: the linked tenant reads contract, invoice and maintenance from the real API', async ({ page }) => {
    const watch = watchApi(page);
    await signIn(page, email('tenant'));
    await page.goto('/tenant/contracts');
    await expect(page.getByText(`O${sid}`).first()).toBeVisible();
    await page.goto(`/tenant/contracts/${world.contractNow}`);
    await expect(page.getByText(`O${sid}`).first()).toBeVisible();
    await page.goto('/tenant/invoices');
    await expect(page.locator('main')).toBeVisible();
    await page.goto(`/tenant/invoices/${world.invoice}`);
    await expect(page.locator('main')).toBeVisible();
    await page.goto('/tenant/maintenance');
    await expect(page.getByText(`FE11 ${sid} vòi nước rò`).first()).toBeVisible();
    await page.goto('/my-viewings');
    await expect(page.locator('main')).toBeVisible();
    // A tenant account never lands inside the OWNER workspace shell.
    await page.goto(`/w/${world.wsA}/dashboard`);
    await expect(page.getByRole('heading', { name: 'Tổng quan', exact: true })).toHaveCount(0);
    expect(watch.pageErrors).toEqual([]);
    // The OWNER route above is expected to be refused (403/404); everything before it must be clean.
    expect(watch.failures.filter((item) => !item.includes(`/workspaces/${world.wsA}`))).toEqual([]);
  });

  test('18 UI: Platform Admin sees the listing and the moderation audit trail', async ({ page }) => {
    const { adminEmail, adminPassword } = requireWriteEnvironment();
    const watch = watchApi(page);
    await page.goto('/login');
    await page.getByLabel(/^Email/).fill(adminEmail);
    await page.getByLabel(/^Mật khẩu/).fill(adminPassword);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    await page.goto('/admin/listings');
    await expect(page.locator('main')).toBeVisible();
    await page.goto('/admin/audit-logs');
    await expect(page.locator('main')).toBeVisible();
    expect(watch.pageErrors).toEqual([]);
    expect(watch.failures).toEqual([]);
  });
});
