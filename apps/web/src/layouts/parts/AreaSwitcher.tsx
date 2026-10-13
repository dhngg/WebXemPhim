import { NavLink, useLocation } from 'react-router-dom';
import { useCurrentUser } from '@/features/auth/hooks';
import { lastWorkspace } from '@/features/workspaces/hooks';

/**
 * Chuyển "khu vực" (ảnh demo: Tìm phòng trọ / Chủ trọ / Cổng người thuê / Quản trị).
 * Role-aware: tab Quản trị chỉ hiện với ADMIN, Cổng người thuê chỉ hiện khi đã liên kết hồ sơ thuê.
 */
export function AreaSwitcher() {
  const { data: user } = useCurrentUser();
  const { pathname } = useLocation();
  const lastWs = lastWorkspace.get();

  const areas = [
    { key: 'market', label: 'Tìm phòng trọ', to: '/', match: (p: string) => p === '/' || p.startsWith('/rooms') },
    {
      key: 'landlord',
      label: 'Chủ trọ',
      sub: '(Landlord)',
      to: lastWs ? `/w/${lastWs}/dashboard` : '/workspaces/select',
      match: (p: string) => p.startsWith('/w/') || p.startsWith('/workspaces'),
    },
    ...(user?.tenantLinked
      ? [{ key: 'tenant', label: 'Cổng người thuê', sub: '(Tenant)', to: '/tenant', match: (p: string) => p.startsWith('/tenant') }]
      : []),
    ...(user?.globalRole === 'ADMIN'
      ? [{ key: 'admin', label: 'Quản trị', sub: '(Admin)', to: '/admin', match: (p: string) => p.startsWith('/admin') }]
      : []),
  ];

  return (
    <nav className="area-switcher" aria-label="Khu vực">
      {areas.map((a) => (
        <NavLink key={a.key} to={a.to} className={() => (a.match(pathname) ? 'active' : '')} end>
          {a.label}
          {a.sub && <small>{a.sub}</small>}
        </NavLink>
      ))}
    </nav>
  );
}
