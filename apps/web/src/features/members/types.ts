import type { WorkspaceRole, WorkspaceStatus } from '@/features/workspaces/types';

export interface Member {
  id: string;
  workspaceId: string;
  userId: string;
  fullName: string;
  email: string;
  role: WorkspaceRole;
  status: 'ACTIVE' | 'LOCKED';
  joinedAt: string;
}

export interface InviteMemberInput {
  email: string;
  role: Exclude<WorkspaceRole, 'OWNER'>;
}

export interface WorkspaceSettings {
  id: string;
  name: string;
  status: WorkspaceStatus;
  description: string;
  contactName: string;
  contactPhone: string;
  address: string;
  bankAccount: string;
  bankName: string;
  invoiceDueDay: number;
}

export type WorkspaceSettingsInput = Omit<WorkspaceSettings, 'id' | 'status'>;
