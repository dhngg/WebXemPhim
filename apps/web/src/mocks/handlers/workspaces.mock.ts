import type { WorkspacesApi } from '@/features/workspaces/api';
import type { DashboardApi } from '@/features/dashboard/api';
import type { ReportsApi } from '@/features/reports/api';
import type { DueInvoice, ServiceSlice, WorkspaceDashboard } from '@/features/dashboard/types';
import { invoiceBalance, invoiceGrandTotal } from '@/features/billing/calc';
import { addMonths, diffDays, periodEnd, periodLabel } from '@/lib/dates';
import { formatDateTime } from '@/lib/format';
import { db, CURRENT_PERIOD, TODAY } from '../db';
import { requireMember, validation } from '../guard';
import { simulate } from '../mockUtils';
import { requireSession } from './auth.mock';

export const workspacesMock: WorkspacesApi = {
  async listMine() {
    const { empty } = await simulate();
    return empty ? [] : requireSession().memberships;
  },
};

function periodRevenue(ws: string, period: string) {
  const invoices = db.invoices.filter((i) => i.workspaceId === ws && i.period === period && i.status !== 'VOID');
  return {
    expected: invoices.reduce((s, i) => s + invoiceGrandTotal(i), 0),
    confirmed: invoices.reduce((s, i) => s + i.paidConfirmed, 0),
    outstanding: invoices.reduce((s, i) => s + invoiceBalance(i), 0),
    invoices,
  };
}

function relativeTime(iso: string): string {
  const day = iso.slice(0, 10);
  const time = formatDateTime(iso).split(' ')[0];
  const delta = diffDays(TODAY, day);
  if (delta === 0) return `${time} Hôm nay`;
  if (delta === 1) return `${time} Ngày mai`;
  return formatDateTime(iso);
}

export const dashboardMock: DashboardApi = {
  async get(ws) {
    await simulate();
    requireMember(ws);
    const settings = db.settings[ws];
    const rooms = db.rooms.filter((r) => r.workspaceId === ws);
    const occupied = rooms.filter((r) => r.operationalStatus === 'OCCUPIED').length;
    const current = periodRevenue(ws, CURRENT_PERIOD);
    const prevOccupied = db.contracts.filter(
      (c) => c.workspaceId === ws && c.status !== 'DRAFT' && c.startDate <= periodEnd(addMonths(CURRENT_PERIOD, -1)) && c.endDate >= periodEnd(addMonths(CURRENT_PERIOD, -1)),
    ).length;

    const serviceKeys: ServiceSlice['key'][] = ['electricity', 'water', 'internet', 'sanitation'];
    const serviceLabels: Record<ServiceSlice['key'], string> = {
      electricity: 'Điện',
      water: 'Nước sinh hoạt',
      internet: 'Internet cáp quang',
      sanitation: 'Rác & vệ sinh chung',
    };
    const services = serviceKeys.map((key) => ({
      key,
      label: serviceLabels[key],
      amount: current.invoices.flatMap((i) => i.lines).filter((l) => l.key === key).reduce((s, l) => s + l.amount, 0),
    }));

    const unpaid = current.invoices.filter((i) => invoiceBalance(i) > 0);
    const dueInvoices: DueInvoice[] = [...db.invoices.filter((i) => i.workspaceId === ws && invoiceBalance(i) > 0 && i.status !== 'VOID')]
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .map((i) => {
        const tenant = db.tenants.find((t) => t.id === i.tenantId);
        return {
          id: i.id,
          roomCode: i.roomCode,
          buildingName: i.buildingName,
          contractCode: i.contractCode,
          tenantName: i.tenantName,
          tenantPhone: tenant?.phone ?? '',
          amountDue: invoiceBalance(i),
          dueDate: i.dueDate,
          status: i.status === 'OVERDUE' ? 'OVERDUE' : 'AWAITING_TRANSFER',
          overdueDays: i.status === 'OVERDUE' ? diffDays(i.dueDate, TODAY) : undefined,
        } satisfies DueInvoice;
      });

    const data: WorkspaceDashboard = {
      workspaceName: settings?.name ?? '',
      description: settings?.description ?? '',
      syncedAt: new Date().toISOString(),
      kpis: {
        totalRooms: rooms.length,
        buildingCount: db.buildings.filter((b) => b.workspaceId === ws).length,
        occupiedRooms: occupied,
        occupancyChangePct: rooms.length ? ((occupied - prevOccupied) / rooms.length) * 100 : 0,
        vacantRooms: rooms.filter((r) => r.operationalStatus === 'VACANT').length,
        expectedRevenue: current.expected,
        confirmedRevenue: current.confirmed,
        outstandingDebt: current.outstanding,
        unpaidRoomCount: new Set(unpaid.map((i) => i.roomId)).size,
        period: periodLabel(CURRENT_PERIOD),
      },
      revenue: Array.from({ length: 6 }, (_, i) => {
        const period = addMonths(CURRENT_PERIOD, i - 5);
        const r = periodRevenue(ws, period);
        return { period, label: `Tháng ${Number(period.slice(5))}`, expected: r.expected, confirmed: r.confirmed, isCurrent: period === CURRENT_PERIOD };
      }),
      services,
      dueInvoices: dueInvoices.slice(0, 5),
      dueInvoiceTotalCount: dueInvoices.length,
      viewings: db.wsViewings
        .filter((v) => v.workspaceId === ws && (v.status === 'PENDING' || v.status === 'CONFIRMED') && v.scheduledAt.slice(0, 10) >= TODAY)
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
        .slice(0, 4)
        .map((v) => ({
          id: v.id,
          visitorName: v.visitorName,
          visitorPhone: v.visitorPhone,
          roomCode: v.roomCode,
          buildingName: v.buildingName,
          timeLabel: relativeTime(v.scheduledAt),
          status: v.status as 'PENDING' | 'CONFIRMED',
        })),
      maintenance: db.maintenance
        .filter((m) => m.workspaceId === ws && m.status !== 'RESOLVED')
        .slice(0, 3)
        .map((m) => ({
          id: m.id,
          title: m.title,
          roomCode: `Phòng ${m.roomCode}`,
          tenantName: m.tenantName ?? '—',
          priority: m.priority,
          status: m.status,
          note: m.assignee ? `Đã phân công: ${m.assignee}` : 'Chưa phân công',
        })),
      occupancy: rooms
        .sort((a, b) => a.buildingName.localeCompare(b.buildingName) || a.code.localeCompare(b.code))
        .map((r) => ({ roomId: r.id, code: r.code, buildingName: r.buildingName, occupied: r.operationalStatus === 'OCCUPIED' })),
    };
    return data;
  },
};

export const reportsMock: ReportsApi = {
  async get(ws, from, to) {
    await simulate();
    requireMember(ws);
    if (from > to) validation('Khoảng thời gian không hợp lệ.', { from: 'Kỳ bắt đầu phải trước kỳ kết thúc' });
    const totalRooms = db.rooms.filter((r) => r.workspaceId === ws).length;
    const periods: string[] = [];
    for (let p = from; p <= to && periods.length < 24; p = addMonths(p, 1)) periods.push(p);
    const rows = periods.map((period) => {
      const r = periodRevenue(ws, period);
      const end = periodEnd(period);
      const occupied = new Set(
        db.contracts
          .filter((c) => c.workspaceId === ws && c.status !== 'DRAFT' && c.startDate <= end && c.endDate >= end)
          .map((c) => c.roomId),
      ).size;
      const depositsIn = db.deposits.filter((d) => d.workspaceId === ws && d.date.startsWith(period) && d.type === 'COLLECT').reduce((s, d) => s + d.amount, 0);
      const depositsOut = db.deposits.filter((d) => d.workspaceId === ws && d.date.startsWith(period) && d.type !== 'COLLECT').reduce((s, d) => s + d.amount, 0);
      return {
        period,
        expected: r.expected,
        confirmed: r.confirmed,
        outstanding: r.outstanding,
        occupancyRate: totalRooms ? occupied / totalRooms : 0,
        depositsIn,
        depositsOut,
      };
    });
    const depositHeld = db.deposits
      .filter((d) => d.workspaceId === ws)
      .reduce((s, d) => s + (d.type === 'COLLECT' ? d.amount : -d.amount), 0);
    return { rows, depositHeld, totalRooms };
  },
};
