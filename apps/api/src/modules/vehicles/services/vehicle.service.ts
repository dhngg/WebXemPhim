import { Injectable } from '@nestjs/common';
import type {
  CreateVehicleRequest,
  StopVehicleRequest,
  UpdateVehicleRequest,
  VehiclePageResponse,
  VehicleResponse,
} from '@rental/shared';
import { ApplicationException } from '../../../common/errors/application-exception';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceNotFoundRepositoryError,
} from '../../workspaces/repositories/workspace.repository';
import type { VehicleQueryDto } from '../dto/vehicle.dto';
import {
  VehicleAlreadyExistsRepositoryError,
  VehicleInactiveRepositoryError,
  VehicleNotEligibleRepositoryError,
  VehicleNotFoundRepositoryError,
  VehicleRepository,
  type VehicleRecord,
} from '../repositories/vehicle.repository';

@Injectable()
export class VehicleService {
  constructor(private readonly repository: VehicleRepository) {}
  create(workspaceId: string, userId: string, input: CreateVehicleRequest) {
    return this.execute(() => this.repository.create(workspaceId, userId, input));
  }
  async list(workspaceId: string, query: VehicleQueryDto): Promise<VehiclePageResponse> {
    const { items, total } = await this.repository.list(workspaceId, query);
    return { items: items.map(toResponse), total, page: query.page, limit: query.limit };
  }
  async detail(workspaceId: string, vehicleId: string) {
    const item = await this.repository.detail(workspaceId, vehicleId);
    if (!item) throw new ApplicationException('VEHICLE_NOT_FOUND');
    return toResponse(item);
  }
  update(workspaceId: string, userId: string, vehicleId: string, input: UpdateVehicleRequest) {
    if (!Object.values(input).some((value) => value !== undefined))
      throw new ApplicationException('VALIDATION_ERROR');
    return this.execute(() => this.repository.update(workspaceId, userId, vehicleId, input));
  }
  stop(workspaceId: string, userId: string, vehicleId: string, input: StopVehicleRequest) {
    return this.execute(() => this.repository.stop(workspaceId, userId, vehicleId, input));
  }
  private async execute(operation: () => Promise<VehicleRecord>): Promise<VehicleResponse> {
    try {
      return toResponse(await operation());
    } catch (error) {
      if (error instanceof WorkspaceNotFoundRepositoryError)
        throw new ApplicationException('WORKSPACE_NOT_FOUND');
      if (error instanceof WorkspaceArchivedRepositoryError)
        throw new ApplicationException('WORKSPACE_ARCHIVED');
      if (error instanceof VehicleNotFoundRepositoryError)
        throw new ApplicationException('VEHICLE_NOT_FOUND');
      if (error instanceof VehicleAlreadyExistsRepositoryError)
        throw new ApplicationException('VEHICLE_ALREADY_EXISTS');
      if (error instanceof VehicleInactiveRepositoryError)
        throw new ApplicationException('VEHICLE_INACTIVE');
      if (error instanceof VehicleNotEligibleRepositoryError)
        throw new ApplicationException('VEHICLE_NOT_ELIGIBLE');
      throw error;
    }
  }
}
function toResponse(vehicle: VehicleRecord): VehicleResponse {
  return {
    id: vehicle.id,
    workspaceId: vehicle.workspaceId,
    tenantId: vehicle.tenantId,
    licensePlate: vehicle.licensePlate,
    vehicleType: vehicle.vehicleType,
    brand: vehicle.brand,
    model: vehicle.model,
    color: vehicle.color,
    notes: vehicle.notes,
    status: vehicle.status,
    inactiveAt: vehicle.inactiveAt?.toISOString() ?? null,
    inactiveReason: vehicle.inactiveReason,
    createdAt: vehicle.createdAt.toISOString(),
    updatedAt: vehicle.updatedAt.toISOString(),
    tenant: vehicle.tenant,
  };
}
