import { ApplicationException } from '../../../common/errors/application-exception';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceNotFoundRepositoryError,
  type WorkspaceAccessRecord,
  WorkspaceRepository,
} from '../repositories/workspace.repository';
import { WorkspaceService } from './workspace.service';

describe('WorkspaceService lifecycle', () => {
  const workspace: WorkspaceAccessRecord = {
    id: '770060ca-e063-4b27-9b10-e517ba61866e',
    name: 'Workspace A',
    status: 'ARCHIVED',
    archivedAt: new Date('2026-10-14T01:00:00.000Z'),
    createdAt: new Date('2026-10-14T00:00:00.000Z'),
    updatedAt: new Date('2026-10-14T01:00:00.000Z'),
    role: 'OWNER',
  };

  it('returns the current workspace representation after archive', async () => {
    const repository = {
      archive: jest.fn().mockResolvedValue(workspace),
    } as unknown as WorkspaceRepository;
    const service = new WorkspaceService(repository);

    await expect(service.archive(workspace.id, 'owner-1')).resolves.toEqual({
      id: workspace.id,
      name: workspace.name,
      status: 'ARCHIVED',
      archivedAt: '2026-10-14T01:00:00.000Z',
      createdAt: '2026-10-14T00:00:00.000Z',
      updatedAt: '2026-10-14T01:00:00.000Z',
      currentMembership: { role: 'OWNER' },
    });
  });

  it('maps a lifecycle authorization race to WORKSPACE_NOT_FOUND', async () => {
    const repository = {
      restore: jest.fn().mockRejectedValue(new WorkspaceNotFoundRepositoryError()),
    } as unknown as WorkspaceRepository;
    const service = new WorkspaceService(repository);

    await expect(service.restore(workspace.id, 'former-owner')).rejects.toMatchObject<
      Partial<ApplicationException>
    >({ code: 'WORKSPACE_NOT_FOUND' });
  });

  it('maps archived business writes to WORKSPACE_ARCHIVED', async () => {
    const repository = {
      transferOwnership: jest.fn().mockRejectedValue(new WorkspaceArchivedRepositoryError()),
    } as unknown as WorkspaceRepository;
    const service = new WorkspaceService(repository);

    await expect(
      service.transferOwnership(workspace.id, 'owner-1', 'membership-1'),
    ).rejects.toMatchObject<Partial<ApplicationException>>({ code: 'WORKSPACE_ARCHIVED' });
  });
});
