import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApplicationException } from '../../../common/errors/application-exception';
import { AuthRateLimit, AuthRateLimitGuard } from '../http/auth-rate-limit';
import { EmptyAuthRequestDto, LoginRequestDto, RegisterRequestDto } from '../dto/auth-request.dto';
import {
  ApiErrorResponseDto,
  AuthTokenResponseDto,
  AuthUserResponseDto,
} from '../dto/auth-response.dto';
import {
  AccessAuthGuard,
  AuthOriginGuard,
  getAuthenticatedUser,
  RefreshCookieService,
} from '../http/auth-http-security';
import { AUTH_SERVICE, type AuthServiceContract } from '../services/auth-service.contract';

const RATE_LIMIT_RESPONSE = {
  status: 429,
  type: ApiErrorResponseDto,
  description: 'RATE_LIMITED',
  headers: {
    'Retry-After': {
      description: 'Seconds until the limiting window resets',
      schema: { type: 'integer' as const, minimum: 1 },
    },
  },
};

@ApiTags('Auth')
@UseGuards(AuthOriginGuard, AuthRateLimitGuard)
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AUTH_SERVICE) private readonly authService: AuthServiceContract,
    private readonly refreshCookies: RefreshCookieService,
  ) {}

  @Post('register')
  @AuthRateLimit('register')
  @ApiOperation({ summary: 'Register an account and create its first refresh family' })
  @ApiCreatedResponse({ type: AuthTokenResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto, description: 'EMAIL_ALREADY_EXISTS' })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto, description: 'VALIDATION_ERROR' })
  @ApiResponse(RATE_LIMIT_RESPONSE)
  @ApiForbiddenResponse({ type: ApiErrorResponseDto, description: 'CSRF_VALIDATION_FAILED' })
  @ApiServiceUnavailableResponse({ type: ApiErrorResponseDto, description: 'AUTH_DISABLED' })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  async register(
    @Body() input: RegisterRequestDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthTokenResponseDto> {
    const result = await this.authService.register(input);
    this.refreshCookies.set(response, result.refreshToken, result.refreshExpiresAt);
    return result.response;
  }

  @Post('login')
  @AuthRateLimit('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate and create a refresh family' })
  @ApiOkResponse({ type: AuthTokenResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto, description: 'INVALID_CREDENTIALS' })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto, description: 'VALIDATION_ERROR' })
  @ApiResponse(RATE_LIMIT_RESPONSE)
  @ApiForbiddenResponse({
    type: ApiErrorResponseDto,
    description: 'ACCOUNT_DISABLED or CSRF_VALIDATION_FAILED',
  })
  @ApiServiceUnavailableResponse({ type: ApiErrorResponseDto, description: 'AUTH_DISABLED' })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  async login(
    @Body() input: LoginRequestDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthTokenResponseDto> {
    const result = await this.authService.login(input);
    this.refreshCookies.set(response, result.refreshToken, result.refreshExpiresAt);
    return result.response;
  }

  @Post('refresh')
  @AuthRateLimit('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('refreshToken')
  @ApiBody({ type: EmptyAuthRequestDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  @ApiOperation({ summary: 'Atomically rotate the HttpOnly refresh token' })
  @ApiOkResponse({ type: AuthTokenResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto, description: 'TOKEN_ALREADY_ROTATED' })
  @ApiUnauthorizedResponse({
    type: ApiErrorResponseDto,
    description: 'REFRESH_TOKEN_INVALID or TOKEN_REUSE_DETECTED',
  })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto, description: 'ACCOUNT_DISABLED' })
  @ApiResponse(RATE_LIMIT_RESPONSE)
  @ApiServiceUnavailableResponse({ type: ApiErrorResponseDto, description: 'AUTH_DISABLED' })
  async refresh(
    @Body() _input: EmptyAuthRequestDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthTokenResponseDto> {
    void _input;
    try {
      const result = await this.authService.refresh(this.refreshCookies.read(request));
      this.refreshCookies.set(response, result.refreshToken, result.refreshExpiresAt);
      return result.response;
    } catch (error) {
      if (
        error instanceof ApplicationException &&
        ['REFRESH_TOKEN_INVALID', 'TOKEN_REUSE_DETECTED', 'ACCOUNT_DISABLED'].includes(error.code)
      ) {
        this.refreshCookies.clear(response);
      }
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth('refreshToken')
  @ApiBody({ type: EmptyAuthRequestDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  @ApiOperation({ summary: 'Revoke the current refresh family' })
  @ApiNoContentResponse({ description: 'Idempotent logout' })
  @ApiServiceUnavailableResponse({ type: ApiErrorResponseDto, description: 'AUTH_DISABLED' })
  async logout(
    @Body() _input: EmptyAuthRequestDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    void _input;
    await this.authService.logout(this.refreshCookies.read(request));
    this.refreshCookies.clear(response);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AccessAuthGuard)
  @ApiBearerAuth()
  @ApiBody({ type: EmptyAuthRequestDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  @ApiOperation({ summary: 'Revoke every refresh family owned by the current user' })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({
    type: ApiErrorResponseDto,
    description: 'UNAUTHORIZED or ACCESS_TOKEN_EXPIRED',
  })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto, description: 'ACCOUNT_DISABLED' })
  @ApiServiceUnavailableResponse({ type: ApiErrorResponseDto, description: 'AUTH_DISABLED' })
  async logoutAll(
    @Body() _input: EmptyAuthRequestDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    void _input;
    await this.authService.logoutAll(getAuthenticatedUser(request).id);
    this.refreshCookies.clear(response);
  }

  @Get('me')
  @UseGuards(AccessAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the authenticated user identity' })
  @ApiOkResponse({ type: AuthUserResponseDto })
  @ApiUnauthorizedResponse({
    type: ApiErrorResponseDto,
    description: 'UNAUTHORIZED or ACCESS_TOKEN_EXPIRED',
  })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto, description: 'ACCOUNT_DISABLED' })
  @ApiServiceUnavailableResponse({ type: ApiErrorResponseDto, description: 'AUTH_DISABLED' })
  me(@Req() request: Request): Promise<AuthUserResponseDto> {
    return this.authService.me(getAuthenticatedUser(request));
  }
}
