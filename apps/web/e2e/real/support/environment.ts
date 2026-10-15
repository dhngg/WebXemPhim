export const REAL_WEB_ORIGIN = 'http://localhost:5173';
export const REAL_API_PREFIX = '/api/v1';
export const WRITE_APPROVAL_VALUE = 'I_APPROVE_NEON_DEVELOPMENT_APARTMENT_WRITES';
export const ACCOUNT_LOCK_APPROVAL_VALUE = 'I_APPROVE_TEST_ACCOUNT_LOCK_UNLOCK';

export type RealSmokeMode = 'read' | 'write';

export function realSmokeMode(): RealSmokeMode {
  const value = process.env.REAL_SMOKE_MODE ?? 'read';
  if (value !== 'read' && value !== 'write') {
    throw new Error('REAL_SMOKE_MODE must be either read or write.');
  }
  return value;
}

export function requireWriteEnvironment(): { adminEmail: string; adminPassword: string } {
  if (realSmokeMode() !== 'write') {
    throw new Error('REAL write tests require REAL_SMOKE_MODE=write.');
  }
  if (process.env.REAL_SMOKE_WRITE_APPROVAL !== WRITE_APPROVAL_VALUE) {
    throw new Error('Explicit Product approval for Neon development writes is missing.');
  }

  const adminEmail = process.env.REAL_SMOKE_ADMIN_EMAIL?.trim();
  const adminPassword = process.env.REAL_SMOKE_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    throw new Error('Platform Admin smoke credentials are missing.');
  }
  return { adminEmail, adminPassword };
}

export function accountLockApproved(): boolean {
  return process.env.REAL_SMOKE_ACCOUNT_LOCK_APPROVAL === ACCOUNT_LOCK_APPROVAL_VALUE;
}
