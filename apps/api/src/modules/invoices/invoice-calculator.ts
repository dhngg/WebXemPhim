import type {
  InvoiceItemType,
  InvoiceMissingItem,
  RateBillingUnit,
  RateServiceType,
} from '@rental/shared';
import { Prisma } from '../../generated/prisma/client';

const { Decimal } = Prisma;
type Dec = Prisma.Decimal;

export const ROUNDING_RULE = 'ROUND_HALF_UP_1_VND';
const roundVnd = (value: Dec) => value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

export interface CalcContract {
  monthlyRent: Dec;
  startDate: Date;
  /** Effective last day of the contract, inclusive. */
  endDate: Date;
}
export interface CalcRate {
  id: string;
  code: string;
  name: string;
  serviceType: RateServiceType;
  billingUnit: RateBillingUnit;
  unitPrice: Dec;
  effectiveFrom: Date;
  /** Exclusive end; null = open. */
  effectiveTo: Date | null;
}
/** A Building Rate code configured to apply to the room; exclusive end, null = open. */
export interface CalcAssignment {
  code: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}
export interface CalcMeterReading {
  id: string;
  revision: number;
  previousReading: Dec;
  currentReading: Dec;
}
export interface CalcInput {
  /** YYYY-MM */
  period: string;
  contract: CalcContract;
  /** Rate versions overlapping the period. */
  rates: CalcRate[];
  /** Services assigned to the room that overlap the period; unassigned rates are never billed. */
  assignments: CalcAssignment[];
  meters: { ELECTRICITY?: CalcMeterReading; WATER?: CalcMeterReading };
  vehiclePlates: string[];
  /** true = bill the tenant vehicles here, false = another invoice does, null = undecided. */
  billsVehicles: boolean | null;
  occupantCount: number | null;
  occupantConfirmation?: { by: string; at: Date } | null;
}
export interface CalcItem {
  itemType: InvoiceItemType;
  code: string;
  description: string;
  unit: string;
  quantity: Dec;
  unitPrice: Dec;
  prorationNumerator: number | null;
  prorationDenominator: number | null;
  amount: Dec;
  ratePlanId: string | null;
  meterReadingId: string | null;
  meterRevision: number | null;
  details: Record<string, unknown>;
}
export interface CalcResult {
  items: CalcItem[];
  missing: InvoiceMissingItem[];
}

interface Segment {
  rate: CalcRate;
  from: Date;
  /** Exclusive. */
  to: Date;
  days: number;
}

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
export const periodStart = (period: string) => new Date(`${period}-01T00:00:00.000Z`);
export function nextPeriodStart(period: string) {
  const start = periodStart(period);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
}
/** First instant after the period in Asia/Ho_Chi_Minh (UTC+7, no DST). */
export const periodCutoff = (period: string) =>
  new Date(`${iso(nextPeriodStart(period))}T00:00:00.000+07:00`);
export const daysInPeriod = (period: string) =>
  Math.round((nextPeriodStart(period).getTime() - periodStart(period).getTime()) / DAY);

/** Number of contract days inside the period (inclusive of both ends); 0 when none. */
export function contractDaysInPeriod(period: string, contract: CalcContract) {
  const from = Math.max(contract.startDate.getTime(), periodStart(period).getTime());
  const to = Math.min(contract.endDate.getTime(), nextPeriodStart(period).getTime() - DAY);
  return to < from ? 0 : Math.round((to - from) / DAY) + 1;
}

/**
 * Intersects rate versions with the room assignments inside the month. The result is the exact
 * list of day ranges (and the price in force) a service can be billed for.
 */
export function buildSegments(
  period: string,
  rates: CalcRate[],
  assignments: CalcAssignment[],
): Segment[] {
  const start = periodStart(period).getTime();
  const end = nextPeriodStart(period).getTime();
  const raw: Segment[] = [];
  for (const assignment of assignments) {
    for (const rate of rates) {
      const from = Math.max(
        start,
        assignment.effectiveFrom.getTime(),
        rate.effectiveFrom.getTime(),
      );
      const to = Math.min(
        end,
        assignment.effectiveTo?.getTime() ?? Infinity,
        rate.effectiveTo?.getTime() ?? Infinity,
      );
      if (from < to)
        raw.push({
          rate,
          from: new Date(from),
          to: new Date(to),
          days: Math.round((to - from) / DAY),
        });
    }
  }
  raw.sort((a, b) => a.from.getTime() - b.from.getTime());
  const merged: Segment[] = [];
  for (const seg of raw) {
    const last = merged[merged.length - 1];
    if (last && last.rate.id === seg.rate.id && last.to.getTime() === seg.from.getTime()) {
      last.to = seg.to;
      last.days += seg.days;
    } else merged.push({ ...seg });
  }
  return merged;
}

export function calculateInvoice(input: CalcInput): CalcResult {
  const items: CalcItem[] = [];
  const missing: InvoiceMissingItem[] = [];
  const dim = daysInPeriod(input.period);
  const days = contractDaysInPeriod(input.period, input.contract);
  items.push({
    itemType: 'RENT',
    code: 'RENT',
    description: 'Room rent',
    unit: 'MONTH',
    quantity: new Decimal(1),
    unitPrice: input.contract.monthlyRent,
    prorationNumerator: days,
    prorationDenominator: dim,
    amount: roundVnd(input.contract.monthlyRent.mul(days).div(dim)),
    ratePlanId: null,
    meterReadingId: null,
    meterRevision: null,
    details: { monthlyRent: input.contract.monthlyRent.toFixed(2), days, daysInPeriod: dim },
  });

  const codes = [...new Set(input.assignments.map((a) => a.code))].sort((a, b) =>
    a.localeCompare(b),
  );
  const plans = codes.map((code) => ({
    code,
    segments: buildSegments(
      input.period,
      input.rates.filter((r) => r.code === code),
      input.assignments.filter((a) => a.code === code),
    ),
  }));

  const waterUnits = new Set(
    plans
      .map((p) => p.segments[0]?.rate)
      .filter(
        (r): r is CalcRate =>
          !!r && r.serviceType === 'WATER' && ['CUBIC_METER', 'PERSON'].includes(r.billingUnit),
      )
      .map((r) => r.billingUnit),
  );

  for (const { code, segments } of plans) {
    const first = segments[0];
    if (!first) {
      missing.push({
        code,
        reason: 'RATE_MISSING',
        detail: 'No rate version is in effect while the service is assigned to the room',
      });
      continue;
    }
    const rate = first.rate;
    if (
      segments.some(
        (s) => s.rate.billingUnit !== rate.billingUnit || s.rate.serviceType !== rate.serviceType,
      )
    ) {
      missing.push({
        code,
        reason: 'RATE_CHANGE_NOT_SPLITTABLE',
        detail: 'Service type or unit changes within the period',
      });
      continue;
    }
    const type: InvoiceItemType =
      rate.serviceType === 'ELECTRICITY'
        ? 'ELECTRICITY'
        : rate.serviceType === 'WATER'
          ? 'WATER'
          : rate.billingUnit === 'VEHICLE'
            ? 'VEHICLE'
            : 'SERVICE';
    const line = (seg: Segment, quantity: Dec, extra: Partial<CalcItem> = {}): CalcItem => ({
      itemType: type,
      code,
      description: seg.rate.name,
      unit: seg.rate.billingUnit,
      quantity,
      unitPrice: seg.rate.unitPrice,
      prorationNumerator: null,
      prorationDenominator: null,
      amount: roundVnd(quantity.mul(seg.rate.unitPrice)),
      ratePlanId: seg.rate.id,
      meterReadingId: null,
      meterRevision: null,
      details: { segmentFrom: iso(seg.from), segmentTo: iso(new Date(seg.to.getTime() - DAY)) },
      ...extra,
    });

    if (rate.billingUnit === 'ROOM' || rate.billingUnit === 'FIXED') {
      // Flat monthly fee: one line per price segment, pro-rated by the days it was in force.
      for (const seg of segments)
        items.push(
          line(seg, new Decimal(1), {
            prorationNumerator: seg.days,
            prorationDenominator: dim,
            amount: roundVnd(seg.rate.unitPrice.mul(seg.days).div(dim)),
            details: {
              segmentFrom: iso(seg.from),
              segmentTo: iso(new Date(seg.to.getTime() - DAY)),
              days: seg.days,
              daysInPeriod: dim,
            },
          }),
        );
      continue;
    }

    // Quantity-based services need a single price covering the whole month: usage inside a price
    // segment is unknown, so it is never split or estimated.
    const metered = rate.billingUnit === 'KWH' || rate.billingUnit === 'CUBIC_METER';
    if (segments.length > 1) {
      missing.push({
        code,
        reason: metered ? 'RATE_SEGMENT_CONSUMPTION_UNKNOWN' : 'RATE_CHANGE_NOT_SPLITTABLE',
        detail: `${segments.length} price segments: ${segments.map((s) => `${iso(s.from)}..${iso(new Date(s.to.getTime() - DAY))}`).join(', ')}`,
      });
      continue;
    }
    if (first.days !== dim) {
      missing.push({
        code,
        reason: 'RATE_PERIOD_MISMATCH',
        detail: 'Rate and room assignment do not cover the whole period',
      });
      continue;
    }

    if (rate.serviceType === 'WATER' && waterUnits.size > 1 && waterUnits.has(rate.billingUnit)) {
      missing.push({
        code,
        reason: 'WATER_METHOD_CONFLICT',
        detail: 'Both CUBIC_METER and PERSON water rates apply',
      });
      continue;
    }
    if (metered) {
      const meterType = rate.billingUnit === 'KWH' ? 'ELECTRICITY' : 'WATER';
      if (rate.serviceType !== meterType) {
        missing.push({
          code,
          reason: 'RATE_UNIT_UNSUPPORTED',
          detail: `${rate.billingUnit} requires a ${meterType} service type`,
        });
        continue;
      }
      const reading = input.meters[meterType];
      if (!reading) {
        missing.push({ code, reason: 'METER_READING_MISSING', detail: meterType });
        continue;
      }
      items.push(
        line(first, reading.currentReading.sub(reading.previousReading), {
          meterReadingId: reading.id,
          meterRevision: reading.revision,
          details: {
            meterType,
            previousReading: reading.previousReading.toFixed(3),
            currentReading: reading.currentReading.toFixed(3),
            segmentFrom: iso(first.from),
            segmentTo: iso(new Date(first.to.getTime() - DAY)),
          },
        }),
      );
    } else if (rate.billingUnit === 'PERSON') {
      if (input.occupantCount === null) {
        missing.push({ code, reason: 'OCCUPANT_COUNT_MISSING' });
        continue;
      }
      items.push(
        line(first, new Decimal(input.occupantCount), {
          details: {
            occupantCount: input.occupantCount,
            confirmedBy: input.occupantConfirmation?.by ?? null,
            confirmedAt: input.occupantConfirmation?.at.toISOString() ?? null,
            segmentFrom: iso(first.from),
            segmentTo: iso(new Date(first.to.getTime() - DAY)),
          },
        }),
      );
    } else if (rate.billingUnit === 'VEHICLE') {
      if (input.vehiclePlates.length === 0 || input.billsVehicles === false) continue;
      if (input.billsVehicles === null) {
        missing.push({
          code,
          reason: 'VEHICLE_BILLING_AMBIGUOUS',
          detail:
            'Tenant has several contracts in the period; confirm which invoice bills the vehicles',
        });
        continue;
      }
      const plates = [...input.vehiclePlates].sort();
      items.push(
        line(first, new Decimal(plates.length), {
          details: {
            licensePlates: plates,
            segmentFrom: iso(first.from),
            segmentTo: iso(new Date(first.to.getTime() - DAY)),
          },
        }),
      );
    }
  }
  return { items, missing };
}
