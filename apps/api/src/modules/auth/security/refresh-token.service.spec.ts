import { createHash } from 'node:crypto';
import { RefreshTokenService } from './refresh-token.service';

describe('RefreshTokenService', () => {
  const service = new RefreshTokenService();

  it('generates unique 256-bit opaque base64url tokens and SHA-256 digests', () => {
    const generated = Array.from({ length: 64 }, () => service.generate());
    expect(new Set(generated.map(({ token }) => token)).size).toBe(64);
    for (const { token, digest } of generated) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(digest).toHaveLength(32);
      expect(digest.equals(createHash('sha256').update(token).digest())).toBe(true);
      expect(digest.toString('hex')).not.toContain(token);
    }
  });

  it('rejects malformed raw refresh tokens before digesting', () => {
    expect(() => service.digest('too-short')).toThrow('Invalid refresh token format');
  });
});
