import { Injectable } from '@nestjs/common';
import type {
  CreateRatePlanRequest,
  RatePlanPageResponse,
  RatePlanResponse,
  StopRatePlanRequest,
  UpdateRatePlanRequest,
} from '@rental/shared';
import { ApplicationException } from '../../../common/errors/application-exception';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceNotFoundRepositoryError,
} from '../../workspaces/repositories/workspace.repository';
import type { RatePlanQueryDto } from '../dto/rate-plan.dto';
import {
  RatePlanConflictRepositoryError,
  RatePlanInactiveRepositoryError,
  RatePlanNotEligibleRepositoryError,
  RatePlanNotFoundRepositoryError,
  RatePlanRepository,
  type RatePlanRecord,
} from '../repositories/rate-plan.repository';
@Injectable()
export class RatePlanService {
  constructor(private readonly repository: RatePlanRepository) {}
  create(workspaceId: string, userId: string, buildingId: string, input: CreateRatePlanRequest) {
    if (!validDate(input.effectiveFrom)) throw new ApplicationException('VALIDATION_ERROR');
    return this.execute(() => this.repository.create(workspaceId, userId, buildingId, input));
  }
  async list(
    workspaceId: string,
    buildingId: string,
    query: RatePlanQueryDto,
  ): Promise<RatePlanPageResponse> {
    const { items, total } = await this.repository.list(workspaceId, buildingId, query);
    return { items: items.map(toResponse), total, page: query.page, limit: query.limit };
  }
  update(
    workspaceId: string,
    userId: string,
    buildingId: string,
    id: string,
    input: UpdateRatePlanRequest,
  ) {
    if (!validDate(input.effectiveFrom)) throw new ApplicationException('VALIDATION_ERROR');
    return this.execute(() => this.repository.update(workspaceId, userId, buildingId, id, input));
  }
  stop(
    workspaceId: string,
    userId: string,
    buildingId: string,
    id: string,
    input: StopRatePlanRequest,
  ) {
    if (!validDate(input.effectiveTo)) throw new ApplicationException('VALIDATION_ERROR');
    return this.execute(() => this.repository.stop(workspaceId, userId, buildingId, id, input));
  }
  private async execute(operation: () => Promise<RatePlanRecord>): Promise<RatePlanResponse> {
    try {
      return toResponse(await operation());
    } catch (error) {
      if (error instanceof WorkspaceNotFoundRepositoryError)
        throw new ApplicationException('WORKSPACE_NOT_FOUND');
      if (error instanceof WorkspaceArchivedRepositoryError)
        throw new ApplicationException('WORKSPACE_ARCHIVED');
      if (error instanceof RatePlanNotFoundRepositoryError)
        throw new ApplicationException('RATE_PLAN_NOT_FOUND');
      if (error instanceof RatePlanConflictRepositoryError)
        throw new ApplicationException('RATE_PLAN_CONFLICT');
      if (error instanceof RatePlanInactiveRepositoryError)
        throw new ApplicationException('RATE_PLAN_INACTIVE');
      if (error instanceof RatePlanNotEligibleRepositoryError)
        throw new ApplicationException('RATE_PLAN_NOT_ELIGIBLE');
      throw error;
    }
  }
}
const date = (v: string) => new Date(`${v}T00:00:00.000Z`);
const validDate = (v: string) =>
  !Number.isNaN(date(v).getTime()) && date(v).toISOString().slice(0, 10) === v;
function toResponse(rate: RatePlanRecord): RatePlanResponse {
  return {
    id: rate.id,
    workspaceId: rate.workspaceId,
    buildingId: rate.buildingId,
    code: rate.code,
    name: rate.name,
    serviceType: rate.serviceType,
    billingUnit: rate.billingUnit,
    unitPrice: rate.unitPrice.toFixed(4),
    effectiveFrom: rate.effectiveFrom.toISOString().slice(0, 10),
    effectiveTo: rate.effectiveTo?.toISOString().slice(0, 10) ?? null,
    status: rate.status,
    createdAt: rate.createdAt.toISOString(),
    updatedAt: rate.updatedAt.toISOString(),
  };
}
