import { Injectable } from '@nestjs/common';
import type {
  CreateViewingRequestRequest,
  DecideViewingRequestRequest,
  ViewingRequestPageResponse,
  ViewingRequestResponse,
} from '@rental/shared';
import { ApplicationException } from '../../../common/errors/application-exception';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceNotFoundRepositoryError,
} from '../../workspaces/repositories/workspace.repository';
import type { ViewingRequestQueryDto } from '../dto/viewing-request.dto';
import {
  ViewingRequestConflictRepositoryError,
  ViewingRequestInvalidTransitionRepositoryError,
  ViewingRequestNotEligibleRepositoryError,
  ViewingRequestNotFoundRepositoryError,
  ViewingRequestRepository,
  type ViewingRequestRecord,
} from '../repositories/viewing-request.repository';

@Injectable()
export class ViewingRequestService {
  constructor(private readonly repository: ViewingRequestRepository) {}

  create(
    userId: string,
    listingId: string,
    input: CreateViewingRequestRequest,
  ): Promise<ViewingRequestResponse> {
    return this.execute(() => this.repository.create(userId, listingId, input));
  }

  async listMine(
    userId: string,
    query: ViewingRequestQueryDto,
  ): Promise<ViewingRequestPageResponse> {
    const { items, total } = await this.repository.listMine(userId, query);
    return toPage(items, total, query);
  }

  async listWorkspace(
    workspaceId: string,
    query: ViewingRequestQueryDto,
  ): Promise<ViewingRequestPageResponse> {
    const { items, total } = await this.repository.listWorkspace(workspaceId, query);
    return toPage(items, total, query);
  }

  cancel(userId: string, requestId: string): Promise<ViewingRequestResponse> {
    return this.execute(() => this.repository.cancel(userId, requestId));
  }

  confirm(
    workspaceId: string,
    userId: string,
    requestId: string,
    input: DecideViewingRequestRequest,
  ): Promise<ViewingRequestResponse> {
    return this.execute(() =>
      this.repository.decide(workspaceId, userId, requestId, 'CONFIRMED', input),
    );
  }

  reject(
    workspaceId: string,
    userId: string,
    requestId: string,
    input: DecideViewingRequestRequest,
  ): Promise<ViewingRequestResponse> {
    return this.execute(() =>
      this.repository.decide(workspaceId, userId, requestId, 'REJECTED', input),
    );
  }

  private async execute(operation: () => Promise<ViewingRequestRecord>) {
    try {
      return toResponse(await operation());
    } catch (error) {
      if (error instanceof WorkspaceNotFoundRepositoryError)
        throw new ApplicationException('WORKSPACE_NOT_FOUND');
      if (error instanceof WorkspaceArchivedRepositoryError)
        throw new ApplicationException('WORKSPACE_ARCHIVED');
      if (error instanceof ViewingRequestNotFoundRepositoryError)
        throw new ApplicationException('VIEWING_REQUEST_NOT_FOUND');
      if (error instanceof ViewingRequestNotEligibleRepositoryError)
        throw new ApplicationException('VIEWING_REQUEST_NOT_ELIGIBLE');
      if (error instanceof ViewingRequestInvalidTransitionRepositoryError)
        throw new ApplicationException('VIEWING_REQUEST_INVALID_TRANSITION');
      if (error instanceof ViewingRequestConflictRepositoryError)
        throw new ApplicationException('VIEWING_REQUEST_CONFLICT');
      throw error;
    }
  }
}

function toPage(
  items: ViewingRequestRecord[],
  total: number,
  query: ViewingRequestQueryDto,
): ViewingRequestPageResponse {
  return { items: items.map(toResponse), total, page: query.page, limit: query.limit };
}

function toResponse(request: ViewingRequestRecord): ViewingRequestResponse {
  return {
    id: request.id,
    listingId: request.listingId,
    scheduledAt: request.scheduledAt.toISOString(),
    message: request.message,
    status: request.status,
    decisionNote: request.decisionNote,
    decidedAt: request.decidedAt?.toISOString() ?? null,
    cancelledAt: request.cancelledAt?.toISOString() ?? null,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    requester: {
      id: request.requester.id,
      email: request.requester.email,
      displayName: request.requester.displayName,
    },
    room: {
      id: request.listing.room.id,
      code: request.listing.room.code,
      buildingName: request.listing.room.building.name,
    },
  };
}
