import { describe, expect, it } from 'vitest';
import { filterRooms } from '@/mocks/handlers/rooms.mock';
import { mockRooms } from '@/mocks/data/rooms';
import { registerSchema, resetPasswordSchema } from '@/features/auth/schemas';
import { contractSchema, tenantSchema } from '@/features/leasing/schemas';
import { viewingSchema } from '@/features/viewings/schema';
import { canCancelViewing } from '@/features/viewings/types';
import { hasPermission } from '@/features/workspaces/types';

describe('filterRooms (mock marketplace, đúng GET /listings)', () => {
  it('lọc theo quận + khoảng giá (gồm hai đầu); quận/thành phố là “chứa”, không phân biệt hoa thường', () => {
    const r = filterRooms(mockRooms, { district: 'Cầu Giấy', minPrice: 3_000_000, maxPrice: 5_000_000 });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => x.district === 'Cầu Giấy' && x.price >= 3_000_000 && x.price <= 5_000_000)).toBe(true);
    expect(filterRooms(mockRooms, { district: 'cầu giấy' }).length).toBe(filterRooms(mockRooms, { district: 'Cầu Giấy' }).length);
    expect(filterRooms(mockRooms, { city: 'hà nội' }).length).toBe(mockRooms.length);
    expect(filterRooms(mockRooms, { ward: 'khong-co-phuong-nay' })).toEqual([]);
  });
  it('lọc tiện ích theo id yêu cầu đủ tất cả', () => {
    const room = (id: string, amenityIds: string[]) => ({ ...mockRooms[0]!, id, amenities: amenityIds.map((a) => ({ id: a, name: a })) });
    const rooms = [room('a', ['x', 'y']), room('b', ['x']), room('c', [])];
    expect(filterRooms(rooms, { amenityIds: ['x', 'y'] }).map((r) => r.id)).toEqual(['a']);
    expect(filterRooms(rooms, { amenityIds: ['x'] }).map((r) => r.id).sort()).toEqual(['a', 'b']);
  });
  it('mới đăng trước (publishedAt giảm dần) và không có tìm từ khóa / loại phòng / sắp xếp khác', () => {
    const dates = filterRooms(mockRooms, {}).map((r) => r.postedAt);
    expect(dates).toEqual([...dates].sort().reverse());
    const legacy = { q: 'bach dang', roomType: 'STUDIO', sort: 'price_asc' } as never;
    expect(filterRooms(mockRooms, legacy).length).toBe(mockRooms.length); // tham số lạ bị bỏ qua như backend
  });
});

describe('schemas', () => {
  it('đăng ký: mật khẩu xác nhận phải khớp, cần đồng ý điều khoản', () => {
    const base = { fullName: 'Lê Minh', email: 'a@b.vn', password: 'mat-khau-dai-12', confirmPassword: 'mat-khau-dai-12', acceptTerms: true };
    expect(registerSchema.safeParse(base).success).toBe(true);
    // Backend chỉ nhận email/password/displayName: schema không còn trường phone.
    expect('phone' in registerSchema.parse(base)).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: 'ngan12', confirmPassword: 'ngan12' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, confirmPassword: 'x' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, acceptTerms: false }).success).toBe(false);
  });
  it('đặt lại mật khẩu: đủ mạnh và nhập lại phải khớp', () => {
    expect(resetPasswordSchema.safeParse({ password: 'mat-khau-moi-12', confirmPassword: 'mat-khau-moi-12' }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ password: 'mat-khau-moi-12', confirmPassword: 'khac-khac-1234' }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ password: 'ngan1', confirmPassword: 'ngan1' }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ password: 'x'.repeat(129), confirmPassword: 'x'.repeat(129) }).success).toBe(false);
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
    const base = { time: '14:00' as const };
    expect(s.safeParse({ ...base, date: '2026-10-15' }).success).toBe(true);
    expect(s.safeParse({ ...base, date: '2026-10-13' }).success).toBe(false);
  });
});

describe('business helpers', () => {
  it('chỉ hủy lịch xem khi PENDING/CONFIRMED (BR-09)', () => {
    expect(canCancelViewing('PENDING')).toBe(true);
    expect(canCancelViewing('REJECTED')).toBe(false);
    expect(canCancelViewing('CANCELLED')).toBe(false);
  });
  it('permission V1: chỉ OWNER có quyền, MANAGER/STAFF không có quyền nào', () => {
    expect(hasPermission('OWNER', 'billing.run')).toBe(true);
    expect(hasPermission('MANAGER', 'billing.run')).toBe(false);
    expect(hasPermission('STAFF', 'payments.confirm')).toBe(false);
  });
});

describe('mock V1 policy', () => {
  it('capabilitiesApi (mock) loại membership MANAGER/STAFF của dữ liệu cũ', async () => {
    const { applyV1Policy } = await import('@/features/capabilities/model');
    const out = applyV1Policy({
      workspaces: [
        { id: 'a', name: 'A', status: 'ACTIVE', role: 'OWNER' },
        { id: 'b', name: 'B', status: 'ACTIVE', role: 'MANAGER' },
      ],
      tenantLinks: [],
      isPlatformAdmin: false,
      landlordApplication: null,
    });
    expect(out.workspaces.map((w) => w.id)).toEqual(['a']);
  });
});
