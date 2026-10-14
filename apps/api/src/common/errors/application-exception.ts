import { HttpException, HttpStatus } from '@nestjs/common';
import type { ApplicationErrorCode } from '@rental/shared';

export interface ApplicationErrorDefinition {
  status: HttpStatus;
  message: string;
}

export const APPLICATION_ERROR_DEFINITIONS: Readonly<
  Record<ApplicationErrorCode, ApplicationErrorDefinition>
> = {
  VALIDATION_ERROR: { status: HttpStatus.BAD_REQUEST, message: 'Validation failed' },
  EMAIL_ALREADY_EXISTS: { status: HttpStatus.CONFLICT, message: 'Email already exists' },
  INVALID_CREDENTIALS: { status: HttpStatus.UNAUTHORIZED, message: 'Invalid credentials' },
  ACCESS_TOKEN_EXPIRED: { status: HttpStatus.UNAUTHORIZED, message: 'Access token expired' },
  REFRESH_TOKEN_INVALID: { status: HttpStatus.UNAUTHORIZED, message: 'Refresh token invalid' },
  TOKEN_ALREADY_ROTATED: {
    status: HttpStatus.CONFLICT,
    message: 'Refresh token was already rotated',
  },
  TOKEN_REUSE_DETECTED: {
    status: HttpStatus.UNAUTHORIZED,
    message: 'Refresh token reuse detected',
  },
  ACCOUNT_DISABLED: { status: HttpStatus.FORBIDDEN, message: 'Account disabled' },
  UNAUTHORIZED: { status: HttpStatus.UNAUTHORIZED, message: 'Unauthorized' },
  RATE_LIMITED: { status: HttpStatus.TOO_MANY_REQUESTS, message: 'Too many requests' },
  AUTH_NOT_IMPLEMENTED: {
    status: HttpStatus.NOT_IMPLEMENTED,
    message: 'Authentication operation is not implemented',
  },
  AUTH_DISABLED: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    message: 'Authentication is unavailable',
  },
  CSRF_VALIDATION_FAILED: {
    status: HttpStatus.FORBIDDEN,
    message: 'Request origin validation failed',
  },
  WORKSPACE_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Workspace not found' },
  WORKSPACE_ARCHIVED: { status: HttpStatus.CONFLICT, message: 'Workspace is archived' },
  WORKSPACE_OWNER_CONFLICT: {
    status: HttpStatus.CONFLICT,
    message: 'Workspace owner could not be changed',
  },
  WORKSPACE_MEMBER_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Workspace member not found',
  },
  WORKSPACE_MEMBER_ALREADY_EXISTS: {
    status: HttpStatus.CONFLICT,
    message: 'Workspace membership already exists',
  },
  WORKSPACE_OWNER_PROTECTED: {
    status: HttpStatus.CONFLICT,
    message: 'Workspace owner must be changed through ownership transfer',
  },
};

export class ApplicationException extends HttpException {
  constructor(readonly code: ApplicationErrorCode) {
    const definition = APPLICATION_ERROR_DEFINITIONS[code];
    super(definition.message, definition.status);
  }
}

export function getApplicationError(
  exception: unknown,
): { code: ApplicationErrorCode; definition: ApplicationErrorDefinition } | undefined {
  if (!(exception instanceof ApplicationException)) return undefined;
  return { code: exception.code, definition: APPLICATION_ERROR_DEFINITIONS[exception.code] };
}
