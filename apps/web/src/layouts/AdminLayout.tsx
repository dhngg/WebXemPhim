import { Building, FileClock, LayoutDashboard, Megaphone, Users } from 'lucide-react';
import { AppShell } from './AppShell';

export function AdminLayout() {
  return (
    <AppShell
      brandSubtitle="Quản trị nền tảng"
      userSubtitle="Quản trị viên"
      groups={[
        {
          title: 'Nền tảng',
          items: [
            { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
            { to: '/admin/users', label: 'Người dùng', icon: Users },
            { to: '/admin/workspaces', label: 'Workspace', icon: Building },
            { to: '/admin/listings', label: 'Tin đăng', icon: Megaphone },
            { to: '/admin/audit-logs', label: 'Nhật ký hoạt động', icon: FileClock },
          ],
        },
      ]}
    />
  );
}
