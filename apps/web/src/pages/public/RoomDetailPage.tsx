import { useParams } from 'react-router-dom';
import { CalendarCheck, Check, ExternalLink, MapPin, Maximize2, Users } from 'lucide-react';
import { ButtonLink, ErrorState, LoadingBlock, PageHeader, Section } from '@/components/ui';
import { useRoom } from '@/features/rooms/hooks';
import { RoomImage } from '@/features/rooms/components/RoomImage';
import { AMENITY_LABELS } from '@/features/rooms/labels';
import { googleMapsDirectionsUrl } from '@/features/rooms/maps';
import { formatVnd } from '@/lib/format';

export function RoomDetailPage() {
  const { roomId: listingId } = useParams();
  const { data: room, isLoading, error, refetch } = useRoom(listingId);

  if (isLoading) return <div className="container" style={{ paddingTop: 'var(--space-6)' }}><LoadingBlock lines={8} /></div>;
  if (error || !room)
    return (
      <div className="container">
        <ErrorState error={error} onRetry={() => refetch()} />
      </div>
    );

  const mapsUrl = googleMapsDirectionsUrl(room);

  return (
    <div className="container" style={{ paddingTop: 'var(--space-6)' }}>
      <PageHeader
        breadcrumb={[{ label: 'Trang chủ', to: '/' }, { label: 'Tìm phòng', to: '/rooms' }, { label: room.district, to: `/rooms?district=${room.district}` }, { label: room.buildingName }]}
        title={room.title}
        description={
          <span className="row" style={{ flexWrap: 'wrap' }}>
            <MapPin size={14} aria-hidden="true" /> {room.address}
          </span>
        }
      />
      <div className="gallery">
        {room.images.length ? (
          room.images.slice(0, 3).map((src, i) => (
            <RoomImage key={src + i} src={src} alt={`${room.title} – ảnh ${i + 1}`} loading={i === 0 ? 'eager' : 'lazy'} />
          ))
        ) : (
          <RoomImage alt={`${room.title} – chưa có ảnh`} loading="eager" />
        )}
      </div>

      <div className="detail-layout">
        <div className="stack" style={{ gap: 'var(--space-5)' }}>
          <Section title="Thông tin phòng">
            <div className="grid grid--2" style={{ marginBottom: 'var(--space-4)' }}>
              {[
                { icon: Maximize2, label: 'Diện tích', value: `${room.area} m²` },
                { icon: Users, label: 'Sức chứa', value: `Tối đa ${room.maxOccupants} người` },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="row" style={{ alignItems: 'flex-start' }}>
                  <Icon size={18} color="var(--color-primary)" aria-hidden="true" />
                  <div>
                    <p className="text-xs muted">{label}</p>
                    <p className="cell-title text-sm">{value}</p>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ color: 'var(--color-text-secondary)' }}>{room.description || 'Listing chưa có mô tả.'}</p>
          </Section>
          <Section title="Tiện ích">
            <ul className="amenity-grid">
              {room.amenities.map((amenity) => (
                <li key={typeof amenity === 'string' ? amenity : amenity.id}>
                  <Check size={16} color="var(--color-success)" aria-hidden="true" />{' '}
                  {typeof amenity === 'string' ? AMENITY_LABELS[amenity] : amenity.name}
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <aside className="detail-layout__aside stack">
          <div className="card card__body stack">
            <p className="room-card__price" style={{ fontSize: 'var(--text-2xl)' }}>
              {formatVnd(room.price)}
              <small>/tháng</small>
            </p>
            <ButtonLink to={`/rooms/${room.id}/viewing`} variant="dark" size="lg" block>
              <CalendarCheck size={18} aria-hidden="true" /> Đặt lịch xem phòng
            </ButtonLink>
            <p className="text-xs muted">Chủ trọ sẽ xác nhận hoặc từ chối lịch hẹn của bạn.</p>
            {mapsUrl ? (
              <>
                <a className="btn btn--secondary btn--lg btn--block" href={mapsUrl} target="_blank" rel="noopener noreferrer" data-testid="maps-link">
                  <ExternalLink size={18} aria-hidden="true" /> Xem vị trí &amp; chỉ đường
                </a>
                <p className="text-xs muted">Mở Google Maps ở tab mới với điểm đến là địa chỉ phòng; bạn chọn hoặc nhập điểm xuất phát trên Google Maps.</p>
              </>
            ) : (
              <p className="text-xs muted" data-testid="maps-unavailable">
                Tin đăng chưa có số nhà/đường nên chưa thể mở chỉ đường chính xác trên Google Maps.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
