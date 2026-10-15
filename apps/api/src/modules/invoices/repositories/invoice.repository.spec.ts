import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Prisma } from '../../../generated/prisma/client';
import { WorkspaceNotFoundRepositoryError } from '../../workspaces/repositories/workspace.repository';
import {
  InvoiceDuplicateRepositoryError,
  InvoiceIncompleteRepositoryError,
  InvoiceNotEditableRepositoryError,
  InvoiceNotEligibleRepositoryError,
  InvoicePeriodInvalidRepositoryError,
  InvoiceRepository,
  InvoiceVehicleBillingConflictRepositoryError,
} from './invoice.repository';

const D = (v: string) => new Prisma.Decimal(v);
const scope = (role = 'OWNER', buildingStatus = 'ACTIVE') => ({
  $queryRaw: jest
    .fn()
    .mockResolvedValueOnce([{ status: 'ACTIVE' }])
    .mockResolvedValueOnce([{ status: buildingStatus }]),
  workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role }) },
});
const repo = (tx: object) =>
  new InvoiceRepository({ $transaction: (fn: (t: object) => unknown) => fn(tx) } as never);
const contract = {
  id: 'c1',
  workspaceId: 'w',
  roomId: 'r',
  tenantId: 't',
  monthlyRent: D('3000000'),
  startDate: new Date('2026-01-01'),
  endDate: new Date('2027-01-01'),
};
const rateRow = (over: object) => ({
  id: 'r1',
  code: 'X',
  name: 'X',
  serviceType: 'WIFI',
  billingUnit: 'ROOM',
  unitPrice: D('50000'),
  effectiveFrom: new Date('2026-01-01'),
  effectiveTo: null,
  ...over,
});
const assignmentRow = (rateCode: string) => ({
  rateCode,
  effectiveFrom: new Date('2026-01-01'),
  effectiveTo: null,
});
const dataTx = (extra: Record<string, unknown> = {}) => ({
  ratePlan: { findMany: jest.fn().mockResolvedValue([]) },
  roomServiceAssignment: { findMany: jest.fn().mockResolvedValue([]) },
  meterReading: { findMany: jest.fn().mockResolvedValue([]) },
  vehicle: { findMany: jest.fn().mockResolvedValue([]) },
  invoiceItem: { deleteMany: jest.fn(), createMany: jest.fn() },
  ...extra,
});
const input = { contractId: 'c1', period: '2026-10' };

const createTx = (over: Record<string, unknown> = {}, contractCount = 1) => {
  const created = { id: 'i1' };
  const tx = {
    ...scope(),
    ...dataTx(),
    contract: {
      findFirst: jest.fn().mockResolvedValue(contract),
      findMany: jest
        .fn()
        .mockResolvedValue(
          Array.from({ length: contractCount }, () => ({
            status: 'ACTIVE',
            startDate: new Date('2026-01-01'),
            endedAt: null,
          })),
        ),
    },
    invoice: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(created),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ ...created, items: [] }),
    },
    ...over,
  };
  return tx;
};

describe('InvoiceRepository.create', () => {
  it('creates a DRAFT with a rent item, tenant snapshot and no final total', async () => {
    const tx = createTx();
    await repo(tx).create('w', 'u', 'b', input);
    const data = tx.invoice.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      roomId: 'r',
      contractId: 'c1',
      tenantId: 't',
      buildingId: 'b',
      workspaceId: 'w',
      billsVehicles: true,
    });
    expect(data.totalAmount).toBeUndefined();
    const items = tx.invoiceItem.createMany.mock.calls[0][0].data;
    expect(items[0]).toMatchObject({ code: 'RENT', sortOrder: 1 });
    expect(items[0].amount.toFixed(0)).toBe('3000000');
  });

  it('bills only room-assigned services, not every Building Rate', async () => {
    const tx = createTx();
    tx.ratePlan.findMany.mockResolvedValue([
      rateRow({ id: 'a', code: 'WIFI' }),
      rateRow({ id: 'b', code: 'TRASH', serviceType: 'TRASH' }),
    ]);
    tx.roomServiceAssignment.findMany.mockResolvedValue([assignmentRow('WIFI')]);
    await repo(tx).create('w', 'u', 'b', input);
    const codes = tx.invoiceItem.createMany.mock.calls[0][0].data.map(
      (i: { code: string }) => i.code,
    );
    expect(codes).toEqual(['RENT', 'WIFI']);
  });

  it('stores who confirmed the occupant count and when', async () => {
    const tx = createTx();
    await repo(tx).create('w', 'u', 'b', { ...input, occupantCount: 3 });
    const data = tx.invoice.create.mock.calls[0][0].data;
    expect(data.occupantCount).toBe(3);
    expect(data.occupantCountConfirmedBy).toBe('u');
    expect(data.occupantCountConfirmedAt).toBeInstanceOf(Date);
  });

  it('rejects a second invoice for the same contract and period', async () => {
    const tx = createTx({ invoice: { findUnique: jest.fn().mockResolvedValue({ id: 'i1' }) } });
    await expect(repo(tx).create('w', 'u', 'b', input)).rejects.toBeInstanceOf(
      InvoiceDuplicateRepositoryError,
    );
  });

  it('maps a concurrent unique violation to a duplicate', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'x',
    });
    const tx = createTx();
    tx.invoice.create.mockRejectedValue(error);
    await expect(repo(tx).create('w', 'u', 'b', input)).rejects.toBeInstanceOf(
      InvoiceDuplicateRepositoryError,
    );
  });

  describe('date-based contracts', () => {
    const withContract = (over: object, overlapping: object[] = []) =>
      createTx({
        contract: {
          findFirst: jest.fn().mockResolvedValue({ ...contract, ...over }),
          findMany: jest.fn().mockResolvedValue(overlapping),
        },
      });
    const future = { startDate: new Date('2026-11-15'), endDate: new Date('2027-11-14') };

    it('never bills the time before startDate: a period entirely before the start is refused', async () => {
      const tx = withContract(future);
      await expect(
        repo(tx).create('w', 'u', 'b', { contractId: 'c1', period: '2026-10' }),
      ).rejects.toBeInstanceOf(InvoicePeriodInvalidRepositoryError);
      expect(tx.invoice.create).not.toHaveBeenCalled();
    });

    it('bills only the days from startDate (inclusive) in the period that contains it', async () => {
      const tx = withContract(future);
      await repo(tx).create('w', 'u', 'b', { contractId: 'c1', period: '2026-11' });
      const rent = tx.invoiceItem.createMany.mock.calls[0][0].data[0];
      expect(rent).toMatchObject({ code: 'RENT' });
      // 15..30 November = 16 of 30 days
      expect(rent.amount.toFixed(0)).toBe('1600000');
    });

    it('refuses to bill a contract cancelled before it started, even for the period it had registered', async () => {
      const tx = withContract({
        ...future,
        status: 'ENDED',
        endedAt: new Date('2026-10-20T03:00:00.000Z'),
      });
      await expect(
        repo(tx).create('w', 'u', 'b', { contractId: 'c1', period: '2026-12' }),
      ).rejects.toBeInstanceOf(InvoicePeriodInvalidRepositoryError);
      expect(tx.invoice.create).not.toHaveBeenCalled();
    });

    it('still bills a contract that was ended normally, up to its effective end date', async () => {
      const tx = withContract({
        startDate: new Date('2026-10-01'),
        endDate: new Date('2026-10-10'),
        status: 'ENDED',
        endedAt: new Date('2026-10-10T03:00:00.000Z'),
      });
      await repo(tx).create('w', 'u', 'b', { contractId: 'c1', period: '2026-10' });
      expect(tx.invoiceItem.createMany.mock.calls[0][0].data[0].amount.toFixed(0)).toBe('967742'); // 10/31 days
    });

    it('ignores a cancelled contract when deciding whether a tenant has several contracts in the period', async () => {
      const cancelled = {
        status: 'ENDED',
        startDate: new Date('2026-10-20'),
        endedAt: new Date('2026-10-05T03:00:00.000Z'),
      };
      const current = { status: 'ACTIVE', startDate: new Date('2026-01-01'), endedAt: null };
      const tx = withContract({}, [current, cancelled]);
      await repo(tx).create('w', 'u', 'b', input);
      expect(tx.invoice.create.mock.calls[0][0].data.billsVehicles).toBe(true);
    });
  });

  it('blocks STAFF writes and archived buildings', async () => {
    await expect(repo(scope('STAFF')).create('w', 'u', 'b', input)).rejects.toBeInstanceOf(
      WorkspaceNotFoundRepositoryError,
    );
    await expect(
      repo(scope('OWNER', 'ARCHIVED')).create('w', 'u', 'b', input),
    ).rejects.toBeInstanceOf(InvoiceNotEligibleRepositoryError);
  });

  describe('vehicle billing across several contracts of one tenant', () => {
    const withParking = (tx: ReturnType<typeof createTx>) => {
      tx.ratePlan.findMany.mockResolvedValue([
        rateRow({
          code: 'PARKING',
          serviceType: 'PARKING',
          billingUnit: 'VEHICLE',
          unitPrice: D('100000'),
        }),
      ]);
      tx.roomServiceAssignment.findMany.mockResolvedValue([assignmentRow('PARKING')]);
      tx.vehicle.findMany.mockResolvedValue([{ licensePlate: '59A-1' }]);
      return tx;
    };
    it('stays incomplete until the manager says which invoice bills the vehicles', async () => {
      const tx = withParking(createTx({}, 2));
      await repo(tx).create('w', 'u', 'b', input);
      const data = tx.invoice.create.mock.calls[0][0].data;
      expect(data.billsVehicles).toBeNull();
      expect(data.missingItems).toEqual([
        expect.objectContaining({ code: 'PARKING', reason: 'VEHICLE_BILLING_AMBIGUOUS' }),
      ]);
    });
    it('bills the vehicles on the invoice the manager picks', async () => {
      const tx = withParking(createTx({}, 2));
      await repo(tx).create('w', 'u', 'b', { ...input, billVehicles: true });
      const items = tx.invoiceItem.createMany.mock.calls[0][0].data;
      expect(items.map((i: { code: string }) => i.code)).toEqual(['RENT', 'PARKING']);
      expect(tx.invoice.create.mock.calls[0][0].data.billsVehicles).toBe(true);
    });
    it('refuses a second invoice claiming the same tenant vehicles', async () => {
      const tx = withParking(createTx({}, 2));
      tx.invoice.findFirst.mockResolvedValue({ id: 'other' });
      await expect(
        repo(tx).create('w', 'u', 'b', { ...input, billVehicles: true }),
      ).rejects.toBeInstanceOf(InvoiceVehicleBillingConflictRepositoryError);
    });
    it('maps the database exclusion race to the same conflict', async () => {
      const tx = withParking(createTx({}, 2));
      tx.invoice.create.mockRejectedValue(
        new Error('violates exclusion constraint "invoices_vehicle_billing_excl"'),
      );
      await expect(
        repo(tx).create('w', 'u', 'b', { ...input, billVehicles: true }),
      ).rejects.toBeInstanceOf(InvoiceVehicleBillingConflictRepositoryError);
    });
  });
});

describe('InvoiceRepository.issue', () => {
  const issueTx = (status: string) => {
    const s = scope();
    s.$queryRaw.mockResolvedValueOnce([{ status }]);
    return {
      ...s,
      ...dataTx(),
      contract: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(contract),
        findMany: jest
          .fn()
          .mockResolvedValue([
            { status: 'ACTIVE', startDate: new Date('2026-01-01'), endedAt: null },
          ]),
      },
      invoice: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'i1',
          contractId: 'c1',
          buildingId: 'b',
          period: new Date('2026-10-01'),
          occupantCount: null,
          occupantCountConfirmedBy: null,
          occupantCountConfirmedAt: null,
          billsVehicles: null,
        }),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
    };
  };
  const elecRate = rateRow({
    code: 'ELEC',
    serviceType: 'ELECTRICITY',
    billingUnit: 'KWH',
    unitPrice: D('3500.5'),
  });

  it('refuses already issued invoices', async () => {
    await expect(repo(issueTx('ISSUED')).issue('w', 'u', 'b', 'i1')).rejects.toBeInstanceOf(
      InvoiceNotEditableRepositoryError,
    );
  });

  it('refuses to issue while rates, meters or quantities are missing', async () => {
    const tx = issueTx('DRAFT');
    tx.ratePlan.findMany.mockResolvedValue([elecRate]);
    tx.roomServiceAssignment.findMany.mockResolvedValue([assignmentRow('ELEC')]);
    await expect(repo(tx).issue('w', 'u', 'b', 'i1')).rejects.toBeInstanceOf(
      InvoiceIncompleteRepositoryError,
    );
    expect(tx.invoice.update).not.toHaveBeenCalled();
  });

  it('freezes a complete invoice with a total equal to the sum of rounded items', async () => {
    const tx = issueTx('DRAFT');
    tx.ratePlan.findMany.mockResolvedValue([elecRate]);
    tx.roomServiceAssignment.findMany.mockResolvedValue([assignmentRow('ELEC')]);
    tx.meterReading.findMany.mockResolvedValue([
      {
        id: 'm1',
        meterType: 'ELECTRICITY',
        revision: 1,
        previousReading: D('0'),
        currentReading: D('1'),
      },
    ]);
    await repo(tx).issue('w', 'u', 'b', 'i1');
    const data = tx.invoice.update.mock.calls[0][0].data;
    expect(data.status).toBe('ISSUED');
    expect(data.totalAmount.toFixed(0)).toBe('3003501');
    expect(data.issuedBy).toBe('u');
  });
});

describe('P08 invoice migrations', () => {
  const read = (name: string) =>
    readFileSync(resolve(__dirname, `../../../../prisma/migrations/${name}/migration.sql`), 'utf8');
  const m14 = read('202610140014_p08_invoice_foundation');
  const m15 = read('202610140015_p08_billing_rules');

  it('014 keeps one invoice per contract and period with exact scope', () => {
    expect(m14).toContain('"invoices_contract_period_key"');
    expect(m14).toContain('FOREIGN KEY ("room_id", "building_id", "workspace_id")');
    expect(m14).toContain('"total_amount" DECIMAL(14,0)');
    expect(m14).toContain('issued invoices are immutable');
    expect(m14).toContain('items of issued invoices are immutable');
  });

  it('015 is additive: no table or column of earlier migrations is dropped', () => {
    expect(m15).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
    expect(m15).not.toMatch(/\bDELETE\s+FROM\b|TRUNCATE/i);
    expect(m15).toContain('ADD COLUMN "tenant_id" UUID,');
  });

  it('015 backfills old invoice rows before enforcing NOT NULL and re-arms the guard trigger', () => {
    const disable = m15.indexOf('DISABLE TRIGGER "invoices_guard_update"');
    const backfill = m15.indexOf('UPDATE "invoices" i SET "tenant_id"');
    const enable = m15.indexOf('ENABLE TRIGGER "invoices_guard_update"');
    const notNull = m15.indexOf('ALTER COLUMN "tenant_id" SET NOT NULL');
    expect(disable).toBeGreaterThan(-1);
    expect(disable).toBeLessThan(backfill);
    expect(backfill).toBeLessThan(enable);
    expect(enable).toBeLessThan(notNull);
  });

  it('015 pins the contract tenant, one vehicle-billing invoice per tenant/period, and room service history', () => {
    expect(m15).toContain('FOREIGN KEY ("contract_id", "room_id", "tenant_id", "workspace_id")');
    expect(m15).toContain('invoices_vehicle_billing_excl');
    expect(m15).toContain('WHERE ("bills_vehicles" IS TRUE)');
    expect(m15).toContain('room_service_assignments_period_excl');
    expect(m15).toContain('room_service_assignments_prevent_hard_delete');
    expect(m15).toContain('invoices_occupant_confirmation_check');
  });
});
