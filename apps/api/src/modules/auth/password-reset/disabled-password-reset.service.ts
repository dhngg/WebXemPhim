import { Injectable } from '@nestjs/common';
import { ApplicationException } from '../../../common/errors/application-exception';
import type { PasswordResetServiceContract } from './password-reset.service';

/** Used while AUTH_ENABLED=false: same AUTH_DISABLED answer as every other Auth route. */
@Injectable()
export class DisabledPasswordResetService implements PasswordResetServiceContract {
  forgot(): Promise<void> {
    return Promise.reject(new ApplicationException('AUTH_DISABLED'));
  }

  reset(): Promise<void> {
    return Promise.reject(new ApplicationException('AUTH_DISABLED'));
  }
}
