import { describe, expect, it } from 'vitest';
import { filterRooms } from '@/mocks/handlers/rooms.mock';
import { mockRooms } from '@/mocks/data/rooms';
import { registerSchema, resetPasswordSchema } from '@/features/auth/schemas';
import { contractSchema, tenantSchema } from '@/features/leasing/schemas';
import { viewingSchema } from '@/features/viewings/schema';
import { canCancelViewing } from '@/features/viewings/types';
import { hasPermission, type WorkspaceMembership } from '@/features/workspaces/types';
import { roleOf } from '@/features/auth/role';
import type { CurrentUser } from '@/features/auth/types';
import type { Contract } from '@/features/leasing/types';
import type { Invoice } from '@/features/billing/types';

describe('filterRooms (mock marketplace)', () => {
  it('lọc theo quận + khoảng giá, không phân biệt dấu khi tìm từ khóa', () => {
    const r = filterRooms(mockRooms, { district: 'Cầu Giấy', priceMin: 3_000_000, priceMax: 5_000_000 });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => x.district === 'Cầu Giấy' && x.price >= 3_000_000 && x.price <= 5_000_000)).toBe(true);
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
  it('đặt lại mật khẩu: đủ mạnh và nhập lại phải khớp', () => {
    expect(resetPasswordSchema.safeParse({ password: 'moi12345', confirmPassword: 'moi12345' }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ password: 'moi12345', confirmPassword: 'khac1234' }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ password: 'ngan1', confirmPassword: 'ngan1' }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ password: 'chicochu', confirmPassword: 'chicochu' }).success).toBe(false);
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

describe('roleOf (tách vai trò giao diện)', () => {
  const base = { id: 'u', fullName: 'A B', email: 'a@b.vn', phone: '0900000000', createdAt: '2026-01-01' };
  const seeker: CurrentUser = { ...base, globalRole: 'USER', tenantLinked: false };
  const linked: CurrentUser = { ...base, globalRole: 'USER', tenantLinked: true };
  const contract = (status: Contract['status']) => ({ status }) as Contract;
  const invoice = (status: Invoice['status']) => ({ status }) as Invoice;
  const ws = [{ workspaceId: 'ws' } as WorkspaceMembership];

  it('khách / người tìm phòng / chủ trọ / admin', () => {
    expect(roleOf(null, undefined)).toBe('GUEST');
    expect(roleOf(seeker, [])).toBe('SEEKER');
    expect(roleOf(seeker, ws)).toBe('LANDLORD');
    expect(roleOf({ ...seeker, globalRole: 'ADMIN' }, ws)).toBe('ADMIN');
  });
  it('người thuê khi còn hợp đồng hiệu lực', () => {
    expect(roleOf(linked, [], { contracts: [contract('ACTIVE')], invoices: [] })).toBe('TENANT');
  });
  it('hợp đồng chấm dứt nhưng còn nợ hóa đơn → vẫn là người thuê', () => {
    expect(roleOf(linked, [], { contracts: [contract('TERMINATED')], invoices: [invoice('PAID'), invoice('OVERDUE')] })).toBe('TENANT');
  });
  it('hợp đồng chấm dứt / kết thúc và đã trả hết → trở lại người tìm phòng', () => {
    expect(roleOf(linked, [], { contracts: [contract('TERMINATED')], invoices: [invoice('PAID'), invoice('VOID')] })).toBe('SEEKER');
    expect(roleOf(linked, [], { contracts: [contract('ENDED')], invoices: [] })).toBe('SEEKER');
  });
  it('chưa tải được dữ liệu thuê → giữ vai trò người thuê', () => {
    expect(roleOf(linked, [])).toBe('TENANT');
  });
});
