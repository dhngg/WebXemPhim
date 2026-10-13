import { describe, expect, it } from 'vitest';
import { addDays, addMonths, daysInPeriod, inclusiveDays, periodLabel, todayVN } from './dates';
import { formatPercent, formatVnd, formatVndShort } from './format';
import { pageItems } from '@/components/ui/Pagination';
import { parseVnd } from '@/components/ui/Inputs';

describe('dates', () => {
  it('cộng tháng qua năm', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });
  it('số ngày của kỳ, năm nhuận', () => {
    expect(daysInPeriod('2028-02')).toBe(29);
    expect(daysInPeriod('2026-02')).toBe(28);
  });
  it('khoảng ngày tính bao gồm', () => {
    expect(inclusiveDays('2026-10-01', '2026-10-01')).toBe(1);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('ngày hôm nay theo Asia/Ho_Chi_Minh (UTC+7)', () => {
    expect(todayVN(new Date('2026-10-13T18:30:00Z'))).toBe('2026-10-14');
  });
  it('nhãn kỳ', () => expect(periodLabel('2026-10')).toBe('T10/2026'));
});

describe('format', () => {
  it('định dạng VND theo vi-VN', () => {
    expect(formatVnd(3_800_000).replace(/\s/g, ' ')).toMatch(/^3\.800\.000 ₫$/);
    expect(formatVndShort(3_800_000)).toBe('3,8tr');
    expect(formatPercent(0.893)).toBe('89,3%');
  });
  it('parseVnd bỏ ký tự không phải số', () => {
    expect(parseVnd('3.800.000 ₫')).toBe(3_800_000);
    expect(parseVnd('')).toBeUndefined();
  });
});

describe('pageItems', () => {
  it('rút gọn bằng dấu …', () => {
    expect(pageItems(1, 12)).toEqual([1, 2, 3, 4, 'gap', 12]);
    expect(pageItems(6, 12)).toEqual([1, 'gap', 5, 6, 7, 'gap', 12]);
    expect(pageItems(2, 3)).toEqual([1, 2, 3]);
  });
});
