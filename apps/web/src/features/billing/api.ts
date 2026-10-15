import { env } from '@/lib/env';
import { httpClient } from '@/services/http/httpClient';
import { billingMock } from '@/mocks/handlers/billing.mock';
import type {
  BillingPreviewItem,
  BillingRunResult,
  DepositInput,
  DepositTx,
  Invoice,
  InvoiceStatus,
  MeterInput,
  MeterReading,
  Payment,
  PaymentInput,
  PaymentStatus,
  RateInput,
  RateVersion,
} from './types';

export interface MeterSheetRow {
  roomId: string;
  roomCode: string;
  buildingName: string;
  /** Chỉ số mới của kỳ trước (gợi ý làm số cũ). */
  previous: { electric: number; water: number } | null;
  reading: MeterReading | null;
}

export interface InvoiceFilters {
  period?: string;
  status?: InvoiceStatus;
  q?: string;
  contractId?: string;
}

export interface BillingApi {
  listRates(ws: string): Promise<RateVersion[]>;
  createRate(ws: string, input: RateInput): Promise<RateVersion>;

  getMeterSheet(ws: string, period: string): Promise<MeterSheetRow[]>;
  saveMeter(ws: string, input: MeterInput): Promise<MeterReading>;

  listInvoices(ws: string, f: InvoiceFilters): Promise<Invoice[]>;
  getInvoice(ws: string, id: string): Promise<Invoice>;
  addAdjustment(ws: string, id: string, amount: number, reason: string): Promise<Invoice>;

  previewBilling(ws: string, period: string): Promise<BillingPreviewItem[]>;
  runBilling(ws: string, period: string, contractIds: string[]): Promise<BillingRunResult>;

  listPayments(ws: string, status?: PaymentStatus, invoiceId?: string): Promise<Payment[]>;
  recordPayment(ws: string, input: PaymentInput): Promise<Payment>;
  confirmPayment(ws: string, id: string): Promise<Payment>;
  rejectPayment(ws: string, id: string, reason: string): Promise<Payment>;

  listDeposits(ws: string, contractId?: string): Promise<DepositTx[]>;
  createDeposit(ws: string, input: DepositInput): Promise<DepositTx>;
}

const p = (ws: string) => `/workspaces/${encodeURIComponent(ws)}`;

/** Endpoint DỰ KIẾN — chưa chốt. */
const billingHttp: BillingApi = {
  listRates: (ws) => httpClient.get(`${p(ws)}/rates`),
  createRate: (ws, input) => httpClient.post(`${p(ws)}/rates`, input),
  getMeterSheet: (ws, period) => httpClient.get(`${p(ws)}/meter-readings`, { query: { period } }),
  saveMeter: (ws, input) => httpClient.post(`${p(ws)}/meter-readings`, input),
  listInvoices: (ws, f) => httpClient.get(`${p(ws)}/invoices`, { query: { ...f } }),
  getInvoice: (ws, id) => httpClient.get(`${p(ws)}/invoices/${id}`),
  addAdjustment: (ws, id, amount, reason) => httpClient.post(`${p(ws)}/invoices/${id}/adjustments`, { amount, reason }),
  previewBilling: (ws, period) => httpClient.post(`${p(ws)}/billing/preview`, { period }),
  runBilling: (ws, period, contractIds) => httpClient.post(`${p(ws)}/billing/run`, { period, contractIds }),
  listPayments: (ws, status, invoiceId) => httpClient.get(`${p(ws)}/payments`, { query: { status, invoiceId } }),
  recordPayment: (ws, input) => httpClient.post(`${p(ws)}/payments`, input),
  confirmPayment: (ws, id) => httpClient.post(`${p(ws)}/payments/${id}/confirm`),
  rejectPayment: (ws, id, reason) => httpClient.post(`${p(ws)}/payments/${id}/reject`, { reason }),
  listDeposits: (ws, contractId) => httpClient.get(`${p(ws)}/deposits`, { query: { contractId } }),
  createDeposit: (ws, input) => httpClient.post(`${p(ws)}/deposits`, input),
};

export const billingApi: BillingApi = env.useMockApi ? billingMock : billingHttp;
