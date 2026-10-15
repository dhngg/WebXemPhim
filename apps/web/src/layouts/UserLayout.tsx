import { NavLink, Outlet } from 'react-router-dom';
import { Bell, Building2, CalendarClock, KeyRound, UserRound } from 'lucide-react';
import { useAppRole } from '@/features/auth/role';
import { SiteHeader } from './PublicLayout';

export function UserLayout() {
  const { has } = useAppRole();
  const NAV = [
    { to: '/account', label: 'Hồ sơ', icon: UserRound },
    { to: '/my-viewings', label: 'Lịch xem phòng', icon: CalendarClock },
    ...(has('tenant') ? [] : [{ to: '/link-tenant', label: 'Tôi đã thuê phòng', icon: KeyRound }]),
    { to: '/notifications', label: 'Thông báo', icon: Bell },
    { to: '/workspaces/select', label: has('landlord') ? 'Workspace của tôi' : 'Đăng ký làm chủ trọ', icon: Building2 },
  ];

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
