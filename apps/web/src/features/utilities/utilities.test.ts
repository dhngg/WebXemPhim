import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MeterReadingResponse, RatePlanResponse, RoomServiceResponse } from '@rental/shared';

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
const session = vi.hoisted(() => ({ record: null as unknown }));

vi.mock('@/services/http/httpClient', () => ({ httpClient: http }));
vi.mock('@/mocks/mockUtils', () => ({ simulate: async () => ({ empty: false }), notFound: () => { throw new Error('nf'); } }));
vi.mock('@/mocks/handlers/auth.mock', () => ({ requireSession: () => session.record, currentMockUser: () => null }));

import { ApiError } from '@/services/http/ApiError';
import { db } from '@/mocks/db';
import { utilitiesMock } from '@/mocks/handlers/utilities.mock';
import { utilitiesHttp } from './api';
import { utilitiesErrorMessage } from './labels';
import {
  compareDecimal,
  diffRateChange,
  formatDecimal,
  formatUnitPrice,
  normalizeRateCode,
  planMeterCell,
  toAdjustBody,
  toMeter,
  toMeterBody,
  toRate,
  toRateBody,
  trimDecimal,
} from './mappers';
import { adjustSchema, meterSchema, rateChangeSchema, rateSchema, roomServiceSchema, stopSchema } from './schemas';
import type { MeterReadingItem } from './types';

const WS = '11111111-1111-4111-8111-111111111111';
const BLD = '33333333-3333-4333-8333-333333333333';
const ROOM = '22222222-2222-4222-8222-222222222222';

const rateDto = (o: Partial<RatePlanResponse> = {}): RatePlanResponse => ({
  id: 'rate-1', workspaceId: WS, buildingId: BLD, code: 'ELECTRICITY', name: 'Điện', serviceType: 'ELECTRICITY', billingUnit: 'KWH',
  unitPrice: '3500.0000', effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...o,
});
const meterDto = (o: Partial<MeterReadingResponse> = {}): MeterReadingResponse => ({
  id: 'mr-1', workspaceId: WS, buildingId: BLD, roomId: ROOM, meterType: 'ELECTRICITY', period: '2026-10',
  previousReading: '100.000', currentReading: '150.500', consumption: '50.500', revision: 0, recordedBy: 'u1', adjustments: [],
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', ...o,
});
const item = (o: Partial<MeterReadingResponse> = {}): MeterReadingItem => toMeter(meterDto(o));

beforeEach(() => {
  http.get.mockReset();
  http.post.mockReset();
  http.patch.mockReset();
});

describe('decimal helpers keep exact backend strings', () => {
  it('compares by value without floating point', () => {
    expect(compareDecimal('10', '9')).toBe(1);
    expect(compareDecimal('100.000', '100')).toBe(0);
    expect(compareDecimal('99999999999.999', '99999999999.998')).toBe(1);
    expect(compareDecimal('0.5', '0.25')).toBe(1);
    expect(compareDecimal('012', '12')).toBe(0);
  });
  it('trims and formats without rounding', () => {
    expect(trimDecimal('3500.0000')).toBe('3500');
    expect(trimDecimal('12.500')).toBe('12.5');
    expect(formatDecimal('1234567.5000')).toBe('1.234.567,5');
    expect(formatUnitPrice('3500.0000')).toBe('3.500 ₫');
    expect(formatUnitPrice('1234.1234')).toBe('1.234,1234 ₫');
    expect(formatDecimal('abc')).toBe('—');
  });
  it('normalizes the service code like the backend', () => {
    expect(normalizeRateCode(' wi-fi 5g ')).toBe('WI_FI_5G');
    expect(normalizeRateCode('__x__')).toBe('X');
  });
});

describe('rates: mapping, validation, change diff', () => {
  it('maps nulls to undefined and keeps the price string', () => {
    const r = toRate(rateDto({ unitPrice: '3500.5000' }));
    expect(r.effectiveTo).toBeUndefined();
    expect(r.unitPrice).toBe('3500.5000');
  });
  it('create body normalizes the code and trims', () => {
    expect(toRateBody({ code: 'wi fi', name: ' Internet ', serviceType: 'WIFI', billingUnit: 'ROOM', unitPrice: ' 100000 ', effectiveFrom: '2026-10-01' })).toEqual({
      code: 'WI_FI', name: 'Internet', serviceType: 'WIFI', billingUnit: 'ROOM', unitPrice: '100000', effectiveFrom: '2026-10-01',
    });
  });
  it('create schema follows the DTO: code, 100-char name, money with up to 4 decimals', () => {
    const base = { code: 'WIFI', name: 'Internet', serviceType: 'WIFI', billingUnit: 'ROOM', unitPrice: '100000', effectiveFrom: '2026-10-01' };
    expect(rateSchema.safeParse(base).success).toBe(true);
    expect(rateSchema.safeParse({ ...base, code: '1WIFI' }).success).toBe(false);
    expect(rateSchema.safeParse({ ...base, code: '   ' }).success).toBe(false);
    expect(rateSchema.safeParse({ ...base, name: 'x'.repeat(101) }).success).toBe(false);
    expect(rateSchema.safeParse({ ...base, unitPrice: '1.23456' }).success).toBe(false);
    expect(rateSchema.safeParse({ ...base, unitPrice: '-1' }).success).toBe(false);
    expect(rateSchema.safeParse({ ...base, unitPrice: '12345678901' }).success).toBe(false);
    expect(rateSchema.safeParse({ ...base, unitPrice: '1234567890.1234' }).success).toBe(true);
    expect(rateSchema.safeParse({ ...base, serviceType: 'GAS' }).success).toBe(false);
    expect(rateSchema.safeParse({ ...base, effectiveFrom: '' }).success).toBe(false);
  });
  it('change schema: the new effective date must be after the current one', () => {
    const schema = rateChangeSchema('2026-01-01');
    const base = { name: 'Điện', serviceType: 'ELECTRICITY', billingUnit: 'KWH', unitPrice: '4000', effectiveFrom: '2026-02-01' };
    expect(schema.safeParse(base).success).toBe(true);
    expect(schema.safeParse({ ...base, effectiveFrom: '2026-01-01' }).success).toBe(false);
    expect(schema.safeParse({ ...base, unitPrice: '' }).success).toBe(false);
  });
  it('change body always has price + date and only the changed optional fields', () => {
    const cur = { name: 'Điện', serviceType: 'ELECTRICITY' as const, billingUnit: 'KWH' as const };
    expect(diffRateChange(cur, { ...cur, unitPrice: '4000', effectiveFrom: '2026-02-01' })).toEqual({ unitPrice: '4000', effectiveFrom: '2026-02-01' });
    expect(diffRateChange(cur, { name: 'Điện mới', serviceType: 'OTHER', billingUnit: 'FIXED', unitPrice: '1', effectiveFrom: '2026-02-01' })).toEqual({
      name: 'Điện mới', serviceType: 'OTHER', billingUnit: 'FIXED', unitPrice: '1', effectiveFrom: '2026-02-01',
    });
  });
  it('stop schema: exclusive end date strictly after the start', () => {
    const schema = stopSchema('2026-01-01');
    expect(schema.safeParse({ effectiveTo: '2026-01-02' }).success).toBe(true);
    expect(schema.safeParse({ effectiveTo: '2026-01-01' }).success).toBe(false);
    expect(schema.safeParse({ effectiveTo: '' }).success).toBe(false);
  });
  it('room service schema needs a code and a date', () => {
    expect(roomServiceSchema.safeParse({ rateCode: 'WIFI', effectiveFrom: '2026-10-01' }).success).toBe(true);
    expect(roomServiceSchema.safeParse({ rateCode: '', effectiveFrom: '2026-10-01' }).success).toBe(false);
  });
});

describe('meters: planning the cell and validation', () => {
  it('first reading of a meter needs the old value; later ones use the previous period', () => {
    expect(planMeterCell([], 'ELECTRICITY', '2026-10')).toEqual({ kind: 'empty', canRecord: true, needsPrevious: true });
    const plan = planMeterCell([item({ period: '2026-09', currentReading: '120.000' })], 'ELECTRICITY', '2026-10');
    expect(plan).toEqual({ kind: 'empty', canRecord: true, needsPrevious: false, previous: '120.000' });
  });
  it('does not allow back-filling a period before the newest reading', () => {
    const plan = planMeterCell([item({ period: '2026-11' })], 'ELECTRICITY', '2026-10');
    expect(plan).toMatchObject({ kind: 'empty', canRecord: false });
  });
  it('electricity and water are independent chains', () => {
    const plan = planMeterCell([item({ period: '2026-11', meterType: 'WATER' })], 'ELECTRICITY', '2026-10');
    expect(plan).toMatchObject({ kind: 'empty', canRecord: true, needsPrevious: true });
  });
  it('only the newest reading can be adjusted; its old value is editable only when it is the first', () => {
    const all = [item({ id: 'a', period: '2026-09' }), item({ id: 'b', period: '2026-10' })];
    expect(planMeterCell(all, 'ELECTRICITY', '2026-09')).toMatchObject({ kind: 'recorded', canAdjust: false, isFirst: true });
    expect(planMeterCell(all, 'ELECTRICITY', '2026-10')).toMatchObject({ kind: 'recorded', canAdjust: true, isFirst: false });
  });
  it('record schema: DTO number format, first reading needs previous, current >= previous', () => {
    const first = meterSchema(true);
    expect(first.safeParse({ previousReading: '100', currentReading: '150.5' }).success).toBe(true);
    expect(first.safeParse({ previousReading: '', currentReading: '150' }).success).toBe(false);
    expect(first.safeParse({ previousReading: '100', currentReading: '99.999' }).success).toBe(false);
    expect(first.safeParse({ previousReading: '100', currentReading: '1.2345' }).success).toBe(false);
    const next = meterSchema(false, '120.000');
    expect(next.safeParse({ currentReading: '120' }).success).toBe(true);
    expect(next.safeParse({ currentReading: '119.999' }).success).toBe(false);
    expect(next.safeParse({ currentReading: '123456789012' }).success).toBe(false);
  });
  it('adjust schema: reason required (<=500), must change a value, current >= previous', () => {
    const s = adjustSchema(false, '100.000', '150.500');
    expect(s.safeParse({ currentReading: '160', reason: 'Đọc nhầm' }).success).toBe(true);
    expect(s.safeParse({ currentReading: '160', reason: '  ' }).success).toBe(false);
    expect(s.safeParse({ currentReading: '160', reason: 'x'.repeat(501) }).success).toBe(false);
    expect(s.safeParse({ currentReading: '150.5', reason: 'Không đổi' }).success).toBe(false);
    expect(s.safeParse({ currentReading: '99', reason: 'Nhỏ hơn số cũ' }).success).toBe(false);
    const first = adjustSchema(true, '100.000', '150.500');
    expect(first.safeParse({ previousReading: '90', currentReading: '150.5', reason: 'Sửa số cũ' }).success).toBe(true);
  });
  it('bodies omit empty previous reading', () => {
    expect(toMeterBody({ meterType: 'WATER', period: '2026-10', previousReading: '', currentReading: ' 12.5 ' })).toEqual({ meterType: 'WATER', period: '2026-10', currentReading: '12.5' });
    expect(toAdjustBody({ currentReading: '5', reason: ' sai ' })).toEqual({ currentReading: '5', reason: 'sai' });
  });
});

describe('HTTP adapter uses the real nested endpoints', () => {
  it('rates: lists every page with filters, creates, changes by id, stops', async () => {
    http.get.mockImplementation(async (_url: string, opts: { query: { page: number } }) =>
      opts.query.page === 1 ? { items: [rateDto({ id: 'a' })], page: 1, limit: 50, total: 2 } : { items: [rateDto({ id: 'b' })], page: 2, limit: 50, total: 2 });
    const list = await utilitiesHttp.listRates(WS, BLD, { status: 'ACTIVE', serviceType: 'WATER' });
    expect(list.map((r) => r.id)).toEqual(['a', 'b']);
    expect(http.get).toHaveBeenNthCalledWith(1, `/workspaces/${WS}/buildings/${BLD}/rates`, { query: { status: 'ACTIVE', serviceType: 'WATER', page: 1, limit: 50 } });
    http.post.mockResolvedValue(rateDto());
    await utilitiesHttp.createRate(WS, BLD, { code: 'electricity', name: 'Điện', serviceType: 'ELECTRICITY', billingUnit: 'KWH', unitPrice: '3500', effectiveFrom: '2026-01-01' });
    expect(http.post).toHaveBeenCalledWith(`/workspaces/${WS}/buildings/${BLD}/rates`, expect.objectContaining({ code: 'ELECTRICITY', unitPrice: '3500' }));
    http.patch.mockResolvedValue(rateDto());
    await utilitiesHttp.changeRate(WS, BLD, toRate(rateDto()), { unitPrice: '4000', effectiveFrom: '2026-02-01' });
    expect(http.patch).toHaveBeenLastCalledWith(`/workspaces/${WS}/buildings/${BLD}/rates/rate-1`, { unitPrice: '4000', effectiveFrom: '2026-02-01' });
    await utilitiesHttp.stopRate(WS, BLD, 'rate-1', '2026-12-01');
    expect(http.patch).toHaveBeenLastCalledWith(`/workspaces/${WS}/buildings/${BLD}/rates/rate-1/stop`, { effectiveTo: '2026-12-01' });
  });

  it('room services: plain array list, create and stop under the room', async () => {
    const dto: RoomServiceResponse = { id: 's1', workspaceId: WS, buildingId: BLD, roomId: ROOM, rateCode: 'WIFI', effectiveFrom: '2026-10-01', effectiveTo: null, createdBy: 'u', endedBy: null, createdAt: '', updatedAt: '' };
    http.get.mockResolvedValue([dto]);
    expect((await utilitiesHttp.listRoomServices(WS, BLD, ROOM))[0]).toMatchObject({ rateCode: 'WIFI', effectiveTo: undefined });
    expect(http.get).toHaveBeenCalledWith(`/workspaces/${WS}/buildings/${BLD}/rooms/${ROOM}/services`);
    http.post.mockResolvedValue(dto);
    await utilitiesHttp.addRoomService(WS, BLD, ROOM, { rateCode: 'WIFI', effectiveFrom: '2026-10-01' });
    expect(http.post).toHaveBeenCalledWith(`/workspaces/${WS}/buildings/${BLD}/rooms/${ROOM}/services`, { rateCode: 'WIFI', effectiveFrom: '2026-10-01' });
    http.patch.mockResolvedValue(dto);
    await utilitiesHttp.stopRoomService(WS, BLD, ROOM, 's1', '2026-12-01');
    expect(http.patch).toHaveBeenCalledWith(`/workspaces/${WS}/buildings/${BLD}/rooms/${ROOM}/services/s1/stop`, { effectiveTo: '2026-12-01' });
  });

  it('meter readings: paged list with filters, record, adjust', async () => {
    http.get.mockResolvedValue({ items: [meterDto()], page: 1, limit: 50, total: 1 });
    const list = await utilitiesHttp.listMeterReadings(WS, BLD, ROOM, { meterType: 'ELECTRICITY', period: '2026-10' });
    expect(list[0]).toMatchObject({ consumption: '50.500', revision: 0 });
    expect(http.get).toHaveBeenCalledWith(`/workspaces/${WS}/buildings/${BLD}/rooms/${ROOM}/meter-readings`, { query: { meterType: 'ELECTRICITY', period: '2026-10', page: 1, limit: 50 } });
    http.post.mockResolvedValue(meterDto());
    await utilitiesHttp.recordMeterReading(WS, BLD, ROOM, { meterType: 'ELECTRICITY', period: '2026-10', previousReading: '100', currentReading: '150.5' });
    expect(http.post).toHaveBeenCalledWith(`/workspaces/${WS}/buildings/${BLD}/rooms/${ROOM}/meter-readings`, { meterType: 'ELECTRICITY', period: '2026-10', previousReading: '100', currentReading: '150.5' });
    http.patch.mockResolvedValue(meterDto({ revision: 1 }));
    await utilitiesHttp.adjustMeterReading(WS, BLD, ROOM, 'mr-1', { currentReading: '160', reason: 'Đọc nhầm' });
    expect(http.patch).toHaveBeenCalledWith(`/workspaces/${WS}/buildings/${BLD}/rooms/${ROOM}/meter-readings/mr-1/adjust`, { currentReading: '160', reason: 'Đọc nhầm' });
  });
});

describe('error messages follow the backend codes', () => {
  const err = (statusCode: number, code?: string) => new ApiError({ statusCode, code, message: 'raw' });
  it('maps domain codes to Vietnamese and falls back to the raw message', () => {
    expect(utilitiesErrorMessage(err(409, 'RATE_PLAN_CONFLICT'))).toMatch(/trùng thời gian/);
    expect(utilitiesErrorMessage(err(409, 'METER_READING_DUPLICATE'))).toMatch(/Kỳ này đã có chỉ số/);
    expect(utilitiesErrorMessage(err(409, 'ROOM_SERVICE_CONFLICT'))).toMatch(/Phòng đã áp dụng/);
    expect(utilitiesErrorMessage(err(409, 'WORKSPACE_ARCHIVED'))).toMatch(/lưu trữ/);
    expect(utilitiesErrorMessage(err(401))).toMatch(/đăng nhập lại/);
    expect(utilitiesErrorMessage(err(500, 'SOMETHING'))).toBe('raw');
  });
});

describe('mock follows the backend rules (OWNER only, versioned rates, chained meters)', () => {
  const b = db.buildings[0]!;
  const ws = b.workspaceId;
  const room = db.rooms.find((r) => r.buildingId === b.id)!;
  const as = (role: string) => {
    session.record = { user: { id: 'u1', fullName: 'Chủ', email: 'o@x.vn' }, memberships: [{ workspaceId: ws, role, status: 'ACTIVE', name: 'WS' }] };
  };

  it('rejects MANAGER/STAFF and other workspaces', async () => {
    for (const role of ['MANAGER', 'STAFF']) {
      as(role);
      await expect(utilitiesMock.listRates(ws, b.id)).rejects.toBeInstanceOf(ApiError);
    }
    as('OWNER');
    await expect(utilitiesMock.listRates(ws, 'missing')).rejects.toMatchObject({ code: 'BUILDING_NOT_FOUND' });
    await expect(utilitiesMock.listRoomServices(ws, b.id, 'missing')).rejects.toMatchObject({ code: 'ROOM_NOT_FOUND' });
  });

  it('empty state: a fresh code list is filtered by status/service type', async () => {
    as('OWNER');
    const all = await utilitiesMock.listRates(ws, b.id);
    expect(all.length).toBeGreaterThan(0);
    expect((await utilitiesMock.listRates(ws, b.id, { serviceType: 'PARKING' }))).toEqual([]);
    expect((await utilitiesMock.listRates(ws, b.id, { status: 'INACTIVE' })).every((r) => r.status === 'INACTIVE')).toBe(true);
  });

  it('create conflicts on overlap; change makes a new version and ends the old one at the new date; stop is idempotent', async () => {
    as('OWNER');
    const created = await utilitiesMock.createRate(ws, b.id, { code: 'trash', name: 'Rác', serviceType: 'TRASH', billingUnit: 'ROOM', unitPrice: '30000', effectiveFrom: '2026-01-01' });
    expect(created).toMatchObject({ code: 'TRASH', unitPrice: '30000.0000', status: 'ACTIVE' });
    await expect(utilitiesMock.createRate(ws, b.id, { code: 'TRASH', name: 'Rác 2', serviceType: 'TRASH', billingUnit: 'ROOM', unitPrice: '1', effectiveFrom: '2026-06-01' })).rejects.toMatchObject({ code: 'RATE_PLAN_CONFLICT' });
    await expect(utilitiesMock.changeRate(ws, b.id, created, { unitPrice: '40000', effectiveFrom: '2026-01-01' })).rejects.toMatchObject({ code: 'RATE_PLAN_NOT_ELIGIBLE' });
    const next = await utilitiesMock.changeRate(ws, b.id, created, { unitPrice: '40000', effectiveFrom: '2026-03-01' });
    expect(next).toMatchObject({ unitPrice: '40000.0000', effectiveFrom: '2026-03-01', status: 'ACTIVE' });
    const history = await utilitiesMock.listRates(ws, b.id, { status: 'INACTIVE' });
    expect(history.find((r) => r.id === created.id)).toMatchObject({ effectiveTo: '2026-03-01', status: 'INACTIVE' });
    await expect(utilitiesMock.changeRate(ws, b.id, created, { unitPrice: '1', effectiveFrom: '2026-09-01' })).rejects.toMatchObject({ code: 'RATE_PLAN_INACTIVE' });
    await expect(utilitiesMock.stopRate(ws, b.id, next.id, '2026-03-01')).rejects.toMatchObject({ code: 'RATE_PLAN_NOT_ELIGIBLE' });
    const stopped = await utilitiesMock.stopRate(ws, b.id, next.id, '2026-12-01');
    expect(stopped).toMatchObject({ status: 'INACTIVE', effectiveTo: '2026-12-01' });
    expect((await utilitiesMock.stopRate(ws, b.id, next.id, '2027-12-01')).effectiveTo).toBe('2026-12-01');
  });

  it('room services need an existing code, reject overlap, and stop with an exclusive end after the start', async () => {
    as('OWNER');
    await expect(utilitiesMock.addRoomService(ws, b.id, room.id, { rateCode: 'NOPE', effectiveFrom: '2026-10-01' })).rejects.toMatchObject({ code: 'RATE_PLAN_NOT_FOUND' });
    const svc = await utilitiesMock.addRoomService(ws, b.id, room.id, { rateCode: 'wifi', effectiveFrom: '2026-10-01' });
    expect(svc.rateCode).toBe('WIFI');
    await expect(utilitiesMock.addRoomService(ws, b.id, room.id, { rateCode: 'WIFI', effectiveFrom: '2026-12-01' })).rejects.toMatchObject({ code: 'ROOM_SERVICE_CONFLICT' });
    await expect(utilitiesMock.stopRoomService(ws, b.id, room.id, svc.id, '2026-10-01')).rejects.toMatchObject({ code: 'ROOM_SERVICE_NOT_ELIGIBLE' });
    expect((await utilitiesMock.stopRoomService(ws, b.id, room.id, svc.id, '2026-11-01')).effectiveTo).toBe('2026-11-01');
    expect((await utilitiesMock.listRoomServices(ws, b.id, room.id)).some((s) => s.id === svc.id)).toBe(true);
  });

  it('meter chain: first needs previous, later uses the previous current, duplicate/back-fill/decrease rejected, only newest adjustable with a recorded history', async () => {
    as('OWNER');
    const r2 = db.rooms.filter((r) => r.buildingId === b.id)[1] ?? room;
    await expect(utilitiesMock.recordMeterReading(ws, b.id, r2.id, { meterType: 'WATER', period: '2026-09', currentReading: '10' })).rejects.toMatchObject({ code: 'METER_READING_INVALID' });
    const sep = await utilitiesMock.recordMeterReading(ws, b.id, r2.id, { meterType: 'WATER', period: '2026-09', previousReading: '10', currentReading: '15.5' });
    expect(sep).toMatchObject({ previousReading: '10.000', currentReading: '15.500', consumption: '5.500' });
    await expect(utilitiesMock.recordMeterReading(ws, b.id, r2.id, { meterType: 'WATER', period: '2026-09', currentReading: '20' })).rejects.toMatchObject({ code: 'METER_READING_DUPLICATE' });
    await expect(utilitiesMock.recordMeterReading(ws, b.id, r2.id, { meterType: 'WATER', period: '2026-08', currentReading: '20' })).rejects.toMatchObject({ code: 'METER_READING_INVALID' });
    await expect(utilitiesMock.recordMeterReading(ws, b.id, r2.id, { meterType: 'WATER', period: '2026-10', currentReading: '15' })).rejects.toMatchObject({ code: 'METER_READING_INVALID' });
    const oct = await utilitiesMock.recordMeterReading(ws, b.id, r2.id, { meterType: 'WATER', period: '2026-10', currentReading: '21.25' });
    expect(oct).toMatchObject({ previousReading: '15.500', consumption: '5.750' });
    await expect(utilitiesMock.adjustMeterReading(ws, b.id, r2.id, sep.id, { currentReading: '16', reason: 'x' })).rejects.toMatchObject({ code: 'METER_READING_INVALID' });
    await expect(utilitiesMock.adjustMeterReading(ws, b.id, r2.id, oct.id, { currentReading: '21.25', reason: 'x' })).rejects.toMatchObject({ code: 'METER_READING_INVALID' });
    await expect(utilitiesMock.adjustMeterReading(ws, b.id, r2.id, oct.id, { previousReading: '1', currentReading: '30', reason: 'x' })).rejects.toMatchObject({ code: 'METER_READING_INVALID' });
    const adj = await utilitiesMock.adjustMeterReading(ws, b.id, r2.id, oct.id, { currentReading: '22', reason: 'Đọc nhầm' });
    expect(adj).toMatchObject({ currentReading: '22.000', revision: 1, consumption: '6.500' });
    expect(adj.adjustments[0]).toMatchObject({ oldCurrentReading: '21.250', newCurrentReading: '22.000', reason: 'Đọc nhầm', revision: 1 });
    // điện độc lập với nước
    expect((await utilitiesMock.listMeterReadings(ws, b.id, r2.id, { meterType: 'ELECTRICITY' }))).toEqual([]);
    expect((await utilitiesMock.listMeterReadings(ws, b.id, r2.id, { period: '2026-10' })).map((m) => m.id)).toEqual([oct.id]);
  });
});
