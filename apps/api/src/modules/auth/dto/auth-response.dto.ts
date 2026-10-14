import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AUTH_ERROR_CODES,
  USER_STATUSES,
  type ApiErrorResponse,
  type AuthTokenResponse,
  type AuthUserResponse,
  type UserStatus,
} from '@rental/shared';

export class AuthUserResponseDto implements AuthUserResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 100 })
  displayName!: string | null;

  @ApiProperty({ enum: USER_STATUSES })
  status!: UserStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class AuthTokenResponseDto implements AuthTokenResponse {
  @ApiProperty({ description: 'JWT access token; never persist it in browser storage' })
  accessToken!: string;

  @ApiProperty({ enum: [600], example: 600 })
  expiresIn!: 600;

  @ApiProperty({ type: AuthUserResponseDto })
  user!: AuthUserResponseDto;
}

export class ApiErrorResponseDto implements ApiErrorResponse {
  @ApiProperty()
  statusCode!: number;

  @ApiProperty({ enum: AUTH_ERROR_CODES })
  code!: string;

  @ApiProperty()
  message!: string;

  @ApiPropertyOptional({ type: [String] })
  errors?: string[];

  @ApiProperty()
  path!: string;

  @ApiProperty({ format: 'date-time' })
  timestamp!: string;

  @ApiProperty({ format: 'uuid' })
  requestId!: string;
}
