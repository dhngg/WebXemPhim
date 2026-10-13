import { Module } from '@nestjs/common';
import { HealthController } from './controllers/health.controller';
import { HealthService } from './services/health.service';
import { HealthRepository } from './repositories/health.repository';

@Module({ controllers: [HealthController], providers: [HealthService, HealthRepository] })
export class HealthModule {}
