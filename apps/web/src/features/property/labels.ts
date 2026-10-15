import type { BadgeTone } from '@/components/ui';
import type { ListingStatus, OperationalStatus } from './types';

export const OPERATIONAL_STATUS: Record<OperationalStatus, { label: string; tone: BadgeTone }> = {
  VACANT: { label: 'Trống', tone: 'primary' },
  OCCUPIED: { label: 'Đang thuê', tone: 'success' },
  RESERVED: { label: 'Đã giữ chỗ', tone: 'warning' },
  MAINTENANCE: { label: 'Đang sửa chữa', tone: 'danger' },
};

export const LISTING_STATUS: Record<ListingStatus, { label: string; tone: BadgeTone }> = {
  DRAFT: { label: 'Tin nháp', tone: 'neutral' },
  PUBLISHED: { label: 'Đang đăng', tone: 'info' },
  HIDDEN: { label: 'Ẩn tin', tone: 'neutral' },
};
