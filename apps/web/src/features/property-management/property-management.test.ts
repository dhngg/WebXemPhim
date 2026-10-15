import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BuildingResponse, RoomImageResponse, RoomResponse } from '@rental/shared';

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() }));

vi.mock('@/services/http/httpClient', () => ({ httpClient: http }));
vi.mock('@/mocks/handlers/property-management.mock', () => ({ propertyManagementMock: {} }));

import { hasPermission } from '@/features/workspaces/types';
import { buildingSchema } from '@/pages/workspace/BuildingPages';
import { roomSchema } from '@/pages/workspace/RoomPages';
import { imageUrlSchema, moveImage } from '@/pages/workspace/room-parts/RoomImagesManager';
import { propertyManagementHttp as api } from './api';
import { buildingStats, diffBuilding, diffRoom, formatArea, formatMoney, parseDecimal, sameDecimal, toBuilding, toBuildingBody, toRoom } from './mappers';

const BID = '44444444-4444-4444-8444-444444444444';
const RID = '22222222-2222-4222-8222-222222222222';
const WS = '11111111-1111-4111-8111-111111111111';

const buildingDto = (o: Partial<BuildingResponse> = {}): BuildingResponse =>
  ({
    id: BID,
    workspaceId: WS,
    name: 'Tòa An Bình',
    description: null,
    addressLine1: '12 Nguyễn Trãi',
    addressLine2: null,
    ward: null,
    district: null,
    city: 'Hà Nội',
    postalCode: null,
    countryCode: 'VN',
    latitude: null,
    longitude: null,
    status: 'ACTIVE',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...o,
  }) as BuildingResponse;

const roomDto = (o: Partial<RoomResponse> = {}): RoomResponse =>
  ({
    id: RID,
    workspaceId: WS,
    buildingId: BID,
    code: 'A-101',
    areaSqm: '25.50',
    monthlyRent: '3500000.50',
    maxOccupants: 2,
    description: null,
    status: 'VACANT',
    archivedAt: null,
    amenities: [{ id: 'am-1', name: 'Điều hòa', description: null }],
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...o,
  }) as RoomResponse;

beforeEach(() => Object.values(http).forEach((f) => f.mockReset()));

describe('số thập phân chính xác', () => {
  it('parse/so sánh giá trị, từ chối chuỗi sai', () => {
    expect(parseDecimal('25.50')).toBe(25.5);
    expect(() => parseDecimal('abc')).toThrow(TypeError);
    expect(() => parseDecimal('-1')).toThrow(TypeError);
    expect(sameDecimal('3500000', '3500000.00')).toBe(true);
    expect(sameDecimal('3500000.01', '3500000')).toBe(false);
  });
  it('formatMoney giữ phần lẻ thật, không làm tròn', () => {
    expect(formatMoney('3500000.00')).toMatch(/^3\.500\.000/);
    expect(formatMoney('3500000.00')).not.toMatch(/,/);
    expect(formatMoney('3500000.50')).toMatch(/3\.500\.000,50/);
    expect(formatMoney('3500000.05')).toMatch(/3\.500\.000,05/);
    expect(formatMoney('oops')).toBe('—');
  });
  it('formatArea bỏ số 0 thừa nhưng không cắt giá trị thật', () => {
    expect(formatArea('25.50')).toBe('25,5');
    expect(formatArea('25.00')).toBe('25');
    expect(formatArea('0.05')).toBe('0,05');
    expect(formatArea('25.25')).toBe('25,25');
  });
});

describe('mapping DTO', () => {
  it('toBuilding đổi đúng tên trường backend', () => {
    const b = toBuilding(buildingDto({ latitude: 21.02, longitude: 105.8 }), { roomCount: 3, occupiedCount: 1 });
    expect(b).toMatchObject({ address: '12 Nguyễn Trãi', lat: 21.02, lng: 105.8, roomCount: 3, occupiedCount: 1 });
  });
  it('toRoom giữ nguyên chuỗi tiền/diện tích và sắp ảnh theo sortOrder', () => {
    const imgs = [
      { id: 'b', url: 'https://x/b.jpg', altText: null, sortOrder: 2 },
      { id: 'a', url: 'https://x/a.jpg', altText: 'A', sortOrder: 1 },
    ] as RoomImageResponse[];
    const room = toRoom(roomDto(), 'Tòa An Bình', imgs);
    expect(room.monthlyRent).toBe('3500000.50');
    expect(room.areaSqm).toBe('25.50');
    expect(room.images?.map((i) => i.id)).toEqual(['a', 'b']);
    expect(room.id).toBe(RID);
  });
  it('buildingStats không đếm phòng đã lưu trữ', () => {
    expect(buildingStats([{ status: 'VACANT' }, { status: 'OCCUPIED' }, { status: 'ARCHIVED' }])).toEqual({ roomCount: 2, occupiedCount: 1 });
  });
  it('toBuildingBody dùng addressLine1/latitude/longitude và bỏ trường undefined', () => {
    expect(toBuildingBody({ name: ' A ', address: ' 1 Phố ', city: 'HN', lat: 1, lng: 2 })).toEqual({ name: 'A', addressLine1: '1 Phố', city: 'HN', latitude: 1, longitude: 2 });
  });
});

describe('diff chỉ gửi trường thay đổi', () => {
  const building = toBuilding(buildingDto());
  it('tòa nhà: không đổi → patch rỗng; đổi tên → chỉ name', () => {
    const same = { name: building.name, address: building.address, city: building.city };
    expect(diffBuilding(building, same)).toEqual({});
    expect(diffBuilding(building, { ...same, name: 'Tòa mới' })).toEqual({ name: 'Tòa mới' });
  });
  it('phòng: tiền giữ phần lẻ cũ khi không sửa, gửi khi đổi giá trị', () => {
    const room = toRoom(roomDto(), 'Tòa');
    const same = { code: 'A-101', areaSqm: '25.5', monthlyRent: '3500000.50', maxOccupants: 2, description: '' };
    expect(diffRoom(room, same)).toEqual({});
    expect(diffRoom(room, { ...same, monthlyRent: '4000000' })).toEqual({ monthlyRent: '4000000' });
    expect(diffRoom(room, { ...same, status: 'UNAVAILABLE' })).toEqual({ status: 'UNAVAILABLE' });
  });
  it('phòng đang OCCUPIED không bao giờ gửi status', () => {
    const room = toRoom(roomDto({ status: 'OCCUPIED' }), 'Tòa');
    expect(diffRoom(room, { code: 'A-101', areaSqm: '25.5', monthlyRent: '3500000.50', maxOccupants: 2, description: '', status: 'VACANT' })).toEqual({});
  });
});

describe('validation form', () => {
  const base = { name: 'Tòa A', address: '1 Phố', city: 'Hà Nội', addressLine2: '', ward: '', district: '', postalCode: '', description: '' };
  it('tòa nhà: bắt buộc tên/địa chỉ/tỉnh, tọa độ phải đi theo cặp và đúng khoảng', () => {
    expect(buildingSchema.safeParse(base).success).toBe(true);
    expect(buildingSchema.safeParse({ ...base, name: '' }).success).toBe(false);
    expect(buildingSchema.safeParse({ ...base, lat: '21', lng: '' }).success).toBe(false);
    expect(buildingSchema.safeParse({ ...base, lat: '21', lng: '105' }).success).toBe(true);
    expect(buildingSchema.safeParse({ ...base, lat: '91', lng: '105' }).success).toBe(false);
  });
  const room = { buildingId: BID, code: 'A-101', areaSqm: '25,5', monthlyRent: 3_500_000, maxOccupants: 2, description: '', status: 'VACANT' };
  it('phòng: diện tích >0 tối đa 2 số lẻ, nhận dấu phẩy; giá nguyên không âm', () => {
    const ok = roomSchema.safeParse(room);
    expect(ok.success && ok.data.areaSqm).toBe('25.5');
    expect(roomSchema.safeParse({ ...room, areaSqm: '0' }).success).toBe(false);
    expect(roomSchema.safeParse({ ...room, areaSqm: '25.123' }).success).toBe(false);
    expect(roomSchema.safeParse({ ...room, monthlyRent: -1 }).success).toBe(false);
    expect(roomSchema.safeParse({ ...room, monthlyRent: 1.5 }).success).toBe(false);
    expect(roomSchema.safeParse({ ...room, maxOccupants: 0 }).success).toBe(false);
    expect(roomSchema.safeParse({ ...room, status: 'OCCUPIED' }).success).toBe(false);
  });
  it('ảnh: chỉ nhận http(s) ≤ 2048 ký tự', () => {
    expect(imageUrlSchema.safeParse({ url: 'https://x.test/a.jpg', altText: '' }).success).toBe(true);
    expect(imageUrlSchema.safeParse({ url: 'ftp://x.test/a.jpg', altText: '' }).success).toBe(false);
    expect(imageUrlSchema.safeParse({ url: 'javascript:alert(1)', altText: '' }).success).toBe(false);
    expect(imageUrlSchema.safeParse({ url: `https://x.test/${'a'.repeat(2050)}`, altText: '' }).success).toBe(false);
  });
  it('moveImage đổi chỗ và chặn vượt biên', () => {
    const imgs = ['1', '2', '3'].map((id, i) => ({ id, url: 'https://x', sortOrder: i }));
    expect(moveImage(imgs, 1, -1)).toEqual(['2', '1', '3']);
    expect(moveImage(imgs, 0, -1)).toEqual(['1', '2', '3']);
    expect(moveImage(imgs, 2, 1)).toEqual(['1', '2', '3']);
  });
});

describe('quyền giao diện', () => {
  it('chỉ OWNER lưu trữ tòa nhà; STAFF chỉ đọc', () => {
    expect(hasPermission('OWNER', 'buildings.archive')).toBe(true);
    expect(hasPermission('MANAGER', 'buildings.archive')).toBe(false);
    expect(hasPermission('STAFF', 'rooms.write')).toBe(false);
    expect(hasPermission('OWNER', 'rooms.write')).toBe(true);
  });
});

describe('HTTP adapter gọi đúng endpoint/body', () => {
  it('tạo tòa nhà gửi addressLine1 và trả stats 0', async () => {
    http.post.mockResolvedValue(buildingDto());
    const b = await api.createBuilding(WS, { name: 'Tòa An Bình', address: '12 Nguyễn Trãi', city: 'Hà Nội' });
    expect(http.post).toHaveBeenCalledWith(`/workspaces/${WS}/buildings`, { name: 'Tòa An Bình', addressLine1: '12 Nguyễn Trãi', city: 'Hà Nội' });
    expect(b.id).toBe(BID);
  });
  it('lưu trữ/khôi phục tòa nhà dùng PATCH', async () => {
    http.patch.mockResolvedValue(undefined);
    http.get.mockResolvedValueOnce(buildingDto({ status: 'ARCHIVED' })).mockResolvedValueOnce([]);
    await api.archiveBuilding(WS, BID);
    expect(http.patch).toHaveBeenCalledWith(`/workspaces/${WS}/buildings/${BID}/archive`);
  });
  it('tạo phòng POST vào tòa nhà, không gửi buildingId trong body', async () => {
    http.post.mockResolvedValue(roomDto());
    http.get.mockResolvedValue(buildingDto());
    const room = await api.createRoom(WS, { buildingId: BID, code: 'A-101', areaSqm: '25.50', monthlyRent: '3500000', maxOccupants: 2 });
    expect(http.post).toHaveBeenCalledWith(`/workspaces/${WS}/buildings/${BID}/rooms`, { code: 'A-101', areaSqm: '25.50', monthlyRent: '3500000', maxOccupants: 2 });
    expect(room.buildingName).toBe('Tòa An Bình');
  });
  it('getRoom không có buildingId → tìm tòa chứa phòng rồi lấy ảnh', async () => {
    http.get.mockImplementation(async (url: string) => {
      if (url === `/workspaces/${WS}/buildings`) return [buildingDto()];
      if (url.endsWith('/rooms') ) return [roomDto()];
      if (url.endsWith('/images')) return [];
      return roomDto();
    });
    const room = await api.getRoom(WS, RID);
    expect(room.buildingId).toBe(BID);
    expect(http.get).toHaveBeenCalledWith(`/workspaces/${WS}/buildings/${BID}/rooms/${RID}/images`);
  });
  it('getRoom không tìm thấy → ROOM_NOT_FOUND', async () => {
    http.get.mockImplementation(async (url: string) => (url.endsWith('/rooms') ? [] : [buildingDto()]));
    await expect(api.getRoom(WS, RID)).rejects.toMatchObject({ code: 'ROOM_NOT_FOUND' });
  });
  it('listRooms ẩn phòng lưu trữ trừ khi lọc đúng trạng thái', async () => {
    http.get.mockImplementation(async (url: string) =>
      url.endsWith('/rooms') ? [roomDto(), roomDto({ id: 'r2', code: 'A-102', status: 'ARCHIVED' })] : [buildingDto()],
    );
    expect((await api.listRooms(WS, {})).map((x) => x.code)).toEqual(['A-101']);
    expect((await api.listRooms(WS, { status: 'ARCHIVED' })).map((x) => x.code)).toEqual(['A-102']);
  });
  it('gán/bỏ tiện ích dùng POST/DELETE', async () => {
    await api.setRoomAmenity(WS, BID, RID, 'am-1', true);
    await api.setRoomAmenity(WS, BID, RID, 'am-1', false);
    const url = `/workspaces/${WS}/buildings/${BID}/rooms/${RID}/amenities/am-1`;
    expect(http.post).toHaveBeenCalledWith(url);
    expect(http.delete).toHaveBeenCalledWith(url);
  });
  it('ảnh: thêm URL, sắp xếp bằng imageIds, xóa theo id', async () => {
    http.post.mockResolvedValue({ id: 'i1', url: 'https://x/a.jpg', altText: null, sortOrder: 1 });
    http.patch.mockResolvedValue([]);
    await api.addRoomImage(WS, BID, RID, { url: 'https://x/a.jpg' });
    await api.reorderRoomImages(WS, BID, RID, ['b', 'a']);
    await api.deleteRoomImage(WS, BID, RID, 'a');
    const base = `/workspaces/${WS}/buildings/${BID}/rooms/${RID}/images`;
    expect(http.post).toHaveBeenCalledWith(base, { url: 'https://x/a.jpg' });
    expect(http.patch).toHaveBeenCalledWith(`${base}/reorder`, { imageIds: ['b', 'a'] });
    expect(http.delete).toHaveBeenCalledWith(`${base}/a`);
  });
  it('đăng tin PUT {published}, trả listing.id (khác room.id)', async () => {
    http.put.mockResolvedValue({ id: 'listing-9', roomId: RID, published: true });
    const res = await api.setListing(WS, BID, RID, true);
    expect(http.put).toHaveBeenCalledWith(`/workspaces/${WS}/buildings/${BID}/rooms/${RID}/listing`, { published: true });
    expect(JSON.stringify(res)).toContain('listing-9');
  });
});
