import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardResponse } from '@rental/shared';

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
const session = vi.hoisted(() => ({ record: null as unknown }));

vi.mock('@/services/http/httpClient', () => ({ httpClient: http }));
vi.mock('@/mocks/mockUtils', () => ({ simulate: async () => ({ empty: false }), notFound: () => { throw new Error('nf'); } }));
vi.mock('@/mocks/handlers/auth.mock', () => ({ requireSession: () => session.record, currentMockUser: () => null }));

import { db } from '@/mocks/db';
import { dashboardMock } from '@/mocks/handlers/dashboard.mock';
import { DashboardPage } from '@/pages/workspace/DashboardPage';
import { dashboardHttp } from './api';
import apiSource from './api.ts?raw';
import pageSource from '../../pages/workspace/DashboardPage.tsx?raw';

const WS = '11111111-1111-4111-8111-111111111111';
const B = '33333333-3333-4333-8333-333333333333';
const response = (o: Partial<DashboardResponse> = {}): DashboardResponse => ({
  workspaceId: WS, buildingId: null, period: '2026-10',
  rooms: { total: 10, vacant: 3, occupied: 6, unavailable: 1 },
  contracts: { active: 7, ended: 2, expiringWithin30Days: 1, inEffect: 5, upcoming: 1, overdue: 1 },
  invoices: { draft: 2, issued: 9, issuedInPeriod: 4, billedInPeriod: '12345678', unpaid: 3, partiallyPaid: 2, paid: 4 },
  revenue: { collected: '7000000' },
  receivables: { outstanding: '5345678', overdueInvoices: 2, overdueOutstanding: '1500000' },
  maintenance: { open: 4, inProgress: 2, resolved: 1, closed: 7, cancelled: 3 },
  ...o,
});

beforeEach(() => {
  for (const fn of Object.values(http)) fn.mockReset();
});

describe('HTTP adapter', () => {
  it('sends only buildingId and period', async () => {
    http.get.mockResolvedValue(response());
    await dashboardHttp.get(WS, { buildingId: B, period: '2026-10' });
    expect(http.get).toHaveBeenLastCalledWith(`/workspaces/${WS}/dashboard`, { query: { buildingId: B, period: '2026-10' } });
    await dashboardHttp.get(WS, {});
    expect(http.get).toHaveBeenLastCalledWith(`/workspaces/${WS}/dashboard`, { query: { buildingId: undefined, period: undefined } });
  });
  it('uses the shared DashboardResponse and none of the removed mock-only fields', () => {
    expect(apiSource).toMatch(/DashboardResponse/);
    expect(pageSource).not.toMatch(/BarChart|DonutChart|kpis|ServiceSlice|DueInvoice|occupancyCells|\bdueInvoices\b|recentMaintenance|billing\/run|\/invoices\/\$\{/);
  });
});

describe('the page renders the real backend response shape', () => {
  function mount() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createMemoryRouter(
      [
        {
          path: '/w/:workspaceId',
          element: <Outlet context={{ workspaceId: WS, role: 'OWNER', status: 'ACTIVE', name: 'WS' }} />,
          children: [{ path: 'dashboard', element: <DashboardPage /> }],
        },
      ],
      { initialEntries: [`/w/${WS}/dashboard?period=2026-10`] },
    );
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
  }
  const buildings = [{ id: B, workspaceId: WS, name: 'Tòa A', addressLine1: 'x', city: 'HCM', status: 'ACTIVE', archivedAt: null, createdAt: '', updatedAt: '' }];

  it('shows every aggregate with decimal-string money and no mock-only section', async () => {
    http.get.mockImplementation(async (url: string) => {
      if (url.endsWith('/dashboard')) return response();
      if (url.endsWith('/buildings')) return buildings;
      return { items: [], page: 1, limit: 50, total: 0 };
    });
    mount();
    await waitFor(() => expect(screen.getByText('Tổng số phòng')).toBeTruthy());
    for (const label of ['Đang thuê', 'Trống', 'Không khả dụng', 'Đang có hiệu lực', 'Chưa đến ngày bắt đầu', 'Quá hạn, chưa kết thúc', 'Hết hạn trong 30 ngày', 'Bản nháp', 'Phát hành trong kỳ', 'Chưa thanh toán', 'Thanh toán một phần', 'Còn phải thu', 'Công nợ quá hạn', 'Mới tiếp nhận', 'Đang xử lý']) {
      expect(screen.getAllByText(label).length, label).toBeGreaterThan(0);
    }
    const text = document.body.textContent ?? '';
    expect(text.replace(/\s/g, ' ')).toMatch(/12\.345\.678 ₫/); // billedInPeriod, from the string, not a float
    expect(text.replace(/\s/g, ' ')).toMatch(/7\.000\.000 ₫/); // collected
    expect(text).toMatch(/Chưa kết thúc: 7 • Đã kết thúc: 2/);
    expect(text).toMatch(/3 \/ 3|7 \/ 3/); // closed / cancelled counters
    expect(screen.queryByText(/Doanh thu 6 tháng|Cơ cấu dịch vụ|Lấp đầy/)).toBeNull();
  });

  it('passes the building and period filters to the backend', async () => {
    http.get.mockImplementation(async (url: string) => (url.endsWith('/dashboard') ? response({ buildingId: B }) : url.endsWith('/buildings') ? buildings : { items: [], page: 1, limit: 50, total: 0 }));
    mount();
    await waitFor(() => expect(http.get.mock.calls.some((c) => String(c[0]).endsWith('/dashboard'))).toBe(true));
    const call = http.get.mock.calls.find((c) => String(c[0]).endsWith('/dashboard'))!;
    expect((call[1] as { query: Record<string, unknown> }).query).toEqual({ buildingId: undefined, period: '2026-10' });
  });
});

describe('mock returns the same shape and consistent figures', () => {
  const ws = db.tenants[0]!.workspaceId;
  const as = (role = 'OWNER') => {
    session.record = { user: { id: 'u1', fullName: 'C', email: 'o@x.vn' }, memberships: [{ workspaceId: ws, role, status: 'ACTIVE', name: 'WS' }] };
  };
  it('OWNER only, building/period filters, money as strings, active = inEffect + upcoming + overdue', async () => {
    for (const role of ['MANAGER', 'STAFF']) {
      as(role);
      await expect(dashboardMock.get(ws, {})).rejects.toBeTruthy();
    }
    as();
    const all = await dashboardMock.get(ws, { period: '2026-10' });
    expect(all).toMatchObject({ workspaceId: ws, buildingId: null, period: '2026-10' });
    expect(all.rooms.total).toBe(all.rooms.vacant + all.rooms.occupied + all.rooms.unavailable);
    expect(all.contracts.active).toBe(all.contracts.inEffect + all.contracts.upcoming + all.contracts.overdue);
    for (const v of [all.invoices.billedInPeriod, all.revenue.collected, all.receivables.outstanding, all.receivables.overdueOutstanding]) expect(v).toMatch(/^\d+$/);
    const one = await dashboardMock.get(ws, { buildingId: db.buildings[0]!.id });
    expect(one.buildingId).toBe(db.buildings[0]!.id);
    expect(one.rooms.total).toBeLessThanOrEqual(all.rooms.total);
    await expect(dashboardMock.get(ws, { buildingId: 'nope' })).rejects.toMatchObject({ code: 'BUILDING_NOT_FOUND' });
    await expect(dashboardMock.get(ws, { period: '2026-13' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
