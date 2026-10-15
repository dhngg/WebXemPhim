import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../auth/dto/auth-response.dto';
import {
  AccessAuthGuard,
  AuthOriginGuard,
  getAuthenticatedUser,
} from '../../auth/http/auth-http-security';
import {
  CreateViewingRequestDto,
  ListingViewingRequestParamDto,
  ViewingRequestIdParamDto,
  ViewingRequestPageResponseDto,
  ViewingRequestQueryDto,
  ViewingRequestResponseDto,
} from '../dto/viewing-request.dto';
import { ViewingRequestService } from '../services/viewing-request.service';

@ApiTags('Viewing Requests')
@ApiBearerAuth()
@UseGuards(AuthOriginGuard, AccessAuthGuard)
@Controller()
export class ViewingRequestController {
  constructor(private readonly service: ViewingRequestService) {}

  @Post('listings/:listingId/viewing-requests')
  @ApiOperation({ summary: 'Request a future viewing for an eligible public listing' })
  @ApiCreatedResponse({ type: ViewingRequestResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  create(
    @Param() params: ListingViewingRequestParamDto,
    @Req() request: Request,
    @Body() input: CreateViewingRequestDto,
  ): Promise<ViewingRequestResponseDto> {
    return this.service.create(getAuthenticatedUser(request).id, params.listingId, input);
  }

  @Get('viewing-requests/me')
  @ApiOperation({ summary: 'List only the authenticated user viewing requests' })
  @ApiOkResponse({ type: ViewingRequestPageResponseDto })
  listMine(
    @Req() request: Request,
    @Query() query: ViewingRequestQueryDto,
  ): Promise<ViewingRequestPageResponseDto> {
    return this.service.listMine(getAuthenticatedUser(request).id, query);
  }

  @Patch('viewing-requests/:requestId/cancel')
  @ApiOperation({ summary: 'Cancel the authenticated user own pending or confirmed request' })
  @ApiOkResponse({ type: ViewingRequestResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  cancel(
    @Param() params: ViewingRequestIdParamDto,
    @Req() request: Request,
  ): Promise<ViewingRequestResponseDto> {
    return this.service.cancel(getAuthenticatedUser(request).id, params.requestId);
  }
}
