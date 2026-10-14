import { env } from '@/lib/env';
import { httpClient } from '@/services/http/httpClient';
import { viewingsMock } from '@/mocks/handlers/viewings.mock';
import type { CreateViewingInput, Viewing } from './types';

export interface ViewingsApi {
  create(input: CreateViewingInput): Promise<Viewing>;
  listMine(): Promise<Viewing[]>;
  cancel(viewingId: string): Promise<Viewing>;
}

/** Endpoint DỰ KIẾN — chưa chốt. Chính sách khách chưa đăng nhập đặt lịch cần backend xác nhận. */
const viewingsHttp: ViewingsApi = {
  create: (input) => httpClient.post('/viewings', input),
  listMine: () => httpClient.get('/viewings/me'),
  cancel: (id) => httpClient.post(`/viewings/${encodeURIComponent(id)}/cancel`),
};

export const viewingsApi: ViewingsApi = env.useMockApi ? viewingsMock : viewingsHttp;
