import { PrismaService } from '../../../database/prisma/prisma.service';
import { HealthRepository } from './health.repository';

describe('HealthRepository', () => {
  it('does not open a database in scaffold mode', async () => {
    await expect(new HealthRepository().getDatabaseState()).resolves.toBe('disabled');
  });

  it('uses Prisma for a read-only readiness query', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    await expect(
      new HealthRepository(prisma as unknown as PrismaService).getDatabaseState(),
    ).resolves.toBe('up');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('hides connection errors', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('private-connection-details')),
    };
    await expect(
      new HealthRepository(prisma as unknown as PrismaService).getDatabaseState(),
    ).resolves.toBe('down');
  });
});
