import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { env } from '@/lib/env';
import { httpClient } from '@/services/http/httpClient';
import { membersMock } from '@/mocks/handlers/members.mock';
import type { WorkspaceRole } from '@/features/workspaces/types';
import type { InviteMemberInput, Member, WorkspaceSettings, WorkspaceSettingsInput } from './types';

export interface MembersApi {
  list(ws: string): Promise<Member[]>;
  invite(ws: string, input: InviteMemberInput): Promise<Member>;
  updateRole(ws: string, id: string, role: Exclude<WorkspaceRole, 'OWNER'>): Promise<Member>;
  setLocked(ws: string, id: string, locked: boolean): Promise<Member>;
  remove(ws: string, id: string): Promise<void>;
  getSettings(ws: string): Promise<WorkspaceSettings>;
  updateSettings(ws: string, input: WorkspaceSettingsInput): Promise<WorkspaceSettings>;
}

const p = (ws: string) => `/workspaces/${encodeURIComponent(ws)}`;

const membersHttp: MembersApi = {
  list: (ws) => httpClient.get(`${p(ws)}/members`),
  invite: (ws, input) => httpClient.post(`${p(ws)}/members`, input),
  updateRole: (ws, id, role) => httpClient.patch(`${p(ws)}/members/${id}`, { role }),
  setLocked: (ws, id, locked) => httpClient.patch(`${p(ws)}/members/${id}`, { status: locked ? 'LOCKED' : 'ACTIVE' }),
  remove: (ws, id) => httpClient.delete(`${p(ws)}/members/${id}`),
  getSettings: (ws) => httpClient.get(`${p(ws)}/settings`),
  updateSettings: (ws, input) => httpClient.patch(`${p(ws)}/settings`, input),
};

export const membersApi: MembersApi = env.useMockApi ? membersMock : membersHttp;

const k = (ws: string) => ['workspaces', ws] as const;

export function useMembers(ws: string) {
  return useQuery({ queryKey: [...k(ws), 'members'], queryFn: () => membersApi.list(ws) });
}
export function useMemberMutations(ws: string) {
  const qc = useQueryClient();
  const onSuccess = () => qc.invalidateQueries({ queryKey: [...k(ws), 'members'] });
  return {
    invite: useMutation({ mutationFn: (input: InviteMemberInput) => membersApi.invite(ws, input), onSuccess }),
    updateRole: useMutation({
      mutationFn: (v: { id: string; role: Exclude<WorkspaceRole, 'OWNER'> }) => membersApi.updateRole(ws, v.id, v.role),
      onSuccess,
    }),
    setLocked: useMutation({ mutationFn: (v: { id: string; locked: boolean }) => membersApi.setLocked(ws, v.id, v.locked), onSuccess }),
    remove: useMutation({ mutationFn: (id: string) => membersApi.remove(ws, id), onSuccess }),
  };
}

export function useWorkspaceSettings(ws: string) {
  return useQuery({ queryKey: [...k(ws), 'settings'], queryFn: () => membersApi.getSettings(ws) });
}
export function useUpdateWorkspaceSettings(ws: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: WorkspaceSettingsInput) => membersApi.updateSettings(ws, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: k(ws) });
      qc.invalidateQueries({ queryKey: ['workspaces', 'mine'] });
    },
  });
}
