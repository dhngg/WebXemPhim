import { Transform } from 'class-transformer';
import {
  IsDefined,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  BUILDING_STATUSES,
  type BuildingResponse,
  type BuildingStatus,
  type CreateBuildingRequest,
  type UpdateBuildingRequest,
} from '@rental/shared';
import { WorkspaceIdParamDto } from '../../workspaces/dto/workspace.dto';

const trimText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateBuildingRequestDto implements CreateBuildingRequest {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @Transform(trimText)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ minLength: 1, maxLength: 200 })
  @Transform(trimText)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  addressLine1!: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  ward?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  district?: string;

  @ApiProperty({ minLength: 1, maxLength: 100 })
  @Transform(trimText)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  city!: string;

  @ApiPropertyOptional({ maxLength: 20 })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @ApiPropertyOptional({ type: Number, minimum: -90, maximum: 90 })
  @ValidateIf((input: CreateBuildingRequestDto) =>
    Boolean(input.latitude !== undefined || input.longitude !== undefined),
  )
  @IsDefined()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ type: Number, minimum: -180, maximum: 180 })
  @ValidateIf((input: CreateBuildingRequestDto) =>
    Boolean(input.latitude !== undefined || input.longitude !== undefined),
  )
  @IsDefined()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-180)
  @Max(180)
  longitude?: number;
}

export class UpdateBuildingRequestDto
  extends PartialType(OmitType(CreateBuildingRequestDto, ['latitude', 'longitude'] as const))
  implements UpdateBuildingRequest
{
  @ApiPropertyOptional({ type: Number, minimum: -90, maximum: 90 })
  @ValidateIf((input: UpdateBuildingRequestDto) =>
    Boolean(input.latitude !== undefined || input.longitude !== undefined),
  )
  @IsDefined()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ type: Number, minimum: -180, maximum: 180 })
  @ValidateIf((input: UpdateBuildingRequestDto) =>
    Boolean(input.latitude !== undefined || input.longitude !== undefined),
  )
  @IsDefined()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-180)
  @Max(180)
  longitude?: number;
}

export class BuildingIdParamDto extends WorkspaceIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  buildingId!: string;
}

export class BuildingResponseDto implements BuildingResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) workspaceId!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiProperty({ enum: BUILDING_STATUSES }) status!: BuildingStatus;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) archivedAt!: string | null;
  @ApiProperty() addressLine1!: string;
  @ApiPropertyOptional({ nullable: true }) addressLine2!: string | null;
  @ApiPropertyOptional({ nullable: true }) ward!: string | null;
  @ApiPropertyOptional({ nullable: true }) district!: string | null;
  @ApiProperty() city!: string;
  @ApiPropertyOptional({ nullable: true }) postalCode!: string | null;
  @ApiProperty({ example: 'VN' }) countryCode!: 'VN';
  @ApiPropertyOptional({ type: Number, nullable: true }) latitude!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) longitude!: number | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}
