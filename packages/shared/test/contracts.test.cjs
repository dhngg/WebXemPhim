const assert = require('node:assert/strict');
const test = require('node:test');
const {
  API_PREFIX,
  APPLICATION_ERROR_CODES,
  AUTH_ERROR_CODES,
  MANAGEABLE_WORKSPACE_ROLES,
  PLATFORM_NAME,
  USER_STATUSES,
  WORKSPACE_ERROR_CODES,
  WORKSPACE_ROLES,
  WORKSPACE_STATUSES,
} = require('@rental/shared');

test('exports a relative API prefix without a leading slash', () => {
  assert.equal(API_PREFIX, 'api/v1');
  assert.equal(API_PREFIX.startsWith('/'), false);
});

test('exports stable workspace roles, statuses and errors', () => {
  assert.deepEqual(WORKSPACE_ROLES, ['OWNER', 'MANAGER', 'STAFF']);
  assert.deepEqual(WORKSPACE_STATUSES, ['ACTIVE', 'ARCHIVED']);
  assert.equal(WORKSPACE_ERROR_CODES.includes('WORKSPACE_NOT_FOUND'), true);
  assert.equal(WORKSPACE_ERROR_CODES.includes('WORKSPACE_OWNER_CONFLICT'), true);
  assert.equal(WORKSPACE_ERROR_CODES.includes('WORKSPACE_MEMBER_NOT_FOUND'), true);
  assert.equal(WORKSPACE_ERROR_CODES.includes('WORKSPACE_MEMBER_ALREADY_EXISTS'), true);
  assert.equal(WORKSPACE_ERROR_CODES.includes('WORKSPACE_OWNER_PROTECTED'), true);
  assert.equal(APPLICATION_ERROR_CODES.includes('WORKSPACE_ARCHIVED'), true);
  assert.deepEqual(MANAGEABLE_WORKSPACE_ROLES, ['MANAGER', 'STAFF']);
});

test('exports the shared product name', () => {
  assert.equal(PLATFORM_NAME, 'Rental Platform');
});

test('provides matching named exports for ESM consumers', async () => {
  const esm = await import('@rental/shared');
  assert.equal(esm.API_PREFIX, API_PREFIX);
  assert.equal(esm.PLATFORM_NAME, PLATFORM_NAME);
});

test('exports stable Auth status and error code values', () => {
  assert.deepEqual(USER_STATUSES, ['ACTIVE', 'DISABLED']);
  assert.equal(AUTH_ERROR_CODES.includes('INVALID_CREDENTIALS'), true);
  assert.equal(AUTH_ERROR_CODES.includes('TOKEN_REUSE_DETECTED'), true);
  assert.equal(AUTH_ERROR_CODES.includes('AUTH_NOT_IMPLEMENTED'), true);
  assert.equal(AUTH_ERROR_CODES.includes('TOKEN_ALREADY_ROTATED'), true);
  assert.equal(AUTH_ERROR_CODES.includes('AUTH_DISABLED'), true);
  assert.equal(AUTH_ERROR_CODES.includes('CSRF_VALIDATION_FAILED'), true);
});
