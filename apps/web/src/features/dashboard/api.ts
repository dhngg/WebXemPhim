import { useQuery } from '@tanstack/react-query';
import { env } from '@/lib/env';
import { httpClient } from '@/services/http/httpClient';
import { dashboardMock } from '@/mocks/handlers/workspaces.mock';
import type { WorkspaceDashboard } from './types';

export interface DashboardApi {
  get(workspaceId: string): Promise<WorkspaceDashboard>;
}

/** Endpoint DỰ KIẾN — backend có thể tách thành nhiều endpoint nhỏ; khi đó gộp tại adapter này. */
const dashboardHttp: DashboardApi = {
  get: (workspaceId) => httpClient.get(`/workspaces/${encodeURIComponent(workspaceId)}/dashboard`),
};

export const dashboardApi: DashboardApi = env.useMockApi ? dashboardMock : dashboardHttp;

export function useWorkspaceDashboard(workspaceId: string) {
  return useQuery({
    queryKey: ['workspaces', workspaceId, 'dashboard'],
    queryFn: () => dashboardApi.get(workspaceId),
  });
}
