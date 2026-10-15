import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DepositEntryResponse } from '@rental/shared';

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
const session = vi.hoisted(() => ({ record: null as unknown, status: 'ACTIVE' as string }));

vi.mock('@/services/http/httpClient', () => ({ httpClient: http }));
vi.mock('@/mocks/mockUtils', () => ({ simulate: async () => ({ empty: false }), notFound: () => { throw new Error('nf'); } }));
vi.mock('@/mocks/handlers/auth.mock', () => ({ requireSession: () => session.record, currentMockUser: () => null }));

import { db } from '@/mocks/db';
import { ApiError } from '@/services/http/ApiError';
import { depositsMock } from '@/mocks/handlers/deposits.mock';
import { tenancyMock } from '@/mocks/handlers/tenancy.mock';
import { isoToLocalInput } from '@/features/payments/schemas';
import { depositsHttp } from './api';
import apiSource from './api.ts?raw';
import hooksSource from './hooks.ts?raw';
import pagesSource from '../../pages/workspace/SettlementPages.tsx?raw';
import { DEPOSIT_KIND, depositErrorMessage } from './labels';
import { depositEntrySchema, reverseDepositSchema, toDepositBody } from './schemas';

const WS = '11111111-1111-4111-8111-111111111111';
const CTR = '66666666-6666-4666-8666-666666666666';
const ENT = '77777777-7777-4777-8777-777777777777';
const entry = (o: Partial<DepositEntryResponse> = {}): DepositEntryResponse => ({
  id: ENT, workspaceId: WS, contractId: CTR, kind: 'COLLECTION', amount: '3000000', method: 'CASH', occurredAt: '2026-10-10T03:00:00.000Z',
  reason: null, reference: null, note: null, reversesEntryId: null, reversedByEntryId: null, createdBy: 'u', createdAt: '2026-10-10T03:00:00.000Z', ...o,
});

beforeEach(() => {
  for (const fn of Object.values(http)) fn.mockReset();
});

describe('deposit entry form follows the DTO per kind', () => {
  const at = isoToLocalInput();
  const base = { kind: 'COLLECTION' as const, amount: '3000000', method: 'CASH', occurredAt: at, reason: '', reference: '', note: '' };
  it('COLLECTION needs a method only', () => {
    expect(depositEntrySchema.safeParse(base).success).toBe(true);
    expect(depositEntrySchema.safeParse({ ...base, method: '' }).success).toBe(false);
  });
  it('DEDUCTION needs reason + reference and never a method', () => {
    const d = { ...base, kind: 'DEDUCTION' as const, method: '' };
    expect(depositEntrySchema.safeParse(d).success).toBe(false);
    expect(depositEntrySchema.safeParse({ ...d, reason: 'Hỏng cửa' }).success).toBe(false);
    expect(depositEntrySchema.safeParse({ ...d, reason: 'Hỏng cửa', reference: 'BB-12' }).success).toBe(true);
    expect(toDepositBody({ ...d, reason: 'Hỏng cửa', reference: 'BB-12' }, 'dep-12345678')).not.toHaveProperty('method');
    // a stale method left in the form is still not sent for a deduction
    expect(toDepositBody({ ...d, method: 'CASH', reason: 'x', reference: 'y' }, 'dep-12345678')).not.toHaveProperty('method');
  });
  it('REFUND needs method, reason and reference', () => {
    const r = { ...base, kind: 'REFUND' as const };
    expect(depositEntrySchema.safeParse(r).success).toBe(false);
    expect(depositEntrySchema.safeParse({ ...r, reason: 'Trả phòng', reference: 'FT123' }).success).toBe(true);
    expect(depositEntrySchema.safeParse({ ...r, method: '', reason: 'Trả phòng', reference: 'FT123' }).success).toBe(false);
    expect(toDepositBody({ ...r, reason: 'Trả phòng', reference: 'FT123' }, 'dep-12345678')).toMatchObject({ kind: 'REFUND', method: 'CASH', reason: 'Trả phòng', reference: 'FT123' });
  });
  it('amount whole VND, lengths and time not in the future', () => {
    for (const bad of ['0', '1.5', '-5', '', '1234567890123']) expect(depositEntrySchema.safeParse({ ...base, amount: bad }).success, bad).toBe(false);
    expect(depositEntrySchema.safeParse({ ...base, reason: 'x'.repeat(501) }).success).toBe(false);
    expect(depositEntrySchema.safeParse({ ...base, kind: 'REFUND', reason: 'x', reference: 'y'.repeat(201) }).success).toBe(false);
    expect(depositEntrySchema.safeParse({ ...base, note: 'x'.repeat(501) }).success).toBe(false);
    expect(depositEntrySchema.safeParse({ ...base, occurredAt: isoToLocalInput(new Date(Date.now() + 3_600_000)) }).success).toBe(false);
    expect(depositEntrySchema.safeParse({ ...base, kind: 'REVERSAL' }).success).toBe(false); // REVERSAL is created only through reverse
    expect(reverseDepositSchema.safeParse({ reason: ' ' }).success).toBe(false);
  });
  it('labels cover all four ledger kinds', () => {
    expect(Object.keys(DEPOSIT_KIND)).toEqual(['COLLECTION', 'DEDUCTION', 'REFUND', 'REVERSAL']);
  });
});

describe('HTTP adapter: the 4 OWNER deposit endpoints keyed by contract id', () => {
  const base = `/workspaces/${WS}/contracts/${CTR}/deposit`;
  it('ledger page with BE totals / create / detail / reverse', async () => {
    http.get.mockResolvedValue({ contractId: CTR, collectedTotal: '3000000', deductedTotal: '500000', refundedTotal: '0', balance: '2500000', items: [entry()], page: 3, limit: 20, total: 41 });
    const page = await depositsHttp.getDeposit(WS, CTR, { page: 3, limit: 20 });
    expect(http.get).toHaveBeenLastCalledWith(base, { query: { page: 3, limit: 20 } });
    expect(page).toMatchObject({ balance: '2500000', total: 41 });
    http.post.mockResolvedValue(entry());
    const body = { kind: 'COLLECTION' as const, amount: '3000000', method: 'CASH' as const, occurredAt: '2026-10-10T03:00:00.000Z', idempotencyKey: 'dep-12345678' };
    await depositsHttp.createEntry(WS, CTR, body);
    expect(http.post).toHaveBeenLastCalledWith(`${base}/entries`, body);
    http.get.mockResolvedValue(entry());
    await depositsHttp.getEntry(WS, CTR, ENT);
    expect(http.get).toHaveBeenLastCalledWith(`${base}/entries/${ENT}`);
    await depositsHttp.reverseEntry(WS, CTR, ENT, { reason: 'Ghi nhầm', idempotencyKey: 'drv-12345678' });
    expect(http.post).toHaveBeenLastCalledWith(`${base}/entries/${ENT}/reverse`, { reason: 'Ghi nhầm', idempotencyKey: 'drv-12345678' });
  });
  it('deposit screens use the tenancy contract id and no global/legacy endpoint or model', () => {
    for (const [name, text] of Object.entries({ api: apiSource, hooks: hooksSource })) {
      expect(text, name).not.toMatch(/features\/billing|features\/leasing|\/workspaces\/\$\{[^}]+\}\/deposits/);
    }
    expect(pagesSource).toMatch(/features\/tenancy\/hooks/);
    expect(pagesSource).not.toMatch(/features\/leasing|features\/billing/);
  });
  it('error codes map to Vietnamese', () => {
    const err = (code: string) => new ApiError({ statusCode: 409, code, message: 'raw' });
    expect(depositErrorMessage(err('DEPOSIT_INSUFFICIENT_BALANCE'))).toMatch(/Số dư cọc không đủ/);
    expect(depositErrorMessage(err('DEPOSIT_NOT_ELIGIBLE'))).toMatch(/hoàn cọc/);
    expect(depositErrorMessage(err('DEPOSIT_IDEMPOTENCY_CONFLICT'))).toMatch(/Mã chống gửi trùng/);
    expect(depositErrorMessage(err('DEPOSIT_ENTRY_INVALID'))).toMatch(/không đảo được/);
  });
});

describe('mock follows the backend deposit rules', () => {
  const ws = db.tenants[0]!.workspaceId;
  const as = (role = 'OWNER', status = 'ACTIVE') => {
    session.record = { user: { id: 'u1', fullName: 'Chủ', email: 'o@x.vn' }, memberships: [{ workspaceId: ws, role, status, name: 'WS' }] };
  };
  const iso = (ms = Date.now() - 1000) => new Date(ms).toISOString();
  const col = (amount: string, key: string) => ({ kind: 'COLLECTION' as const, amount, method: 'CASH' as const, occurredAt: iso(), idempotencyKey: key });
  const ded = (amount: string, key: string) => ({ kind: 'DEDUCTION' as const, amount, occurredAt: iso(), reason: 'Hỏng cửa', reference: 'BB-1', idempotencyKey: key });
  const ref = (amount: string, key: string) => ({ kind: 'REFUND' as const, amount, method: 'BANK_TRANSFER' as const, occurredAt: iso(), reason: 'Trả phòng', reference: 'FT-9', idempotencyKey: key });
  const page = { page: 1, limit: 20 };

  async function contractOf(phase: 'IN_EFFECT' | 'ENDED', skip = 0) {
    as();
    return (await tenancyMock.listContracts(ws)).filter((c) => c.phase === phase)[skip]!;
  }

  it('OWNER only; unknown contract is 404', async () => {
    const c = await contractOf('IN_EFFECT');
    for (const role of ['MANAGER', 'STAFF']) {
      as(role);
      await expect(depositsMock.getDeposit(ws, c.id, page)).rejects.toBeInstanceOf(ApiError);
    }
    as();
    await expect(depositsMock.getDeposit(ws, 'missing', page)).rejects.toMatchObject({ code: 'CONTRACT_NOT_FOUND' });
  });

  it('COLLECTION / DEDUCTION / REFUND move the backend totals; balance never goes below zero; deduction needs balance', async () => {
    const c = await contractOf('IN_EFFECT');
    expect(await depositsMock.getDeposit(ws, c.id, page)).toMatchObject({ collectedTotal: '0', balance: '0', total: 0 });
    await expect(depositsMock.createEntry(ws, c.id, ded('1000', 'dep-nobal-001'))).rejects.toMatchObject({ code: 'DEPOSIT_INSUFFICIENT_BALANCE' });
    await depositsMock.createEntry(ws, c.id, col('3000000', 'dep-col-0001'));
    await depositsMock.createEntry(ws, c.id, ded('500000', 'dep-ded-0001'));
    await depositsMock.createEntry(ws, c.id, ref('1000000', 'dep-ref-0001'));
    const sum = await depositsMock.getDeposit(ws, c.id, { page: 1, limit: 2 });
    expect(sum).toMatchObject({ collectedTotal: '3000000', deductedTotal: '500000', refundedTotal: '1000000', balance: '1500000', total: 3 });
    expect(sum.items).toHaveLength(2); // totals are not the sum of the visible page
    await expect(depositsMock.createEntry(ws, c.id, ref('1500001', 'dep-ref-0002'))).rejects.toMatchObject({ code: 'DEPOSIT_INSUFFICIENT_BALANCE' });
    expect((await depositsMock.getDeposit(ws, c.id, { page: 2, limit: 2 })).items).toHaveLength(1);
  });

  it('per-kind field rules and a future time are refused', async () => {
    const c = await contractOf('IN_EFFECT', 1);
    await depositsMock.createEntry(ws, c.id, col('2000000', 'dep-rule-col1'));
    await expect(depositsMock.createEntry(ws, c.id, { ...ded('1', 'dep-rule-002'), method: 'CASH' })).rejects.toMatchObject({ code: 'DEPOSIT_ENTRY_INVALID' });
    await expect(depositsMock.createEntry(ws, c.id, { ...ded('1', 'dep-rule-003'), reference: undefined })).rejects.toMatchObject({ code: 'DEPOSIT_ENTRY_INVALID' });
    await expect(depositsMock.createEntry(ws, c.id, { ...ref('1', 'dep-rule-004'), method: undefined })).rejects.toMatchObject({ code: 'DEPOSIT_ENTRY_INVALID' });
    await expect(depositsMock.createEntry(ws, c.id, { ...col('1', 'dep-rule-005'), method: undefined })).rejects.toMatchObject({ code: 'DEPOSIT_ENTRY_INVALID' });
    await expect(depositsMock.createEntry(ws, c.id, { ...col('1', 'dep-rule-006'), occurredAt: iso(Date.now() + 3_600_000) })).rejects.toMatchObject({ code: 'DEPOSIT_ENTRY_INVALID' });
  });

  it('idempotent retry replays; the same key with other content conflicts', async () => {
    const c = await contractOf('IN_EFFECT', 2);
    const body = col('700000', 'dep-retry-0001');
    const first = await depositsMock.createEntry(ws, c.id, body);
    expect((await depositsMock.createEntry(ws, c.id, body)).id).toBe(first.id);
    expect((await depositsMock.getDeposit(ws, c.id, page)).total).toBe(1);
    await expect(depositsMock.createEntry(ws, c.id, col('800000', 'dep-retry-0001'))).rejects.toMatchObject({ code: 'DEPOSIT_IDEMPOTENCY_CONFLICT' });
  });

  it('detail + reversal: compensating entry, original untouched, no second reversal, no reversal of a reversal, no negative balance', async () => {
    const c = await contractOf('IN_EFFECT', 3);
    const collected = await depositsMock.createEntry(ws, c.id, col('1000000', 'dep-rv-col-01'));
    const deducted = await depositsMock.createEntry(ws, c.id, ded('400000', 'dep-rv-ded-01'));
    await expect(depositsMock.reverseEntry(ws, c.id, collected.id, { reason: 'Ghi nhầm', idempotencyKey: 'drv-neg-00001' })).rejects.toMatchObject({ code: 'DEPOSIT_INSUFFICIENT_BALANCE' });
    const rev = await depositsMock.reverseEntry(ws, c.id, deducted.id, { reason: 'Khấu trừ nhầm', idempotencyKey: 'drv-ok-000001' });
    expect(rev).toMatchObject({ kind: 'REVERSAL', reversesEntryId: deducted.id, amount: '400000', reason: 'Khấu trừ nhầm' });
    expect(await depositsMock.getEntry(ws, c.id, deducted.id)).toMatchObject({ kind: 'DEDUCTION', amount: '400000', reversedByEntryId: rev.id });
    expect(await depositsMock.getDeposit(ws, c.id, page)).toMatchObject({ deductedTotal: '0', balance: '1000000' });
    expect((await depositsMock.reverseEntry(ws, c.id, deducted.id, { reason: 'Khấu trừ nhầm', idempotencyKey: 'drv-ok-000001' })).id).toBe(rev.id);
    await expect(depositsMock.reverseEntry(ws, c.id, deducted.id, { reason: 'Lần hai', idempotencyKey: 'drv-ok-000002' })).rejects.toMatchObject({ code: 'DEPOSIT_ENTRY_INVALID' });
    await expect(depositsMock.reverseEntry(ws, c.id, rev.id, { reason: 'Đảo bản đảo', idempotencyKey: 'drv-ok-000003' })).rejects.toMatchObject({ code: 'DEPOSIT_ENTRY_INVALID' });
    // once the deduction is reversed the collection can be reversed again (balance would be 0)
    const revCol = await depositsMock.reverseEntry(ws, c.id, collected.id, { reason: 'Thu nhầm', idempotencyKey: 'drv-ok-000004' });
    expect(revCol.kind).toBe('REVERSAL');
    expect(await depositsMock.getDeposit(ws, c.id, page)).toMatchObject({ collectedTotal: '0', balance: '0' });
    await expect(depositsMock.getEntry(ws, c.id, 'nope')).rejects.toMatchObject({ code: 'DEPOSIT_ENTRY_NOT_FOUND' });
  });

  it('ENDED contracts keep a usable ledger (refund after the contract ended); nothing is refunded automatically', async () => {
    const ended = await contractOf('ENDED');
    expect(ended).toBeDefined();
    expect(await depositsMock.getDeposit(ws, ended.id, page)).toMatchObject({ refundedTotal: '0' });
    await depositsMock.createEntry(ws, ended.id, col('1200000', 'dep-end-col-01'));
    expect(await depositsMock.getDeposit(ws, ended.id, page)).toMatchObject({ balance: '1200000', refundedTotal: '0' }); // no auto-refund
    await depositsMock.createEntry(ws, ended.id, ref('1200000', 'dep-end-ref-01'));
    expect(await depositsMock.getDeposit(ws, ended.id, page)).toMatchObject({ balance: '0', refundedTotal: '1200000' });
  });

  it('archived workspace: only the OWNER REFUND of the remaining balance is accepted', async () => {
    const c = await contractOf('IN_EFFECT', 4);
    await depositsMock.createEntry(ws, c.id, col('900000', 'dep-arc-col-01'));
    as('OWNER', 'ARCHIVED');
    await expect(depositsMock.createEntry(ws, c.id, col('1', 'dep-arc-col-02'))).rejects.toMatchObject({ code: 'WORKSPACE_ARCHIVED' });
    await expect(depositsMock.createEntry(ws, c.id, ded('1', 'dep-arc-ded-01'))).rejects.toMatchObject({ code: 'WORKSPACE_ARCHIVED' });
    const rows = await depositsMock.getDeposit(ws, c.id, page);
    await expect(depositsMock.reverseEntry(ws, c.id, rows.items[0]!.id, { reason: 'x', idempotencyKey: 'drv-arc-00001' })).rejects.toMatchObject({ code: 'WORKSPACE_ARCHIVED' });
    await depositsMock.createEntry(ws, c.id, ref('900000', 'dep-arc-ref-01'));
    expect(await depositsMock.getDeposit(ws, c.id, page)).toMatchObject({ balance: '0', refundedTotal: '900000' });
  });
});
