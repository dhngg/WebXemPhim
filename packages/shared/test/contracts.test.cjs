const assert = require('node:assert/strict');
const test = require('node:test');
const { API_PREFIX, AUTH_ERROR_CODES, PLATFORM_NAME, USER_STATUSES } = require('@rental/shared');

test('exports a relative API prefix without a leading slash', () => {
  assert.equal(API_PREFIX, 'api/v1');
  assert.equal(API_PREFIX.startsWith('/'), false);
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
