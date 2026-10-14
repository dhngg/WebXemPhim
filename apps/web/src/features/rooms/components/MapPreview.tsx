import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Map as MapIcon } from 'lucide-react';
import { MockBadge } from '@/components/ui';
import { formatVnd, formatVndShort } from '@/lib/format';
import type { PublicRoom } from '../types';
import { RoomImage } from './RoomImage';

/**
 * BẢN ĐỒ MINH HỌA — chưa tích hợp map provider (chờ chốt: Google Maps / Mapbox / OSM…).
 * Ghim được đặt theo lat/lng chuẩn hóa trong khung nhìn của danh sách hiện tại.
 */
export function MapPreview({
  rooms,
  activeId,
  onSelect,
  title = 'Bản đồ khu vực',
  height = 420,
}: {
  rooms: PublicRoom[];
  activeId?: string | null;
  onSelect: (id: string | null) => void;
  title?: string;
  height?: number;
}) {
  const bounds = useMemo(() => {
    if (!rooms.length) return null;
    const lats = rooms.map((r) => r.lat);
    const lngs = rooms.map((r) => r.lng);
    const pad = 0.004;
    return {
      minLat: Math.min(...lats) - pad,
      maxLat: Math.max(...lats) + pad,
      minLng: Math.min(...lngs) - pad,
      maxLng: Math.max(...lngs) + pad,
    };
  }, [rooms]);

  const active = rooms.find((r) => r.id === activeId);

  return (
    <section className="map" aria-label={title}>
      <div className="map__head">
        <span className="row" style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>
          <MapIcon size={16} aria-hidden="true" /> {title}
        </span>
        <MockBadge>Bản đồ minh họa</MockBadge>
      </div>
      <div className="map__canvas" style={{ height }} onClick={(e) => e.target === e.currentTarget && onSelect(null)}>
        <svg className="map__river" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d="M70,0 C60,25 85,40 72,60 C60,80 80,90 75,100" fill="none" stroke="#bfdbfe" strokeWidth="5" />
          <path d="M0,62 L100,48" stroke="#e2e8f0" strokeWidth="1.5" />
          <path d="M30,0 L42,100" stroke="#e2e8f0" strokeWidth="1.5" />
        </svg>
        {bounds &&
          rooms.map((r) => {
            const x = ((r.lng - bounds.minLng) / (bounds.maxLng - bounds.minLng || 1)) * 86 + 7;
            const y = (1 - (r.lat - bounds.minLat) / (bounds.maxLat - bounds.minLat || 1)) * 80 + 14;
            return (
              <button
                key={r.id}
                className="map__pin"
                style={{ left: `${x}%`, top: `${y}%` }}
                aria-pressed={r.id === activeId}
                aria-label={`${r.title} – ${formatVnd(r.price)}`}
                onClick={() => onSelect(r.id === activeId ? null : r.id)}
              >
                {formatVndShort(r.price)}
              </button>
            );
          })}
        {!rooms.length && (
          <p className="muted text-sm" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
            Không có phòng trong khu vực này
          </p>
        )}
        {active && (
          <div className="map__popup">
            <RoomImage src={active.images[0]} alt={active.title} />
            <div style={{ minWidth: 0 }}>
              <p className="cell-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {active.title}
              </p>
              <p className="price">{formatVnd(active.price)}</p>
              <Link to={`/rooms/${active.id}`} className="text-sm">
                Xem phòng này →
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
