import type { ApiErrorBody } from '@/types/api';

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly fieldErrors?: Record<string, string>;

  constructor(body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = body.statusCode;
    this.code = body.code;
    this.fieldErrors = body.fieldErrors;
  }

  get isUnauthorized() {
    return this.status === 401;
  }
  get isForbidden() {
    return this.status === 403;
  }
  get isNotFound() {
    return this.status === 404;
  }
  get isConflict() {
    return this.status === 409;
  }
  get isNetwork() {
    return this.status === 0;
  }
}

const DEFAULT_MESSAGES: Record<number, string> = {
  403: 'Bạn không có quyền thực hiện thao tác này.',
  404: 'Không tìm thấy dữ liệu.',
  409: 'Thao tác không hợp lệ ở trạng thái hiện tại.',
};

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error && typeof error === 'object' && 'status' in error && typeof (error as { status: unknown }).status === 'number') {
    const { status, message } = error as { status: number; message?: string };
    return new ApiError({ statusCode: status, message: message ?? DEFAULT_MESSAGES[status] ?? 'Đã có lỗi xảy ra.' });
  }
  return new ApiError({ statusCode: 0, message: 'Không thể kết nối máy chủ. Vui lòng kiểm tra mạng.' });
}
