import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MANAGEABLE_WORKSPACE_ROLES,
  WORKSPACE_ROLES,
  WORKSPACE_STATUSES,
  type AddWorkspaceMemberRequest,
  type CreateWorkspaceRequest,
  type ManageableWorkspaceRole,
  type TransferWorkspaceOwnershipRequest,
  type UpdateWorkspaceMemberRequest,
  type WorkspaceMemberResponse,
  type WorkspaceResponse,
  type WorkspaceRole,
  type WorkspaceStatus,
} from '@rental/shared';

const trimText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const normalizeEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CreateWorkspaceRequestDto implements CreateWorkspaceRequest {
  @ApiProperty({ minLength: 1, maxLength: 100, example: 'Nhà trọ Nguyễn Văn A' })
  @Transform(trimText)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}

export class WorkspaceIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  workspaceId!: string;
}

export class WorkspaceMembershipIdParamDto extends WorkspaceIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  membershipId!: string;
}

export class AddWorkspaceMemberRequestDto implements AddWorkspaceMemberRequest {
  @ApiProperty({ format: 'email', maxLength: 254, example: 'manager@example.com' })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ enum: MANAGEABLE_WORKSPACE_ROLES })
  @IsIn(MANAGEABLE_WORKSPACE_ROLES)
  role!: ManageableWorkspaceRole;
}

export class UpdateWorkspaceMemberRequestDto implements UpdateWorkspaceMemberRequest {
  @ApiProperty({ enum: MANAGEABLE_WORKSPACE_ROLES })
  @IsIn(MANAGEABLE_WORKSPACE_ROLES)
  role!: ManageableWorkspaceRole;
}

export class TransferWorkspaceOwnershipRequestDto implements TransferWorkspaceOwnershipRequest {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  targetMembershipId!: string;
}

export class WorkspaceMemberUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiPropertyOptional({ nullable: true })
  displayName!: string | null;
}

export class WorkspaceMemberResponseDto implements WorkspaceMemberResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: WORKSPACE_ROLES })
  role!: WorkspaceRole;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({ type: WorkspaceMemberUserDto })
  user!: WorkspaceMemberUserDto;
}

export class WorkspaceMembershipSummaryDto {
  @ApiProperty({ enum: WORKSPACE_ROLES })
  role!: WorkspaceRole;
}

export class WorkspaceResponseDto implements WorkspaceResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ maxLength: 100 })
  name!: string;

  @ApiProperty({ enum: WORKSPACE_STATUSES })
  status!: WorkspaceStatus;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  archivedAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({ type: WorkspaceMembershipSummaryDto })
  currentMembership!: WorkspaceMembershipSummaryDto;
}
