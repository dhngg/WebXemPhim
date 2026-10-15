import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * The only self-service field is the display name. Email (the login identity), status and roles are
 * not accepted; the global ValidationPipe rejects any other property.
 */
export class UpdateUserProfileDto {
  @ApiPropertyOptional({ nullable: true, maxLength: 100, description: 'null clears the name' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_o, value) => value !== null)
  @IsString()
  @Matches(/^[^\p{Cc}]{1,100}$/u)
  @MaxLength(100)
  displayName!: string | null;
}
