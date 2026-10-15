import { businessDateOf } from '@rental/shared';

/** Business calendar date (YYYY-MM-DD, Asia/Ho_Chi_Minh) of an instant; defaults to now. */
export const businessToday = (now: Date = new Date()): string => businessDateOf(now);

/** The same business date as the UTC-midnight `Date` Prisma uses for `@db.Date` columns. */
export const businessTodayDate = (now: Date = new Date()): Date =>
  new Date(`${businessDateOf(now)}T00:00:00.000Z`);
