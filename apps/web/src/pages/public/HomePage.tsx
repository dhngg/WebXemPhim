import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, KeyRound, MapPin, Search, Wallet, Building2 } from 'lucide-react';
import { Button, ButtonLink, EmptyState, ErrorState, Listbox, Skeleton } from '@/components/ui';
import { useRoomSearch } from '@/features/rooms/hooks';
import { RoomCard } from '@/features/rooms/components/RoomCard';
import { PRICE_RANGES } from '@/features/rooms/labels';
import { useAppRole } from '@/features/auth/role';

const LATEST_COUNT = 8;

/**
 * Ô tìm phòng ở trang chủ. Chỉ dùng các điều kiện `GET /listings` hỗ trợ: thành phố, quận/huyện (chứa, không phân biệt
 * hoa thường) và khoảng giá. Không có loại phòng; không có danh sách khu vực lấy từ API (backend không có).
 */
export function SearchHero() {
  const navigate = useNavigate();
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [price, setPrice] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (city.trim()) params.set('city', city.trim());
    if (district.trim()) params.set('district', district.trim());
    const range = PRICE_RANGES.find((r) => r.key === price);
    if (range?.min) params.set('minPrice', String(range.min));
    if (range?.max) params.set('maxPrice', String(range.max));
    const qs = params.toString();
    navigate(qs ? `/rooms?${qs}` : '/rooms');
  }

  return (
    <form className="search-hero" onSubmit={submit} role="search" aria-label="Tìm phòng">
      <div className="search-hero__field">
        <Building2 size={18} aria-hidden="true" />
        <div style={{ flex: 1 }}>
          <label htmlFor="hero-city">Tỉnh / thành phố</label>
          <input id="hero-city" className="input" value={city} placeholder="Ví dụ: Hà Nội" maxLength={100} onChange={(e) => setCity(e.target.value)} />
        </div>
      </div>
      <div className="search-hero__field">
        <MapPin size={18} aria-hidden="true" />
        <div style={{ flex: 1 }}>
          <label htmlFor="hero-district">Quận / huyện</label>
          <input id="hero-district" className="input" value={district} placeholder="Ví dụ: Cầu Giấy" maxLength={100} onChange={(e) => setDistrict(e.target.value)} />
        </div>
      </div>
      <div className="search-hero__field">
        <Wallet size={18} aria-hidden="true" />
        <div style={{ flex: 1 }}>
          <label htmlFor="hero-price">Khoảng giá</label>
          <Listbox
            id="hero-price"
            value={price}
            onChange={setPrice}
            options={[
              { value: '', label: 'Mọi mức giá' },
              ...PRICE_RANGES.map((r) => ({ value: r.key, label: `${r.label}/tháng` })),
            ]}
          />
        </div>
      </div>
      <Button type="submit" variant="dark" size="lg">
        <Search size={18} aria-hidden="true" /> Tìm ngay
      </Button>
    </form>
  );
}

export function HomePage() {
  // `GET /listings` trả tin theo thời điểm đăng, mới nhất trước, nên trang đầu chính là “phòng mới đăng”.
  const latest = useRoomSearch({ page: 1, limit: LATEST_COUNT });
  const { isGuest } = useAppRole();

  return (
    <>
      <section className="hero">
        <div className="container">
          <h1 className="hero__title">Tìm phòng trọ phù hợp với cuộc sống của bạn</h1>
          <p className="hero__desc">Xem phòng trọ do chủ trọ đăng công khai, lọc theo khu vực và mức giá, rồi đặt lịch xem phòng.</p>
          <SearchHero />
        </div>
      </section>

      <section className="container home-section" aria-labelledby="latest-title">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 'var(--space-5)', flexWrap: 'wrap' }}>
          <div>
            <h2 id="latest-title" className="home-section__title" style={{ marginTop: 0 }}>
              Phòng mới đăng
            </h2>
            <p className="muted text-sm">Các phòng chủ trọ vừa đăng gần đây nhất, mới nhất trước.</p>
          </div>
          <ButtonLink to="/rooms" variant="secondary">
            Xem tất cả phòng
          </ButtonLink>
        </div>
        {latest.isLoading ? (
          <div className="grid grid--4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} height={360} />
            ))}
          </div>
        ) : latest.error ? (
          <ErrorState error={latest.error} onRetry={() => latest.refetch()} />
        ) : !latest.data?.items.length ? (
          <EmptyState title="Chưa có phòng nào được đăng" description="Hãy quay lại sau hoặc dùng bộ lọc ở trang Tìm phòng." />
        ) : (
          <div className="grid grid--4" data-testid="latest-rooms">
            {latest.data.items.map((room) => (
              <RoomCard key={room.id} room={room} />
            ))}
          </div>
        )}
      </section>

      <section className="container home-section" aria-labelledby="how-title">
        <div className="home-section__head">
          <p className="home-section__eyebrow">Cách hoạt động</p>
          <h2 id="how-title" className="home-section__title">
            Từ tìm phòng đến thuê phòng
          </h2>
        </div>
        <div className="grid grid--3">
          {[
            { icon: Search, title: '1. Tìm phòng', text: 'Lọc phòng theo thành phố, quận, phường và khoảng giá. Mở chi tiết để xem ảnh, tiện ích và địa chỉ.' },
            { icon: CalendarCheck, title: '2. Đặt lịch xem phòng', text: 'Gửi giờ hẹn cho chủ trọ. Lịch ở trạng thái chờ cho tới khi chủ trọ xác nhận hoặc từ chối.' },
            { icon: KeyRound, title: '3. Thuê và theo dõi', text: 'Sau khi thuê, chủ trọ gửi mã mời để bạn liên kết tài khoản và xem hợp đồng, hóa đơn, tiền cọc trên Cổng người thuê.' },
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

        {isGuest && (
          <div className="cta-band">
            <div>
              <p className="cta-band__eyebrow">Dành cho chủ trọ</p>
              <h2>Bạn có phòng trọ cần quản lý và cho thuê?</h2>
              <p>Gửi đơn đăng ký chủ trọ. Khi được duyệt, bạn tạo workspace đầu tiên rồi quản lý tòa nhà, phòng, hợp đồng và hóa đơn.</p>
            </div>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <ButtonLink to="/workspaces/select" variant="primary" size="lg">
                Đăng ký làm chủ trọ
              </ButtonLink>
              <ButtonLink to="/about" variant="secondary" size="lg">
                Tìm hiểu thêm
              </ButtonLink>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
