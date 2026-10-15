import { BILLING_TIME_ZONE } from './format';

/** Ngày hôm nay theo múi giờ Asia/Ho_Chi_Minh, dạng yyyy-MM-dd. */
export function todayVN(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BILLING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Kỳ tính tiền hiện tại (yyyy-MM) theo giờ Việt Nam. */
export function currentPeriod(now: Date = new Date()): string {
  return todayVN(now).slice(0, 7);
}

export function parsePeriod(period: string): { year: number; month: number } {
  const [y, m] = period.split('-').map(Number);
  return { year: y!, month: m! };
}

export function addMonths(period: string, n: number): string {
  const { year, month } = parsePeriod(period);
  const d = new Date(Date.UTC(year, month - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function daysInPeriod(period: string): number {
  const { year, month } = parsePeriod(period);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function periodStart(period: string): string {
  return `${period}-01`;
}

export function periodEnd(period: string): string {
  return `${period}-${String(daysInPeriod(period)).padStart(2, '0')}`;
}

/** "2026-10" -> "T10/2026" */
export function periodLabel(period: string): string {
  const { year, month } = parsePeriod(period);
  return `T${month}/${year}`;
}

function toUtc(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!);
}

export function addDays(date: string, n: number): string {
  return new Date(toUtc(date) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Số ngày giữa 2 ngày, TÍNH CẢ HAI ĐẦU. 2026-10-01 → 2026-10-01 = 1. */
export function inclusiveDays(start: string, end: string): number {
  return Math.round((toUtc(end) - toUtc(start)) / 86_400_000) + 1;
}

export function diffDays(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

export function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

export function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}
