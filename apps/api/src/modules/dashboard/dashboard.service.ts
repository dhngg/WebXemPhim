import { Injectable } from '@nestjs/common';
import type { DashboardResponse } from '@rental/shared';
import { ApplicationException } from '../../common/errors/application-exception';
import {
  DashboardBuildingNotFoundRepositoryError,
  DashboardRepository,
} from './dashboard.repository';
import type { DashboardQueryDto } from './dashboard.dto';

/** Current month in Asia/Ho_Chi_Minh (UTC+7, no DST). */
export function currentPeriod(now: Date = new Date()): string {
  const local = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return local.toISOString().slice(0, 7);
}

@Injectable()
export class DashboardService {
  constructor(private readonly repository: DashboardRepository) {}

  async get(workspaceId: string, query: DashboardQueryDto): Promise<DashboardResponse> {
    const period = query.period ?? currentPeriod();
    const buildingId = query.buildingId ?? null;
    try {
      const raw = await this.repository.summarize(workspaceId, buildingId, period);
      return {
        workspaceId,
        buildingId,
        period,
        rooms: raw.rooms,
        contracts: {
          active: raw.contracts.active,
          ended: raw.contracts.ended,
          expiringWithin30Days: raw.contracts.expiring,
          inEffect: raw.contracts.inEffect,
          upcoming: raw.contracts.upcoming,
          overdue: raw.contracts.overdue,
        },
        invoices: raw.invoices,
        revenue: { collected: raw.collected },
        receivables: {
          outstanding: raw.outstanding,
          overdueInvoices: raw.overdueInvoices,
          overdueOutstanding: raw.overdueOutstanding,
        },
        maintenance: raw.maintenance,
      };
    } catch (error) {
      if (error instanceof DashboardBuildingNotFoundRepositoryError)
        throw new ApplicationException('BUILDING_NOT_FOUND');
      throw error;
    }
  }
}
