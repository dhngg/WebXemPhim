export type ViewingStatus = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';

export interface Viewing {
  id: string;
  roomId: string;
  roomTitle: string;
  roomAddress: string;
  roomImage?: string;
  scheduledAt: string;
  status: ViewingStatus;
  contactName: string;
  contactPhone: string;
  note?: string;
  createdAt: string;
}

export interface CreateViewingInput {
  roomId: string;
  scheduledAt: string;
  contactName: string;
  contactPhone: string;
  note?: string;
}

/** Hủy chỉ khi lịch chưa diễn ra/chưa hủy. Backend vẫn quyết định cuối cùng. */
export function canCancelViewing(status: ViewingStatus): boolean {
  return status === 'PENDING' || status === 'CONFIRMED';
}
