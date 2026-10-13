import { validateEnvironment } from './environment';

const pooledUrl =
  'postgresql://neondb_owner:secret@ep-winter-math-azeayw91-pooler.c-3.ap-southeast-1.aws.neon.tech/Apartment?sslmode=require&channel_binding=require';
const directUrl =
  'postgresql://neondb_owner:secret@ep-winter-math-azeayw91.c-3.ap-southeast-1.aws.neon.tech/Apartment?sslmode=require&channel_binding=require';

describe('environment validation', () => {
  it('supports a scaffold without database credentials', () => {
    const environment = validateEnvironment({});
    expect(environment.DATABASE_ENABLED).toBe(false);
    expect(environment.PORT).toBe(3000);
    expect(environment.SWAGGER_ENABLED).toBe(true);
  });

  it('disables Swagger by default in production', () => {
    expect(validateEnvironment({ NODE_ENV: 'production' }).SWAGGER_ENABLED).toBe(false);
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
});
