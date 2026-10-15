import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LandlordApplicationRequest, LandlordApplicationResponse } from '@rental/shared';
import { env } from '@/lib/env';
import { httpClient } from '@/services/http/httpClient';
import { landlordApplicationMock } from '@/mocks/handlers/landlord-application.mock';
import { capabilityKeys } from '@/features/capabilities/hooks';

export interface LandlordApplicationApi {
  submit(reason: string): Promise<LandlordApplicationResponse>;
}

/**
 * Trạng thái đơn (PENDING/APPROVED/REJECTED) đã nằm trong `capabilities.landlordApplication`;
 * ở đây chỉ gửi đơn mới: `POST /landlord-applications/me { reason }`.
 */
export const landlordApplicationHttp: LandlordApplicationApi = {
  submit: (reason) =>
    httpClient.post<LandlordApplicationResponse>('/landlord-applications/me', { reason } satisfies LandlordApplicationRequest),
};

export const landlordApplicationApi: LandlordApplicationApi = env.useMockApi ? landlordApplicationMock : landlordApplicationHttp;

export function useSubmitLandlordApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => landlordApplicationApi.submit(reason.trim()),
    // Dù thành công hay bị từ chối (đã có đơn chờ duyệt…), lấy lại trạng thái thật từ backend.
    onSettled: () => qc.invalidateQueries({ queryKey: capabilityKeys.me }),
  });
}
