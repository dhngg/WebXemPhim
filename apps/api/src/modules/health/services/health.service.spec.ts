import { ServiceUnavailableException } from '@nestjs/common';
import { HealthRepository } from '../repositories/health.repository';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const repository = { getDatabaseState: jest.fn() };
  const service = new HealthService(repository as unknown as HealthRepository);

  it('returns liveness without depending on the database', () => {
    const health = service.getHealth();
    expect(health).toMatchObject({ status: 'ok', service: 'rental-api' });
    expect(Number.isNaN(Date.parse(health.timestamp))).toBe(false);
    expect(repository.getDatabaseState).not.toHaveBeenCalled();
  });

  it('reports database disabled explicitly', async () => {
    repository.getDatabaseState.mockResolvedValue('disabled');
    await expect(service.getReadiness()).resolves.toEqual({ status: 'ok', database: 'disabled' });
  });

  it('reports a reachable database', async () => {
    repository.getDatabaseState.mockResolvedValue('up');
    await expect(service.getReadiness()).resolves.toEqual({ status: 'ok', database: 'up' });
  });

  it('fails readiness when the database is unavailable', async () => {
    repository.getDatabaseState.mockResolvedValue('down');
    await expect(service.getReadiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
