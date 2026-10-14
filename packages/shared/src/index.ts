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
