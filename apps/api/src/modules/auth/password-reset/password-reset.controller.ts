import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiHeader,
  ApiNoContentResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type {
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  ResetPasswordRequest,
} from '@rental/shared';
import { ApiErrorResponseDto } from '../dto/auth-response.dto';
import { AuthOriginGuard, RefreshCookieService } from '../http/auth-http-security';
import { AuthRateLimit, AuthRateLimitGuard } from '../http/auth-rate-limit';
import {
  PASSWORD_RESET_SERVICE,
  type PasswordResetServiceContract,
} from './password-reset.service';

const normalizeEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class ForgotPasswordRequestDto implements ForgotPasswordRequest {
  @ApiProperty({ format: 'email', maxLength: 254 })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class ForgotPasswordResponseDto implements ForgotPasswordResponse {
  @ApiProperty({ example: true }) accepted!: true;
}

export class ResetPasswordRequestDto implements ResetPasswordRequest {
  @ApiProperty({ description: 'Token from the e-mailed link (43 base64url characters)' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  token!: string;

  @ApiProperty({ minLength: 12, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  newPassword!: string;
}

@ApiTags('Auth')
@UseGuards(AuthOriginGuard, AuthRateLimitGuard)
@Controller('auth')
export class PasswordResetController {
  constructor(
    @Inject(PASSWORD_RESET_SERVICE) private readonly service: PasswordResetServiceContract,
    private readonly refreshCookies: RefreshCookieService,
  ) {}

  @Post('forgot-password')
  @AuthRateLimit('forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Request a password reset link. The response never reveals whether the account exists',
  })
  @ApiResponse({ status: 202, type: ForgotPasswordResponseDto })
  @ApiResponse({ status: 429, type: ApiErrorResponseDto, description: 'RATE_LIMITED' })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  async forgot(@Body() input: ForgotPasswordRequestDto): Promise<ForgotPasswordResponseDto> {
    await this.service.forgot(input.email);
    return { accepted: true };
  }

  @Post('reset-password')
  @AuthRateLimit('reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Set a new password with a single-use token; revokes every existing session',
  })
  @ApiNoContentResponse()
  @ApiResponse({
    status: 400,
    type: ApiErrorResponseDto,
    description:
      'PASSWORD_RESET_TOKEN_INVALID (wrong, expired or already used) or VALIDATION_ERROR',
  })
  @ApiResponse({ status: 429, type: ApiErrorResponseDto, description: 'RATE_LIMITED' })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  async reset(
    @Body() input: ResetPasswordRequestDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.service.reset(input.token, input.newPassword);
    this.refreshCookies.clear(response);
  }
}
