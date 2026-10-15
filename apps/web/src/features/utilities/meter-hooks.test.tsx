import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  listMeterReadings: vi.fn(),
  recordMeterReading: vi.fn(),
  adjustMeterReading: vi.fn(),
  listRoomServices: vi.fn(),
  addRoomService: vi.fn(),
  stopRoomService: vi.fn(),
}));
vi.mock('./api', () => ({ utilitiesApi: api }));

import { useAddRoomService, useAdjustMeter, useRecordMeter, useRoomMeters, useRoomServices } from './hooks';
import hooksSource from './hooks.ts?raw';

const wrapper = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };

describe('mutation chỉ số điện nước chờ làm mới dữ liệu xong', () => {
  it('mutateAsync (ghi và điều chỉnh) chỉ hoàn tất SAU khi danh sách chỉ số đã được tải lại', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let version = 0;
    api.listMeterReadings.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return [{ id: 'm', version }];
    });
    api.recordMeterReading.mockImplementation(async () => {
      version += 1;
      return { id: 'm' };
    });
    api.adjustMeterReading.mockImplementation(async () => {
      version += 1;
      return { id: 'm' };
    });
    const { result } = renderHook(
      () => ({ list: useRoomMeters('ws', 'b', 'r'), record: useRecordMeter('ws', 'b', 'r'), adjust: useAdjustMeter('ws', 'b', 'r') }),
      { wrapper: wrapper(client) },
    );
    await waitFor(() => expect(result.current.list.data).toEqual([{ id: 'm', version: 0 }]));

    await result.current.record.mutateAsync({} as never);
    // ngay khi mutateAsync trả về, UI đã có dữ liệu mới (không còn khoảng trống giữa toast và dữ liệu)
    expect(client.getQueryData(['workspaces', 'ws', 'ut', 'meters', 'r'])).toEqual([{ id: 'm', version: 1 }]);
    expect(api.listMeterReadings).toHaveBeenCalledTimes(2);

    await result.current.adjust.mutateAsync({ id: 'm', input: {} as never });
    expect(client.getQueryData(['workspaces', 'ws', 'ut', 'meters', 'r'])).toEqual([{ id: 'm', version: 2 }]);
    expect(api.listMeterReadings).toHaveBeenCalledTimes(3);
  });

  it('dịch vụ phòng cũng làm mới trước khi mutation hoàn tất; không còn invalidate “bắn rồi quên”', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let n = 0;
    api.listRoomServices.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return [n];
    });
    api.addRoomService.mockImplementation(async () => {
      n += 1;
    });
    const { result } = renderHook(() => ({ list: useRoomServices('ws', 'b', 'r'), add: useAddRoomService('ws', 'b', 'r') }), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.list.data).toEqual([0]));
    await result.current.add.mutateAsync({} as never);
    expect(client.getQueryData(['workspaces', 'ws', 'ut', 'services', 'r'])).toEqual([1]);
    expect(hooksSource).not.toMatch(/void qc\.invalidateQueries|=> void qc/);
  });
});
