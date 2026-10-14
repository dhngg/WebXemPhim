import type {
  AuthTokenResponse,
  AuthUserResponse,
  LoginRequest,
  RegisterRequest,
} from '@rental/shared';

export const AUTH_SERVICE = Symbol('AUTH_SERVICE');

export interface AuthOperationResult {
  response: AuthTokenResponse;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export type AuthenticatedUser = AuthUserResponse;

export interface AuthServiceContract {
  register(input: RegisterRequest): Promise<AuthOperationResult>;
  login(input: LoginRequest): Promise<AuthOperationResult>;
  refresh(refreshToken: string | undefined): Promise<AuthOperationResult>;
  logout(refreshToken: string | undefined): Promise<void>;
  logoutAll(userId: string): Promise<void>;
  authenticateAccessToken(accessToken: string): Promise<AuthenticatedUser>;
  me(user: AuthenticatedUser): Promise<AuthUserResponse>;
}
