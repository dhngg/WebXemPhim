import type { DepositEntryKind } from '@rental/shared';
import { Prisma } from '../../generated/prisma/client';

export interface LedgerEntry {
  id: string;
  kind: DepositEntryKind;
  amount: Prisma.Decimal;
  reversesEntryId: string | null;
}
export interface DepositTotals {
  collected: Prisma.Decimal;
  deducted: Prisma.Decimal;
  refunded: Prisma.Decimal;
  balance: Prisma.Decimal;
}

/**
 * Effective totals: a REVERSAL cancels the entry it reverses, so a reversed collection no longer
 * counts as collected, and a reversed deduction/refund no longer counts as taken out.
 */
export function depositTotals(entries: LedgerEntry[]): DepositTotals {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const zero = () => new Prisma.Decimal(0);
  let collected = zero();
  let deducted = zero();
  let refunded = zero();
  for (const e of entries) {
    const kind = e.kind === 'REVERSAL' ? byId.get(e.reversesEntryId ?? '')?.kind : e.kind;
    const sign = e.kind === 'REVERSAL' ? e.amount.neg() : e.amount;
    if (kind === 'COLLECTION') collected = collected.add(sign);
    else if (kind === 'DEDUCTION') deducted = deducted.add(sign);
    else if (kind === 'REFUND') refunded = refunded.add(sign);
  }
  return { collected, deducted, refunded, balance: collected.sub(deducted).sub(refunded) };
}
