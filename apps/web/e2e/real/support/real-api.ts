import type { APIRequestContext, APIResponse } from '@playwright/test';
import type { AuthTokenResponse, LoginRequest, RegisterRequest } from '@rental/shared';
import { REAL_API_PREFIX, REAL_WEB_ORIGIN } from './environment';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

interface RequestOptions {
  data?: unknown;
  expectedStatus?: number | readonly number[];
}

export class RealApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    method: string,
    path: string,
  ) {
    super(`${method} ${path} returned HTTP ${status}${code ? ` (${code})` : ''}.`);
  }
}

export class RealApi {
  private accessToken: string | undefined;
  private credentials: LoginRequest | undefined;

  constructor(private readonly context: APIRequestContext) {}

  async register(input: RegisterRequest): Promise<AuthTokenResponse> {
    const response = await this.request<AuthTokenResponse>('POST', '/auth/register', {
      data: input,
      expectedStatus: 201,
    });
    this.accessToken = response.accessToken;
    this.credentials = { email: input.email, password: input.password };
    return response;
  }

  async login(input: LoginRequest): Promise<AuthTokenResponse> {
    const response = await this.request<AuthTokenResponse>('POST', '/auth/login', {
      data: input,
      expectedStatus: 200,
    });
    this.accessToken = response.accessToken;
    this.credentials = { email: input.email, password: input.password };
    return response;
  }

  get<T>(path: string, expectedStatus: number | readonly number[] = 200): Promise<T> {
    return this.request<T>('GET', path, { expectedStatus });
  }

  post<T>(path: string, data?: unknown, expectedStatus: number | readonly number[] = 201): Promise<T> {
    return this.request<T>('POST', path, { data, expectedStatus });
  }

  patch<T>(path: string, data?: unknown, expectedStatus: number | readonly number[] = 200): Promise<T> {
    return this.request<T>('PATCH', path, { data, expectedStatus });
  }

  put<T>(path: string, data?: unknown, expectedStatus: number | readonly number[] = 200): Promise<T> {
    return this.request<T>('PUT', path, { data, expectedStatus });
  }

  delete<T>(path: string, expectedStatus: number | readonly number[] = 204): Promise<T> {
    return this.request<T>('DELETE', path, { expectedStatus });
  }

  financialPost<T>(
    path: string,
    data: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<T> {
    return this.request<T>('POST', path, {
      data: { ...data, idempotencyKey },
      expectedStatus: [200, 201],
    });
  }

  private async request<T>(method: string, path: string, options: RequestOptions): Promise<T> {
    let response = await this.send(method, path, options.data);
    // The access token lives 10 minutes; a long scenario signs in again (same account) instead of failing.
    if (response.status() === 401 && this.accessToken && this.credentials) {
      this.accessToken = (
        await this.request<AuthTokenResponse>('POST', '/auth/login', {
          data: this.credentials,
          expectedStatus: 200,
        })
      ).accessToken;
      response = await this.send(method, path, options.data);
    }
    return this.parse<T>(response, method, path, options.expectedStatus ?? 200);
  }

  private send(method: string, path: string, data: unknown): Promise<APIResponse> {
    const headers: Record<string, string> = { Origin: REAL_WEB_ORIGIN };
    if (MUTATING_METHODS.has(method)) headers['X-CSRF-Protection'] = '1';
    if (this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;
    return this.context.fetch(`${REAL_API_PREFIX}${path}`, { method, headers, data });
  }

  private async parse<T>(
    response: APIResponse,
    method: string,
    path: string,
    expectedStatus: number | readonly number[],
  ): Promise<T> {
    const expected = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
    const body = response.status() === 204 ? undefined : await response.json().catch(() => undefined);
    if (!expected.includes(response.status())) {
      const code = getErrorCode(body);
      throw new RealApiError(response.status(), code, method, path);
    }
    return body as T;
  }
}

export function getErrorCode(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || !('code' in value)) return undefined;
  return typeof value.code === 'string' ? value.code : undefined;
}
