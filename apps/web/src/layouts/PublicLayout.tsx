import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu, ShieldCheck, X } from 'lucide-react';
import { Brand } from './parts/Brand';
import { AreaSwitcher } from './parts/AreaSwitcher';
import { UserMenu } from './parts/UserMenu';

const MARKET_NAV = [
  { to: '/rooms', label: 'Khám phá' },
];
const INFO_NAV = [
  { to: '/about', label: 'Giới thiệu' },
  { to: '/help', label: 'Trợ giúp' },
];

export function SiteHeader() {
  // Khu tìm phòng là công khai: mọi người, kể cả chủ trọ/người thuê/admin, đều dùng được.
  const NAV = [...MARKET_NAV, ...INFO_NAV];
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
              Tìm phòng trọ do chủ trọ đăng công khai và phần mềm quản lý nhà trọ cho chủ nhà.
            </p>
            <p className="muted text-xs">Hotline / email hỗ trợ: sẽ cập nhật khi vận hành chính thức.</p>
          </div>
          <div>
            <h3>Tìm theo khu vực</h3>
            <ul>
              <li><Link to="/rooms?district=Cầu Giấy">Phòng trọ Cầu Giấy</Link></li>
              <li><Link to="/rooms?district=Thanh Xuân">Phòng trọ Thanh Xuân</Link></li>
              <li><Link to="/rooms?district=Đống Đa">Phòng trọ Đống Đa</Link></li>
              <li><Link to="/rooms?district=Hai Bà Trưng">Phòng trọ Hai Bà Trưng</Link></li>
            </ul>
          </div>
          <div>
            <h3>Tìm theo mức giá</h3>
            <ul>
              <li><Link to="/rooms?maxPrice=3000000">Dưới 3 triệu</Link></li>
              <li><Link to="/rooms?minPrice=3000000&maxPrice=5000000">3 - 5 triệu</Link></li>
              <li><Link to="/rooms?minPrice=5000000&maxPrice=7000000">5 - 7 triệu</Link></li>
              <li><Link to="/rooms?minPrice=7000000">Trên 7 triệu</Link></li>
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
