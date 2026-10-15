/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { Logger } from '@nestjs/common';
import { validateEnvironment } from '../../../config/environment';
import { DisabledEmailSender, SmtpEmailSender, type EmailSender } from './email-sender';
import {
  PASSWORD_RESET_COOLDOWN_SECONDS,
  PasswordResetRepository,
  ResetTokenInvalidRepositoryError,
} from './password-reset.repository';
import {
  buildResetLink,
  digestResetToken,
  PasswordResetService,
  resetEmail,
} from './password-reset.service';

const NOW = new Date('2026-10-15T10:00:00Z');
const config = { PASSWORD_RESET_URL_BASE: 'http://localhost:5173/reset-password' } as any;

function service(over: { mailer?: Partial<EmailSender>; repo?: any; hasher?: any } = {}) {
  const sent: any[] = [];
  const mailer: any = {
    enabled: true,
    send: jest.fn(async (m: any) => void sent.push(m)),
    ...over.mailer,
  };
  const repo: any = {
    issue: jest.fn().mockResolvedValue({ email: 'u@x.test' }),
    redeem: jest.fn(),
    ...over.repo,
  };
  const hasher: any = { hash: jest.fn().mockResolvedValue('$argon2id$hash'), ...over.hasher };
  return {
    sent,
    mailer,
    repo,
    hasher,
    svc: new PasswordResetService(repo, hasher, mailer, config, 0),
  };
}

describe('token handling', () => {
  it('digests are 32 bytes, deterministic and domain-separated', () => {
    const d = digestResetToken('a'.repeat(43));
    expect(d).toHaveLength(32);
    expect(Buffer.from(d).equals(Buffer.from(digestResetToken('a'.repeat(43))))).toBe(true);
    expect(Buffer.from(d).equals(Buffer.from(digestResetToken('b'.repeat(43))))).toBe(false);
    const plain = createHash('sha256').update('a'.repeat(43)).digest();
    expect(Buffer.from(d).equals(plain)).toBe(false);
  });
  it('puts the token in the URL fragment, not the query', () => {
    const link = buildResetLink('https://app.example/reset/', 'tok_en-1');
    expect(link).toBe('https://app.example/reset#token=tok_en-1');
    expect(link).not.toContain('?');
  });
});

describe('forgot password', () => {
  it('issues a token, stores only its digest and e-mails the link', async () => {
    const { svc, repo, sent } = service();
    await svc.forgot('u@x.test');
    const [email, hash] = repo.issue.mock.calls[0];
    expect(email).toBe('u@x.test');
    expect(hash).toHaveLength(32);
    expect(sent).toHaveLength(1);
    const token = /#token=([A-Za-z0-9_-]{43})/.exec(sent[0].text)![1]!;
    expect(Buffer.from(hash).equals(Buffer.from(digestResetToken(token)))).toBe(true);
    expect(JSON.stringify(repo.issue.mock.calls)).not.toContain(token);
    expect(sent[0].to).toBe('u@x.test');
    expect(sent[0].text).toContain('20 minutes');
  });
  it('resolves identically and sends nothing for unknown / disabled / cooled-down accounts', async () => {
    const { svc, sent } = service({ repo: { issue: jest.fn().mockResolvedValue(null) } });
    await expect(svc.forgot('ghost@x.test')).resolves.toBeUndefined();
    expect(sent).toHaveLength(0);
  });
  it('does not even create a token when no e-mail provider is configured', async () => {
    const { svc, repo } = service({ mailer: { enabled: false } });
    await svc.forgot('u@x.test');
    expect(repo.issue).not.toHaveBeenCalled();
  });
  it('swallows database and delivery failures (same response) without logging the token', async () => {
    const errors: string[] = [];
    jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation((m: any) => void errors.push(String(m)));
    const warns: string[] = [];
    jest.spyOn(Logger.prototype, 'warn').mockImplementation((m: any) => void warns.push(String(m)));
    const failingDb = service({
      repo: { issue: jest.fn().mockRejectedValue(new Error('db down')) },
    });
    await expect(failingDb.svc.forgot('u@x.test')).resolves.toBeUndefined();
    const failingMail = service({
      mailer: { send: jest.fn().mockRejectedValue(new Error('smtp')) },
    });
    await expect(failingMail.svc.forgot('u@x.test')).resolves.toBeUndefined();
    await new Promise((r) => setImmediate(r));
    const logged = [...errors, ...warns].join(' ');
    expect(logged).not.toMatch(/token|[A-Za-z0-9_-]{43}|u@x\.test/);
    jest.restoreAllMocks();
  });
  it('pads every call to the minimum duration (timing does not reveal existence)', async () => {
    const { repo, hasher, mailer } = service();
    const svc = new PasswordResetService(repo, hasher, mailer, config, 80);
    repo.issue.mockResolvedValue(null);
    const t = Date.now();
    await svc.forgot('ghost@x.test');
    expect(Date.now() - t).toBeGreaterThanOrEqual(75);
  });
  it('e-mail body never contains anything but the link and instructions', () => {
    const m = resetEmail('u@x.test', 'https://app/r#token=abc');
    expect(m.html).toContain('href="https://app/r#token=abc"');
    expect(m.text).toContain('ignore this e-mail');
  });
});

describe('reset password', () => {
  it('hashes with Argon2id hasher then redeems the digest of the token', async () => {
    const { svc, repo, hasher } = service();
    repo.redeem.mockResolvedValue({ userId: 'u', revokedSessions: 2 });
    await svc.reset('t'.repeat(43), 'a-new-strong-password');
    expect(hasher.hash).toHaveBeenCalledWith('a-new-strong-password');
    const [digest, passwordHash] = repo.redeem.mock.calls[0];
    expect(Buffer.from(digest).equals(Buffer.from(digestResetToken('t'.repeat(43))))).toBe(true);
    expect(passwordHash).toBe('$argon2id$hash');
  });
  it('maps wrong / expired / used tokens to one PASSWORD_RESET_TOKEN_INVALID', async () => {
    const { svc } = service({
      repo: { redeem: jest.fn().mockRejectedValue(new ResetTokenInvalidRepositoryError()) },
    });
    await expect(svc.reset('t'.repeat(43), 'a-new-strong-password')).rejects.toMatchObject({
      code: 'PASSWORD_RESET_TOKEN_INVALID',
    });
  });
  it('does not turn unexpected errors into token errors', async () => {
    const { svc } = service({ repo: { redeem: jest.fn().mockRejectedValue(new Error('boom')) } });
    await expect(svc.reset('t'.repeat(43), 'a-new-strong-password')).rejects.toThrow('boom');
  });
});

function txFor(over: Record<string, any> = {}) {
  const tx: any = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'u', email: 'u@x.test', status: 'ACTIVE' }),
      update: jest.fn(),
    },
    passwordResetToken: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn(),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ userId: 'u' }),
    },
    authSession: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) },
    ...over,
  };
  const prisma: any = { $transaction: jest.fn((fn: any) => fn(tx)) };
  return { tx, prisma, repo: new PasswordResetRepository(prisma) };
}

describe('PasswordResetRepository.issue', () => {
  const hash = new Uint8Array(32) as Uint8Array<ArrayBuffer>;
  it('supersedes the live token and creates one expiring in exactly 20 minutes', async () => {
    const { tx, repo } = txFor();
    await expect(repo.issue('u@x.test', hash, NOW)).resolves.toEqual({ email: 'u@x.test' });
    expect(tx.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u', consumedAt: null },
      data: { consumedAt: NOW },
    });
    const data = tx.passwordResetToken.create.mock.calls[0][0].data;
    expect(data.tokenHash).toBe(hash);
    expect(data.expiresAt.getTime() - NOW.getTime()).toBe(20 * 60_000);
  });
  it('issues nothing for unknown or DISABLED accounts (no reset to bypass a lock)', async () => {
    for (const user of [null, { id: 'u', email: 'u@x.test', status: 'DISABLED' }]) {
      const { tx, repo } = txFor({ user: { findUnique: jest.fn().mockResolvedValue(user) } });
      await expect(repo.issue('u@x.test', hash, NOW)).resolves.toBeNull();
      expect(tx.passwordResetToken.create).not.toHaveBeenCalled();
    }
  });
  it('enforces the per-account cooldown', async () => {
    const recent = new Date(NOW.getTime() - (PASSWORD_RESET_COOLDOWN_SECONDS - 5) * 1000);
    const { tx, repo } = txFor();
    tx.passwordResetToken.findFirst.mockResolvedValue({ createdAt: recent });
    await expect(repo.issue('u@x.test', hash, NOW)).resolves.toBeNull();
    expect(tx.passwordResetToken.create).not.toHaveBeenCalled();
  });
  it('a concurrent request that hits the one-live-token index is treated as already sent', async () => {
    const { tx, repo } = txFor();
    tx.passwordResetToken.create.mockRejectedValue(
      Object.assign(new Error('unique'), { code: 'P2002' }),
    );
    await expect(repo.issue('u@x.test', hash, NOW)).resolves.toBeNull();
  });
});

describe('PasswordResetRepository.redeem', () => {
  const hash = new Uint8Array(32) as Uint8Array<ArrayBuffer>;
  it('sets the password, consumes the token and revokes every session in one transaction', async () => {
    const { tx, repo, prisma } = txFor();
    await expect(repo.redeem(hash, '$argon2id$new', NOW)).resolves.toEqual({
      userId: 'u',
      revokedSessions: 3,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.passwordResetToken.updateMany.mock.calls[0][0]).toEqual({
      where: { tokenHash: hash, consumedAt: null, expiresAt: { gt: NOW } },
      data: { consumedAt: NOW },
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'u' },
      data: { passwordHash: '$argon2id$new' },
    });
    expect(tx.authSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u', revokedAt: null },
      data: { revokedAt: NOW, revokeReason: 'LOGOUT_ALL' },
    });
  });
  it.each(['wrong', 'expired', 'already used'])(
    'rejects a %s token without touching the user',
    async () => {
      const { tx, repo } = txFor();
      tx.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
      await expect(repo.redeem(hash, '$h', NOW)).rejects.toBeInstanceOf(
        ResetTokenInvalidRepositoryError,
      );
      expect(tx.user.update).not.toHaveBeenCalled();
      expect(tx.authSession.updateMany).not.toHaveBeenCalled();
    },
  );
  it('a DISABLED account cannot use reset to regain access (claim rolled back)', async () => {
    const { tx, repo } = txFor({
      user: { findUnique: jest.fn().mockResolvedValue({ status: 'DISABLED' }), update: jest.fn() },
    });
    await expect(repo.redeem(hash, '$h', NOW)).rejects.toBeInstanceOf(
      ResetTokenInvalidRepositoryError,
    );
    expect(tx.user.update).not.toHaveBeenCalled();
  });
  it('retries serialization failures, so the losing concurrent redeem ends as "invalid", not a 500', async () => {
    const { tx, prisma, repo } = txFor();
    let n = 0;
    tx.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
    prisma.$transaction = jest.fn((fn: any) => {
      n += 1;
      if (n === 1) return Promise.reject(Object.assign(new Error('x'), { code: 'P2034' }));
      return fn(tx);
    });
    await expect(repo.redeem(hash, '$h', NOW)).rejects.toBeInstanceOf(
      ResetTokenInvalidRepositoryError,
    );
    expect(n).toBe(2);
  });
});

describe('e-mail senders', () => {
  it('disabled sender reports disabled and sends nothing', async () => {
    const s = new DisabledEmailSender();
    expect(s.enabled).toBe(false);
    await expect(s.send()).resolves.toBeUndefined();
  });
  it('smtp sender hides provider errors from callers and logs only a code', async () => {
    const logs: string[] = [];
    jest.spyOn(Logger.prototype, 'error').mockImplementation((m: any) => void logs.push(String(m)));
    const s = new SmtpEmailSender(
      {
        sendMail: jest
          .fn()
          .mockRejectedValue(
            Object.assign(new Error('550 u@x.test #token=zzz'), { code: 'EENVELOPE' }),
          ),
      } as any,
      'noreply@x.test',
    );
    await expect(
      s.send({ to: 'u@x.test', subject: 's', text: 'link #token=zzz', html: '' }),
    ).rejects.toThrow('E-mail delivery failed');
    expect(logs.join(' ')).toBe('E-mail delivery failed (EENVELOPE)');
    jest.restoreAllMocks();
  });
});

describe('environment validation', () => {
  const base = {
    NODE_ENV: 'development',
    DATABASE_ENABLED: 'true',
    AUTH_ENABLED: 'true',
    AUTH_REFRESH_COOKIE_NAME: 'rt',
    AUTH_JWT_ISSUER: 'i',
    AUTH_JWT_AUDIENCE: 'a',
    AUTH_JWT_ACTIVE_KID: 'k1',
    AUTH_JWT_KEYS: JSON.stringify({ k1: Buffer.alloc(32, 7).toString('base64') }),
    DATABASE_URL: undefined,
  };
  const smtp = {
    EMAIL_PROVIDER: 'smtp',
    SMTP_HOST: 'smtp.test',
    SMTP_PORT: '587',
    EMAIL_FROM: 'noreply@x.test',
    PASSWORD_RESET_URL_BASE: 'http://localhost:5173/reset-password',
  };
  const run = (o: Record<string, unknown>) => () => {
    const env: any = { ...base, ...o };
    env.DATABASE_URL =
      'postgresql://neondb_owner:p@ep-winter-math-azeayw91-pooler.c-3.ap-southeast-1.aws.neon.tech/Apartment?sslmode=require&channel_binding=require';
    return validateEnvironment(env);
  };
  it('defaults to disabled and needs no mail settings', () => {
    expect(run({})().EMAIL_PROVIDER).toBe('disabled');
  });
  it('accepts a complete smtp configuration', () => {
    expect(run(smtp)().EMAIL_PROVIDER).toBe('smtp');
  });
  it.each([
    ['missing host', { SMTP_HOST: '' }],
    ['missing from', { EMAIL_FROM: '' }],
    ['missing url base', { PASSWORD_RESET_URL_BASE: '' }],
    ['user without password', { SMTP_USER: 'u' }],
    ['url with query', { PASSWORD_RESET_URL_BASE: 'http://localhost:5173/r?x=1' }],
    ['url origin not in CORS_ORIGINS', { PASSWORD_RESET_URL_BASE: 'http://evil.test/r' }],
    ['non-http url', { PASSWORD_RESET_URL_BASE: 'javascript:alert(1)' }],
  ])('rejects smtp with %s', (_n, o) => {
    expect(run({ ...smtp, ...o })).toThrow();
  });
});

describe('migration', () => {
  const sql = readFileSync(
    resolve(
      __dirname,
      '../../../../prisma/migrations/202610150024_auth_password_reset_tokens/migration.sql',
    ),
    'utf8',
  ).replace(/^--.*$/gm, '');
  it('is additive: only creates, never alters/drops/writes existing data', () => {
    expect(sql).not.toMatch(
      /\bDROP\b|\bALTER\b|\bTRUNCATE\b|\bINSERT\b|\bUPDATE\s+"|\bDELETE\s+FROM\b/i,
    );
  });
  it('stores a 32-byte digest, one live token per user, single-use immutable rows', () => {
    expect(sql).toContain('octet_length("token_hash") = 32');
    expect(sql).toContain('WHERE "consumed_at" IS NULL');
    expect(sql).toContain('a consumed password reset token cannot be reused');
    expect(sql).toContain('password reset tokens cannot be hard-deleted');
  });
});
