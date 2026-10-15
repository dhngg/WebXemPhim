import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  INVOICE_ITEM_TYPES,
  INVOICE_STATUSES,
  PAYMENT_STATUSES,
  type PaymentStatus,
  type CreateInvoiceRequest,
  type InvoiceItemResponse,
  type InvoiceItemType,
  type InvoiceMissingItem,
  type InvoicePageResponse,
  type InvoiceResponse,
  type InvoiceStatus,
  type UpdateInvoiceRequest,
} from '@rental/shared';
import { BuildingIdParamDto } from '../../buildings/dto/building.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
export const INVOICE_PERIOD = /^\d{4}-(?:0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateInvoiceRequestDto implements CreateInvoiceRequest {
  @ApiProperty({ format: 'uuid' }) @IsUUID() contractId!: string;
  @ApiProperty({ example: '2026-10' }) @IsString() @Matches(INVOICE_PERIOD) period!: string;
  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  occupantCount?: number;
  @ApiPropertyOptional({
    description: 'Only needed when the tenant has several contracts in the period',
  })
  @IsOptional()
  @IsBoolean()
  billVehicles?: boolean;
  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsString()
  @Matches(DATE)
  dueDate?: string;
  @ApiPropertyOptional({ maxLength: 1000 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
export class UpdateInvoiceRequestDto implements UpdateInvoiceRequest {
  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  occupantCount?: number;
  @ApiPropertyOptional({
    description: 'Only needed when the tenant has several contracts in the period',
  })
  @IsOptional()
  @IsBoolean()
  billVehicles?: boolean;
  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsString()
  @Matches(DATE)
  dueDate?: string;
  @ApiPropertyOptional({ maxLength: 1000 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
export class InvoiceQueryDto {
  @ApiPropertyOptional({ enum: INVOICE_STATUSES })
  @IsOptional()
  @IsIn(INVOICE_STATUSES)
  status?: InvoiceStatus;
  @ApiPropertyOptional({ example: '2026-10' })
  @IsOptional()
  @IsString()
  @Matches(INVOICE_PERIOD)
  period?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() roomId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() contractId?: string;
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) @Max(50) limit = 20;
}
export class TenantInvoiceQueryDto {
  @ApiPropertyOptional({ example: '2026-10' })
  @IsOptional()
  @IsString()
  @Matches(INVOICE_PERIOD)
  period?: string;
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) @Max(50) limit = 20;
}
export class InvoiceIdParamDto extends BuildingIdParamDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() invoiceId!: string;
}
export class TenantInvoiceIdParamDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() invoiceId!: string;
}
export class InvoiceItemResponseDto implements InvoiceItemResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ enum: INVOICE_ITEM_TYPES }) itemType!: InvoiceItemType;
  @ApiProperty() code!: string;
  @ApiProperty() description!: string;
  @ApiProperty() unit!: string;
  @ApiProperty() quantity!: string;
  @ApiProperty() unitPrice!: string;
  @ApiProperty({ nullable: true }) prorationNumerator!: number | null;
  @ApiProperty({ nullable: true }) prorationDenominator!: number | null;
  @ApiProperty() amount!: string;
  @ApiProperty({ nullable: true }) ratePlanId!: string | null;
  @ApiProperty({ nullable: true }) meterReadingId!: string | null;
  @ApiProperty({ nullable: true }) meterRevision!: number | null;
  @ApiProperty({ type: 'object', additionalProperties: true }) details!: Record<string, unknown>;
}
export class InvoiceResponseDto implements InvoiceResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) workspaceId!: string;
  @ApiProperty({ format: 'uuid' }) buildingId!: string;
  @ApiProperty({ format: 'uuid' }) roomId!: string;
  @ApiProperty({ format: 'uuid' }) contractId!: string;
  @ApiProperty({ example: '2026-10' }) period!: string;
  @ApiProperty({ enum: INVOICE_STATUSES }) status!: InvoiceStatus;
  @ApiProperty({ format: 'uuid' }) tenantId!: string;
  @ApiProperty({ nullable: true }) occupantCount!: number | null;
  @ApiProperty({ nullable: true, format: 'uuid' }) occupantCountConfirmedBy!: string | null;
  @ApiProperty({ nullable: true, format: 'date-time' }) occupantCountConfirmedAt!: string | null;
  @ApiProperty({ nullable: true }) billsVehicles!: boolean | null;
  @ApiProperty({ nullable: true, format: 'date' }) dueDate!: string | null;
  @ApiProperty({ nullable: true }) notes!: string | null;
  @ApiProperty({ type: 'object', isArray: true, additionalProperties: true })
  missingItems!: InvoiceMissingItem[];
  @ApiProperty() isComplete!: boolean;
  @ApiProperty({ nullable: true, description: 'Final total; only when ISSUED' }) totalAmount!:
    string | null;
  @ApiProperty({ nullable: true, description: 'DRAFT running sum; not a final amount' })
  provisionalAmount!: string | null;
  @ApiProperty() roundingRule!: string;
  @ApiProperty({ nullable: true, description: 'Sum of adjustments; ISSUED only' })
  adjustmentsTotal!: string | null;
  @ApiProperty({ nullable: true, description: 'Confirmed payments minus reversals; ISSUED only' })
  paidTotal!: string | null;
  @ApiProperty({ nullable: true, description: 'adjustedTotal - paidTotal; never negative' })
  outstanding!: string | null;
  @ApiProperty({ nullable: true, enum: PAYMENT_STATUSES }) paymentStatus!: PaymentStatus | null;
  @ApiProperty({ nullable: true, description: 'totalAmount + adjustmentsTotal; ISSUED only' })
  adjustedTotal!: string | null;
  @ApiProperty({ type: InvoiceItemResponseDto, isArray: true }) items!: InvoiceItemResponseDto[];
  @ApiProperty({ nullable: true, format: 'date-time' }) issuedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}
export class InvoicePageResponseDto implements InvoicePageResponse {
  @ApiProperty({ type: InvoiceResponseDto, isArray: true }) items!: InvoiceResponseDto[];
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
}
