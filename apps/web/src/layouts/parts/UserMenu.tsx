import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useLogout } from '@/features/auth/hooks';
import { useUnreadCount } from '@/features/notifications/api';
import { useAppRole } from '@/features/auth/role';
import { pickWorkspace } from '@/features/capabilities/model';
import { lastWorkspace } from '@/features/workspaces/hooks';
import { ButtonLink } from '@/components/ui';

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts.at(-2)?.[0] ?? '') + (parts.at(-1)?.[0] ?? '')).toUpperCase();
}

export function UserMenu({ subtitle }: { subtitle?: string }) {
  const { user, has, home, capabilities } = useAppRole();
  const workspaceHome = pickWorkspace(capabilities, lastWorkspace.get());
  // Nhãn phụ theo quyền cao nhất đang có; nhiều quyền → xem bộ chuyển khu vực.
  const roleSubtitle = has('admin') ? 'Quản trị viên' : has('landlord') ? 'Chủ trọ' : has('tenant') ? 'Người thuê' : 'Người tìm phòng';
  const unread = useUnreadCount(Boolean(user)).data?.unread ?? 0;
  const logout = useLogout();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) {
    return (
      <div className="row">
        <ButtonLink to="/login" variant="ghost" size="sm">
          Đăng nhập
        </ButtonLink>
        <ButtonLink to="/register" variant="dark" size="sm">
          Đăng ký
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="row">
      <Link to="/notifications" className="icon-btn" aria-label={unread ? `Thông báo (${unread} chưa đọc)` : 'Thông báo'}>
        <Bell size={20} />
        {unread > 0 && (
          <span className="icon-btn__dot" data-testid="unread-badge" style={{ width: 'auto', minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, fontSize: 10, lineHeight: '16px', color: '#fff', textAlign: 'center' }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </Link>
      <div className="user-menu" ref={ref}>
        <button
          className="user-menu__trigger"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="avatar" aria-hidden="true">
            {initials(user.fullName)}
          </span>
          <span className="user-menu__name">
            {user.fullName}
            <small>{subtitle ?? roleSubtitle}</small>
          </span>
        </button>
        {open && (
          <div className="user-menu__panel" role="menu">
            <Link role="menuitem" to="/my-viewings" onClick={() => setOpen(false)}>
              Lịch xem phòng
            </Link>
            {!has('tenant') && (
              <Link role="menuitem" to="/link-tenant" onClick={() => setOpen(false)}>
                Tôi đã thuê phòng
              </Link>
            )}
            {has('landlord') ? (
              <>
                <Link role="menuitem" to={workspaceHome ? `/w/${workspaceHome.id}/dashboard` : home} onClick={() => setOpen(false)}>
                  Trang quản lý
                </Link>
                <Link role="menuitem" to="/workspaces/select" onClick={() => setOpen(false)}>
                  Chọn workspace
                </Link>
              </>
            ) : (
              <Link role="menuitem" to="/workspaces/select" onClick={() => setOpen(false)}>
                Đăng ký làm chủ trọ
              </Link>
            )}
            {has('tenant') && (
              <Link role="menuitem" to="/tenant" onClick={() => setOpen(false)}>
                Cổng người thuê
              </Link>
            )}
            {has('admin') && (
              <Link role="menuitem" to="/admin" onClick={() => setOpen(false)}>
                Trang quản trị
              </Link>
            )}
            <Link role="menuitem" to="/account" onClick={() => setOpen(false)}>
              Hồ sơ của tôi
            </Link>
            <button
              role="menuitem"
              onClick={() =>
                logout.mutate(undefined, {
                  onSettled: () => navigate('/', { replace: true }),
                })
              }
            >
              Đăng xuất
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
