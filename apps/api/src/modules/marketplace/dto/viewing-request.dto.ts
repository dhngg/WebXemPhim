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
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  VIEWING_REQUEST_STATUSES,
  type CreateViewingRequestRequest,
  type DecideViewingRequestRequest,
  type ViewingRequestPageResponse,
  type ViewingRequestResponse,
  type ViewingRequestStatus,
} from '@rental/shared';
import { WorkspaceIdParamDto } from '../../workspaces/dto/workspace.dto';

const trimText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateViewingRequestDto implements CreateViewingRequestRequest {
  @ApiProperty({ format: 'date-time', example: '2026-10-20T03:00:00.000Z' })
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  scheduledAt!: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}

export class DecideViewingRequestDto implements DecideViewingRequestRequest {
  @ApiPropertyOptional({ maxLength: 1000 })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class ViewingRequestQueryDto {
  @ApiPropertyOptional({ enum: VIEWING_REQUEST_STATUSES })
  @IsOptional()
  @IsIn(VIEWING_REQUEST_STATUSES)
  status?: ViewingRequestStatus;

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

export class ListingViewingRequestParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  listingId!: string;
}

export class ViewingRequestIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  requestId!: string;
}

export class WorkspaceViewingRequestParamDto extends WorkspaceIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  requestId!: string;
}

class ViewingRequesterDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'email' }) email!: string;
  @ApiPropertyOptional({ nullable: true }) displayName!: string | null;
}

class ViewingRoomSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() buildingName!: string;
}

export class ViewingRequestResponseDto implements ViewingRequestResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) listingId!: string;
  @ApiProperty({ format: 'date-time' }) scheduledAt!: string;
  @ApiPropertyOptional({ nullable: true }) message!: string | null;
  @ApiProperty({ enum: VIEWING_REQUEST_STATUSES }) status!: ViewingRequestStatus;
  @ApiPropertyOptional({ nullable: true }) decisionNote!: string | null;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) decidedAt!: string | null;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) cancelledAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: ViewingRequesterDto }) requester!: ViewingRequesterDto;
  @ApiProperty({ type: ViewingRoomSummaryDto }) room!: ViewingRoomSummaryDto;
}

export class ViewingRequestPageResponseDto implements ViewingRequestPageResponse {
  @ApiProperty({ type: ViewingRequestResponseDto, isArray: true })
  items!: ViewingRequestResponseDto[];
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
}
