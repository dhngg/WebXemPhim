import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  TENANT_LINK_REQUEST_STATUSES,
  type CreateTenantLinkRequest,
  type DecideTenantLinkRequest,
  type RevokeTenantLinkRequest,
  type TenantAccountLinkResponse,
  type TenantLinkRequestPageResponse,
  type TenantLinkRequestResponse,
  type TenantLinkRequestStatus,
  type TenantUserLinkResponse,
} from '@rental/shared';
import { WorkspaceIdParamDto } from '../../workspaces/dto/workspace.dto';

const trimText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateTenantLinkRequestDto implements CreateTenantLinkRequest {
  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

export class DecideTenantLinkRequestDto implements DecideTenantLinkRequest {
  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RevokeTenantLinkRequestDto implements RevokeTenantLinkRequest {
  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class TenantLinkRequestQueryDto {
  @ApiPropertyOptional({ enum: TENANT_LINK_REQUEST_STATUSES })
  @IsOptional()
  @IsIn(TENANT_LINK_REQUEST_STATUSES)
  status?: TenantLinkRequestStatus;

  @Type(() => Number) @IsOptional() @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) @Max(50) limit = 20;
}

export class TenantLinkTenantParamDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() tenantId!: string;
}

export class TenantLinkRequestParamDto extends WorkspaceIdParamDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() requestId!: string;
}

export class TenantUserLinkParamDto extends WorkspaceIdParamDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() linkId!: string;
}

class TenantLinkSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() fullName!: string;
}

class TenantLinkRequesterDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'email' }) email!: string;
  @ApiPropertyOptional({ nullable: true }) displayName!: string | null;
}

export class TenantLinkRequestResponseDto implements TenantLinkRequestResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) workspaceId!: string;
  @ApiProperty({ format: 'uuid' }) tenantId!: string;
  @ApiProperty({ format: 'uuid' }) requesterUserId!: string;
  @ApiProperty({ enum: TENANT_LINK_REQUEST_STATUSES }) status!: TenantLinkRequestStatus;
  @ApiPropertyOptional({ nullable: true }) message!: string | null;
  @ApiPropertyOptional({ nullable: true }) decisionNote!: string | null;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) decidedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: TenantLinkSummaryDto }) tenant!: TenantLinkSummaryDto;
  @ApiProperty({ type: TenantLinkRequesterDto }) requester!: TenantLinkRequesterDto;
}

export class TenantUserLinkResponseDto implements TenantUserLinkResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) workspaceId!: string;
  @ApiProperty({ format: 'uuid' }) tenantId!: string;
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty({ format: 'date-time' }) linkedAt!: string;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) revokedAt!: string | null;
}

class TenantLinkedUserDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'email' }) email!: string;
  @ApiPropertyOptional({ nullable: true }) displayName!: string | null;
}

export class TenantAccountLinkResponseDto
  extends TenantUserLinkResponseDto
  implements TenantAccountLinkResponse
{
  @ApiProperty({ type: TenantLinkedUserDto }) user!: TenantLinkedUserDto;
}

export class TenantLinkRequestPageResponseDto implements TenantLinkRequestPageResponse {
  @ApiProperty({ type: TenantLinkRequestResponseDto, isArray: true })
  items!: TenantLinkRequestResponseDto[];
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
}
