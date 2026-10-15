import { HttpStatus } from '@nestjs/common';
import {
  APPLICATION_ERROR_DEFINITIONS,
  ApplicationException,
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
    ['WORKSPACE_NOT_FOUND', HttpStatus.NOT_FOUND],
    ['WORKSPACE_ARCHIVED', HttpStatus.CONFLICT],
    ['WORKSPACE_OWNER_CONFLICT', HttpStatus.CONFLICT],
    ['WORKSPACE_MEMBER_NOT_FOUND', HttpStatus.NOT_FOUND],
    ['WORKSPACE_MEMBER_ALREADY_EXISTS', HttpStatus.CONFLICT],
    ['WORKSPACE_OWNER_PROTECTED', HttpStatus.CONFLICT],
    ['BUILDING_NOT_FOUND', HttpStatus.NOT_FOUND],
    ['BUILDING_ARCHIVED', HttpStatus.CONFLICT],
    ['ROOM_NOT_FOUND', HttpStatus.NOT_FOUND],
    ['ROOM_ARCHIVED', HttpStatus.CONFLICT],
    ['ROOM_HAS_ACTIVE_CONTRACT', HttpStatus.CONFLICT],
    ['ROOM_CODE_CONFLICT', HttpStatus.CONFLICT],
    ['AMENITY_NOT_FOUND', HttpStatus.NOT_FOUND],
    ['AMENITY_ALREADY_EXISTS', HttpStatus.CONFLICT],
  ] as const)('maps %s to HTTP %s', (code, status) => {
    const error = new ApplicationException(code);
    expect(error.getStatus()).toBe(status);
    expect(getApplicationError(error)).toEqual({
      code,
      definition: APPLICATION_ERROR_DEFINITIONS[code],
    });
  });

  it('does not map arbitrary errors as public application errors', () => {
    expect(getApplicationError(new Error('private detail'))).toBeUndefined();
  });
});
