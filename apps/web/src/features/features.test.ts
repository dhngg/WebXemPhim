import { describe, expect, it } from 'vitest';
import { filterRooms } from '@/mocks/handlers/rooms.mock';
import { mockRooms } from '@/mocks/data/rooms';
import { registerSchema } from '@/features/auth/schemas';
import { contractSchema, tenantSchema } from '@/features/leasing/schemas';
import { viewingSchema } from '@/features/viewings/schema';
import { canCancelViewing } from '@/features/viewings/types';
import { hasPermission } from '@/features/workspaces/types';

describe('filterRooms (mock marketplace)', () => {
  it('lọc theo quận + khoảng giá, không phân biệt dấu khi tìm từ khóa', () => {
    const r = filterRooms(mockRooms, { district: 'Bình Thạnh', priceMin: 3_000_000, priceMax: 5_000_000 });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => x.district === 'Bình Thạnh' && x.price >= 3_000_000 && x.price <= 5_000_000)).toBe(true);
    expect(filterRooms(mockRooms, { q: 'bach dang' }).map((x) => x.id)).toContain('r-3');
  });
  it('lọc tiện ích yêu cầu đủ tất cả', () => {
    const r = filterRooms(mockRooms, { amenities: ['BALCONY', 'AIR_CON'] });
    expect(r.every((x) => x.amenities.includes('BALCONY') && x.amenities.includes('AIR_CON'))).toBe(true);
  });
  it('sắp xếp giá tăng dần', () => {
    const prices = filterRooms(mockRooms, { sort: 'price_asc' }).map((r) => r.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });
});

describe('schemas', () => {
  it('đăng ký: mật khẩu xác nhận phải khớp, cần đồng ý điều khoản', () => {
    const base = { fullName: 'Lê Minh', email: 'a@b.vn', phone: '0988 111 222', password: 'abc12345', confirmPassword: 'abc12345', acceptTerms: true };
    expect(registerSchema.safeParse(base).success).toBe(true);
    expect(registerSchema.parse(base).phone).toBe('0988111222');
    expect(registerSchema.safeParse({ ...base, confirmPassword: 'x' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, acceptTerms: false }).success).toBe(false);
  });
  it('hợp đồng: bắt buộc start/end, end ≥ start', () => {
    const base = { roomId: 'r', primaryTenantId: 't', occupantIds: [], startDate: '2026-10-01', endDate: '2027-09-30', monthlyRent: 3_000_000, deposit: 3_000_000, waterMode: 'PER_PERSON' as const };
    expect(contractSchema.safeParse(base).success).toBe(true);
    expect(contractSchema.safeParse({ ...base, endDate: '' }).success).toBe(false);
    expect(contractSchema.safeParse({ ...base, endDate: '2026-09-30' }).success).toBe(false);
    expect(contractSchema.safeParse({ ...base, endDate: '2026-10-01' }).success).toBe(true);
  });
  it('người thuê: CCCD 9 hoặc 12 số, email tùy chọn', () => {
    expect(tenantSchema.safeParse({ fullName: 'Nam', phone: '0912345889', idNumber: '079212345678' }).success).toBe(true);
    expect(tenantSchema.safeParse({ fullName: 'Nam', phone: '0912345889', idNumber: '123' }).success).toBe(false);
    expect(tenantSchema.safeParse({ fullName: 'Nam', phone: '0912345889', email: 'x' }).success).toBe(false);
  });
  it('lịch xem phải sau hiện tại ít nhất 1 giờ', () => {
    const s = viewingSchema(new Date('2026-10-14T03:00:00Z'));
    const base = { contactName: 'Minh', contactPhone: '0988111222', time: '14:00' as const };
    expect(s.safeParse({ ...base, date: '2026-10-15' }).success).toBe(true);
    expect(s.safeParse({ ...base, date: '2026-10-13' }).success).toBe(false);
  });
});

describe('business helpers', () => {
  it('chỉ hủy lịch xem khi PENDING/CONFIRMED (BR-09)', () => {
    expect(canCancelViewing('PENDING')).toBe(true);
    expect(canCancelViewing('COMPLETED')).toBe(false);
  });
  it('permission matrix đề xuất', () => {
    expect(hasPermission('OWNER', 'members.manage')).toBe(true);
    expect(hasPermission('MANAGER', 'billing.run')).toBe(true);
    expect(hasPermission('STAFF', 'payments.confirm')).toBe(false);
  });
});
