import { Module } from '@nestjs/common';
import { LandlordApplicationController } from './landlord-application.controller';
import { LandlordApplicationService } from './landlord-application.service';

@Module({ controllers: [LandlordApplicationController], providers: [LandlordApplicationService] })
export class OnboardingModule {}
