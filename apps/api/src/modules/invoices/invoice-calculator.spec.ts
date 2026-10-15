import { Prisma } from '../../generated/prisma/client';
import {
  buildSegments,
  calculateInvoice,
  contractDaysInPeriod,
  daysInPeriod,
  periodCutoff,
  type CalcAssignment,
  type CalcInput,
  type CalcRate,
} from './invoice-calculator';

const D = (v: string | number) => new Prisma.Decimal(v);
const date = (v: string) => new Date(`${v}T00:00:00.000Z`);
const rate = (
  over: Partial<CalcRate> & Pick<CalcRate, 'code' | 'serviceType' | 'billingUnit'>,
): CalcRate => ({
  id: `rate-${over.code}`,
  name: over.code,
  unitPrice: D('1000'),
  effectiveFrom: date('2026-01-01'),
  effectiveTo: null,
  ...over,
});
const assign = (code: string, from = '2026-01-01', to: string | null = null): CalcAssignment => ({
  code,
  effectiveFrom: date(from),
  effectiveTo: to ? date(to) : null,
});
const base = (over: Partial<CalcInput> = {}): CalcInput => ({
  period: '2026-10',
  contract: {
    monthlyRent: D('3000000'),
    startDate: date('2026-01-01'),
    endDate: date('2027-01-01'),
  },
  rates: [],
  assignments: [],
  meters: {},
  vehiclePlates: [],
  billsVehicles: true,
  occupantCount: null,
  ...over,
});
const rentOf = (input: CalcInput) => calculateInvoice(input).items[0]!;
const itemsOf = (input: CalcInput, code: string) =>
  calculateInvoice(input).items.filter((i) => i.code === code);

describe('calculateInvoice rent', () => {
  it('charges a full month of rent when the contract covers the period', () => {
    const rent = rentOf(base());
    expect(rent.amount.toFixed(0)).toBe('3000000');
    expect([rent.prorationNumerator, rent.prorationDenominator]).toEqual([31, 31]);
  });

  it('prorates by actual days when the contract starts or ends mid-month', () => {
    const start = rentOf(
      base({
        contract: {
          monthlyRent: D('3000000'),
          startDate: date('2026-10-17'),
          endDate: date('2027-01-01'),
        },
      }),
    );
    expect([start.prorationNumerator, start.prorationDenominator]).toEqual([15, 31]);
    expect(start.amount.toFixed(0)).toBe('1451613'); // 1,451,612.9 half-up
    const feb = rentOf(
      base({
        period: '2026-02',
        contract: {
          monthlyRent: D('3000000'),
          startDate: date('2026-01-01'),
          endDate: date('2026-02-14'),
        },
      }),
    );
    expect([feb.prorationNumerator, feb.prorationDenominator]).toEqual([14, 28]);
    expect(feb.amount.toFixed(0)).toBe('1500000');
  });

  it('counts no days outside the contract', () => {
    const c = { monthlyRent: D(1), startDate: date('2026-11-01'), endDate: date('2026-12-01') };
    expect(contractDaysInPeriod('2026-10', c)).toBe(0);
    expect(contractDaysInPeriod('2026-11', c)).toBe(30);
    expect(daysInPeriod('2028-02')).toBe(29);
  });

  it('uses the Asia/Ho_Chi_Minh month boundary as the vehicle cutoff', () => {
    expect(periodCutoff('2026-10').toISOString()).toBe('2026-10-31T17:00:00.000Z');
  });
});

describe('calculateInvoice room service applicability', () => {
  const wifi = rate({
    code: 'WIFI',
    serviceType: 'WIFI',
    billingUnit: 'ROOM',
    unitPrice: D('50000'),
  });

  it('never bills a Building Rate that is not assigned to the room', () => {
    const r = calculateInvoice(base({ rates: [wifi] }));
    expect(r.items.map((i) => i.code)).toEqual(['RENT']);
    expect(r.missing).toEqual([]);
  });

  it('bills an assigned flat fee for the whole month', () => {
    const [item] = itemsOf(base({ rates: [wifi], assignments: [assign('WIFI')] }), 'WIFI');
    expect(item!.amount.toFixed(0)).toBe('50000');
    expect([item!.prorationNumerator, item!.prorationDenominator]).toEqual([31, 31]);
  });

  it('bills only the days a flat fee is assigned', () => {
    const [item] = itemsOf(
      base({ rates: [wifi], assignments: [assign('WIFI', '2026-10-17')] }),
      'WIFI',
    );
    expect([item!.prorationNumerator, item!.prorationDenominator]).toEqual([15, 31]);
    expect(item!.amount.toFixed(0)).toBe('24194'); // 50,000 * 15 / 31 = 24,193.5 -> half up
  });

  it('flags an assigned service that has no price in the period', () => {
    const r = calculateInvoice(base({ assignments: [assign('WIFI')] }));
    expect(r.missing).toEqual([expect.objectContaining({ code: 'WIFI', reason: 'RATE_MISSING' })]);
  });

  it('prices past periods with the version in force then, not the current one', () => {
    const old = rate({
      id: 'old',
      code: 'WIFI',
      serviceType: 'WIFI',
      billingUnit: 'ROOM',
      unitPrice: D('50000'),
      effectiveTo: date('2026-10-01'),
    });
    const next = rate({
      id: 'new',
      code: 'WIFI',
      serviceType: 'WIFI',
      billingUnit: 'ROOM',
      unitPrice: D('80000'),
      effectiveFrom: date('2026-10-01'),
    });
    const sep = itemsOf(
      base({ period: '2026-09', rates: [old, next], assignments: [assign('WIFI')] }),
      'WIFI',
    );
    expect(sep).toHaveLength(1);
    expect(sep[0]!.unitPrice.toFixed(0)).toBe('50000');
  });
});

describe('calculateInvoice mid-period rate changes', () => {
  const v1 = rate({
    id: 'v1',
    code: 'WIFI',
    serviceType: 'WIFI',
    billingUnit: 'ROOM',
    unitPrice: D('31000'),
    effectiveTo: date('2026-10-11'),
  });
  const v2 = rate({
    id: 'v2',
    code: 'WIFI',
    serviceType: 'WIFI',
    billingUnit: 'ROOM',
    unitPrice: D('62000'),
    effectiveFrom: date('2026-10-11'),
  });

  it('splits a flat fee into one snapshot line per price segment', () => {
    const items = itemsOf(base({ rates: [v1, v2], assignments: [assign('WIFI')] }), 'WIFI');
    expect(items).toHaveLength(2);
    expect(items.map((i) => [i.ratePlanId, i.prorationNumerator, i.prorationDenominator])).toEqual([
      ['v1', 10, 31],
      ['v2', 21, 31],
    ]);
    expect(items.map((i) => i.amount.toFixed(0))).toEqual(['10000', '42000']);
    expect(items[0]!.details).toMatchObject({ segmentFrom: '2026-10-01', segmentTo: '2026-10-10' });
    expect(items[1]!.details).toMatchObject({ segmentFrom: '2026-10-11', segmentTo: '2026-10-31' });
  });

  it('does not split or estimate metered usage across price segments', () => {
    const e1 = rate({
      id: 'e1',
      code: 'ELEC',
      serviceType: 'ELECTRICITY',
      billingUnit: 'KWH',
      unitPrice: D('3000'),
      effectiveTo: date('2026-10-16'),
    });
    const e2 = rate({
      id: 'e2',
      code: 'ELEC',
      serviceType: 'ELECTRICITY',
      billingUnit: 'KWH',
      unitPrice: D('4000'),
      effectiveFrom: date('2026-10-16'),
    });
    const r = calculateInvoice(
      base({
        rates: [e1, e2],
        assignments: [assign('ELEC')],
        meters: {
          ELECTRICITY: { id: 'm', revision: 1, previousReading: D(0), currentReading: D(100) },
        },
      }),
    );
    expect(r.items.map((i) => i.code)).toEqual(['RENT']);
    expect(r.missing).toEqual([
      expect.objectContaining({ code: 'ELEC', reason: 'RATE_SEGMENT_CONSUMPTION_UNKNOWN' }),
    ]);
  });

  it('merges contiguous assignments of the same rate version into one segment', () => {
    const segs = buildSegments(
      '2026-10',
      [v2],
      [assign('WIFI', '2026-10-11', '2026-10-20'), assign('WIFI', '2026-10-20')],
    );
    expect(segs).toHaveLength(1);
    expect(segs[0]!.days).toBe(21);
  });
});

describe('calculateInvoice quantity-based services', () => {
  it('rounds each item ROUND_HALF_UP to 1 VND and snapshots meter readings', () => {
    const result = calculateInvoice(
      base({
        rates: [
          rate({
            code: 'ELEC',
            serviceType: 'ELECTRICITY',
            billingUnit: 'KWH',
            unitPrice: D('3500.5'),
          }),
          rate({
            code: 'WATER',
            serviceType: 'WATER',
            billingUnit: 'CUBIC_METER',
            unitPrice: D('0.5'),
          }),
        ],
        assignments: [assign('ELEC'), assign('WATER')],
        meters: {
          ELECTRICITY: {
            id: 'm1',
            revision: 2,
            previousReading: D('100.000'),
            currentReading: D('101.000'),
          },
          WATER: { id: 'm2', revision: 1, previousReading: D('0'), currentReading: D('3') },
        },
      }),
    );
    const elec = result.items.find((i) => i.code === 'ELEC')!;
    const water = result.items.find((i) => i.code === 'WATER')!;
    expect(elec.amount.toFixed(0)).toBe('3501');
    expect(water.amount.toFixed(0)).toBe('2');
    expect(elec.meterRevision).toBe(2);
    expect(elec.details).toMatchObject({ previousReading: '100.000', currentReading: '101.000' });
    expect(result.items.reduce((s, i) => s.add(i.amount), D(0)).toFixed(0)).toBe('3003503');
  });

  it('reports missing meter readings instead of estimating', () => {
    const r = calculateInvoice(
      base({
        rates: [rate({ code: 'ELEC', serviceType: 'ELECTRICITY', billingUnit: 'KWH' })],
        assignments: [assign('ELEC')],
      }),
    );
    expect(r.items.map((i) => i.code)).toEqual(['RENT']);
    expect(r.missing).toEqual([
      { code: 'ELEC', reason: 'METER_READING_MISSING', detail: 'ELECTRICITY' },
    ]);
  });

  it('needs a confirmed occupant count for PERSON rates and snapshots the confirmation', () => {
    const rates = [
      rate({ code: 'TRASH', serviceType: 'TRASH', billingUnit: 'PERSON', unitPrice: D('20000') }),
    ];
    const assignments = [assign('TRASH')];
    expect(calculateInvoice(base({ rates, assignments })).missing).toEqual([
      { code: 'TRASH', reason: 'OCCUPANT_COUNT_MISSING' },
    ]);
    const at = new Date('2026-10-30T01:00:00.000Z');
    const ok = calculateInvoice(
      base({ rates, assignments, occupantCount: 3, occupantConfirmation: { by: 'user-1', at } }),
    );
    const item = ok.items.find((i) => i.code === 'TRASH')!;
    expect(item.amount.toFixed(0)).toBe('60000');
    expect(item.details).toMatchObject({
      occupantCount: 3,
      confirmedBy: 'user-1',
      confirmedAt: at.toISOString(),
    });
  });

  it('does not double-charge water when both CUBIC_METER and PERSON rates apply', () => {
    const r = calculateInvoice(
      base({
        rates: [
          rate({ code: 'WATER_M3', serviceType: 'WATER', billingUnit: 'CUBIC_METER' }),
          rate({ code: 'WATER_HEAD', serviceType: 'WATER', billingUnit: 'PERSON' }),
        ],
        assignments: [assign('WATER_M3'), assign('WATER_HEAD')],
        meters: { WATER: { id: 'm', revision: 1, previousReading: D(0), currentReading: D(5) } },
        occupantCount: 2,
      }),
    );
    expect(r.items.map((i) => i.code)).toEqual(['RENT']);
    expect(r.missing.map((m) => m.reason)).toEqual([
      'WATER_METHOD_CONFLICT',
      'WATER_METHOD_CONFLICT',
    ]);
  });
});

describe('calculateInvoice vehicles', () => {
  const parking = rate({
    code: 'PARKING',
    serviceType: 'PARKING',
    billingUnit: 'VEHICLE',
    unitPrice: D('100000'),
  });
  const withParking = (over: Partial<CalcInput>) =>
    base({ rates: [parking], assignments: [assign('PARKING')], ...over });

  it('bills vehicles per car for the whole month and snapshots plates', () => {
    const [item] = itemsOf(withParking({ vehiclePlates: ['59A-2', '59A-1'] }), 'PARKING');
    expect(item!.itemType).toBe('VEHICLE');
    expect(item!.amount.toFixed(0)).toBe('200000');
    expect(item!.details).toMatchObject({ licensePlates: ['59A-1', '59A-2'] });
    expect(itemsOf(withParking({}), 'PARKING')).toHaveLength(0);
  });

  it('skips vehicles billed on another contract of the same tenant', () => {
    const r = calculateInvoice(withParking({ vehiclePlates: ['59A-1'], billsVehicles: false }));
    expect(r.items.map((i) => i.code)).toEqual(['RENT']);
    expect(r.missing).toEqual([]);
  });

  it('keeps the invoice incomplete while the vehicle-billing contract is ambiguous', () => {
    const r = calculateInvoice(withParking({ vehiclePlates: ['59A-1'], billsVehicles: null }));
    expect(r.items.map((i) => i.code)).toEqual(['RENT']);
    expect(r.missing).toEqual([
      expect.objectContaining({ code: 'PARKING', reason: 'VEHICLE_BILLING_AMBIGUOUS' }),
    ]);
    // no vehicles -> nothing to decide
    expect(calculateInvoice(withParking({ billsVehicles: null })).missing).toEqual([]);
  });
});
