import type {
  CreateInvoicePaymentRequest,
  InvoicePaymentPageResponse,
  InvoicePaymentResponse,
  ReverseInvoicePaymentRequest,
} from '@rental/shared';
import { env } from '@/lib/env';
import { httpClient } from '@/services/http/httpClient';
import { paymentsMock } from '@/mocks/handlers/payments.mock';

export interface PageQuery {
  page: number;
  limit: number;
}

/** 4 endpoint OWNER của sổ thanh toán theo hóa đơn: không có hàng chờ xác nhận, từ chối hay minh chứng. */
export interface PaymentsApi {
  listPayments(ws: string, buildingId: string, invoiceId: string, page: PageQuery): Promise<InvoicePaymentPageResponse>;
  recordPayment(ws: string, buildingId: string, invoiceId: string, input: CreateInvoicePaymentRequest): Promise<InvoicePaymentResponse>;
  getPayment(ws: string, buildingId: string, invoiceId: string, paymentId: string): Promise<InvoicePaymentResponse>;
  reversePayment(ws: string, buildingId: string, invoiceId: string, paymentId: string, input: ReverseInvoicePaymentRequest): Promise<InvoicePaymentResponse>;
}

const enc = encodeURIComponent;
const pp = (ws: string, b: string, invoiceId: string) => `/workspaces/${enc(ws)}/buildings/${enc(b)}/invoices/${enc(invoiceId)}/payments`;

export const paymentsHttp: PaymentsApi = {
  listPayments: (ws, b, id, page) => httpClient.get(pp(ws, b, id), { query: { page: page.page, limit: page.limit } }),
  recordPayment: (ws, b, id, input) => httpClient.post(pp(ws, b, id), input),
  getPayment: (ws, b, id, paymentId) => httpClient.get(`${pp(ws, b, id)}/${enc(paymentId)}`),
  reversePayment: (ws, b, id, paymentId, input) => httpClient.post(`${pp(ws, b, id)}/${enc(paymentId)}/reverse`, input),
};

export const paymentsApi: PaymentsApi = env.useMockApi ? paymentsMock : paymentsHttp;
