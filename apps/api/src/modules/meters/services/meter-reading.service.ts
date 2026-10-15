import { Injectable } from '@nestjs/common';
import type {
  AdjustMeterReadingRequest,
  CreateMeterReadingRequest,
  MeterReadingPageResponse,
  MeterReadingResponse,
} from '@rental/shared';
import { ApplicationException } from '../../../common/errors/application-exception';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceNotFoundRepositoryError,
} from '../../workspaces/repositories/workspace.repository';
import type { MeterReadingQueryDto } from '../dto/meter-reading.dto';
import {
  MeterReadingDuplicateRepositoryError,
  MeterReadingInvalidRepositoryError,
  MeterReadingNotEligibleRepositoryError,
  MeterReadingNotFoundRepositoryError,
  MeterReadingRepository,
  MeterRoomNotFoundRepositoryError,
  type MeterReadingRecord,
} from '../repositories/meter-reading.repository';
@Injectable()
export class MeterReadingService {
  constructor(private readonly repository: MeterReadingRepository) {}
  create(
    workspaceId: string,
    userId: string,
    buildingId: string,
    roomId: string,
    input: CreateMeterReadingRequest,
  ) {
    return this.execute(() =>
      this.repository.create(workspaceId, userId, buildingId, roomId, input),
    );
  }
  async list(
    workspaceId: string,
    buildingId: string,
    roomId: string,
    query: MeterReadingQueryDto,
  ): Promise<MeterReadingPageResponse> {
    try {
      const { items, total } = await this.repository.list(workspaceId, buildingId, roomId, query);
      return { items: items.map(toResponse), total, page: query.page, limit: query.limit };
    } catch (error) {
      throw mapError(error);
    }
  }
  adjust(
    workspaceId: string,
    userId: string,
    buildingId: string,
    roomId: string,
    readingId: string,
    input: AdjustMeterReadingRequest,
  ) {
    return this.execute(() =>
      this.repository.adjust(workspaceId, userId, buildingId, roomId, readingId, input),
    );
  }
  private async execute(operation: () => Promise<MeterReadingRecord>) {
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
  if (error instanceof MeterRoomNotFoundRepositoryError)
    return new ApplicationException('ROOM_NOT_FOUND');
  if (error instanceof MeterReadingNotFoundRepositoryError)
    return new ApplicationException('METER_READING_NOT_FOUND');
  if (error instanceof MeterReadingDuplicateRepositoryError)
    return new ApplicationException('METER_READING_DUPLICATE');
  if (error instanceof MeterReadingInvalidRepositoryError)
    return new ApplicationException('METER_READING_INVALID');
  if (error instanceof MeterReadingNotEligibleRepositoryError)
    return new ApplicationException('METER_READING_NOT_ELIGIBLE');
  return error;
}
function toResponse(reading: MeterReadingRecord): MeterReadingResponse {
  return {
    id: reading.id,
    workspaceId: reading.workspaceId,
    buildingId: reading.buildingId,
    roomId: reading.roomId,
    meterType: reading.meterType,
    period: reading.period.toISOString().slice(0, 7),
    previousReading: reading.previousReading.toFixed(3),
    currentReading: reading.currentReading.toFixed(3),
    consumption: reading.currentReading.sub(reading.previousReading).toFixed(3),
    revision: reading.revision,
    recordedBy: reading.recordedBy,
    adjustments: reading.adjustments.map((a) => ({
      id: a.id,
      revision: a.revision,
      oldPreviousReading: a.oldPreviousReading.toFixed(3),
      oldCurrentReading: a.oldCurrentReading.toFixed(3),
      newPreviousReading: a.newPreviousReading.toFixed(3),
      newCurrentReading: a.newCurrentReading.toFixed(3),
      reason: a.reason,
      adjustedBy: a.adjustedBy,
      createdAt: a.createdAt.toISOString(),
    })),
    createdAt: reading.createdAt.toISOString(),
    updatedAt: reading.updatedAt.toISOString(),
  };
}
