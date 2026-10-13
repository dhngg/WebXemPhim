import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useCurrentUser, useLogout } from '@/features/auth/hooks';
import { ButtonLink } from '@/components/ui';

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts.at(-2)?.[0] ?? '') + (parts.at(-1)?.[0] ?? '')).toUpperCase();
}

export function UserMenu({ subtitle }: { subtitle?: string }) {
  const { data: user } = useCurrentUser();
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
      <Link to="/notifications" className="icon-btn" aria-label="Thông báo">
        <Bell size={20} />
        <span className="icon-btn__dot" aria-hidden="true" />
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
            <small>{subtitle ?? (user.globalRole === 'ADMIN' ? 'Quản trị viên' : user.email)}</small>
          </span>
        </button>
        {open && (
          <div className="user-menu__panel" role="menu">
            <Link role="menuitem" to="/account" onClick={() => setOpen(false)}>
              Hồ sơ của tôi
            </Link>
            <Link role="menuitem" to="/my-viewings" onClick={() => setOpen(false)}>
              Lịch xem phòng
            </Link>
            <Link role="menuitem" to="/workspaces/select" onClick={() => setOpen(false)}>
              Chọn workspace
            </Link>
            {user.tenantLinked && (
              <Link role="menuitem" to="/tenant" onClick={() => setOpen(false)}>
                Cổng người thuê
              </Link>
            )}
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
