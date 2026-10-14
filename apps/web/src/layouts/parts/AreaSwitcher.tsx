import { NavLink, useLocation } from 'react-router-dom';
import { useAppRole, type AppRole } from '@/features/auth/role';

interface Area {
  key: string;
  label: string;
  sub?: string;
  to: string;
  match: (p: string) => boolean;
}

/**
 * Nhãn "khu vực" theo vai trò — mỗi vai trò chỉ thấy khu vực của mình:
 * người tìm phòng → Tìm phòng trọ, chủ trọ → Chủ trọ, người thuê → Cổng người thuê, admin → Quản trị.
 * Khách chưa đăng nhập thấy cả lối vào cho chủ trọ.
 */
export function AreaSwitcher() {
  const { role, home } = useAppRole();
  const { pathname } = useLocation();

  const market: Area = {
    key: 'market',
    label: 'Tìm phòng trọ',
    to: '/',
    match: (p) => p === '/' || p.startsWith('/rooms') || p.startsWith('/my-viewings') || p.startsWith('/link-tenant'),
  };
  const landlord: Area = {
    key: 'landlord',
    label: 'Chủ trọ',
    sub: '(Landlord)',
    to: role === 'LANDLORD' ? home : '/login?redirect=%2Fworkspaces%2Fselect',
    match: (p) => p.startsWith('/w/') || p.startsWith('/workspaces'),
  };
  const tenant: Area = { key: 'tenant', label: 'Cổng người thuê', sub: '(Tenant)', to: '/tenant', match: (p) => p.startsWith('/tenant') };
  const admin: Area = { key: 'admin', label: 'Quản trị', sub: '(Admin)', to: '/admin', match: (p) => p.startsWith('/admin') };

  const byRole: Record<AppRole, Area[]> = {
    GUEST: [market, landlord],
    SEEKER: [market],
    LANDLORD: [landlord],
    TENANT: [tenant],
    ADMIN: [admin],
  };
  const areas = byRole[role];
  // Chỉ một khu vực thì luôn hiển thị là khu vực đang dùng (kể cả ở trang chung như Hồ sơ)
  const isActive = (a: Area) => areas.length === 1 || a.match(pathname);

  return (
    <nav className="area-switcher" aria-label="Khu vực">
      {areas.map((a) => (
        <NavLink key={a.key} to={a.to} className={() => (isActive(a) ? 'active' : '')} end>
          {a.label}
          {a.sub && <small>{a.sub}</small>}
        </NavLink>
      ))}
    </nav>
  );
}
