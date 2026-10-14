/** Cấu hình runtime đọc từ biến môi trường Vite. Không chứa secret. */
export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
  // Mặc định bật mock khi chưa cấu hình, vì backend chưa sẵn sàng.
  useMockApi: (import.meta.env.VITE_USE_MOCK_API ?? 'true') !== 'false',
} as const;
