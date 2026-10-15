import type { HealthResponse } from '@rental/shared';
import { httpClient } from '@/services/http/httpClient';

export function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return httpClient.get<HealthResponse>('/health', { signal });
}
