import { Link } from 'react-router-dom';
import { MapPin, Maximize2, Users } from 'lucide-react';
import { ButtonLink, Badge } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatVnd } from '@/lib/format';
import { AMENITY_LABELS } from '../labels';
import type { PublicRoom } from '../types';
import { RoomImage } from './RoomImage';

export function RoomCard({ room, layout = 'column', active }: { room: PublicRoom; layout?: 'row' | 'column'; active?: boolean }) {
  return (
    <article
      className={cn('card room-card', layout === 'row' && 'room-card--row')}
      style={active ? { borderColor: 'var(--color-primary)', boxShadow: 'var(--shadow-md)' } : undefined}
      aria-labelledby={`room-${room.id}-title`}
    >
      <Link to={`/rooms/${room.id}`} className="room-card__media" tabIndex={-1} aria-hidden="true">
        <RoomImage src={room.images[0]} alt={room.title} />
      </Link>
      <div className="room-card__body">
        <div className="room-card__price-row">
          <p className="room-card__price">
            {formatVnd(room.price)}
            <small>/tháng</small>
          </p>
        </div>
        <h3 id={`room-${room.id}-title`} className="room-card__title" title={room.title}>
          <Link to={`/rooms/${room.id}`} style={{ color: 'inherit' }}>
            {room.title}
          </Link>
        </h3>
        <p className="room-card__addr">
          <MapPin size={12} aria-hidden="true" />
          {room.address}
        </p>
        <div className="room-card__specs">
          <span>
            <Maximize2 size={13} aria-hidden="true" /> {room.area} m²
          </span>
          <span>
            <Users size={13} aria-hidden="true" /> Tối đa {room.maxOccupants} người
          </span>
        </div>
        <div className="room-card__amenities">
          {room.amenities.slice(0, 3).map((amenity) => (
            <Badge key={typeof amenity === 'string' ? amenity : amenity.id} tone="neutral">
              {typeof amenity === 'string' ? AMENITY_LABELS[amenity] : amenity.name}
            </Badge>
          ))}
          {room.amenities.length > 3 && <Badge tone="neutral">+{room.amenities.length - 3}</Badge>}
        </div>
        <div className="room-card__actions">
          <ButtonLink to={`/rooms/${room.id}`} variant="secondary" size="sm">
            Xem chi tiết
          </ButtonLink>
          <ButtonLink to={`/rooms/${room.id}/viewing`} variant="dark" size="sm">
            Đặt lịch xem
          </ButtonLink>
        </div>
      </div>
    </article>
  );
}
