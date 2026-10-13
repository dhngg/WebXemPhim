import { NavLink, Outlet } from 'react-router-dom';
import { PLATFORM_NAME } from '@rental/shared';

export function AppShell() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Bỏ qua điều hướng
      </a>
      <aside className="sidebar" aria-label="Điều hướng chính">
        <NavLink className="brand" to="/" aria-label={`${PLATFORM_NAME} — trang chủ`}>
          <span className="brand-mark" aria-hidden="true">
            r.
          </span>
          <span>
            Rental<span className="brand-subtitle">PLATFORM</span>
          </span>
        </NavLink>
        <div className="workspace-label">KHÔNG GIAN LÀM VIỆC</div>
        <nav>
          <NavLink className="nav-item" to="/" end>
            <span aria-hidden="true">◫</span> Tổng quan
          </NavLink>
          <a className="nav-item" href="/#system-status">
            <span aria-hidden="true">◎</span> Trạng thái hệ thống
          </a>
        </nav>
        <div className="sidebar-note">
          <span className="note-label">MỘT KHỞI ĐẦU GỌN GÀNG</span>
          <p>Từng bước xây dựng không gian quản lý nhà cho thuê của bạn.</p>
          <span className="phase-pill">Sprint 0 · Foundation</span>
        </div>
        <div className="sidebar-footer">
          Rental Platform <span>v0.1.0</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            Nền tảng / <strong>Tổng quan</strong>
          </span>
          <span className="environment-label">
            <span className="status-dot" /> Môi trường phát triển
          </span>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1}>
          <Outlet />
        </main>
        <footer className="page-footer">
          Được xây dựng cho những ngôi nhà, và những người ở trong đó.
        </footer>
      </div>
    </div>
  );
}
