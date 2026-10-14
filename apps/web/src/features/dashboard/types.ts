export interface DashboardKpis {
  totalRooms: number;
  buildingCount: number;
  occupiedRooms: number;
  occupancyChangePct: number;
  vacantRooms: number;
  /** Dự kiến thu kỳ hiện tại (tiền phòng + điện nước + dịch vụ). */
  expectedRevenue: number;
  /** Chỉ gồm khoản thanh toán ĐÃ được chủ trọ xác nhận. */
  confirmedRevenue: number;
  outstandingDebt: number;
  unpaidRoomCount: number;
  period: string;
}

export interface RevenuePoint {
  /** yyyy-MM */
  period: string;
  label: string;
  expected: number;
  confirmed: number;
  isCurrent?: boolean;
}

export interface ServiceSlice {
  key: 'electricity' | 'water' | 'internet' | 'sanitation';
  label: string;
  unitNote?: string;
  amount: number;
}

export type DueInvoiceStatus = 'OVERDUE' | 'AWAITING_TRANSFER';

export interface DueInvoice {
  id: string;
  roomCode: string;
  buildingName: string;
  contractCode: string;
  tenantName: string;
  tenantPhone: string;
  amountDue: number;
  dueDate: string;
  status: DueInvoiceStatus;
  overdueDays?: number;
}

export interface UpcomingViewing {
  id: string;
  visitorName: string;
  visitorPhone: string;
  roomCode: string;
  buildingName: string;
  timeLabel: string;
  status: 'PENDING' | 'CONFIRMED';
}

export interface MaintenanceItem {
  id: string;
  title: string;
  roomCode: string;
  tenantName: string;
  priority: 'URGENT' | 'MEDIUM' | 'LOW';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  note: string;
}

export interface OccupancyCell {
  roomId: string;
  code: string;
  buildingName: string;
  occupied: boolean;
}

export interface WorkspaceDashboard {
  workspaceName: string;
  description: string;
  syncedAt: string;
  kpis: DashboardKpis;
  revenue: RevenuePoint[];
  services: ServiceSlice[];
  dueInvoices: DueInvoice[];
  dueInvoiceTotalCount: number;
  viewings: UpcomingViewing[];
  maintenance: MaintenanceItem[];
  occupancy: OccupancyCell[];
}
