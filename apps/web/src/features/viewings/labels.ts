import type { BadgeTone } from '@/components/ui';
import type { ViewingStatus } from './types';

export const VIEWING_STATUS: Record<ViewingStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: 'Chờ xác nhận', tone: 'warning' },
  CONFIRMED: { label: 'Đã xác nhận', tone: 'primary' },
  COMPLETED: { label: 'Đã xem', tone: 'success' },
  CANCELLED: { label: 'Đã hủy', tone: 'neutral' },
};
