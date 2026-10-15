import type { NotificationType } from '@rental/shared';

/** Nhãn loại thông báo theo enum của backend. */
export const NOTIFICATION_TYPE: Record<NotificationType, string> = {
  VIEWING_REQUESTED: 'Yêu cầu xem phòng',
  VIEWING_CONFIRMED: 'Lịch xem phòng được xác nhận',
  VIEWING_REJECTED: 'Lịch xem phòng bị từ chối',
  VIEWING_CANCELLED: 'Lịch xem phòng đã hủy',
  MAINTENANCE_CREATED: 'Yêu cầu bảo trì mới',
  MAINTENANCE_STATUS_CHANGED: 'Bảo trì đổi trạng thái',
  INVOICE_ISSUED: 'Hóa đơn đã phát hành',
};
