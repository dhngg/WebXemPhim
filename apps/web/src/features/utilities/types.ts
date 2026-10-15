import type { MeterType, RateBillingUnit, RatePlanStatus, RateServiceType } from '@rental/shared';

export type { MeterType, RateBillingUnit, RatePlanStatus, RateServiceType };

/** Một phiên bản đơn giá của một mã dịch vụ trong tòa nhà (đổi giá = phiên bản mới, phiên bản cũ chuyển INACTIVE). */
export interface RatePlanItem {
  id: string;
  buildingId: string;
  /** Mã dịch vụ (A–Z, 0–9, _), duy nhất theo tòa nhà; room service tham chiếu theo mã này. */
  code: string;
  name: string;
  serviceType: RateServiceType;
  billingUnit: RateBillingUnit;
  /** Chuỗi thập phân chính xác của backend (tối đa 4 chữ số lẻ), không đổi sang số. */
  unitPrice: string;
  /** yyyy-MM-dd */
  effectiveFrom: string;
  /** yyyy-MM-dd, ngày KẾT THÚC LOẠI TRỪ (đơn giá hết hiệu lực từ ngày này). */
  effectiveTo?: string;
  status: RatePlanStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RateInput {
  code: string;
  name: string;
  serviceType: RateServiceType;
  billingUnit: RateBillingUnit;
  unitPrice: string;
  effectiveFrom: string;
}

/** Đổi giá: bắt buộc đơn giá + ngày áp dụng mới; tên / loại / đơn vị chỉ gửi khi đổi. */
export interface RateChangeInput {
  name?: string;
  serviceType?: RateServiceType;
  billingUnit?: RateBillingUnit;
  unitPrice: string;
  effectiveFrom: string;
}

export interface RateFilters {
  status?: RatePlanStatus;
  serviceType?: RateServiceType;
}

export interface RoomServiceItem {
  id: string;
  buildingId: string;
  roomId: string;
  rateCode: string;
  effectiveFrom: string;
  /** Ngày kết thúc loại trừ. */
  effectiveTo?: string;
  createdAt: string;
}

export interface RoomServiceInput {
  rateCode: string;
  effectiveFrom: string;
}

export interface MeterAdjustment {
  id: string;
  revision: number;
  oldPreviousReading: string;
  oldCurrentReading: string;
  newPreviousReading: string;
  newCurrentReading: string;
  reason: string;
  createdAt: string;
}

export interface MeterReadingItem {
  id: string;
  buildingId: string;
  roomId: string;
  meterType: MeterType;
  /** yyyy-MM */
  period: string;
  previousReading: string;
  currentReading: string;
  consumption: string;
  revision: number;
  adjustments: MeterAdjustment[];
  createdAt: string;
  updatedAt: string;
}

export interface MeterInput {
  meterType: MeterType;
  period: string;
  /** Bắt buộc ở lần ghi đầu tiên của phòng/loại đồng hồ; các lần sau backend lấy từ chỉ số mới của kỳ trước. */
  previousReading?: string;
  currentReading: string;
}

export interface MeterAdjustInput {
  currentReading: string;
  /** Chỉ chấp nhận khi chưa có kỳ nào trước đó. */
  previousReading?: string;
  reason: string;
}

export interface MeterFilters {
  meterType?: MeterType;
  period?: string;
}
