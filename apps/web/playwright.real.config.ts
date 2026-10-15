import { defineConfig, devices } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB_ORIGIN = 'http://localhost:5173';
const API_ORIGIN = 'http://127.0.0.1:3000';
const webRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(webRoot, '../..');
const writeMode = process.env.REAL_SMOKE_MODE === 'write';

const readDesktop = {
  name: 'real-read-desktop',
  testMatch: '**/*.read.spec.ts',
  use: { ...devices['Desktop Chrome'] },
};

export default defineConfig({
  testDir: './e2e/real',
  // Outside `test-results/`: the mock config empties that folder on every run, which would delete the REAL manifests.
  outputDir: './.real-smoke/output',
  globalSetup: './e2e/real/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: WEB_ORIGIN,
    channel: process.env.PW_CHANNEL || undefined,
    serviceWorkers: 'block',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  webServer: [
    {
      // `npm run dev` uses `node --watch`, which on Windows restarts endlessly while node_modules files are
      // first loaded, so the API never becomes healthy. Run the same entry point without the watcher.
      command: 'node --no-experimental-strip-types --require ts-node/register src/main.ts',
      cwd: resolve(repositoryRoot, 'apps/api'),
      url: `${API_ORIGIN}/api/v1/health`,
      // This API process exists only for the REAL run. The default 5 registrations per 15 minutes per IP
      // cannot fit the fresh accounts of one scenario (owners, tenant, outsider); counters are per process.
      env: {
        ...process.env,
        AUTH_RATE_LIMIT_REGISTER_IP_MAX: '50',
        AUTH_RATE_LIMIT_LOGIN_IP_MAX: '200',
      },
      // An existing process cannot prove which database it was started against. Refuse the occupied
      // port instead of reusing or stopping a teammate's server.
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npm run dev -w @rental/web -- --host localhost --port 5173 --strictPort',
      cwd: repositoryRoot,
      url: WEB_ORIGIN,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        VITE_API_BASE_URL: '/api/v1',
        VITE_API_PROXY_TARGET: API_ORIGIN,
        VITE_USE_MOCK_API: 'false',
      },
    },
  ],
  projects: writeMode
    ? [
        readDesktop,
        {
          name: 'real-write-desktop',
          testMatch: '**/*.write.spec.ts',
          dependencies: ['real-read-desktop'],
          use: { ...devices['Desktop Chrome'] },
        },
      ]
    : [
        readDesktop,
        {
          name: 'real-read-mobile',
          testMatch: '**/*.read.spec.ts',
          use: { ...devices['Pixel 7'] },
        },
      ],
});
