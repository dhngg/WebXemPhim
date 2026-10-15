import 'reflect-metadata';
import { Global, type INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
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
import { ListingRepository } from '../src/modules/marketplace/repositories/listing.repository';
import {
  ViewingRequestInvalidTransitionRepositoryError,
  ViewingRequestNotFoundRepositoryError,
  ViewingRequestRepository,
} from '../src/modules/marketplace/repositories/viewing-request.repository';
import {
  WorkspaceRepository,
  type WorkspaceAccessRecord,
} from '../src/modules/workspaces/repositories/workspace.repository';

const user = {
  id: '1248d89d-42cc-4db1-8855-813d4ad15f08',
  email: 'guest@example.com',
  displayName: 'Guest',
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

describe('Viewing Request API', () => {
  let app: INestApplication;
  let workspaces: jest.Mocked<WorkspaceRepository>;
  let viewingRequests: jest.Mocked<ViewingRequestRepository>;
  const workspaceId = '770060ca-e063-4b27-9b10-e517ba61866e';
  const listingId = 'b022a125-0fd8-411b-b6c6-786cac9d7441';
  const requestId = '6fc05efe-9141-45b2-8ac6-283dc81fdeeb';
  const now = new Date('2026-10-14T00:00:00.000Z');
  const future = new Date('2099-10-20T03:00:00.000Z');
  const workspace: WorkspaceAccessRecord = {
    id: workspaceId,
    name: 'Workspace',
    status: 'ACTIVE',
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    role: 'OWNER',
  };
  const record = {
    id: requestId,
    workspaceId,
    listingId,
    requesterUserId: user.id,
    scheduledAt: future,
    message: 'Buổi sáng',
    status: 'PENDING' as const,
    decisionNote: null,
    decidedByUserId: null,
    decidedAt: null,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
    requester: {
      id: user.id,
      email: user.email,
      passwordHash: 'not-returned',
      displayName: user.displayName,
      status: 'ACTIVE' as const,
      disabledAt: null,
      createdAt: now,
      updatedAt: now,
    },
    listing: {
      id: listingId,
      workspaceId,
      roomId: '80b7687d-556c-463a-b84a-349628192b88',
      isPublished: true,
      publishedAt: now,
      unpublishedAt: null,
      createdAt: now,
      updatedAt: now,
      room: {
        id: '80b7687d-556c-463a-b84a-349628192b88',
        workspaceId,
        buildingId: 'e8f122f1-c92f-4d89-a264-aa154ad36d2e',
        code: 'P101',
        areaSqm: {} as never,
        monthlyRent: {} as never,
        maxOccupants: 2,
        description: null,
        status: 'VACANT' as const,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
        building: {
          id: 'e8f122f1-c92f-4d89-a264-aa154ad36d2e',
          workspaceId,
          name: 'Nhà trọ A',
          description: null,
          status: 'ACTIVE' as const,
          archivedAt: null,
          addressLine1: '1 Nguyễn Huệ',
          addressLine2: null,
          ward: null,
          district: null,
          city: 'Hồ Chí Minh',
          postalCode: null,
          countryCode: 'VN',
          latitude: null,
          longitude: null,
          createdAt: now,
          updatedAt: now,
        },
      },
    },
  };

  beforeAll(async () => {
    workspaces = {
      findAccessibleWorkspace: jest.fn(),
    } as unknown as jest.Mocked<WorkspaceRepository>;
    viewingRequests = {
      create: jest.fn(),
      listMine: jest.fn(),
      listWorkspace: jest.fn(),
      cancel: jest.fn(),
      decide: jest.fn(),
    } as unknown as jest.Mocked<ViewingRequestRepository>;
    const module = await Test.createTestingModule({ imports: [TestAuthModule, MarketplaceModule] })
      .overrideProvider(WorkspaceRepository)
      .useValue(workspaces)
      .overrideProvider(ListingRepository)
      .useValue({})
      .overrideProvider(ViewingRequestRepository)
      .useValue(viewingRequests)
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
    viewingRequests.create.mockResolvedValue(record);
    viewingRequests.listMine.mockResolvedValue({ items: [record], total: 1 });
    viewingRequests.listWorkspace.mockResolvedValue({ items: [record], total: 1 });
    viewingRequests.cancel.mockResolvedValue({
      ...record,
      status: 'CANCELLED',
      cancelledAt: now,
    });
    viewingRequests.decide.mockResolvedValue({
      ...record,
      status: 'CONFIRMED',
      decidedByUserId: user.id,
      decidedAt: now,
    });
  });
  const authHeaders = (call: request.Test) => call.set('Authorization', 'Bearer token');
  const writeHeaders = (call: request.Test) =>
    authHeaders(call).set('Origin', 'https://app.example.com').set('X-CSRF-Protection', '1');

  it('creates a future viewing request for the authenticated user', async () => {
    await writeHeaders(
      request(app.getHttpServer()).post(`/api/v1/listings/${listingId}/viewing-requests`),
    )
      .send({ scheduledAt: future.toISOString(), message: ' Buổi sáng ' })
      .expect(201)
      .expect(({ body }) =>
        expect(body).toMatchObject({ id: requestId, status: 'PENDING', message: 'Buổi sáng' }),
      );
    expect(viewingRequests.create).toHaveBeenCalledWith(user.id, listingId, {
      scheduledAt: future.toISOString(),
      message: 'Buổi sáng',
    });
  });

  it('lists only the authenticated user requests and supports status pagination', async () => {
    const response = await authHeaders(
      request(app.getHttpServer()).get('/api/v1/viewing-requests/me'),
    )
      .query({ status: 'PENDING', page: 1, limit: 10 })
      .expect(200);
    expect(response.body).toMatchObject({ total: 1, page: 1, limit: 10 });
    expect(response.body.items[0].requester).not.toHaveProperty('passwordHash');
    expect(viewingRequests.listMine).toHaveBeenCalledWith(
      user.id,
      expect.objectContaining({ status: 'PENDING', page: 1, limit: 10 }),
    );
  });

  it('cancels only through the authenticated-user scoped repository operation', async () => {
    await writeHeaders(
      request(app.getHttpServer()).patch(`/api/v1/viewing-requests/${requestId}/cancel`),
    )
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('CANCELLED'));
    expect(viewingRequests.cancel).toHaveBeenCalledWith(user.id, requestId);
    viewingRequests.cancel.mockRejectedValueOnce(new ViewingRequestNotFoundRepositoryError());
    await writeHeaders(
      request(app.getHttpServer()).patch(`/api/v1/viewing-requests/${requestId}/cancel`),
    )
      .expect(404)
      .expect(({ body }) => expect(body.code).toBe('VIEWING_REQUEST_NOT_FOUND'));
  });

  it('allows OWNER to list, confirm and reject workspace requests', async () => {
    const base = `/api/v1/workspaces/${workspaceId}/viewing-requests`;
    await authHeaders(request(app.getHttpServer()).get(base)).expect(200);
    await writeHeaders(request(app.getHttpServer()).patch(`${base}/${requestId}/confirm`))
      .send({ note: ' Đã hẹn ' })
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('CONFIRMED'));
    expect(viewingRequests.decide).toHaveBeenCalledWith(
      workspaceId,
      user.id,
      requestId,
      'CONFIRMED',
      { note: 'Đã hẹn' },
    );
    viewingRequests.decide.mockResolvedValueOnce({
      ...record,
      status: 'REJECTED',
      decidedByUserId: user.id,
      decidedAt: now,
    });
    await writeHeaders(request(app.getHttpServer()).patch(`${base}/${requestId}/reject`))
      .send({ note: 'Không phù hợp' })
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('REJECTED'));
  });

  it('blocks STAFF from workspace viewing requests', async () => {
    workspaces.findAccessibleWorkspace.mockResolvedValue({ ...workspace, role: 'STAFF' });
    await authHeaders(
      request(app.getHttpServer()).get(`/api/v1/workspaces/${workspaceId}/viewing-requests`),
    ).expect(404);
    expect(viewingRequests.listWorkspace).not.toHaveBeenCalled();
  });

  it('validates timestamp timezone and maps terminal transition conflicts', async () => {
    await writeHeaders(
      request(app.getHttpServer()).post(`/api/v1/listings/${listingId}/viewing-requests`),
    )
      .send({ scheduledAt: '2099-10-20T03:00:00' })
      .expect(400);
    viewingRequests.decide.mockRejectedValueOnce(
      new ViewingRequestInvalidTransitionRepositoryError(),
    );
    await writeHeaders(
      request(app.getHttpServer()).patch(
        `/api/v1/workspaces/${workspaceId}/viewing-requests/${requestId}/confirm`,
      ),
    )
      .send({})
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('VIEWING_REQUEST_INVALID_TRANSITION'));
  });
});
