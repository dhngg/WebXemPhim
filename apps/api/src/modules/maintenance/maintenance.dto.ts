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
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_STATUSES,
  type CancelMaintenanceRequest,
  type CreateMaintenanceRequestRequest,
  type CreateTenantMaintenanceRequest,
  type MaintenancePriority,
  type MaintenanceStatus,
  type TransitionMaintenanceRequest,
  type UpdateMaintenanceRequestRequest,
} from '@rental/shared';
import { BuildingIdParamDto } from '../buildings/dto/building.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateMaintenanceRequestDto implements CreateMaintenanceRequestRequest {
  @ApiProperty({ format: 'uuid' }) @IsUUID() roomId!: string;
  @ApiProperty({ maxLength: 150 })
  @Transform(trim)
  @IsString()
  @Matches(/\S/)
  @MaxLength(150)
  title!: string;
  @ApiProperty({ maxLength: 5000 })
  @Transform(trim)
  @IsString()
  @Matches(/\S/)
  @MaxLength(5000)
  description!: string;
  @ApiPropertyOptional({ enum: MAINTENANCE_PRIORITIES })
  @IsOptional()
  @IsIn(MAINTENANCE_PRIORITIES)
  priority?: MaintenancePriority;
}
export class CreateTenantMaintenanceDto implements CreateTenantMaintenanceRequest {
  @ApiProperty({ format: 'uuid' }) @IsUUID() contractId!: string;
  @ApiProperty({ maxLength: 150 })
  @Transform(trim)
  @IsString()
  @Matches(/\S/)
  @MaxLength(150)
  title!: string;
  @ApiProperty({ maxLength: 5000 })
  @Transform(trim)
  @IsString()
  @Matches(/\S/)
  @MaxLength(5000)
  description!: string;
  @ApiPropertyOptional({ enum: MAINTENANCE_PRIORITIES })
  @IsOptional()
  @IsIn(MAINTENANCE_PRIORITIES)
  priority?: MaintenancePriority;
}
export class UpdateMaintenanceDto implements UpdateMaintenanceRequestRequest {
  @ApiPropertyOptional({ maxLength: 150 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MaxLength(150)
  title?: string;
  @ApiPropertyOptional({ maxLength: 5000 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MaxLength(5000)
  description?: string;
  @ApiPropertyOptional({ enum: MAINTENANCE_PRIORITIES })
  @IsOptional()
  @IsIn(MAINTENANCE_PRIORITIES)
  priority?: MaintenancePriority;
  @ApiPropertyOptional({ maxLength: 1000 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
export class TransitionMaintenanceDto implements TransitionMaintenanceRequest {
  @ApiProperty({ enum: MAINTENANCE_STATUSES })
  @IsIn(MAINTENANCE_STATUSES)
  toStatus!: MaintenanceStatus;
  @ApiPropertyOptional({
    maxLength: 1000,
    description: 'Required for RESOLVED (becomes the resolution note)',
  })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
export class MaintenanceQueryDto {
  @ApiPropertyOptional({ enum: MAINTENANCE_STATUSES })
  @IsOptional()
  @IsIn(MAINTENANCE_STATUSES)
  status?: MaintenanceStatus;
  @ApiPropertyOptional({ enum: MAINTENANCE_PRIORITIES })
  @IsOptional()
  @IsIn(MAINTENANCE_PRIORITIES)
  priority?: MaintenancePriority;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() roomId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() assigneeUserId?: string;
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) @Max(50) limit = 20;
}
export class TenantMaintenanceQueryDto {
  @ApiPropertyOptional({ enum: MAINTENANCE_STATUSES })
  @IsOptional()
  @IsIn(MAINTENANCE_STATUSES)
  status?: MaintenanceStatus;
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) @Max(50) limit = 20;
}
export class MaintenanceIdParamDto extends BuildingIdParamDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() requestId!: string;
}
export class TenantMaintenanceIdParamDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() requestId!: string;
}

export class CancelMaintenanceDto implements CancelMaintenanceRequest {
  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
