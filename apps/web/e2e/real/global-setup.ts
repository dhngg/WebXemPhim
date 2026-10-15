import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REAL_API_PREFIX, REAL_WEB_ORIGIN, realSmokeMode, requireWriteEnvironment } from './support/environment';

const EXPECTED_MIGRATION_COUNT = 27;
const EXPECTED_LAST_MIGRATION = '202610150027_contract_dates_room_state_guard';
const realDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(realDirectory, '../../../..');

interface ReadinessBody {
  status?: unknown;
  database?: unknown;
}

interface ErrorBody {
  code?: unknown;
}

export default async function globalSetup(): Promise<void> {
  assertStaticEnvironment();
  if (realSmokeMode() === 'write') requireWriteEnvironment();
  assertLocalMigrations();
  assertNeonIdentityAndTls();
  const migrationStatus = runSanitizedCommand('Prisma migration status', [
    'run',
    'prisma:migrate:status',
  ]);
  if (!migrationStatus.includes('Database schema is up to date')) {
    throw new Error('Prisma did not confirm that the Neon development schema is up to date.');
  }
  await assertRuntimeReadiness();
}

function assertStaticEnvironment(): void {
  if (process.env.VITE_USE_MOCK_API === 'true') {
    throw new Error('REAL smoke refuses VITE_USE_MOCK_API=true.');
  }

  const apiEnvironment = readEnvironmentFile(resolve(repositoryRoot, 'apps/api/.env'));
  const effective = (name: string): string | undefined => process.env[name] ?? apiEnvironment[name];
  const required: Record<string, string> = {
    NODE_ENV: 'development',
    DATABASE_ENVIRONMENT: 'development',
    DATABASE_ENABLED: 'true',
    AUTH_ENABLED: 'true',
  };
  for (const [name, expected] of Object.entries(required)) {
    if (effective(name) !== expected) {
      throw new Error(`${name} is not configured for the approved development smoke target.`);
    }
  }

  const origins = (effective('CORS_ORIGINS') ?? '').split(',').map((value) => value.trim());
  if (!origins.includes(REAL_WEB_ORIGIN)) {
    throw new Error('CORS_ORIGINS does not allow the REAL smoke web origin.');
  }
}

function assertNeonIdentityAndTls(): void {
  const apiEnvironment = readEnvironmentFile(resolve(repositoryRoot, 'apps/api/.env'));
  const databaseUrl = process.env.DATABASE_URL ?? apiEnvironment.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not configured.');
  const result = spawnSync(process.execPath, [resolve(realDirectory, 'support/neon-tls-probe.cjs')], {
    cwd: resolve(repositoryRoot, 'apps/api'),
    env: { ...process.env, FE11_PROBE_DATABASE_URL: databaseUrl },
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0 || !result.stdout.includes('PASS: Apartment/neondb_owner over TLS')) {
    throw new Error('Neon identity/TLS check failed; command output was suppressed to protect configuration.');
  }
}

function assertLocalMigrations(): void {
  const migrationDirectory = resolve(repositoryRoot, 'apps/api/prisma/migrations');
  const migrations = readdirSync(migrationDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (
    migrations.length !== EXPECTED_MIGRATION_COUNT ||
    migrations.at(-1) !== EXPECTED_LAST_MIGRATION
  ) {
    throw new Error('The local migration set is not the expected 27-migration FE-11 baseline.');
  }
}

async function assertRuntimeReadiness(): Promise<void> {
  const readiness = await fetchJson<ReadinessBody>(`${REAL_WEB_ORIGIN}${REAL_API_PREFIX}/health/ready`);
  if (readiness.status !== 'ok' || readiness.database !== 'up') {
    throw new Error('API readiness did not confirm database=up.');
  }

  const response = await fetch(`${REAL_WEB_ORIGIN}${REAL_API_PREFIX}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: REAL_WEB_ORIGIN,
      'X-CSRF-Protection': '1',
    },
    body: JSON.stringify({
      email: 'fe11-preflight-does-not-exist@example.com',
      password: 'NotARealPassword123!',
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await response.json().catch(() => ({}))) as ErrorBody;
  if (response.status !== 401 || body.code !== 'INVALID_CREDENTIALS') {
    throw new Error('Auth preflight did not return the expected enabled-service response.');
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Read-only preflight returned HTTP ${response.status}.`);
  return (await response.json()) as T;
}

function runSanitizedCommand(label: string, args: string[]): string {
  const executable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(executable, args, {
    cwd: repositoryRoot,
    env: process.env,
    encoding: 'utf8',
    windowsHide: true,
    // Node refuses to spawn .cmd files without a shell on Windows (EINVAL); the arguments are fixed literals.
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed; command output was suppressed to protect configuration.`);
  }
  return result.stdout;
}

function readEnvironmentFile(path: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const raw = match[2] ?? '';
    values[match[1]!] = raw.replace(/^(?:"(.*)"|'(.*)')$/, (_value, double, single) =>
      String(double ?? single ?? ''),
    );
  }
  return values;
}
