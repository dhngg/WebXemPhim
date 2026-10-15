import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength, Matches } from 'class-validator';
import type { Request } from 'express';
import {
  AccessAuthGuard,
  AuthOriginGuard,
  getAuthenticatedUser,
} from '../auth/http/auth-http-security';
import { LandlordApplicationService } from './landlord-application.service';

class SubmitLandlordApplicationDto {
  @IsString() @Matches(/\S/) @MaxLength(1000) reason!: string;
}

@ApiTags('Landlord Applications')
@ApiBearerAuth()
@UseGuards(AuthOriginGuard, AccessAuthGuard)
@Controller('landlord-applications/me')
export class LandlordApplicationController {
  constructor(private readonly service: LandlordApplicationService) {}
  @Get() mine(@Req() req: Request) {
    return this.service.mine(getAuthenticatedUser(req).id);
  }
  @Post()
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  submit(@Req() req: Request, @Body() body: SubmitLandlordApplicationDto) {
    return this.service.submit(getAuthenticatedUser(req).id, body.reason.trim());
  }
}
