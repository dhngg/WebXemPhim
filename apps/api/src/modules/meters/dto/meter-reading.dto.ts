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
  METER_TYPES,
  type AdjustMeterReadingRequest,
  type CreateMeterReadingRequest,
  type MeterReadingAdjustmentResponse,
  type MeterReadingPageResponse,
  type MeterReadingResponse,
  type MeterType,
} from '@rental/shared';
import { RoomIdParamDto } from '../../rooms/dto/room.dto';
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
export const PERIOD = /^\d{4}-(?:0[1-9]|1[0-2])$/;
const READING = /^(?:0|[1-9]\d{0,10})(?:\.\d{1,3})?$/;
export class CreateMeterReadingRequestDto implements CreateMeterReadingRequest {
  @ApiProperty({ enum: METER_TYPES }) @IsIn(METER_TYPES) meterType!: MeterType;
  @ApiProperty({ example: '2026-10' }) @IsString() @Matches(PERIOD) period!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(READING) previousReading?: string;
  @ApiProperty() @IsString() @Matches(READING) currentReading!: string;
}
export class AdjustMeterReadingRequestDto implements AdjustMeterReadingRequest {
  @ApiProperty() @IsString() @Matches(READING) currentReading!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(READING) previousReading?: string;
  @ApiProperty({ maxLength: 500 })
  @Transform(trim)
  @IsString()
  @Matches(/\S/)
  @MaxLength(500)
  reason!: string;
}
export class MeterReadingQueryDto {
  @ApiPropertyOptional({ enum: METER_TYPES })
  @IsOptional()
  @IsIn(METER_TYPES)
  meterType?: MeterType;
  @ApiPropertyOptional({ example: '2026-10' })
  @IsOptional()
  @IsString()
  @Matches(PERIOD)
  period?: string;
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) @Max(50) limit = 20;
}
export class MeterReadingIdParamDto extends RoomIdParamDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() readingId!: string;
}
export class MeterReadingAdjustmentResponseDto implements MeterReadingAdjustmentResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() revision!: number;
  @ApiProperty() oldPreviousReading!: string;
  @ApiProperty() oldCurrentReading!: string;
  @ApiProperty() newPreviousReading!: string;
  @ApiProperty() newCurrentReading!: string;
  @ApiProperty() reason!: string;
  @ApiProperty({ format: 'uuid' }) adjustedBy!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}
export class MeterReadingResponseDto implements MeterReadingResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) workspaceId!: string;
  @ApiProperty({ format: 'uuid' }) buildingId!: string;
  @ApiProperty({ format: 'uuid' }) roomId!: string;
  @ApiProperty({ enum: METER_TYPES }) meterType!: MeterType;
  @ApiProperty({ example: '2026-10' }) period!: string;
  @ApiProperty() previousReading!: string;
  @ApiProperty() currentReading!: string;
  @ApiProperty() consumption!: string;
  @ApiProperty() revision!: number;
  @ApiProperty({ format: 'uuid' }) recordedBy!: string;
  @ApiProperty({ type: MeterReadingAdjustmentResponseDto, isArray: true })
  adjustments!: MeterReadingAdjustmentResponseDto[];
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}
export class MeterReadingPageResponseDto implements MeterReadingPageResponse {
  @ApiProperty({ type: MeterReadingResponseDto, isArray: true }) items!: MeterReadingResponseDto[];
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
}
