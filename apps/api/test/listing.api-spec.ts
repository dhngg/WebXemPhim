import 'reflect-metadata';
import { Global, type INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Prisma } from '../src/generated/prisma/client';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import {
  AUTH_HTTP_SECURITY,
  AccessAuthGuard,
  AuthOriginGuard,
} from '../src/modules/auth/http/auth-http-security';
import {
  AUTH_SERVICE,
  type AuthServiceContract,
} from '../src/modules/auth/services/auth-service.contract';
import { MarketplaceModule } from '../src/modules/marketplace/marketplace.module';
import {
  ListingNotEligibleRepositoryError,
  ListingRepository,
} from '../src/modules/marketplace/repositories/listing.repository';
import { ViewingRequestRepository } from '../src/modules/marketplace/repositories/viewing-request.repository';
import {
  WorkspaceRepository,
  type WorkspaceAccessRecord,
} from '../src/modules/workspaces/repositories/workspace.repository';

const user = {
  id: '1248d89d-42cc-4db1-8855-813d4ad15f08',
  email: 'owner@example.com',
  displayName: 'Owner',
  status: 'ACTIVE' as const,
  createdAt: '2026-10-14T00:00:00.000Z',
};
const authService: Pick<AuthServiceContract, 'authenticateAccessToken'> = {
  authenticateAccessToken: jest.fn().mockResolvedValue(user),
};
@Global()
@Module({
  providers: [
    { provide: AUTH_SERVICE, useValue: authService },
    {
      provide: AUTH_HTTP_SECURITY,
      useValue: {
        enabled: true,
        allowedOrigins: ['https://app.example.com'],
        refreshCookieName: '__Host-rental_refresh',
        secureCookie: true,
      },
    },
    AuthOriginGuard,
    AccessAuthGuard,
  ],
  exports: [AUTH_SERVICE, AUTH_HTTP_SECURITY, AuthOriginGuard, AccessAuthGuard],
})
class TestAuthModule {}

describe('Marketplace listing API', () => {
  let app: INestApplication;
  let workspaces: jest.Mocked<WorkspaceRepository>;
  let listings: jest.Mocked<ListingRepository>;
  const workspaceId = '770060ca-e063-4b27-9b10-e517ba61866e';
  const buildingId = 'e8f122f1-c92f-4d89-a264-aa154ad36d2e';
  const roomId = '80b7687d-556c-463a-b84a-349628192b88';
  const listingId = 'b022a125-0fd8-411b-b6c6-786cac9d7441';
  const now = new Date('2026-10-14T00:00:00.000Z');
  const workspace: WorkspaceAccessRecord = {
    id: workspaceId,
    name: 'Workspace',
    status: 'ACTIVE',
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    role: 'OWNER',
  };
  const managementListing = {
    id: listingId,
    workspaceId,
    roomId,
    isPublished: true,
    publishedAt: now,
    unpublishedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const publicListing = {
    ...managementListing,
    room: {
      id: roomId,
      workspaceId,
      buildingId,
      code: 'P101',
      areaSqm: new Prisma.Decimal('25.50'),
      monthlyRent: new Prisma.Decimal('3500000.00'),
      maxOccupants: 2,
      description: 'Phòng sáng',
      status: 'VACANT' as const,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      building: {
        id: buildingId,
        workspaceId,
        name: 'Nhà trọ A',
        description: null,
        status: 'ACTIVE' as const,
        archivedAt: null,
        addressLine1: '1 Nguyễn Huệ',
        addressLine2: null,
        ward: 'Bến Nghé',
        district: 'Quận 1',
        city: 'Hồ Chí Minh',
        postalCode: null,
        countryCode: 'VN',
        latitude: null,
        longitude: null,
        createdAt: now,
        updatedAt: now,
      },
      amenities: [
        {
          roomId,
          amenityId: '47ec8cb6-425f-4c28-b83c-010c32e7392a',
          createdAt: now,
          amenity: {
            id: '47ec8cb6-425f-4c28-b83c-010c32e7392a',
            workspaceId,
            name: 'Wifi',
            description: null,
            createdAt: now,
            updatedAt: now,
          },
        },
      ],
      images: [
        {
          id: '94e8439c-d82d-4c44-8bb4-cff5be292c35',
          workspaceId,
          roomId,
          url: 'https://cdn.example.com/p101.jpg',
          altText: 'Phòng P101',
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        },
      ],
    },
  };

  beforeAll(async () => {
    workspaces = {
      findAccessibleWorkspace: jest.fn(),
    } as unknown as jest.Mocked<WorkspaceRepository>;
    listings = {
      setPublication: jest.fn(),
      listPublic: jest.fn(),
      detailPublic: jest.fn(),
    } as unknown as jest.Mocked<ListingRepository>;
    const module = await Test.createTestingModule({ imports: [TestAuthModule, MarketplaceModule] })
      .overrideProvider(WorkspaceRepository)
      .useValue(workspaces)
      .overrideProvider(ListingRepository)
      .useValue(listings)
      .overrideProvider(ViewingRequestRepository)
      .useValue({})
      .compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        forbidUnknownValues: true,
        validationError: { target: false, value: false },
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });
  afterAll(async () => app?.close());
  beforeEach(() => {
    jest.clearAllMocks();
    workspaces.findAccessibleWorkspace.mockResolvedValue(workspace);
    listings.setPublication.mockResolvedValue(managementListing);
    listings.listPublic.mockResolvedValue({ items: [publicListing], total: 1 });
    listings.detailPublic.mockResolvedValue(publicListing);
  });
  const writeHeaders = (call: request.Test) =>
    call
      .set('Authorization', 'Bearer token')
      .set('Origin', 'https://app.example.com')
      .set('X-CSRF-Protection', '1');

  it('allows OWNER to enable a listing', async () => {
    await writeHeaders(
      request(app.getHttpServer()).put(
        `/api/v1/workspaces/${workspaceId}/buildings/${buildingId}/rooms/${roomId}/listing`,
      ),
    )
      .send({ published: true })
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ id: listingId, published: true }));
    expect(listings.setPublication).toHaveBeenCalledWith(workspaceId, user.id, buildingId, roomId, {
      published: true,
    });
  });

  it('blocks STAFF from changing publication', async () => {
    workspaces.findAccessibleWorkspace.mockResolvedValue({ ...workspace, role: 'STAFF' });
    await writeHeaders(
      request(app.getHttpServer()).put(
        `/api/v1/workspaces/${workspaceId}/buildings/${buildingId}/rooms/${roomId}/listing`,
      ),
    )
      .send({ published: false })
      .expect(404);
    expect(listings.setPublication).not.toHaveBeenCalled();
  });

  it('maps an ineligible room publication to a stable conflict error', async () => {
    listings.setPublication.mockRejectedValueOnce(new ListingNotEligibleRepositoryError());
    await writeHeaders(
      request(app.getHttpServer()).put(
        `/api/v1/workspaces/${workspaceId}/buildings/${buildingId}/rooms/${roomId}/listing`,
      ),
    )
      .send({ published: true })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('LISTING_NOT_ELIGIBLE'));
  });

  it('serves a filtered public list without authentication or private fields', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/listings')
      .query({ city: ' Hồ Chí Minh ', minPrice: '2000000', maxPrice: '5000000', page: 1 })
      .expect(200);
    expect(response.body).toMatchObject({ total: 1, page: 1, limit: 20 });
    expect(response.body.items[0]).toMatchObject({
      id: listingId,
      room: { monthlyRent: '3500000.00', amenities: [{ name: 'Wifi' }] },
      building: { city: 'Hồ Chí Minh' },
    });
    expect(response.body.items[0]).not.toHaveProperty('workspaceId');
    expect(response.body.items[0].room).not.toHaveProperty('status');
    expect(listings.listPublic).toHaveBeenCalledWith(
      expect.objectContaining({ city: 'Hồ Chí Minh', page: 1, limit: 20 }),
    );
  });

  it('serves public detail and maps a missing or ineligible listing to 404', async () => {
    await request(app.getHttpServer()).get(`/api/v1/listings/${listingId}`).expect(200);
    listings.detailPublic.mockResolvedValueOnce(null);
    await request(app.getHttpServer())
      .get(`/api/v1/listings/${listingId}`)
      .expect(404)
      .expect(({ body }) => expect(body.code).toBe('LISTING_NOT_FOUND'));
  });

  it('validates price range and amenity filter input', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/listings')
      .query({ minPrice: '5000000', maxPrice: '2000000' })
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('VALIDATION_ERROR'));
    await request(app.getHttpServer())
      .get('/api/v1/listings')
      .query({ amenityIds: 'not-a-uuid' })
      .expect(400);
  });
});
