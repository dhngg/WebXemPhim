import { HttpStatus } from '@nestjs/common';
import {
  ApplicationException,
  AUTH_ERROR_DEFINITIONS,
  getApplicationError,
} from './application-exception';

describe('application error mapping', () => {
  it.each([
    ['EMAIL_ALREADY_EXISTS', HttpStatus.CONFLICT],
    ['INVALID_CREDENTIALS', HttpStatus.UNAUTHORIZED],
    ['ACCESS_TOKEN_EXPIRED', HttpStatus.UNAUTHORIZED],
    ['REFRESH_TOKEN_INVALID', HttpStatus.UNAUTHORIZED],
    ['TOKEN_ALREADY_ROTATED', HttpStatus.CONFLICT],
    ['TOKEN_REUSE_DETECTED', HttpStatus.UNAUTHORIZED],
    ['ACCOUNT_DISABLED', HttpStatus.FORBIDDEN],
    ['UNAUTHORIZED', HttpStatus.UNAUTHORIZED],
    ['RATE_LIMITED', HttpStatus.TOO_MANY_REQUESTS],
    ['AUTH_DISABLED', HttpStatus.SERVICE_UNAVAILABLE],
    ['CSRF_VALIDATION_FAILED', HttpStatus.FORBIDDEN],
  ] as const)('maps %s to HTTP %s', (code, status) => {
    const error = new ApplicationException(code);
    expect(error.getStatus()).toBe(status);
    expect(getApplicationError(error)).toEqual({ code, definition: AUTH_ERROR_DEFINITIONS[code] });
  });

  it('does not map arbitrary errors as public application errors', () => {
    expect(getApplicationError(new Error('private detail'))).toBeUndefined();
  });
});
