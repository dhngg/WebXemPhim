import { useParams } from 'react-router-dom';
import { BadgeCheck, CalendarCheck, Check, Layers, MapPin, Maximize2, Phone, Users } from 'lucide-react';
import { Badge, ButtonLink, ErrorState, KeyValueList, LoadingBlock, PageHeader, Section } from '@/components/ui';
import { useRoom } from '@/features/rooms/hooks';
import { RoomImage } from '@/features/rooms/components/RoomImage';
import { MapPreview } from '@/features/rooms/components/MapPreview';
import { AMENITY_LABELS, ROOM_TYPE_LABELS } from '@/features/rooms/labels';
import { formatDate, formatPercent, formatVnd } from '@/lib/format';

export function RoomDetailPage() {
  const { roomId } = useParams();
  const { data: room, isLoading, error, refetch } = useRoom(roomId);

  if (isLoading) return <div className="container" style={{ paddingTop: 'var(--space-6)' }}><LoadingBlock lines={8} /></div>;
  if (error || !room)
    return (
      <div className="container">
        <ErrorState error={error} onRetry={() => refetch()} />
      </div>
    );

  const fees = [
    { label: 'Tiền điện', value: `${formatVnd(room.fees.electricityPerKwh)}/kWh` },
    { label: 'Tiền nước', value: `${formatVnd(room.fees.waterPerPerson)}/người/tháng` },
    { label: 'Internet', value: room.fees.internet ? `${formatVnd(room.fees.internet)}/tháng` : 'Miễn phí' },
    { label: 'Phí dịch vụ', value: `${formatVnd(room.fees.service)}/tháng` },
    { label: 'Tiền cọc', value: formatVnd(room.deposit) },
  ];

  return (
    <div className="container" style={{ paddingTop: 'var(--space-6)' }}>
      <PageHeader
        breadcrumb={[{ label: 'Trang chủ', to: '/' }, { label: 'Tìm phòng', to: '/rooms' }, { label: room.district, to: `/rooms?district=${room.district}` }, { label: room.buildingName }]}
        title={room.title}
        description={
          <span className="row" style={{ flexWrap: 'wrap' }}>
            <MapPin size={14} aria-hidden="true" /> {room.address}, {room.city}
          </span>
        }
        eyebrow={
          <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
            {room.verified && (
              <Badge tone="primary" icon={<BadgeCheck size={12} />}>
                Đã xác thực
              </Badge>
            )}
            <Badge tone="success">Còn {room.availableCount} phòng trống</Badge>
          </div>
        }
      />
      <div className="gallery">
        {room.images.slice(0, 3).map((src, i) => (
          <RoomImage key={src + i} src={src} alt={`${room.title} – ảnh ${i + 1}`} loading={i === 0 ? 'eager' : 'lazy'} />
        ))}
      </div>

      <div className="detail-layout">
        <div className="stack" style={{ gap: 'var(--space-5)' }}>
          <Section title="Thông tin phòng">
            <div className="grid grid--4" style={{ marginBottom: 'var(--space-4)' }}>
              {[
                { icon: Maximize2, label: 'Diện tích', value: `${room.area} m²` },
                { icon: Users, label: 'Sức chứa', value: `Tối đa ${room.maxOccupants} người` },
                { icon: Layers, label: 'Vị trí', value: room.floorLabel },
                { icon: Check, label: 'Loại phòng', value: ROOM_TYPE_LABELS[room.roomType] },
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
            <p style={{ color: 'var(--color-text-secondary)' }}>{room.description}</p>
          </Section>
          <Section title="Tiện ích">
            <ul className="amenity-grid">
              {room.amenities.map((a) => (
                <li key={a}>
                  <Check size={16} color="var(--color-success)" aria-hidden="true" /> {AMENITY_LABELS[a]}
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Chi phí hằng tháng" subtitle="Đơn giá do chủ trọ công bố; hóa đơn thực tế theo bảng giá có hiệu lực tại kỳ tính tiền.">
            <KeyValueList items={fees} />
          </Section>
          <MapPreview rooms={[room]} activeId={null} onSelect={() => undefined} title="Vị trí" height={260} />
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
            <p className="text-xs muted">Miễn phí. Chủ trọ sẽ xác nhận lịch trong thời gian sớm nhất.</p>
          </div>
          <div className="card card__body stack" style={{ gap: 'var(--space-3)' }}>
            <p className="text-xs muted" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Thông tin chủ trọ
            </p>
            <div className="row">
              <span className="avatar" aria-hidden="true">
                {room.landlord.name.split(' ').slice(-1)[0]?.[0]}
              </span>
              <div>
                <p className="cell-title">
                  {room.landlord.name}{' '}
                  {room.landlord.verified && <BadgeCheck size={14} color="var(--color-primary)" aria-label="Đã xác minh" />}
                </p>
                <p className="cell-sub">Tham gia từ {formatDate(room.landlord.memberSince)}</p>
              </div>
            </div>
            <KeyValueList
              items={[
                { label: 'Tỉ lệ phản hồi', value: formatPercent(room.landlord.responseRate, 0) },
                {
                  label: 'Điện thoại',
                  value: (
                    <span className="row">
                      <Phone size={14} aria-hidden="true" /> {room.landlord.phoneMasked}
                    </span>
                  ),
                },
              ]}
            />
            <p className="text-xs muted">Số điện thoại đầy đủ hiển thị sau khi chủ trọ xác nhận lịch xem.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
