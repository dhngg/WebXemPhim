import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApplicationException } from '../../../common/errors/application-exception';
import type { Environment } from '../../../config/environment';
import {
  AUTH_SERVICE,
  type AuthenticatedUser,
  type AuthServiceContract,
} from '../services/auth-service.contract';

export const AUTH_HTTP_SECURITY = Symbol('AUTH_HTTP_SECURITY');
export const AUTH_CSRF_HEADER = 'x-csrf-protection';
const AUTHENTICATED_USER = Symbol('AUTHENTICATED_USER');

export interface AuthHttpSecurityConfig {
  enabled: boolean;
  allowedOrigins: readonly string[];
  refreshCookieName?: string;
  secureCookie: boolean;
}

export function createAuthHttpSecurityConfig(environment: Environment): AuthHttpSecurityConfig {
  return Object.freeze({
    enabled: environment.AUTH_ENABLED,
    allowedOrigins: [...environment.CORS_ORIGINS],
    ...(environment.AUTH_REFRESH_COOKIE_NAME
      ? { refreshCookieName: environment.AUTH_REFRESH_COOKIE_NAME }
      : {}),
    secureCookie: environment.NODE_ENV === 'production',
  });
}

@Injectable()
export class AuthOriginGuard implements CanActivate {
  constructor(@Inject(AUTH_HTTP_SECURITY) private readonly config: AuthHttpSecurityConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
    if (!this.config.enabled) return true;
    const origin = request.get('origin');
    const csrfHeader = request.get(AUTH_CSRF_HEADER);
    if (!origin || !this.config.allowedOrigins.includes(origin) || csrfHeader !== '1') {
      throw new ApplicationException('CSRF_VALIDATION_FAILED');
    }
    return true;
  }
}

@Injectable()
export class AccessAuthGuard implements CanActivate {
  constructor(@Inject(AUTH_SERVICE) private readonly authService: AuthServiceContract) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.get('authorization');
    const match = /^Bearer ([^\s]+)$/.exec(authorization ?? '');
    const user = await this.authService.authenticateAccessToken(match?.[1] ?? '');
    Object.defineProperty(request, AUTHENTICATED_USER, {
      configurable: false,
      enumerable: false,
      writable: false,
      value: user,
    });
    return true;
  }
}

export function getAuthenticatedUser(request: Request): AuthenticatedUser {
  const user = (request as Request & { [AUTHENTICATED_USER]?: AuthenticatedUser })[
    AUTHENTICATED_USER
  ];
  if (!user) throw new ApplicationException('UNAUTHORIZED');
  return user;
}

@Injectable()
export class RefreshCookieService {
  constructor(@Inject(AUTH_HTTP_SECURITY) private readonly config: AuthHttpSecurityConfig) {}

  set(response: Response, token: string, expiresAt: Date): void {
    if (!this.config.enabled || !this.config.refreshCookieName) {
      throw new ApplicationException('AUTH_DISABLED');
    }
    response.cookie(this.config.refreshCookieName, token, {
      httpOnly: true,
      secure: this.config.secureCookie,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
      maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
    });
  }

  read(request: Request): string | undefined {
    if (!this.config.enabled || !this.config.refreshCookieName) {
      throw new ApplicationException('AUTH_DISABLED');
    }
    const values = (request.get('cookie') ?? '')
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part.startsWith(`${this.config.refreshCookieName}=`))
      .map((part) => part.slice(this.config.refreshCookieName!.length + 1));
    if (values.length !== 1) return undefined;
    try {
      return decodeURIComponent(values[0]!);
    } catch {
      return undefined;
    }
  }

  clear(response: Response): void {
    if (!this.config.enabled || !this.config.refreshCookieName) {
      throw new ApplicationException('AUTH_DISABLED');
    }
    response.clearCookie(this.config.refreshCookieName, {
      httpOnly: true,
      secure: this.config.secureCookie,
      sameSite: 'lax',
      path: '/',
    });
  }
}
