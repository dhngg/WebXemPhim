export const API_PREFIX = 'api/v1';
export const PLATFORM_NAME = 'Rental Platform';

export type DatabaseState = 'disabled' | 'up' | 'down';

export interface HealthResponse {
  status: 'ok';
  service: 'rental-api';
  timestamp: string;
}

export interface ReadinessResponse {
  status: 'ok';
  database: Exclude<DatabaseState, 'down'>;
}

export interface ApiErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  errors?: string[];
  path: string;
  timestamp: string;
  requestId: string;
}

export const USER_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const AUTH_ERROR_CODES = [
  'VALIDATION_ERROR',
  'EMAIL_ALREADY_EXISTS',
  'INVALID_CREDENTIALS',
  'ACCESS_TOKEN_EXPIRED',
  'REFRESH_TOKEN_INVALID',
  'TOKEN_ALREADY_ROTATED',
  'TOKEN_REUSE_DETECTED',
  'ACCOUNT_DISABLED',
  'UNAUTHORIZED',
  'RATE_LIMITED',
  'AUTH_NOT_IMPLEMENTED',
  'AUTH_DISABLED',
  'CSRF_VALIDATION_FAILED',
] as const;
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export const WORKSPACE_ROLES = ['OWNER', 'MANAGER', 'STAFF'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const WORKSPACE_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type WorkspaceStatus = (typeof WORKSPACE_STATUSES)[number];

export const WORKSPACE_ERROR_CODES = [
  'WORKSPACE_NOT_FOUND',
  'WORKSPACE_ARCHIVED',
  'WORKSPACE_OWNER_CONFLICT',
  'WORKSPACE_MEMBER_NOT_FOUND',
  'WORKSPACE_MEMBER_ALREADY_EXISTS',
  'WORKSPACE_OWNER_PROTECTED',
] as const;
export type WorkspaceErrorCode = (typeof WORKSPACE_ERROR_CODES)[number];

export const APPLICATION_ERROR_CODES = [...AUTH_ERROR_CODES, ...WORKSPACE_ERROR_CODES] as const;
export type ApplicationErrorCode = (typeof APPLICATION_ERROR_CODES)[number];

export interface RegisterRequest {
  email: string;
  password: string;
  displayName?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthUserResponse {
  id: string;
  email: string;
  displayName: string | null;
  status: UserStatus;
  createdAt: string;
}

export interface AuthTokenResponse {
  accessToken: string;
  expiresIn: 600;
  user: AuthUserResponse;
}

export interface CreateWorkspaceRequest {
  name: string;
}

export const MANAGEABLE_WORKSPACE_ROLES = ['MANAGER', 'STAFF'] as const;
export type ManageableWorkspaceRole = (typeof MANAGEABLE_WORKSPACE_ROLES)[number];

export interface AddWorkspaceMemberRequest {
  email: string;
  role: ManageableWorkspaceRole;
}

export interface UpdateWorkspaceMemberRequest {
  role: ManageableWorkspaceRole;
}

export interface TransferWorkspaceOwnershipRequest {
  targetMembershipId: string;
}

export interface WorkspaceMemberResponse {
  id: string;
  role: WorkspaceRole;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    displayName: string | null;
  };
}

export interface WorkspaceResponse {
  id: string;
  name: string;
  status: WorkspaceStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  currentMembership: {
    role: WorkspaceRole;
  };
}
