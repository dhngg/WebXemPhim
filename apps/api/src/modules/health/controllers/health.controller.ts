import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { HealthResponseDto, ReadinessResponseDto } from '../dto/health-response.dto';
import { HealthService } from '../services/health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Kiểm tra tiến trình API đang hoạt động' })
  @ApiOkResponse({ type: HealthResponseDto })
  getHealth(): HealthResponseDto {
    return this.healthService.getHealth();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Kiểm tra database nếu được bật; disabled khi chạy scaffold' })
  @ApiOkResponse({ type: ReadinessResponseDto })
  @ApiServiceUnavailableResponse({ description: 'Database không sẵn sàng' })
  getReadiness(): Promise<ReadinessResponseDto> {
    return this.healthService.getReadiness();
  }
}
