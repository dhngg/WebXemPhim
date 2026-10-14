import { createAuthSecurityConfig } from './auth-security.config';

const secret = Buffer.alloc(32, 1).toString('base64');

const validInput = {
  issuer: 'rental-api-test',
  audience: 'rental-web-test',
  activeKid: 'current',
  encodedKeys: JSON.stringify({ current: secret }),
  argon2MemoryKiB: 19_456,
  argon2TimeCost: 2,
  argon2Parallelism: 1,
};

describe('Auth security configuration', () => {
  it('creates an immutable config with the approved constants', () => {
    const config = createAuthSecurityConfig(validInput);
    expect(config).toMatchObject({
      issuer: 'rental-api-test',
      audience: 'rental-web-test',
      activeKid: 'current',
      accessTokenTtlSeconds: 600,
      argon2: { memoryCost: 19_456, timeCost: 2, parallelism: 1 },
    });
    expect(config.keys.get('current')).toHaveLength(32);
    expect(Object.isFrozen(config)).toBe(true);
  });

  it.each([
    [{ ...validInput, issuer: undefined }, 'AUTH_JWT_ISSUER'],
    [{ ...validInput, activeKid: 'missing' }, 'AUTH_JWT_ACTIVE_KID'],
    [{ ...validInput, encodedKeys: 'not-json' }, 'AUTH_JWT_KEYS'],
    [
      {
        ...validInput,
        encodedKeys: JSON.stringify({ current: Buffer.alloc(31).toString('base64') }),
      },
      '256 bits',
    ],
    [
      { ...validInput, encodedKeys: JSON.stringify({ current: secret, previous: secret }) },
      'reuse secret material',
    ],
  ])('rejects invalid config without echoing secret: %s', (input, expected) => {
    expect(() => createAuthSecurityConfig(input)).toThrow(expected);
    try {
      createAuthSecurityConfig(input);
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });
});
