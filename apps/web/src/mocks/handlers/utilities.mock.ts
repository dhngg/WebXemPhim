import type { UtilitiesApi } from '@/features/utilities/api';
import { compareDecimal, normalizeRateCode } from '@/features/utilities/mappers';
import type { MeterReadingItem, RatePlanItem, RoomServiceItem } from '@/features/utilities/types';
import { ApiError } from '@/services/http/ApiError';
import { db, nextId } from '../db';
import { requireMember } from '../guard';
import { simulate } from '../mockUtils';

/**
 * Mock theo đúng hình dạng và quy tắc của backend (Rates, Room Services, Meter Readings): chỉ OWNER,
 * mọi thao tác nằm dưới tòa nhà (và phòng) thuộc workspace, giá/chỉ số là chuỗi thập phân,
 * đổi giá tạo phiên bản mới, chỉ số nối chuỗi theo kỳ và chỉ chỉnh được kỳ mới nhất.
 */
const rates: RatePlanItem[] = [];
const services: RoomServiceItem[] = [];
const readings: MeterReadingItem[] = [];
const seeded = new Set<string>();

const fail = (status: number, code: string, message: string): never => {
  throw new ApiError({ statusCode: status, code, message });
};
const now = () => new Date().toISOString();
const fixed = (v: string, digits: number) => {
  const [i = '0', f = ''] = v.split('.');
  return digits === 0 ? i : `${i}.${f.padEnd(digits, '0').slice(0, digits)}`;
};

function scope(ws: string, buildingId: string) {
  requireMember(ws, 'rooms.write');
  const b = db.buildings.find((x) => x.workspaceId === ws && x.id === buildingId);
  if (!b) fail(404, 'BUILDING_NOT_FOUND', 'Building not found');
  seed(ws, buildingId);
}
function roomScope(ws: string, buildingId: string, roomId: string) {
  scope(ws, buildingId);
  if (!db.rooms.some((r) => r.workspaceId === ws && r.buildingId === buildingId && r.id === roomId)) fail(404, 'ROOM_NOT_FOUND', 'Room not found');
}

/** Dữ liệu mẫu cho tòa nhà demo lần đầu được truy cập: điện, nước, Wi-Fi. */
function seed(ws: string, buildingId: string) {
  if (seeded.has(buildingId)) return;
  seeded.add(buildingId);
  const base = { buildingId, effectiveFrom: '2026-01-01', status: 'ACTIVE' as const, createdAt: now(), updatedAt: now() };
  rates.push(
    { ...base, id: nextId('rate'), code: 'ELECTRICITY', name: 'Điện sinh hoạt', serviceType: 'ELECTRICITY', billingUnit: 'KWH', unitPrice: '3500.0000' },
    { ...base, id: nextId('rate'), code: 'WATER', name: 'Nước sinh hoạt', serviceType: 'WATER', billingUnit: 'CUBIC_METER', unitPrice: '18000.0000' },
    { ...base, id: nextId('rate'), code: 'WIFI', name: 'Internet', serviceType: 'WIFI', billingUnit: 'ROOM', unitPrice: '100000.0000' },
  );
  void ws;
}

const overlaps = (a: { effectiveFrom: string; effectiveTo?: string }, from: string, to?: string) =>
  a.effectiveFrom < (to ?? '9999-12-31') && from < (a.effectiveTo ?? '9999-12-31');

export const utilitiesMock: UtilitiesApi = {
  // ------------------------------------------------------------------ rates
  async listRates(ws, buildingId, f = {}) {
    await simulate();
    scope(ws, buildingId);
    return rates
      .filter((r) => r.buildingId === buildingId && (!f.status || r.status === f.status) && (!f.serviceType || r.serviceType === f.serviceType))
      .sort((a, b) => a.code.localeCompare(b.code) || b.effectiveFrom.localeCompare(a.effectiveFrom));
  },
  async createRate(ws, buildingId, input) {
    await simulate();
    scope(ws, buildingId);
    const code = normalizeRateCode(input.code);
    if (rates.some((r) => r.buildingId === buildingId && r.code === code && overlaps(r, input.effectiveFrom))) fail(409, 'RATE_PLAN_CONFLICT', 'Overlapping rate');
    const item: RatePlanItem = {
      id: nextId('rate'),
      buildingId,
      code,
      name: input.name.trim(),
      serviceType: input.serviceType,
      billingUnit: input.billingUnit,
      unitPrice: fixed(input.unitPrice, 4),
      effectiveFrom: input.effectiveFrom,
      status: 'ACTIVE',
      createdAt: now(),
      updatedAt: now(),
    };
    rates.push(item);
    return item;
  },
  async changeRate(ws, buildingId, rate, input) {
    await simulate();
    scope(ws, buildingId);
    const current = rates.find((r) => r.id === rate.id && r.buildingId === buildingId) ?? fail(404, 'RATE_PLAN_NOT_FOUND', 'Rate not found');
    if (current.status !== 'ACTIVE') fail(409, 'RATE_PLAN_INACTIVE', 'Rate is inactive');
    if (input.effectiveFrom <= current.effectiveFrom) fail(409, 'RATE_PLAN_NOT_ELIGIBLE', 'New effective date must be later');
    current.status = 'INACTIVE';
    current.effectiveTo = input.effectiveFrom;
    current.updatedAt = now();
    const next: RatePlanItem = {
      ...current,
      id: nextId('rate'),
      name: input.name?.trim() || current.name,
      serviceType: input.serviceType ?? current.serviceType,
      billingUnit: input.billingUnit ?? current.billingUnit,
      unitPrice: fixed(input.unitPrice, 4),
      effectiveFrom: input.effectiveFrom,
      effectiveTo: undefined,
      status: 'ACTIVE',
      createdAt: now(),
      updatedAt: now(),
    };
    rates.push(next);
    return next;
  },
  async stopRate(ws, buildingId, rateId, effectiveTo) {
    await simulate();
    scope(ws, buildingId);
    const current = rates.find((r) => r.id === rateId && r.buildingId === buildingId) ?? fail(404, 'RATE_PLAN_NOT_FOUND', 'Rate not found');
    if (current.status === 'INACTIVE') return current;
    if (effectiveTo <= current.effectiveFrom) fail(409, 'RATE_PLAN_NOT_ELIGIBLE', 'End must be after start');
    current.status = 'INACTIVE';
    current.effectiveTo = effectiveTo;
    current.updatedAt = now();
    return current;
  },

  // ------------------------------------------------------------------ room services
  async listRoomServices(ws, buildingId, roomId) {
    await simulate();
    roomScope(ws, buildingId, roomId);
    return services.filter((s) => s.roomId === roomId).sort((a, b) => a.rateCode.localeCompare(b.rateCode) || b.effectiveFrom.localeCompare(a.effectiveFrom));
  },
  async addRoomService(ws, buildingId, roomId, input) {
    await simulate();
    roomScope(ws, buildingId, roomId);
    const rateCode = normalizeRateCode(input.rateCode);
    if (!rates.some((r) => r.buildingId === buildingId && r.code === rateCode)) fail(404, 'RATE_PLAN_NOT_FOUND', 'Rate code not found');
    if (services.some((s) => s.roomId === roomId && s.rateCode === rateCode && overlaps(s, input.effectiveFrom))) fail(409, 'ROOM_SERVICE_CONFLICT', 'Overlapping service');
    const item: RoomServiceItem = { id: nextId('svc'), buildingId, roomId, rateCode, effectiveFrom: input.effectiveFrom, createdAt: now() };
    services.push(item);
    return item;
  },
  async stopRoomService(ws, buildingId, roomId, serviceId, effectiveTo) {
    await simulate();
    roomScope(ws, buildingId, roomId);
    const current = services.find((s) => s.id === serviceId && s.roomId === roomId) ?? fail(404, 'ROOM_SERVICE_NOT_FOUND', 'Service not found');
    if (current.effectiveTo) return current;
    if (effectiveTo <= current.effectiveFrom) fail(409, 'ROOM_SERVICE_NOT_ELIGIBLE', 'End must be after start');
    current.effectiveTo = effectiveTo;
    return current;
  },

  // ------------------------------------------------------------------ meter readings
  async listMeterReadings(ws, buildingId, roomId, f = {}) {
    await simulate();
    roomScope(ws, buildingId, roomId);
    return readings
      .filter((r) => r.roomId === roomId && (!f.meterType || r.meterType === f.meterType) && (!f.period || r.period === f.period))
      .sort((a, b) => b.period.localeCompare(a.period) || a.meterType.localeCompare(b.meterType));
  },
  async recordMeterReading(ws, buildingId, roomId, input) {
    await simulate();
    roomScope(ws, buildingId, roomId);
    const same = readings.filter((r) => r.roomId === roomId && r.meterType === input.meterType);
    const latest = same.reduce<MeterReadingItem | undefined>((a, r) => (!a || r.period > a.period ? r : a), undefined);
    if (latest?.period === input.period) fail(409, 'METER_READING_DUPLICATE', 'Reading already exists');
    if (latest && latest.period > input.period) fail(409, 'METER_READING_INVALID', 'Earlier period');
    const previous = latest ? latest.currentReading : input.previousReading;
    if (previous === undefined) fail(409, 'METER_READING_INVALID', 'Previous reading required');
    if (latest && input.previousReading !== undefined && compareDecimal(input.previousReading, previous!) !== 0) fail(409, 'METER_READING_INVALID', 'Previous mismatch');
    if (compareDecimal(input.currentReading, previous!) < 0) fail(409, 'METER_READING_INVALID', 'Current below previous');
    const item: MeterReadingItem = {
      id: nextId('mtr'),
      buildingId,
      roomId,
      meterType: input.meterType,
      period: input.period,
      previousReading: fixed(previous!, 3),
      currentReading: fixed(input.currentReading, 3),
      consumption: consumption(previous!, input.currentReading),
      revision: 0,
      adjustments: [],
      createdAt: now(),
      updatedAt: now(),
    };
    readings.push(item);
    return item;
  },
  async adjustMeterReading(ws, buildingId, roomId, readingId, input) {
    await simulate();
    roomScope(ws, buildingId, roomId);
    const r = readings.find((x) => x.id === readingId && x.roomId === roomId) ?? fail(404, 'METER_READING_NOT_FOUND', 'Reading not found');
    const siblings = readings.filter((x) => x.roomId === roomId && x.meterType === r.meterType);
    if (siblings.some((x) => x.period > r.period)) fail(409, 'METER_READING_INVALID', 'Only the newest reading can change');
    if (siblings.some((x) => x.period < r.period) && input.previousReading !== undefined) fail(409, 'METER_READING_INVALID', 'Previous reading is chained');
    const nextPrev = input.previousReading ?? r.previousReading;
    if (compareDecimal(input.currentReading, nextPrev) < 0) fail(409, 'METER_READING_INVALID', 'Current below previous');
    if (compareDecimal(nextPrev, r.previousReading) === 0 && compareDecimal(input.currentReading, r.currentReading) === 0) fail(409, 'METER_READING_INVALID', 'No change');
    r.revision += 1;
    r.adjustments.push({
      id: nextId('adj'),
      revision: r.revision,
      oldPreviousReading: r.previousReading,
      oldCurrentReading: r.currentReading,
      newPreviousReading: fixed(nextPrev, 3),
      newCurrentReading: fixed(input.currentReading, 3),
      reason: input.reason.trim(),
      createdAt: now(),
    });
    r.previousReading = fixed(nextPrev, 3);
    r.currentReading = fixed(input.currentReading, 3);
    r.consumption = consumption(nextPrev, input.currentReading);
    r.updatedAt = now();
    return r;
  },
};

/** Tiêu thụ = số mới − số cũ, tính trên số nguyên (đơn vị 0,001) để không lệch dấu phẩy động. */
function consumption(prev: string, cur: string): string {
  const toMilli = (v: string) => {
    const [i = '0', f = ''] = v.split('.');
    return BigInt(i) * 1000n + BigInt(f.padEnd(3, '0').slice(0, 3));
  };
  const d = toMilli(cur) - toMilli(prev);
  return `${d / 1000n}.${(d % 1000n).toString().padStart(3, '0')}`;
}

