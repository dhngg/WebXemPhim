import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { HealthResponse, ReadinessResponse } from '@rental/shared';
import { HealthRepository } from '../repositories/health.repository';

@Injectable()
export class HealthService {
  constructor(private readonly healthRepository: HealthRepository) {}

  getHealth(): HealthResponse {
    return { status: 'ok', service: 'rental-api', timestamp: new Date().toISOString() };
  }

  async getReadiness(): Promise<ReadinessResponse> {
    const database = await this.healthRepository.getDatabaseState();
    if (database === 'down') throw new ServiceUnavailableException();
    return { status: 'ok', database };
  }
}
