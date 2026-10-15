import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DepositEntryKind } from '@rental/shared';
import { Prisma } from '../../generated/prisma/client';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceNotFoundRepositoryError,
} from '../workspaces/repositories/workspace.repository';
import { ContractNotFoundRepositoryError } from '../contracts/repositories/contract.repository';
import {
  DepositEntryInvalidRepositoryError,
  DepositEntryNotFoundRepositoryError,
  DepositIdempotencyConflictRepositoryError,
  DepositInsufficientBalanceRepositoryError,
  DepositNotEligibleRepositoryError,
  DepositRepository,
} from './deposit.repository';
import { depositTotals } from './deposit-totals';

const D = (v: string | number) => new Prisma.Decimal(v);
const AT = '2026-10-10T03:00:00.000Z';
const entry = (
  id: string,
  kind: DepositEntryKind,
  amount: number,
  reversesEntryId: string | null = null,
) => ({
  id,
  kind,
  amount: D(amount),
  reversesEntryId,
});
const scope = (
  o: { role?: string; building?: string; contract?: boolean; workspace?: string } = {},
) => ({
  $queryRaw: jest
    .fn()
    .mockResolvedValueOnce([{ status: o.workspace ?? 'ACTIVE' }])
    .mockResolvedValueOnce(
      o.contract === false ? [] : [{ buildingStatus: o.building ?? 'ACTIVE' }],
    ),
  workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role: o.role ?? 'OWNER' }) },
});
const make = (
  o: {
    ledger?: object[];
    existing?: object | null;
    original?: object | null;
    role?: string;
    building?: string;
    contract?: boolean;
    workspace?: string;
  } = {},
) => {
  const tx = {
    ...scope(o),
    contractDepositEntry: {
      findUnique: jest.fn().mockResolvedValue(o.existing ?? null),
      findFirst: jest.fn().mockResolvedValue(o.original ?? null),
      findMany: jest.fn().mockResolvedValue(o.ledger ?? []),
      create: jest
        .fn()
        .mockImplementation(async ({ data }) => ({ id: 'e1', reversal: null, ...data })),
    },
  };
  const prisma = {
    $transaction: (fn: (t: object) => unknown) => fn(tx),
    contractDepositEntry: tx.contractDepositEntry,
  };
  return { tx, repo: new DepositRepository(prisma as never) };
};
const collect = {
  kind: 'COLLECTION',
  amount: '3000000',
  method: 'CASH',
  occurredAt: AT,
  idempotencyKey: 'dep-key-0001',
};
const deduct = {
  kind: 'DEDUCTION',
  amount: '500000',
  occurredAt: AT,
  reason: 'Broken window',
  reference: 'Damage report #12',
  idempotencyKey: 'dep-key-0002',
};
const refund = {
  kind: 'REFUND',
  amount: '1000000',
  method: 'BANK_TRANSFER',
  occurredAt: AT,
  reason: 'Tenant moved out, deposit returned',
  reference: 'FT123',
  idempotencyKey: 'dep-key-0003',
};
const run = (m: ReturnType<typeof make>, body: object) =>
  m.repo.create('w', 'u', 'c', body as never);

describe('depositTotals', () => {
  it('counts a reversal as cancelling the entry it reverses', () => {
    const t = depositTotals([
      entry('a', 'COLLECTION', 3000000),
      entry('b', 'DEDUCTION', 500000),
      entry('c', 'REFUND', 1000000),
      entry('r', 'REVERSAL', 500000, 'b'),
      entry('x', 'COLLECTION', 200000),
      entry('rx', 'REVERSAL', 200000, 'x'),
    ]);
    expect([t.collected, t.deducted, t.refunded, t.balance].map((v) => v.toFixed(0))).toEqual([
      '3000000',
      '0',
      '1000000',
      '2000000',
    ]);
  });
});

describe('DepositRepository.create', () => {
  it('records a collection with method, time and actor, scoped to the workspace and contract', async () => {
    const m = make();
    await expect(run(m, collect)).resolves.toMatchObject({ replay: false });
    const data = m.tx.contractDepositEntry.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      workspaceId: 'w',
      contractId: 'c',
      kind: 'COLLECTION',
      method: 'CASH',
      createdBy: 'u',
    });
    expect(data.amount.toFixed(0)).toBe('3000000');
  });

  it('records a collection before the contract starts or after it ended: the lock query has no contract status or date predicate', async () => {
    const m = make();
    await expect(run(m, collect)).resolves.toMatchObject({ replay: false });
    const lock = m.tx.$queryRaw.mock.calls[1][0] as { sql: string };
    expect(lock.sql).toContain('FROM "contracts" c');
    expect(lock.sql).not.toMatch(/c\."status"|start_date|end_date/);
    expect(m.tx.contractDepositEntry.create).toHaveBeenCalledTimes(1);
  });

  it('requires reason and reference for a deduction and forbids a method on it', async () => {
    const ledger = [entry('a', 'COLLECTION', 3000000)];
    await expect(run(make({ ledger }), deduct)).resolves.toBeDefined();
    await expect(run(make({ ledger }), { ...deduct, reference: ' ' })).rejects.toBeInstanceOf(
      DepositEntryInvalidRepositoryError,
    );
    await expect(run(make({ ledger }), { ...deduct, reason: undefined })).rejects.toBeInstanceOf(
      DepositEntryInvalidRepositoryError,
    );
    await expect(run(make({ ledger }), { ...deduct, method: 'CASH' })).rejects.toBeInstanceOf(
      DepositEntryInvalidRepositoryError,
    );
  });

  it('needs a method for collections and refunds, and never dates them in the future', async () => {
    const ledger = [entry('a', 'COLLECTION', 3000000)];
    await expect(run(make(), { ...collect, method: undefined })).rejects.toBeInstanceOf(
      DepositEntryInvalidRepositoryError,
    );
    await expect(run(make({ ledger }), { ...refund, method: undefined })).rejects.toBeInstanceOf(
      DepositEntryInvalidRepositoryError,
    );
    const future = new Date(Date.now() + 3_600_000).toISOString();
    await expect(run(make(), { ...collect, occurredAt: future })).rejects.toBeInstanceOf(
      DepositEntryInvalidRepositoryError,
    );
  });

  it('never lets deductions and refunds exceed the balance', async () => {
    const ledger = [entry('a', 'COLLECTION', 1000000), entry('b', 'DEDUCTION', 400000)]; // balance 600000
    await expect(run(make({ ledger }), { ...refund, amount: '600000' })).resolves.toBeDefined();
    await expect(run(make({ ledger }), { ...refund, amount: '600001' })).rejects.toBeInstanceOf(
      DepositInsufficientBalanceRepositoryError,
    );
    await expect(run(make({ ledger }), { ...deduct, amount: '600001' })).rejects.toBeInstanceOf(
      DepositInsufficientBalanceRepositoryError,
    );
    await expect(run(make({}), refund)).rejects.toBeInstanceOf(
      DepositInsufficientBalanceRepositoryError,
    );
  });

  it('allows entries after the contract ended but blocks STAFF, unknown contracts and archived buildings', async () => {
    await expect(run(make({ role: 'STAFF' }), collect)).rejects.toBeInstanceOf(
      WorkspaceNotFoundRepositoryError,
    );
    await expect(run(make({ contract: false }), collect)).rejects.toBeInstanceOf(
      ContractNotFoundRepositoryError,
    );
    await expect(run(make({ building: 'ARCHIVED' }), collect)).rejects.toBeInstanceOf(
      DepositNotEligibleRepositoryError,
    );
  });

  it('requires reason and the real refund reference for a REFUND, never moving money itself', async () => {
    const ledger = [entry('a', 'COLLECTION', 3000000)];
    await expect(run(make({ ledger }), { ...refund, reason: undefined })).rejects.toBeInstanceOf(
      DepositEntryInvalidRepositoryError,
    );
    await expect(run(make({ ledger }), { ...refund, reference: ' ' })).rejects.toBeInstanceOf(
      DepositEntryInvalidRepositoryError,
    );
    const m = make({ ledger });
    await run(m, refund);
    expect(m.tx.contractDepositEntry.create.mock.calls[0][0].data).toMatchObject({
      kind: 'REFUND',
      reason: 'Tenant moved out, deposit returned',
      reference: 'FT123',
      method: 'BANK_TRANSFER',
      createdBy: 'u',
    });
  });

  it('allows partial and full refunds up to the balance', async () => {
    const ledger = [entry('a', 'COLLECTION', 3000000)];
    await expect(run(make({ ledger }), { ...refund, amount: '1000000' })).resolves.toBeDefined();
    await expect(run(make({ ledger }), { ...refund, amount: '3000000' })).resolves.toBeDefined();
    await expect(run(make({ ledger }), { ...refund, amount: '3000001' })).rejects.toBeInstanceOf(
      DepositInsufficientBalanceRepositoryError,
    );
  });

  describe('archived workspace or building', () => {
    const ledger = [entry('a', 'COLLECTION', 3000000)];
    const archived = [{ workspace: 'ARCHIVED' }, { building: 'ARCHIVED' }];
    it.each(archived)('lets an OWNER refund the remaining deposit (%j)', async (state) => {
      const m = make({ ledger, ...state });
      await expect(run(m, refund)).resolves.toMatchObject({ replay: false });
      expect(m.tx.contractDepositEntry.create).toHaveBeenCalledTimes(1);
    });
    it.each(archived)('still caps the refund at the balance (%j)', async (state) => {
      await expect(
        run(make({ ledger, ...state }), { ...refund, amount: '3000001' }),
      ).rejects.toBeInstanceOf(DepositInsufficientBalanceRepositoryError);
    });
    it.each(archived)(
      'blocks refunds by a legacy MANAGER (V1 is OWNER-only) (%j)',
      async (state) => {
        await expect(
          run(make({ ledger, role: 'MANAGER', ...state }), refund),
        ).rejects.toBeInstanceOf(WorkspaceNotFoundRepositoryError);
      },
    );
    it.each(archived)('blocks refunds by STAFF (%j)', async (state) => {
      await expect(run(make({ ledger, role: 'STAFF', ...state }), refund)).rejects.toBeInstanceOf(
        WorkspaceNotFoundRepositoryError,
      );
    });
    it('blocks new collections and deductions with the matching archive error', async () => {
      await expect(run(make({ ledger, workspace: 'ARCHIVED' }), collect)).rejects.toBeInstanceOf(
        WorkspaceArchivedRepositoryError,
      );
      await expect(run(make({ ledger, workspace: 'ARCHIVED' }), deduct)).rejects.toBeInstanceOf(
        WorkspaceArchivedRepositoryError,
      );
      await expect(run(make({ ledger, building: 'ARCHIVED' }), collect)).rejects.toBeInstanceOf(
        DepositNotEligibleRepositoryError,
      );
      await expect(run(make({ ledger, building: 'ARCHIVED' }), deduct)).rejects.toBeInstanceOf(
        DepositNotEligibleRepositoryError,
      );
    });
    it('blocks reversals, so archived history is not otherwise changed', async () => {
      const original = { id: 'e0', kind: 'REFUND', amount: D(1), method: 'CASH', reversal: null };
      const m = make({ original, workspace: 'ARCHIVED' });
      await expect(
        m.repo.reverse('w', 'u', 'c', 'e0', { reason: 'x', idempotencyKey: 'rev-key-0009' }),
      ).rejects.toBeInstanceOf(WorkspaceArchivedRepositoryError);
      expect(m.tx.contractDepositEntry.create).not.toHaveBeenCalled();
    });
    it('keeps idempotent retries of an archived refund from writing twice', async () => {
      const stored = {
        id: 'e1',
        kind: 'REFUND',
        amount: D(1000000),
        method: 'BANK_TRANSFER',
        occurredAt: new Date(AT),
        reason: refund.reason,
        reference: 'FT123',
        note: null,
        reversal: null,
      };
      const m = make({ ledger, workspace: 'ARCHIVED', existing: stored });
      await expect(run(m, refund)).resolves.toMatchObject({ replay: true });
      expect(m.tx.contractDepositEntry.create).not.toHaveBeenCalled();
    });
  });

  describe('idempotency', () => {
    const stored = {
      id: 'e1',
      kind: 'COLLECTION',
      amount: D(3000000),
      method: 'CASH',
      occurredAt: new Date(AT),
      reason: null,
      reference: null,
      note: null,
      reversal: null,
    };
    it('returns the original for an identical retry without writing', async () => {
      const m = make({ existing: stored });
      await expect(run(m, collect)).resolves.toMatchObject({ replay: true });
      expect(m.tx.contractDepositEntry.create).not.toHaveBeenCalled();
    });
    it('rejects a reused key with different content', async () => {
      await expect(
        run(make({ existing: stored }), { ...collect, amount: '3000001' }),
      ).rejects.toBeInstanceOf(DepositIdempotencyConflictRepositoryError);
    });
    it('answers a concurrent retry that lost the unique-key race from the committed row', async () => {
      const m = make();
      m.tx.contractDepositEntry.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
      );
      m.tx.contractDepositEntry.findUnique.mockResolvedValueOnce(null).mockResolvedValue(stored);
      await expect(run(m, collect)).resolves.toMatchObject({ replay: true });
    });
    it('retries serialization failures and then reports the committed balance as a domain error', async () => {
      let calls = 0;
      const fresh = make({ ledger: [entry('a', 'COLLECTION', 100)] });
      const repo = new DepositRepository({
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
        contractDepositEntry: { findUnique: jest.fn().mockResolvedValue(null) },
      } as never);
      await expect(repo.create('w', 'u', 'c', refund as never)).rejects.toBeInstanceOf(
        DepositInsufficientBalanceRepositoryError,
      );
      expect(calls).toBe(2);
    });
  });
});

describe('DepositRepository.reverse', () => {
  const body = { reason: ' recorded twice ', idempotencyKey: 'rev-key-0001' };
  const rev = (m: ReturnType<typeof make>) => m.repo.reverse('w', 'u', 'c', 'e0', body);
  const original = (kind: string, amount = 500000) => ({
    id: 'e0',
    kind,
    amount: D(amount),
    method: kind === 'DEDUCTION' ? null : 'CASH',
    reversal: null,
  });

  it('appends a full compensating REVERSAL that copies amount and method, leaving the original alone', async () => {
    const m = make({
      original: original('REFUND'),
      ledger: [entry('a', 'COLLECTION', 1000000), entry('e0', 'REFUND', 500000)],
    });
    await rev(m);
    const data = m.tx.contractDepositEntry.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      kind: 'REVERSAL',
      reversesEntryId: 'e0',
      method: 'CASH',
      reason: 'recorded twice',
      createdBy: 'u',
    });
    expect(data.amount.toFixed(0)).toBe('500000');
  });
  it('rejects unknown, already reversed and reversal-of-reversal targets', async () => {
    await expect(rev(make({ original: null }))).rejects.toBeInstanceOf(
      DepositEntryNotFoundRepositoryError,
    );
    await expect(
      rev(make({ original: { ...original('DEDUCTION'), reversal: { id: 'r' } } })),
    ).rejects.toBeInstanceOf(DepositEntryInvalidRepositoryError);
    await expect(rev(make({ original: original('REVERSAL') }))).rejects.toBeInstanceOf(
      DepositEntryInvalidRepositoryError,
    );
  });
  it('does not allow reversing a collection that money has already left', async () => {
    const ledger = [entry('e0', 'COLLECTION', 500000), entry('b', 'REFUND', 300000)]; // balance 200000 < 500000
    await expect(rev(make({ original: original('COLLECTION'), ledger }))).rejects.toBeInstanceOf(
      DepositInsufficientBalanceRepositoryError,
    );
    await expect(
      rev(make({ original: original('COLLECTION'), ledger: [entry('e0', 'COLLECTION', 500000)] })),
    ).resolves.toBeDefined();
  });
});

describe('P08-04 contract deposit migration', () => {
  const sql = readFileSync(
    resolve(
      __dirname,
      '../../../prisma/migrations/202610140018_p08_contract_deposits/migration.sql',
    ),
    'utf8',
  );
  it('is an append-only whole-VND ledger scoped to the contract with a retry key', () => {
    expect(sql).toContain('"amount" DECIMAL(14,0)');
    expect(sql).toContain('"amount" > 0');
    expect(sql).toContain('FOREIGN KEY ("contract_id", "workspace_id")');
    expect(sql).toContain('"contract_deposit_entries_contract_idempotency_key"');
    expect(sql).toContain('contract_deposit_entries_append_only');
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN)|ALTER TABLE "(invoices|contracts)"/i);
  });
  it('demands reason and reference on deductions, a full reversal, and a non-negative balance', () => {
    expect(sql).toContain('"reference" IS NOT NULL');
    expect(sql).toContain('a reversal must fully reverse');
    expect(sql).toContain('deposit balance cannot be negative');
    expect(sql).toContain('FOR UPDATE');
  });
  it('enforces the archived refund exception in the database too', () => {
    expect(sql).toContain(
      'only a REFUND can be recorded while the workspace or building is archived',
    );
    expect(sql).toContain(
      'only the workspace OWNER can record a refund while the workspace or building is archived',
    );
    expect(sql).toContain('only a workspace OWNER or MANAGER can write deposit entries');
    expect(sql).toMatch(
      /"kind" = 'REFUND' AND "method" IS NOT NULL[\s\S]*"reason" IS NOT NULL[\s\S]*"reference" IS NOT NULL/,
    );
  });
});
