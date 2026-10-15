import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
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
  TENANT_STATUSES,
  type CreateTenantRequest,
  type TenantPageResponse,
  type TenantResponse,
  type TenantStatus,
  type UpdateTenantRequest,
} from '@rental/shared';
import { WorkspaceIdParamDto } from '../../workspaces/dto/workspace.dto';

const trimText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const normalizeEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const normalizePhone = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.replace(/[\s().-]/g, '') : value;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CreateTenantRequestDto implements CreateTenantRequest {
  @ApiProperty({ minLength: 1, maxLength: 150 })
  @Transform(trimText)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  fullName!: string;

  @ApiPropertyOptional({ example: '+84901234567' })
  @Transform(normalizePhone)
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{7,15}$/)
  phone?: string;

  @ApiPropertyOptional({ format: 'email', maxLength: 254 })
  @Transform(normalizeEmail)
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({ format: 'date', example: '1995-05-20' })
  @IsOptional()
  @IsString()
  @Matches(DATE_PATTERN)
  dateOfBirth?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

export class UpdateTenantRequestDto implements UpdateTenantRequest {
  @ApiPropertyOptional({ minLength: 1, maxLength: 150 })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  fullName?: string;

  @ApiPropertyOptional({ nullable: true, example: '+84901234567' })
  @Transform(normalizePhone)
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{7,15}$/)
  phone?: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'email', maxLength: 254 })
  @Transform(normalizeEmail)
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'date' })
  @IsOptional()
  @IsString()
  @Matches(DATE_PATTERN)
  dateOfBirth?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 5000 })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;
}

export class TenantQueryDto {
  @ApiPropertyOptional({ enum: TENANT_STATUSES })
  @IsOptional()
  @IsIn(TENANT_STATUSES)
  status?: TenantStatus;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}

export class TenantIdParamDto extends WorkspaceIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  tenantId!: string;
}

export class TenantResponseDto implements TenantResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) workspaceId!: string;
  @ApiProperty() fullName!: string;
  @ApiPropertyOptional({ nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ format: 'email', nullable: true }) email!: string | null;
  @ApiPropertyOptional({ format: 'date', nullable: true }) dateOfBirth!: string | null;
  @ApiPropertyOptional({ nullable: true }) address!: string | null;
  @ApiPropertyOptional({ nullable: true }) notes!: string | null;
  @ApiProperty({ enum: TENANT_STATUSES }) status!: TenantStatus;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) archivedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class TenantPageResponseDto implements TenantPageResponse {
  @ApiProperty({ type: TenantResponseDto, isArray: true }) items!: TenantResponseDto[];
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
}
