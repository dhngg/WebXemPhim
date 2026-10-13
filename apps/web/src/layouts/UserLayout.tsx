import { NavLink, Outlet } from 'react-router-dom';
import { Bell, Building2, CalendarClock, UserRound } from 'lucide-react';
import { SiteHeader } from './PublicLayout';

const NAV = [
  { to: '/account', label: 'Hồ sơ', icon: UserRound },
  { to: '/my-viewings', label: 'Lịch xem phòng', icon: CalendarClock },
  { to: '/notifications', label: 'Thông báo', icon: Bell },
  { to: '/workspaces/select', label: 'Workspace của tôi', icon: Building2 },
];

export function UserLayout() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="container user-area" style={{ paddingBottom: 'var(--space-16)' }}>
        <nav className="user-area__nav" aria-label="Tài khoản">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to}>
              <Icon size={18} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div>
          <Outlet />
        </div>
      </main>
    </>
  );
}
