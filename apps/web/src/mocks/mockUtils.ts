import { ApiError } from '@/services/http/ApiError';

/**
 * Tiện ích cho mock adapter (CHỈ dùng khi VITE_USE_MOCK_API=true).
 *
 * Giả lập lỗi để kiểm tra UI: thêm `?mock=<scenario>` vào URL trình duyệt, ví dụ
 *   /rooms?mock=500   /rooms?mock=empty   /account?mock=401   /rooms/r-1?mock=404
 * Các scenario: 400 | 401 | 403 | 404 | 409 | 500 | network | empty | slow
 */
export type MockScenario = '400' | '401' | '403' | '404' | '409' | '500' | 'network' | 'empty' | 'slow';

export function currentScenario(): MockScenario | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('mock');
  return (value as MockScenario | null) ?? null;
}

const MESSAGES: Record<string, string> = {
  '400': 'Dữ liệu không hợp lệ (mock 400).',
  '401': 'Phiên đăng nhập đã hết hạn (mock 401).',
  '403': 'Bạn không có quyền thực hiện thao tác này (mock 403).',
  '404': 'Không tìm thấy dữ liệu (mock 404).',
  '409': 'Dữ liệu bị xung đột (mock 409).',
  '500': 'Lỗi máy chủ (mock 500).',
};

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Mô phỏng độ trễ mạng + lỗi theo scenario. Gọi ở đầu mỗi mock handler. */
export async function simulate(): Promise<{ empty: boolean }> {
  const scenario = currentScenario();
  const isTest = import.meta.env.MODE === 'test';
  await delay(isTest ? 0 : scenario === 'slow' ? 2500 : 200 + Math.random() * 250);
  if (scenario === 'network') {
    throw new ApiError({ statusCode: 0, message: 'Không thể kết nối máy chủ (mock network).' });
  }
  if (scenario && scenario in MESSAGES) {
    throw new ApiError({ statusCode: Number(scenario), message: MESSAGES[scenario] ?? 'Lỗi mock' });
  }
  return { empty: scenario === 'empty' };
}

export function notFound(message = 'Không tìm thấy dữ liệu.'): never {
  throw new ApiError({ statusCode: 404, message });
}
