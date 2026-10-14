import { DynamicModule, Global, Module } from '@nestjs/common';
import type { Environment } from '../../../config/environment';
import { AccessTokenService } from './access-token.service';
import { PasswordHasher } from './password-hasher';
import { RefreshTokenService } from './refresh-token.service';

@Global()
@Module({})
export class AuthSecurityModule {
  static register(environment: Environment): DynamicModule {
    if (!environment.AUTH_SECURITY) return { module: AuthSecurityModule };
    return {
      module: AuthSecurityModule,
      providers: [
        { provide: PasswordHasher, useValue: new PasswordHasher(environment.AUTH_SECURITY.argon2) },
        {
          provide: AccessTokenService,
          useValue: new AccessTokenService(environment.AUTH_SECURITY),
        },
        RefreshTokenService,
      ],
      exports: [PasswordHasher, AccessTokenService, RefreshTokenService],
    };
  }
}
