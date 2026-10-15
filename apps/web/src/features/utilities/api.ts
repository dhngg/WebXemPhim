import type { MeterReadingResponse, RatePlanResponse, RoomServiceResponse } from '@rental/shared';
import { env } from '@/lib/env';
import { httpClient } from '@/services/http/httpClient';
import { utilitiesMock } from '@/mocks/handlers/utilities.mock';
import { diffRateChange, toAdjustBody, toMeter, toMeterBody, toRate, toRateBody, toRoomService } from './mappers';
import type {
  MeterAdjustInput,
  MeterFilters,
  MeterInput,
  MeterReadingItem,
  RateChangeInput,
  RateFilters,
  RateInput,
  RatePlanItem,
  RoomServiceInput,
  RoomServiceItem,
} from './types';

/** Mọi endpoint của Rates / Room Services / Meter Readings nằm dưới workspace → tòa nhà (→ phòng). */
export interface UtilitiesApi {
  listRates(ws: string, buildingId: string, filters?: RateFilters): Promise<RatePlanItem[]>;
  createRate(ws: string, buildingId: string, input: RateInput): Promise<RatePlanItem>;
  /** Đổi giá = phiên bản mới từ `effectiveFrom`; phiên bản hiện tại thành INACTIVE với effectiveTo = ngày đó. */
  changeRate(ws: string, buildingId: string, rate: RatePlanItem, input: RateChangeInput): Promise<RatePlanItem>;
  stopRate(ws: string, buildingId: string, rateId: string, effectiveTo: string): Promise<RatePlanItem>;

  listRoomServices(ws: string, buildingId: string, roomId: string): Promise<RoomServiceItem[]>;
  addRoomService(ws: string, buildingId: string, roomId: string, input: RoomServiceInput): Promise<RoomServiceItem>;
  stopRoomService(ws: string, buildingId: string, roomId: string, serviceId: string, effectiveTo: string): Promise<RoomServiceItem>;

  listMeterReadings(ws: string, buildingId: string, roomId: string, filters?: MeterFilters): Promise<MeterReadingItem[]>;
  recordMeterReading(ws: string, buildingId: string, roomId: string, input: MeterInput): Promise<MeterReadingItem>;
  adjustMeterReading(ws: string, buildingId: string, roomId: string, readingId: string, input: MeterAdjustInput): Promise<MeterReadingItem>;
}

const enc = encodeURIComponent;
const bp = (ws: string, buildingId: string) => `/workspaces/${enc(ws)}/buildings/${enc(buildingId)}`;
const rp = (ws: string, buildingId: string, roomId: string) => `${bp(ws, buildingId)}/rooms/${enc(roomId)}`;
const PAGE_LIMIT = 50;
const MAX_PAGES = 20;

/** Backend phân trang `{items,page,limit,total}` (tối đa 50/trang): gom các trang để lọc/nhóm trên toàn bộ dữ liệu. */
async function fetchAll<T>(path: string, query: Record<string, string | number | undefined> = {}): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const res = await httpClient.get<{ items: T[]; total: number }>(path, { query: { ...query, page, limit: PAGE_LIMIT } });
    all.push(...res.items);
    if (all.length >= res.total || res.items.length === 0) break;
  }
  return all;
}

export const utilitiesHttp: UtilitiesApi = {
  async listRates(ws, buildingId, f = {}) {
    return (await fetchAll<RatePlanResponse>(`${bp(ws, buildingId)}/rates`, { status: f.status, serviceType: f.serviceType })).map(toRate);
  },
  async createRate(ws, buildingId, input) {
    return toRate(await httpClient.post<RatePlanResponse>(`${bp(ws, buildingId)}/rates`, toRateBody(input)));
  },
  async changeRate(ws, buildingId, rate, input) {
    return toRate(await httpClient.patch<RatePlanResponse>(`${bp(ws, buildingId)}/rates/${enc(rate.id)}`, diffRateChange(rate, input)));
  },
  async stopRate(ws, buildingId, rateId, effectiveTo) {
    return toRate(await httpClient.patch<RatePlanResponse>(`${bp(ws, buildingId)}/rates/${enc(rateId)}/stop`, { effectiveTo }));
  },

  async listRoomServices(ws, buildingId, roomId) {
    return (await httpClient.get<RoomServiceResponse[]>(`${rp(ws, buildingId, roomId)}/services`)).map(toRoomService);
  },
  async addRoomService(ws, buildingId, roomId, input) {
    return toRoomService(await httpClient.post<RoomServiceResponse>(`${rp(ws, buildingId, roomId)}/services`, input));
  },
  async stopRoomService(ws, buildingId, roomId, serviceId, effectiveTo) {
    return toRoomService(await httpClient.patch<RoomServiceResponse>(`${rp(ws, buildingId, roomId)}/services/${enc(serviceId)}/stop`, { effectiveTo }));
  },

  async listMeterReadings(ws, buildingId, roomId, f = {}) {
    return (await fetchAll<MeterReadingResponse>(`${rp(ws, buildingId, roomId)}/meter-readings`, { meterType: f.meterType, period: f.period })).map(toMeter);
  },
  async recordMeterReading(ws, buildingId, roomId, input) {
    return toMeter(await httpClient.post<MeterReadingResponse>(`${rp(ws, buildingId, roomId)}/meter-readings`, toMeterBody(input)));
  },
  async adjustMeterReading(ws, buildingId, roomId, readingId, input) {
    return toMeter(await httpClient.patch<MeterReadingResponse>(`${rp(ws, buildingId, roomId)}/meter-readings/${enc(readingId)}/adjust`, toAdjustBody(input)));
  },
};

export const utilitiesApi: UtilitiesApi = env.useMockApi ? utilitiesMock : utilitiesHttp;
