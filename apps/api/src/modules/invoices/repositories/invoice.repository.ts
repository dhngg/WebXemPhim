import { Injectable } from '@nestjs/common';
import {
  isCancelledBeforeStart,
  type CreateInvoiceRequest,
  type UpdateInvoiceRequest,
} from '@rental/shared';
import {
  Prisma,
  type BuildingStatus,
  type Invoice,
  type InvoiceItem,
  type WorkspaceStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceNotFoundRepositoryError,
} from '../../workspaces/repositories/workspace.repository';
import { ContractNotFoundRepositoryError } from '../../contracts/repositories/contract.repository';
import {
  calculateInvoice,
  contractDaysInPeriod,
  nextPeriodStart,
  periodCutoff,
  periodStart,
  type CalcResult,
} from '../invoice-calculator';
import type { InvoiceQueryDto, TenantInvoiceQueryDto } from '../dto/invoice.dto';

export type InvoiceRecord = Invoice & {
  items: InvoiceItem[];
  adjustments: Array<{ amount: Prisma.Decimal }>;
  payments: Array<{ kind: 'PAYMENT' | 'REVERSAL'; amount: Prisma.Decimal }>;
};
export class InvoiceNotFoundRepositoryError extends Error {}
export class InvoiceDuplicateRepositoryError extends Error {}
export class InvoiceNotEditableRepositoryError extends Error {}
export class InvoiceIncompleteRepositoryError extends Error {}
export class InvoicePeriodInvalidRepositoryError extends Error {}
export class InvoiceNotEligibleRepositoryError extends Error {}
export class InvoiceVehicleBillingConflictRepositoryError extends Error {}

const include = {
  items: { orderBy: { sortOrder: 'asc' as const } },
  adjustments: { select: { amount: true } },
  payments: { select: { kind: true, amount: true } },
};
const serializable = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };

interface ComputeArgs {
  buildingId: string;
  period: string;
  occupantCount: number | null;
  confirmation: { by: string; at: Date } | null;
  /** Manager decision for tenants with several contracts in the period. */
  requestedBillsVehicles: boolean | null;
  invoiceId?: string;
}
interface ContractLike {
  monthlyRent: Prisma.Decimal;
  startDate: Date;
  endDate: Date;
  status?: 'ACTIVE' | 'ENDED';
  endedAt?: Date | null;
  tenantId: string;
  roomId: string;
  workspaceId: string;
}

@Injectable()
export class InvoiceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    workspaceId: string,
    actorUserId: string,
    buildingId: string,
    input: CreateInvoiceRequest,
  ): Promise<InvoiceRecord> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await assertScope(tx, workspaceId, actorUserId, buildingId);
        const contract = await tx.contract.findFirst({
          where: { id: input.contractId, workspaceId, room: { buildingId } },
        });
        if (!contract) throw new ContractNotFoundRepositoryError();
        const existing = await tx.invoice.findUnique({
          where: {
            contractId_period: { contractId: contract.id, period: periodStart(input.period) },
          },
          select: { id: true },
        });
        if (existing) throw new InvoiceDuplicateRepositoryError();
        const confirmation =
          input.occupantCount === undefined ? null : { by: actorUserId, at: new Date() };
        const { calc, billsVehicles } = await compute(tx, contract, {
          buildingId,
          period: input.period,
          occupantCount: input.occupantCount ?? null,
          confirmation,
          requestedBillsVehicles: input.billVehicles ?? null,
        });
        const invoice = await tx.invoice.create({
          data: {
            workspaceId,
            buildingId,
            roomId: contract.roomId,
            contractId: contract.id,
            tenantId: contract.tenantId,
            period: periodStart(input.period),
            occupantCount: input.occupantCount,
            occupantCountConfirmedBy: confirmation?.by,
            occupantCountConfirmedAt: confirmation?.at,
            billsVehicles,
            dueDate: input.dueDate ? toDate(input.dueDate) : undefined,
            notes: input.notes,
            missingItems: calc.missing as unknown as Prisma.InputJsonValue,
            createdBy: actorUserId,
          },
        });
        await writeItems(tx, workspaceId, invoice.id, calc);
        return tx.invoice.findUniqueOrThrow({ where: { id: invoice.id }, include });
      }, serializable);
    } catch (error) {
      throw translate(error);
    }
  }

  async list(workspaceId: string, buildingId: string, query: InvoiceQueryDto) {
    const where: Prisma.InvoiceWhereInput = {
      workspaceId,
      buildingId,
      status: query.status,
      roomId: query.roomId,
      contractId: query.contractId,
      period: query.period ? periodStart(query.period) : undefined,
    };
    return this.page(where, query.page, query.limit);
  }

  async get(workspaceId: string, buildingId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, workspaceId, buildingId },
      include,
    });
    if (!invoice) throw new InvoiceNotFoundRepositoryError();
    return invoice;
  }

  /** Re-prices a DRAFT from the current rates, room services, meter readings and vehicles. */
  async update(
    workspaceId: string,
    actorUserId: string,
    buildingId: string,
    invoiceId: string,
    input: UpdateInvoiceRequest,
  ): Promise<InvoiceRecord> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await assertScope(tx, workspaceId, actorUserId, buildingId);
        const invoice = await lockDraft(tx, workspaceId, buildingId, invoiceId);
        const confirmed = input.occupantCount !== undefined;
        const occupantCount = confirmed ? (input.occupantCount ?? null) : invoice.occupantCount;
        const confirmation = confirmed
          ? { by: actorUserId, at: new Date() }
          : invoice.occupantCountConfirmedBy && invoice.occupantCountConfirmedAt
            ? { by: invoice.occupantCountConfirmedBy, at: invoice.occupantCountConfirmedAt }
            : null;
        const { calc, billsVehicles } = await recalc(tx, invoice, {
          occupantCount,
          confirmation,
          requestedBillsVehicles: input.billVehicles ?? invoice.billsVehicles,
        });
        await tx.invoice.update({
          where: { id: invoiceId },
          data: {
            occupantCount,
            occupantCountConfirmedBy: confirmation?.by ?? null,
            occupantCountConfirmedAt: confirmation?.at ?? null,
            billsVehicles,
            dueDate: input.dueDate ? toDate(input.dueDate) : undefined,
            notes: input.notes,
            missingItems: calc.missing as unknown as Prisma.InputJsonValue,
          },
        });
        await writeItems(tx, workspaceId, invoiceId, calc);
        return tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include });
      }, serializable);
    } catch (error) {
      throw translate(error);
    }
  }

  /** Re-prices and freezes a DRAFT; refuses when anything is missing. */
  async issue(
    workspaceId: string,
    actorUserId: string,
    buildingId: string,
    invoiceId: string,
  ): Promise<InvoiceRecord> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await assertScope(tx, workspaceId, actorUserId, buildingId);
        const invoice = await lockDraft(tx, workspaceId, buildingId, invoiceId);
        const { calc, billsVehicles } = await recalc(tx, invoice, {
          occupantCount: invoice.occupantCount,
          confirmation:
            invoice.occupantCountConfirmedBy && invoice.occupantCountConfirmedAt
              ? { by: invoice.occupantCountConfirmedBy, at: invoice.occupantCountConfirmedAt }
              : null,
          requestedBillsVehicles: invoice.billsVehicles,
        });
        if (calc.missing.length > 0) throw new InvoiceIncompleteRepositoryError();
        await writeItems(tx, workspaceId, invoiceId, calc);
        const total = calc.items.reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0));
        await tx.invoice.update({
          where: { id: invoiceId },
          data: {
            status: 'ISSUED',
            totalAmount: total,
            billsVehicles,
            missingItems: [],
            issuedAt: new Date(),
            issuedBy: actorUserId,
          },
        });
        return tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include });
      }, serializable);
    } catch (error) {
      throw translate(error);
    }
  }

  async deleteDraft(
    workspaceId: string,
    actorUserId: string,
    buildingId: string,
    invoiceId: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await assertScope(tx, workspaceId, actorUserId, buildingId);
      await lockDraft(tx, workspaceId, buildingId, invoiceId);
      await tx.invoiceItem.deleteMany({ where: { invoiceId } });
      await tx.invoice.delete({ where: { id: invoiceId } });
    }, serializable);
  }

  listForTenant(userId: string, query: TenantInvoiceQueryDto) {
    return this.page(
      { ...tenantWhere(userId), period: query.period ? periodStart(query.period) : undefined },
      query.page,
      query.limit,
    );
  }

  async getForTenant(userId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, ...tenantWhere(userId) },
      include,
    });
    if (!invoice) throw new InvoiceNotFoundRepositoryError();
    return invoice;
  }

  private async page(where: Prisma.InvoiceWhereInput, page: number, limit: number) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        include,
        orderBy: [{ period: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return { items, total };
  }
}

/** Tenants only see ISSUED invoices of contracts whose tenant is linked to them (not revoked). */
const tenantWhere = (userId: string): Prisma.InvoiceWhereInput => ({
  status: 'ISSUED',
  contract: { tenant: { userLinks: { some: { userId, revokedAt: null } } } },
});

async function assertScope(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  userId: string,
  buildingId: string,
) {
  const ws = await tx.$queryRaw<Array<{ status: WorkspaceStatus }>>(
    Prisma.sql`SELECT "status" FROM "workspaces" WHERE "id"=${workspaceId}::uuid FOR SHARE`,
  );
  if (!ws[0]) throw new WorkspaceNotFoundRepositoryError();
  if (ws[0].status !== 'ACTIVE') throw new WorkspaceArchivedRepositoryError();
  const membership = await tx.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
  if (membership?.role !== 'OWNER') throw new WorkspaceNotFoundRepositoryError();
  const building = await tx.$queryRaw<Array<{ status: BuildingStatus }>>(
    Prisma.sql`SELECT "status" FROM "buildings" WHERE "id"=${buildingId}::uuid AND "workspace_id"=${workspaceId}::uuid FOR SHARE`,
  );
  if (!building[0]) throw new InvoiceNotFoundRepositoryError();
  if (building[0].status !== 'ACTIVE') throw new InvoiceNotEligibleRepositoryError();
}

async function lockDraft(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  buildingId: string,
  invoiceId: string,
) {
  const rows = await tx.$queryRaw<Array<{ status: string }>>(
    Prisma.sql`SELECT "status"::text AS "status" FROM "invoices" WHERE "id"=${invoiceId}::uuid AND "workspace_id"=${workspaceId}::uuid AND "building_id"=${buildingId}::uuid FOR UPDATE`,
  );
  if (!rows[0]) throw new InvoiceNotFoundRepositoryError();
  if (rows[0].status !== 'DRAFT') throw new InvoiceNotEditableRepositoryError();
  return tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
}

async function recalc(
  tx: Prisma.TransactionClient,
  invoice: Invoice,
  args: Pick<ComputeArgs, 'occupantCount' | 'confirmation' | 'requestedBillsVehicles'>,
) {
  const contract = await tx.contract.findUniqueOrThrow({ where: { id: invoice.contractId } });
  return compute(tx, contract, {
    ...args,
    buildingId: invoice.buildingId,
    period: invoice.period.toISOString().slice(0, 7),
    invoiceId: invoice.id,
  });
}

function isCancelledContract(contract: {
  status?: 'ACTIVE' | 'ENDED';
  startDate: Date;
  endedAt?: Date | null;
}): boolean {
  return (
    contract.status !== undefined &&
    isCancelledBeforeStart({
      status: contract.status,
      startDate: contract.startDate.toISOString().slice(0, 10),
      endedAt: contract.endedAt ?? null,
    })
  );
}

async function compute(
  tx: Prisma.TransactionClient,
  contract: ContractLike,
  args: ComputeArgs,
): Promise<{ calc: CalcResult; billsVehicles: boolean | null }> {
  const { period } = args;
  // A contract cancelled before its startDate never took effect: nothing is billable, whatever dates it registered.
  if (isCancelledContract(contract) || contractDaysInPeriod(period, contract) === 0)
    throw new InvoicePeriodInvalidRepositoryError();
  const start = periodStart(period);
  const next = nextPeriodStart(period);
  const cutoff = periodCutoff(period);
  const [rates, assignments, readings, vehicles, overlappingContracts] = await Promise.all([
    tx.ratePlan.findMany({
      where: {
        workspaceId: contract.workspaceId,
        buildingId: args.buildingId,
        effectiveFrom: { lt: next },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: start } }],
      },
    }),
    // Only services explicitly assigned to the room are ever billed.
    tx.roomServiceAssignment.findMany({
      where: {
        workspaceId: contract.workspaceId,
        roomId: contract.roomId,
        effectiveFrom: { lt: next },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: start } }],
      },
    }),
    tx.meterReading.findMany({ where: { roomId: contract.roomId, period: start } }),
    // Effective at the period cutoff: declared before it and not deactivated at or before it.
    tx.vehicle.findMany({
      where: {
        workspaceId: contract.workspaceId,
        tenantId: contract.tenantId,
        createdAt: { lt: cutoff },
        OR: [{ inactiveAt: null }, { inactiveAt: { gt: cutoff } }],
      },
      select: { licensePlate: true },
    }),
    tx.contract.findMany({
      where: {
        workspaceId: contract.workspaceId,
        tenantId: contract.tenantId,
        startDate: { lt: next },
        endDate: { gte: start },
      },
      select: { status: true, startDate: true, endedAt: true },
    }),
  ]);
  // One contract in the period: unambiguous. Several: the manager must pick which invoice bills.
  const billsVehicles =
    overlappingContracts.filter((c) => !isCancelledContract(c)).length <= 1
      ? true
      : args.requestedBillsVehicles;
  if (billsVehicles === true) {
    const claimed = await tx.invoice.findFirst({
      where: {
        tenantId: contract.tenantId,
        period: start,
        billsVehicles: true,
        ...(args.invoiceId ? { NOT: { id: args.invoiceId } } : {}),
      },
      select: { id: true },
    });
    if (claimed) throw new InvoiceVehicleBillingConflictRepositoryError();
  }
  const meters: Parameters<typeof calculateInvoice>[0]['meters'] = {};
  for (const r of readings) meters[r.meterType] = r;
  const calc = calculateInvoice({
    period,
    contract,
    rates,
    assignments: assignments.map((a) => ({
      code: a.rateCode,
      effectiveFrom: a.effectiveFrom,
      effectiveTo: a.effectiveTo,
    })),
    meters,
    vehiclePlates: vehicles.map((v) => v.licensePlate),
    billsVehicles,
    occupantCount: args.occupantCount,
    occupantConfirmation: args.confirmation,
  });
  return { calc, billsVehicles };
}

async function writeItems(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  invoiceId: string,
  calc: CalcResult,
) {
  await tx.invoiceItem.deleteMany({ where: { invoiceId } });
  if (calc.items.length === 0) return;
  await tx.invoiceItem.createMany({
    data: calc.items.map((item, index) => ({
      workspaceId,
      invoiceId,
      sortOrder: index + 1,
      itemType: item.itemType,
      code: item.code,
      description: item.description,
      unit: item.unit,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      prorationNumerator: item.prorationNumerator,
      prorationDenominator: item.prorationDenominator,
      amount: item.amount,
      ratePlanId: item.ratePlanId,
      meterReadingId: item.meterReadingId,
      meterRevision: item.meterRevision,
      details: item.details as Prisma.InputJsonValue,
    })),
  });
}

const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

/** Maps database uniqueness/exclusion violations (including concurrent requests) to domain errors. */
function translate(error: unknown) {
  const text =
    error instanceof Error
      ? `${error.message} ${JSON.stringify((error as { meta?: unknown }).meta ?? '')}`
      : '';
  if (text.includes('invoices_vehicle_billing_excl'))
    return new InvoiceVehicleBillingConflictRepositoryError();
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2002' || error.code === 'P2034')
  )
    return new InvoiceDuplicateRepositoryError();
  return error;
}
