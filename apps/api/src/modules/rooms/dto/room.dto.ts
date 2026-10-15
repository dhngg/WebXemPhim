import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  MANAGEABLE_ROOM_STATUSES,
  ROOM_STATUSES,
  type AmenityResponse,
  type AddRoomImageRequest,
  type CreateAmenityRequest,
  type CreateRoomRequest,
  type ManageableRoomStatus,
  type RoomResponse,
  type RoomImageResponse,
  type RoomStatus,
  type UpdateRoomRequest,
  type ReorderRoomImagesRequest,
} from '@rental/shared';
import { BuildingIdParamDto } from '../../buildings/dto/building.dto';
import { WorkspaceIdParamDto } from '../../workspaces/dto/workspace.dto';

const trimText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const normalizeRoomCode = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const AREA_PATTERN = /^(?:0\.(?:0[1-9]|[1-9]\d?)|[1-9]\d{0,7}(?:\.\d{1,2})?)$/;
const MONEY_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;

export class CreateRoomRequestDto implements CreateRoomRequest {
  @ApiProperty({ minLength: 1, maxLength: 50, example: 'P101' })
  @Transform(normalizeRoomCode)
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code!: string;

  @ApiProperty({ example: '25.50', description: 'Positive decimal square metres' })
  @IsString()
  @Matches(AREA_PATTERN)
  areaSqm!: string;

  @ApiProperty({ example: '3500000.00', description: 'Non-negative VND decimal string' })
  @IsString()
  @Matches(MONEY_PATTERN)
  monthlyRent!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxOccupants?: number;

  @ApiPropertyOptional({ maxLength: 5000 })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ enum: MANAGEABLE_ROOM_STATUSES, default: 'VACANT' })
  @IsOptional()
  @IsIn(MANAGEABLE_ROOM_STATUSES)
  status?: ManageableRoomStatus;
}

export class UpdateRoomRequestDto
  extends PartialType(CreateRoomRequestDto)
  implements UpdateRoomRequest {}

export class CreateAmenityRequestDto implements CreateAmenityRequest {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @Transform(trimText)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class RoomIdParamDto extends BuildingIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  roomId!: string;
}

export class RoomAmenityParamDto extends RoomIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  amenityId!: string;
}

export class RoomImageParamDto extends RoomIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  imageId!: string;
}

export class AddRoomImageRequestDto implements AddRoomImageRequest {
  @ApiProperty({
    format: 'uri',
    maxLength: 2048,
    example: 'https://cdn.example.com/rooms/p101.jpg',
  })
  @Transform(trimText)
  @IsString()
  @MaxLength(2048)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url!: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  altText?: string;
}

export class ReorderRoomImagesRequestDto implements ReorderRoomImagesRequest {
  @ApiProperty({ type: String, isArray: true, format: 'uuid' })
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  imageIds!: string[];
}

export class AmenityIdParamDto extends WorkspaceIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  amenityId!: string;
}

export class AmenityResponseDto implements AmenityResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) workspaceId!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class RoomResponseDto implements RoomResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) workspaceId!: string;
  @ApiProperty({ format: 'uuid' }) buildingId!: string;
  @ApiProperty() code!: string;
  @ApiProperty({ example: '25.50' }) areaSqm!: string;
  @ApiProperty({ example: '3500000.00' }) monthlyRent!: string;
  @ApiProperty() maxOccupants!: number;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiProperty({ enum: ROOM_STATUSES }) status!: RoomStatus;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) archivedAt!: string | null;
  @ApiProperty({ type: AmenityResponseDto, isArray: true }) amenities!: AmenityResponseDto[];
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class RoomImageResponseDto implements RoomImageResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) workspaceId!: string;
  @ApiProperty({ format: 'uuid' }) roomId!: string;
  @ApiProperty({ format: 'uri' }) url!: string;
  @ApiPropertyOptional({ nullable: true }) altText!: string | null;
  @ApiProperty({ minimum: 0 }) sortOrder!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}
