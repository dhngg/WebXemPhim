import { Transform, Type } from 'class-transformer';
import {
  IsIn,
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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  RATE_BILLING_UNITS,
  RATE_PLAN_STATUSES,
  RATE_SERVICE_TYPES,
  type CreateRatePlanRequest,
  type RateBillingUnit,
  type RatePlanPageResponse,
  type RatePlanResponse,
  type RatePlanStatus,
  type RateServiceType,
  type StopRatePlanRequest,
  type UpdateRatePlanRequest,
} from '@rental/shared';
import { BuildingIdParamDto } from '../../buildings/dto/building.dto';
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const code = ({ value }: { value: unknown }) =>
  typeof value === 'string'
    ? value
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
    : value;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONEY = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,4})?$/;
export class CreateRatePlanRequestDto implements CreateRatePlanRequest {
  @ApiProperty() @Transform(code) @IsString() @Matches(/^[A-Z][A-Z0-9_]{0,49}$/) code!: string;
  @ApiProperty({ maxLength: 100 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
  @ApiProperty({ enum: RATE_SERVICE_TYPES })
  @IsIn(RATE_SERVICE_TYPES)
  serviceType!: RateServiceType;
  @ApiProperty({ enum: RATE_BILLING_UNITS })
  @IsIn(RATE_BILLING_UNITS)
  billingUnit!: RateBillingUnit;
  @ApiProperty() @IsString() @Matches(MONEY) unitPrice!: string;
  @ApiProperty({ format: 'date' }) @IsString() @Matches(DATE) effectiveFrom!: string;
}
export class UpdateRatePlanRequestDto implements UpdateRatePlanRequest {
  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;
  @ApiPropertyOptional({ enum: RATE_SERVICE_TYPES })
  @IsOptional()
  @IsIn(RATE_SERVICE_TYPES)
  serviceType?: RateServiceType;
  @ApiPropertyOptional({ enum: RATE_BILLING_UNITS })
  @IsOptional()
  @IsIn(RATE_BILLING_UNITS)
  billingUnit?: RateBillingUnit;
  @ApiProperty() @IsString() @Matches(MONEY) unitPrice!: string;
  @ApiProperty({ format: 'date' }) @IsString() @Matches(DATE) effectiveFrom!: string;
}
export class StopRatePlanRequestDto implements StopRatePlanRequest {
  @ApiProperty({ format: 'date', description: 'Exclusive end date' })
  @IsString()
  @Matches(DATE)
  effectiveTo!: string;
}
export class RatePlanQueryDto {
  @ApiPropertyOptional({ enum: RATE_PLAN_STATUSES })
  @IsOptional()
  @IsIn(RATE_PLAN_STATUSES)
  status?: RatePlanStatus;
  @ApiPropertyOptional({ enum: RATE_SERVICE_TYPES })
  @IsOptional()
  @IsIn(RATE_SERVICE_TYPES)
  serviceType?: RateServiceType;
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) @Max(50) limit = 20;
}
export class RatePlanIdParamDto extends BuildingIdParamDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() ratePlanId!: string;
}
export class RatePlanResponseDto implements RatePlanResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) workspaceId!: string;
  @ApiProperty({ format: 'uuid' }) buildingId!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: RATE_SERVICE_TYPES }) serviceType!: RateServiceType;
  @ApiProperty({ enum: RATE_BILLING_UNITS }) billingUnit!: RateBillingUnit;
  @ApiProperty() unitPrice!: string;
  @ApiProperty({ format: 'date' }) effectiveFrom!: string;
  @ApiPropertyOptional({ format: 'date', nullable: true }) effectiveTo!: string | null;
  @ApiProperty({ enum: RATE_PLAN_STATUSES }) status!: RatePlanStatus;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}
export class RatePlanPageResponseDto implements RatePlanPageResponse {
  @ApiProperty({ type: RatePlanResponseDto, isArray: true }) items!: RatePlanResponseDto[];
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
}
