import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, Matches } from 'class-validator';

export class DashboardQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Limit figures to one Building' })
  @IsOptional()
  @IsUUID()
  buildingId?: string;

  @ApiPropertyOptional({
    example: '2026-10',
    description: 'YYYY-MM, defaults to the current month',
  })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  period?: string;
}
