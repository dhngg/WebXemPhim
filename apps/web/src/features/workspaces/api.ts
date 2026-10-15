import type { WorkspaceResponse } from '@rental/shared';
import { env } from '@/lib/env';
import { httpClient } from '@/services/http/httpClient';
import { workspacesMock } from '@/mocks/handlers/workspaces.mock';
import type { WorkspaceMembership } from './types';

export interface WorkspacesApi {
  listMine(): Promise<WorkspaceMembership[]>;
  /** `POST /workspaces { name }`: người tạo trở thành OWNER. Backend kiểm tra đơn duyệt và giới hạn. */
  create(name: string): Promise<WorkspaceMembership>;
  /** `PATCH /workspaces/:id/archive`: chỉ OWNER; giữ nguyên dữ liệu và thành viên, workspace chuyển sang chỉ xem. Không có xóa. */
  archive(workspaceId: string): Promise<WorkspaceMembership>;
  /** `PATCH /workspaces/:id/restore`: chỉ OWNER; 409 WORKSPACE_ACTIVE_LIMIT_REACHED nếu đã có workspace ACTIVE khác. */
  restore(workspaceId: string): Promise<WorkspaceMembership>;
}

/** Workspace backend → kiểu giao diện hiện có (backend chưa trả quy mô/gói dịch vụ). */
export function toMembershipFromWorkspace(w: WorkspaceResponse): WorkspaceMembership {
  return { workspaceId: w.id, name: w.name, status: w.status, role: w.currentMembership.role };
}

export const workspacesHttp: WorkspacesApi = {
  listMine: async () => (await httpClient.get<WorkspaceResponse[]>('/workspaces')).map(toMembershipFromWorkspace),
  create: async (name) => toMembershipFromWorkspace(await httpClient.post<WorkspaceResponse>('/workspaces', { name })),
  archive: async (id) => toMembershipFromWorkspace(await httpClient.patch<WorkspaceResponse>(`/workspaces/${encodeURIComponent(id)}/archive`)),
  restore: async (id) => toMembershipFromWorkspace(await httpClient.patch<WorkspaceResponse>(`/workspaces/${encodeURIComponent(id)}/restore`)),
};

export const workspacesApi: WorkspacesApi = env.useMockApi ? workspacesMock : workspacesHttp;
