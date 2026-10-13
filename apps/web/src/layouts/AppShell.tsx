import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu, Search, type LucideIcon } from 'lucide-react';
import { Brand } from './parts/Brand';
import { AreaSwitcher } from './parts/AreaSwitcher';
import { UserMenu } from './parts/UserMenu';
import { Badge } from '@/components/ui';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /** Màn hình chưa triển khai (placeholder) — vẫn điều hướng được. */
  pending?: boolean;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

interface AppShellProps {
  brandSubtitle: string;
  groups: NavGroup[];
  sidebarFooter?: ReactNode;
  searchPlaceholder?: string;
  userSubtitle?: string;
  children?: ReactNode;
}

/** Khung ứng dụng cho Workspace / Tenant / Admin: Sidebar + Topbar + nội dung. */
export function AppShell({ brandSubtitle, groups, sidebarFooter, searchPlaceholder, userSubtitle, children }: AppShellProps) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="app-shell">
      <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Điều hướng nghiệp vụ">
        <div className="sidebar__brand">
          <Brand subtitle={brandSubtitle} />
        </div>
        <nav>
          {groups.map((group) => (
            <div key={group.title}>
              <p className="sidebar__group-title">{group.title}</p>
              {group.items.map(({ to, label, icon: Icon, end, pending }) => (
                <NavLink key={to} to={to} end={end} className="sidebar__link">
                  <Icon size={18} aria-hidden="true" />
                  <span>{label}</span>
                  {pending && <Badge tone="neutral">Sắp có</Badge>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        {sidebarFooter && <div className="sidebar__footer">{sidebarFooter}</div>}
      </aside>
      {open && <div className="sidebar-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />}

      <div className="app-main">
        <header className="topbar">
          <button
            className="icon-btn sidebar-toggle"
            aria-label="Mở menu điều hướng"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <Menu size={22} />
          </button>
          <AreaSwitcher />
          {searchPlaceholder && (
            <form className="topbar__search" role="search" onSubmit={(e) => e.preventDefault()}>
              <Search size={16} aria-hidden="true" />
              <label className="sr-only" htmlFor="global-search">
                Tìm kiếm
              </label>
              <input id="global-search" className="input" placeholder={searchPlaceholder} />
            </form>
          )}
          <div className="topbar__right">
            <UserMenu subtitle={userSubtitle} />
          </div>
        </header>
        <main id="main" className="app-content">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}
