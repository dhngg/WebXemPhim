import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  AccessAuthGuard,
  AuthOriginGuard,
  getAuthenticatedUser,
} from '../auth/http/auth-http-security';
import { PlatformAdminGuard } from './admin.guard';
import {
  AdminAuditQueryDto,
  AdminListingIdParamDto,
  AdminListingQueryDto,
  AdminReasonDto,
  AdminUserIdParamDto,
  AdminUserQueryDto,
} from './admin.dto';
import { AdminService } from './admin.service';
import { LandlordApplicationService } from '../onboarding/landlord-application.service';
import { AdminLandlordApplicationIdParamDto, AdminLandlordApplicationQueryDto } from './admin.dto';

/**
 * Platform moderation surface only: accounts, listing visibility and audit. There is deliberately no
 * route that reads or writes rooms, contracts, meters, invoices, payments or deposits.
 */
@ApiTags('Platform Admin')
@ApiBearerAuth()
@UseGuards(AuthOriginGuard, AccessAuthGuard, PlatformAdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly service: AdminService,
    private readonly applications: LandlordApplicationService,
  ) {}

  @Get('landlord-applications')
  listLandlordApplications(@Query() query: AdminLandlordApplicationQueryDto) {
    return this.applications.list(query.status, query.page, query.limit);
  }

  @Post('landlord-applications/:applicationId/approve')
  @HttpCode(200)
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  approveLandlordApplication(
    @Req() req: Request,
    @Param() params: AdminLandlordApplicationIdParamDto,
    @Body() body: AdminReasonDto,
  ) {
    return this.applications.decide(
      getAuthenticatedUser(req).id,
      params.applicationId,
      'APPROVED',
      body.reason,
    );
  }

  @Post('landlord-applications/:applicationId/reject')
  @HttpCode(200)
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  rejectLandlordApplication(
    @Req() req: Request,
    @Param() params: AdminLandlordApplicationIdParamDto,
    @Body() body: AdminReasonDto,
  ) {
    return this.applications.decide(
      getAuthenticatedUser(req).id,
      params.applicationId,
      'REJECTED',
      body.reason,
    );
  }

  @Get('users')
  @ApiOkResponse()
  listUsers(@Query() query: AdminUserQueryDto) {
    return this.service.listUsers(query);
  }

  @Get('users/:userId')
  @ApiOkResponse()
  getUser(@Param() params: AdminUserIdParamDto) {
    return this.service.getUser(params.userId);
  }

  @Post('users/:userId/lock')
  @HttpCode(200)
  @ApiOkResponse()
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  lock(@Req() req: Request, @Param() params: AdminUserIdParamDto, @Body() body: AdminReasonDto) {
    return this.service.setUserLock(getAuthenticatedUser(req).id, params.userId, true, body.reason);
  }

  @Post('users/:userId/unlock')
  @HttpCode(200)
  @ApiOkResponse()
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  unlock(@Req() req: Request, @Param() params: AdminUserIdParamDto, @Body() body: AdminReasonDto) {
    return this.service.setUserLock(
      getAuthenticatedUser(req).id,
      params.userId,
      false,
      body.reason,
    );
  }

  @Get('listings')
  @ApiOkResponse()
  listListings(@Query() query: AdminListingQueryDto) {
    return this.service.listListings(query);
  }

  @Post('listings/:listingId/hide')
  @HttpCode(200)
  @ApiOkResponse()
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  hide(@Req() req: Request, @Param() params: AdminListingIdParamDto, @Body() body: AdminReasonDto) {
    return this.service.setListingHidden(
      getAuthenticatedUser(req).id,
      params.listingId,
      true,
      body.reason,
    );
  }

  @Post('listings/:listingId/restore')
  @HttpCode(200)
  @ApiOkResponse()
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  restore(
    @Req() req: Request,
    @Param() params: AdminListingIdParamDto,
    @Body() body: AdminReasonDto,
  ) {
    return this.service.setListingHidden(
      getAuthenticatedUser(req).id,
      params.listingId,
      false,
      body.reason,
    );
  }

  @Get('audit-logs')
  @ApiOkResponse()
  listAudit(@Query() query: AdminAuditQueryDto) {
    return this.service.listAudit(query);
  }
}
