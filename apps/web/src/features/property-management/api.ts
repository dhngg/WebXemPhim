import type { AmenityResponse, BuildingResponse, ListingManagementResponse, RoomImageResponse, RoomResponse } from '@rental/shared';
import { env } from '@/lib/env';
import { httpClient } from '@/services/http/httpClient';
import { propertyManagementMock } from '@/mocks/handlers/property-management.mock';
import { ApiError } from '@/services/http/ApiError';
import { buildingStats, toAmenity, toBuilding, toBuildingBody, toImage, toRoom } from './mappers';
import type {
  AmenityRef,
  BuildingInput,
  BuildingPatch,
  ListingResult,
  ManagedBuilding,
  ManagedRoom,
  RoomFilters,
  RoomImageItem,
  RoomInput,
  RoomPatch,
} from './types';

/** Mọi đường dẫn theo đúng phân cấp backend: workspace → building → room. */
export interface PropertyManagementApi {
  listBuildings(ws: string, q?: string): Promise<ManagedBuilding[]>;
  getBuilding(ws: string, id: string): Promise<ManagedBuilding>;
  createBuilding(ws: string, input: BuildingInput): Promise<ManagedBuilding>;
  updateBuilding(ws: string, id: string, patch: BuildingPatch): Promise<ManagedBuilding>;
  archiveBuilding(ws: string, id: string): Promise<ManagedBuilding>;
  restoreBuilding(ws: string, id: string): Promise<ManagedBuilding>;

  listRooms(ws: string, filters: RoomFilters): Promise<ManagedRoom[]>;
  /** `buildingId` là gợi ý để tránh phải tìm phòng qua toàn bộ tòa nhà. */
  getRoom(ws: string, id: string, buildingId?: string): Promise<ManagedRoom>;
  createRoom(ws: string, input: RoomInput): Promise<ManagedRoom>;
  updateRoom(ws: string, buildingId: string, id: string, patch: RoomPatch): Promise<ManagedRoom>;
  archiveRoom(ws: string, buildingId: string, id: string): Promise<ManagedRoom>;
  restoreRoom(ws: string, buildingId: string, id: string): Promise<ManagedRoom>;

  listAmenities(ws: string): Promise<AmenityRef[]>;
  createAmenity(ws: string, input: { name: string; description?: string }): Promise<AmenityRef>;
  setRoomAmenity(ws: string, buildingId: string, roomId: string, amenityId: string, enabled: boolean): Promise<void>;

  addRoomImage(ws: string, buildingId: string, roomId: string, input: { url: string; altText?: string }): Promise<RoomImageItem>;
  reorderRoomImages(ws: string, buildingId: string, roomId: string, imageIds: string[]): Promise<RoomImageItem[]>;
  deleteRoomImage(ws: string, buildingId: string, roomId: string, imageId: string): Promise<void>;

  /** Đăng/gỡ tin: backend chỉ có `PUT …/listing { published }` (không có API đọc trạng thái hiện tại). */
  setListing(ws: string, buildingId: string, roomId: string, published: boolean): Promise<ListingResult>;
}

const p = (ws: string) => `/workspaces/${encodeURIComponent(ws)}`;
const b = (ws: string, buildingId: string) => `${p(ws)}/buildings/${encodeURIComponent(buildingId)}`;
const r = (ws: string, buildingId: string, roomId: string) => `${b(ws, buildingId)}/rooms/${encodeURIComponent(roomId)}`;

async function rawBuildings(ws: string) {
  return httpClient.get<BuildingResponse[]>(`${p(ws)}/buildings`);
}
async function rawRooms(ws: string, buildingId: string) {
  return httpClient.get<RoomResponse[]>(`${b(ws, buildingId)}/rooms`);
}

/** Danh sách backend không phân trang: gom phòng của mọi tòa (hoặc một tòa) để lập danh sách/thống kê. */
async function roomsWithBuildings(ws: string, only?: string) {
  const buildings = (await rawBuildings(ws)).filter((x) => !only || x.id === only);
  const lists = await Promise.all(buildings.map((x) => rawRooms(ws, x.id)));
  return buildings.map((x, i) => ({ building: x, rooms: lists[i]! }));
}

const roomNotFound = () => new ApiError({ statusCode: 404, code: 'ROOM_NOT_FOUND', message: 'Room not found' });

export const propertyManagementHttp: PropertyManagementApi = {
  async listBuildings(ws, q) {
    const groups = await roomsWithBuildings(ws);
    const needle = q?.trim().toLowerCase();
    return groups
      .filter(({ building }) => !needle || `${building.name} ${building.addressLine1} ${building.district ?? ''} ${building.city}`.toLowerCase().includes(needle))
      .map(({ building, rooms }) => toBuilding(building, buildingStats(rooms)));
  },
  async getBuilding(ws, id) {
    const [dto, rooms] = await Promise.all([httpClient.get<BuildingResponse>(b(ws, id)), rawRooms(ws, id)]);
    return toBuilding(dto, buildingStats(rooms));
  },
  async createBuilding(ws, input) {
    return toBuilding(await httpClient.post<BuildingResponse>(`${p(ws)}/buildings`, toBuildingBody(input)));
  },
  async updateBuilding(ws, id, patch) {
    return this.getBuilding(ws, (await httpClient.patch<BuildingResponse>(b(ws, id), toBuildingBody(patch))).id);
  },
  async archiveBuilding(ws, id) {
    await httpClient.patch(`${b(ws, id)}/archive`);
    return this.getBuilding(ws, id);
  },
  async restoreBuilding(ws, id) {
    await httpClient.patch(`${b(ws, id)}/restore`);
    return this.getBuilding(ws, id);
  },

  async listRooms(ws, f) {
    const groups = await roomsWithBuildings(ws, f.buildingId);
    const needle = f.q?.trim().toLowerCase();
    return groups
      .flatMap(({ building, rooms }) => rooms.map((room) => toRoom(room, building.name)))
      // Phòng đã lưu trữ chỉ hiện khi lọc đúng trạng thái đó.
      .filter((room) => (f.status ? room.status === f.status : room.status !== 'ARCHIVED'))
      .filter((room) => !needle || `${room.code} ${room.buildingName}`.toLowerCase().includes(needle))
      .sort((x, y) => x.buildingName.localeCompare(y.buildingName) || x.code.localeCompare(y.code, 'vi', { numeric: true }));
  },
  async getRoom(ws, id, buildingId) {
    let building: BuildingResponse | undefined;
    if (buildingId) building = await httpClient.get<BuildingResponse>(b(ws, buildingId));
    else {
      // Route /rooms/:roomId không mang tòa nhà: tìm tòa chứa phòng này.
      const groups = await roomsWithBuildings(ws);
      building = groups.find(({ rooms }) => rooms.some((room) => room.id === id))?.building;
      if (!building) throw roomNotFound();
    }
    const [room, images] = await Promise.all([
      httpClient.get<RoomResponse>(r(ws, building.id, id)),
      httpClient.get<RoomImageResponse[]>(`${r(ws, building.id, id)}/images`),
    ]);
    return toRoom(room, building.name, images);
  },
  async createRoom(ws, input) {
    const { buildingId, ...body } = input;
    const [room, building] = await Promise.all([
      httpClient.post<RoomResponse>(`${b(ws, buildingId)}/rooms`, body),
      httpClient.get<BuildingResponse>(b(ws, buildingId)),
    ]);
    return toRoom(room, building.name, []);
  },
  async updateRoom(ws, buildingId, id, patch) {
    await httpClient.patch(r(ws, buildingId, id), patch);
    return this.getRoom(ws, id, buildingId);
  },
  async archiveRoom(ws, buildingId, id) {
    await httpClient.patch(`${r(ws, buildingId, id)}/archive`);
    return this.getRoom(ws, id, buildingId);
  },
  async restoreRoom(ws, buildingId, id) {
    await httpClient.patch(`${r(ws, buildingId, id)}/restore`);
    return this.getRoom(ws, id, buildingId);
  },

  async listAmenities(ws) {
    return (await httpClient.get<AmenityResponse[]>(`${p(ws)}/amenities`)).map(toAmenity);
  },
  async createAmenity(ws, input) {
    return toAmenity(await httpClient.post<AmenityResponse>(`${p(ws)}/amenities`, input));
  },
  async setRoomAmenity(ws, buildingId, roomId, amenityId, enabled) {
    const url = `${r(ws, buildingId, roomId)}/amenities/${encodeURIComponent(amenityId)}`;
    if (enabled) await httpClient.post(url);
    else await httpClient.delete(url);
  },

  async addRoomImage(ws, buildingId, roomId, input) {
    return toImage(await httpClient.post<RoomImageResponse>(`${r(ws, buildingId, roomId)}/images`, input));
  },
  async reorderRoomImages(ws, buildingId, roomId, imageIds) {
    const images = await httpClient.patch<RoomImageResponse[]>(`${r(ws, buildingId, roomId)}/images/reorder`, { imageIds });
    return images.map(toImage);
  },
  async deleteRoomImage(ws, buildingId, roomId, imageId) {
    await httpClient.delete(`${r(ws, buildingId, roomId)}/images/${encodeURIComponent(imageId)}`);
  },

  async setListing(ws, buildingId, roomId, published) {
    const res = await httpClient.put<ListingManagementResponse>(`${r(ws, buildingId, roomId)}/listing`, { published });
    return { id: res.id, published: res.published };
  },
};

export const propertyManagementApi: PropertyManagementApi = env.useMockApi ? propertyManagementMock : propertyManagementHttp;
