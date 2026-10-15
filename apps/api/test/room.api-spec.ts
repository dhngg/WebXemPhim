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
import { RoomModule } from '../src/modules/rooms/room.module';
import {
  RoomCodeConflictRepositoryError,
  RoomRepository,
} from '../src/modules/rooms/repositories/room.repository';
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

describe('Room and Amenity API', () => {
  let app: INestApplication;
  let workspaces: jest.Mocked<WorkspaceRepository>;
  let rooms: jest.Mocked<RoomRepository>;
  const workspaceId = '770060ca-e063-4b27-9b10-e517ba61866e';
  const buildingId = 'e8f122f1-c92f-4d89-a264-aa154ad36d2e';
  const roomId = '80b7687d-556c-463a-b84a-349628192b88';
  const amenityId = '47ec8cb6-425f-4c28-b83c-010c32e7392a';
  const imageId = '94e8439c-d82d-4c44-8bb4-cff5be292c35';
  const workspace: WorkspaceAccessRecord = {
    id: workspaceId,
    name: 'Workspace',
    status: 'ACTIVE',
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    role: 'OWNER',
  };
  const amenity = {
    id: amenityId,
    workspaceId,
    name: 'Máy lạnh',
    description: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const room = {
    id: roomId,
    workspaceId,
    buildingId,
    code: 'P101',
    areaSqm: new Prisma.Decimal('25.50'),
    monthlyRent: new Prisma.Decimal('3500000.00'),
    maxOccupants: 2,
    description: null,
    status: 'VACANT' as const,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    amenities: [{ roomId, amenityId, createdAt: new Date(), amenity }],
  };
  const image = {
    id: imageId,
    workspaceId,
    roomId,
    url: 'https://cdn.example.com/rooms/p101.jpg',
    altText: 'Phòng P101',
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeAll(async () => {
    workspaces = {
      findAccessibleWorkspace: jest.fn(),
    } as unknown as jest.Mocked<WorkspaceRepository>;
    rooms = {
      createRoom: jest.fn(),
      listRooms: jest.fn(),
      detailRoom: jest.fn(),
      updateRoom: jest.fn(),
      archiveRoom: jest.fn(),
      restoreRoom: jest.fn(),
      createAmenity: jest.fn(),
      listAmenities: jest.fn(),
      assignAmenity: jest.fn(),
      unassignAmenity: jest.fn(),
      addRoomImage: jest.fn(),
      listRoomImages: jest.fn(),
      reorderRoomImages: jest.fn(),
      deleteRoomImage: jest.fn(),
    } as unknown as jest.Mocked<RoomRepository>;
    const module = await Test.createTestingModule({ imports: [TestAuthModule, RoomModule] })
      .overrideProvider(WorkspaceRepository)
      .useValue(workspaces)
      .overrideProvider(RoomRepository)
      .useValue(rooms)
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
    rooms.createRoom.mockResolvedValue(room);
    rooms.listRooms.mockResolvedValue([room]);
    rooms.detailRoom.mockResolvedValue(room);
    rooms.updateRoom.mockResolvedValue({ ...room, code: 'P102' });
    rooms.archiveRoom.mockResolvedValue({ ...room, status: 'ARCHIVED', archivedAt: new Date() });
    rooms.restoreRoom.mockResolvedValue(room);
    rooms.createAmenity.mockResolvedValue(amenity);
    rooms.listAmenities.mockResolvedValue([amenity]);
    rooms.assignAmenity.mockResolvedValue();
    rooms.unassignAmenity.mockResolvedValue();
    rooms.addRoomImage.mockResolvedValue(image);
    rooms.listRoomImages.mockResolvedValue([image]);
    rooms.reorderRoomImages.mockResolvedValue([image]);
    rooms.deleteRoomImage.mockResolvedValue();
  });
  const writeHeaders = (call: request.Test) =>
    call
      .set('Authorization', 'Bearer token')
      .set('Origin', 'https://app.example.com')
      .set('X-CSRF-Protection', '1');

  it('creates a normalized room and returns money as decimal strings', async () => {
    const response = await writeHeaders(
      request(app.getHttpServer()).post(
        `/api/v1/workspaces/${workspaceId}/buildings/${buildingId}/rooms`,
      ),
    )
      .send({ code: ' p101 ', areaSqm: '25.50', monthlyRent: '3500000.00', maxOccupants: 2 })
      .expect(201);
    expect(response.body).toMatchObject({
      code: 'P101',
      areaSqm: '25.50',
      monthlyRent: '3500000.00',
    });
    expect(rooms.createRoom).toHaveBeenCalledWith(
      workspaceId,
      user.id,
      buildingId,
      expect.objectContaining({ code: 'P101' }),
    );
  });
  it('maps duplicate room code to conflict', async () => {
    rooms.createRoom.mockRejectedValueOnce(new RoomCodeConflictRepositoryError());
    await writeHeaders(
      request(app.getHttpServer()).post(
        `/api/v1/workspaces/${workspaceId}/buildings/${buildingId}/rooms`,
      ),
    )
      .send({ code: 'P101', areaSqm: '25', monthlyRent: '1' })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('ROOM_CODE_CONFLICT'));
  });
  it.each(['MANAGER', 'STAFF'] as const)(
    'blocks legacy %s from room reads and writes',
    async (role) => {
      workspaces.findAccessibleWorkspace.mockResolvedValue({ ...workspace, role });
      const roomsBase = `/api/v1/workspaces/${workspaceId}/buildings/${buildingId}/rooms`;
      await request(app.getHttpServer())
        .get(roomsBase)
        .set('Authorization', 'Bearer token')
        .expect(404);
      await request(app.getHttpServer())
        .get(`${roomsBase}/${roomId}`)
        .set('Authorization', 'Bearer token')
        .expect(404);
      await writeHeaders(request(app.getHttpServer()).patch(`${roomsBase}/${roomId}`))
        .send({ code: 'P102' })
        .expect(404);
      await writeHeaders(
        request(app.getHttpServer()).patch(`${roomsBase}/${roomId}/archive`),
      ).expect(404);
      await writeHeaders(
        request(app.getHttpServer()).patch(`${roomsBase}/${roomId}/restore`),
      ).expect(404);
    },
  );
  it('updates, archives and restores a room for OWNER', async () => {
    workspaces.findAccessibleWorkspace.mockResolvedValue({ ...workspace, role: 'OWNER' });
    await writeHeaders(
      request(app.getHttpServer()).patch(
        `/api/v1/workspaces/${workspaceId}/buildings/${buildingId}/rooms/${roomId}`,
      ),
    )
      .send({ code: ' p102 ' })
      .expect(200)
      .expect(({ body }) => expect(body.code).toBe('P102'));
    await writeHeaders(
      request(app.getHttpServer()).patch(
        `/api/v1/workspaces/${workspaceId}/buildings/${buildingId}/rooms/${roomId}/archive`,
      ),
    )
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('ARCHIVED'));
    await writeHeaders(
      request(app.getHttpServer()).patch(
        `/api/v1/workspaces/${workspaceId}/buildings/${buildingId}/rooms/${roomId}/restore`,
      ),
    )
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('VACANT'));
  });
  it('creates/lists amenities and assigns/unassigns idempotently', async () => {
    await writeHeaders(
      request(app.getHttpServer()).post(`/api/v1/workspaces/${workspaceId}/amenities`),
    )
      .send({ name: ' Máy lạnh ' })
      .expect(201)
      .expect(({ body }) => expect(body.name).toBe('Máy lạnh'));
    await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/amenities`)
      .set('Authorization', 'Bearer token')
      .expect(200)
      .expect(({ body }) => expect(body).toHaveLength(1));
    const path = `/api/v1/workspaces/${workspaceId}/buildings/${buildingId}/rooms/${roomId}/amenities/${amenityId}`;
    await writeHeaders(request(app.getHttpServer()).post(path)).expect(204);
    await writeHeaders(request(app.getHttpServer()).delete(path)).expect(204);
  });
  it('blocks all room and amenity writes when workspace is archived', async () => {
    workspaces.findAccessibleWorkspace.mockResolvedValue({
      ...workspace,
      status: 'ARCHIVED',
      archivedAt: new Date(),
    });
    await writeHeaders(
      request(app.getHttpServer()).post(`/api/v1/workspaces/${workspaceId}/amenities`),
    )
      .send({ name: 'Wifi' })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('WORKSPACE_ARCHIVED'));
    expect(rooms.createAmenity).not.toHaveBeenCalled();
  });
  it('validates area, rent and manageable room status', async () => {
    await writeHeaders(
      request(app.getHttpServer()).post(
        `/api/v1/workspaces/${workspaceId}/buildings/${buildingId}/rooms`,
      ),
    )
      .send({ code: 'P101', areaSqm: '0', monthlyRent: '-1', status: 'OCCUPIED' })
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('VALIDATION_ERROR'));
  });
  it('lets OWNER add, reorder and delete URL metadata', async () => {
    const base = `/api/v1/workspaces/${workspaceId}/buildings/${buildingId}/rooms/${roomId}/images`;
    await writeHeaders(request(app.getHttpServer()).post(base))
      .send({ url: ' https://cdn.example.com/rooms/p101.jpg ', altText: ' Phòng P101 ' })
      .expect(201)
      .expect(({ body }) => expect(body).toMatchObject({ id: imageId, sortOrder: 0 }));
    expect(rooms.addRoomImage).toHaveBeenCalledWith(
      workspaceId,
      user.id,
      buildingId,
      roomId,
      expect.objectContaining({
        url: 'https://cdn.example.com/rooms/p101.jpg',
        altText: 'Phòng P101',
      }),
    );
    await writeHeaders(request(app.getHttpServer()).patch(`${base}/reorder`))
      .send({ imageIds: [imageId] })
      .expect(200);
    await writeHeaders(request(app.getHttpServer()).delete(`${base}/${imageId}`)).expect(204);
  });
  it.each(['MANAGER', 'STAFF'] as const)(
    'blocks legacy %s from image reads and writes',
    async (role) => {
      workspaces.findAccessibleWorkspace.mockResolvedValue({ ...workspace, role });
      const base = `/api/v1/workspaces/${workspaceId}/buildings/${buildingId}/rooms/${roomId}/images`;
      await request(app.getHttpServer()).get(base).set('Authorization', 'Bearer token').expect(404);
      await writeHeaders(request(app.getHttpServer()).post(base))
        .send({ url: 'https://cdn.example.com/rooms/p101.jpg' })
        .expect(404);
      expect(rooms.addRoomImage).not.toHaveBeenCalled();
    },
  );
  it('rejects invalid image URLs and duplicate reorder IDs', async () => {
    const base = `/api/v1/workspaces/${workspaceId}/buildings/${buildingId}/rooms/${roomId}/images`;
    await writeHeaders(request(app.getHttpServer()).post(base))
      .send({ url: 'file:///local/image.jpg' })
      .expect(400);
    await writeHeaders(request(app.getHttpServer()).patch(`${base}/reorder`))
      .send({ imageIds: [imageId, imageId] })
      .expect(400);
  });
});
