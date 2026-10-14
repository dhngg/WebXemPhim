import { randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { AuthUserResponse, LoginRequest, RegisterRequest } from '@rental/shared';
import { ApplicationException } from '../../../common/errors/application-exception';
import {
  REFRESH_FAMILY_TTL_DAYS,
  REFRESH_ROTATION_GRACE_SECONDS,
} from '../../../config/auth-security.config';
import {
  AuthRepository,
  EmailAlreadyExistsRepositoryError,
  type AuthUserRecord,
  UserUnavailableRepositoryError,
} from '../repositories/auth.repository';
import {
  AccessTokenExpiredError,
  AccessTokenService,
  InvalidAccessTokenError,
} from '../security/access-token.service';
import { PasswordHasher } from '../security/password-hasher';
import { RefreshTokenService } from '../security/refresh-token.service';
import type {
  AuthenticatedUser,
  AuthOperationResult,
  AuthServiceContract,
} from './auth-service.contract';

export const DUMMY_PASSWORD_HASH = Symbol('DUMMY_PASSWORD_HASH');

@Injectable()
export class AuthService implements AuthServiceContract {
  constructor(
    private readonly repository: AuthRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly accessTokens: AccessTokenService,
    private readonly refreshTokens: RefreshTokenService,
    @Inject(DUMMY_PASSWORD_HASH) private readonly dummyPasswordHash: string,
  ) {}

  async register(input: RegisterRequest): Promise<AuthOperationResult> {
    const email = normalizeEmail(input.email);
    const passwordHash = await this.passwordHasher.hash(input.password);
    const session = this.newSession();
    try {
      const user = await this.repository.createUserWithSession(
        {
          email,
          passwordHash,
          ...(input.displayName === undefined ? {} : { displayName: input.displayName.trim() }),
        },
        session.database,
      );
      return this.createResult(user, session);
    } catch (error) {
      if (error instanceof EmailAlreadyExistsRepositoryError) {
        throw new ApplicationException('EMAIL_ALREADY_EXISTS');
      }
      throw error;
    }
  }

  async login(input: LoginRequest): Promise<AuthOperationResult> {
    const email = normalizeEmail(input.email);
    const user = await this.repository.findUserByEmail(email);
    const passwordMatches = await this.passwordHasher.verify(
      user?.passwordHash ?? this.dummyPasswordHash,
      input.password,
    );
    if (!user || !passwordMatches) throw new ApplicationException('INVALID_CREDENTIALS');
    if (user.status === 'DISABLED') throw new ApplicationException('ACCOUNT_DISABLED');

    const session = this.newSession();
    try {
      await this.repository.createSessionForActiveUser(user.id, session.database);
    } catch (error) {
      if (error instanceof UserUnavailableRepositoryError) {
        throw new ApplicationException(
          error.reason === 'DISABLED' ? 'ACCOUNT_DISABLED' : 'INVALID_CREDENTIALS',
        );
      }
      throw error;
    }
    return this.createResult(user, session);
  }

  async refresh(refreshToken: string | undefined): Promise<AuthOperationResult> {
    const currentTokenHash = this.digestRefreshToken(refreshToken);
    const next = this.refreshTokens.generate();
    const rotation = await this.repository.rotateRefreshToken(
      currentTokenHash,
      new Uint8Array(next.digest),
      new Date(),
      REFRESH_ROTATION_GRACE_SECONDS * 1000,
    );
    switch (rotation.outcome) {
      case 'ROTATED':
        return this.createResult(rotation.user, {
          refreshToken: next.token,
          database: { familyId: rotation.familyId, expiresAt: rotation.expiresAt },
        });
      case 'ALREADY_ROTATED':
        throw new ApplicationException('TOKEN_ALREADY_ROTATED');
      case 'REUSE':
        throw new ApplicationException('TOKEN_REUSE_DETECTED');
      case 'DISABLED':
        throw new ApplicationException('ACCOUNT_DISABLED');
      case 'INVALID':
      case 'EXPIRED':
        throw new ApplicationException('REFRESH_TOKEN_INVALID');
    }
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    try {
      await this.repository.revokeFamilyByTokenHash(
        new Uint8Array(this.refreshTokens.digest(refreshToken)),
        new Date(),
      );
    } catch (error) {
      if (isInvalidRefreshTokenFormat(error)) return;
      throw error;
    }
  }

  logoutAll(userId: string): Promise<void> {
    return this.repository.revokeAllUserSessions(userId, new Date());
  }

  async authenticateAccessToken(accessToken: string): Promise<AuthenticatedUser> {
    let userId: string;
    try {
      userId = this.accessTokens.verify(accessToken).sub;
    } catch (error) {
      if (error instanceof AccessTokenExpiredError) {
        throw new ApplicationException('ACCESS_TOKEN_EXPIRED');
      }
      if (error instanceof InvalidAccessTokenError) {
        throw new ApplicationException('UNAUTHORIZED');
      }
      throw error;
    }
    const user = await this.repository.findUserById(userId);
    if (!user) throw new ApplicationException('UNAUTHORIZED');
    if (user.status !== 'ACTIVE') throw new ApplicationException('ACCOUNT_DISABLED');
    return toPublicUser(user);
  }

  async me(user: AuthenticatedUser): Promise<AuthUserResponse> {
    return user;
  }

  private newSession(): {
    refreshToken: string;
    database: { familyId: string; tokenHash: Uint8Array<ArrayBuffer>; expiresAt: Date };
  } {
    const refresh = this.refreshTokens.generate();
    return {
      refreshToken: refresh.token,
      database: {
        familyId: randomUUID(),
        tokenHash: new Uint8Array(refresh.digest),
        expiresAt: new Date(Date.now() + REFRESH_FAMILY_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    };
  }

  private createResult(
    user: AuthUserRecord,
    session: { refreshToken: string; database: { familyId: string; expiresAt: Date } },
  ): AuthOperationResult {
    return {
      response: {
        accessToken: this.accessTokens.issue(user.id, session.database.familyId),
        expiresIn: 600,
        user: toPublicUser(user),
      },
      refreshToken: session.refreshToken,
      refreshExpiresAt: session.database.expiresAt,
    };
  }

  private digestRefreshToken(refreshToken: string | undefined): Uint8Array<ArrayBuffer> {
    if (!refreshToken) throw new ApplicationException('REFRESH_TOKEN_INVALID');
    try {
      return new Uint8Array(this.refreshTokens.digest(refreshToken));
    } catch (error) {
      if (isInvalidRefreshTokenFormat(error)) {
        throw new ApplicationException('REFRESH_TOKEN_INVALID');
      }
      throw error;
    }
  }
}

export async function createDummyPasswordHash(passwordHasher: PasswordHasher): Promise<string> {
  return passwordHasher.hash(randomBytes(32).toString('base64url'));
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toPublicUser(user: AuthUserRecord): AuthUserResponse {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
  };
}

function isInvalidRefreshTokenFormat(error: unknown): boolean {
  return error instanceof Error && error.message === 'Invalid refresh token format';
}
