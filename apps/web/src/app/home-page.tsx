import { HealthStatus } from '../components/health-status';

const areas = [
  {
    number: '01',
    icon: '⌂',
    title: 'Quản lý nhà cho thuê',
    description: 'Tòa nhà, phòng và các hoạt động hàng ngày trong cùng một không gian.',
  },
  {
    number: '02',
    icon: '◇',
    title: 'Kết nối người thuê',
    description: 'Tìm phòng phù hợp và đặt lịch xem nhà thuận tiện.',
  },
  {
    number: '03',
    icon: '▤',
    title: 'Cổng thông tin người thuê',
    description: 'Theo dõi hợp đồng, hóa đơn và gửi yêu cầu hỗ trợ.',
  },
];

export function HomePage() {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">RENTAL PLATFORM</span>
          <h1>Không gian cho một khởi đầu mới.</h1>
          <p>Một nền tảng, kết nối mọi bước trong hành trình cho thuê.</p>
        </div>
        <span className="outline-pill">Bản nền tảng</span>
      </div>
      <section className="welcome-panel" aria-labelledby="welcome-heading">
        <div className="welcome-copy">
          <span className="welcome-tag">CHÀO MỪNG BẠN</span>
          <h2 id="welcome-heading">
            Quản lý nhẹ nhàng.
            <br />
            An tâm hơn mỗi ngày.
          </h2>
          <p>
            Rental Platform đang được xây dựng để giúp chủ nhà và người thuê kết nối, quản lý và
            đồng hành tốt hơn.
          </p>
          <a className="button-primary" href="#system-status">
            Xem trạng thái hệ thống <span aria-hidden="true">↗</span>
          </a>
        </div>
        <div className="house-art" aria-hidden="true">
          <div className="art-sun" />
          <div className="art-house">
            <div className="art-roof" />
            <div className="art-window" />
            <div className="art-door" />
          </div>
          <div className="art-ground" />
          <span className="art-caption">A PLACE TO BEGIN</span>
        </div>
      </section>
      <div className="section-heading">
        <h2>Những điều đang được xây dựng</h2>
        <span>LỘ TRÌNH SẢN PHẨM</span>
      </div>
      <div className="roadmap-grid">
        {areas.map((area) => (
          <article className="roadmap-card" key={area.number}>
            <div className="card-top">
              <span className="area-icon" aria-hidden="true">
                {area.icon}
              </span>
              <span className="card-number">{area.number}</span>
            </div>
            <h3>{area.title}</h3>
            <p>{area.description}</p>
            <span className="coming-label">
              <span className="muted-dot" /> Sắp phát triển
            </span>
          </article>
        ))}
      </div>
      <HealthStatus />
    </>
  );
}
