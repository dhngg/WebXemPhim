import { useQuery } from '@tanstack/react-query';
import { env } from '@/lib/env';
import { httpClient } from '@/services/http/httpClient';
import { reportsMock } from '@/mocks/handlers/workspaces.mock';

export interface ReportRow {
  period: string;
  /** Tổng phải thu (sau điều chỉnh). */
  expected: number;
  /** Doanh thu ĐÃ XÁC NHẬN — không gồm khoản chờ xác nhận, không gồm tiền cọc. */
  confirmed: number;
  outstanding: number;
  occupancyRate: number;
  depositsIn: number;
  depositsOut: number;
}

export interface WorkspaceReport {
  rows: ReportRow[];
  /** Tiền cọc đang giữ — theo dõi riêng, KHÔNG gộp doanh thu (BR-06). */
  depositHeld: number;
  totalRooms: number;
}

export interface ReportsApi {
  get(ws: string, from: string, to: string): Promise<WorkspaceReport>;
}

const reportsHttp: ReportsApi = {
  get: (ws, from, to) => httpClient.get(`/workspaces/${encodeURIComponent(ws)}/reports`, { query: { from, to } }),
};

export const reportsApi: ReportsApi = env.useMockApi ? reportsMock : reportsHttp;

export function useWorkspaceReport(ws: string, from: string, to: string) {
  return useQuery({ queryKey: ['workspaces', ws, 'reports', from, to], queryFn: () => reportsApi.get(ws, from, to) });
}
