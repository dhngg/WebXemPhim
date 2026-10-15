import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Prisma } from '../../../generated/prisma/client';
import { WorkspaceNotFoundRepositoryError } from '../../workspaces/repositories/workspace.repository';
import {
  AdjustmentBelowPaidRepositoryError,
  AdjustmentIdempotencyConflictRepositoryError,
  AdjustmentInvalidRepositoryError,
  AdjustmentNotEligibleRepositoryError,
  AdjustmentNotFoundRepositoryError,
  InvoiceAdjustmentRepository,
} from './invoice-adjustment.repository';

const D = (v: string | number) => new Prisma.Decimal(v);
const KEY = 'retry-key-0001';
const scope = (role = 'OWNER', buildingStatus = 'ACTIVE') => ({
  $queryRaw: jest
    .fn()
    .mockResolvedValueOnce([{ status: 'ACTIVE' }])
    .mockResolvedValueOnce([{ status: buildingStatus }]),
  workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role }) },
});
const make = (
  opts: {
    invoice?: object | null;
    sum?: number;
    paid?: number;
    existing?: object | null;
    reference?: object | null;
    role?: string;
    building?: string;
  } = {},
) => {
  const s = scope(opts.role, opts.building);
  const invoice =
    opts.invoice === undefined ? { status: 'ISSUED', total: D(100000) } : opts.invoice;
  s.$queryRaw.mockResolvedValueOnce(invoice ? [invoice] : []);
  const tx = {
    ...s,
    invoicePayment: {
      groupBy: jest
        .fn()
        .mockResolvedValue(opts.paid ? [{ kind: 'PAYMENT', _sum: { amount: D(opts.paid) } }] : []),
    },
    invoiceAdjustment: {
      findUnique: jest.fn().mockResolvedValue(opts.existing ?? null),
      findFirst: jest.fn().mockResolvedValue(opts.reference ?? null),
      aggregate: jest
        .fn()
        .mockResolvedValue({ _sum: { amount: opts.sum === undefined ? null : D(opts.sum) } }),
      create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'a1', ...data })),
    },
  };
  const prisma = {
    $transaction: (fn: (t: object) => unknown) => fn(tx),
    invoiceAdjustment: tx.invoiceAdjustment,
  };
  return { tx, repo: new InvoiceAdjustmentRepository(prisma as never) };
};
const input = { amount: '-5000', reason: 'Billing error', idempotencyKey: KEY };
const run = (m: ReturnType<typeof make>, body: object = input) =>
  m.repo.create('w', 'u', 'b', 'inv', body as never);

describe('InvoiceAdjustmentRepository.create', () => {
  it('appends a signed adjustment without touching the invoice', async () => {
    const m = make();
    const { adjustment, replay } = await run(m);
    expect(replay).toBe(false);
    const data = m.tx.invoiceAdjustment.create.mock.calls[0][0].data;
    expect(data.amount.toFixed(0)).toBe('-5000');
    expect(data).toMatchObject({
      workspaceId: 'w',
      invoiceId: 'inv',
      createdBy: 'u',
      reason: 'Billing error',
      idempotencyKey: KEY,
    });
    expect(adjustment).toBeDefined();
  });

  it('rounds ROUND_HALF_UP to 1 VND and keeps the requested amount for audit', async () => {
    const up = make();
    await run(up, { ...input, amount: '1500.5' });
    expect(up.tx.invoiceAdjustment.create.mock.calls[0][0].data.amount.toFixed(0)).toBe('1501');
    const down = make();
    await run(down, { ...input, amount: '-1500.5' });
    const d = down.tx.invoiceAdjustment.create.mock.calls[0][0].data;
    expect(d.amount.toFixed(0)).toBe('-1501');
    expect(d.requestedAmount.toFixed(4)).toBe('-1500.5000');
  });

  it('rejects amounts that round to zero', async () => {
    await expect(run(make(), { ...input, amount: '0.4' })).rejects.toBeInstanceOf(
      AdjustmentInvalidRepositoryError,
    );
  });

  it('never lets the adjusted total go negative (counting earlier adjustments)', async () => {
    await expect(run(make({ sum: -96000 }), { ...input, amount: '-5000' })).rejects.toBeInstanceOf(
      AdjustmentInvalidRepositoryError,
    );
    await expect(run(make({ sum: -95000 }), { ...input, amount: '-5000' })).resolves.toMatchObject({
      replay: false,
    });
  });

  it('never lowers the amount due below money already paid', async () => {
    await expect(run(make({ paid: 98000 }), { ...input, amount: '-5000' })).rejects.toBeInstanceOf(
      AdjustmentBelowPaidRepositoryError,
    );
    await expect(run(make({ paid: 95000 }), { ...input, amount: '-5000' })).resolves.toMatchObject({
      replay: false,
    });
  });

  it('only adjusts ISSUED invoices of an active building', async () => {
    await expect(run(make({ invoice: { status: 'DRAFT', total: null } }))).rejects.toBeInstanceOf(
      AdjustmentNotEligibleRepositoryError,
    );
    await expect(run(make({ building: 'ARCHIVED' }))).rejects.toBeInstanceOf(
      AdjustmentNotEligibleRepositoryError,
    );
    await expect(run(make({ invoice: null }))).rejects.toBeInstanceOf(
      AdjustmentNotFoundRepositoryError,
    );
  });

  it('blocks STAFF', async () => {
    await expect(run(make({ role: 'STAFF' }))).rejects.toBeInstanceOf(
      WorkspaceNotFoundRepositoryError,
    );
  });

  describe('idempotency', () => {
    const stored = {
      id: 'a1',
      requestedAmount: D('-5000'),
      reason: 'Billing error',
      referenceAdjustmentId: null,
    };
    it('returns the original for an identical retry without writing', async () => {
      const m = make({ existing: stored });
      await expect(run(m)).resolves.toMatchObject({ replay: true, adjustment: { id: 'a1' } });
      expect(m.tx.invoiceAdjustment.create).not.toHaveBeenCalled();
    });
    it('rejects a reused key with a different payload', async () => {
      await expect(
        run(make({ existing: stored }), { ...input, amount: '-6000' }),
      ).rejects.toBeInstanceOf(AdjustmentIdempotencyConflictRepositoryError);
    });
    it('answers a concurrent retry that lost the unique-key race from the committed row', async () => {
      const m = make();
      m.tx.invoiceAdjustment.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
      );
      m.tx.invoiceAdjustment.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(stored);
      await expect(run(m)).resolves.toMatchObject({ replay: true });
    });
  });

  describe('corrections', () => {
    it('accepts a reference to an uncorrected adjustment of the same invoice', async () => {
      const m = make({ reference: { id: 'ref1', corrections: [] } });
      await run(m, { ...input, amount: '5000', referenceAdjustmentId: 'ref1' });
      expect(m.tx.invoiceAdjustment.create.mock.calls[0][0].data.referenceAdjustmentId).toBe(
        'ref1',
      );
      expect(m.tx.invoiceAdjustment.findFirst.mock.calls[0][0].where).toMatchObject({
        invoiceId: 'inv',
        workspaceId: 'w',
      });
    });
    it('rejects unknown or already-corrected references', async () => {
      await expect(
        run(make({ reference: null }), { ...input, referenceAdjustmentId: 'x' }),
      ).rejects.toBeInstanceOf(AdjustmentInvalidRepositoryError);
      await expect(
        run(make({ reference: { id: 'r', corrections: [{ id: 'c' }] } }), {
          ...input,
          referenceAdjustmentId: 'r',
        }),
      ).rejects.toBeInstanceOf(AdjustmentInvalidRepositoryError);
    });
  });
});

describe('P08-02 invoice adjustment migration', () => {
  const sql = readFileSync(
    resolve(
      __dirname,
      '../../../../prisma/migrations/202610140016_p08_invoice_adjustments/migration.sql',
    ),
    'utf8',
  );
  it('is additive and keeps Decimal amounts, scope and a retry key', () => {
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN)|ALTER TABLE "invoices"/i);
    expect(sql).toContain('"amount" DECIMAL(14,0)');
    expect(sql).toContain('"amount" <> 0');
    expect(sql).toContain('FOREIGN KEY ("invoice_id", "workspace_id")');
    expect(sql).toContain('"invoice_adjustments_invoice_idempotency_key"');
    expect(sql).toContain('"invoice_adjustments_reference_key"');
  });
  it('is append-only, ISSUED-only and never lets the total go negative', () => {
    expect(sql).toContain('invoice_adjustments_append_only');
    expect(sql).toContain('BEFORE UPDATE OR DELETE');
    expect(sql).toContain('adjustments require an ISSUED invoice');
    expect(sql).toContain('adjusted invoice total cannot be negative');
    expect(sql).toContain('FOR UPDATE');
  });
});

describe('InvoiceAdjustmentRepository serialization retries', () => {
  it('retries a serialization failure and then reports the committed total as a domain error', async () => {
    const m = make({ sum: -99000 });
    const serialization = new Prisma.PrismaClientKnownRequestError('conflict', {
      code: 'P2034',
      clientVersion: 'x',
    });
    let calls = 0;
    const repo = new InvoiceAdjustmentRepository({
      $transaction: (fn: (t: object) => unknown) => {
        calls += 1;
        if (calls === 1) return Promise.reject(serialization);
        return fn(make({ sum: -99000 }).tx);
      },
      invoiceAdjustment: { findUnique: jest.fn().mockResolvedValue(null) },
    } as never);
    await expect(repo.create('w', 'u', 'b', 'inv', input as never)).rejects.toBeInstanceOf(
      AdjustmentInvalidRepositoryError,
    );
    expect(calls).toBe(2);
    expect(m).toBeDefined();
  });
});
