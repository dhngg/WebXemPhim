import { Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  AccessAuthGuard,
  AuthOriginGuard,
  getAuthenticatedUser,
} from '../auth/http/auth-http-security';
import { NotificationIdParamDto, NotificationQueryDto } from './notification.dto';
import { NotificationService } from './notification.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(AuthOriginGuard, AccessAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  @Get()
  @ApiOkResponse()
  list(@Req() req: Request, @Query() query: NotificationQueryDto) {
    return this.service.list(getAuthenticatedUser(req).id, query);
  }

  @Get('unread-count')
  @ApiOkResponse()
  unreadCount(@Req() req: Request) {
    return this.service.unreadCount(getAuthenticatedUser(req).id);
  }

  @Post('read-all')
  @HttpCode(200)
  @ApiOkResponse()
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  markAllRead(@Req() req: Request) {
    return this.service.markAllRead(getAuthenticatedUser(req).id);
  }

  @Post(':notificationId/read')
  @HttpCode(200)
  @ApiOkResponse()
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  markRead(@Req() req: Request, @Param() params: NotificationIdParamDto) {
    return this.service.markRead(getAuthenticatedUser(req).id, params.notificationId);
  }
}
