import type { Prisma } from '../../generated/prisma/client';
import { businessTodayDate } from '../../common/time/business-date';

/**
 * ACTIVE contracts whose startDate has been reached (business date, Asia/Ho_Chi_Minh). This is the
 * single definition of "the tenant is in the room": a future contract only reserves its period and
 * an overdue one (not yet ended by the OWNER) still counts until it is ended.
 */
export const startedActiveContractWhere = (
  today: Date = businessTodayDate(),
): Prisma.ContractWhereInput => ({
  status: 'ACTIVE',
  startDate: { lte: today },
});
