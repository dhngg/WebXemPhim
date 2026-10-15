import { Injectable } from '@nestjs/common';
import type {
  CreateRoomServiceRequest,
  RoomServiceResponse,
  StopRoomServiceRequest,
} from '@rental/shared';
import { ApplicationException } from '../../../common/errors/application-exception';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceNotFoundRepositoryError,
} from '../../workspaces/repositories/workspace.repository';
import { RatePlanNotFoundRepositoryError } from '../../rates/repositories/rate-plan.repository';
import {
  RoomServiceConflictRepositoryError,
  RoomServiceNotEligibleRepositoryError,
  RoomServiceNotFoundRepositoryError,
  RoomServiceRepository,
  type RoomServiceRecord,
} from './room-service.repository';

const validDate = (v: string) => {
  const d = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

@Injectable()
export class RoomServiceService {
  constructor(private readonly repository: RoomServiceRepository) {}

  create(
    workspaceId: string,
    userId: string,
    buildingId: string,
    roomId: string,
    input: CreateRoomServiceRequest,
  ) {
    if (!validDate(input.effectiveFrom)) throw new ApplicationException('VALIDATION_ERROR');
    return this.run(() => this.repository.create(workspaceId, userId, buildingId, roomId, input));
  }
  async list(workspaceId: string, buildingId: string, roomId: string) {
    try {
      return (await this.repository.list(workspaceId, buildingId, roomId)).map(toResponse);
    } catch (error) {
      throw mapError(error);
    }
  }
  stop(
    workspaceId: string,
    userId: string,
    buildingId: string,
    roomId: string,
    serviceId: string,
    input: StopRoomServiceRequest,
  ) {
    if (!validDate(input.effectiveTo)) throw new ApplicationException('VALIDATION_ERROR');
    return this.run(() =>
      this.repository.stop(workspaceId, userId, buildingId, roomId, serviceId, input),
    );
  }
  private async run(operation: () => Promise<RoomServiceRecord>) {
    try {
      return toResponse(await operation());
    } catch (error) {
      throw mapError(error);
    }
  }
}

function mapError(error: unknown) {
  if (error instanceof WorkspaceNotFoundRepositoryError)
    return new ApplicationException('WORKSPACE_NOT_FOUND');
  if (error instanceof WorkspaceArchivedRepositoryError)
    return new ApplicationException('WORKSPACE_ARCHIVED');
  if (error instanceof RatePlanNotFoundRepositoryError)
    return new ApplicationException('RATE_PLAN_NOT_FOUND');
  if (error instanceof RoomServiceNotFoundRepositoryError)
    return new ApplicationException('ROOM_SERVICE_NOT_FOUND');
  if (error instanceof RoomServiceConflictRepositoryError)
    return new ApplicationException('ROOM_SERVICE_CONFLICT');
  if (error instanceof RoomServiceNotEligibleRepositoryError)
    return new ApplicationException('ROOM_SERVICE_NOT_ELIGIBLE');
  return error;
}

function toResponse(s: RoomServiceRecord): RoomServiceResponse {
  return {
    id: s.id,
    workspaceId: s.workspaceId,
    buildingId: s.buildingId,
    roomId: s.roomId,
    rateCode: s.rateCode,
    effectiveFrom: s.effectiveFrom.toISOString().slice(0, 10),
    effectiveTo: s.effectiveTo?.toISOString().slice(0, 10) ?? null,
    createdBy: s.createdBy,
    endedBy: s.endedBy,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}
