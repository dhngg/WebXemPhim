import type { BadgeTone } from '@/components/ui';
import type { AccountLinkStatus, ContractStatus, VehicleType, WaterMode } from './types';

export const CONTRACT_STATUS: Record<ContractStatus, { label: string; tone: BadgeTone }> = {
  DRAFT: { label: 'Nháp', tone: 'neutral' },
  ACTIVE: { label: 'Đang hiệu lực', tone: 'success' },
  ENDED: { label: 'Đã kết thúc', tone: 'info' },
  TERMINATED: { label: 'Chấm dứt sớm', tone: 'danger' },
};

export const LINK_STATUS: Record<AccountLinkStatus, { label: string; tone: BadgeTone }> = {
  UNLINKED: { label: 'Chưa liên kết', tone: 'neutral' },
  PENDING: { label: 'Chờ duyệt liên kết', tone: 'warning' },
  LINKED: { label: 'Đã liên kết', tone: 'success' },
};

export const VEHICLE_TYPE: Record<VehicleType, string> = {
  MOTORBIKE: 'Xe máy',
  EBIKE: 'Xe điện',
  BICYCLE: 'Xe đạp',
  CAR: 'Ô tô',
};

export const WATER_MODE: Record<WaterMode, string> = {
  PER_PERSON: 'Theo đầu người',
  METER: 'Theo đồng hồ (m³)',
};
