import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
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
  DEPOSIT_RECORDABLE_KINDS,
  PAYMENT_METHODS,
  type CreateDepositEntryRequest,
  type DepositRecordableKind,
  type PaymentMethod,
  type ReverseDepositEntryRequest,
} from '@rental/shared';
import { ApiErrorResponseDto } from '../auth/dto/auth-response.dto';
import {
  AccessAuthGuard,
  AuthOriginGuard,
  getAuthenticatedUser,
} from '../auth/http/auth-http-security';
import {
  AllowArchivedWorkspaceLifecycle,
  getAuthorizedWorkspace,
  WorkspaceRoleGuard,
  WorkspaceRoles,
} from '../workspaces/http/workspace-authorization';
import { WorkspaceIdParamDto } from '../workspaces/dto/workspace.dto';
import { DepositService } from './deposit.service';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const KEY = /^[A-Za-z0-9_.:-]+$/;

export class ContractDepositParamDto extends WorkspaceIdParamDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() contractId!: string;
}
export class DepositEntryParamDto extends ContractDepositParamDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() entryId!: string;
}
export class TenantContractParamDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() contractId!: string;
}
export class CreateDepositEntryRequestDto implements CreateDepositEntryRequest {
  @ApiProperty({
    enum: DEPOSIT_RECORDABLE_KINDS,
    description: 'COLLECTION received, DEDUCTION withheld, REFUND actually handed back',
  })
  @IsIn(DEPOSIT_RECORDABLE_KINDS)
  kind!: DepositRecordableKind;
  @ApiProperty({ example: '3000000', description: 'Whole VND, greater than 0' })
  @IsString()
  @Matches(/^[1-9]\d{0,11}$/)
  amount!: string;
  @ApiPropertyOptional({
    enum: PAYMENT_METHODS,
    description: 'Required for COLLECTION and REFUND; not allowed for DEDUCTION',
  })
  @IsOptional()
  @IsIn(PAYMENT_METHODS)
  method?: PaymentMethod;
  @ApiProperty({ format: 'date-time', description: 'When it happened; not in the future' })
  @IsISO8601({ strict: true })
  occurredAt!: string;
  @ApiPropertyOptional({ maxLength: 500, description: 'Required for DEDUCTION and REFUND' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
  @ApiPropertyOptional({
    maxLength: 200,
    description:
      'Required for DEDUCTION (what it refers to) and REFUND (transfer code or cash receipt number)',
  })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;
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
export class ReverseDepositEntryRequestDto implements ReverseDepositEntryRequest {
  @ApiProperty({ maxLength: 500 })
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
export class DepositQueryDto {
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) @Max(50) limit = 20;
}

@ApiTags('Contract Deposits')
@ApiBearerAuth()
@UseGuards(AuthOriginGuard, AccessAuthGuard)
@Controller('workspaces/:workspaceId/contracts/:contractId/deposit')
export class DepositController {
  constructor(private readonly service: DepositService) {}

  @Post('entries')
  // Archived workspaces/buildings still accept an OWNER's REFUND; the repository rejects every other kind.
  @AllowArchivedWorkspaceLifecycle()
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
    @Param() params: ContractDepositParamDto,
    @Body() input: CreateDepositEntryRequestDto,
  ) {
    const { replay, body } = await this.service.create(
      getAuthorizedWorkspace(req).id,
      getAuthenticatedUser(req).id,
      params.contractId,
      input,
    );
    if (replay) res.status(200);
    return body;
  }

  @Post('entries/:entryId/reverse')
  @HttpCode(201)
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiCreatedResponse({
    description: 'Creates a compensating REVERSAL entry; 200 on an identical retry',
  })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  async reverse(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param() params: DepositEntryParamDto,
    @Body() input: ReverseDepositEntryRequestDto,
  ) {
    const { replay, body } = await this.service.reverse(
      getAuthorizedWorkspace(req).id,
      getAuthenticatedUser(req).id,
      params.contractId,
      params.entryId,
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
    @Param() params: ContractDepositParamDto,
    @Query() query: DepositQueryDto,
  ) {
    return this.service.list(
      getAuthorizedWorkspace(req).id,
      params.contractId,
      query.page,
      query.limit,
    );
  }

  @Get('entries/:entryId')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOkResponse()
  get(@Req() req: Request, @Param() params: DepositEntryParamDto) {
    return this.service.get(getAuthorizedWorkspace(req).id, params.contractId, params.entryId);
  }
}

@ApiTags('Tenant Deposits')
@ApiBearerAuth()
@UseGuards(AuthOriginGuard, AccessAuthGuard)
@Controller('contracts/me/:contractId/deposit')
export class TenantDepositController {
  constructor(private readonly service: DepositService) {}

  @Get()
  @ApiOkResponse()
  list(
    @Req() req: Request,
    @Param() params: TenantContractParamDto,
    @Query() query: DepositQueryDto,
  ) {
    return this.service.listForTenant(
      getAuthenticatedUser(req).id,
      params.contractId,
      query.page,
      query.limit,
    );
  }
}
