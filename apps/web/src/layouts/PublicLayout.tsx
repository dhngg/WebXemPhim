import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu, ShieldCheck, X } from 'lucide-react';
import { Brand } from './parts/Brand';
import { AreaSwitcher } from './parts/AreaSwitcher';
import { UserMenu } from './parts/UserMenu';

const NAV = [
  { to: '/rooms', label: 'Khám phá' },
  { to: '/rooms/map', label: 'Bản đồ' },
  { to: '/about', label: 'Giới thiệu' },
  { to: '/help', label: 'Trợ giúp' },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="site-header">
      <div className="container">
        <div className="site-header__inner">
          <Brand />
          <AreaSwitcher />
          <nav className="site-header__nav" aria-label="Điều hướng chính">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="site-header__right">
            <UserMenu />
            <button
              className="icon-btn mobile-menu-btn"
              aria-label={open ? 'Đóng menu' : 'Mở menu'}
              aria-expanded={open}
              aria-controls="mobile-menu"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
        {open && (
          <nav id="mobile-menu" className="mobile-menu" aria-label="Menu di động">
            <AreaSwitcher />
            {NAV.map((n) => (
              <Link key={n.to} to={n.to}>
                {n.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="site-footer__grid">
          <div className="stack" style={{ gap: 'var(--space-3)' }}>
            <Brand subtitle="V1.0" />
            <p className="muted">
              Hệ sinh thái kết nối tìm kiếm phòng trọ xác thực và phần mềm quản trị nhà trọ thông minh cho chủ nhà hiện
              đại.
            </p>
            <p className="muted text-xs">Hotline / email hỗ trợ: sẽ cập nhật khi vận hành chính thức.</p>
          </div>
          <div>
            <h3>Khu vực sôi động TP.HCM</h3>
            <ul>
              <li><Link to="/rooms?district=Bình Thạnh">Phòng trọ Bình Thạnh</Link></li>
              <li><Link to="/rooms?district=Thủ Đức">Phòng trọ TP. Thủ Đức</Link></li>
              <li><Link to="/rooms?district=Quận 7">Phòng trọ Quận 7</Link></li>
              <li><Link to="/rooms?district=Tân Bình">Phòng trọ Tân Bình</Link></li>
            </ul>
          </div>
          <div>
            <h3>Loại hình tìm kiếm</h3>
            <ul>
              <li><Link to="/rooms?roomType=STUDIO">Phòng Studio</Link></li>
              <li><Link to="/rooms?roomType=DUPLEX">Căn hộ Duplex</Link></li>
              <li><Link to="/rooms?roomType=APARTMENT">Căn hộ dịch vụ</Link></li>
              <li><Link to="/rooms?roomType=SHARED">Ở ghép</Link></li>
            </ul>
          </div>
          <div>
            <h3>Chính sách & Hỗ trợ</h3>
            <ul>
              <li><Link to="/help">Câu hỏi thường gặp</Link></li>
              <li><Link to="/help#safety">Cẩm nang thuê phòng an toàn</Link></li>
              <li><Link to="/about">Giới thiệu sản phẩm</Link></li>
            </ul>
          </div>
        </div>
        <div className="site-footer__bottom">
          <span className="row">
            <ShieldCheck size={14} aria-hidden="true" /> Rental Platform V1.0 — bản demo frontend
          </span>
          <span>© {new Date().getFullYear()} Rental Platform</span>
        </div>
      </div>
    </footer>
  );
}

export function PublicLayout() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <Outlet />
      </main>
      <SiteFooter />
    </>
  );
}
