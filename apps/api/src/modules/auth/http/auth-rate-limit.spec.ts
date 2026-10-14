import { canonicalIp, InMemoryAuthRateLimiter } from './auth-rate-limit';

describe('process-local Auth limiter', () => {
  afterEach(() => jest.restoreAllMocks());

  it('allows exactly the quota and resets at the boundary without extending on denials', () => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(100_000);
    const limiter = new InMemoryAuthRateLimiter(100);
    expect(limiter.consume('login:ip', '192.0.2.1', 2, 10)).toBe(0);
    expect(limiter.consume('login:ip', '192.0.2.1', 2, 10)).toBe(0);
    expect(limiter.consume('login:ip', '192.0.2.1', 2, 10)).toBe(10);
    clock.mockReturnValue(109_001);
    expect(limiter.consume('login:ip', '192.0.2.1', 2, 10)).toBe(1);
    clock.mockReturnValue(110_000);
    expect(limiter.consume('login:ip', '192.0.2.1', 2, 10)).toBe(0);
  });

  it('separates IPs, accounts and endpoint scopes', () => {
    const limiter = new InMemoryAuthRateLimiter(100);
    expect(limiter.consume('login:ip', '192.0.2.1', 1, 10)).toBe(0);
    expect(limiter.consume('login:ip', '192.0.2.2', 1, 10)).toBe(0);
    expect(limiter.consume('register:ip', '192.0.2.1', 1, 10)).toBe(0);
    expect(limiter.consume('login:email', 'one@example.com', 1, 10)).toBe(0);
    expect(limiter.consume('login:email', 'two@example.com', 1, 10)).toBe(0);
    expect(limiter.consume('login:email', 'one@example.com', 1, 10)).toBeGreaterThan(0);
  });

  it('bounds memory, denies new identities at capacity and reclaims expired keys', () => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(100_000);
    const limiter = new InMemoryAuthRateLimiter(1);
    expect(limiter.consume('login:ip', '192.0.2.1', 2, 10)).toBe(0);
    expect(limiter.consume('login:ip', '192.0.2.2', 2, 10)).toBe(10);
    expect(limiter.consume('login:ip', '192.0.2.1', 2, 10)).toBe(0);
    clock.mockReturnValue(110_000);
    expect(limiter.consume('login:ip', '192.0.2.2', 2, 10)).toBe(0);
  });

  it('canonicalizes mapped IPv4 and groups IPv6 host rotation into a /64', () => {
    expect(canonicalIp('::ffff:c000:201')).toBe(canonicalIp('192.0.2.1'));
    expect(canonicalIp('2001:db8:1:2::1')).toBe(canonicalIp('2001:0db8:0001:0002:ffff::9'));
    expect(canonicalIp('2001:db8:1:3::1')).not.toBe(canonicalIp('2001:db8:1:2::1'));
    expect(canonicalIp('invalid')).toBe('unknown');
    expect(canonicalIp(undefined)).toBe('unknown');
  });
});
