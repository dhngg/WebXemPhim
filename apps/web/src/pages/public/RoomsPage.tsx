import { RotateCcw } from 'lucide-react';
import { Button, EmptyState, ErrorState, Pagination, Skeleton } from '@/components/ui';
import { useSearchState } from '@/hooks/useSearchState';
import { useRoomSearch } from '@/features/rooms/hooks';
import { RoomCard } from '@/features/rooms/components/RoomCard';
import { PRICE_RANGES } from '@/features/rooms/labels';
import type { RoomSearchParams } from '@/features/rooms/types';

/** Đúng các điều kiện `GET /listings` hỗ trợ; tham số lạ trong URL (ví dụ roomType, q) bị bỏ qua có chủ đích. */
const KEYS = ['city', 'district', 'ward', 'minPrice', 'maxPrice', 'page'] as const;
const PAGE_SIZE = 20;

const num = (v: string) => (v ? Number(v) : undefined);

export function RoomsPage() {
  const [s, set] = useSearchState(KEYS);

  const params: RoomSearchParams = {
    city: s.city || undefined,
    district: s.district || undefined,
    ward: s.ward || undefined,
    minPrice: num(s.minPrice),
    maxPrice: num(s.maxPrice),
    page: num(s.page) ?? 1,
    limit: PAGE_SIZE,
  };
  const query = useRoomSearch(params);
  const priceKey =
    PRICE_RANGES.find(
      (range) =>
        String(range.min ?? '') === String(params.minPrice ?? '') &&
        String(range.max ?? '') === String(params.maxPrice ?? ''),
    )?.key ?? '';

  const hasFilters = KEYS.some((key) => key !== 'page' && Boolean(s[key]));
  const total = query.data?.total ?? 0;
  const from = total ? (params.page! - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(total, params.page! * PAGE_SIZE);

  return (
    <div className="container" style={{ paddingTop: 'var(--space-4)' }}>
      <div className="rooms-toolbar">
        <label className="sr-only" htmlFor="f-city">
          Tỉnh / thành phố
        </label>
        <input
          id="f-city"
          className="input"
          value={s.city}
          placeholder="Tỉnh / thành phố"
          onChange={(event) => set({ city: event.target.value })}
        />
        <label className="sr-only" htmlFor="f-district">
          Quận / huyện
        </label>
        <input
          id="f-district"
          className="input"
          value={s.district}
          placeholder="Quận / huyện"
          onChange={(event) => set({ district: event.target.value })}
        />
        <label className="sr-only" htmlFor="f-ward">
          Phường / xã
        </label>
        <input
          id="f-ward"
          className="input"
          value={s.ward}
          placeholder="Phường / xã"
          onChange={(event) => set({ ward: event.target.value })}
        />
        <label className="sr-only" htmlFor="f-price">
          Giá thuê
        </label>
        <select
          id="f-price"
          className="select"
          value={priceKey}
          onChange={(e) => {
            const r = PRICE_RANGES.find((x) => x.key === e.target.value);
            set({ minPrice: r?.min, maxPrice: r?.max });
          }}
        >
          <option value="">Giá thuê</option>
          {PRICE_RANGES.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => set(Object.fromEntries(KEYS.map((k) => [k, ''])))}>
            <RotateCcw size={14} aria-hidden="true" /> Đặt lại bộ lọc
          </Button>
        )}
      </div>

      <div className="row" style={{ justifyContent: 'space-between', margin: 'var(--space-4) 0', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 800 }}>
            Phòng trọ {s.district ? `khu vực ${s.district}` : 'toàn thành phố'} {s.district ? '& lân cận' : ''}
          </h1>
          <p className="muted text-sm" aria-live="polite">
            {query.isLoading ? 'Đang tìm…' : (
              <>
                Tìm thấy <strong data-testid="rooms-count">{total}</strong> listing đang được công khai
              </>
            )}
          </p>
        </div>
      </div>

      <div>
        <div className="stack">
          {query.isLoading ? (
            Array.from({ length: 3 }, (_, i) => <Skeleton key={i} height={200} />)
          ) : query.error ? (
            <div className="card">
              <ErrorState error={query.error} onRetry={() => query.refetch()} />
            </div>
          ) : !query.data?.items.length ? (
            <div className="card">
              <EmptyState
                title="Không tìm thấy phòng phù hợp"
                description="Thử nới rộng khoảng giá hoặc đổi khu vực."
                action={
                  <Button variant="secondary" onClick={() => set(Object.fromEntries(KEYS.map((k) => [k, ''])))}>
                    Xóa bộ lọc
                  </Button>
                }
              />
            </div>
          ) : (
            query.data.items.map((room) => (
              <RoomCard key={room.id} room={room} layout="row" />
            ))
          )}
          {total > 0 && (
            <div className="card row" style={{ justifyContent: 'space-between', padding: 'var(--space-3) var(--space-4)', flexWrap: 'wrap' }}>
              <span className="text-xs muted">
                Hiển thị {from} - {to} trong tổng số {total} phòng
              </span>
              <Pagination page={params.page!} pageSize={PAGE_SIZE} total={total} onChange={(p) => set({ page: p }, { resetPage: false })} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
