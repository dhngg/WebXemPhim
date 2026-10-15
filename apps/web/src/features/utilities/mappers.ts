import type {
  CreateMeterReadingRequest,
  CreateRatePlanRequest,
  MeterReadingResponse,
  RatePlanResponse,
  RoomServiceResponse,
  UpdateRatePlanRequest,
} from '@rental/shared';
import type {
  MeterAdjustInput,
  MeterInput,
  MeterReadingItem,
  MeterType,
  RateChangeInput,
  RateInput,
  RatePlanItem,
  RoomServiceItem,
} from './types';

const DECIMAL = /^\d+(?:\.\d+)?$/;

/** Mã dịch vụ chuẩn hóa giống backend: chữ hoa, ký tự lạ → "_", bỏ "_" ở hai đầu. */
export const normalizeRateCode = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

/** So sánh hai chuỗi thập phân không âm theo giá trị, không qua số thực: -1 | 0 | 1. */
export function compareDecimal(a: string, b: string): -1 | 0 | 1 {
  const [ai = '0', af = ''] = a.split('.');
  const [bi = '0', bf = ''] = b.split('.');
  const ni = ai.replace(/^0+(?=\d)/, '');
  const nj = bi.replace(/^0+(?=\d)/, '');
  if (ni.length !== nj.length) return ni.length < nj.length ? -1 : 1;
  if (ni !== nj) return ni < nj ? -1 : 1;
  const len = Math.max(af.length, bf.length);
  const xf = af.padEnd(len, '0');
  const yf = bf.padEnd(len, '0');
  return xf === yf ? 0 : xf < yf ? -1 : 1;
}

/** Bỏ các số 0 thừa ở phần lẻ: "3500.0000" → "3500", "12.500" → "12.5". */
export function trimDecimal(value: string): string {
  if (!DECIMAL.test(value)) return value;
  const [int = '0', frac = ''] = value.split('.');
  const f = frac.replace(/0+$/, '');
  return f ? `${int}.${f}` : int;
}

/** Hiển thị kiểu Việt Nam: "1234567.5000" → "1.234.567,5". Không làm tròn. */
export function formatDecimal(value: string): string {
  if (!DECIMAL.test(value)) return '—';
  const [int = '0', frac = ''] = trimDecimal(value).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return frac ? `${grouped},${frac}` : grouped;
}

export const formatUnitPrice = (value: string) => (DECIMAL.test(value) ? `${formatDecimal(value)} ₫` : '—');

const opt = (v: string | null | undefined) => (v === null || v === undefined || v === '' ? undefined : v);

export function toRate(dto: RatePlanResponse): RatePlanItem {
  return {
    id: dto.id,
    buildingId: dto.buildingId,
    code: dto.code,
    name: dto.name,
    serviceType: dto.serviceType,
    billingUnit: dto.billingUnit,
    unitPrice: dto.unitPrice,
    effectiveFrom: dto.effectiveFrom,
    effectiveTo: opt(dto.effectiveTo),
    status: dto.status,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export const toRateBody = (input: RateInput): CreateRatePlanRequest => ({
  code: normalizeRateCode(input.code),
  name: input.name.trim(),
  serviceType: input.serviceType,
  billingUnit: input.billingUnit,
  unitPrice: input.unitPrice.trim(),
  effectiveFrom: input.effectiveFrom,
});

/** Đổi giá: luôn gửi đơn giá + ngày áp dụng; chỉ gửi tên/loại/đơn vị nếu thật sự khác bản hiện tại. */
export function diffRateChange(
  current: Pick<RatePlanItem, 'name' | 'serviceType' | 'billingUnit'>,
  next: RateChangeInput,
): UpdateRatePlanRequest {
  const body: UpdateRatePlanRequest = { unitPrice: next.unitPrice.trim(), effectiveFrom: next.effectiveFrom };
  const name = next.name?.trim();
  if (name !== undefined && name !== current.name) body.name = name;
  if (next.serviceType !== undefined && next.serviceType !== current.serviceType) body.serviceType = next.serviceType;
  if (next.billingUnit !== undefined && next.billingUnit !== current.billingUnit) body.billingUnit = next.billingUnit;
  return body;
}

export function toRoomService(dto: RoomServiceResponse): RoomServiceItem {
  return {
    id: dto.id,
    buildingId: dto.buildingId,
    roomId: dto.roomId,
    rateCode: dto.rateCode,
    effectiveFrom: dto.effectiveFrom,
    effectiveTo: opt(dto.effectiveTo),
    createdAt: dto.createdAt,
  };
}

export function toMeter(dto: MeterReadingResponse): MeterReadingItem {
  return {
    id: dto.id,
    buildingId: dto.buildingId,
    roomId: dto.roomId,
    meterType: dto.meterType,
    period: dto.period,
    previousReading: dto.previousReading,
    currentReading: dto.currentReading,
    consumption: dto.consumption,
    revision: dto.revision,
    adjustments: (dto.adjustments ?? []).map((a) => ({
      id: a.id,
      revision: a.revision,
      oldPreviousReading: a.oldPreviousReading,
      oldCurrentReading: a.oldCurrentReading,
      newPreviousReading: a.newPreviousReading,
      newCurrentReading: a.newCurrentReading,
      reason: a.reason,
      createdAt: a.createdAt,
    })),
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export function toMeterBody(input: MeterInput): CreateMeterReadingRequest {
  const body: CreateMeterReadingRequest = { meterType: input.meterType, period: input.period, currentReading: input.currentReading.trim() };
  if (input.previousReading !== undefined && input.previousReading.trim() !== '') body.previousReading = input.previousReading.trim();
  return body;
}

export function toAdjustBody(input: MeterAdjustInput) {
  const body: { currentReading: string; previousReading?: string; reason: string } = {
    currentReading: input.currentReading.trim(),
    reason: input.reason.trim(),
  };
  if (input.previousReading !== undefined && input.previousReading.trim() !== '') body.previousReading = input.previousReading.trim();
  return body;
}

// ------------------------------------------------------------ quy tắc chỉ số (để UI dẫn đường; backend quyết định)
export const readingsOf = (all: MeterReadingItem[], meterType: MeterType) => all.filter((r) => r.meterType === meterType);

/** Chỉ số của kỳ mới nhất của một loại đồng hồ. */
export function latestReading(all: MeterReadingItem[], meterType: MeterType): MeterReadingItem | undefined {
  return readingsOf(all, meterType).reduce<MeterReadingItem | undefined>((a, r) => (!a || r.period > a.period ? r : a), undefined);
}

export type MeterCellPlan =
  | { kind: 'recorded'; reading: MeterReadingItem; canAdjust: boolean; isFirst: boolean }
  | { kind: 'empty'; canRecord: true; needsPrevious: boolean; previous?: string }
  | { kind: 'empty'; canRecord: false; reason: string };

/**
 * Ô (phòng, loại đồng hồ, kỳ):
 * - đã ghi → chỉ chỉnh được khi là kỳ MỚI NHẤT (các kỳ sau nối chuỗi vào chỉ số này); đổi "số cũ" chỉ khi chưa có kỳ trước;
 * - chưa ghi → ghi được nếu kỳ lớn hơn kỳ mới nhất; lần đầu phải nhập số cũ, các lần sau lấy chỉ số mới của kỳ trước.
 */
export function planMeterCell(all: MeterReadingItem[], meterType: MeterType, period: string): MeterCellPlan {
  const list = readingsOf(all, meterType);
  const here = list.find((r) => r.period === period);
  const latest = latestReading(all, meterType);
  if (here) {
    return { kind: 'recorded', reading: here, canAdjust: latest?.id === here.id, isFirst: !list.some((r) => r.period < period) };
  }
  if (latest && latest.period > period) {
    return { kind: 'empty', canRecord: false, reason: 'Đã có chỉ số của kỳ sau nên không ghi bù kỳ này.' };
  }
  return latest
    ? { kind: 'empty', canRecord: true, needsPrevious: false, previous: latest.currentReading }
    : { kind: 'empty', canRecord: true, needsPrevious: true };
}
