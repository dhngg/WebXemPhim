import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
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
import {
  PAYMENT_METHODS,
  type CreateInvoicePaymentRequest,
  type PaymentMethod,
  type ReverseInvoicePaymentRequest,
} from '@rental/shared';
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
import { InvoicePaymentService } from './invoice-payment.service';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const KEY = /^[A-Za-z0-9_.:-]+$/;

export class CreateInvoicePaymentRequestDto implements CreateInvoicePaymentRequest {
  @ApiProperty({ example: '500000', description: 'Whole VND, greater than 0' })
  @IsString()
  @Matches(/^[1-9]\d{0,11}$/)
  amount!: string;
  @ApiProperty({ enum: PAYMENT_METHODS }) @IsIn(PAYMENT_METHODS) method!: PaymentMethod;
  @ApiProperty({
    format: 'date-time',
    description: 'When the money was received; not in the future',
  })
  @IsISO8601({ strict: true })
  receivedAt!: string;
  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
  @ApiProperty({ minLength: 8, maxLength: 100 })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  @Matches(KEY)
  idempotencyKey!: string;
}
export class ReverseInvoicePaymentRequestDto implements ReverseInvoicePaymentRequest {
  @ApiProperty({ maxLength: 500, description: 'Why the confirmation is undone' })
  @Transform(trim)
  @IsString()
  @Matches(/\S/)
  @MaxLength(500)
  reason!: string;
  @ApiProperty({ minLength: 8, maxLength: 100 })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  @Matches(KEY)
  idempotencyKey!: string;
}
export class PaymentIdParamDto extends InvoiceIdParamDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() paymentId!: string;
}
export class PaymentQueryDto {
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) @Max(50) limit = 20;
}

@ApiTags('Invoice Payments')
@ApiBearerAuth()
@UseGuards(AuthOriginGuard, AccessAuthGuard)
@Controller('workspaces/:workspaceId/buildings/:buildingId/invoices/:invoiceId/payments')
export class InvoicePaymentController {
  constructor(private readonly service: InvoicePaymentService) {}

  @Post()
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiCreatedResponse({
    description: '201 when recorded, 200 when an identical retry returns the original',
  })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  async create(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param() params: InvoiceIdParamDto,
    @Body() input: CreateInvoicePaymentRequestDto,
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

  @Post(':paymentId/reverse')
  @HttpCode(201)
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiCreatedResponse({ description: 'Creates a REVERSAL entry; 200 on an identical retry' })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  async reverse(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param() params: PaymentIdParamDto,
    @Body() input: ReverseInvoicePaymentRequestDto,
  ) {
    const { replay, body } = await this.service.reverse(
      getAuthorizedWorkspace(req).id,
      getAuthenticatedUser(req).id,
      params.buildingId,
      params.invoiceId,
      params.paymentId,
      input,
    );
    if (replay) res.status(200);
    return body;
  }

  @Get()
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOkResponse()
  list(@Req() req: Request, @Param() params: InvoiceIdParamDto, @Query() query: PaymentQueryDto) {
    return this.service.list(
      getAuthorizedWorkspace(req).id,
      params.buildingId,
      params.invoiceId,
      query.page,
      query.limit,
    );
  }

  @Get(':paymentId')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOkResponse()
  get(@Req() req: Request, @Param() params: PaymentIdParamDto) {
    return this.service.get(
      getAuthorizedWorkspace(req).id,
      params.buildingId,
      params.invoiceId,
      params.paymentId,
    );
  }
}

@ApiTags('Tenant Invoices')
@ApiBearerAuth()
@UseGuards(AuthOriginGuard, AccessAuthGuard)
@Controller('invoices/me/:invoiceId/payments')
export class TenantInvoicePaymentController {
  constructor(private readonly service: InvoicePaymentService) {}

  @Get()
  @ApiOkResponse()
  list(
    @Req() req: Request,
    @Param() params: TenantInvoiceIdParamDto,
    @Query() query: PaymentQueryDto,
  ) {
    return this.service.listForTenant(
      getAuthenticatedUser(req).id,
      params.invoiceId,
      query.page,
      query.limit,
    );
  }
}
