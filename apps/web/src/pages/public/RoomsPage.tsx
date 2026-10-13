import { useMemo, useState } from 'react';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import { Button, EmptyState, ErrorState, Pagination, Skeleton } from '@/components/ui';
import { useSearchState } from '@/hooks/useSearchState';
import { useDistricts, useRoomSearch } from '@/features/rooms/hooks';
import { RoomCard } from '@/features/rooms/components/RoomCard';
import { MapPreview } from '@/features/rooms/components/MapPreview';
import { AMENITY_LABELS, PRICE_RANGES, QUICK_FILTERS, ROOM_TYPE_LABELS, SORT_LABELS } from '@/features/rooms/labels';
import type { AmenityCode, RoomSearchParams, RoomSort, RoomType } from '@/features/rooms/types';

const KEYS = ['q', 'district', 'priceMin', 'priceMax', 'areaMin', 'occupants', 'roomType', 'amenities', 'sort', 'page'] as const;
const PAGE_SIZE = 4;

const num = (v: string) => (v ? Number(v) : undefined);

export function RoomsPage() {
  const [s, set] = useSearchState(KEYS);
  const [activeId, setActiveId] = useState<string | null>(null);
  const { data: districts } = useDistricts();

  const amenities = useMemo(() => (s.amenities ? (s.amenities.split(',') as AmenityCode[]) : []), [s.amenities]);
  const params: RoomSearchParams = {
    q: s.q || undefined,
    district: s.district || undefined,
    priceMin: num(s.priceMin),
    priceMax: num(s.priceMax),
    areaMin: num(s.areaMin),
    occupants: num(s.occupants),
    roomType: (s.roomType || undefined) as RoomType | undefined,
    amenities,
    sort: (s.sort || 'relevant') as RoomSort,
    page: num(s.page) ?? 1,
    pageSize: PAGE_SIZE,
  };
  const query = useRoomSearch(params);
  const priceKey = PRICE_RANGES.find((r) => String(r.min ?? '') === s.priceMin && String(r.max ?? '') === s.priceMax)?.key ?? '';

  function toggleAmenity(code: AmenityCode) {
    const next = amenities.includes(code) ? amenities.filter((a) => a !== code) : [...amenities, code];
    set({ amenities: next.join(',') });
  }

  const hasFilters = KEYS.some((k) => k !== 'sort' && k !== 'page' && s[k]);
  const total = query.data?.total ?? 0;
  const from = total ? (params.page! - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(total, params.page! * PAGE_SIZE);

  return (
    <div className="container" style={{ paddingTop: 'var(--space-4)' }}>
      <div className="chip-row" role="group" aria-label="Lọc nhanh">
        <span className="row text-xs muted" style={{ flexShrink: 0 }}>
          <SlidersHorizontal size={14} aria-hidden="true" /> Gợi ý nhanh:
        </span>
        <button
          className="chip"
          aria-pressed={s.district === 'Bình Thạnh' && s.q === 'HUTECH'}
          onClick={() => set({ district: 'Bình Thạnh', q: s.q === 'HUTECH' ? '' : 'HUTECH' })}
        >
          Gần ĐH Quốc Gia / HUTECH
        </button>
        {QUICK_FILTERS.map((f) => {
          const pressed = f.amenity ? amenities.includes(f.amenity) : s.roomType === f.roomType;
          return (
            <button
              key={f.key}
              className="chip"
              aria-pressed={pressed}
              onClick={() => (f.amenity ? toggleAmenity(f.amenity) : set({ roomType: pressed ? '' : f.roomType }))}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <div className="rooms-toolbar">
        <label className="sr-only" htmlFor="f-district">
          Khu vực
        </label>
        <select id="f-district" className="select" value={s.district} onChange={(e) => set({ district: e.target.value })}>
          <option value="">Tất cả khu vực</option>
          {districts?.map((d) => (
            <option key={d.name} value={d.name}>
              {d.name} ({d.count})
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="f-price">
          Giá thuê
        </label>
        <select
          id="f-price"
          className="select"
          value={priceKey}
          onChange={(e) => {
            const r = PRICE_RANGES.find((x) => x.key === e.target.value);
            set({ priceMin: r?.min, priceMax: r?.max });
          }}
        >
          <option value="">Giá thuê</option>
          {PRICE_RANGES.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="f-area">
          Diện tích
        </label>
        <select id="f-area" className="select" value={s.areaMin} onChange={(e) => set({ areaMin: e.target.value })}>
          <option value="">Diện tích (m²)</option>
          {[15, 20, 25, 30].map((a) => (
            <option key={a} value={a}>
              Từ {a} m²
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="f-occ">
          Sức chứa
        </label>
        <select id="f-occ" className="select" value={s.occupants} onChange={(e) => set({ occupants: e.target.value })}>
          <option value="">Sức chứa</option>
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n}+ người
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="f-type">
          Loại phòng
        </label>
        <select id="f-type" className="select" value={s.roomType} onChange={(e) => set({ roomType: e.target.value })}>
          <option value="">Loại phòng</option>
          {(Object.keys(ROOM_TYPE_LABELS) as RoomType[]).map((t) => (
            <option key={t} value={t}>
              {ROOM_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="f-amenity">
          Thêm tiện ích
        </label>
        <select
          id="f-amenity"
          className="select"
          value=""
          onChange={(e) => e.target.value && toggleAmenity(e.target.value as AmenityCode)}
        >
          <option value="">Tiện ích {amenities.length ? `(${amenities.length})` : '(Điều hòa, Tủ lạnh…)'}</option>
          {(Object.keys(AMENITY_LABELS) as AmenityCode[]).map((a) => (
            <option key={a} value={a}>
              {amenities.includes(a) ? '✓ ' : ''}
              {AMENITY_LABELS[a]}
            </option>
          ))}
        </select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => set(Object.fromEntries(KEYS.map((k) => [k, ''])))}>
            <RotateCcw size={14} aria-hidden="true" /> Đặt lại bộ lọc
          </Button>
        )}
        <div className="row" style={{ marginLeft: 'auto' }}>
          <span className="text-xs muted">Sắp xếp:</span>
          <div className="sort-tabs" role="group" aria-label="Sắp xếp">
            {(['relevant', 'price_asc', 'newest'] as RoomSort[]).map((k) => (
              <button key={k} aria-pressed={(s.sort || 'relevant') === k} onClick={() => set({ sort: k === 'relevant' ? '' : k })}>
                {SORT_LABELS[k]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {amenities.length > 0 && (
        <div className="chip-row" aria-label="Tiện ích đang lọc">
          {amenities.map((a) => (
            <button key={a} className="chip" aria-pressed="true" onClick={() => toggleAmenity(a)} aria-label={`Bỏ lọc ${AMENITY_LABELS[a]}`}>
              {AMENITY_LABELS[a]} ✕
            </button>
          ))}
        </div>
      )}

      <div className="row" style={{ justifyContent: 'space-between', margin: 'var(--space-4) 0', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 800 }}>
            Phòng trọ {s.district ? `khu vực ${s.district}` : 'toàn thành phố'} {s.district ? '& lân cận' : ''}
          </h1>
          <p className="muted text-sm" aria-live="polite">
            {query.isLoading ? 'Đang tìm…' : `Tìm thấy ${total} phòng trọ đã xác minh pháp lý & sẵn sàng dọn vào ở ngay`}
          </p>
        </div>
      </div>

      <div className="rooms-layout">
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
                description="Thử nới rộng khoảng giá, đổi khu vực hoặc bỏ bớt tiện ích."
                action={
                  <Button variant="secondary" onClick={() => set(Object.fromEntries(KEYS.map((k) => [k, ''])))}>
                    Xóa bộ lọc
                  </Button>
                }
              />
            </div>
          ) : (
            query.data.items.map((room) => (
              <div key={room.id} onMouseEnter={() => setActiveId(room.id)}>
                <RoomCard room={room} layout="row" active={room.id === activeId} />
              </div>
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
        <div className="rooms-layout__map">
          <MapPreview rooms={query.data?.items ?? []} activeId={activeId} onSelect={setActiveId} title={`Bản đồ ${s.district || 'khu vực'}`} />
        </div>
      </div>
    </div>
  );
}
