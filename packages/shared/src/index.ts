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
