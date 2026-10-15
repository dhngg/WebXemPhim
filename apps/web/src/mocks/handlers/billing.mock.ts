import type { BillingApi, MeterSheetRow } from '@/features/billing/api';
import type { BillingPreviewItem, Invoice, MeterReading, Payment } from '@/features/billing/types';
import {
  buildInvoiceLines,
  contractDaysInPeriod,
  deriveInvoiceStatus,
  invoiceBalance,
  rateForDate,
  sumLines,
} from '@/features/billing/calc';
import { addMonths, periodEnd, periodStart } from '@/lib/dates';
import { formatVnd } from '@/lib/format';
import { audit, db, nextId, TODAY } from '../db';
import { conflict, includesText, requireMember, validation } from '../guard';
import { notFound, simulate } from '../mockUtils';

const findInvoice = (ws: string, id: string) =>
  db.invoices.find((i) => i.workspaceId === ws && i.id === id) ?? notFound('Không tìm thấy hóa đơn.');

function refreshStatus(inv: Invoice) {
  inv.status = deriveInvoiceStatus(inv, TODAY);
}

function contractsForPeriod(ws: string, period: string) {
  return db.contracts.filter(
    (c) =>
      c.workspaceId === ws &&
      (c.status === 'ACTIVE' || c.status === 'ENDED' || c.status === 'TERMINATED') &&
      contractDaysInPeriod(c.startDate, c.endDate, period) > 0,
  );
}

function preview(ws: string, period: string): BillingPreviewItem[] {
  const rate = rateForDate(db.rates.filter((r) => r.workspaceId === ws), periodStart(period));
  return contractsForPeriod(ws, period).map((c) => {
    const base = {
      contractId: c.id,
      contractCode: c.code,
      roomCode: c.roomCode,
      buildingName: c.buildingName,
      tenantName: c.primaryTenantName,
    };
    // BR-02: tối đa 1 hóa đơn thường / hợp đồng / kỳ.
    if (db.invoices.some((i) => i.contractId === c.id && i.period === period && i.status !== 'VOID')) {
      return { ...base, lines: [], total: 0, status: 'ALREADY_ISSUED' as const, message: 'Đã có hóa đơn kỳ này' };
    }
    if (!rate) return { ...base, lines: [], total: 0, status: 'NO_RATE' as const, message: 'Chưa có bảng giá hiệu lực' };
    const reading = db.meterReadings.find((m) => m.roomId === c.roomId && m.period === period);
    if (!reading) {
      return { ...base, lines: [], total: 0, status: 'MISSING_METER' as const, message: 'Chưa ghi chỉ số điện nước' };
    }
    const vehicleFees = db.vehicles
      .filter((v) => c.occupantIds.includes(v.tenantId))
      .map((v) => ({ label: v.plate, fee: v.monthlyFee }));
    const lines = buildInvoiceLines({ contract: c, rate, period, reading, vehicleFees });
    return { ...base, lines, total: sumLines(lines), status: 'READY' as const };
  });
}

export const billingMock: BillingApi = {
  async listRates(ws) {
    await simulate();
    requireMember(ws);
    return db.rates.filter((r) => r.workspaceId === ws).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  },
  async createRate(ws, input) {
    await simulate();
    const { user } = requireMember(ws, 'billing.run');
    if (db.rates.some((r) => r.workspaceId === ws && r.effectiveFrom === input.effectiveFrom)) {
      conflict('Đã có phiên bản đơn giá áp dụng từ ngày này.');
    }
    const rate = { ...input, id: nextId('rate'), workspaceId: ws, createdAt: new Date().toISOString(), createdBy: user.fullName };
    db.rates.push(rate);
    audit(user.email, 'Tạo phiên bản đơn giá', `Áp dụng từ ${input.effectiveFrom}`, 'BILLING');
    return rate;
  },

  async getMeterSheet(ws, period) {
    const { empty } = await simulate();
    requireMember(ws);
    if (empty) return [];
    const prev = addMonths(period, -1);
    const roomIds = new Set(contractsForPeriod(ws, period).map((c) => c.roomId));
    return db.rooms
      .filter((r) => r.workspaceId === ws && roomIds.has(r.id))
      .sort((a, b) => a.buildingName.localeCompare(b.buildingName) || a.code.localeCompare(b.code))
      .map<MeterSheetRow>((r) => {
        const last = db.meterReadings.find((m) => m.roomId === r.id && m.period === prev);
        return {
          roomId: r.id,
          roomCode: r.code,
          buildingName: r.buildingName,
          previous: last ? { electric: last.electricNew, water: last.waterNew } : null,
          reading: db.meterReadings.find((m) => m.roomId === r.id && m.period === period) ?? null,
        };
      });
  },
  async saveMeter(ws, input) {
    await simulate();
    requireMember(ws, 'rooms.write');
    const errors: Record<string, string> = {};
    if (input.electricNew < input.electricOld) errors.electricNew = 'Số điện mới phải ≥ số cũ';
    if (input.waterNew < input.waterOld) errors.waterNew = 'Số nước mới phải ≥ số cũ';
    if (Object.keys(errors).length) validation('Chỉ số không hợp lệ.', errors);
    if (db.invoices.some((i) => i.roomId === input.roomId && i.period === input.period && i.status !== 'VOID')) {
      conflict('Kỳ này đã phát hành hóa đơn cho phòng — không thể sửa chỉ số (cần hóa đơn điều chỉnh).');
    }
    const room = db.rooms.find((r) => r.workspaceId === ws && r.id === input.roomId) ?? notFound('Phòng không tồn tại.');
    const existing = db.meterReadings.find((m) => m.roomId === input.roomId && m.period === input.period);
    if (existing) {
      Object.assign(existing, input, { recordedAt: new Date().toISOString() });
      return existing;
    }
    const reading: MeterReading = {
      ...input,
      id: nextId('mtr'),
      workspaceId: ws,
      roomCode: room.code,
      buildingName: room.buildingName,
      recordedAt: new Date().toISOString(),
    };
    db.meterReadings.push(reading);
    return reading;
  },

  async listInvoices(ws, f) {
    const { empty } = await simulate();
    requireMember(ws);
    if (empty) return [];
    return db.invoices
      .filter(
        (i) =>
          i.workspaceId === ws &&
          (!f.period || i.period === f.period) &&
          (!f.status || i.status === f.status) &&
          (!f.contractId || i.contractId === f.contractId) &&
          includesText(`${i.code} ${i.roomCode} ${i.tenantName} ${i.contractCode}`, f.q),
      )
      .sort((a, b) => b.period.localeCompare(a.period) || a.roomCode.localeCompare(b.roomCode));
  },
  async getInvoice(ws, id) {
    await simulate();
    requireMember(ws);
    return findInvoice(ws, id);
  },
  async addAdjustment(ws, id, amount, reason) {
    await simulate();
    const { user } = requireMember(ws, 'billing.run');
    const inv = findInvoice(ws, id);
    if (!reason.trim()) validation('Cần ghi lý do điều chỉnh.', { reason: 'Bắt buộc nhập lý do (audit)' });
    if (inv.total + inv.adjustments.reduce((s, a) => s + a.amount, 0) + amount < inv.paidConfirmed) {
      validation('Điều chỉnh làm tổng hóa đơn nhỏ hơn số đã thu.', { amount: 'Số tiền điều chỉnh không hợp lệ' });
    }
    inv.adjustments.push({ id: nextId('adj'), amount, reason, by: user.fullName, at: new Date().toISOString() });
    refreshStatus(inv);
    audit(user.email, `Điều chỉnh hóa đơn ${amount > 0 ? '+' : ''}${formatVnd(amount)}`, inv.code, 'BILLING');
    return inv;
  },

  async previewBilling(ws, period) {
    await simulate();
    requireMember(ws, 'billing.run');
    return preview(ws, period);
  },
  async runBilling(ws, period, contractIds) {
    await simulate();
    const { user } = requireMember(ws, 'billing.run');
    const items = preview(ws, period).filter((it) => contractIds.includes(it.contractId));
    const rate = rateForDate(db.rates.filter((r) => r.workspaceId === ws), periodStart(period));
    const created: Array<{ contractCode: string; invoiceCode: string; total: number }> = [];
    const skipped: Array<{ contractCode: string; reason: string }> = [];
    const due = db.settings[ws]?.invoiceDueDay ?? 5;
    items.forEach((it) => {
      if (it.status !== 'READY' || !rate) {
        skipped.push({ contractCode: it.contractCode, reason: it.message ?? 'Không đủ điều kiện' });
        return;
      }
      const c = db.contracts.find((x) => x.id === it.contractId)!;
      const issueDate = TODAY > periodStart(period) ? TODAY : periodStart(period);
      const dueDate = `${period}-${String(due).padStart(2, '0')}` < issueDate ? periodEnd(period) : `${period}-${String(due).padStart(2, '0')}`;
      const inv: Invoice = {
        id: nextId('inv'),
        workspaceId: ws,
        code: `HD${period.replace('-', '')}-${String(db.invoices.filter((i) => i.period === period).length + 1).padStart(3, '0')}`,
        contractId: c.id,
        contractCode: c.code,
        roomId: c.roomId,
        roomCode: c.roomCode,
        buildingName: c.buildingName,
        tenantId: c.primaryTenantId,
        tenantName: c.primaryTenantName,
        period,
        issueDate,
        dueDate,
        status: 'ISSUED',
        lines: it.lines,
        rateVersionId: rate.id,
        rateEffectiveFrom: rate.effectiveFrom,
        adjustments: [],
        total: it.total,
        paidConfirmed: 0,
      };
      refreshStatus(inv);
      db.invoices.push(inv);
      created.push({ contractCode: c.code, invoiceCode: inv.code, total: inv.total });
    });
    audit(user.email, `Lập hóa đơn tháng (${created.length} hóa đơn)`, `Kỳ ${period}`, 'BILLING');
    return { period, created, skipped };
  },

  async listPayments(ws, status, invoiceId) {
    const { empty } = await simulate();
    requireMember(ws);
    if (empty) return [];
    return db.payments
      .filter((pm) => pm.workspaceId === ws && (!status || pm.status === status) && (!invoiceId || pm.invoiceId === invoiceId))
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  },
  async recordPayment(ws, input) {
    await simulate();
    const { user } = requireMember(ws, 'payments.confirm');
    const inv = findInvoice(ws, input.invoiceId);
    const balance = invoiceBalance(inv);
    if (input.amount <= 0) validation('Số tiền không hợp lệ.', { amount: 'Số tiền phải lớn hơn 0' });
    if (input.amount > balance) validation('Số tiền vượt quá số còn nợ.', { amount: `Tối đa ${formatVnd(balance)}` });
    const now = new Date().toISOString();
    const payment: Payment = {
      ...input,
      id: nextId('pay'),
      workspaceId: ws,
      invoiceCode: inv.code,
      roomCode: inv.roomCode,
      tenantName: inv.tenantName,
      status: 'CONFIRMED',
      submittedBy: 'STAFF',
      submittedAt: now,
      confirmedAt: now,
      confirmedBy: user.fullName,
    };
    db.payments.push(payment);
    inv.paidConfirmed += input.amount;
    refreshStatus(inv);
    audit(user.email, `Ghi nhận thu ${formatVnd(input.amount)}`, inv.code, 'BILLING');
    return payment;
  },
  async confirmPayment(ws, id) {
    await simulate();
    const { user } = requireMember(ws, 'payments.confirm');
    const pm = db.payments.find((x) => x.workspaceId === ws && x.id === id) ?? notFound('Không tìm thấy thanh toán.');
    if (pm.status !== 'PENDING') conflict('Khoản thanh toán này đã được xử lý.');
    const inv = findInvoice(ws, pm.invoiceId);
    if (pm.amount > invoiceBalance(inv)) conflict('Số tiền vượt quá số còn nợ hiện tại của hóa đơn.');
    pm.status = 'CONFIRMED';
    pm.confirmedAt = new Date().toISOString();
    pm.confirmedBy = user.fullName;
    inv.paidConfirmed += pm.amount;
    refreshStatus(inv);
    audit(user.email, `Xác nhận thanh toán ${formatVnd(pm.amount)}`, inv.code, 'BILLING');
    return pm;
  },
  async rejectPayment(ws, id, reason) {
    await simulate();
    const { user } = requireMember(ws, 'payments.confirm');
    const pm = db.payments.find((x) => x.workspaceId === ws && x.id === id) ?? notFound('Không tìm thấy thanh toán.');
    if (pm.status !== 'PENDING') conflict('Khoản thanh toán này đã được xử lý.');
    pm.status = 'REJECTED';
    pm.note = `${pm.note ? `${pm.note} — ` : ''}Từ chối: ${reason}`;
    audit(user.email, 'Từ chối minh chứng thanh toán', pm.invoiceCode, 'BILLING');
    return pm;
  },

  async listDeposits(ws, contractId) {
    const { empty } = await simulate();
    requireMember(ws);
    if (empty) return [];
    return db.deposits
      .filter((d) => d.workspaceId === ws && (!contractId || d.contractId === contractId))
      .sort((a, b) => b.date.localeCompare(a.date));
  },
  async createDeposit(ws, input) {
    await simulate();
    const { user } = requireMember(ws, 'payments.confirm');
    const c = db.contracts.find((x) => x.workspaceId === ws && x.id === input.contractId) ?? notFound('Không tìm thấy hợp đồng.');
    if (input.amount <= 0) validation('Số tiền không hợp lệ.', { amount: 'Số tiền phải lớn hơn 0' });
    const held = db.deposits
      .filter((d) => d.contractId === c.id)
      .reduce((s, d) => s + (d.type === 'COLLECT' ? d.amount : -d.amount), 0);
    if (input.type !== 'COLLECT' && input.amount > held) {
      validation('Số tiền vượt quá tiền cọc đang giữ.', { amount: `Đang giữ ${formatVnd(held)}` });
    }
    const tx = { ...input, id: nextId('dep'), workspaceId: ws, contractCode: c.code, roomCode: c.roomCode, tenantName: c.primaryTenantName };
    db.deposits.push(tx);
    audit(user.email, `Giao dịch cọc (${input.type}) ${formatVnd(input.amount)}`, c.code, 'BILLING');
    return tx;
  },
};
