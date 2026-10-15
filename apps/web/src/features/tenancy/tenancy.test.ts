import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContractResponse, TenantResponse, VehicleResponse } from '@rental/shared';

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
const session = vi.hoisted(() => ({ record: null as unknown }));

vi.mock('@/services/http/httpClient', () => ({ httpClient: http }));
vi.mock('@/mocks/mockUtils', () => ({ simulate: async () => ({ empty: false }), notFound: () => { throw new Error('nf'); } }));
vi.mock('@/mocks/handlers/auth.mock', () => ({ requireSession: () => session.record, currentMockUser: () => null }));

import { ApiError } from '@/services/http/ApiError';
import { db } from '@/mocks/db';
import { tenancyMock } from '@/mocks/handlers/tenancy.mock';
import { tenancyHttp } from './api';
import { VEHICLE_TYPE_OPTIONS, tenancyErrorMessage, vehicleTypeLabel } from './labels';
import {
  canEditContract,
  diffContract,
  diffTenant,
  diffVehicle,
  normalizePhone,
  normalizePlate,
  overlappingContracts,
  rentFormValue,
  toAccountLink,
  toContract,
  toInvitation,
  toContractBody,
  toTenant,
  toTenantBody,
  toVehicleBody,
} from './mappers';
import { contractSchema, tenantSchema, vehicleSchema } from './schemas';

const WS = '11111111-1111-4111-8111-111111111111';
const ROOM = '22222222-2222-4222-8222-222222222222';
const BLD = '33333333-3333-4333-8333-333333333333';
const TEN = '44444444-4444-4444-8444-444444444444';

const tenantDto = (o: Partial<TenantResponse> = {}): TenantResponse => ({
  id: TEN,
  workspaceId: WS,
  fullName: 'Nguyễn Văn A',
  phone: '0901234567',
  email: null,
  dateOfBirth: null,
  address: null,
  notes: null,
  status: 'ACTIVE',
  archivedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...o,
});
const contractDto = (o: Partial<ContractResponse> = {}): ContractResponse => ({
  id: 'ctr-1',
  workspaceId: WS,
  roomId: ROOM,
  tenantId: TEN,
  startDate: '2026-10-01',
  endDate: '2027-09-30',
  monthlyRent: '3500000.50',
  status: 'ACTIVE',
  phase: 'IN_EFFECT',
  notes: null,
  endedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  room: { id: ROOM, code: 'A-101', buildingId: BLD },
  tenant: { id: TEN, fullName: 'Nguyễn Văn A' },
  ...o,
});
const vehicleDto = (o: Partial<VehicleResponse> = {}): VehicleResponse => ({
  id: 'veh-1',
  workspaceId: WS,
  tenantId: TEN,
  licensePlate: '59A112345',
  vehicleType: 'MOTORBIKE',
  brand: null,
  model: null,
  color: null,
  notes: null,
  status: 'ACTIVE',
  inactiveAt: null,
  inactiveReason: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  tenant: { id: TEN, fullName: 'Nguyễn Văn A' },
  ...o,
});

beforeEach(() => Object.values(http).forEach((f) => f.mockReset()));

describe('mappers', () => {
  it('maps nulls to undefined and keeps backend strings', () => {
    const t = toTenant(tenantDto());
    expect(t).toMatchObject({ fullName: 'Nguyễn Văn A', phone: '0901234567', status: 'ACTIVE' });
    expect(t.email).toBeUndefined();
    const c = toContract(contractDto(), new Map([[BLD, 'Tòa An Bình']]));
    expect(c).toMatchObject({ roomCode: 'A-101', buildingName: 'Tòa An Bình', monthlyRent: '3500000.50', tenantName: 'Nguyễn Văn A' });
    expect(toContract(contractDto()).buildingName).toBeUndefined();
  });

  it('normalizes phone and plate like the backend', () => {
    expect(normalizePhone('0901 234.567')).toBe('0901234567');
    expect(normalizePhone('+84 901-234-567')).toBe('+84901234567');
    expect(normalizePlate('59-a1 123.45')).toBe('59A112345');
  });

  it('create bodies drop empty optional fields', () => {
    expect(toTenantBody({ fullName: ' A ', phone: '', email: '', dateOfBirth: '', address: '', notes: '' })).toEqual({ fullName: 'A' });
    expect(toTenantBody({ fullName: 'A', phone: '0901 234 567', notes: 'ghi chú' })).toEqual({ fullName: 'A', phone: '0901234567', notes: 'ghi chú' });
    expect(toContractBody({ roomId: ROOM, tenantId: TEN, startDate: '2026-10-01', endDate: '2027-01-01', monthlyRent: '3500000', notes: '' })).toEqual({
      roomId: ROOM,
      tenantId: TEN,
      startDate: '2026-10-01',
      endDate: '2027-01-01',
      monthlyRent: '3500000',
    });
    expect(toVehicleBody({ tenantId: TEN, licensePlate: '59-a1 123.45', vehicleType: ' MOTORBIKE ', brand: '', model: 'Vision' })).toEqual({
      tenantId: TEN,
      licensePlate: '59A112345',
      vehicleType: 'MOTORBIKE',
      model: 'Vision',
    });
  });

  it('tenant diff sends only changes and clears optional values with null', () => {
    const cur = toTenant(tenantDto({ email: 'a@b.vn', address: 'HN' }));
    const base = { fullName: 'Nguyễn Văn A', phone: '0901 234 567', email: 'a@b.vn', dateOfBirth: '', address: 'HN', notes: '' };
    expect(diffTenant(cur, base)).toEqual({});
    expect(diffTenant(cur, { ...base, email: '', address: 'HCM' })).toEqual({ email: null, address: 'HCM' });
    expect(diffTenant(cur, { ...base, fullName: 'B' })).toEqual({ fullName: 'B' });
  });

  it('contract diff never rounds the existing rent and ignores room/tenant', () => {
    const cur = toContract(contractDto());
    const same = { startDate: '2026-10-01', endDate: '2027-09-30', monthlyRent: '3500000.50', notes: '' };
    expect(diffContract(cur, same)).toEqual({});
    expect(diffContract(cur, { ...same, monthlyRent: '3500000.5' })).toEqual({});
    expect(diffContract(cur, { ...same, monthlyRent: '4000000' })).toEqual({ monthlyRent: '4000000' });
    expect(diffContract(cur, { ...same, endDate: '2027-12-31', notes: 'x' })).toEqual({ endDate: '2027-12-31', notes: 'x' });
  });

  it('vehicle diff normalizes the plate and sends null to clear', () => {
    const cur = { ...(tenancyVehicle()), brand: 'Honda' };
    expect(diffVehicle(cur, { licensePlate: '59-a1 123.45', vehicleType: 'MOTORBIKE', brand: 'Honda' })).toEqual({});
    expect(diffVehicle(cur, { licensePlate: '59A199999', vehicleType: 'CAR', brand: '' })).toEqual({ licensePlate: '59A199999', vehicleType: 'CAR', brand: null });
  });

  it('warns only about overlapping ACTIVE contracts of the same room (inclusive dates)', () => {
    const list = [
      { id: 'a', roomId: ROOM, startDate: '2026-01-01', endDate: '2026-12-31', status: 'ACTIVE' as const },
      { id: 'b', roomId: ROOM, startDate: '2025-01-01', endDate: '2025-12-31', status: 'ENDED' as const },
      { id: 'c', roomId: 'other', startDate: '2026-01-01', endDate: '2026-12-31', status: 'ACTIVE' as const },
    ];
    expect(overlappingContracts(list, { roomId: ROOM, startDate: '2026-12-31', endDate: '2027-06-30' }).map((x) => x.id)).toEqual(['a']);
    expect(overlappingContracts(list, { id: 'a', roomId: ROOM, startDate: '2026-12-31', endDate: '2027-06-30' })).toEqual([]);
    expect(overlappingContracts(list, { roomId: ROOM, startDate: '2027-01-01', endDate: '2027-06-30' })).toEqual([]);
  });
});

function tenancyVehicle() {
  return {
    id: 'veh-1',
    workspaceId: WS,
    tenantId: TEN,
    tenantName: 'A',
    licensePlate: '59A112345',
    vehicleType: 'MOTORBIKE',
    status: 'ACTIVE' as const,
    createdAt: '',
  };
}

describe('validation', () => {
  it('tenant: only full name is required; phone/email/length follow the DTO', () => {
    const base = { fullName: 'A', phone: '', email: '', dateOfBirth: '', address: '', notes: '' };
    expect(tenantSchema.safeParse(base).success).toBe(true);
    expect(tenantSchema.safeParse({ ...base, fullName: '' }).success).toBe(false);
    expect(tenantSchema.safeParse({ ...base, phone: '0901 234 567' }).success).toBe(true);
    expect(tenantSchema.safeParse({ ...base, phone: '123' }).success).toBe(false);
    expect(tenantSchema.safeParse({ ...base, email: 'x' }).success).toBe(false);
    expect(tenantSchema.safeParse({ ...base, address: 'x'.repeat(501) }).success).toBe(false);
  });

  it('contract: dates, non-negative integer rent, end >= start', () => {
    const base = { roomId: ROOM, tenantId: TEN, startDate: '2026-10-01', endDate: '2027-09-30', monthlyRent: 3_500_000, notes: '' };
    expect(contractSchema.safeParse(base).success).toBe(true);
    expect(contractSchema.safeParse({ ...base, endDate: '2026-09-30' }).success).toBe(false);
    expect(contractSchema.safeParse({ ...base, monthlyRent: -1 }).success).toBe(false);
    expect(contractSchema.safeParse({ ...base, monthlyRent: 1.5 }).success).toBe(false);
    expect(contractSchema.safeParse({ ...base, roomId: '' }).success).toBe(false);
    expect('deposit' in contractSchema.parse(base)).toBe(false);
  });

  it('vehicle: plate 5–15 letters/digits after normalization; stored legacy types still validate', () => {
    const base = { tenantId: TEN, vehicleType: 'MOTORBIKE', licensePlate: '59-A1 123.45', brand: '', model: '', color: '', notes: '' };
    expect(vehicleSchema.safeParse(base).success).toBe(true);
    expect(vehicleSchema.safeParse({ ...base, licensePlate: '59A' }).success).toBe(false);
    expect(vehicleSchema.safeParse({ ...base, vehicleType: 'Xe ba gác' }).success).toBe(true);
    expect('monthlyFee' in vehicleSchema.parse(base)).toBe(false);
  });
});

describe('HTTP adapter', () => {
  it('lists tenants across pages with the status filter', async () => {
    http.get
      .mockResolvedValueOnce({ items: [tenantDto({ id: 'a' })], page: 1, limit: 50, total: 2 })
      .mockResolvedValueOnce({ items: [tenantDto({ id: 'b' })], page: 2, limit: 50, total: 2 });
    const list = await tenancyHttp.listTenants(WS, { status: 'ACTIVE' });
    expect(list.map((t) => t.id)).toEqual(['a', 'b']);
    expect(http.get).toHaveBeenNthCalledWith(1, `/workspaces/${WS}/tenants`, { query: { status: 'ACTIVE', page: 1, limit: 50 } });
    expect(http.get).toHaveBeenNthCalledWith(2, `/workspaces/${WS}/tenants`, { query: { status: 'ACTIVE', page: 2, limit: 50 } });
  });

  it('creates, patches, archives and restores a tenant', async () => {
    http.post.mockResolvedValue(tenantDto());
    http.patch.mockResolvedValue(tenantDto());
    await tenancyHttp.createTenant(WS, { fullName: 'A' });
    expect(http.post).toHaveBeenCalledWith(`/workspaces/${WS}/tenants`, { fullName: 'A' });
    await tenancyHttp.updateTenant(WS, TEN, { email: null });
    expect(http.patch).toHaveBeenLastCalledWith(`/workspaces/${WS}/tenants/${TEN}`, { email: null });
    await tenancyHttp.archiveTenant(WS, TEN);
    expect(http.patch).toHaveBeenLastCalledWith(`/workspaces/${WS}/tenants/${TEN}/archive`);
    await tenancyHttp.restoreTenant(WS, TEN);
    expect(http.patch).toHaveBeenLastCalledWith(`/workspaces/${WS}/tenants/${TEN}/restore`);
  });

  it('link requests: list pending, approve and reject by request id', async () => {
    http.get.mockResolvedValue({
      items: [
        {
          id: 'lr1', workspaceId: WS, tenantId: TEN, requesterUserId: 'u', status: 'PENDING', message: 'hi', decisionNote: null, decidedAt: null,
          createdAt: '', updatedAt: '', tenant: { id: TEN, fullName: 'A' }, requester: { id: 'u', email: 'u@b.vn', displayName: null },
        },
      ],
      page: 1, limit: 50, total: 1,
    });
    const list = await tenancyHttp.listLinkRequests(WS, { status: 'PENDING' });
    expect(list[0]).toMatchObject({ id: 'lr1', tenantId: TEN, requesterEmail: 'u@b.vn', message: 'hi' });
    expect(http.get).toHaveBeenCalledWith(`/workspaces/${WS}/tenant-link-requests`, { query: { status: 'PENDING', page: 1, limit: 50 } });
    http.patch.mockResolvedValue({});
    await tenancyHttp.decideLinkRequest(WS, 'lr1', true);
    expect(http.patch).toHaveBeenLastCalledWith(`/workspaces/${WS}/tenant-link-requests/lr1/approve`, {});
    await tenancyHttp.decideLinkRequest(WS, 'lr1', false, 'không khớp');
    expect(http.patch).toHaveBeenLastCalledWith(`/workspaces/${WS}/tenant-link-requests/lr1/reject`, { note: 'không khớp' });
  });

  it('contracts: list joins building names; create/update/end use the real endpoints and exact money strings', async () => {
    http.get.mockImplementation(async (url: string) => {
      if (url.endsWith('/buildings')) return [{ id: BLD, name: 'Tòa An Bình' }];
      return { items: [contractDto()], page: 1, limit: 50, total: 1 };
    });
    const list = await tenancyHttp.listContracts(WS, { status: 'ACTIVE' });
    expect(list[0]).toMatchObject({ buildingName: 'Tòa An Bình', monthlyRent: '3500000.50' });
    http.post.mockResolvedValue(contractDto());
    http.patch.mockResolvedValue(contractDto());
    await tenancyHttp.createContract(WS, { roomId: ROOM, tenantId: TEN, startDate: '2026-10-01', endDate: '2027-01-01', monthlyRent: '3500000' });
    expect(http.post).toHaveBeenCalledWith(`/workspaces/${WS}/contracts`, {
      roomId: ROOM, tenantId: TEN, startDate: '2026-10-01', endDate: '2027-01-01', monthlyRent: '3500000',
    });
    await tenancyHttp.updateContract(WS, 'ctr-1', { monthlyRent: '4000000' });
    expect(http.patch).toHaveBeenLastCalledWith(`/workspaces/${WS}/contracts/ctr-1`, { monthlyRent: '4000000' });
    await tenancyHttp.endContract(WS, 'ctr-1', '2026-10-15');
    expect(http.patch).toHaveBeenLastCalledWith(`/workspaces/${WS}/contracts/ctr-1/end`, { endDate: '2026-10-15' });
    // cancel a contract that has not started: no endDate in the body
    await tenancyHttp.endContract(WS, 'ctr-1');
    expect(http.patch).toHaveBeenLastCalledWith(`/workspaces/${WS}/contracts/ctr-1/end`, {});
  });

  it('vehicles: create, patch and stop (no delete)', async () => {
    http.post.mockResolvedValue(vehicleDto());
    http.patch.mockResolvedValue(vehicleDto({ status: 'INACTIVE' }));
    await tenancyHttp.createVehicle(WS, { tenantId: TEN, licensePlate: '59-a1 123.45', vehicleType: 'MOTORBIKE' });
    expect(http.post).toHaveBeenCalledWith(`/workspaces/${WS}/vehicles`, { tenantId: TEN, licensePlate: '59A112345', vehicleType: 'MOTORBIKE' });
    await tenancyHttp.updateVehicle(WS, 'veh-1', { brand: null });
    expect(http.patch).toHaveBeenLastCalledWith(`/workspaces/${WS}/vehicles/veh-1`, { brand: null });
    const stopped = await tenancyHttp.stopVehicle(WS, 'veh-1', 'bán xe');
    expect(http.patch).toHaveBeenLastCalledWith(`/workspaces/${WS}/vehicles/veh-1/stop`, { reason: 'bán xe' });
    expect(stopped.status).toBe('INACTIVE');
  });
});

describe('labels', () => {
  it('maps backend codes to Vietnamese; unknown vehicle types are shown verbatim', () => {
    const err = (statusCode: number, code?: string) => new ApiError({ statusCode, code, message: 'raw' });
    expect(tenancyErrorMessage(err(409, 'CONTRACT_CONFLICT'))).toMatch(/trùng thời gian/);
    expect(tenancyErrorMessage(err(409, 'TENANT_HAS_ACTIVE_CONTRACT'))).toMatch(/hợp đồng chưa kết thúc/);
    expect(tenancyErrorMessage(err(409, 'VEHICLE_ALREADY_EXISTS'))).toMatch(/Biển số/);
    expect(tenancyErrorMessage(err(401))).toMatch(/đăng nhập lại/);
    expect(tenancyErrorMessage(err(500, 'X'))).toBe('raw');
    expect(vehicleTypeLabel('MOTORBIKE')).toBe('Xe máy');
    expect(vehicleTypeLabel('Xe ba gác')).toBe('Xe ba gác');
  });
});

describe('mock adapter follows the V1 rules', () => {
  const ws = db.tenants[0]!.workspaceId;
  const as = (role: string) => {
    session.record = {
      user: { id: 'u1', fullName: 'Chủ trọ', email: 'o@x.vn' },
      memberships: [{ workspaceId: ws, role, status: 'ACTIVE', name: 'WS' }],
    };
  };

  it('OWNER can list; MANAGER/STAFF are rejected', async () => {
    as('OWNER');
    expect((await tenancyMock.listTenants(ws)).length).toBeGreaterThan(0);
    for (const role of ['MANAGER', 'STAFF']) {
      as(role);
      await expect(tenancyMock.listTenants(ws)).rejects.toBeInstanceOf(ApiError);
      await expect(tenancyMock.listContracts(ws)).rejects.toBeInstanceOf(ApiError);
      await expect(tenancyMock.listVehicles(ws)).rejects.toBeInstanceOf(ApiError);
    }
  });

  it('contracts are only ACTIVE/ENDED (no drafts); a period that already ended is refused', async () => {
    as('OWNER');
    const list = await tenancyMock.listContracts(ws);
    expect(list.every((c) => c.status === 'ACTIVE' || c.status === 'ENDED')).toBe(true);
    expect(list.some((c) => c.id === 'ctr-draft')).toBe(false);
    const vacant = db.rooms.find((r) => r.workspaceId === ws && r.operationalStatus === 'VACANT')!;
    const tenant = (await tenancyMock.listTenants(ws, { status: 'ACTIVE' })).find((t) => !list.some((c) => c.tenantId === t.id && c.status === 'ACTIVE'))!;
    const day = (offset: number) => new Date(Date.now() + offset * 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);
    await expect(
      tenancyMock.createContract(ws, { roomId: vacant.id, tenantId: tenant.id, startDate: day(-200), endDate: day(-1), monthlyRent: '3000000' }),
    ).rejects.toMatchObject({ code: 'CONTRACT_NOT_ELIGIBLE' });
    const created = await tenancyMock.createContract(ws, { roomId: vacant.id, tenantId: tenant.id, startDate: day(0), endDate: day(100), monthlyRent: '3000000' });
    expect(created.status).toBe('ACTIVE');
    expect(db.rooms.find((r) => r.id === vacant.id)!.operationalStatus).toBe('OCCUPIED');
    await expect(
      tenancyMock.createContract(ws, { roomId: vacant.id, tenantId: tenant.id, startDate: day(0), endDate: day(100), monthlyRent: '3000000' }),
    ).rejects.toMatchObject({ code: 'CONTRACT_CONFLICT' });
    await expect(tenancyMock.archiveTenant(ws, tenant.id)).rejects.toMatchObject({ code: 'TENANT_HAS_ACTIVE_CONTRACT' });
    const ended = await tenancyMock.endContract(ws, created.id, day(0));
    expect(ended.status).toBe('ENDED');
    expect(db.rooms.find((r) => r.id === vacant.id)!.operationalStatus).toBe('VACANT');
    await expect(tenancyMock.updateContract(ws, created.id, { notes: 'x' })).rejects.toMatchObject({ code: 'CONTRACT_INVALID_TRANSITION' });
    await expect(tenancyMock.endContract(ws, created.id, day(0))).rejects.toMatchObject({ code: 'CONTRACT_INVALID_TRANSITION' });
  });

  it('vehicles: unique plate even after stop, stop is idempotent and blocks edits', async () => {
    as('OWNER');
    const tenant = (await tenancyMock.listTenants(ws, { status: 'ACTIVE' }))[0]!;
    const v = await tenancyMock.createVehicle(ws, { tenantId: tenant.id, licensePlate: '77-zz 999.88', vehicleType: 'MOTORBIKE' });
    expect(v.licensePlate).toBe('77ZZ99988');
    await expect(tenancyMock.createVehicle(ws, { tenantId: tenant.id, licensePlate: '77ZZ99988', vehicleType: 'CAR' })).rejects.toMatchObject({ code: 'VEHICLE_ALREADY_EXISTS' });
    expect((await tenancyMock.stopVehicle(ws, v.id, 'bán xe')).status).toBe('INACTIVE');
    expect((await tenancyMock.stopVehicle(ws, v.id)).status).toBe('INACTIVE');
    await expect(tenancyMock.updateVehicle(ws, v.id, { brand: 'x' })).rejects.toMatchObject({ code: 'VEHICLE_INACTIVE' });
    await expect(tenancyMock.createVehicle(ws, { tenantId: tenant.id, licensePlate: '77ZZ99988', vehicleType: 'CAR' })).rejects.toMatchObject({ code: 'VEHICLE_ALREADY_EXISTS' });
  });
});

describe('FE-05.1: tenant account links, invitations, extra fields', () => {
  const linkDto = {
    id: 'link-1', workspaceId: WS, tenantId: TEN, userId: 'u1', linkedAt: '2026-10-02T00:00:00.000Z', revokedAt: null,
    user: { id: 'u1', email: 'u1@x.vn', displayName: 'Người Thuê' },
  };

  it('reads the ACTIVE link of a tenant and keeps the id needed to revoke it', async () => {
    http.get.mockResolvedValue([linkDto]);
    const links = await tenancyHttp.listActiveLinks(WS, TEN);
    expect(http.get).toHaveBeenCalledWith(`/workspaces/${WS}/tenants/${TEN}/user-links`);
    expect(links).toEqual([{ id: 'link-1', tenantId: TEN, userId: 'u1', userEmail: 'u1@x.vn', userName: 'Người Thuê', linkedAt: '2026-10-02T00:00:00.000Z' }]);
    expect(toAccountLink({ ...linkDto, user: { ...linkDto.user, displayName: null } }).userName).toBeUndefined();
  });

  it('revokes by link id with an optional reason', async () => {
    http.patch.mockResolvedValue({});
    await tenancyHttp.revokeLink(WS, 'link-1');
    expect(http.patch).toHaveBeenLastCalledWith(`/workspaces/${WS}/tenant-user-links/link-1/revoke`, {});
    await tenancyHttp.revokeLink(WS, 'link-1', 'chuyển đi');
    expect(http.patch).toHaveBeenLastCalledWith(`/workspaces/${WS}/tenant-user-links/link-1/revoke`, { reason: 'chuyển đi' });
  });

  it('creates an invitation with POST and returns the one-time token (no body sent)', async () => {
    http.post.mockResolvedValue({ id: 'inv', tenantId: TEN, workspaceId: WS, token: 'T'.repeat(43), expiresAt: '2026-10-22T00:00:00.000Z', acceptedAt: null, createdAt: '' });
    const inv = await tenancyHttp.createInvitation(WS, TEN);
    expect(http.post).toHaveBeenCalledWith(`/workspaces/${WS}/tenants/${TEN}/invitations`);
    expect(inv).toEqual({ token: 'T'.repeat(43), expiresAt: '2026-10-22T00:00:00.000Z' });
    expect(() => toInvitation({ expiresAt: 'x' })).toThrow(TypeError);
  });

  it('link request decision carries the optional note', async () => {
    http.patch.mockResolvedValue({});
    await tenancyHttp.decideLinkRequest(WS, 'lr1', false, 'sai hồ sơ');
    expect(http.patch).toHaveBeenLastCalledWith(`/workspaces/${WS}/tenant-link-requests/lr1/reject`, { note: 'sai hồ sơ' });
  });

  it('vehicle: model, color and notes are validated, sent on create and diffed on edit', () => {
    const base = { tenantId: TEN, vehicleType: 'MOTORBIKE', licensePlate: '59A112345', brand: '', model: '', color: '', notes: '' };
    expect(vehicleSchema.safeParse(base).success).toBe(true);
    expect(vehicleSchema.safeParse({ ...base, model: 'x'.repeat(101) }).success).toBe(false);
    expect(vehicleSchema.safeParse({ ...base, color: 'x'.repeat(51) }).success).toBe(false);
    expect(vehicleSchema.safeParse({ ...base, notes: 'x'.repeat(5001) }).success).toBe(false);
    expect(toVehicleBody({ ...base, model: 'Vision', color: 'Đỏ', notes: 'ghi chú' })).toEqual({
      tenantId: TEN, licensePlate: '59A112345', vehicleType: 'MOTORBIKE', model: 'Vision', color: 'Đỏ', notes: 'ghi chú',
    });
    const cur = { ...tenancyVehicle(), model: 'Vision', color: 'Đỏ' };
    expect(diffVehicle(cur, { licensePlate: '59A112345', vehicleType: 'MOTORBIKE', model: 'Vision', color: 'Đỏ', notes: '' })).toEqual({});
    expect(diffVehicle(cur, { licensePlate: '59A112345', vehicleType: 'MOTORBIKE', model: 'Vision', color: '', notes: 'mới' })).toEqual({ color: null, notes: 'mới' });
  });

  it('only the 4 approved vehicle types are offered; unknown legacy values are shown verbatim', () => {
    expect(Object.keys(VEHICLE_TYPE_OPTIONS)).toEqual(['MOTORBIKE', 'EBIKE', 'BICYCLE', 'CAR']);
    expect(vehicleTypeLabel('Xe ba gác')).toBe('Xe ba gác');
  });

  it('date of birth cannot be in the future (same rule as the backend)', () => {
    const base = { fullName: 'A', phone: '', email: '', dateOfBirth: '', address: '', notes: '' };
    const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    expect(tenantSchema.safeParse({ ...base, dateOfBirth: tomorrow }).success).toBe(false);
    expect(tenantSchema.safeParse({ ...base, dateOfBirth: '1995-05-20' }).success).toBe(true);
  });

  it('contract rent keeps decimals: fractional rents stay strings, whole VND become numbers, and both validate', () => {
    expect(rentFormValue('3500000.00')).toBe(3500000);
    expect(rentFormValue('3500000')).toBe(3500000);
    expect(rentFormValue('3500000.50')).toBe('3500000.50');
    const base = { roomId: ROOM, tenantId: TEN, startDate: '2026-10-01', endDate: '2027-09-30', notes: '' };
    expect(contractSchema.safeParse({ ...base, monthlyRent: '3500000.50' }).success).toBe(true);
    expect(contractSchema.safeParse({ ...base, monthlyRent: '3500000.555' }).success).toBe(false);
    expect(contractSchema.safeParse({ ...base, monthlyRent: 1.5 }).success).toBe(false);
    expect(contractSchema.safeParse({ ...base, monthlyRent: undefined }).success).toBe(false);
    // sửa ghi chú mà không đụng tiền: không gửi monthlyRent nên không làm tròn phần lẻ
    const cur = toContract(contractDto());
    expect(diffContract(cur, { startDate: cur.startDate, endDate: cur.endDate, monthlyRent: String(rentFormValue(cur.monthlyRent)), notes: 'x' })).toEqual({ notes: 'x' });
  });

  it('mock: invitation token is one-shot data, revoke removes the link and frees the tenant', async () => {
    session.record = { user: { id: 'u1', fullName: 'Chủ', email: 'o@x.vn' }, memberships: [{ workspaceId: db.tenants[0]!.workspaceId, role: 'OWNER', status: 'ACTIVE', name: 'WS' }] };
    const ws = db.tenants[0]!.workspaceId;
    const linked = db.tenants[0]!;
    const links = await tenancyMock.listActiveLinks(ws, linked.id);
    expect(links).toHaveLength(1);
    await expect(tenancyMock.createInvitation(ws, linked.id)).rejects.toMatchObject({ code: 'TENANT_INVITATION_CONFLICT' });
    await tenancyMock.revokeLink(ws, links[0]!.id);
    expect(await tenancyMock.listActiveLinks(ws, linked.id)).toEqual([]);
    const inv = await tenancyMock.createInvitation(ws, linked.id);
    expect(inv.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await expect(tenancyMock.revokeLink(ws, links[0]!.id)).rejects.toMatchObject({ code: 'TENANT_LINK_NOT_FOUND' });
  });
});

describe('BE-CONTRACT-DATES-02: date-based contracts in the web layer', () => {
  it('only contracts the backend can still edit offer the edit action; OVERDUE keeps just "end"', () => {
    expect(canEditContract({ status: 'ACTIVE', phase: 'UPCOMING' })).toBe(true);
    expect(canEditContract({ status: 'ACTIVE', phase: 'IN_EFFECT' })).toBe(true);
    expect(canEditContract({ status: 'ACTIVE', phase: 'OVERDUE' })).toBe(false);
    expect(canEditContract({ status: 'ENDED', phase: 'ENDED' })).toBe(false);
    expect(canEditContract({ status: 'ENDED', phase: 'CANCELLED' })).toBe(false);
  });

  it('mock agrees with the backend: an overdue contract cannot be edited but can be ended', async () => {
    session.record = { user: { id: 'u1', fullName: 'Chủ', email: 'o@x.vn' }, memberships: [{ workspaceId: db.tenants[0]!.workspaceId, role: 'OWNER', status: 'ACTIVE', name: 'WS' }] };
    const ws = db.tenants[0]!.workspaceId;
    const day = (offset: number) => new Date(Date.now() + offset * 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);
    const base = db.contracts.find((c) => c.workspaceId === ws && c.status === 'ACTIVE')!;
    db.contracts.push({ ...base, id: 'ctr-overdue-test', roomId: 'room-overdue-test', startDate: day(-90), endDate: day(-1) });
    const overdue = await tenancyMock.getContract(ws, 'ctr-overdue-test');
    expect(overdue.phase).toBe('OVERDUE');
    await expect(tenancyMock.updateContract(ws, overdue.id, { notes: 'x' })).rejects.toMatchObject({ code: 'CONTRACT_NOT_ELIGIBLE' });
    expect((await tenancyMock.endContract(ws, overdue.id, day(-1))).phase).toBe('ENDED');
  });

  it('uses the phase computed by the backend and falls back to the dates for an older response', () => {
    expect(toContract(contractDto({ phase: 'UPCOMING' })).phase).toBe('UPCOMING');
    const legacy = { ...contractDto({ startDate: '2999-01-01', endDate: '2999-12-31' }) } as Partial<ContractResponse>;
    delete legacy.phase;
    expect(toContract(legacy as ContractResponse).phase).toBe('UPCOMING');
    expect(toContract({ ...legacy, startDate: '2000-01-01', endDate: '2000-12-31' } as ContractResponse).phase).toBe('OVERDUE');
  });

  it('the form accepts a start date in the future (only end >= start is enforced client side)', () => {
    const base = { roomId: ROOM, tenantId: TEN, startDate: '2999-01-01', endDate: '2999-12-31', monthlyRent: 3_500_000, notes: '' };
    expect(contractSchema.safeParse(base).success).toBe(true);
    expect(contractSchema.safeParse({ ...base, endDate: '2998-12-31' }).success).toBe(false);
  });

  it('only warns about overlap with contracts that are not ended, boundaries inclusive', () => {
    const existing = [{ id: 'a', roomId: ROOM, startDate: '2026-11-01', endDate: '2026-11-30', status: 'ACTIVE' as const }];
    expect(overlappingContracts(existing, { roomId: ROOM, startDate: '2026-11-30', endDate: '2027-01-31' })).toHaveLength(1);
    expect(overlappingContracts(existing, { roomId: ROOM, startDate: '2026-12-01', endDate: '2027-01-31' })).toHaveLength(0);
    expect(overlappingContracts(existing, { roomId: ROOM, startDate: '2026-10-01', endDate: '2026-10-31' })).toHaveLength(0);
  });
});

describe('BE-CONTRACT-DATES-02: mock follows the backend rules', () => {
  const ws = db.tenants[0]!.workspaceId;
  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);
  const room = () => db.rooms.find((r) => r.workspaceId === ws && r.operationalStatus === 'VACANT')!;
  const status = (id: string) => db.rooms.find((r) => r.id === id)!.operationalStatus;
  const tenantFor = async (skip = 0) => {
    const contracts = await tenancyMock.listContracts(ws);
    return (await tenancyMock.listTenants(ws, { status: 'ACTIVE' })).filter((t) => !contracts.some((c) => c.tenantId === t.id && c.status === 'ACTIVE'))[skip]!;
  };
  const as = () => {
    session.record = { user: { id: 'u1', fullName: 'Chủ trọ', email: 'o@x.vn' }, memberships: [{ workspaceId: ws, role: 'OWNER', status: 'ACTIVE', name: 'WS' }] };
  };
  const body = (roomId: string, tenantId: string, start: number, end: number) => ({ roomId, tenantId, startDate: day(start), endDate: day(end), monthlyRent: '3000000' });

  it('a future contract only reserves its period: ACTIVE / UPCOMING, the room is NOT occupied', async () => {
    as();
    const r = room();
    const t = await tenantFor();
    const c = await tenancyMock.createContract(ws, body(r.id, t.id, 10, 100));
    expect(c).toMatchObject({ status: 'ACTIVE', phase: 'UPCOMING' });
    expect(status(r.id)).toBe('VACANT');
    expect((await tenancyMock.listContracts(ws)).find((x) => x.id === c.id)!.phase).toBe('UPCOMING');
    // the tenant is not "in" yet but still cannot be archived while the contract is open
    await expect(tenancyMock.archiveTenant(ws, t.id)).rejects.toMatchObject({ code: 'TENANT_HAS_ACTIVE_CONTRACT' });
    await tenancyMock.endContract(ws, c.id); // cleanup (cancel)
  });

  it('chains a follow-up on an occupied room; overlap is refused with both ends inclusive', async () => {
    as();
    const r = room();
    const [t1, t2] = [await tenantFor(0), await tenantFor(1)];
    const current = await tenancyMock.createContract(ws, body(r.id, t1.id, 0, 30));
    expect(current.phase).toBe('IN_EFFECT');
    expect(status(r.id)).toBe('OCCUPIED');
    await expect(tenancyMock.createContract(ws, body(r.id, t2.id, 30, 90))).rejects.toMatchObject({ code: 'CONTRACT_CONFLICT' }); // shares the last day
    const next = await tenancyMock.createContract(ws, body(r.id, t2.id, 31, 90)); // starts the day after
    expect(next.phase).toBe('UPCOMING');
    expect(status(r.id)).toBe('OCCUPIED');
    await expect(tenancyMock.createContract(ws, body(r.id, t2.id, 60, 120))).rejects.toMatchObject({ code: 'CONTRACT_CONFLICT' });
    // ending the current contract frees the room (the follow-up has not started), the reservation stays
    await tenancyMock.endContract(ws, current.id, day(0));
    expect(status(r.id)).toBe('VACANT');
    expect((await tenancyMock.getContract(ws, next.id)).phase).toBe('UPCOMING');
    await tenancyMock.endContract(ws, next.id);
  });

  it('cancels a contract that has not started: ENDED, registered period kept, room and other contracts untouched', async () => {
    as();
    const r = room();
    const t = await tenantFor();
    const c = await tenancyMock.createContract(ws, body(r.id, t.id, 20, 200));
    await expect(tenancyMock.endContract(ws, c.id, day(20))).rejects.toMatchObject({ code: 'CONTRACT_NOT_ELIGIBLE' }); // no fake end date
    const cancelled = await tenancyMock.endContract(ws, c.id);
    expect(cancelled).toMatchObject({ status: 'ENDED', phase: 'CANCELLED', startDate: day(20), endDate: day(200) });
    expect(cancelled.endedAt).toBeTruthy();
    expect(status(r.id)).toBe('VACANT');
    await expect(tenancyMock.endContract(ws, c.id)).rejects.toMatchObject({ code: 'CONTRACT_INVALID_TRANSITION' });
    // the period is free again
    const again = await tenancyMock.createContract(ws, body(r.id, t.id, 20, 200));
    await tenancyMock.endContract(ws, again.id);
  });

  it('a started contract needs its effective end date and cannot be moved into the future', async () => {
    as();
    const r = room();
    const t = await tenantFor();
    const c = await tenancyMock.createContract(ws, body(r.id, t.id, -5, 60));
    await expect(tenancyMock.endContract(ws, c.id)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(tenancyMock.updateContract(ws, c.id, { startDate: day(3) })).rejects.toMatchObject({ code: 'CONTRACT_NOT_ELIGIBLE' });
    await tenancyMock.endContract(ws, c.id, day(0));
    expect(status(r.id)).toBe('VACANT');
  });

  it('a future contract can be edited, and becomes occupying once its start is moved to today', async () => {
    as();
    const r = room();
    const t = await tenantFor();
    const c = await tenancyMock.createContract(ws, body(r.id, t.id, 10, 60));
    const moved = await tenancyMock.updateContract(ws, c.id, { startDate: day(15) });
    expect(moved.phase).toBe('UPCOMING');
    expect(status(r.id)).toBe('VACANT');
    const started = await tenancyMock.updateContract(ws, c.id, { startDate: day(0) });
    expect(started.phase).toBe('IN_EFFECT');
    expect(status(r.id)).toBe('OCCUPIED');
    await tenancyMock.endContract(ws, c.id, day(0));
  });
});
