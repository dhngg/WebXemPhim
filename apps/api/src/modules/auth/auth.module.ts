import { type DynamicModule, Module } from '@nestjs/common';
import type { Environment } from '../../config/environment';
import { AuthController } from './controllers/auth.controller';
import {
  AUTH_HTTP_SECURITY,
  AccessAuthGuard,
  AuthOriginGuard,
  createAuthHttpSecurityConfig,
  RefreshCookieService,
} from './http/auth-http-security';
import { AuthRepository } from './repositories/auth.repository';
import { PasswordHasher } from './security/password-hasher';
import { AUTH_SERVICE } from './services/auth-service.contract';
import { AuthService, createDummyPasswordHash, DUMMY_PASSWORD_HASH } from './services/auth.service';
import { ContractOnlyAuthService } from './services/contract-only-auth.service';
import {
  AUTH_RATE_LIMIT_CONFIG,
  AuthRateLimitGuard,
  AuthRateLimitIdentityService,
  InMemoryAuthRateLimiter,
} from './http/auth-rate-limit';

@Module({})
export class AuthModule {
  static register(environment: Environment): DynamicModule {
    const commonProviders = [
      { provide: AUTH_RATE_LIMIT_CONFIG, useValue: environment },
      {
        provide: InMemoryAuthRateLimiter,
        useValue: new InMemoryAuthRateLimiter(environment.AUTH_RATE_LIMIT_MAX_KEYS),
      },
      AuthRateLimitGuard,
      { provide: AUTH_HTTP_SECURITY, useValue: createAuthHttpSecurityConfig(environment) },
      AuthOriginGuard,
      AccessAuthGuard,
      RefreshCookieService,
    ];
    if (!environment.AUTH_ENABLED) {
      return {
        module: AuthModule,
        controllers: [AuthController],
        providers: [
          ...commonProviders,
          { provide: AUTH_SERVICE, useClass: ContractOnlyAuthService },
        ],
      };
    }
    return {
      module: AuthModule,
      controllers: [AuthController],
      providers: [
        ...commonProviders,
        AuthRepository,
        AuthRateLimitIdentityService,
        AuthService,
        {
          provide: DUMMY_PASSWORD_HASH,
          inject: [PasswordHasher],
          useFactory: createDummyPasswordHash,
        },
        { provide: AUTH_SERVICE, useExisting: AuthService },
      ],
    };
  }
}
