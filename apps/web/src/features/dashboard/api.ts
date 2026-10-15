import { useQuery } from '@tanstack/react-query';
import type { DashboardResponse } from '@rental/shared';
import { env } from '@/lib/env';
import { httpClient } from '@/services/http/httpClient';
import { dashboardMock } from '@/mocks/handlers/dashboard.mock';

export interface DashboardQuery {
  buildingId?: string;
  /** YYYY-MM; bỏ trống = tháng hiện tại (backend, giờ Việt Nam). */
  period?: string;
}

/** 1 endpoint OWNER: toàn bộ số liệu tổng hợp do backend tính; FE chỉ hiển thị, không tự cộng hay suy ra KPI. */
export interface DashboardApi {
  get(workspaceId: string, query: DashboardQuery): Promise<DashboardResponse>;
}

export const dashboardHttp: DashboardApi = {
  get: (workspaceId, q) => httpClient.get(`/workspaces/${encodeURIComponent(workspaceId)}/dashboard`, { query: { buildingId: q.buildingId, period: q.period } }),
};

export const dashboardApi: DashboardApi = env.useMockApi ? dashboardMock : dashboardHttp;

export function useWorkspaceDashboard(workspaceId: string, query: DashboardQuery) {
  return useQuery({
    queryKey: ['workspaces', workspaceId, 'dashboard', query],
    queryFn: () => dashboardApi.get(workspaceId, query),
  });
}
