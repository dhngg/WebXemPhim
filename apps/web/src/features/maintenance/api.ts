import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { env } from '@/lib/env';
import { httpClient } from '@/services/http/httpClient';
import { maintenanceMock } from '@/mocks/handlers/maintenance.mock';
import type { BadgeTone } from '@/components/ui';
import type { MaintenanceInput, MaintenancePriority, MaintenanceRequest, MaintenanceStatus } from './types';

export interface MaintenanceFilters {
  status?: MaintenanceStatus;
  priority?: MaintenancePriority;
  q?: string;
}

export interface MaintenanceApi {
  list(ws: string, f: MaintenanceFilters): Promise<MaintenanceRequest[]>;
  get(ws: string, id: string): Promise<MaintenanceRequest>;
  create(ws: string, input: MaintenanceInput): Promise<MaintenanceRequest>;
  update(ws: string, id: string, patch: { status?: MaintenanceStatus; assignee?: string }): Promise<MaintenanceRequest>;
  comment(ws: string, id: string, text: string): Promise<MaintenanceRequest>;
}

const p = (ws: string) => `/workspaces/${encodeURIComponent(ws)}/maintenance`;

const maintenanceHttp: MaintenanceApi = {
  list: (ws, f) => httpClient.get(p(ws), { query: { ...f } }),
  get: (ws, id) => httpClient.get(`${p(ws)}/${id}`),
  create: (ws, input) => httpClient.post(p(ws), input),
  update: (ws, id, patch) => httpClient.patch(`${p(ws)}/${id}`, patch),
  comment: (ws, id, text) => httpClient.post(`${p(ws)}/${id}/comments`, { text }),
};

export const maintenanceApi: MaintenanceApi = env.useMockApi ? maintenanceMock : maintenanceHttp;

export const MAINTENANCE_STATUS: Record<MaintenanceStatus, { label: string; tone: BadgeTone }> = {
  OPEN: { label: 'Mới tiếp nhận', tone: 'warning' },
  IN_PROGRESS: { label: 'Đang xử lý', tone: 'primary' },
  RESOLVED: { label: 'Đã xử lý', tone: 'success' },
};

export const MAINTENANCE_PRIORITY: Record<MaintenancePriority, { label: string; tone: BadgeTone }> = {
  URGENT: { label: 'Gấp', tone: 'danger' },
  MEDIUM: { label: 'Trung bình', tone: 'warning' },
  LOW: { label: 'Thấp', tone: 'neutral' },
};

const k = (ws: string) => ['workspaces', ws, 'maintenance'] as const;

export function useMaintenanceList(ws: string, f: MaintenanceFilters = {}) {
  return useQuery({ queryKey: [...k(ws), f], queryFn: () => maintenanceApi.list(ws, f) });
}
export function useMaintenance(ws: string, id: string | undefined) {
  return useQuery({ queryKey: [...k(ws), 'detail', id], queryFn: () => maintenanceApi.get(ws, id!), enabled: Boolean(id) });
}
export function useUpdateMaintenance(ws: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; status?: MaintenanceStatus; assignee?: string }) =>
      maintenanceApi.update(ws, v.id, { status: v.status, assignee: v.assignee }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspaces', ws] }),
  });
}
export function useCommentMaintenance(ws: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; text: string }) => maintenanceApi.comment(ws, v.id, v.text),
    onSuccess: () => qc.invalidateQueries({ queryKey: k(ws) }),
  });
}
