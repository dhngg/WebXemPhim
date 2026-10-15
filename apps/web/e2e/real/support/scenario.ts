import { expect } from '@playwright/test';
import { RealApiError } from './real-api';

const DAY_MS = 86_400_000;
const BUSINESS_UTC_OFFSET_MS = 7 * 3_600_000;

/** Calendar date (YYYY-MM-DD) in the business time zone (Asia/Ho_Chi_Minh, UTC+7, no DST). */
export function businessToday(now = Date.now()): string {
  return new Date(now + BUSINESS_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function monthStart(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

/** First day of the month after the one containing `isoDate`. */
export function nextMonthStart(isoDate: string): string {
  return monthStart(addDays(monthStart(isoDate), 32));
}

export function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

export function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString();
}

/** Short unique suffix for human-readable fixture names and codes. */
export function shortId(runId: string): string {
  return runId.slice(-8);
}

/** The request must be rejected with the given application error code (and status, when given). */
export async function expectApiError(
  attempt: Promise<unknown>,
  code: string,
  status?: number,
): Promise<void> {
  const outcome = await attempt.then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(outcome, `expected ${code} but the request succeeded`).toBeInstanceOf(RealApiError);
  expect(outcome).toMatchObject(status === undefined ? { code } : { code, status });
}

/** The request must be refused without leaking the record: 401, 403 or 404, never a success. */
export async function expectDenied(attempt: Promise<unknown>): Promise<void> {
  const outcome = await attempt.then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(outcome, 'expected the request to be denied but it succeeded').toBeInstanceOf(RealApiError);
  expect([401, 403, 404]).toContain((outcome as RealApiError).status);
}

/** Whole-VND strings come back as plain integers; compare numerically so formatting never matters. */
export function vnd(value: string | null | undefined): number {
  return Number(value ?? Number.NaN);
}
