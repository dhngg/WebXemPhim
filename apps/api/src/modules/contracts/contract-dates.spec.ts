import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { businessDateOf, contractPhase, isCancelledBeforeStart } from '@rental/shared';
import { ApplicationException } from '../../common/errors/application-exception';
import { businessToday, businessTodayDate } from '../../common/time/business-date';
import { ContractService } from './services/contract.service';

describe('business date (Asia/Ho_Chi_Minh)', () => {
  it.each([
    ['2026-10-14T16:59:59.999Z', '2026-10-14'], // 23:59:59 VN
    ['2026-10-14T17:00:00.000Z', '2026-10-15'], // 00:00 VN: already the next day
    ['2026-10-14T20:00:00.000Z', '2026-10-15'], // 03:00 VN (UTC still the 14th)
    ['2026-10-15T00:30:00.000Z', '2026-10-15'], // 07:30 VN
    ['2026-10-31T17:00:00.000Z', '2026-11-01'], // month end
    ['2026-12-31T17:00:00.000Z', '2027-01-01'], // year end
    ['2028-02-28T17:00:00.000Z', '2028-02-29'], // leap day
  ])('%s -> %s', (instant, expected) => {
    expect(businessDateOf(new Date(instant))).toBe(expected);
    expect(businessToday(new Date(instant))).toBe(expected);
    expect(businessTodayDate(new Date(instant)).toISOString()).toBe(`${expected}T00:00:00.000Z`);
  });
});

describe('contract phase is derived from the dates, never stored', () => {
  const active = {
    status: 'ACTIVE' as const,
    startDate: '2026-11-01',
    endDate: '2027-10-31',
    endedAt: null,
  };

  it('UPCOMING before startDate, IN_EFFECT on both inclusive boundaries, OVERDUE after endDate', () => {
    expect(contractPhase(active, '2026-10-31')).toBe('UPCOMING');
    expect(contractPhase(active, '2026-11-01')).toBe('IN_EFFECT');
    expect(contractPhase(active, '2027-10-31')).toBe('IN_EFFECT');
    expect(contractPhase(active, '2027-11-01')).toBe('OVERDUE'); // stays ACTIVE until the OWNER ends it
  });

  it('changes phase when the Vietnam day changes, with no job involved', () => {
    // 2026-10-31 23:59:59 in Vietnam is still UPCOMING; one second later it is 2026-11-01 and IN_EFFECT.
    expect(contractPhase(active, businessDateOf(new Date('2026-10-31T16:59:59Z')))).toBe(
      'UPCOMING',
    );
    expect(contractPhase(active, businessDateOf(new Date('2026-10-31T17:00:00Z')))).toBe(
      'IN_EFFECT',
    );
    expect(contractPhase(active, businessDateOf(new Date('2027-10-31T17:00:00Z')))).toBe('OVERDUE');
  });

  it('ENDED when ended on/after its start, CANCELLED when ended before it started', () => {
    const ended = {
      status: 'ENDED' as const,
      startDate: '2026-10-01',
      endDate: '2026-10-14',
      endedAt: '2026-10-14T05:00:00.000Z',
    };
    expect(contractPhase(ended, '2026-12-01')).toBe('ENDED');
    const cancelled = {
      status: 'ENDED' as const,
      startDate: '2026-11-01',
      endDate: '2027-10-31',
      endedAt: '2026-10-15T01:00:00.000Z',
    };
    expect(contractPhase(cancelled, '2026-12-01')).toBe('CANCELLED');
    expect(isCancelledBeforeStart(cancelled)).toBe(true);
    // ended on the very day it started (Vietnam date) is a normal end, one second earlier is a cancellation
    expect(
      isCancelledBeforeStart({
        status: 'ENDED',
        startDate: '2026-10-15',
        endedAt: '2026-10-14T17:00:00.000Z',
      }),
    ).toBe(false);
    expect(
      isCancelledBeforeStart({
        status: 'ENDED',
        startDate: '2026-10-15',
        endedAt: '2026-10-14T16:59:59.000Z',
      }),
    ).toBe(true);
    expect(
      isCancelledBeforeStart({ status: 'ACTIVE', startDate: '2026-11-01', endedAt: null }),
    ).toBe(false);
  });
});

describe('ContractService.create period validation (business dates)', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-14T20:00:00.000Z')); // 2026-10-15 03:00 VN
  });
  afterEach(() => jest.useRealTimers());

  const record = () => ({
    id: 'c',
    workspaceId: 'w',
    roomId: 'r',
    tenantId: 't',
    startDate: new Date('2026-11-01'),
    endDate: new Date('2027-10-31'),
    monthlyRent: { toFixed: () => '1.00' },
    status: 'ACTIVE',
    notes: null,
    endedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    room: { id: 'r', code: 'P1', buildingId: 'b' },
    tenant: { id: 't', fullName: 'A' },
  });
  const create = jest.fn().mockImplementation(async () => record());
  const service = () => new ContractService({ create } as never);
  const body = (startDate: string, endDate: string) => ({
    roomId: 'r',
    tenantId: 't',
    startDate,
    endDate,
    monthlyRent: '1.00',
  });

  it('accepts a future start and returns the derived phase', async () => {
    await expect(
      service().create('w', 'u', body('2026-11-01', '2027-10-31')),
    ).resolves.toMatchObject({ status: 'ACTIVE', phase: 'UPCOMING' });
  });

  it('accepts a start of today and an end of today (Vietnam date), inclusive', async () => {
    await expect(
      service().create('w', 'u', body('2026-10-15', '2026-10-15')),
    ).resolves.toBeDefined();
  });

  it.each([
    ['start after end', '2026-11-02', '2026-11-01'],
    ['already past its end', '2026-09-01', '2026-10-14'],
  ])('rejects a period that is %s', (_label, start, end) => {
    expect(() => service().create('w', 'u', body(start, end))).toThrow(ApplicationException);
  });

  it('rejects impossible calendar dates', () => {
    expect(() => service().create('w', 'u', body('2026-02-30', '2026-12-01'))).toThrow(
      ApplicationException,
    );
  });

  it('end() without endDate is passed through (cancel); a malformed endDate is a validation error', async () => {
    const end = jest.fn().mockResolvedValue(record());
    const svc = new ContractService({ end } as never);
    await svc.end('w', 'u', 'c', {});
    expect(end).toHaveBeenCalledWith('w', 'u', 'c', {});
    expect(() => svc.end('w', 'u', 'c', { endDate: '2026-13-40' })).toThrow(ApplicationException);
  });
});

describe('migration 202610150027 (review-only)', () => {
  const sql = readFileSync(
    resolve(
      __dirname,
      '../../../prisma/migrations/202610150027_contract_dates_room_state_guard/migration.sql',
    ),
    'utf8',
  );

  it('only replaces the room guard function and leaves the exclusion constraint and tables alone', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION "protect_active_contract_room_state"');
    expect(sql).not.toMatch(
      /ALTER TABLE|DROP |CREATE TABLE|CREATE TYPE|ALTER TYPE|UPDATE "|DELETE FROM|INSERT INTO/i,
    );
    expect(sql).not.toContain('EXCLUDE USING');
  });

  it('uses the Asia/Ho_Chi_Minh date, forbids archiving under any ACTIVE contract and vacating only under a started one', () => {
    expect(sql).toContain("NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh'");
    expect(sql).toContain('NEW."status" = \'ARCHIVED\'');
    expect(sql).toContain("NEW.\"status\" IN ('VACANT', 'UNAVAILABLE')");
    expect(sql).toContain('c."start_date" <= business_today');
  });

  it('relies on the original inclusive exclusion constraint, which stays as the only overlap authority', () => {
    const original = readFileSync(
      resolve(
        __dirname,
        '../../../prisma/migrations/202610140010_p06_rental_contracts/migration.sql',
      ),
      'utf8',
    );
    expect(original).toContain('daterange("start_date", "end_date", \'[]\') WITH &&');
    expect(original).toContain('WHERE ("status" = \'ACTIVE\')');
  });
});
