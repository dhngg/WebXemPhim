import { defineConfig, devices } from '@playwright/test';

// Cổng riêng cho e2e để không đụng dev server khác đang chạy ở 5173.
const PORT = Number(process.env.E2E_PORT ?? 5199);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  // Dev server biên dịch theo yêu cầu nên lần đầu mở trang có thể chậm.
  expect: { timeout: 10_000 },
  // PW_CHANNEL=msedge|chrome để dùng trình duyệt có sẵn trên máy thay vì tải Chromium.
  use: { baseURL: BASE_URL, trace: 'on-first-retry', channel: process.env.PW_CHANNEL || undefined },
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { VITE_USE_MOCK_API: 'true' },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
