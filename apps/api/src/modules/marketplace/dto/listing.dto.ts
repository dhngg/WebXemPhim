import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
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
import type {
  ListingManagementResponse,
  PublicListingPageResponse,
  PublicListingResponse,
  SetListingPublicationRequest,
} from '@rental/shared';
import { RoomIdParamDto } from '../../rooms/dto/room.dto';

const trimText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const parseAmenities = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string'
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : value;
const MONEY_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;

export class SetListingPublicationRequestDto implements SetListingPublicationRequest {
  @ApiProperty()
  @IsBoolean()
  published!: boolean;
}

export class PublicListingQueryDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  district?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  ward?: string;

  @ApiPropertyOptional({ example: '2000000.00' })
  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN)
  minPrice?: string;

  @ApiPropertyOptional({ example: '5000000.00' })
  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN)
  maxPrice?: string;

  @ApiPropertyOptional({ type: String, isArray: true, description: 'Comma-separated UUIDs' })
  @Transform(parseAmenities)
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  amenityIds?: string[];

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

export class ListingIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  listingId!: string;
}

export class ListingRoomParamDto extends RoomIdParamDto {}

export class ListingManagementResponseDto implements ListingManagementResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) roomId!: string;
  @ApiProperty() published!: boolean;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) publishedAt!: string | null;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) unpublishedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

class PublicListingAmenityDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
}

class PublicListingImageDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uri' }) url!: string;
  @ApiPropertyOptional({ nullable: true }) altText!: string | null;
  @ApiProperty() sortOrder!: number;
}

class PublicListingRoomDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() areaSqm!: string;
  @ApiProperty() monthlyRent!: string;
  @ApiProperty() maxOccupants!: number;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiProperty({ type: PublicListingAmenityDto, isArray: true })
  amenities!: PublicListingAmenityDto[];
  @ApiProperty({ type: PublicListingImageDto, isArray: true }) images!: PublicListingImageDto[];
}

class PublicListingBuildingDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() addressLine1!: string;
  @ApiPropertyOptional({ nullable: true }) addressLine2!: string | null;
  @ApiPropertyOptional({ nullable: true }) ward!: string | null;
  @ApiPropertyOptional({ nullable: true }) district!: string | null;
  @ApiProperty() city!: string;
  @ApiPropertyOptional({ nullable: true }) postalCode!: string | null;
  @ApiProperty({ enum: ['VN'] }) countryCode!: 'VN';
}

export class PublicListingResponseDto implements PublicListingResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'date-time' }) publishedAt!: string;
  @ApiProperty({ type: PublicListingRoomDto }) room!: PublicListingRoomDto;
  @ApiProperty({ type: PublicListingBuildingDto }) building!: PublicListingBuildingDto;
}

export class PublicListingPageResponseDto implements PublicListingPageResponse {
  @ApiProperty({ type: PublicListingResponseDto, isArray: true })
  items!: PublicListingResponseDto[];
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
}
