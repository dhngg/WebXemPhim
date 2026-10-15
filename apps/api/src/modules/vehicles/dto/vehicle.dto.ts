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
  VEHICLE_STATUSES,
  type CreateVehicleRequest,
  type StopVehicleRequest,
  type UpdateVehicleRequest,
  type VehiclePageResponse,
  type VehicleResponse,
  type VehicleStatus,
} from '@rental/shared';
import { WorkspaceIdParamDto } from '../../workspaces/dto/workspace.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const normalizePlate = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.toUpperCase().replace(/[^A-Z0-9]/g, '') : value;
export class CreateVehicleRequestDto implements CreateVehicleRequest {
  @ApiProperty({ format: 'uuid' }) @IsUUID() tenantId!: string;
  @ApiProperty({ example: '59A112345' })
  @Transform(normalizePlate)
  @IsString()
  @Matches(/^[A-Z0-9]{5,15}$/)
  licensePlate!: string;
  @ApiProperty({ maxLength: 50, example: 'MOTORBIKE' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  vehicleType!: string;
  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string;
  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;
  @ApiPropertyOptional({ maxLength: 50 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  color?: string;
  @ApiPropertyOptional({ maxLength: 5000 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}
export class UpdateVehicleRequestDto implements UpdateVehicleRequest {
  @ApiPropertyOptional()
  @Transform(normalizePlate)
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9]{5,15}$/)
  licensePlate?: string;
  @ApiPropertyOptional({ maxLength: 50 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  vehicleType?: string;
  @ApiPropertyOptional({ nullable: true, maxLength: 100 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string | null;
  @ApiPropertyOptional({ nullable: true, maxLength: 100 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string | null;
  @ApiPropertyOptional({ nullable: true, maxLength: 50 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  color?: string | null;
  @ApiPropertyOptional({ nullable: true, maxLength: 5000 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;
}
export class StopVehicleRequestDto implements StopVehicleRequest {
  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
export class VehicleQueryDto {
  @ApiPropertyOptional({ enum: VEHICLE_STATUSES })
  @IsOptional()
  @IsIn(VEHICLE_STATUSES)
  status?: VehicleStatus;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() tenantId?: string;
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) @Max(50) limit = 20;
}
export class VehicleIdParamDto extends WorkspaceIdParamDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() vehicleId!: string;
}
class VehicleTenantDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() fullName!: string;
}
export class VehicleResponseDto implements VehicleResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) workspaceId!: string;
  @ApiProperty({ format: 'uuid' }) tenantId!: string;
  @ApiProperty() licensePlate!: string;
  @ApiProperty() vehicleType!: string;
  @ApiPropertyOptional({ nullable: true }) brand!: string | null;
  @ApiPropertyOptional({ nullable: true }) model!: string | null;
  @ApiPropertyOptional({ nullable: true }) color!: string | null;
  @ApiPropertyOptional({ nullable: true }) notes!: string | null;
  @ApiProperty({ enum: VEHICLE_STATUSES }) status!: VehicleStatus;
  @ApiPropertyOptional({ nullable: true, format: 'date-time' }) inactiveAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) inactiveReason!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: VehicleTenantDto }) tenant!: VehicleTenantDto;
}
export class VehiclePageResponseDto implements VehiclePageResponse {
  @ApiProperty({ type: VehicleResponseDto, isArray: true }) items!: VehicleResponseDto[];
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
}
