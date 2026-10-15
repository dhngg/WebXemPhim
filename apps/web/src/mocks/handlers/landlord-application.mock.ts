import type { LandlordApplicationResponse } from '@rental/shared';
import type { LandlordApplicationApi } from '@/features/landlord-application/api';
import { ApiError } from '@/services/http/ApiError';
import { simulate } from '../mockUtils';
import { requireSession } from './auth.mock';

/** Đơn đăng ký chủ trọ của từng user demo (bộ nhớ, mất khi tải lại trang). */
export const mockLandlordApplications = new Map<string, LandlordApplicationResponse>();

export const landlordApplicationMock: LandlordApplicationApi = {
  async submit(reason) {
    await simulate();
    const { user } = requireSession();
    if (mockLandlordApplications.get(user.id)?.status === 'PENDING') {
      throw new ApiError({ statusCode: 409, code: 'LANDLORD_APPLICATION_PENDING', message: 'A landlord application is already pending' });
    }
    const now = new Date().toISOString();
    const application: LandlordApplicationResponse = {
      id: `la-${Date.now()}`,
      status: 'PENDING',
      reason,
      decisionNote: null,
      decidedByUserId: null,
      decidedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    mockLandlordApplications.set(user.id, application);
    return application;
  },
};
