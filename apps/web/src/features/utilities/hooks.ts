import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { utilitiesApi } from './api';
import type { MeterAdjustInput, MeterInput, RateChangeInput, RateFilters, RateInput, RatePlanItem, RoomServiceInput } from './types';

const root = (ws: string) => ['workspaces', ws, 'ut'] as const;
const ratesKey = (ws: string, buildingId: string) => [...root(ws), 'rates', buildingId] as const;
const servicesKey = (ws: string, roomId: string) => [...root(ws), 'services', roomId] as const;
const metersKey = (ws: string, roomId: string) => [...root(ws), 'meters', roomId] as const;

export function useRates(ws: string, buildingId: string | undefined, filters: RateFilters = {}) {
  return useQuery({
    queryKey: [...ratesKey(ws, buildingId ?? ''), filters],
    queryFn: () => utilitiesApi.listRates(ws, buildingId!, filters),
    enabled: Boolean(buildingId),
  });
}
/** Tạo/đổi/ngừng đơn giá ảnh hưởng cả danh sách đã lọc lẫn danh sách mã dùng cho dịch vụ phòng. */
function useInvalidateRates(ws: string, buildingId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ratesKey(ws, buildingId) });
}
export function useCreateRate(ws: string, buildingId: string) {
  const done = useInvalidateRates(ws, buildingId);
  return useMutation({ mutationFn: (input: RateInput) => utilitiesApi.createRate(ws, buildingId, input), onSuccess: done });
}
export function useChangeRate(ws: string, buildingId: string) {
  const done = useInvalidateRates(ws, buildingId);
  return useMutation({
    mutationFn: ({ rate, input }: { rate: RatePlanItem; input: RateChangeInput }) => utilitiesApi.changeRate(ws, buildingId, rate, input),
    onSuccess: done,
  });
}
export function useStopRate(ws: string, buildingId: string) {
  const done = useInvalidateRates(ws, buildingId);
  return useMutation({
    mutationFn: ({ id, effectiveTo }: { id: string; effectiveTo: string }) => utilitiesApi.stopRate(ws, buildingId, id, effectiveTo),
    onSuccess: done,
  });
}

export function useRoomServices(ws: string, buildingId: string, roomId: string) {
  return useQuery({ queryKey: servicesKey(ws, roomId), queryFn: () => utilitiesApi.listRoomServices(ws, buildingId, roomId) });
}
export function useAddRoomService(ws: string, buildingId: string, roomId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RoomServiceInput) => utilitiesApi.addRoomService(ws, buildingId, roomId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: servicesKey(ws, roomId) }),
  });
}
export function useStopRoomService(ws: string, buildingId: string, roomId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, effectiveTo }: { id: string; effectiveTo: string }) => utilitiesApi.stopRoomService(ws, buildingId, roomId, id, effectiveTo),
    onSuccess: () => qc.invalidateQueries({ queryKey: servicesKey(ws, roomId) }),
  });
}

/** Toàn bộ chỉ số của một phòng (mọi kỳ, cả điện và nước): đủ để biết kỳ mới nhất và số cũ gợi ý. */
export function useRoomMeters(ws: string, buildingId: string, roomId: string) {
  return useQuery({ queryKey: metersKey(ws, roomId), queryFn: () => utilitiesApi.listMeterReadings(ws, buildingId, roomId) });
}
export function useRecordMeter(ws: string, buildingId: string, roomId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MeterInput) => utilitiesApi.recordMeterReading(ws, buildingId, roomId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: metersKey(ws, roomId) }),
  });
}
export function useAdjustMeter(ws: string, buildingId: string, roomId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: MeterAdjustInput }) => utilitiesApi.adjustMeterReading(ws, buildingId, roomId, id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: metersKey(ws, roomId) }),
  });
}
