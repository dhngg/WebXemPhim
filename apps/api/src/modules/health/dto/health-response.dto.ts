import { ApiProperty } from '@nestjs/swagger';
import type { HealthResponse, ReadinessResponse } from '@rental/shared';

export class HealthResponseDto implements HealthResponse {
  @ApiProperty({ enum: ['ok'] })
  status!: 'ok';

  @ApiProperty({ enum: ['rental-api'] })
  service!: 'rental-api';

  @ApiProperty({ format: 'date-time' })
  timestamp!: string;
}

export class ReadinessResponseDto implements ReadinessResponse {
  @ApiProperty({ enum: ['ok'] })
  status!: 'ok';

  @ApiProperty({ enum: ['disabled', 'up'] })
  database!: 'disabled' | 'up';
}
