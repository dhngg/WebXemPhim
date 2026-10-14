import { validateEnvironment } from './environment';

const pooledUrl =
  'postgresql://neondb_owner:secret@ep-winter-math-azeayw91-pooler.c-3.ap-southeast-1.aws.neon.tech/Apartment?sslmode=require&channel_binding=require';
const directUrl =
  'postgresql://neondb_owner:secret@ep-winter-math-azeayw91.c-3.ap-southeast-1.aws.neon.tech/Apartment?sslmode=require&channel_binding=require';
const authKeys = JSON.stringify({ current: Buffer.alloc(32, 7).toString('base64') });
const authEnvironment = {
  AUTH_ENABLED: 'true',
  AUTH_JWT_ISSUER: 'rental-api-test',
  AUTH_JWT_AUDIENCE: 'rental-web-test',
  AUTH_JWT_ACTIVE_KID: 'current',
  AUTH_JWT_KEYS: authKeys,
  AUTH_REFRESH_COOKIE_NAME: 'rental_refresh',
  DATABASE_ENABLED: 'true',
  DATABASE_ENVIRONMENT: 'development',
  DATABASE_URL: pooledUrl,
};

describe('environment validation', () => {
  it('defaults to untrusted proxies and bounded process-local Auth quotas', () => {
    const environment = validateEnvironment({});
    expect(environment.TRUSTED_PROXY_CIDRS).toEqual([]);
    expect(environment.AUTH_RATE_LIMIT_REGISTER_IP_MAX).toBe(5);
    expect(environment.AUTH_RATE_LIMIT_LOGIN_EMAIL_MAX).toBe(10);
    expect(environment.AUTH_RATE_LIMIT_REFRESH_FAMILY_MAX).toBe(30);
  });

  it.each([
    'true',
    '1',
    '*',
    '0.0.0.0/0',
    '::/0',
    '10.0.0.1/33',
    '::1/129',
    'localhost',
    '10.0.0.1,,::1',
  ])('rejects unsafe or invalid proxy configuration %s', (TRUSTED_PROXY_CIDRS) => {
    expect(() => validateEnvironment({ TRUSTED_PROXY_CIDRS })).toThrow('TRUSTED_PROXY_CIDRS');
  });

  it('accepts only explicit proxy IPs and CIDRs', () => {
    expect(
      validateEnvironment({ TRUSTED_PROXY_CIDRS: '10.0.0.1, 192.0.2.0/24, ::1/128' })
        .TRUSTED_PROXY_CIDRS,
    ).toEqual(['10.0.0.1', '192.0.2.0/24', '::1/128']);
  });

  it.each(['0', '-1', 'NaN', '1.5', '', 'Infinity'])(
    'fails fast for invalid rate limit %s',
    (value) => {
      expect(() => validateEnvironment({ AUTH_RATE_LIMIT_LOGIN_EMAIL_MAX: value })).toThrow(
        'AUTH_RATE_LIMIT_LOGIN_EMAIL_MAX',
      );
      expect(() => validateEnvironment({ AUTH_RATE_LIMIT_REFRESH_WINDOW_SECONDS: value })).toThrow(
        'AUTH_RATE_LIMIT_REFRESH_WINDOW_SECONDS',
      );
      expect(() => validateEnvironment({ AUTH_RATE_LIMIT_MAX_KEYS: value })).toThrow(
        'AUTH_RATE_LIMIT_MAX_KEYS',
      );
    },
  );
  it('supports a scaffold without database credentials', () => {
    const environment = validateEnvironment({});
    expect(environment.DATABASE_ENABLED).toBe(false);
    expect(environment.PORT).toBe(3000);
    expect(environment.SWAGGER_ENABLED).toBe(true);
  });

  it('disables Swagger by default in production', () => {
    expect(
      validateEnvironment({
        ...authEnvironment,
        NODE_ENV: 'production',
        DATABASE_ENVIRONMENT: 'production',
        CORS_ORIGINS: 'https://app.example.com',
        AUTH_REFRESH_COOKIE_NAME: '__Host-rental_refresh',
      }).SWAGGER_ENABLED,
    ).toBe(false);
  });

  it.each(['abc', '0', '65536'])('rejects invalid PORT=%s', (PORT) => {
    expect(() => validateEnvironment({ PORT })).toThrow('PORT');
  });

  it('rejects ambiguous boolean values', () => {
    expect(() => validateEnvironment({ DATABASE_ENABLED: 'yes' })).toThrow('DATABASE_ENABLED');
  });

  it('requires a URL when database connectivity is enabled', () => {
    expect(() => validateEnvironment({ DATABASE_ENABLED: 'true' })).toThrow('DATABASE_URL');
  });

  it('accepts the approved pooled and direct Neon endpoints', () => {
    const environment = validateEnvironment({
      DATABASE_ENABLED: 'true',
      DATABASE_ENVIRONMENT: 'development',
      DATABASE_URL: pooledUrl,
      DIRECT_URL: directUrl,
    });

    expect(environment.DATABASE_URL).toBe(pooledUrl);
    expect(environment.DIRECT_URL).toBe(directUrl);
  });

  it('rejects unsafe CORS origins', () => {
    expect(() => validateEnvironment({ CORS_ORIGINS: '*' })).toThrow('CORS_ORIGINS');
    expect(() => validateEnvironment({ CORS_ORIGINS: 'https://example.com/path' })).toThrow(
      'CORS_ORIGINS',
    );
  });

  it('requires TLS and channel binding for Neon', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL:
          'postgresql://neondb_owner:secret@ep-winter-math-azeayw91-pooler.c-3.ap-southeast-1.aws.neon.tech/Apartment?sslmode=require',
      }),
    ).toThrow('channel_binding=require');
  });

  it('rejects a production database in a development process', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_ENABLED: 'true',
        DATABASE_ENVIRONMENT: 'production',
        DATABASE_URL: pooledUrl,
      }),
    ).toThrow('non-production');
  });

  it('rejects unapproved database hosts without exposing credentials', () => {
    const value =
      'postgresql://neondb_owner:private-password@other.example.com/Apartment?sslmode=require&channel_binding=require';
    expect(() => validateEnvironment({ DATABASE_URL: value })).toThrow('approved pooled Neon host');

    try {
      validateEnvironment({ DATABASE_URL: value });
    } catch (error) {
      expect(String(error)).not.toContain('private-password');
    }
  });

  it('never exposes invalid connection input in validation errors', () => {
    const value = 'invalid-private-value';
    try {
      validateEnvironment({ DATABASE_URL: value });
      throw new Error('Expected validation failure');
    } catch (error) {
      expect(String(error)).toContain('DATABASE_URL');
      expect(String(error)).not.toContain(value);
    }
  });

  it('builds Auth security config only when explicitly enabled', () => {
    const environment = validateEnvironment(authEnvironment);
    expect(environment.AUTH_SECURITY).toMatchObject({
      issuer: 'rental-api-test',
      audience: 'rental-web-test',
      activeKid: 'current',
      accessTokenTtlSeconds: 600,
    });
    expect(environment.AUTH_SECURITY?.keys.get('current')).toHaveLength(32);
    expect('AUTH_JWT_KEYS' in environment).toBe(false);
  });

  it('fails fast for missing or silently disabled Auth signing configuration', () => {
    expect(() =>
      validateEnvironment({
        AUTH_ENABLED: 'true',
        DATABASE_ENABLED: 'true',
        DATABASE_URL: pooledUrl,
        AUTH_REFRESH_COOKIE_NAME: 'rental_refresh',
      }),
    ).toThrow('AUTH_JWT_ISSUER');
    expect(() => validateEnvironment({ AUTH_JWT_KEYS: authKeys })).toThrow('AUTH_ENABLED');
  });

  it('fails closed when Auth is disabled or cookie/origin policy is unsafe in production', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'production' })).toThrow(
      'AUTH_ENABLED must be true',
    );
    expect(() =>
      validateEnvironment({
        ...authEnvironment,
        NODE_ENV: 'production',
        DATABASE_ENVIRONMENT: 'production',
        AUTH_REFRESH_COOKIE_NAME: 'unsafe_name',
      }),
    ).toThrow('HTTPS');
    expect(() =>
      validateEnvironment({
        ...authEnvironment,
        NODE_ENV: 'production',
        DATABASE_ENVIRONMENT: 'production',
        CORS_ORIGINS: 'https://app.example.com',
        AUTH_REFRESH_COOKIE_NAME: 'unsafe_name',
      }),
    ).toThrow('__Host-');
  });
});
