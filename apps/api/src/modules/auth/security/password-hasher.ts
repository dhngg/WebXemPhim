import * as argon2 from 'argon2';
import type { AuthSecurityConfig } from '../../../config/auth-security.config';

const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;

export class PasswordHasher {
  constructor(private readonly config: AuthSecurityConfig['argon2']) {}

  async hash(password: string): Promise<string> {
    assertPasswordPolicy(password);
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: this.config.memoryCost,
      timeCost: this.config.timeCost,
      parallelism: this.config.parallelism,
      hashLength: 32,
    });
  }

  async verify(hash: string, password: string): Promise<boolean> {
    if (typeof hash !== 'string' || typeof password !== 'string') return false;
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  needsRehash(hash: string): boolean {
    try {
      return argon2.needsRehash(hash, {
        memoryCost: this.config.memoryCost,
        timeCost: this.config.timeCost,
        parallelism: this.config.parallelism,
      });
    } catch {
      return true;
    }
  }
}

function assertPasswordPolicy(password: string): void {
  if (
    typeof password !== 'string' ||
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    throw new Error('Password must contain between 12 and 128 characters');
  }
}
