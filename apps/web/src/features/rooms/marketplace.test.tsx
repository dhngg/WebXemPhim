import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider, useLocation, type RouteObject } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicListingResponse } from '@rental/shared';

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock('@/services/http/httpClient', () => ({ httpClient: http }));
vi.mock('@/features/auth/role', () => ({ useAppRole: () => ({ isGuest: true }) }));

import { HomePage } from '@/pages/public/HomePage';
import { RoomsPage } from '@/pages/public/RoomsPage';
import { RoomDetailPage } from '@/pages/public/RoomDetailPage';
import { directionsDestination, googleMapsDirectionsUrl } from './maps';
import apiSource from './api.ts?raw';
import hooksSource from './hooks.ts?raw';
import typesSource from './types.ts?raw';
import labelsSource from './labels.ts?raw';
import cardSource from './components/RoomCard.tsx?raw';
import homeSource from '../../pages/public/HomePage.tsx?raw';
import roomsPageSource from '../../pages/public/RoomsPage.tsx?raw';
import detailSource from '../../pages/public/RoomDetailPage.tsx?raw';
import infoSource from '../../pages/public/InfoPages.tsx?raw';
import layoutSource from '../../layouts/PublicLayout.tsx?raw';
import routerSource from '../../app/router.tsx?raw';
import mockSource from '../../mocks/handlers/rooms.mock.ts?raw';

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const listing = (o: { addressLine1?: string; id?: string; code?: string } = {}): PublicListingResponse => ({
  id: o.id ?? '11111111-1111-4111-8111-111111111111',
  publishedAt: '2026-10-15T01:00:00.000Z',
  room: { id: '22222222-2222-4222-8222-222222222222', code: o.code ?? 'A-101', areaSqm: '25.50', monthlyRent: '3500000.00', maxOccupants: 2, description: 'Phòng có cửa sổ.', amenities: [{ id: 'am1', name: 'Điều hòa' }], images: [] },
  building: { id: 'b1', name: 'Tòa An Bình', addressLine1: o.addressLine1 ?? '12/3 Nguyễn Trãi & ngõ #5', addressLine2: null, ward: 'Thượng Đình', district: 'Thanh Xuân', city: 'Hà Nội', postalCode: null, countryCode: 'VN' },
});
const page = (items: PublicListingResponse[], total = items.length) => ({ items, page: 1, limit: 20, total });

beforeEach(() => {
  for (const fn of Object.values(http)) fn.mockReset();
});

function mount(entry: string, routes: RouteObject[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [entry] });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}
function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}

// ===================================================================== Google Maps
describe('liên kết Google Maps', () => {
  const full = { address: '12/3 Nguyễn Trãi & ngõ #5, Thượng Đình, Thanh Xuân, Hà Nội', streetAddress: '12/3 Nguyễn Trãi & ngõ #5', city: 'Hà Nội' };

  it('điểm đến là địa chỉ backend trả (đã mã hóa), không origin, không tọa độ, không API key', () => {
    const url = googleMapsDirectionsUrl(full)!;
    expect(url.startsWith('https://www.google.com/maps/dir/?api=1&destination=')).toBe(true);
    const parsed = new URL(url);
    expect(`${parsed.origin}${parsed.pathname}`).toBe('https://www.google.com/maps/dir/');
    expect([...parsed.searchParams.keys()].sort()).toEqual(['api', 'destination']);
    expect(parsed.searchParams.get('destination')).toBe(`${full.address}, Việt Nam`);
    // ký tự đặc biệt (&, #, /, dấu tiếng Việt) không làm vỡ URL
    expect(url).not.toContain(' ');
    expect(url).toContain(encodeURIComponent('Nguyễn Trãi'));
    expect(url).toContain('%26');
    expect(url).toContain('%23');
    expect(url).not.toMatch(/key=|origin=|travelmode|@\d/);
  });

  it('thiếu số nhà/đường hoặc thành phố → KHÔNG tạo liên kết (không coi quận/thành phố là vị trí chính xác)', () => {
    expect(googleMapsDirectionsUrl({ ...full, streetAddress: undefined })).toBeNull();
    expect(googleMapsDirectionsUrl({ ...full, streetAddress: '   ' })).toBeNull();
    expect(googleMapsDirectionsUrl({ ...full, city: '' })).toBeNull();
    expect(googleMapsDirectionsUrl({ ...full, address: '' })).toBeNull();
    expect(directionsDestination({ address: 'Thanh Xuân, Hà Nội', city: 'Hà Nội' })).toBeNull();
  });
});

// ===================================================================== Trang chủ
describe('trang chủ dùng GET /listings', () => {
  const routes: RouteObject[] = [
    { path: '/', element: <HomePage /> },
    { path: '/rooms', element: <Where /> },
  ];

  it('chỉ gọi /listings (trang đầu, mới đăng trước); không gọi featured/stats/districts; không số liệu giả', async () => {
    http.get.mockResolvedValue(page([listing(), listing({ id: '33333333-3333-4333-8333-333333333333', code: 'A-102' })]));
    mount('/', routes);
    expect(await screen.findByText('Tòa An Bình – Phòng A-101')).toBeTruthy();
    expect(http.get).toHaveBeenCalledTimes(1);
    expect(http.get).toHaveBeenCalledWith('/listings', { query: expect.objectContaining({ page: 1, limit: 8 }) });
    expect(http.get.mock.calls.every((c) => !String(c[0]).startsWith('/marketplace'))).toBe(true);
    expect(screen.getByRole('heading', { name: 'Phòng mới đăng' })).toBeTruthy();
    expect(screen.queryByText(/xác thực|Bảo vệ tiền cọc|kiểm duyệt pháp lý|Chủ trọ dùng SaaS|\d+\+/i)).toBeNull();
    expect(screen.queryByLabelText('Loại phòng')).toBeNull();
  });

  it('tìm kiếm đi tới /rooms với đúng tham số (city/district), không roomType; bỏ trống thì /rooms trơn', async () => {
    http.get.mockResolvedValue(page([]));
    const router = mount('/', routes);
    await screen.findByText('Chưa có phòng nào được đăng');
    await userEvent.click(screen.getByRole('button', { name: /Tìm ngay/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/rooms'));
    expect(router.state.location.search).toBe('');
    await router.navigate('/');
    await userEvent.type(await screen.findByLabelText('Tỉnh / thành phố'), 'Hà Nội');
    await userEvent.type(screen.getByLabelText('Quận / huyện'), '  Cầu Giấy ');
    await userEvent.click(screen.getByRole('button', { name: /Tìm ngay/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/rooms'));
    const q = new URLSearchParams(router.state.location.search);
    expect(Object.fromEntries(q)).toEqual({ city: 'Hà Nội', district: 'Cầu Giấy' });
  });
});

// ===================================================================== Tìm phòng
describe('trang tìm phòng', () => {
  it('chỉ gửi tham số mà backend hỗ trợ; tham số lạ trong URL (roomType, q, priceMin, sort) bị bỏ qua', async () => {
    http.get.mockResolvedValue(page([listing()], 41));
    mount('/rooms?city=Hà Nội&district=Thanh Xuân&ward=Thượng Đình&minPrice=3000000&maxPrice=5000000&page=2&roomType=STUDIO&q=abc&priceMin=1&sort=price_asc', [{ path: '/rooms', element: <RoomsPage /> }]);
    expect(await screen.findByTestId('rooms-count')).toHaveProperty('textContent', '41');
    expect(http.get).toHaveBeenLastCalledWith('/listings', {
      query: { city: 'Hà Nội', district: 'Thanh Xuân', ward: 'Thượng Đình', minPrice: 3_000_000, maxPrice: 5_000_000, amenityIds: undefined, page: 2, limit: 20 },
    });
    expect(screen.queryByText(/Bản đồ|ghim/)).toBeNull();
    expect(screen.getAllByRole('link', { name: 'Xem chi tiết' })).toHaveLength(1);
  });

  it('đặt lại bộ lọc xóa mọi điều kiện; kết quả rỗng có hướng dẫn', async () => {
    http.get.mockResolvedValue(page([]));
    mount('/rooms?district=Không có', [{ path: '/rooms', element: <RoomsPage /> }]);
    expect(await screen.findByText('Không tìm thấy phòng phù hợp')).toBeTruthy();
    expect(screen.getByTestId('rooms-count').textContent).toBe('0');
    await userEvent.click(screen.getAllByRole('button', { name: /Đặt lại bộ lọc|Xóa bộ lọc/ })[0]!);
    await waitFor(() => expect(http.get).toHaveBeenLastCalledWith('/listings', { query: expect.objectContaining({ district: undefined }) }));
  });
});

// ===================================================================== Chi tiết
describe('chi tiết listing', () => {
  const routes: RouteObject[] = [{ path: '/rooms/:roomId', element: <RoomDetailPage /> }];

  it('nút “Xem vị trí & chỉ đường” mở Google Maps tab mới an toàn bằng địa chỉ backend; không gọi API bản đồ', async () => {
    http.get.mockResolvedValue(listing());
    mount('/rooms/11111111-1111-4111-8111-111111111111', routes);
    const link = await screen.findByTestId('maps-link');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toMatch(/noopener/);
    expect(link.getAttribute('rel')).toMatch(/noreferrer/);
    const href = link.getAttribute('href')!;
    expect(new URL(href).searchParams.get('destination')).toBe('12/3 Nguyễn Trãi & ngõ #5, Thượng Đình, Thanh Xuân, Hà Nội, Việt Nam');
    expect(http.get).toHaveBeenCalledTimes(1);
    expect(http.get).toHaveBeenCalledWith('/listings/11111111-1111-4111-8111-111111111111');
    expect(screen.getByRole('link', { name: /Đặt lịch xem phòng/ }).getAttribute('href')).toBe('/rooms/11111111-1111-4111-8111-111111111111/viewing');
  });

  it('thiếu số nhà/đường: không hiện nút, giải thích rõ', async () => {
    http.get.mockResolvedValue(listing({ addressLine1: '' }));
    mount('/rooms/11111111-1111-4111-8111-111111111111', routes);
    expect(await screen.findByTestId('maps-unavailable')).toBeTruthy();
    expect(screen.queryByTestId('maps-link')).toBeNull();
  });
});

// ===================================================================== Chính sách: không còn API/khẳng định giả
describe('loại API giả và khẳng định không có cơ chế', () => {
  it('không còn endpoint /marketplace/*, featured/stats/districts, roomType, bản đồ ghim', () => {
    const feature = strip(apiSource + hooksSource + typesSource + labelsSource + mockSource);
    expect(feature).not.toMatch(/\/marketplace\/|getFeatured|getStats|getDistricts|useFeaturedRooms|useMarketplaceStats|useDistricts|MarketplaceStats|mockMarketplaceStats/);
    const ui = strip(homeSource + roomsPageSource + detailSource + cardSource + layoutSource);
    expect(ui).not.toMatch(/roomType|ROOM_TYPE|MapPreview|RoomsMapPage|priceMin|priceMax|SORT_LABELS|QUICK_FILTERS/);
    expect(strip(layoutSource)).not.toMatch(/rooms\/map|Bản đồ/);
    expect(strip(routerSource)).not.toMatch(/RoomsMapPage|mapPages/);
    expect(strip(routerSource)).toMatch(/path: 'rooms\/map', element: <Navigate to="\/rooms" replace \/>/);
  });

  it('không khẳng định xác thực 100%, bảo vệ cọc, hợp đồng điện tử, kiểm duyệt pháp lý hay số liệu không có nguồn', () => {
    const copy = strip(homeSource + infoSource + layoutSource + cardSource);
    expect(copy).not.toMatch(/xác thực 100%|Phòng xác thực|Đã xác thực|Bảo vệ tiền cọc|Hợp đồng điện tử|kiểm duyệt pháp lý|Đội ngũ kiểm định|Tin đăng được kiểm duyệt|SaaS tin cậy|hàng ngàn|hàng chục ngàn|Hotline.*24\/7|MANAGER|STAFF|quản lý\/nhân viên/i);
    expect(copy).not.toMatch(/minh chứng thanh toán|Bản đồ|phân quyền/i);
    expect(strip(layoutSource)).not.toMatch(/\?roomType=/);
  });

  it('mock tìm phòng chỉ còn các điều kiện của GET /listings', () => {
    expect(strip(mockSource)).not.toMatch(/params\.(q|roomType|sort|areaMin|occupants|amenities|priceMin|priceMax)\b/);
  });
});
