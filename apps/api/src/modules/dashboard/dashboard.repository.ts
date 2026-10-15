import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';

export class DashboardBuildingNotFoundRepositoryError extends Error {}

export interface DashboardRaw {
  rooms: { total: number; vacant: number; occupied: number; unavailable: number };
  contracts: {
    active: number;
    ended: number;
    expiring: number;
    inEffect: number;
    upcoming: number;
    overdue: number;
  };
  invoices: {
    draft: number;
    issued: number;
    issuedInPeriod: number;
    billedInPeriod: string;
    unpaid: number;
    partiallyPaid: number;
    paid: number;
  };
  collected: string;
  outstanding: string;
  overdueInvoices: number;
  overdueOutstanding: string;
  maintenance: {
    open: number;
    inProgress: number;
    resolved: number;
    closed: number;
    cancelled: number;
  };
}

type Row = Record<string, bigint | number | string | null>;
const one = async (q: PromiseLike<Row[]>): Promise<Row> => (await q)[0] ?? {};
const n = (v: unknown) => Number(v ?? 0);
const money = (v: unknown) => new Prisma.Decimal((v as string | null) ?? 0).toFixed(0);

/**
 * Read-only aggregates computed in the database. Every query is scoped by workspace (and optionally
 * Building); dates use Asia/Ho_Chi_Minh. Deposits are never part of any figure.
 */
@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async summarize(
    workspaceId: string,
    buildingId: string | null,
    period: string,
  ): Promise<DashboardRaw> {
    return this.prisma.$transaction(
      async (tx) => {
        if (buildingId) {
          const found = await tx.building.findFirst({
            where: { id: buildingId, workspaceId },
            select: { id: true },
          });
          if (!found) throw new DashboardBuildingNotFoundRepositoryError();
        }
        const periodStart = Prisma.sql`${`${period}-01`}::date`;
        const bScope = (alias: string) =>
          buildingId
            ? Prisma.sql`AND ${Prisma.raw(alias)}."building_id" = ${buildingId}::uuid`
            : Prisma.empty;
        const today = Prisma.sql`(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`;

        // Occupancy follows the dates, not the stored flag: a room is occupied from the day an ACTIVE
        // contract starts (no cron flips the stored status) and a future contract does not occupy it.
        const rooms = await one(tx.$queryRaw<Row[]>`
          SELECT COUNT(*) AS total,
                 COUNT(*) FILTER (WHERE s."room_id" IS NULL AND r."status" <> 'UNAVAILABLE') AS vacant,
                 COUNT(*) FILTER (WHERE s."room_id" IS NOT NULL) AS occupied,
                 COUNT(*) FILTER (WHERE s."room_id" IS NULL AND r."status" = 'UNAVAILABLE') AS unavailable
          FROM "rooms" r
          LEFT JOIN (
            SELECT DISTINCT c."room_id" FROM "contracts" c
            WHERE c."workspace_id" = ${workspaceId}::uuid AND c."status" = 'ACTIVE' AND c."start_date" <= ${today}
          ) s ON s."room_id" = r."id"
          WHERE r."workspace_id" = ${workspaceId}::uuid AND r."archived_at" IS NULL ${bScope('r')}`);

        const contracts = await one(tx.$queryRaw<Row[]>`
          SELECT COUNT(*) FILTER (WHERE c."status" = 'ACTIVE') AS active,
                 COUNT(*) FILTER (WHERE c."status" = 'ENDED') AS ended,
                 COUNT(*) FILTER (WHERE c."status" = 'ACTIVE' AND c."start_date" <= ${today}
                   AND c."end_date" BETWEEN ${today} AND ${today} + 30) AS expiring,
                 COUNT(*) FILTER (WHERE c."status" = 'ACTIVE' AND c."start_date" <= ${today}
                   AND c."end_date" >= ${today}) AS in_effect,
                 COUNT(*) FILTER (WHERE c."status" = 'ACTIVE' AND c."start_date" > ${today}) AS upcoming,
                 COUNT(*) FILTER (WHERE c."status" = 'ACTIVE' AND c."end_date" < ${today}) AS overdue
          FROM "contracts" c
          JOIN "rooms" r ON r."id" = c."room_id" AND r."workspace_id" = c."workspace_id"
          WHERE c."workspace_id" = ${workspaceId}::uuid ${bScope('r')}`);

        // amount_due = total + adjustments; paid = payments - reversals (confirmed ledger only).
        const invoices = await one(tx.$queryRaw<Row[]>`
          WITH inv AS (
            SELECT i."id", i."status", i."period", i."due_date",
                   COALESCE(i."total_amount", 0)
                     + COALESCE((SELECT SUM(a."amount") FROM "invoice_adjustments" a WHERE a."invoice_id" = i."id"), 0) AS due,
                   COALESCE((SELECT SUM(CASE WHEN p."kind" = 'PAYMENT' THEN p."amount" ELSE -p."amount" END)
                             FROM "invoice_payments" p WHERE p."invoice_id" = i."id"), 0) AS paid
            FROM "invoices" i
            WHERE i."workspace_id" = ${workspaceId}::uuid ${bScope('i')}
          )
          SELECT COUNT(*) FILTER (WHERE "status" = 'DRAFT') AS draft,
                 COUNT(*) FILTER (WHERE "status" = 'ISSUED') AS issued,
                 COUNT(*) FILTER (WHERE "status" = 'ISSUED' AND "period" = ${periodStart}) AS issued_in_period,
                 COALESCE(SUM(due) FILTER (WHERE "status" = 'ISSUED' AND "period" = ${periodStart}), 0) AS billed,
                 COUNT(*) FILTER (WHERE "status" = 'ISSUED' AND paid <= 0 AND due > 0) AS unpaid,
                 COUNT(*) FILTER (WHERE "status" = 'ISSUED' AND paid > 0 AND paid < due) AS partial,
                 COUNT(*) FILTER (WHERE "status" = 'ISSUED' AND paid >= due) AS paid_full,
                 COALESCE(SUM(due - paid) FILTER (WHERE "status" = 'ISSUED' AND due > paid), 0) AS outstanding,
                 COUNT(*) FILTER (WHERE "status" = 'ISSUED' AND due > paid AND "due_date" < ${today}) AS overdue_count,
                 COALESCE(SUM(due - paid) FILTER (WHERE "status" = 'ISSUED' AND due > paid AND "due_date" < ${today}), 0) AS overdue_amount
          FROM inv`);

        const revenue = await one(tx.$queryRaw<Row[]>`
          SELECT COALESCE(SUM(CASE WHEN p."kind" = 'PAYMENT' THEN p."amount" ELSE -p."amount" END), 0) AS collected
          FROM "invoice_payments" p
          JOIN "invoices" i ON i."id" = p."invoice_id" AND i."workspace_id" = p."workspace_id"
          WHERE p."workspace_id" = ${workspaceId}::uuid ${bScope('i')}
            AND (p."received_at" AT TIME ZONE 'Asia/Ho_Chi_Minh') >= ${periodStart}
            AND (p."received_at" AT TIME ZONE 'Asia/Ho_Chi_Minh') < ${periodStart} + INTERVAL '1 month'`);

        const maintenance = await one(tx.$queryRaw<Row[]>`
          SELECT COUNT(*) FILTER (WHERE m."status" = 'OPEN') AS open,
                 COUNT(*) FILTER (WHERE m."status" = 'IN_PROGRESS') AS in_progress,
                 COUNT(*) FILTER (WHERE m."status" = 'RESOLVED') AS resolved,
                 COUNT(*) FILTER (WHERE m."status" = 'CLOSED') AS closed,
                 COUNT(*) FILTER (WHERE m."status" = 'CANCELLED') AS cancelled
          FROM "maintenance_requests" m
          WHERE m."workspace_id" = ${workspaceId}::uuid ${bScope('m')}`);

        return {
          rooms: {
            total: n(rooms.total),
            vacant: n(rooms.vacant),
            occupied: n(rooms.occupied),
            unavailable: n(rooms.unavailable),
          },
          contracts: {
            active: n(contracts.active),
            ended: n(contracts.ended),
            expiring: n(contracts.expiring),
            inEffect: n(contracts.in_effect),
            upcoming: n(contracts.upcoming),
            overdue: n(contracts.overdue),
          },
          invoices: {
            draft: n(invoices.draft),
            issued: n(invoices.issued),
            issuedInPeriod: n(invoices.issued_in_period),
            billedInPeriod: money(invoices.billed),
            unpaid: n(invoices.unpaid),
            partiallyPaid: n(invoices.partial),
            paid: n(invoices.paid_full),
          },
          collected: money(revenue.collected),
          outstanding: money(invoices.outstanding),
          overdueInvoices: n(invoices.overdue_count),
          overdueOutstanding: money(invoices.overdue_amount),
          maintenance: {
            open: n(maintenance.open),
            inProgress: n(maintenance.in_progress),
            resolved: n(maintenance.resolved),
            closed: n(maintenance.closed),
            cancelled: n(maintenance.cancelled),
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
