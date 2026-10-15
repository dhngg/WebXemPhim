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
import type { AdminReasonRequest } from '@rental/shared';
import { LANDLORD_APPLICATION_STATUSES, type LandlordApplicationStatus } from '@rental/shared';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const bool = ({ value }: { value: unknown }) =>
  value === 'true' || value === true ? true : value === 'false' || value === false ? false : value;

export class AdminReasonDto implements AdminReasonRequest {
  @ApiProperty({ maxLength: 500 })
  @Transform(trim)
  @IsString()
  @Matches(/\S/)
  @MaxLength(500)
  reason!: string;
}

class PageQueryDto {
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) @Max(100) limit = 20;
}

export class AdminUserIdParamDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() userId!: string;
}

export class AdminListingIdParamDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() listingId!: string;
}

export class AdminUserQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'DISABLED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'DISABLED'])
  status?: 'ACTIVE' | 'DISABLED';

  @ApiPropertyOptional({ description: 'Case-insensitive email fragment' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class AdminListingQueryDto extends PageQueryDto {
  @ApiPropertyOptional() @Transform(bool) @IsOptional() @IsBoolean() hidden?: boolean;
  @ApiPropertyOptional() @Transform(bool) @IsOptional() @IsBoolean() published?: boolean;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() workspaceId?: string;
}

export class AdminAuditQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() actorUserId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) action?: string;
  @ApiPropertyOptional({ enum: ['USER', 'LISTING'] })
  @IsOptional()
  @IsIn(['USER', 'LISTING'])
  targetType?: 'USER' | 'LISTING';
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() targetId?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @Type(() => Date) from?: Date;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @Type(() => Date) to?: Date;
}

export class AdminLandlordApplicationQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: LANDLORD_APPLICATION_STATUSES })
  @IsOptional()
  @IsIn(LANDLORD_APPLICATION_STATUSES)
  status?: LandlordApplicationStatus;
}

export class AdminLandlordApplicationIdParamDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() applicationId!: string;
}
