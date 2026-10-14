export type MaintenanceStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
export type MaintenancePriority = 'URGENT' | 'MEDIUM' | 'LOW';

export interface MaintenanceComment {
  id: string;
  author: string;
  role: 'TENANT' | 'STAFF';
  text: string;
  at: string;
}

export interface MaintenanceRequest {
  id: string;
  workspaceId: string;
  roomId: string;
  roomCode: string;
  buildingName: string;
  tenantName?: string;
  title: string;
  description: string;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  assignee?: string;
  images: string[];
  createdAt: string;
  updatedAt: string;
  comments: MaintenanceComment[];
}

export interface MaintenanceInput {
  roomId: string;
  title: string;
  description: string;
  priority: MaintenancePriority;
  images: string[];
}
