import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeCheck, BedDouble, FileSignature, Headphones, MapPin, Receipt, Search, ShieldCheck, Wallet, Zap } from 'lucide-react';
import { Button, ButtonLink, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { useDistricts, useFeaturedRooms, useMarketplaceStats } from '@/features/rooms/hooks';
import { RoomCard } from '@/features/rooms/components/RoomCard';
import { PRICE_RANGES, ROOM_TYPE_LABELS } from '@/features/rooms/labels';
import type { RoomType } from '@/features/rooms/types';
import { formatNumber, formatPercent } from '@/lib/format';

export function SearchHero() {
  const navigate = useNavigate();
  const { data: districts } = useDistricts();
  const [district, setDistrict] = useState('Bình Thạnh');
  const [price, setPrice] = useState('3-5');
  const [roomType, setRoomType] = useState<RoomType | ''>('');

  function submit(e: FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (district) params.set('district', district);
    const range = PRICE_RANGES.find((r) => r.key === price);
    if (range?.min) params.set('priceMin', String(range.min));
    if (range?.max) params.set('priceMax', String(range.max));
    if (roomType) params.set('roomType', roomType);
    navigate(`/rooms?${params.toString()}`);
  }

  return (
    <form className="search-hero" onSubmit={submit} role="search" aria-label="Tìm phòng">
      <div className="search-hero__field">
        <MapPin size={18} aria-hidden="true" />
        <div style={{ flex: 1 }}>
          <label htmlFor="hero-district">Khu vực / Quận huyện</label>
          <select id="hero-district" value={district} onChange={(e) => setDistrict(e.target.value)}>
            <option value="">Tất cả khu vực</option>
            {(districts ?? [{ name: 'Bình Thạnh', count: 0 }]).map((d) => (
              <option key={d.name} value={d.name}>
                {d.name} {d.count ? `(${d.count} phòng)` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="search-hero__field">
        <Wallet size={18} aria-hidden="true" />
        <div style={{ flex: 1 }}>
          <label htmlFor="hero-price">Khoảng giá</label>
          <select id="hero-price" value={price} onChange={(e) => setPrice(e.target.value)}>
            <option value="">Mọi mức giá</option>
            {PRICE_RANGES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}/tháng
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="search-hero__field">
        <BedDouble size={18} aria-hidden="true" />
        <div style={{ flex: 1 }}>
          <label htmlFor="hero-type">Loại phòng</label>
          <select id="hero-type" value={roomType} onChange={(e) => setRoomType(e.target.value as RoomType | '')}>
            <option value="">Tất cả loại phòng</option>
            {(Object.keys(ROOM_TYPE_LABELS) as RoomType[]).map((t) => (
              <option key={t} value={t}>
                {ROOM_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Button type="submit" variant="dark" size="lg">
        <Search size={18} aria-hidden="true" /> Tìm ngay
      </Button>
    </form>
  );
}

function TrustStats() {
  const { data, isLoading } = useMarketplaceStats();
  const items = [
    { icon: ShieldCheck, value: data ? `${formatNumber(data.verifiedRooms)}+` : '', label: 'Phòng xác thực chính chủ' },
    { icon: FileSignature, value: data ? formatPercent(data.depositProtectedRatio, 0) : '', label: 'Bảo vệ tiền cọc hợp đồng' },
    { icon: Zap, value: data ? `${formatNumber(data.landlords)}+` : '', label: 'Chủ trọ dùng SaaS tin cậy' },
    { icon: Headphones, value: '24/7', label: 'Hỗ trợ đặt lịch xem trực tiếp' },
  ];
  return (
    <div className="trust-row">
      {items.map(({ icon: Icon, value, label }) => (
        <div key={label} className="trust-item">
          <span className="trust-item__icon">
            <Icon size={18} aria-hidden="true" />
          </span>
          <div>
            {isLoading ? <Skeleton width={60} height={20} /> : <strong>{value}</strong>}
            <span>{label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function HomePage() {
  const featured = useFeaturedRooms();

  return (
    <>
      <section className="hero">
        <div className="container">
          <span className="hero__eyebrow">
            <BadgeCheck size={14} aria-hidden="true" /> Nền tảng xác thực 100% phòng thực tế
          </span>
          <h1 className="hero__title">Tìm phòng trọ phù hợp với cuộc sống của bạn</h1>
          <p className="hero__desc">
            Hàng ngàn phòng trọ xác thực, hợp đồng minh bạch trực tiếp từ chủ nhà uy tín tại TP.HCM &amp; Hà Nội.
          </p>
          <SearchHero />
          <TrustStats />
        </div>
      </section>

      <section className="container home-section" aria-labelledby="featured-title">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 'var(--space-5)', flexWrap: 'wrap' }}>
          <div>
            <h2 id="featured-title" className="home-section__title" style={{ marginTop: 0 }}>
              Phòng nổi bật đã xác thực
            </h2>
            <p className="muted text-sm">Được kiểm duyệt pháp lý &amp; sẵn sàng dọn vào ở ngay</p>
          </div>
          <ButtonLink to="/rooms" variant="secondary">
            Xem tất cả phòng
          </ButtonLink>
        </div>
        {featured.isLoading ? (
          <div className="grid grid--4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} height={360} />
            ))}
          </div>
        ) : featured.error ? (
          <ErrorState error={featured.error} onRetry={() => featured.refetch()} />
        ) : !featured.data?.length ? (
          <EmptyState title="Chưa có phòng nổi bật" description="Hãy quay lại sau hoặc xem toàn bộ danh sách phòng." />
        ) : (
          <div className="grid grid--4">
            {featured.data.map((room) => (
              <RoomCard key={room.id} room={room} />
            ))}
          </div>
        )}
      </section>

      <section className="container home-section" aria-labelledby="safe-title">
        <div className="home-section__head">
          <p className="home-section__eyebrow">Quy chuẩn an toàn</p>
          <h2 id="safe-title" className="home-section__title">
            Thuê phòng an tâm &amp; Minh bạch tuyệt đối
          </h2>
          <p className="muted text-sm" style={{ marginTop: 'var(--space-2)' }}>
            Rental Platform bảo vệ quyền lợi người thuê thông qua công nghệ quản lý hợp đồng điện tử và hóa đơn tiền cọc.
          </p>
        </div>
        <div className="grid grid--3">
          {[
            { icon: ShieldCheck, title: '1. Xác minh thực địa', text: 'Tất cả phòng đăng tải đều được kiểm duyệt hình ảnh, tiện ích và chủ sở hữu bởi đội ngũ kiểm định chuyên trách.' },
            { icon: FileSignature, title: '2. Hợp đồng điện tử chuẩn', text: 'Ký kết hợp đồng trực tuyến có giá trị pháp lý, minh bạch điều khoản điện nước và cam kết thời gian hoàn trả tiền cọc.' },
            { icon: Receipt, title: '3. Thanh toán hóa đơn tự động', text: 'Chỉ số điện nước được chốt hằng tháng qua ảnh chụp công tơ, xuất hóa đơn chi tiết trên ứng dụng Tenant Portal.' },
          ].map(({ icon: Icon, title, text }) => (
            <article key={title} className="card feature-card">
              <div className="feature-card__icon">
                <Icon size={20} aria-hidden="true" />
              </div>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>

        <div className="cta-band">
          <div>
            <p className="cta-band__eyebrow">Dành riêng cho chủ trọ</p>
            <h2>Bạn có phòng trọ trống cần tìm khách thuê uy tín?</h2>
            <p>Đăng tin miễn phí, tiếp cận hàng chục ngàn người thuê trẻ và sử dụng bộ công cụ SaaS quản lý phòng trọ chuyên nghiệp.</p>
          </div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <ButtonLink to="/workspaces/select" variant="primary" size="lg">
              Đăng tin phòng ngay
            </ButtonLink>
            <ButtonLink to="/about" variant="secondary" size="lg">
              Tìm hiểu SaaS quản lý
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
