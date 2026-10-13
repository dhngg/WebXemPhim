import type { Contract } from '@/features/leasing/types';
import type { Invoice, Payment } from '@/features/billing/types';

export type LinkRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface LinkRequest {
  id: string;
  workspaceName: string;
  contractCode: string;
  phone: string;
  status: LinkRequestStatus;
  createdAt: string;
  note?: string;
}

export interface LinkRequestInput {
  /** Mã workspace / mã mời do chủ trọ cung cấp. */
  inviteCode: string;
  contractCode: string;
  phone: string;
  /** Mã xác minh (OTP) — CHƯA có API, đang mock. */
  verificationCode: string;
}

export interface TenantOverview {
  contract: Contract | null;
  latestInvoice: Invoice | null;
  outstanding: number;
  pendingPayments: Payment[];
  notices: Array<{ id: string; title: string; at: string }>;
}
