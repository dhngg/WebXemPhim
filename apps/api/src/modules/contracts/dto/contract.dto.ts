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
  CONTRACT_PHASES,
  CONTRACT_STATUSES,
  type ContractPageResponse,
  type ContractPhase,
  type ContractResponse,
  type ContractStatus,
  type CreateContractRequest,
  type EndContractRequest,
  type UpdateContractRequest,
} from '@rental/shared';
import { WorkspaceIdParamDto } from '../../workspaces/dto/workspace.dto';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONEY_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;
const trimText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateContractRequestDto implements CreateContractRequest {
  @ApiProperty({ format: 'uuid' }) @IsUUID() roomId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() tenantId!: string;
  @ApiProperty({ format: 'date' }) @IsString() @Matches(DATE_PATTERN) startDate!: string;
  @ApiProperty({ format: 'date' }) @IsString() @Matches(DATE_PATTERN) endDate!: string;
  @ApiProperty({ example: '3500000.00' }) @IsString() @Matches(MONEY_PATTERN) monthlyRent!: string;
  @ApiPropertyOptional({ maxLength: 5000 })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

export class UpdateContractRequestDto implements UpdateContractRequest {
  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsString()
  @Matches(DATE_PATTERN)
  startDate?: string;
  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsString()
  @Matches(DATE_PATTERN)
  endDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(MONEY_PATTERN) monthlyRent?: string;
  @ApiPropertyOptional({ nullable: true, maxLength: 5000 })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;
}

export class EndContractRequestDto implements EndContractRequest {
  @ApiPropertyOptional({
    format: 'date',
    description:
      'Required for a contract that has started; omit it to cancel a contract that has not started.',
  })
  @IsOptional()
  @IsString()
  @Matches(DATE_PATTERN)
  endDate?: string;
}

export class ContractQueryDto {
  @ApiPropertyOptional({ enum: CONTRACT_STATUSES })
  @IsOptional()
  @IsIn(CONTRACT_STATUSES)
  status?: ContractStatus;
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) @Max(50) limit = 20;
}

export class ContractIdParamDto extends WorkspaceIdParamDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() contractId!: string;
}

export class MyContractIdParamDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() contractId!: string;
}

class ContractRoomDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty({ format: 'uuid' }) buildingId!: string;
}
class ContractTenantDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() fullName!: string;
}

export class ContractResponseDto implements ContractResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) workspaceId!: string;
  @ApiProperty({ format: 'uuid' }) roomId!: string;
  @ApiProperty({ format: 'uuid' }) tenantId!: string;
  @ApiProperty({ format: 'date' }) startDate!: string;
  @ApiProperty({ format: 'date' }) endDate!: string;
  @ApiProperty() monthlyRent!: string;
  @ApiProperty({ enum: CONTRACT_STATUSES }) status!: ContractStatus;
  @ApiProperty({
    enum: CONTRACT_PHASES,
    description: 'Derived from the dates (Asia/Ho_Chi_Minh), not stored.',
  })
  phase!: ContractPhase;
  @ApiPropertyOptional({ nullable: true }) notes!: string | null;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) endedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: ContractRoomDto }) room!: ContractRoomDto;
  @ApiProperty({ type: ContractTenantDto }) tenant!: ContractTenantDto;
}

export class ContractPageResponseDto implements ContractPageResponse {
  @ApiProperty({ type: ContractResponseDto, isArray: true }) items!: ContractResponseDto[];
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
}
