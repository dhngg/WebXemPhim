const assert = require('node:assert/strict');
const test = require('node:test');
const { API_PREFIX, PLATFORM_NAME } = require('@rental/shared');

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
