import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Prisma } from '../../../generated/prisma/client';
import { WorkspaceNotFoundRepositoryError } from '../../workspaces/repositories/workspace.repository';
import {
  InvoicePaymentRepository,
  PaymentExceedsDueRepositoryError,
  PaymentIdempotencyConflictRepositoryError,
  PaymentInvalidRepositoryError,
  PaymentNotEligibleRepositoryError,
  PaymentNotFoundRepositoryError,
} from './invoice-payment.repository';
import { netPaid, paymentStatus } from './paid-total';

const D = (v: string | number) => new Prisma.Decimal(v);
const KEY = 'pay-key-0001';
const RECEIVED = '2026-10-10T03:00:00.000Z';
const scope = (role = 'OWNER', buildingStatus = 'ACTIVE') => ({
  $queryRaw: jest
    .fn()
    .mockResolvedValueOnce([{ status: 'ACTIVE' }])
    .mockResolvedValueOnce([{ status: buildingStatus }]),
  workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role }) },
});
const make = (
  o: {
    invoice?: object | null;
    adj?: number;
    paid?: number;
    existing?: object | null;
    original?: object | null;
    role?: string;
    building?: string;
  } = {},
) => {
  const s = scope(o.role, o.building);
  const invoice = o.invoice === undefined ? { status: 'ISSUED', total: D(100000) } : o.invoice;
  s.$queryRaw.mockResolvedValueOnce(invoice ? [invoice] : []);
  const tx = {
    ...s,
    invoiceAdjustment: {
      aggregate: jest
        .fn()
        .mockResolvedValue({ _sum: { amount: o.adj === undefined ? null : D(o.adj) } }),
    },
    invoicePayment: {
      findUnique: jest.fn().mockResolvedValue(o.existing ?? null),
      findFirst: jest.fn().mockResolvedValue(o.original ?? null),
      groupBy: jest
        .fn()
        .mockResolvedValue(o.paid ? [{ kind: 'PAYMENT', _sum: { amount: D(o.paid) } }] : []),
      create: jest
        .fn()
        .mockImplementation(async ({ data }) => ({ id: 'p1', reversal: null, ...data })),
    },
  };
  const prisma = {
    $transaction: (fn: (t: object) => unknown) => fn(tx),
    invoicePayment: tx.invoicePayment,
  };
  return { tx, repo: new InvoicePaymentRepository(prisma as never) };
};
const input = {
  amount: '40000',
  method: 'CASH',
  receivedAt: RECEIVED,
  note: ' deposit ',
  idempotencyKey: KEY,
};
const pay = (m: ReturnType<typeof make>, body: object = input) =>
  m.repo.create('w', 'u', 'b', 'inv', body as never);

describe('InvoicePaymentRepository.create', () => {
  it('records a confirmed payment with method, time, note and the confirming user', async () => {
    const m = make();
    const { replay } = await pay(m);
    expect(replay).toBe(false);
    const data = m.tx.invoicePayment.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      kind: 'PAYMENT',
      method: 'CASH',
      note: 'deposit',
      confirmedBy: 'u',
      workspaceId: 'w',
      invoiceId: 'inv',
    });
    expect(data.amount.toFixed(0)).toBe('40000');
    expect(data.receivedAt.toISOString()).toBe(RECEIVED);
  });

  it('allows several partial payments up to the amount due, including adjustments', async () => {
    await expect(pay(make({ paid: 60000 }))).resolves.toMatchObject({ replay: false }); // 60k + 40k = 100k
    await expect(
      pay(make({ paid: 60000, adj: 5000 }), { ...input, amount: '45000' }),
    ).resolves.toBeDefined();
    await expect(pay(make({ paid: 60000 }), { ...input, amount: '40001' })).rejects.toBeInstanceOf(
      PaymentExceedsDueRepositoryError,
    );
    await expect(pay(make({ paid: 60000, adj: -10000 }))).rejects.toBeInstanceOf(
      PaymentExceedsDueRepositoryError,
    );
  });

  it('rejects receipt times in the future', async () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    await expect(pay(make(), { ...input, receivedAt: future })).rejects.toBeInstanceOf(
      PaymentInvalidRepositoryError,
    );
  });

  it('only takes payments on ISSUED invoices of an active building, from managers', async () => {
    await expect(pay(make({ invoice: { status: 'DRAFT', total: null } }))).rejects.toBeInstanceOf(
      PaymentNotEligibleRepositoryError,
    );
    await expect(pay(make({ building: 'ARCHIVED' }))).rejects.toBeInstanceOf(
      PaymentNotEligibleRepositoryError,
    );
    await expect(pay(make({ invoice: null }))).rejects.toBeInstanceOf(
      PaymentNotFoundRepositoryError,
    );
    await expect(pay(make({ role: 'STAFF' }))).rejects.toBeInstanceOf(
      WorkspaceNotFoundRepositoryError,
    );
  });

  describe('idempotency', () => {
    const stored = {
      id: 'p1',
      kind: 'PAYMENT',
      amount: D(40000),
      method: 'CASH',
      receivedAt: new Date(RECEIVED),
      note: 'deposit',
      reversal: null,
    };
    it('returns the original for an identical retry without writing', async () => {
      const m = make({ existing: stored });
      await expect(pay(m)).resolves.toMatchObject({ replay: true });
      expect(m.tx.invoicePayment.create).not.toHaveBeenCalled();
    });
    it('rejects a reused key with different content', async () => {
      await expect(
        pay(make({ existing: stored }), { ...input, amount: '41000' }),
      ).rejects.toBeInstanceOf(PaymentIdempotencyConflictRepositoryError);
    });
    it('answers a concurrent retry that lost the unique-key race from the committed row', async () => {
      const m = make();
      m.tx.invoicePayment.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
      );
      m.tx.invoicePayment.findUnique.mockResolvedValueOnce(null).mockResolvedValue(stored);
      await expect(pay(m)).resolves.toMatchObject({ replay: true });
    });
    it('retries serialization failures so the loser sees the committed total', async () => {
      let calls = 0;
      const fresh = make({ paid: 90000 });
      const repo = new InvoicePaymentRepository({
        $transaction: (fn: (t: object) => unknown) => {
          calls += 1;
          return calls === 1
            ? Promise.reject(
                new Prisma.PrismaClientKnownRequestError('x', {
                  code: 'P2034',
                  clientVersion: 'x',
                }),
              )
            : fn(fresh.tx);
        },
        invoicePayment: { findUnique: jest.fn().mockResolvedValue(null) },
      } as never);
      await expect(repo.create('w', 'u', 'b', 'inv', input as never)).rejects.toBeInstanceOf(
        PaymentExceedsDueRepositoryError,
      );
      expect(calls).toBe(2);
    });
  });
});

describe('InvoicePaymentRepository.reverse', () => {
  const original = {
    id: 'p1',
    kind: 'PAYMENT',
    amount: D(40000),
    method: 'BANK_TRANSFER',
    reversal: null,
  };
  const rev = (m: ReturnType<typeof make>) =>
    m.repo.reverse('w', 'u', 'b', 'inv', 'p1', {
      reason: ' wrong invoice ',
      idempotencyKey: 'rev-key-0001',
    });

  it('appends a full REVERSAL with the reason, leaving the original untouched', async () => {
    const m = make({ original });
    await rev(m);
    const data = m.tx.invoicePayment.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      kind: 'REVERSAL',
      method: 'BANK_TRANSFER',
      reversesPaymentId: 'p1',
      note: 'wrong invoice',
      confirmedBy: 'u',
    });
    expect(data.amount.toFixed(0)).toBe('40000');
  });
  it('rejects unknown, already reversed, or non-payment targets', async () => {
    await expect(rev(make({ original: null }))).rejects.toBeInstanceOf(
      PaymentNotFoundRepositoryError,
    );
    await expect(
      rev(make({ original: { ...original, reversal: { id: 'r1' } } })),
    ).rejects.toBeInstanceOf(PaymentInvalidRepositoryError);
    await expect(rev(make({ original: { ...original, kind: 'REVERSAL' } }))).rejects.toBeInstanceOf(
      PaymentInvalidRepositoryError,
    );
  });
});

describe('paid total helpers', () => {
  it('nets reversals and derives status without ever going negative', () => {
    const paid = netPaid([
      { kind: 'PAYMENT', amount: D(70000) },
      { kind: 'REVERSAL', amount: D(30000) },
      { kind: 'PAYMENT', amount: D(10000) },
    ]);
    expect(paid.toFixed(0)).toBe('50000');
    expect(paymentStatus(D(100000), paid)).toBe('PARTIALLY_PAID');
    expect(paymentStatus(D(100000), D(0))).toBe('UNPAID');
    expect(paymentStatus(D(100000), D(100000))).toBe('PAID');
  });
});

describe('P08-03 invoice payment migration', () => {
  const sql = readFileSync(
    resolve(
      __dirname,
      '../../../../prisma/migrations/202610140017_p08_invoice_payments/migration.sql',
    ),
    'utf8',
  );
  it('is a whole-VND append-only ledger with retry key and scope', () => {
    expect(sql).toContain('"amount" DECIMAL(14,0)');
    expect(sql).toContain('"amount" > 0');
    expect(sql).toContain("('CASH', 'BANK_TRANSFER')");
    expect(sql).toContain('"invoice_payments_invoice_idempotency_key"');
    expect(sql).toContain('FOREIGN KEY ("invoice_id", "workspace_id")');
    expect(sql).toContain('invoice_payments_append_only');
  });
  it('caps payments at the amount due, supports full reversals, and bounds adjustments by money paid', () => {
    expect(sql).toContain('payments cannot exceed the amount due');
    expect(sql).toContain('a reversal must fully reverse a payment');
    expect(sql).toContain('adjusted invoice total cannot fall below the amount already paid');
    expect(sql).toContain('FOR UPDATE');
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN)|ALTER TABLE "invoices"/i);
  });
});
