import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  listPayments: vi.fn(),
  getPayment: vi.fn(),
  recordPayment: vi.fn(),
  reversePayment: vi.fn(),
}));
vi.mock('./api', () => ({ paymentsApi: api }));

import { usePaymentLedger, useRecordPayment, useReversePayment } from './hooks';
import hooksSource from './hooks.ts?raw';

const wrapper = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };

describe('ghi/đảo thanh toán chờ sổ được tải lại xong', () => {
  it('mutateAsync chỉ hoàn tất SAU khi sổ thanh toán mới đã về (không để "Thu đủ" dùng số còn lại cũ)', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let paid = 0;
    api.listPayments.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { outstanding: String(3_000_000 - paid), items: [] };
    });
    api.recordPayment.mockImplementation(async () => {
      paid += 1_000_000;
      return { id: 'p' };
    });
    api.reversePayment.mockImplementation(async () => {
      paid -= 1_000_000;
      return { id: 'r' };
    });
    const page = { page: 1, limit: 20 };
    const { result } = renderHook(
      () => ({
        ledger: usePaymentLedger('ws', 'b', 'inv', page),
        record: useRecordPayment('ws', 'b', 'inv'),
        reverse: useReversePayment('ws', 'b', 'inv'),
      }),
      { wrapper: wrapper(client) },
    );
    await waitFor(() => expect(result.current.ledger.data?.outstanding).toBe('3000000'));

    await result.current.record.mutateAsync({} as never);
    // ngay khi mutateAsync trả về, dữ liệu trong bộ nhớ đã là số còn phải thu mới
    expect(client.getQueryData(['workspaces', 'ws', 'pay', 'ledger', 'b', 'inv', page])).toEqual({ outstanding: '2000000', items: [] });

    await result.current.reverse.mutateAsync({ id: 'p', input: {} as never });
    expect(client.getQueryData(['workspaces', 'ws', 'pay', 'ledger', 'b', 'inv', page])).toEqual({ outstanding: '3000000', items: [] });
  });

  it('không còn invalidate “bắn rồi quên” trong hook thanh toán', () => {
    expect(hooksSource).not.toMatch(/void qc\.invalidateQueries/);
  });
});
