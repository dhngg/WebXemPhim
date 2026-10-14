import type { GlobalRole } from '@/features/auth/types';
import type { WorkspaceStatus } from '@/features/workspaces/types';

export interface AdminUser {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  globalRole: GlobalRole;
  status: 'ACTIVE' | 'LOCKED';
  workspaceCount: number;
  createdAt: string;
  lastActiveAt: string;
}

export interface AdminWorkspace {
  id: string;
  name: string;
  ownerName: string;
  status: WorkspaceStatus;
  buildingCount: number;
  roomCount: number;
  plan: string;
  createdAt: string;
}

export type AdminListingStatus = 'ACTIVE' | 'REPORTED' | 'REMOVED';

export interface AdminListing {
  id: string;
  roomId: string;
  title: string;
  workspaceName: string;
  price: number;
  status: AdminListingStatus;
  reportCount: number;
  reportReason?: string;
  postedAt: string;
}

export interface AuditLog {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  category: 'AUTH' | 'USER' | 'WORKSPACE' | 'LISTING' | 'BILLING';
  ip?: string;
}

export interface AdminOverview {
  users: number;
  workspaces: number;
  activeListings: number;
  reportedListings: number;
  newUsers7d: number;
  signupsByDay: Array<{ date: string; count: number }>;
}
