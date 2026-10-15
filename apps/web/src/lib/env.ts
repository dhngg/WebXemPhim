/** Cấu hình runtime đọc từ biến môi trường Vite. Không chứa secret. */
export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
  // API thật là mặc định; chỉ dùng mock khi đặt VITE_USE_MOCK_API=true.
  useMockApi: import.meta.env.VITE_USE_MOCK_API === 'true',
} as const;
