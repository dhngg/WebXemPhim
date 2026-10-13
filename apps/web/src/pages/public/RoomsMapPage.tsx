import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui';
import { useSearchState } from '@/hooks/useSearchState';
import { useDistricts, useRoomSearch } from '@/features/rooms/hooks';
import { MapPreview } from '@/features/rooms/components/MapPreview';
import { RoomImage } from '@/features/rooms/components/RoomImage';
import { formatVnd } from '@/lib/format';

/** PUB-04 — Map + danh sách đồng bộ. Map provider CHƯA chốt → bản đồ minh họa. */
export function RoomsMapPage() {
  const [s, set] = useSearchState(['district'] as const);
  const [activeId, setActiveId] = useState<string | null>(null);
  const { data: districts } = useDistricts();
  const query = useRoomSearch({ district: s.district || undefined, pageSize: 50 });

  return (
    <div className="container" style={{ paddingTop: 'var(--space-6)' }}>
      <PageHeader
        title="Tìm phòng trên bản đồ"
        description="Chọn khu vực để lọc phòng theo vùng nhìn thấy. Bấm vào ghim giá để xem nhanh phòng."
        actions={
          <select className="select" aria-label="Khu vực" value={s.district} onChange={(e) => set({ district: e.target.value })} style={{ minWidth: 200 }}>
            <option value="">Tất cả khu vực</option>
            {districts?.map((d) => (
              <option key={d.name} value={d.name}>
                {d.name} ({d.count})
              </option>
            ))}
          </select>
        }
      />
      <div className="rooms-layout" style={{ gridTemplateColumns: undefined }}>
        <div className="rooms-layout__map" style={{ order: 0 }}>
          {query.isLoading ? <Skeleton height={520} /> : <MapPreview rooms={query.data?.items ?? []} activeId={activeId} onSelect={setActiveId} height={520} />}
        </div>
        <div className="card" style={{ maxHeight: 580, overflowY: 'auto' }}>
          {query.isLoading ? (
            <div className="stack card__body">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} height={64} />
              ))}
            </div>
          ) : query.error ? (
            <ErrorState error={query.error} onRetry={() => query.refetch()} />
          ) : !query.data?.items.length ? (
            <EmptyState title="Không có phòng trong vùng này" description="Hãy chọn khu vực khác." />
          ) : (
            <ul className="list-plain">
              {query.data.items.map((r) => (
                <li
                  key={r.id}
                  className="notif"
                  style={{ background: r.id === activeId ? 'var(--color-primary-softer)' : undefined, cursor: 'pointer' }}
                  onMouseEnter={() => setActiveId(r.id)}
                >
                  <div style={{ width: 84, height: 64, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                    <RoomImage src={r.images[0]} alt={r.title} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <Link to={`/rooms/${r.id}`} className="cell-title" style={{ color: 'var(--color-text)' }}>
                      {r.title}
                    </Link>
                    <p className="cell-sub">{r.address}</p>
                    <p className="price text-sm">{formatVnd(r.price)}/tháng</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
