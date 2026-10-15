import type { ApiErrorBody } from '@/types/api';

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly fieldErrors?: Record<string, string>;
  readonly retryAfter?: number;

  constructor(body: ApiErrorBody) {
    super(messageFor(body));
    this.name = 'ApiError';
    this.status = body.statusCode;
    this.code = body.code;
    this.fieldErrors = body.fieldErrors ?? fieldErrorsFrom(body.errors);
    this.retryAfter = body.retryAfter;
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
  get isRateLimited() {
    return this.status === 429;
  }
}

/** Thông báo tiếng Việt theo mã lỗi ổn định của backend; mã lạ dùng message gốc. */
const CODE_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'Email hoặc mật khẩu không đúng.',
  EMAIL_ALREADY_EXISTS: 'Email này đã có tài khoản.',
  ACCOUNT_DISABLED: 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.',
  UNAUTHORIZED: 'Bạn cần đăng nhập để tiếp tục.',
  ACCESS_TOKEN_EXPIRED: 'Phiên đăng nhập đã hết hạn.',
  REFRESH_TOKEN_INVALID: 'Phiên đăng nhập đã hết hạn.',
  TOKEN_REUSE_DETECTED: 'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.',
  CSRF_VALIDATION_FAILED: 'Yêu cầu bị từ chối vì lý do bảo mật. Hãy tải lại trang và thử lại.',
  AUTH_DISABLED: 'Chức năng đăng nhập hiện chưa được bật trên máy chủ.',
  PASSWORD_RESET_TOKEN_INVALID: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.',
  VALIDATION_ERROR: 'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại các trường.',
  PLATFORM_ADMIN_REQUIRED: 'Bạn không có quyền quản trị nền tảng.',
  LANDLORD_APPLICATION_PENDING: 'Bạn đã có một đơn đăng ký chủ trọ đang chờ duyệt.',
  LANDLORD_APPLICATION_COOLDOWN:
    'Hiện chưa thể gửi đơn mới: bạn đã là chủ trọ, vừa bị từ chối trong 30 ngày qua hoặc đã gửi quá số đơn cho phép trong năm.',
};

function messageFor(body: ApiErrorBody): string {
  if (body.statusCode === 429) {
    return body.retryAfter
      ? `Bạn thao tác quá nhanh. Vui lòng thử lại sau ${body.retryAfter} giây.`
      : 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.';
  }
  return (body.code && CODE_MESSAGES[body.code]) || body.message;
}

/**
 * Backend trả lỗi validation dạng chuỗi "<field> <thông báo>" (class-validator). Tách tên field
 * (ký tự đầu tiên đến khoảng trắng) để form gắn lỗi đúng ô; chuỗi không theo dạng đó bị bỏ qua.
 */
export function fieldErrorsFrom(errors?: string[]): Record<string, string> | undefined {
  if (!errors?.length) return undefined;
  const result: Record<string, string> = {};
  for (const line of errors) {
    const match = /^([a-z][\w.]*)\s+(.+)$/.exec(line);
    if (match && !(match[1]! in result)) result[match[1]!] = match[2]!;
  }
  return Object.keys(result).length ? result : undefined;
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
