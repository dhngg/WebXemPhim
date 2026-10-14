import { describe, expect, it } from 'vitest';
import {
  buildInvoiceLines,
  contractDaysInPeriod,
  deriveInvoiceStatus,
  findOverlappingContracts,
  invoiceBalance,
  occupantsAtPeriodEnd,
  prorateRent,
  rangesOverlap,
  rateForDate,
  sumLines,
} from './calc';
import type { RateVersion } from './types';

const rate = (effectiveFrom: string, electricityPerKwh = 3500): RateVersion => ({
  id: effectiveFrom,
  workspaceId: 'ws',
  effectiveFrom,
  electricityPerKwh,
  waterPerPerson: 100_000,
  waterPerM3: 18_000,
  internet: 100_000,
  sanitation: 30_000,
  createdAt: '',
  createdBy: '',
});

describe('rangesOverlap / findOverlappingContracts (BR-01)', () => {
  it('ngày kết thúc tính bao gồm: chạm đúng 1 ngày vẫn là trùng', () => {
    expect(rangesOverlap('2026-01-01', '2026-06-30', '2026-06-30', '2026-12-31')).toBe(true);
    expect(rangesOverlap('2026-01-01', '2026-06-30', '2026-07-01', '2026-12-31')).toBe(false);
  });

  it('chỉ cảnh báo với hợp đồng ACTIVE cùng phòng, bỏ qua chính nó', () => {
    const contracts = [
      { id: 'a', code: 'A', roomId: 'r1', startDate: '2026-01-01', endDate: '2026-12-31', status: 'ACTIVE' as const },
      { id: 'b', code: 'B', roomId: 'r1', startDate: '2026-01-01', endDate: '2026-12-31', status: 'ENDED' as const },
      { id: 'c', code: 'C', roomId: 'r2', startDate: '2026-01-01', endDate: '2026-12-31', status: 'ACTIVE' as const },
    ];
    const hits = findOverlappingContracts(contracts, { roomId: 'r1', startDate: '2026-06-01', endDate: '2027-05-31' });
    expect(hits.map((h) => h.code)).toEqual(['A']);
    expect(findOverlappingContracts(contracts, { id: 'a', roomId: 'r1', startDate: '2026-06-01', endDate: '2027-05-31' })).toEqual([]);
  });
});

describe('proration (BR-02)', () => {
  it('đếm số ngày hợp đồng trong kỳ, tính cả hai đầu', () => {
    expect(contractDaysInPeriod('2026-10-15', '2027-10-14', '2026-10')).toBe(17);
    expect(contractDaysInPeriod('2026-01-01', '2026-10-10', '2026-10')).toBe(10);
    expect(contractDaysInPeriod('2026-01-01', '2026-12-31', '2026-02')).toBe(28);
    expect(contractDaysInPeriod('2026-11-01', '2026-12-31', '2026-10')).toBe(0);
  });

  it('prorate tiền phòng theo ngày, đủ tháng thì giữ nguyên', () => {
    expect(prorateRent(3_100_000, 31, 31)).toBe(3_100_000);
    expect(prorateRent(3_100_000, 10, 31)).toBe(1_000_000);
    expect(prorateRent(3_000_000, 17, 31)).toBe(1_645_161);
  });
});

describe('rateForDate (BR-04)', () => {
  it('chọn phiên bản có effectiveFrom gần nhất ≤ ngày', () => {
    const rates = [rate('2024-01-01', 3300), rate('2026-03-01', 3500), rate('2026-12-01', 3800)];
    expect(rateForDate(rates, '2026-10-01')?.electricityPerKwh).toBe(3500);
    expect(rateForDate(rates, '2026-12-01')?.electricityPerKwh).toBe(3800);
    expect(rateForDate(rates, '2023-12-31')).toBeUndefined();
  });
});

describe('occupantsAtPeriodEnd (BR-03)', () => {
  it('snapshot số người ở tại ngày cuối kỳ', () => {
    const c = { startDate: '2026-01-01', endDate: '2026-12-31', occupantIds: ['a', 'b'] };
    expect(occupantsAtPeriodEnd(c, '2026-10')).toBe(2);
    expect(occupantsAtPeriodEnd({ ...c, endDate: '2026-10-20' }, '2026-10')).toBe(0);
  });
});

describe('buildInvoiceLines', () => {
  it('tạo dòng phí phòng, điện, nước theo người, internet, rác, gửi xe', () => {
    const lines = buildInvoiceLines({
      contract: { startDate: '2026-01-01', endDate: '2026-12-31', occupantIds: ['a', 'b'], monthlyRent: 3_500_000, waterMode: 'PER_PERSON' },
      rate: rate('2026-01-01'),
      period: '2026-10',
      reading: { electricOld: 100, electricNew: 180, waterOld: 10, waterNew: 15 },
      vehicleFees: [{ label: '59-X1', fee: 100_000 }],
    });
    expect(lines.map((l) => [l.key, l.amount])).toEqual([
      ['rent', 3_500_000],
      ['electricity', 280_000],
      ['water', 200_000],
      ['internet', 100_000],
      ['sanitation', 30_000],
      ['vehicle', 100_000],
    ]);
    expect(sumLines(lines)).toBe(4_210_000);
  });

  it('chế độ đồng hồ nước tính theo m³', () => {
    const lines = buildInvoiceLines({
      contract: { startDate: '2026-01-01', endDate: '2026-12-31', occupantIds: ['a'], monthlyRent: 3_000_000, waterMode: 'METER' },
      rate: rate('2026-01-01'),
      period: '2026-10',
      reading: { electricOld: 0, electricNew: 0, waterOld: 10, waterNew: 15 },
    });
    expect(lines.find((l) => l.key === 'water')?.amount).toBe(90_000);
  });
});

describe('invoice balance & status (BR-05)', () => {
  const inv = { total: 4_000_000, adjustments: [], paidConfirmed: 0, dueDate: '2026-10-05', status: 'ISSUED' as const };

  it('chỉ trừ khoản đã xác nhận; điều chỉnh cộng/trừ vào tổng', () => {
    expect(invoiceBalance({ ...inv, paidConfirmed: 1_500_000 })).toBe(2_500_000);
    expect(invoiceBalance({ ...inv, adjustments: [{ id: 'x', amount: -200_000, reason: '', by: '', at: '' }] })).toBe(3_800_000);
  });

  it('suy ra trạng thái', () => {
    expect(deriveInvoiceStatus(inv, '2026-10-01')).toBe('ISSUED');
    expect(deriveInvoiceStatus({ ...inv, paidConfirmed: 1 }, '2026-10-01')).toBe('PARTIALLY_PAID');
    expect(deriveInvoiceStatus(inv, '2026-10-06')).toBe('OVERDUE');
    expect(deriveInvoiceStatus({ ...inv, paidConfirmed: 4_000_000 }, '2026-10-06')).toBe('PAID');
  });
});
