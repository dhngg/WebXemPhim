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
import { PasswordResetController } from './password-reset/password-reset.controller';
import { DisabledPasswordResetService } from './password-reset/disabled-password-reset.service';
import { createEmailSender, EMAIL_SENDER } from './password-reset/email-sender';
import { PasswordResetRepository } from './password-reset/password-reset.repository';
import {
  PASSWORD_RESET_MIN_DURATION_MS,
  PASSWORD_RESET_SERVICE,
  PasswordResetService,
} from './password-reset/password-reset.service';
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
        global: true,
        module: AuthModule,
        controllers: [AuthController, PasswordResetController],
        providers: [
          ...commonProviders,
          { provide: AUTH_SERVICE, useClass: ContractOnlyAuthService },
          { provide: PASSWORD_RESET_SERVICE, useClass: DisabledPasswordResetService },
        ],
        exports: [AUTH_SERVICE, AUTH_HTTP_SECURITY, AccessAuthGuard, AuthOriginGuard],
      };
    }
    return {
      global: true,
      module: AuthModule,
      controllers: [AuthController, PasswordResetController],
      providers: [
        ...commonProviders,
        AuthRepository,
        PasswordResetRepository,
        PasswordResetService,
        { provide: PASSWORD_RESET_SERVICE, useExisting: PasswordResetService },
        { provide: EMAIL_SENDER, useValue: createEmailSender(environment) },
        { provide: PASSWORD_RESET_MIN_DURATION_MS, useValue: 300 },
        AuthRateLimitIdentityService,
        AuthService,
        {
          provide: DUMMY_PASSWORD_HASH,
          inject: [PasswordHasher],
          useFactory: createDummyPasswordHash,
        },
        { provide: AUTH_SERVICE, useExisting: AuthService },
      ],
      exports: [AUTH_SERVICE, AUTH_HTTP_SECURITY, AccessAuthGuard, AuthOriginGuard],
    };
  }
}
