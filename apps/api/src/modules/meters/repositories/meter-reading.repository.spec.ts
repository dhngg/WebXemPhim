import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Prisma } from '../../../generated/prisma/client';
import {
  MeterReadingDuplicateRepositoryError,
  MeterReadingInvalidRepositoryError,
  MeterReadingNotEligibleRepositoryError,
  MeterReadingRepository,
} from './meter-reading.repository';

const D = (v: string) => new Prisma.Decimal(v);
const input = { meterType: 'ELECTRICITY' as const, period: '2026-11', currentReading: '150.500' };
const scope = (roomStatus = 'VACANT', buildingStatus = 'ACTIVE', role = 'OWNER') => ({
  $queryRaw: jest
    .fn()
    .mockResolvedValueOnce([{ status: 'ACTIVE' }])
    .mockResolvedValueOnce([{ status: buildingStatus }])
    .mockResolvedValueOnce([{ status: roomStatus }]),
  workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role }) },
});
const repo = (tx: object) =>
  new MeterReadingRepository({ $transaction: (fn: (t: object) => unknown) => fn(tx) } as never);
const latest = { period: new Date('2026-10-01'), currentReading: D('100.000') };

describe('MeterReadingRepository', () => {
  it('creates using the previous period as the opening value', async () => {
    const create = jest.fn().mockResolvedValue({});
    const tx = {
      ...scope(),
      meterReading: { findFirst: jest.fn().mockResolvedValue(latest), create },
    };
    await repo(tx).create('w', 'u', 'b', 'r', input);
    const data = create.mock.calls[0][0].data;
    expect(data.previousReading.toString()).toBe('100');
    expect(data.currentReading.toString()).toBe('150.5');
  });
  it('requires an opening reading for the first period', async () => {
    const tx = { ...scope(), meterReading: { findFirst: jest.fn().mockResolvedValue(null) } };
    await expect(repo(tx).create('w', 'u', 'b', 'r', input)).rejects.toBeInstanceOf(
      MeterReadingInvalidRepositoryError,
    );
  });
  it('rejects duplicate periods, earlier periods and decreasing readings', async () => {
    const run = (found: object, body = input) =>
      repo({ ...scope(), meterReading: { findFirst: jest.fn().mockResolvedValue(found) } }).create(
        'w',
        'u',
        'b',
        'r',
        body,
      );
    await expect(run({ ...latest, period: new Date('2026-11-01') })).rejects.toBeInstanceOf(
      MeterReadingDuplicateRepositoryError,
    );
    await expect(run({ ...latest, period: new Date('2026-12-01') })).rejects.toBeInstanceOf(
      MeterReadingInvalidRepositoryError,
    );
    await expect(run(latest, { ...input, currentReading: '99.999' })).rejects.toBeInstanceOf(
      MeterReadingInvalidRepositoryError,
    );
  });
  it('blocks writes for STAFF, archived rooms and archived buildings', async () => {
    const tx = (s: ReturnType<typeof scope>) => ({ ...s, meterReading: { findFirst: jest.fn() } });
    await expect(
      repo(tx(scope('ARCHIVED'))).create('w', 'u', 'b', 'r', input),
    ).rejects.toBeInstanceOf(MeterReadingNotEligibleRepositoryError);
    await expect(
      repo(tx(scope('VACANT', 'ARCHIVED'))).create('w', 'u', 'b', 'r', input),
    ).rejects.toBeInstanceOf(MeterReadingNotEligibleRepositoryError);
    const staff = scope('VACANT', 'ACTIVE', 'STAFF');
    await expect(repo(tx(staff)).create('w', 'u', 'b', 'r', input)).rejects.toThrow();
  });
  describe('adjust', () => {
    const reading = {
      id: 'x',
      roomId: 'r',
      meterType: 'ELECTRICITY',
      period: new Date('2026-11-01'),
      previousReading: D('100'),
      currentReading: D('150'),
      revision: 1,
    };
    const adjustTx = (later: object | null, earlier: object | null) => {
      const s = scope();
      s.$queryRaw.mockResolvedValueOnce([{ id: 'x' }]);
      return {
        ...s,
        meterReading: {
          findUniqueOrThrow: jest.fn().mockResolvedValue(reading),
          findFirst: jest.fn().mockResolvedValueOnce(later).mockResolvedValueOnce(earlier),
          update: jest.fn().mockResolvedValue({}),
        },
        meterReadingAdjustment: { create: jest.fn().mockResolvedValue({}) },
      };
    };
    it('keeps old values in an append-only adjustment and bumps the revision', async () => {
      const tx = adjustTx(null, { id: 'e' });
      await repo(tx).adjust('w', 'u', 'b', 'r', 'x', { currentReading: '160', reason: 'typo' });
      const data = tx.meterReadingAdjustment.create.mock.calls[0][0].data;
      expect(data.revision).toBe(2);
      expect(data.oldCurrentReading.toString()).toBe('150');
      expect(data.newCurrentReading.toString()).toBe('160');
      expect(tx.meterReading.update.mock.calls[0][0].data.revision).toBe(2);
    });
    it('rejects non-latest, decreasing, unchanged and non-opening previous edits', async () => {
      const bad = (tx: ReturnType<typeof adjustTx>, body: object) =>
        expect(
          repo(tx).adjust('w', 'u', 'b', 'r', 'x', { reason: 'r', currentReading: '160', ...body }),
        ).rejects.toBeInstanceOf(MeterReadingInvalidRepositoryError);
      await bad(adjustTx({ id: 'n' }, null), {});
      await bad(adjustTx(null, null), { currentReading: '99' });
      await bad(adjustTx(null, null), { currentReading: '150' });
      await bad(adjustTx(null, { id: 'e' }), { previousReading: '90' });
    });
  });
});

describe('P07-02 meter reading migration', () => {
  const sql = readFileSync(
    resolve(
      __dirname,
      '../../../../prisma/migrations/202610140013_p07_meter_readings/migration.sql',
    ),
    'utf8',
  );
  it('uses Decimal, unique periods and monotonic readings', () => {
    expect(sql).toContain('DECIMAL(14,3)');
    expect(sql).toContain('"meter_readings_room_type_period_key"');
    expect(sql).toContain('"current_reading" >= "previous_reading"');
  });
  it('keeps room scope exact and history immutable', () => {
    expect(sql).toContain('FOREIGN KEY ("room_id", "building_id", "workspace_id")');
    expect(sql).toContain('meter_readings_prevent_hard_delete');
    expect(sql).toContain('meter_reading_adjustments_append_only');
  });
});
