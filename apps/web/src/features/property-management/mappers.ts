import type { AmenityResponse, BuildingResponse, RoomImageResponse, RoomResponse } from '@rental/shared';
import { formatVnd } from '@/lib/format';
import type { AmenityRef, BuildingInput, BuildingPatch, ManagedBuilding, ManagedRoom, RoomImageItem } from './types';

// ------------------------------------------------------------------ số thập phân chính xác
const DECIMAL = /^\d+(\.\d+)?$/;

/** Chuỗi thập phân backend → số (để sắp xếp/so sánh). Từ chối chuỗi không hợp lệ thay vì đoán. */
export function parseDecimal(value: string, field = 'value'): number {
  if (!DECIMAL.test(value)) throw new TypeError(`Invalid decimal for ${field}`);
  const n = Number(value);
  if (!Number.isFinite(n)) throw new TypeError(`Invalid decimal for ${field}`);
  return n;
}

/** "3500000.00" → "3.500.000 ₫"; có phần lẻ thật ("3500000.50") thì giữ 2 chữ số, không làm tròn. */
export function formatMoney(value: string): string {
  if (!DECIMAL.test(value)) return '—';
  const n = Number(value);
  if (/\.\d*[1-9]/.test(value)) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  }
  return formatVnd(n);
}

/** "25.50" → "25,5"; giữ đúng phần lẻ backend trả. */
export function formatArea(value: string): string {
  if (!DECIMAL.test(value)) return '—';
  const [int = '0', frac = ''] = value.split('.');
  const trimmed = frac.replace(/0+$/, '');
  return trimmed ? `${int},${trimmed}` : int;
}

/** Hai chuỗi thập phân bằng nhau về giá trị ("3500000" == "3500000.00")? */
export function sameDecimal(a: string, b: string): boolean {
  return DECIMAL.test(a) && DECIMAL.test(b) && Number(a) === Number(b);
}

// ------------------------------------------------------------------ backend → giao diện
export function toBuilding(dto: BuildingResponse, stats = { roomCount: 0, occupiedCount: 0 }): ManagedBuilding {
  return {
    id: dto.id,
    workspaceId: dto.workspaceId,
    name: dto.name,
    address: dto.addressLine1,
    addressLine2: dto.addressLine2 ?? undefined,
    ward: dto.ward ?? undefined,
    district: dto.district ?? undefined,
    city: dto.city,
    postalCode: dto.postalCode ?? undefined,
    lat: dto.latitude ?? undefined,
    lng: dto.longitude ?? undefined,
    description: dto.description ?? undefined,
    status: dto.status,
    createdAt: dto.createdAt,
    ...stats,
  };
}

export function toAmenity(dto: AmenityResponse): AmenityRef {
  return { id: dto.id, name: dto.name, description: dto.description ?? undefined };
}

export function toImage(dto: RoomImageResponse): RoomImageItem {
  return { id: dto.id, url: dto.url, altText: dto.altText ?? undefined, sortOrder: dto.sortOrder };
}

export function toRoom(dto: RoomResponse, buildingName: string, images?: RoomImageResponse[]): ManagedRoom {
  return {
    id: dto.id,
    workspaceId: dto.workspaceId,
    buildingId: dto.buildingId,
    buildingName,
    code: dto.code,
    areaSqm: dto.areaSqm,
    monthlyRent: dto.monthlyRent,
    maxOccupants: dto.maxOccupants,
    description: dto.description ?? '',
    status: dto.status,
    archivedAt: dto.archivedAt,
    amenities: dto.amenities.map(toAmenity),
    ...(images ? { images: [...images].sort((a, b) => a.sortOrder - b.sortOrder).map(toImage) } : {}),
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

/** Thống kê tòa nhà từ danh sách phòng thật (phòng đã lưu trữ không tính). */
export function buildingStats(rooms: Array<Pick<RoomResponse, 'status'>>) {
  const active = rooms.filter((r) => r.status !== 'ARCHIVED');
  return { roomCount: active.length, occupiedCount: active.filter((r) => r.status === 'OCCUPIED').length };
}

// ------------------------------------------------------------------ giao diện → backend (đúng DTO)
const clean = (v: string | undefined) => (v === undefined ? undefined : v.trim());

/** Body POST/PATCH tòa nhà: chỉ các trường DTO có, bỏ trường undefined. */
export function toBuildingBody(input: BuildingInput | BuildingPatch) {
  const body: Record<string, string | number> = {};
  const set = (key: string, value: string | number | undefined) => {
    if (value !== undefined) body[key] = value;
  };
  set('name', clean(input.name));
  set('description', clean(input.description));
  set('addressLine1', clean(input.address));
  set('addressLine2', clean(input.addressLine2));
  set('ward', clean(input.ward));
  set('district', clean(input.district));
  set('city', clean(input.city));
  set('postalCode', clean(input.postalCode));
  set('latitude', input.lat);
  set('longitude', input.lng);
  return body;
}

/** So khớp form với tòa nhà hiện có và chỉ trả các trường thực sự thay đổi. */
export function diffBuilding(current: ManagedBuilding, next: BuildingInput): BuildingPatch {
  const patch: BuildingPatch = {};
  const str = (key: 'name' | 'address' | 'addressLine2' | 'ward' | 'district' | 'city' | 'postalCode' | 'description') => {
    const before = (current[key] ?? '').trim();
    const after = (next[key] ?? '').trim();
    if (before !== after) patch[key] = after;
  };
  (['name', 'address', 'addressLine2', 'ward', 'district', 'city', 'postalCode', 'description'] as const).forEach(str);
  if (next.lat !== current.lat || next.lng !== current.lng) {
    if (next.lat !== undefined && next.lng !== undefined) {
      patch.lat = next.lat;
      patch.lng = next.lng;
    }
  }
  return patch;
}

export function diffRoom(current: ManagedRoom, next: { code: string; areaSqm: string; monthlyRent: string; maxOccupants: number; description: string; status?: 'VACANT' | 'UNAVAILABLE' }) {
  const patch: Record<string, string | number> = {};
  if (next.code.trim() !== current.code) patch.code = next.code.trim();
  if (!sameDecimal(next.areaSqm, current.areaSqm)) patch.areaSqm = next.areaSqm;
  // Tiền: so theo giá trị; không gửi nếu không đổi, tránh ghi đè phần lẻ hiện có.
  if (!sameDecimal(next.monthlyRent, current.monthlyRent)) patch.monthlyRent = next.monthlyRent;
  if (next.maxOccupants !== current.maxOccupants) patch.maxOccupants = next.maxOccupants;
  if (next.description.trim() !== current.description) patch.description = next.description.trim();
  if (next.status && next.status !== current.status && (current.status === 'VACANT' || current.status === 'UNAVAILABLE')) patch.status = next.status;
  return patch;
}
