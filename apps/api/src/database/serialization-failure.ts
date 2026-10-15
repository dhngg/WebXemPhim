/**
 * True for PostgreSQL serialization/deadlock failures. Prisma reports them as P2034 for model
 * queries but as P2010 (raw query failed, SQLSTATE 40001/40P01) when they come from `$queryRaw`,
 * e.g. `SELECT ... FOR UPDATE` inside a Serializable transaction.
 */
export function isSerializationFailure(error: unknown): boolean {
  const e = error as {
    code?: string;
    meta?: { code?: string; message?: string };
    message?: string;
  };
  if (e?.code === 'P2034') return true;
  if (e?.code === 'P2010') {
    const state = e.meta?.code;
    if (state === '40001' || state === '40P01') return true;
  }
  return /could not serialize access|deadlock detected/i.test(
    `${e?.meta?.message ?? ''} ${e?.message ?? ''}`,
  );
}
