/** Phiên bản đơn giá dịch vụ — áp dụng từ `effectiveFrom` (BR-04). */
export interface RateVersion {
  id: string;
  workspaceId: string;
  /** yyyy-MM-dd */
  effectiveFrom: string;
  electricityPerKwh: number;
  waterPerPerson: number;
  waterPerM3: number;
  internet: number;
  sanitation: number;
  createdAt: string;
  createdBy: string;
}

export type RateInput = Omit<RateVersion, 'id' | 'workspaceId' | 'createdAt' | 'createdBy'>;

export interface MeterReading {
  id: string;
  workspaceId: string;
  roomId: string;
  roomCode: string;
  buildingName: string;
  /** yyyy-MM */
  period: string;
  electricOld: number;
  electricNew: number;
  waterOld: number;
  waterNew: number;
  recordedAt: string;
}

export interface MeterInput {
  roomId: string;
  period: string;
  electricOld: number;
  electricNew: number;
  waterOld: number;
  waterNew: number;
}

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'VOID';

export interface InvoiceLine {
  key: 'rent' | 'electricity' | 'water' | 'internet' | 'sanitation' | 'vehicle' | 'other';
  label: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  note?: string;
}

export interface InvoiceAdjustment {
  id: string;
  amount: number;
  reason: string;
  by: string;
  at: string;
}

export interface Invoice {
  id: string;
  workspaceId: string;
  code: string;
  contractId: string;
  contractCode: string;
  roomId: string;
  roomCode: string;
  buildingName: string;
  tenantId: string;
  tenantName: string;
  /** yyyy-MM */
  period: string;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  /** Snapshot các khoản phí tại thời điểm phát hành — không đổi theo bảng giá mới. */
  lines: InvoiceLine[];
  rateVersionId: string;
  rateEffectiveFrom: string;
  adjustments: InvoiceAdjustment[];
  total: number;
  /** Chỉ cộng các khoản thanh toán ĐÃ XÁC NHẬN (BR-05). */
  paidConfirmed: number;
}

export type PaymentMethod = 'CASH' | 'BANK_TRANSFER';
export type PaymentStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED';

export interface Payment {
  id: string;
  workspaceId: string;
  invoiceId: string;
  invoiceCode: string;
  roomCode: string;
  tenantName: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  proofUrl?: string;
  submittedBy: 'TENANT' | 'STAFF';
  submittedAt: string;
  confirmedAt?: string;
  confirmedBy?: string;
  note?: string;
}

export interface PaymentInput {
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  proofUrl?: string;
  note?: string;
}

export type DepositTxType = 'COLLECT' | 'REFUND' | 'DEDUCT';

export interface DepositTx {
  id: string;
  workspaceId: string;
  contractId: string;
  contractCode: string;
  roomCode: string;
  tenantName: string;
  type: DepositTxType;
  amount: number;
  date: string;
  note?: string;
}

export type DepositInput = Pick<DepositTx, 'contractId' | 'type' | 'amount' | 'date' | 'note'>;

/** Kết quả xem trước lập hóa đơn cho từng hợp đồng. */
export interface BillingPreviewItem {
  contractId: string;
  contractCode: string;
  roomCode: string;
  buildingName: string;
  tenantName: string;
  lines: InvoiceLine[];
  total: number;
  status: 'READY' | 'ALREADY_ISSUED' | 'MISSING_METER' | 'NO_RATE';
  message?: string;
}

export interface BillingRunResult {
  period: string;
  created: Array<{ contractCode: string; invoiceCode: string; total: number }>;
  skipped: Array<{ contractCode: string; reason: string }>;
}
