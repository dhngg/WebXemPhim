import { env } from '@/lib/env';
import { httpClient } from '@/services/http/httpClient';
import { workspacesMock } from '@/mocks/handlers/workspaces.mock';
import type { WorkspaceMembership } from './types';

export interface WorkspacesApi {
  listMine(): Promise<WorkspaceMembership[]>;
}

const workspacesHttp: WorkspacesApi = {
  listMine: () => httpClient.get('/workspaces/me'),
};

export const workspacesApi: WorkspacesApi = env.useMockApi ? workspacesMock : workspacesHttp;
