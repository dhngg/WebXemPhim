import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../auth/dto/auth-response.dto';
import {
  ListingIdParamDto,
  PublicListingPageResponseDto,
  PublicListingQueryDto,
  PublicListingResponseDto,
} from '../dto/listing.dto';
import { ListingService } from '../services/listing.service';

@ApiTags('Public Marketplace')
@Controller('listings')
export class PublicListingController {
  constructor(private readonly service: ListingService) {}

  @Get()
  @ApiOperation({ summary: 'Search public eligible rental listings' })
  @ApiOkResponse({ type: PublicListingPageResponseDto })
  list(@Query() query: PublicListingQueryDto): Promise<PublicListingPageResponseDto> {
    return this.service.listPublic(query);
  }

  @Get(':listingId')
  @ApiOperation({ summary: 'Get one public eligible rental listing' })
  @ApiOkResponse({ type: PublicListingResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  detail(@Param() params: ListingIdParamDto): Promise<PublicListingResponseDto> {
    return this.service.detailPublic(params.listingId);
  }
}
