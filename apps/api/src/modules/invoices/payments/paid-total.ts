import type { PaymentStatus } from '@rental/shared';
import { Prisma } from '../../../generated/prisma/client';

export interface PaymentEntryAmount {
  kind: 'PAYMENT' | 'REVERSAL';
  amount: Prisma.Decimal;
}

/** Confirmed payments minus reversals. */
export function netPaid(entries: PaymentEntryAmount[]) {
  return entries.reduce(
    (sum, e) => (e.kind === 'PAYMENT' ? sum.add(e.amount) : sum.sub(e.amount)),
    new Prisma.Decimal(0),
  );
}

/** Same as {@link netPaid} computed in the database from grouped sums. */
export async function loadNetPaid(
  db: Pick<Prisma.TransactionClient, 'invoicePayment'>,
  invoiceId: string,
) {
  const rows = await db.invoicePayment.groupBy({
    by: ['kind'],
    where: { invoiceId },
    _sum: { amount: true },
  });
  return netPaid(
    rows.map((r) => ({ kind: r.kind, amount: r._sum.amount ?? new Prisma.Decimal(0) })),
  );
}

export function paymentStatus(amountDue: Prisma.Decimal, paid: Prisma.Decimal): PaymentStatus {
  if (paid.greaterThanOrEqualTo(amountDue)) return 'PAID';
  return paid.isZero() ? 'UNPAID' : 'PARTIALLY_PAID';
}
