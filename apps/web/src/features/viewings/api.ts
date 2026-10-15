import type { ViewingRequestPageResponse, ViewingRequestResponse } from '@rental/shared';
import { env } from '@/lib/env';
import { httpClient } from '@/services/http/httpClient';
import { viewingsMock } from '@/mocks/handlers/viewings.mock';
import type { CreateViewingInput, Viewing } from './types';

export interface ViewingsApi {
  create(input: CreateViewingInput): Promise<Viewing>;
  listMine(): Promise<Viewing[]>;
  cancel(viewingId: string): Promise<Viewing>;
}

/** Response backend → màn hình. Không bịa dữ liệu backend không trả (địa chỉ, ảnh, liên hệ). */
export function mapViewingRequest(dto: ViewingRequestResponse): Viewing {
  return {
    id: dto.id,
    listingId: dto.listingId,
    roomId: dto.room.id,
    roomTitle: `${dto.room.buildingName} – Phòng ${dto.room.code}`,
    scheduledAt: dto.scheduledAt,
    status: dto.status,
    note: dto.message ?? undefined,
    decisionNote: dto.decisionNote ?? undefined,
    createdAt: dto.createdAt,
  };
}

const PAGE_LIMIT = 50;
const MAX_PAGES = 10;

export const viewingsHttp: ViewingsApi = {
  async create(input) {
    const body = { scheduledAt: input.scheduledAt, ...(input.note ? { message: input.note } : {}) };
    return mapViewingRequest(
      await httpClient.post<ViewingRequestResponse>(`/listings/${encodeURIComponent(input.listingId)}/viewing-requests`, body),
    );
  },
  async listMine() {
    const all: ViewingRequestResponse[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const res = await httpClient.get<ViewingRequestPageResponse>('/viewing-requests/me', { query: { page, limit: PAGE_LIMIT } });
      all.push(...res.items);
      if (all.length >= res.total || res.items.length === 0) break;
    }
    return all.map(mapViewingRequest).sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
  },
  async cancel(id) {
    return mapViewingRequest(await httpClient.patch<ViewingRequestResponse>(`/viewing-requests/${encodeURIComponent(id)}/cancel`));
  },
};

export const viewingsApi: ViewingsApi = env.useMockApi ? viewingsMock : viewingsHttp;
