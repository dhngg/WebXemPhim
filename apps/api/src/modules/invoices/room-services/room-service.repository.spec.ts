import { RatePlanNotFoundRepositoryError } from '../../rates/repositories/rate-plan.repository';
import {
  RoomServiceConflictRepositoryError,
  RoomServiceNotEligibleRepositoryError,
  RoomServiceRepository,
} from './room-service.repository';

const scope = (roomStatus = 'VACANT', role = 'OWNER') => ({
  $queryRaw: jest
    .fn()
    .mockResolvedValueOnce([{ status: 'ACTIVE' }])
    .mockResolvedValueOnce([{ status: 'ACTIVE' }])
    .mockResolvedValueOnce([{ status: roomStatus }]),
  workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role }) },
});
const repo = (tx: object) =>
  new RoomServiceRepository({ $transaction: (fn: (t: object) => unknown) => fn(tx) } as never);
const input = { rateCode: 'WIFI', effectiveFrom: '2026-10-01' };

describe('RoomServiceRepository', () => {
  it('assigns a Building Rate code to the room', async () => {
    const tx = {
      ...scope(),
      ratePlan: { findFirst: jest.fn().mockResolvedValue({ id: 'r' }) },
      roomServiceAssignment: { create: jest.fn().mockResolvedValue({ id: 's1' }) },
    };
    await repo(tx).create('w', 'u', 'b', 'room', input);
    expect(tx.roomServiceAssignment.create.mock.calls[0][0].data).toMatchObject({
      workspaceId: 'w',
      buildingId: 'b',
      roomId: 'room',
      rateCode: 'WIFI',
      createdBy: 'u',
    });
  });

  it('rejects rate codes the building does not define', async () => {
    const tx = { ...scope(), ratePlan: { findFirst: jest.fn().mockResolvedValue(null) } };
    await expect(repo(tx).create('w', 'u', 'b', 'room', input)).rejects.toBeInstanceOf(
      RatePlanNotFoundRepositoryError,
    );
  });

  it('maps overlapping assignments of the same code to a conflict', async () => {
    const tx = {
      ...scope(),
      ratePlan: { findFirst: jest.fn().mockResolvedValue({ id: 'r' }) },
      roomServiceAssignment: {
        create: jest
          .fn()
          .mockRejectedValue(
            new Error('violates exclusion constraint "room_service_assignments_period_excl"'),
          ),
      },
    };
    await expect(repo(tx).create('w', 'u', 'b', 'room', input)).rejects.toBeInstanceOf(
      RoomServiceConflictRepositoryError,
    );
  });

  it('blocks archived rooms', async () => {
    await expect(
      repo(scope('ARCHIVED')).create('w', 'u', 'b', 'room', input),
    ).rejects.toBeInstanceOf(RoomServiceNotEligibleRepositoryError);
  });
});
