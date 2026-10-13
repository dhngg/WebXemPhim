import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:5174', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'npm run dev -w @rental/api',
      cwd: repositoryRoot,
      url: 'http://127.0.0.1:3100/api/v1/health',
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NODE_ENV: 'test',
        PORT: '3100',
        HOST: '127.0.0.1',
        DATABASE_ENABLED: 'false',
        DATABASE_ENVIRONMENT: 'development',
        DATABASE_URL: '',
        DIRECT_URL: '',
        SWAGGER_ENABLED: 'false',
      },
    },
    {
      command: 'npm run dev -w @rental/web -- --port 5174 --strictPort',
      cwd: repositoryRoot,
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: false,
      timeout: 60_000,
      env: { VITE_API_BASE_URL: '/api/v1', VITE_API_PROXY_TARGET: 'http://127.0.0.1:3100' },
    },
  ],
});
