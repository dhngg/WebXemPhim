import { NavLink, useLocation } from 'react-router-dom';
import { useAppRole } from '@/features/auth/role';
import { pickWorkspace } from '@/features/capabilities/model';
import { lastWorkspace } from '@/features/workspaces/hooks';

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
  const { areas, capabilities, isGuest } = useAppRole();
  const { pathname } = useLocation();

  const market: Area = {
    key: 'market',
    label: 'Tìm phòng trọ',
    to: '/',
    match: (p) => p === '/' || p.startsWith('/rooms') || p.startsWith('/my-viewings') || p.startsWith('/link-tenant'),
  };
  const ws = pickWorkspace(capabilities, lastWorkspace.get());
  const landlord: Area = {
    key: 'landlord',
    label: 'Chủ trọ',
    sub: '(Landlord)',
    // Khách: đăng nhập rồi vào chọn workspace; chủ trọ: workspace gần nhất mà họ còn là thành viên.
    to: ws ? `/w/${ws.id}/dashboard` : '/login?redirect=%2Fworkspaces%2Fselect',
    match: (p) => p.startsWith('/w/') || p.startsWith('/workspaces'),
  };
  const tenant: Area = { key: 'tenant', label: 'Cổng người thuê', sub: '(Tenant)', to: '/tenant', match: (p) => p.startsWith('/tenant') };
  const admin: Area = { key: 'admin', label: 'Quản trị', sub: '(Admin)', to: '/admin', match: (p) => p.startsWith('/admin') };

  // Hiển thị MỌI khu vực mà user thực sự có (quyền thật từ backend), không chỉ một vai trò.
  const byKey = { market, landlord, tenant, admin };
  const shown = areas.map((k) => byKey[k]);
  const list = isGuest ? [market, landlord] : shown;
  // Chỉ một khu vực thì luôn hiển thị là khu vực đang dùng (kể cả ở trang chung như Hồ sơ)
  const isActive = (a: Area) => list.length === 1 || a.match(pathname);

  return (
    <nav className="area-switcher" aria-label="Khu vực">
      {list.map((a) => (
        <NavLink key={a.key} to={a.to} className={() => (isActive(a) ? 'active' : '')} end>
          {a.label}
          {a.sub && <small>{a.sub}</small>}
        </NavLink>
      ))}
    </nav>
  );
}
