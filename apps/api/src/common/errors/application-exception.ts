import { HttpException, HttpStatus } from '@nestjs/common';
import type { AuthErrorCode } from '@rental/shared';

export interface ApplicationErrorDefinition {
  status: HttpStatus;
  message: string;
}

export const AUTH_ERROR_DEFINITIONS: Readonly<Record<AuthErrorCode, ApplicationErrorDefinition>> = {
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
};

export class ApplicationException extends HttpException {
  constructor(readonly code: AuthErrorCode) {
    const definition = AUTH_ERROR_DEFINITIONS[code];
    super(definition.message, definition.status);
  }
}

export function getApplicationError(
  exception: unknown,
): { code: AuthErrorCode; definition: ApplicationErrorDefinition } | undefined {
  if (!(exception instanceof ApplicationException)) return undefined;
  return { code: exception.code, definition: AUTH_ERROR_DEFINITIONS[exception.code] };
}
