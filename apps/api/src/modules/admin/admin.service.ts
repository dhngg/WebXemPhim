import { Injectable } from '@nestjs/common';
import type {
  AdminAuditLogPageResponse,
  AdminListingPageResponse,
  AdminListingResponse,
  AdminUserDetailResponse,
  AdminUserPageResponse,
  AdminUserResponse,
} from '@rental/shared';
import { ApplicationException } from '../../common/errors/application-exception';
import {
  AdminListingNotFoundRepositoryError,
  AdminNotAuthorizedRepositoryError,
  AdminRepository,
  AdminStateUnchangedRepositoryError,
  AdminTargetProtectedRepositoryError,
  AdminUserNotFoundRepositoryError,
} from './admin.repository';
import type { AdminAuditQueryDto, AdminListingQueryDto, AdminUserQueryDto } from './admin.dto';

type UserRow = {
  id: string;
  email: string;
  displayName: string | null;
  status: 'ACTIVE' | 'DISABLED';
  disabledAt: Date | null;
  createdAt: Date;
  platformAdmin: { userId: string } | null;
};

export function toUserResponse(u: UserRow): AdminUserResponse {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    status: u.status,
    isPlatformAdmin: u.platformAdmin !== null,
    disabledAt: u.disabledAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

type ListingRow = {
  id: string;
  workspaceId: string;
  roomId: string;
  isPublished: boolean;
  room: {
    code: string;
    monthlyRent: { toFixed(d: number): string };
    building: { name: string; city: string };
  };
  moderation: { isHidden: boolean; reason: string; updatedAt: Date } | null;
};

export function toListingResponse(l: ListingRow): AdminListingResponse {
  return {
    id: l.id,
    workspaceId: l.workspaceId,
    roomId: l.roomId,
    roomCode: l.room.code,
    buildingName: l.room.building.name,
    city: l.room.building.city,
    monthlyRent: l.room.monthlyRent.toFixed(2),
    isPublished: l.isPublished,
    isHidden: l.moderation?.isHidden ?? false,
    moderationReason: l.moderation?.reason ?? null,
    moderatedAt: l.moderation?.updatedAt.toISOString() ?? null,
  };
}

/** Audit metadata is written by this module only and holds ids/counters, never PII or secrets. */
function safeMetadata(value: unknown): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) {
      if (v === null || ['string', 'number', 'boolean'].includes(typeof v))
        out[k] = v as string | number | boolean | null;
    }
  }
  return out;
}

@Injectable()
export class AdminService {
  constructor(private readonly repository: AdminRepository) {}

  async listUsers(query: AdminUserQueryDto): Promise<AdminUserPageResponse> {
    const { items, total } = await this.repository.listUsers(query);
    return { items: items.map(toUserResponse), total, page: query.page, limit: query.limit };
  }

  async getUser(id: string): Promise<AdminUserDetailResponse> {
    try {
      const { user, activeSessions, lastReason } = await this.repository.getUser(id);
      return {
        ...toUserResponse(user),
        workspaceMembershipCount: user._count.memberships,
        activeSessionCount: activeSessions,
        lastModerationReason: lastReason,
      };
    } catch (error) {
      throw this.map(error);
    }
  }

  async setUserLock(actorId: string, id: string, lock: boolean, reason: string) {
    try {
      return toUserResponse(await this.repository.setUserLock(actorId, id, lock, reason));
    } catch (error) {
      throw this.map(error);
    }
  }

  async listListings(query: AdminListingQueryDto): Promise<AdminListingPageResponse> {
    const { items, total } = await this.repository.listListings(query);
    return { items: items.map(toListingResponse), total, page: query.page, limit: query.limit };
  }

  async setListingHidden(actorId: string, id: string, hidden: boolean, reason: string) {
    try {
      return toListingResponse(await this.repository.setListingHidden(actorId, id, hidden, reason));
    } catch (error) {
      throw this.map(error);
    }
  }

  async listAudit(query: AdminAuditQueryDto): Promise<AdminAuditLogPageResponse> {
    const { items, total } = await this.repository.listAudit(query);
    return {
      items: items.map((l) => ({
        id: l.id,
        actorUserId: l.actorUserId,
        action: l.action,
        targetType: l.targetType,
        targetId: l.targetId,
        reason: l.reason,
        metadata: safeMetadata(l.metadata),
        createdAt: l.createdAt.toISOString(),
      })),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  private map(error: unknown): unknown {
    if (error instanceof AdminUserNotFoundRepositoryError)
      return new ApplicationException('ADMIN_USER_NOT_FOUND');
    if (error instanceof AdminListingNotFoundRepositoryError)
      return new ApplicationException('LISTING_NOT_FOUND');
    if (error instanceof AdminTargetProtectedRepositoryError)
      return new ApplicationException('ADMIN_TARGET_PROTECTED');
    if (error instanceof AdminStateUnchangedRepositoryError)
      return new ApplicationException('ADMIN_STATE_UNCHANGED');
    if (error instanceof AdminNotAuthorizedRepositoryError)
      return new ApplicationException('PLATFORM_ADMIN_REQUIRED');
    return error;
  }
}
