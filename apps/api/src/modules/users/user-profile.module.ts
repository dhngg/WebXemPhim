import { Module } from '@nestjs/common';
import { UserProfileController } from './user-profile.controller';
import { UserProfileService } from './user-profile.service';
import { CapabilitiesRepository } from './capabilities.repository';

@Module({
  controllers: [UserProfileController],
  providers: [UserProfileService, CapabilitiesRepository],
})
export class UserProfileModule {}
