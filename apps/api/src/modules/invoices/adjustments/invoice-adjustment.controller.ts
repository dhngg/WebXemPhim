import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import type { CreateInvoiceAdjustmentRequest } from '@rental/shared';
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
import { InvoiceIdParamDto, TenantInvoiceIdParamDto } from '../dto/invoice.dto';
import { InvoiceAdjustmentService } from './invoice-adjustment.service';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateInvoiceAdjustmentRequestDto implements CreateInvoiceAdjustmentRequest {
  @ApiProperty({
    example: '-50000',
    description: 'Signed VND; rounded ROUND_HALF_UP to 1 VND; never 0',
  })
  @IsString()
  @Matches(/^-?(?:0|[1-9]\d{0,9})(?:\.\d{1,4})?$/)
  amount!: string;
  @ApiProperty({ maxLength: 500 })
  @Transform(trim)
  @IsString()
  @Matches(/\S/)
  @MaxLength(500)
  reason!: string;
  @ApiProperty({ minLength: 8, maxLength: 100, description: 'Client-generated retry key' })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  @Matches(/^[A-Za-z0-9_.:-]+$/)
  idempotencyKey!: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() referenceAdjustmentId?: string;
}
export class AdjustmentIdParamDto extends InvoiceIdParamDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() adjustmentId!: string;
}
export class AdjustmentQueryDto {
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) @Max(50) limit = 20;
}

@ApiTags('Invoice Adjustments')
@ApiBearerAuth()
@UseGuards(AuthOriginGuard, AccessAuthGuard)
@Controller('workspaces/:workspaceId/buildings/:buildingId/invoices/:invoiceId/adjustments')
export class InvoiceAdjustmentController {
  constructor(private readonly service: InvoiceAdjustmentService) {}

  @Post()
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiCreatedResponse({
    description: '201 when created, 200 when an identical retry returns the original',
  })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  async create(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param() params: InvoiceIdParamDto,
    @Body() input: CreateInvoiceAdjustmentRequestDto,
  ) {
    const { replay, body } = await this.service.create(
      getAuthorizedWorkspace(req).id,
      getAuthenticatedUser(req).id,
      params.buildingId,
      params.invoiceId,
      input,
    );
    if (replay) res.status(200);
    return body;
  }

  @Get()
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOkResponse()
  list(
    @Req() req: Request,
    @Param() params: InvoiceIdParamDto,
    @Query() query: AdjustmentQueryDto,
  ) {
    return this.service.list(
      getAuthorizedWorkspace(req).id,
      params.buildingId,
      params.invoiceId,
      query.page,
      query.limit,
    );
  }

  @Get(':adjustmentId')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOkResponse()
  get(@Req() req: Request, @Param() params: AdjustmentIdParamDto) {
    return this.service.get(
      getAuthorizedWorkspace(req).id,
      params.buildingId,
      params.invoiceId,
      params.adjustmentId,
    );
  }
}

@ApiTags('Tenant Invoices')
@ApiBearerAuth()
@UseGuards(AuthOriginGuard, AccessAuthGuard)
@Controller('invoices/me/:invoiceId/adjustments')
export class TenantInvoiceAdjustmentController {
  constructor(private readonly service: InvoiceAdjustmentService) {}

  @Get()
  @ApiOkResponse()
  list(
    @Req() req: Request,
    @Param() params: TenantInvoiceIdParamDto,
    @Query() query: AdjustmentQueryDto,
  ) {
    return this.service.listForTenant(
      getAuthenticatedUser(req).id,
      params.invoiceId,
      query.page,
      query.limit,
    );
  }
}
