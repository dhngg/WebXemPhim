import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../auth/dto/auth-response.dto';
import {
  AccessAuthGuard,
  AuthOriginGuard,
  getAuthenticatedUser,
} from '../../auth/http/auth-http-security';
import {
  getAuthorizedWorkspace,
  WorkspaceRoleGuard,
  WorkspaceRoles,
} from '../../workspaces/http/workspace-authorization';
import { BuildingIdParamDto } from '../../buildings/dto/building.dto';
import {
  CreateInvoiceRequestDto,
  InvoiceIdParamDto,
  InvoicePageResponseDto,
  InvoiceQueryDto,
  InvoiceResponseDto,
  TenantInvoiceIdParamDto,
  TenantInvoiceQueryDto,
  UpdateInvoiceRequestDto,
} from '../dto/invoice.dto';
import { InvoiceService } from '../services/invoice.service';

@ApiTags('Invoices')
@ApiBearerAuth()
@UseGuards(AuthOriginGuard, AccessAuthGuard)
@Controller('workspaces/:workspaceId/buildings/:buildingId/invoices')
export class InvoiceController {
  constructor(private readonly service: InvoiceService) {}

  @Post()
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiCreatedResponse({ type: InvoiceResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  create(
    @Req() req: Request,
    @Param() params: BuildingIdParamDto,
    @Body() input: CreateInvoiceRequestDto,
  ) {
    return this.service.create(
      getAuthorizedWorkspace(req).id,
      getAuthenticatedUser(req).id,
      params.buildingId,
      input,
    );
  }

  @Get()
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOkResponse({ type: InvoicePageResponseDto })
  list(@Req() req: Request, @Param() params: BuildingIdParamDto, @Query() query: InvoiceQueryDto) {
    return this.service.list(getAuthorizedWorkspace(req).id, params.buildingId, query);
  }

  @Get(':invoiceId')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOkResponse({ type: InvoiceResponseDto })
  get(@Req() req: Request, @Param() params: InvoiceIdParamDto) {
    return this.service.get(getAuthorizedWorkspace(req).id, params.buildingId, params.invoiceId);
  }

  @Patch(':invoiceId')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOkResponse({ type: InvoiceResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  update(
    @Req() req: Request,
    @Param() params: InvoiceIdParamDto,
    @Body() input: UpdateInvoiceRequestDto,
  ) {
    return this.service.update(
      getAuthorizedWorkspace(req).id,
      getAuthenticatedUser(req).id,
      params.buildingId,
      params.invoiceId,
      input,
    );
  }

  @Post(':invoiceId/issue')
  @HttpCode(200)
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOkResponse({ type: InvoiceResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  issue(@Req() req: Request, @Param() params: InvoiceIdParamDto) {
    return this.service.issue(
      getAuthorizedWorkspace(req).id,
      getAuthenticatedUser(req).id,
      params.buildingId,
      params.invoiceId,
    );
  }

  @Delete(':invoiceId')
  @HttpCode(204)
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiNoContentResponse()
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  async remove(@Req() req: Request, @Param() params: InvoiceIdParamDto) {
    await this.service.remove(
      getAuthorizedWorkspace(req).id,
      getAuthenticatedUser(req).id,
      params.buildingId,
      params.invoiceId,
    );
  }
}

@ApiTags('Tenant Invoices')
@ApiBearerAuth()
@UseGuards(AuthOriginGuard, AccessAuthGuard)
@Controller('invoices/me')
export class TenantInvoiceController {
  constructor(private readonly service: InvoiceService) {}

  @Get()
  @ApiOkResponse({ type: InvoicePageResponseDto })
  list(@Req() req: Request, @Query() query: TenantInvoiceQueryDto) {
    return this.service.listForTenant(getAuthenticatedUser(req).id, query);
  }

  @Get(':invoiceId')
  @ApiOkResponse({ type: InvoiceResponseDto })
  get(@Req() req: Request, @Param() params: TenantInvoiceIdParamDto) {
    return this.service.getForTenant(getAuthenticatedUser(req).id, params.invoiceId);
  }
}
