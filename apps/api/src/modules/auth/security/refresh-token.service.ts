import { createHash, randomBytes } from 'node:crypto';
import { REFRESH_TOKEN_BYTES } from '../../../config/auth-security.config';

export interface GeneratedRefreshToken {
  readonly token: string;
  readonly digest: Buffer;
}

export class RefreshTokenService {
  generate(): GeneratedRefreshToken {
    const token = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    return { token, digest: this.digest(token) };
  }

  digest(token: string): Buffer {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      throw new Error('Invalid refresh token format');
    }
    return createHash('sha256').update(token, 'utf8').digest();
  }
}
