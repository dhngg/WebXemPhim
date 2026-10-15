import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { PlatformAdminGuard } from './admin.guard';
import { AdminRepository } from './admin.repository';
import { AdminService } from './admin.service';
import { LandlordApplicationService } from '../onboarding/landlord-application.service';

@Module({
  controllers: [AdminController],
  providers: [AdminRepository, AdminService, PlatformAdminGuard, LandlordApplicationService],
})
export class AdminModule {}
