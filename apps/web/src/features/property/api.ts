import { env } from '@/lib/env';
import { httpClient } from '@/services/http/httpClient';
import { propertyMock } from '@/mocks/handlers/property.mock';
import type {
  Building,
  BuildingInput,
  BuildingWithStats,
  WsRoom,
  WsRoomFilters,
  WsRoomInput,
  WsViewing,
  WsViewingStatus,
  ListingStatus,
} from './types';

export interface PropertyApi {
  listBuildings(ws: string, q?: string): Promise<BuildingWithStats[]>;
  getBuilding(ws: string, id: string): Promise<BuildingWithStats>;
  createBuilding(ws: string, input: BuildingInput): Promise<Building>;
  updateBuilding(ws: string, id: string, input: BuildingInput): Promise<Building>;

  listRooms(ws: string, filters: WsRoomFilters): Promise<WsRoom[]>;
  getRoom(ws: string, id: string): Promise<WsRoom>;
  createRoom(ws: string, input: WsRoomInput): Promise<WsRoom>;
  updateRoom(ws: string, id: string, input: WsRoomInput): Promise<WsRoom>;
  setListingStatus(ws: string, id: string, status: ListingStatus): Promise<WsRoom>;

  listViewings(ws: string, status?: WsViewingStatus): Promise<WsViewing[]>;
  setViewingStatus(ws: string, id: string, status: WsViewingStatus): Promise<WsViewing>;
}

const p = (ws: string) => `/workspaces/${encodeURIComponent(ws)}`;

/** Endpoint DỰ KIẾN — chưa chốt. */
const propertyHttp: PropertyApi = {
  listBuildings: (ws, q) => httpClient.get(`${p(ws)}/buildings`, { query: { q } }),
  getBuilding: (ws, id) => httpClient.get(`${p(ws)}/buildings/${id}`),
  createBuilding: (ws, input) => httpClient.post(`${p(ws)}/buildings`, input),
  updateBuilding: (ws, id, input) => httpClient.patch(`${p(ws)}/buildings/${id}`, input),
  listRooms: (ws, f) => httpClient.get(`${p(ws)}/rooms`, { query: { ...f } }),
  getRoom: (ws, id) => httpClient.get(`${p(ws)}/rooms/${id}`),
  createRoom: (ws, input) => httpClient.post(`${p(ws)}/rooms`, input),
  updateRoom: (ws, id, input) => httpClient.patch(`${p(ws)}/rooms/${id}`, input),
  setListingStatus: (ws, id, status) => httpClient.patch(`${p(ws)}/rooms/${id}/listing`, { status }),
  listViewings: (ws, status) => httpClient.get(`${p(ws)}/viewings`, { query: { status } }),
  setViewingStatus: (ws, id, status) => httpClient.patch(`${p(ws)}/viewings/${id}`, { status }),
};

export const propertyApi: PropertyApi = env.useMockApi ? propertyMock : propertyHttp;
