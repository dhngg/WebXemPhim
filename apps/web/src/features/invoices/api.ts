import type {
  CreateInvoiceAdjustmentRequest,
  CreateInvoiceRequest,
  InvoiceAdjustmentPageResponse,
  InvoiceAdjustmentResponse,
  InvoicePageResponse,
  InvoiceResponse,
  InvoiceStatus,
  UpdateInvoiceRequest,
} from '@rental/shared';
import { env } from '@/lib/env';
import { httpClient } from '@/services/http/httpClient';
import { invoicesMock } from '@/mocks/handlers/invoices.mock';

export interface InvoiceFilters {
  status?: InvoiceStatus;
  /** YYYY-MM */
  period?: string;
  roomId?: string;
  contractId?: string;
}
export interface PageQuery {
  page: number;
  limit: number;
}

/** 9 endpoint OWNER của Invoices/Adjustments; mọi URL nằm dưới workspace → tòa nhà. Dùng thẳng DTO dùng chung. */
export interface InvoicesApi {
  listInvoices(ws: string, buildingId: string, filters: InvoiceFilters, page: PageQuery): Promise<InvoicePageResponse>;
  createInvoice(ws: string, buildingId: string, input: CreateInvoiceRequest): Promise<InvoiceResponse>;
  getInvoice(ws: string, buildingId: string, invoiceId: string): Promise<InvoiceResponse>;
  updateInvoice(ws: string, buildingId: string, invoiceId: string, patch: UpdateInvoiceRequest): Promise<InvoiceResponse>;
  issueInvoice(ws: string, buildingId: string, invoiceId: string): Promise<InvoiceResponse>;
  deleteInvoice(ws: string, buildingId: string, invoiceId: string): Promise<void>;
  createAdjustment(ws: string, buildingId: string, invoiceId: string, input: CreateInvoiceAdjustmentRequest): Promise<InvoiceAdjustmentResponse>;
  listAdjustments(ws: string, buildingId: string, invoiceId: string, page: PageQuery): Promise<InvoiceAdjustmentPageResponse>;
  getAdjustment(ws: string, buildingId: string, invoiceId: string, adjustmentId: string): Promise<InvoiceAdjustmentResponse>;
}

const enc = encodeURIComponent;
const ip = (ws: string, buildingId: string) => `/workspaces/${enc(ws)}/buildings/${enc(buildingId)}/invoices`;

export const invoicesHttp: InvoicesApi = {
  listInvoices: (ws, b, f, page) =>
    httpClient.get(ip(ws, b), { query: { status: f.status, period: f.period, roomId: f.roomId, contractId: f.contractId, page: page.page, limit: page.limit } }),
  createInvoice: (ws, b, input) => httpClient.post(ip(ws, b), input),
  getInvoice: (ws, b, id) => httpClient.get(`${ip(ws, b)}/${enc(id)}`),
  updateInvoice: (ws, b, id, patch) => httpClient.patch(`${ip(ws, b)}/${enc(id)}`, patch),
  issueInvoice: (ws, b, id) => httpClient.post(`${ip(ws, b)}/${enc(id)}/issue`),
  deleteInvoice: async (ws, b, id) => {
    await httpClient.delete(`${ip(ws, b)}/${enc(id)}`);
  },
  createAdjustment: (ws, b, id, input) => httpClient.post(`${ip(ws, b)}/${enc(id)}/adjustments`, input),
  listAdjustments: (ws, b, id, page) => httpClient.get(`${ip(ws, b)}/${enc(id)}/adjustments`, { query: { page: page.page, limit: page.limit } }),
  getAdjustment: (ws, b, id, adjustmentId) => httpClient.get(`${ip(ws, b)}/${enc(id)}/adjustments/${enc(adjustmentId)}`),
};

export const invoicesApi: InvoicesApi = env.useMockApi ? invoicesMock : invoicesHttp;
