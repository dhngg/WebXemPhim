import type { CreateDepositEntryRequest, DepositEntryResponse, DepositPageResponse, ReverseDepositEntryRequest } from '@rental/shared';
import { env } from '@/lib/env';
import { httpClient } from '@/services/http/httpClient';
import { depositsMock } from '@/mocks/handlers/deposits.mock';

export interface PageQuery {
  page: number;
  limit: number;
}

/** 4 endpoint OWNER của sổ tiền cọc theo hợp đồng (contract.id từ module tenancy). Sổ chỉ ghi nhận, không di chuyển tiền. */
export interface DepositsApi {
  getDeposit(ws: string, contractId: string, page: PageQuery): Promise<DepositPageResponse>;
  createEntry(ws: string, contractId: string, input: CreateDepositEntryRequest): Promise<DepositEntryResponse>;
  getEntry(ws: string, contractId: string, entryId: string): Promise<DepositEntryResponse>;
  reverseEntry(ws: string, contractId: string, entryId: string, input: ReverseDepositEntryRequest): Promise<DepositEntryResponse>;
}

const enc = encodeURIComponent;
const dp = (ws: string, contractId: string) => `/workspaces/${enc(ws)}/contracts/${enc(contractId)}/deposit`;

export const depositsHttp: DepositsApi = {
  getDeposit: (ws, c, page) => httpClient.get(dp(ws, c), { query: { page: page.page, limit: page.limit } }),
  createEntry: (ws, c, input) => httpClient.post(`${dp(ws, c)}/entries`, input),
  getEntry: (ws, c, id) => httpClient.get(`${dp(ws, c)}/entries/${enc(id)}`),
  reverseEntry: (ws, c, id, input) => httpClient.post(`${dp(ws, c)}/entries/${enc(id)}/reverse`, input),
};

export const depositsApi: DepositsApi = env.useMockApi ? depositsMock : depositsHttp;
