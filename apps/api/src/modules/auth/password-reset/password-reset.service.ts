import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Environment } from '../../../config/environment';
import { ApplicationException } from '../../../common/errors/application-exception';
import { AUTH_RATE_LIMIT_CONFIG } from '../http/auth-rate-limit';
import { PasswordHasher } from '../security/password-hasher';
import { EMAIL_SENDER, type EmailSender } from './email-sender';
import {
  PASSWORD_RESET_TTL_MINUTES,
  PasswordResetRepository,
  ResetTokenInvalidRepositoryError,
} from './password-reset.repository';

export const PASSWORD_RESET_SERVICE = Symbol('PASSWORD_RESET_SERVICE');
export const PASSWORD_RESET_MIN_DURATION_MS = Symbol('PASSWORD_RESET_MIN_DURATION_MS');

export interface PasswordResetServiceContract {
  forgot(email: string): Promise<void>;
  reset(token: string, newPassword: string): Promise<void>;
}

/** Domain-separated SHA-256: a reset token digest can never equal any other token's digest. */
export function digestResetToken(token: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(createHash('sha256').update(`password-reset:v1:${token}`, 'utf8').digest());
}

export function buildResetLink(base: string, token: string): string {
  // The token goes in the URL fragment so it is never sent to servers, proxies or access logs.
  return `${base.replace(/\/+$/, '')}#token=${encodeURIComponent(token)}`;
}

@Injectable()
export class PasswordResetService implements PasswordResetServiceContract {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly repository: PasswordResetRepository,
    private readonly hasher: PasswordHasher,
    @Inject(EMAIL_SENDER) private readonly mailer: EmailSender,
    @Inject(AUTH_RATE_LIMIT_CONFIG) private readonly config: Environment,
    @Inject(PASSWORD_RESET_MIN_DURATION_MS) private readonly minDurationMs: number,
  ) {}

  /**
   * Always resolves the same way. Work is padded to a minimum duration and the e-mail is sent after
   * the response path, so neither timing nor content reveals whether the account exists.
   */
  async forgot(email: string): Promise<void> {
    await padTo(
      this.minDurationMs,
      () => this.logger.error('Password reset request failed'),
      async () => {
        if (!this.mailer.enabled || !this.config.PASSWORD_RESET_URL_BASE) return;
        const token = randomBytes(32).toString('base64url');
        const issued = await this.repository.issue(email, digestResetToken(token), new Date());
        if (!issued) return;
        const link = buildResetLink(this.config.PASSWORD_RESET_URL_BASE, token);
        void this.mailer
          .send(resetEmail(issued.email, link))
          .catch(() => this.logger.warn('Password reset e-mail could not be delivered'));
      },
    );
  }

  async reset(token: string, newPassword: string): Promise<void> {
    // Hash first so valid and invalid tokens cost the same, and so the transaction stays short.
    const passwordHash = await this.hasher.hash(newPassword);
    try {
      await this.repository.redeem(digestResetToken(token), passwordHash, new Date());
    } catch (error) {
      if (error instanceof ResetTokenInvalidRepositoryError)
        throw new ApplicationException('PASSWORD_RESET_TOKEN_INVALID');
      throw error;
    }
  }
}

export function resetEmail(to: string, link: string) {
  const minutes = PASSWORD_RESET_TTL_MINUTES;
  return {
    to,
    subject: 'Reset your password',
    text:
      `We received a request to reset your password.\n\n` +
      `Open this link within ${minutes} minutes to choose a new password:\n${link}\n\n` +
      `If you did not ask for this, ignore this e-mail; your password stays unchanged.`,
    html:
      `<p>We received a request to reset your password.</p>` +
      `<p><a href="${link.replace(/"/g, '&quot;')}">Choose a new password</a> (valid for ${minutes} minutes).</p>` +
      `<p>If you did not ask for this, ignore this e-mail; your password stays unchanged.</p>`,
  };
}

async function padTo(minMs: number, onError: () => void, work: () => Promise<void>): Promise<void> {
  const started = Date.now();
  try {
    await work();
  } catch {
    // Failures (including DB errors) must not become a distinguishable response; log without detail.
    onError();
  }
  const remaining = minMs - (Date.now() - started);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}
