import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AccessAuthGuard,
  AuthOriginGuard,
  getAuthenticatedUser,
} from '../auth/http/auth-http-security';
import { AuthUserResponseDto } from '../auth/dto/auth-response.dto';
import { UpdateUserProfileDto } from './user-profile.dto';
import { UserProfileService } from './user-profile.service';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(AuthOriginGuard, AccessAuthGuard)
@Controller('users/me')
export class UserProfileController {
  constructor(private readonly service: UserProfileService) {}

  @Get()
  @ApiOperation({ summary: 'Get the caller profile' })
  @ApiOkResponse({ type: AuthUserResponseDto })
  get(@Req() request: Request) {
    return this.service.get(getAuthenticatedUser(request).id);
  }

  @Get('capabilities')
  @ApiOperation({ summary: 'Get the caller capabilities from current database relationships' })
  capabilities(@Req() request: Request) {
    return this.service.capabilities(getAuthenticatedUser(request).id);
  }

  @Patch()
  @ApiOperation({ summary: 'Update the caller display name (nothing else is editable)' })
  @ApiOkResponse({ type: AuthUserResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  update(@Req() request: Request, @Body() input: UpdateUserProfileDto) {
    return this.service.updateDisplayName(getAuthenticatedUser(request).id, input.displayName);
  }
}
