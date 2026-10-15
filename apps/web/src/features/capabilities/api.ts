import { env } from '@/lib/env';
import { httpClient } from '@/services/http/httpClient';
import { capabilitiesMock } from '@/mocks/handlers/capabilities.mock';
import { applyV1Policy, type Capabilities } from './model';

export interface CapabilitiesApi {
  get(): Promise<Capabilities>;
}

/** Nguồn quyền duy nhất: backend tính từ DB mỗi lần gọi (không suy ra từ JWT, email hay localStorage). */
export const capabilitiesHttp: CapabilitiesApi = {
  get: () => httpClient.get<Capabilities>('/users/me/capabilities'),
};

const source: CapabilitiesApi = env.useMockApi ? capabilitiesMock : capabilitiesHttp;

/** Mọi nơi trong web lấy quyền qua đây → áp chính sách V1 (chỉ OWNER) một lần duy nhất. */
export const capabilitiesApi: CapabilitiesApi = { get: async () => applyV1Policy(await source.get()) };
