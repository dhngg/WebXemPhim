import { createAuthSecurityConfig } from '../../../config/auth-security.config';
import {
  AuthRepository,
  EmailAlreadyExistsRepositoryError,
  type AuthUserRecord,
  UserUnavailableRepositoryError,
} from '../repositories/auth.repository';
import { AccessTokenExpiredError, AccessTokenService } from '../security/access-token.service';
import { PasswordHasher } from '../security/password-hasher';
import { RefreshTokenService } from '../security/refresh-token.service';
import { AuthService } from './auth.service';

const securityConfig = createAuthSecurityConfig({
  issuer: 'rental-api-test',
  audience: 'rental-web-test',
  activeKid: 'test',
  encodedKeys: JSON.stringify({ test: Buffer.alloc(32, 9).toString('base64') }),
  argon2MemoryKiB: 19_456,
  argon2TimeCost: 2,
  argon2Parallelism: 1,
});

const activeUser: AuthUserRecord = {
  id: 'a4c60e9e-5f9d-4a10-b7ab-c1d663c19f5c',
  email: 'user@example.com',
  passwordHash: '',
  displayName: 'User',
  status: 'ACTIVE',
  createdAt: new Date('2026-10-14T00:00:00.000Z'),
};

describe('AuthService register/login', () => {
  const passwordHasher = new PasswordHasher(securityConfig.argon2);
  const accessTokens = new AccessTokenService(securityConfig);
  const refreshTokens = new RefreshTokenService();
  let repository: jest.Mocked<AuthRepository>;
  let service: AuthService;
  let passwordHash: string;
  let dummyHash: string;

  beforeAll(async () => {
    passwordHash = await passwordHasher.hash('correct horse battery staple');
    dummyHash = await passwordHasher.hash('dummy password value');
  });

  beforeEach(() => {
    repository = {
      createUserWithSession: jest.fn(),
      findUserByEmail: jest.fn(),
      findUserById: jest.fn(),
      createSessionForActiveUser: jest.fn(),
      rotateRefreshToken: jest.fn(),
      revokeFamilyByTokenHash: jest.fn(),
      revokeAllUserSessions: jest.fn(),
    } as unknown as jest.Mocked<AuthRepository>;
    service = new AuthService(repository, passwordHasher, accessTokens, refreshTokens, dummyHash);
  });

  it('registers a normalized ACTIVE user with an Argon2id hash and hashed refresh token', async () => {
    repository.createUserWithSession.mockImplementation(async (input) => ({
      ...activeUser,
      email: input.email,
      passwordHash: input.passwordHash,
    }));
    const result = await service.register({
      email: ' USER@Example.COM ',
      password: 'correct horse battery staple',
      displayName: ' User ',
    });
    const [input, session] = repository.createUserWithSession.mock.calls[0]!;
    expect(input).toMatchObject({ email: 'user@example.com', displayName: 'User' });
    expect(input.passwordHash).toMatch(/^\$argon2id\$/);
    expect(input.passwordHash).not.toContain('correct horse battery staple');
    expect(session.tokenHash).toHaveLength(32);
    expect(Buffer.from(session.tokenHash).toString('utf8')).not.toContain(result.refreshToken);
    expect(result.response).not.toHaveProperty('refreshToken');
    expect(accessTokens.verify(result.response.accessToken)).toMatchObject({
      sub: activeUser.id,
      sid: session.familyId,
    });
  });

  it('maps the database email unique constraint to EMAIL_ALREADY_EXISTS', async () => {
    repository.createUserWithSession.mockRejectedValue(new EmailAlreadyExistsRepositoryError());
    await expect(
      service.register({ email: 'user@example.com', password: 'correct horse battery staple' }),
    ).rejects.toMatchObject({ code: 'EMAIL_ALREADY_EXISTS' });
  });

  it('uses the same INVALID_CREDENTIALS response for missing email and wrong password', async () => {
    const verify = jest.spyOn(passwordHasher, 'verify');
    repository.findUserByEmail.mockResolvedValueOnce(null).mockResolvedValueOnce({
      ...activeUser,
      passwordHash,
    });
    for (const email of ['missing@example.com', 'user@example.com']) {
      await expect(
        service.login({ email, password: 'wrong password value' }),
      ).rejects.toMatchObject({
        code: 'INVALID_CREDENTIALS',
      });
    }
    expect(verify).toHaveBeenCalledTimes(2);
    expect(repository.createSessionForActiveUser).not.toHaveBeenCalled();
    verify.mockRestore();
  });

  it('blocks a disabled user after verifying valid credentials', async () => {
    repository.findUserByEmail.mockResolvedValue({
      ...activeUser,
      passwordHash,
      status: 'DISABLED',
    });
    await expect(
      service.login({ email: activeUser.email, password: 'correct horse battery staple' }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_DISABLED' });
    expect(repository.createSessionForActiveUser).not.toHaveBeenCalled();
  });

  it('creates a session family on successful login and handles a concurrent disable', async () => {
    repository.findUserByEmail.mockResolvedValue({ ...activeUser, passwordHash });
    repository.createSessionForActiveUser.mockResolvedValueOnce();
    const result = await service.login({
      email: activeUser.email,
      password: 'correct horse battery staple',
    });
    expect(result.response.expiresIn).toBe(600);
    expect(repository.createSessionForActiveUser).toHaveBeenCalledTimes(1);

    repository.createSessionForActiveUser.mockRejectedValueOnce(
      new UserUnavailableRepositoryError('DISABLED'),
    );
    await expect(
      service.login({ email: activeUser.email, password: 'correct horse battery staple' }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_DISABLED' });
  });

  it('does not translate unexpected database failures into credential details', async () => {
    const databaseError = new Error('database unavailable');
    repository.findUserByEmail.mockRejectedValue(databaseError);
    await expect(
      service.login({ email: activeUser.email, password: 'correct horse battery staple' }),
    ).rejects.toBe(databaseError);
  });

  it('rotates refresh tokens without extending the absolute family expiry', async () => {
    const current = refreshTokens.generate();
    const absoluteExpiry = new Date('2026-11-13T00:00:00.000Z');
    repository.rotateRefreshToken.mockResolvedValue({
      outcome: 'ROTATED',
      user: activeUser,
      familyId: '2d565a63-67d0-4df4-a244-1b1017f26353',
      expiresAt: absoluteExpiry,
    });
    const result = await service.refresh(current.token);
    const [oldDigest, newDigest, , graceMilliseconds] =
      repository.rotateRefreshToken.mock.calls[0]!;
    expect(Buffer.from(oldDigest)).toEqual(current.digest);
    expect(newDigest).toHaveLength(32);
    expect(result.refreshToken).not.toBe(current.token);
    expect(result.refreshExpiresAt).toBe(absoluteExpiry);
    expect(graceMilliseconds).toBe(10_000);
  });

  it.each([
    ['ALREADY_ROTATED', 'TOKEN_ALREADY_ROTATED'],
    ['REUSE', 'TOKEN_REUSE_DETECTED'],
    ['INVALID', 'REFRESH_TOKEN_INVALID'],
    ['EXPIRED', 'REFRESH_TOKEN_INVALID'],
    ['DISABLED', 'ACCOUNT_DISABLED'],
  ] as const)('maps refresh outcome %s to %s', async (outcome, code) => {
    repository.rotateRefreshToken.mockResolvedValue({ outcome });
    await expect(service.refresh(refreshTokens.generate().token)).rejects.toMatchObject({ code });
  });

  it('treats missing or malformed refresh tokens as invalid', async () => {
    await expect(service.refresh(undefined)).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_INVALID',
    });
    await expect(service.refresh('not-a-token')).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_INVALID',
    });
    expect(repository.rotateRefreshToken).not.toHaveBeenCalled();
  });

  it('makes logout idempotent while revoking a valid token family', async () => {
    await service.logout(undefined);
    await service.logout('not-a-token');
    const refresh = refreshTokens.generate();
    await service.logout(refresh.token);
    expect(repository.revokeFamilyByTokenHash).toHaveBeenCalledTimes(1);
    expect(Buffer.from(repository.revokeFamilyByTokenHash.mock.calls[0]![0])).toEqual(
      refresh.digest,
    );
  });

  it('authenticates ACTIVE users for me/logout-all and rejects invalid or disabled users', async () => {
    const familyId = '2d565a63-67d0-4df4-a244-1b1017f26353';
    const accessToken = accessTokens.issue(activeUser.id, familyId);
    repository.findUserById.mockResolvedValueOnce(activeUser);
    const authenticated = await service.authenticateAccessToken(accessToken);
    expect(await service.me(authenticated)).toEqual(authenticated);
    await service.logoutAll(authenticated.id);
    expect(repository.revokeAllUserSessions).toHaveBeenCalledWith(activeUser.id, expect.any(Date));

    repository.findUserById.mockResolvedValueOnce({ ...activeUser, status: 'DISABLED' });
    await expect(service.authenticateAccessToken(accessToken)).rejects.toMatchObject({
      code: 'ACCOUNT_DISABLED',
    });
    await expect(service.authenticateAccessToken('invalid')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('maps an expired access token without exposing verifier details', async () => {
    jest.spyOn(accessTokens, 'verify').mockImplementationOnce(() => {
      throw new AccessTokenExpiredError();
    });
    await expect(service.authenticateAccessToken('expired')).rejects.toMatchObject({
      code: 'ACCESS_TOKEN_EXPIRED',
    });
  });
});
