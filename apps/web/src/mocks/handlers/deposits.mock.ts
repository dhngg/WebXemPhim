import type { DepositEntryResponse, DepositPageResponse } from '@rental/shared';
import type { DepositsApi } from '@/features/deposits/api';
import { ApiError } from '@/services/http/ApiError';
import { nextId } from '../db';
import { requireMember } from '../guard';
import { simulate } from '../mockUtils';
import { tenancyMock } from './tenancy.mock';

/**
 * Mock theo đúng quy tắc của backend (Contract Deposits): sổ riêng theo hợp đồng (ACTIVE hoặc ENDED), chỉ OWNER,
 * số tiền nguyên VND, COLLECTION cần method; DEDUCTION cần reason+reference và KHÔNG có method; REFUND cần cả ba;
 * DEDUCTION/REFUND không vượt số dư; đảo = bản ghi mới (không sửa/xóa bản gốc), không đảo hai lần hay đảo bản đảo,
 * và không đảo khoản thu làm số dư âm. Workspace đã lưu trữ chỉ nhận REFUND. Sổ không bao giờ tự hoàn cọc.
 */
const FUTURE_TOLERANCE_MS = 5 * 60_000;
export const depositLedger: Array<DepositEntryResponse & { key: string }> = [];
const entries = depositLedger;

const fail = (status: number, code: string, message: string): never => {
  throw new ApiError({ statusCode: status, code, message });
};

async function scope(ws: string, contractId: string) {
  const { user, membership } = requireMember(ws, 'payments.confirm');
  await tenancyMock.getContract(ws, contractId).catch(() => fail(404, 'CONTRACT_NOT_FOUND', 'Contract not found'));
  return { user, archived: membership.status === 'ARCHIVED' };
}

const signed = (e: DepositEntryResponse, all: DepositEntryResponse[]) => {
  const reversed = all.some((x) => x.reversesEntryId === e.id);
  const amount = Number(e.amount);
  if (e.kind === 'REVERSAL') {
    const original = all.find((x) => x.id === e.reversesEntryId);
    return { collected: original?.kind === 'COLLECTION' ? -amount : 0, deducted: original?.kind === 'DEDUCTION' ? -amount : 0, refunded: original?.kind === 'REFUND' ? -amount : 0 };
  }
  void reversed;
  return { collected: e.kind === 'COLLECTION' ? amount : 0, deducted: e.kind === 'DEDUCTION' ? amount : 0, refunded: e.kind === 'REFUND' ? amount : 0 };
};
function totals(contractId: string) {
  const all = entries.filter((e) => e.contractId === contractId);
  const sum = all.reduce((t, e) => {
    const s = signed(e, all);
    return { collected: t.collected + s.collected, deducted: t.deducted + s.deducted, refunded: t.refunded + s.refunded };
  }, { collected: 0, deducted: 0, refunded: 0 });
  return { ...sum, balance: Math.max(0, sum.collected - sum.deducted - sum.refunded) };
}

const strip = (e: DepositEntryResponse & { key: string }): DepositEntryResponse => {
  const { key, ...rest } = e;
  void key;
  return { ...rest, reversedByEntryId: entries.find((x) => x.reversesEntryId === e.id)?.id ?? null };
};

export const depositsMock: DepositsApi = {
  async getDeposit(ws, contractId, page) {
    await simulate();
    await scope(ws, contractId);
    return depositPage(contractId, page);
  },

  async createEntry(ws, contractId, input) {
    await simulate();
    const { user, archived } = await scope(ws, contractId);
    const note = input.note ?? null;
    const existing = entries.find((e) => e.contractId === contractId && e.key === input.idempotencyKey);
    if (existing) {
      const same = existing.kind === input.kind && existing.amount === input.amount && existing.method === (input.method ?? null) && existing.reason === (input.reason ?? null) && existing.reference === (input.reference ?? null) && existing.note === note && existing.occurredAt === new Date(input.occurredAt).toISOString();
      if (!same) fail(409, 'DEPOSIT_IDEMPOTENCY_CONFLICT', 'Idempotency key reused');
      return strip(existing);
    }
    if (archived && input.kind !== 'REFUND') fail(409, 'WORKSPACE_ARCHIVED', 'Only REFUND while archived');
    const at = new Date(input.occurredAt);
    if (Number.isNaN(at.getTime()) || at.getTime() > Date.now() + FUTURE_TOLERANCE_MS) fail(409, 'DEPOSIT_ENTRY_INVALID', 'Occurred in the future');
    const needsMethod = input.kind !== 'DEDUCTION';
    if (needsMethod !== (input.method !== undefined)) fail(409, 'DEPOSIT_ENTRY_INVALID', 'Method rule');
    if (input.kind !== 'COLLECTION' && (!input.reason?.trim() || !input.reference?.trim())) fail(409, 'DEPOSIT_ENTRY_INVALID', 'Reason and reference required');
    if (input.kind !== 'COLLECTION' && totals(contractId).balance < Number(input.amount)) fail(409, 'DEPOSIT_INSUFFICIENT_BALANCE', 'Insufficient balance');
    const entry = {
      id: nextId('dep'), workspaceId: ws, contractId, kind: input.kind, amount: input.amount, method: input.method ?? null, occurredAt: at.toISOString(),
      reason: input.reason?.trim() || null, reference: input.reference?.trim() || null, note, reversesEntryId: null, reversedByEntryId: null,
      createdBy: user.id, createdAt: new Date().toISOString(), key: input.idempotencyKey,
    };
    entries.push(entry);
    return strip(entry);
  },

  async getEntry(ws, contractId, entryId) {
    await simulate();
    await scope(ws, contractId);
    return strip(entries.find((e) => e.id === entryId && e.contractId === contractId) ?? fail(404, 'DEPOSIT_ENTRY_NOT_FOUND', 'Entry not found'));
  },

  async reverseEntry(ws, contractId, entryId, input) {
    await simulate();
    const { user, archived } = await scope(ws, contractId);
    const existing = entries.find((e) => e.contractId === contractId && e.key === input.idempotencyKey);
    if (existing) {
      if (!(existing.kind === 'REVERSAL' && existing.reversesEntryId === entryId && existing.reason === input.reason.trim())) fail(409, 'DEPOSIT_IDEMPOTENCY_CONFLICT', 'Idempotency key reused');
      return strip(existing);
    }
    if (archived) fail(409, 'WORKSPACE_ARCHIVED', 'Only REFUND while archived');
    const original = entries.find((e) => e.id === entryId && e.contractId === contractId) ?? fail(404, 'DEPOSIT_ENTRY_NOT_FOUND', 'Entry not found');
    if (original.kind === 'REVERSAL' || entries.some((e) => e.reversesEntryId === original.id)) fail(409, 'DEPOSIT_ENTRY_INVALID', 'Not reversible');
    const t = totals(contractId);
    // đảo khoản thu làm số dư âm bị chặn (các bút toán sau đó đã dùng số cọc này)
    if (original.kind === 'COLLECTION' && t.collected - Number(original.amount) - t.deducted - t.refunded < 0) fail(409, 'DEPOSIT_INSUFFICIENT_BALANCE', 'Would make balance negative');
    const entry = {
      id: nextId('dep'), workspaceId: ws, contractId, kind: 'REVERSAL' as const, amount: original.amount, method: original.method, occurredAt: new Date().toISOString(),
      reason: input.reason.trim(), reference: null, note: null, reversesEntryId: original.id, reversedByEntryId: null, createdBy: user.id, createdAt: new Date().toISOString(), key: input.idempotencyKey,
    };
    entries.push(entry);
    return strip(entry);
  },
};

/** Một trang sổ cọc kèm tổng của cả hợp đồng (không tính từ riêng trang); dùng chung cho chủ trọ và người thuê. */
export function depositPage(contractId: string, page: { page: number; limit: number }): DepositPageResponse {
  const all = entries.filter((e) => e.contractId === contractId).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.createdAt.localeCompare(a.createdAt));
  const t = totals(contractId);
  return {
    contractId,
    collectedTotal: String(t.collected),
    deductedTotal: String(t.deducted),
    refundedTotal: String(t.refunded),
    balance: String(t.balance),
    items: all.slice((page.page - 1) * page.limit, page.page * page.limit).map(strip),
    page: page.page,
    limit: page.limit,
    total: all.length,
  };
}
