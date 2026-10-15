import { createHmac, randomBytes } from 'node:crypto';
import { isIP, SocketAddress } from 'node:net';
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Optional,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import type { Environment } from '../../../config/environment';
import { ApplicationException } from '../../../common/errors/application-exception';
import { AuthRepository } from '../repositories/auth.repository';
import { RefreshTokenService } from '../security/refresh-token.service';
import { RefreshCookieService } from './auth-http-security';

export const AUTH_RATE_LIMIT_CONFIG = Symbol('AUTH_RATE_LIMIT_CONFIG');
const RATE_LIMIT_ACTION = Symbol('RATE_LIMIT_ACTION');
type AuthAction = 'register' | 'login' | 'refresh' | 'forgot' | 'reset';
export const AuthRateLimit = (action: AuthAction) => SetMetadata(RATE_LIMIT_ACTION, action);

// Process-local only: counters disappear on restart and are not shared across replicas.
export class InMemoryAuthRateLimiter {
  private readonly entries = new Map<string, { count: number; expiresAt: number }>();
  private readonly keySecret = randomBytes(32);
  private nextSweep = 0;

  constructor(private readonly maxKeys: number) {}

  consume(scope: string, identity: string, max: number, windowSeconds: number): number {
    const now = Date.now();
    if (now >= this.nextSweep) {
      for (const [key, entry] of this.entries) {
        if (entry.expiresAt <= now) this.entries.delete(key);
      }
      this.nextSweep = now + 1000;
    }
    // Do not keep raw IP/email/family IDs in the store or expose the limiting dimension.
    const key = createHmac('sha256', this.keySecret)
      .update(JSON.stringify([scope, identity]))
      .digest('hex');
    let entry = this.entries.get(key);
    if (entry && entry.expiresAt <= now) {
      this.entries.delete(key);
      entry = undefined;
    }
    if (!entry) {
      if (this.entries.size >= this.maxKeys) {
        // Fail closed instead of evicting live buckets and allowing a cardinality bypass.
        let earliestExpiry = Infinity;
        for (const existing of this.entries.values())
          earliestExpiry = Math.min(earliestExpiry, existing.expiresAt);
        return Math.max(1, Math.ceil((earliestExpiry - now) / 1000));
      }
      entry = { count: 0, expiresAt: now + windowSeconds * 1000 };
      this.entries.set(key, entry);
    }
    if (entry.count >= max) return Math.max(1, Math.ceil((entry.expiresAt - now) / 1000));
    entry.count += 1;
    return 0;
  }
}

@Injectable()
export class AuthRateLimitIdentityService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly tokens: RefreshTokenService,
  ) {}

  async family(token: string | undefined): Promise<string | undefined> {
    if (!token) return undefined;
    let digest: Uint8Array<ArrayBuffer>;
    try {
      digest = new Uint8Array(this.tokens.digest(token));
    } catch {
      return undefined;
    }
    // Read-only lookup after IP limiting; never use a client-provided family or JWT claim.
    return (await this.repository.findSessionFamilyByTokenHash(digest))?.familyId;
  }
}

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: InMemoryAuthRateLimiter,
    @Inject(AUTH_RATE_LIMIT_CONFIG) private readonly config: Environment,
    private readonly cookies: RefreshCookieService,
    @Optional() private readonly identity?: AuthRateLimitIdentityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.config.AUTH_ENABLED) return true; // Disabled Auth still returns AUTH_DISABLED.
    const action = this.reflector.get<AuthAction | undefined>(
      RATE_LIMIT_ACTION,
      context.getHandler(),
    );
    if (!action) return true;
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const prefix = action.toUpperCase() as 'REGISTER' | 'LOGIN' | 'REFRESH' | 'FORGOT' | 'RESET';
    const window = this.config[`AUTH_RATE_LIMIT_${prefix}_WINDOW_SECONDS`];
    this.check(
      response,
      `${action}:ip`,
      canonicalIp(request.ip),
      this.config[`AUTH_RATE_LIMIT_${prefix}_IP_MAX`],
      window,
    );
    // Guards run before DTO pipes: normalize independently and bound untrusted input.
    const email: unknown = (request.body as { email?: unknown } | undefined)?.email;
    if (action === 'login' && typeof email === 'string') {
      const normalized = email.trim().toLowerCase();
      if (normalized.length > 0 && normalized.length <= 254) {
        this.check(
          response,
          'login:email',
          normalized,
          this.config.AUTH_RATE_LIMIT_LOGIN_EMAIL_MAX,
          window,
        );
      }
    }
    if (action === 'forgot' && typeof email === 'string') {
      const normalized = email.trim().toLowerCase();
      if (normalized.length > 0 && normalized.length <= 254) {
        this.check(
          response,
          'forgot:email',
          normalized,
          this.config.AUTH_RATE_LIMIT_FORGOT_EMAIL_MAX,
          window,
        );
      }
    }
    if (action === 'reset') {
      // Per-token bucket: a guessed/leaked token cannot be hammered from many addresses.
      const token: unknown = (request.body as { token?: unknown } | undefined)?.token;
      if (typeof token === 'string' && token.length > 0 && token.length <= 128) {
        this.check(
          response,
          'reset:token',
          token,
          this.config.AUTH_RATE_LIMIT_RESET_TOKEN_MAX,
          window,
        );
      }
    }
    if (action === 'refresh') {
      if (!this.identity) throw new ApplicationException('AUTH_DISABLED');
      const family = await this.identity.family(this.cookies.read(request));
      if (family)
        this.check(
          response,
          'refresh:family',
          family,
          this.config.AUTH_RATE_LIMIT_REFRESH_FAMILY_MAX,
          window,
        );
    }
    return true;
  }

  private check(
    response: Response,
    scope: string,
    identity: string,
    max: number,
    window: number,
  ): void {
    const retryAfter = this.limiter.consume(scope, identity, max, window);
    if (retryAfter > 0) {
      response.setHeader('Retry-After', String(retryAfter));
      throw new ApplicationException('RATE_LIMITED');
    }
  }
}

export function canonicalIp(address: string | undefined): string {
  if (!address || !isIP(address)) return 'unknown';
  if (isIP(address) === 4) return address;
  const canonical = new SocketAddress({ address, family: 'ipv6' }).address;
  if (canonical.startsWith('::ffff:')) return canonical.slice(7);
  // Group IPv6 /64: changing host bits within a client subnet must not reset its quota.
  const [left = '', right] = canonical.split('::');
  const start = left ? left.split(':') : [];
  const end = right ? right.split(':') : [];
  const groups =
    right === undefined
      ? start
      : [...start, ...Array<string>(8 - start.length - end.length).fill('0'), ...end];
  return `${groups
    .slice(0, 4)
    .map((group) => group.padStart(4, '0'))
    .join(':')}::/64`;
}
