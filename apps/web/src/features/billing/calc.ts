/**
 * Logic tính tiền PHÍA FRONTEND — chỉ dùng cho xem trước & mock.
 * Backend là nơi tính chính thức. Quy tắc làm tròn / proration còn chờ chốt
 * (xem docs/frontend/API_INTEGRATION_CONTRACT.md — Open questions).
 */
import { daysInPeriod, inclusiveDays, maxDate, minDate, periodEnd, periodStart } from '@/lib/dates';
import type { Contract, ContractStatus } from '@/features/leasing/types';
import type { Invoice, InvoiceLine, InvoiceStatus, MeterReading, RateVersion } from './types';

/** Hai khoảng ngày (bao gồm 2 đầu) có giao nhau không. */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/** Tìm hợp đồng ACTIVE cùng phòng bị trùng thời gian (BR-01 — UI chỉ cảnh báo). */
export function findOverlappingContracts(
  contracts: Pick<Contract, 'id' | 'roomId' | 'startDate' | 'endDate' | 'status' | 'code'>[],
  candidate: { id?: string; roomId: string; startDate: string; endDate: string },
): Array<Pick<Contract, 'id' | 'code' | 'startDate' | 'endDate'>> {
  const blocking: ContractStatus[] = ['ACTIVE'];
  return contracts.filter(
    (c) =>
      c.id !== candidate.id &&
      c.roomId === candidate.roomId &&
      blocking.includes(c.status) &&
      rangesOverlap(c.startDate, c.endDate, candidate.startDate, candidate.endDate),
  );
}

/** Số ngày hợp đồng nằm trong kỳ (tính bao gồm). 0 nếu không giao nhau. */
export function contractDaysInPeriod(startDate: string, endDate: string, period: string): number {
  const from = maxDate(startDate, periodStart(period));
  const to = minDate(endDate, periodEnd(period));
  return from > to ? 0 : inclusiveDays(from, to);
}

/** Tiền phòng prorate theo ngày (làm tròn tới đồng — quy tắc làm tròn CHƯA CHỐT). */
export function prorateRent(monthlyRent: number, days: number, totalDays: number): number {
  if (days >= totalDays) return monthlyRent;
  return Math.round((monthlyRent * days) / totalDays);
}

/** Phiên bản đơn giá có hiệu lực tại ngày `date` (effectiveFrom lớn nhất <= date). */
export function rateForDate(rates: RateVersion[], date: string): RateVersion | undefined {
  return [...rates]
    .filter((r) => r.effectiveFrom <= date)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}

/**
 * Snapshot số người ở cho nước theo người (BR-03): lấy tại NGÀY CUỐI KỲ.
 * Nếu hợp đồng kết thúc trước cuối kỳ thì không còn người ở vào ngày cuối kỳ → 0
 * (trường hợp này cần backend xác nhận — ghi trong open questions).
 */
export function occupantsAtPeriodEnd(contract: Pick<Contract, 'startDate' | 'endDate' | 'occupantIds'>, period: string): number {
  const end = periodEnd(period);
  if (contract.startDate > end || contract.endDate < end) return 0;
  return contract.occupantIds.length;
}

export interface BuildLinesInput {
  contract: Pick<Contract, 'startDate' | 'endDate' | 'occupantIds' | 'monthlyRent' | 'waterMode'>;
  rate: RateVersion;
  period: string;
  reading?: Pick<MeterReading, 'electricOld' | 'electricNew' | 'waterOld' | 'waterNew'>;
  vehicleFees?: Array<{ label: string; fee: number }>;
}

/** Tạo các dòng hóa đơn (snapshot đơn giá) cho một hợp đồng trong một kỳ. */
export function buildInvoiceLines({ contract, rate, period, reading, vehicleFees = [] }: BuildLinesInput): InvoiceLine[] {
  const totalDays = daysInPeriod(period);
  const days = contractDaysInPeriod(contract.startDate, contract.endDate, period);
  const lines: InvoiceLine[] = [];

  lines.push({
    key: 'rent',
    label: 'Tiền phòng',
    quantity: days,
    unit: 'ngày',
    unitPrice: contract.monthlyRent,
    amount: prorateRent(contract.monthlyRent, days, totalDays),
    note: days < totalDays ? `Prorate ${days}/${totalDays} ngày` : undefined,
  });

  if (reading) {
    const kwh = Math.max(0, reading.electricNew - reading.electricOld);
    lines.push({
      key: 'electricity',
      label: 'Điện',
      quantity: kwh,
      unit: 'kWh',
      unitPrice: rate.electricityPerKwh,
      amount: kwh * rate.electricityPerKwh,
      note: `${reading.electricOld} → ${reading.electricNew}`,
    });
  }

  if (contract.waterMode === 'PER_PERSON') {
    const people = occupantsAtPeriodEnd(contract, period);
    lines.push({
      key: 'water',
      label: 'Nước (theo người)',
      quantity: people,
      unit: 'người',
      unitPrice: rate.waterPerPerson,
      amount: people * rate.waterPerPerson,
      note: 'Snapshot số người ở ngày cuối kỳ',
    });
  } else if (reading) {
    const m3 = Math.max(0, reading.waterNew - reading.waterOld);
    lines.push({
      key: 'water',
      label: 'Nước (đồng hồ)',
      quantity: m3,
      unit: 'm³',
      unitPrice: rate.waterPerM3,
      amount: m3 * rate.waterPerM3,
      note: `${reading.waterOld} → ${reading.waterNew}`,
    });
  }

  if (rate.internet > 0) {
    lines.push({ key: 'internet', label: 'Internet', quantity: 1, unit: 'tháng', unitPrice: rate.internet, amount: rate.internet });
  }
  if (rate.sanitation > 0) {
    lines.push({
      key: 'sanitation',
      label: 'Rác & vệ sinh chung',
      quantity: 1,
      unit: 'tháng',
      unitPrice: rate.sanitation,
      amount: rate.sanitation,
    });
  }
  vehicleFees.forEach((v) =>
    lines.push({ key: 'vehicle', label: `Gửi xe – ${v.label}`, quantity: 1, unit: 'tháng', unitPrice: v.fee, amount: v.fee }),
  );
  return lines;
}

export function sumLines(lines: InvoiceLine[]): number {
  return lines.reduce((s, l) => s + l.amount, 0);
}

/** Tổng phải thu sau điều chỉnh. */
export function invoiceGrandTotal(invoice: Pick<Invoice, 'total' | 'adjustments'>): number {
  return invoice.total + invoice.adjustments.reduce((s, a) => s + a.amount, 0);
}

/** Còn nợ = tổng sau điều chỉnh - đã thu ĐÃ XÁC NHẬN (BR-05). */
export function invoiceBalance(invoice: Pick<Invoice, 'total' | 'adjustments' | 'paidConfirmed'>): number {
  return Math.max(0, invoiceGrandTotal(invoice) - invoice.paidConfirmed);
}

/** Suy ra trạng thái hóa đơn từ số đã thu xác nhận + hạn nộp. */
export function deriveInvoiceStatus(
  invoice: Pick<Invoice, 'total' | 'adjustments' | 'paidConfirmed' | 'dueDate' | 'status'>,
  today: string,
): InvoiceStatus {
  if (invoice.status === 'VOID' || invoice.status === 'DRAFT') return invoice.status;
  const balance = invoiceBalance(invoice);
  if (balance === 0) return 'PAID';
  if (today > invoice.dueDate) return 'OVERDUE';
  if (invoice.paidConfirmed > 0) return 'PARTIALLY_PAID';
  return 'ISSUED';
}
