import { Injectable } from '@nestjs/common';
import type { AuthUserResponse, LoginRequest, RegisterRequest } from '@rental/shared';
import { ApplicationException } from '../../../common/errors/application-exception';
import type {
  AuthenticatedUser,
  AuthOperationResult,
  AuthServiceContract,
} from './auth-service.contract';

@Injectable()
export class ContractOnlyAuthService implements AuthServiceContract {
  register(_input: RegisterRequest): Promise<AuthOperationResult> {
    void _input;
    return this.notImplemented();
  }

  login(_input: LoginRequest): Promise<AuthOperationResult> {
    void _input;
    return this.notImplemented();
  }

  refresh(_refreshToken: string | undefined): Promise<AuthOperationResult> {
    void _refreshToken;
    return this.notImplemented();
  }

  logout(_refreshToken: string | undefined): Promise<void> {
    void _refreshToken;
    return this.notImplemented();
  }

  logoutAll(_userId: string): Promise<void> {
    void _userId;
    return this.notImplemented();
  }

  authenticateAccessToken(_accessToken: string): Promise<AuthenticatedUser> {
    void _accessToken;
    return this.notImplemented();
  }

  me(_user: AuthenticatedUser): Promise<AuthUserResponse> {
    void _user;
    return this.notImplemented();
  }

  private notImplemented<T>(): Promise<T> {
    return Promise.reject(new ApplicationException('AUTH_DISABLED'));
  }
}
