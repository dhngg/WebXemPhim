import { Module } from '@nestjs/common';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { ListingManagementController } from './controllers/listing-management.controller';
import { PublicListingController } from './controllers/public-listing.controller';
import { ViewingRequestController } from './controllers/viewing-request.controller';
import { WorkspaceViewingRequestController } from './controllers/workspace-viewing-request.controller';
import { ListingRepository } from './repositories/listing.repository';
import { ListingService } from './services/listing.service';
import { ViewingRequestRepository } from './repositories/viewing-request.repository';
import { ViewingRequestService } from './services/viewing-request.service';

@Module({
  imports: [WorkspaceModule],
  controllers: [
    ListingManagementController,
    PublicListingController,
    ViewingRequestController,
    WorkspaceViewingRequestController,
  ],
  providers: [ListingRepository, ListingService, ViewingRequestRepository, ViewingRequestService],
})
export class MarketplaceModule {}
