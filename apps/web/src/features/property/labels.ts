import type { BadgeTone } from '@/components/ui';
import type { ListingStatus, OperationalStatus, WsViewingStatus } from './types';

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

export const WS_VIEWING_STATUS: Record<WsViewingStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: 'Chờ xác nhận', tone: 'warning' },
  CONFIRMED: { label: 'Đã xác nhận', tone: 'primary' },
  COMPLETED: { label: 'Đã xem', tone: 'success' },
  CANCELLED: { label: 'Đã hủy', tone: 'neutral' },
};
