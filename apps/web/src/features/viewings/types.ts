/** Trạng thái do backend định nghĩa (VIEWING_REQUEST_STATUSES). Backend không có trạng thái "đã xem". */
export type ViewingStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED';

export interface Viewing {
  id: string;
  /** ID tin đăng công khai (khác Room ID). Dùng cho đường dẫn /rooms/:listingId. */
  listingId: string;
  roomId: string;
  roomTitle: string;
  /** Backend chưa trả địa chỉ/ảnh trong yêu cầu xem phòng. */
  roomAddress?: string;
  roomImage?: string;
  scheduledAt: string;
  status: ViewingStatus;
  /** Lời nhắn người xem gửi chủ trọ. */
  note?: string;
  /** Ghi chú của chủ trọ khi xác nhận/từ chối. */
  decisionNote?: string;
  createdAt: string;
}

export interface CreateViewingInput {
  listingId: string;
  scheduledAt: string;
  note?: string;
}

/** Hủy khi chờ xác nhận hoặc đã xác nhận (đúng API: PENDING | CONFIRMED → CANCELLED). Backend vẫn quyết định cuối cùng. */
export function canCancelViewing(status: ViewingStatus): boolean {
  return status === 'PENDING' || status === 'CONFIRMED';
}
