/**
 * Kiểu dữ liệu chung cho API. ĐÂY LÀ ĐỀ XUẤT phía frontend, chưa phải hợp đồng chính thức.
 * Khi packages/shared có contract chính thức, thay thế bằng import từ đó.
 */
export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ApiErrorBody {
  statusCode: number;
  message: string;
  code?: string;
  /** Lỗi validation theo field (400), đã chuẩn hóa từ `errors[]` của backend. */
  fieldErrors?: Record<string, string>;
  /** Danh sách lỗi validation thô của backend, dạng "<field> <thông báo>". */
  errors?: string[];
  /** Giây phải chờ (header Retry-After của 429). */
  retryAfter?: number;
}
