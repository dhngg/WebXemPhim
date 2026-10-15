import type { DashboardResponse } from '@rental/shared';
import type { DashboardApi } from '@/features/dashboard/api';
import { ApiError } from '@/services/http/ApiError';
import { addDays, currentPeriod, todayVN } from '@/lib/dates';
import { businessDateOf } from '@rental/shared';
import { db } from '../db';
import { requireMember } from '../guard';
import { simulate } from '../mockUtils';
import { invoiceStore, paymentLedger } from './invoices.mock';
import { maintenanceOwnerMock, maintenanceStore } from './maintenance-requests.mock';
import { tenancyMock } from './tenancy.mock';

/**
 * Mock trả đúng DashboardResponse của backend (tổng hợp theo workspace, tùy chọn một tòa nhà và kỳ YYYY-MM), tính từ
 * các kho mock của hợp đồng / hóa đơn / thanh toán / bảo trì để các con số khớp với những màn hình khác. Tiền là chuỗi VND nguyên.
 */
const fail = (status: number, code: string, message: string): never => {
  throw new ApiError({ statusCode: status, code, message });
};
const whole = (n: number) => String(Math.round(n));

export const dashboardMock: DashboardApi = {
  async get(ws, q) {
    await simulate();
    requireMember(ws, 'rooms.write');
    const buildings = db.buildings.filter((b) => b.workspaceId === ws);
    if (q.buildingId && !buildings.some((b) => b.id === q.buildingId)) fail(404, 'BUILDING_NOT_FOUND', 'Building not found');
    const period = q.period ?? currentPeriod();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) fail(400, 'VALIDATION_ERROR', 'Invalid period');
    const inScope = (buildingId: string) => !q.buildingId || buildingId === q.buildingId;
    for (const b of buildings) await maintenanceOwnerMock.list(ws, b.id, {}, { page: 1, limit: 1 }); // nạp dữ liệu mẫu bảo trì
    const today = todayVN();

    const rooms = db.rooms.filter((r) => r.workspaceId === ws && inScope(r.buildingId));
    const occupied = rooms.filter((r) => r.operationalStatus === 'OCCUPIED').length;
    const vacant = rooms.filter((r) => r.operationalStatus === 'VACANT').length;

    const contracts = (await tenancyMock.listContracts(ws)).filter((c) => inScope(c.buildingId));
    const active = contracts.filter((c) => c.status === 'ACTIVE');
    const inEffect = contracts.filter((c) => c.phase === 'IN_EFFECT');

    const invs = invoiceStore.filter((i) => i.workspaceId === ws && inScope(i.buildingId));
    const issued = invs.filter((i) => i.status === 'ISSUED');
    const inPeriod = issued.filter((i) => i.period === period);
    const owing = issued.filter((i) => Number(i.outstanding) > 0);
    const overdue = owing.filter((i) => i.dueDate !== null && i.dueDate < today);
    const buildingOf = new Map(invs.map((i) => [i.id, i.buildingId]));
    const collected = paymentLedger
      .filter((p) => p.workspaceId === ws && buildingOf.has(p.invoiceId) && businessDateOf(p.receivedAt).slice(0, 7) === period)
      .reduce((s, p) => s + (p.kind === 'PAYMENT' ? Number(p.amount) : -Number(p.amount)), 0);

    const mnt = maintenanceStore.filter((m) => m.workspaceId === ws && inScope(m.buildingId));
    const count = (status: string) => mnt.filter((m) => m.status === status).length;

    return {
      workspaceId: ws,
      buildingId: q.buildingId ?? null,
      period,
      rooms: { total: rooms.length, vacant, occupied, unavailable: rooms.length - vacant - occupied },
      contracts: {
        active: active.length,
        ended: contracts.filter((c) => c.status === 'ENDED').length,
        expiringWithin30Days: inEffect.filter((c) => c.endDate >= today && c.endDate <= addDays(today, 30)).length,
        inEffect: inEffect.length,
        upcoming: contracts.filter((c) => c.phase === 'UPCOMING').length,
        overdue: contracts.filter((c) => c.phase === 'OVERDUE').length,
      },
      invoices: {
        draft: invs.filter((i) => i.status === 'DRAFT').length,
        issued: issued.length,
        issuedInPeriod: inPeriod.length,
        billedInPeriod: whole(inPeriod.reduce((s, i) => s + Number(i.adjustedTotal), 0)),
        unpaid: issued.filter((i) => i.paymentStatus === 'UNPAID').length,
        partiallyPaid: issued.filter((i) => i.paymentStatus === 'PARTIALLY_PAID').length,
        paid: issued.filter((i) => i.paymentStatus === 'PAID').length,
      },
      revenue: { collected: whole(collected) },
      receivables: {
        outstanding: whole(owing.reduce((s, i) => s + Number(i.outstanding), 0)),
        overdueInvoices: overdue.length,
        overdueOutstanding: whole(overdue.reduce((s, i) => s + Number(i.outstanding), 0)),
      },
      maintenance: { open: count('OPEN'), inProgress: count('IN_PROGRESS'), resolved: count('RESOLVED'), closed: count('CLOSED'), cancelled: count('CANCELLED') },
    } satisfies DashboardResponse;
  },
};
