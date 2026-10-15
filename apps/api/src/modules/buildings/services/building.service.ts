import { Injectable } from '@nestjs/common';
import type {
  BuildingResponse,
  CreateBuildingRequest,
  UpdateBuildingRequest,
} from '@rental/shared';
import { ApplicationException } from '../../../common/errors/application-exception';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceNotFoundRepositoryError,
} from '../../workspaces/repositories/workspace.repository';
import {
  BuildingArchivedRepositoryError,
  BuildingNotFoundRepositoryError,
  BuildingRepository,
  type BuildingRecord,
} from '../repositories/building.repository';

@Injectable()
export class BuildingService {
  constructor(private readonly repository: BuildingRepository) {}

  async create(
    workspaceId: string,
    actorUserId: string,
    input: CreateBuildingRequest,
  ): Promise<BuildingResponse> {
    try {
      return toResponse(await this.repository.create(workspaceId, actorUserId, input));
    } catch (error) {
      if (error instanceof WorkspaceNotFoundRepositoryError) {
        throw new ApplicationException('WORKSPACE_NOT_FOUND');
      }
      if (error instanceof WorkspaceArchivedRepositoryError) {
        throw new ApplicationException('WORKSPACE_ARCHIVED');
      }
      throw error;
    }
  }

  async list(workspaceId: string): Promise<BuildingResponse[]> {
    return (await this.repository.list(workspaceId)).map(toResponse);
  }

  async detail(workspaceId: string, buildingId: string): Promise<BuildingResponse> {
    const building = await this.repository.detail(workspaceId, buildingId);
    if (!building) throw new ApplicationException('BUILDING_NOT_FOUND');
    return toResponse(building);
  }

  async update(
    workspaceId: string,
    actorUserId: string,
    buildingId: string,
    input: UpdateBuildingRequest,
  ): Promise<BuildingResponse> {
    if (!Object.values(input).some((value) => value !== undefined)) {
      throw new ApplicationException('VALIDATION_ERROR');
    }
    return this.runWrite(() => this.repository.update(workspaceId, actorUserId, buildingId, input));
  }

  archive(workspaceId: string, ownerUserId: string, buildingId: string): Promise<BuildingResponse> {
    return this.runWrite(() => this.repository.archive(workspaceId, ownerUserId, buildingId));
  }

  restore(workspaceId: string, ownerUserId: string, buildingId: string): Promise<BuildingResponse> {
    return this.runWrite(() => this.repository.restore(workspaceId, ownerUserId, buildingId));
  }

  private async runWrite(operation: () => Promise<BuildingRecord>): Promise<BuildingResponse> {
    try {
      return toResponse(await operation());
    } catch (error) {
      if (error instanceof WorkspaceNotFoundRepositoryError) {
        throw new ApplicationException('WORKSPACE_NOT_FOUND');
      }
      if (error instanceof WorkspaceArchivedRepositoryError) {
        throw new ApplicationException('WORKSPACE_ARCHIVED');
      }
      if (error instanceof BuildingNotFoundRepositoryError) {
        throw new ApplicationException('BUILDING_NOT_FOUND');
      }
      if (error instanceof BuildingArchivedRepositoryError) {
        throw new ApplicationException('BUILDING_ARCHIVED');
      }
      throw error;
    }
  }
}

function toResponse(building: BuildingRecord): BuildingResponse {
  return {
    id: building.id,
    workspaceId: building.workspaceId,
    name: building.name,
    description: building.description,
    status: building.status,
    archivedAt: building.archivedAt?.toISOString() ?? null,
    addressLine1: building.addressLine1,
    addressLine2: building.addressLine2,
    ward: building.ward,
    district: building.district,
    city: building.city,
    postalCode: building.postalCode,
    countryCode: 'VN',
    latitude: building.latitude?.toNumber() ?? null,
    longitude: building.longitude?.toNumber() ?? null,
    createdAt: building.createdAt.toISOString(),
    updatedAt: building.updatedAt.toISOString(),
  };
}
