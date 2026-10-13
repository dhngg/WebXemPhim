import type { HealthResponse } from '@rental/shared';
import { httpClient } from './http-client';

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await httpClient.get<HealthResponse>('/health', { signal });
  return response.data;
}
