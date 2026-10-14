import { Transform } from 'class-transformer';
import { Allow, IsEmail, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { LoginRequest, RegisterRequest } from '@rental/shared';

const normalizeEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

const trimText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class RegisterRequestDto implements RegisterRequest {
  @ApiProperty({ format: 'email', maxLength: 254, example: 'user@example.com' })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 12, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 100, example: 'Nguyen Van A' })
  @Transform(trimText)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  displayName?: string;
}

export class LoginRequestDto implements LoginRequest {
  @ApiProperty({ format: 'email', maxLength: 254, example: 'user@example.com' })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 12, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}

export class EmptyAuthRequestDto {
  @Allow()
  private readonly __empty?: never;
}
