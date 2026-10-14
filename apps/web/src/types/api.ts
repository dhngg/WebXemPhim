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
  /** Lỗi validation theo field (400). */
  fieldErrors?: Record<string, string>;
}
