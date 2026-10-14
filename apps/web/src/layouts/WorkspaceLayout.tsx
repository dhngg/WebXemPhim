import { useEffect } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import {
  Building2,
  CalendarClock,
  Car,
  FileSignature,
  Gauge,
  LayoutDashboard,
  ListChecks,
  PiggyBank,
  Receipt,
  Settings,
  ShieldCheck,
  UsersRound,
  Wallet,
  Wrench,
  BarChart3,
  Tags,
} from 'lucide-react';
import { AppShell, type NavGroup } from './AppShell';
import { useWorkspaceMembership, lastWorkspace } from '@/features/workspaces/hooks';
import { hasPermission } from '@/features/workspaces/types';
import { roleLabel } from '@/features/workspaces/labels';
import { ErrorState, LoadingBlock } from '@/components/ui';
import { ForbiddenPage } from '@/pages/system/ErrorPages';

export function WorkspaceLayout() {
  const { workspaceId = '' } = useParams();
  const { membership, isLoading, error } = useWorkspaceMembership(workspaceId);

  useEffect(() => {
    if (membership) lastWorkspace.set(membership.workspaceId);
  }, [membership]);

  const base = `/w/${workspaceId}`;
  const role = membership?.role;

  const groups: NavGroup[] = [
    {
      title: 'Nghiệp vụ vận hành',
      items: [
        { to: `${base}/dashboard`, label: 'Tổng quan Dashboard', icon: LayoutDashboard },
        { to: `${base}/buildings`, label: 'Tòa nhà', icon: Building2 },
        { to: `${base}/rooms`, label: 'Phòng', icon: ListChecks },
        { to: `${base}/viewings`, label: 'Lịch xem phòng', icon: CalendarClock },
        { to: `${base}/tenants`, label: 'Người thuê', icon: UsersRound },
        { to: `${base}/contracts`, label: 'Hợp đồng', icon: FileSignature },
        { to: `${base}/vehicles`, label: 'Phương tiện', icon: Car },
        { to: `${base}/rates`, label: 'Bảng giá dịch vụ', icon: Tags },
        { to: `${base}/meters`, label: 'Chỉ số điện nước', icon: Gauge },
        { to: `${base}/invoices`, label: 'Hóa đơn', icon: Receipt },
        { to: `${base}/payments`, label: 'Thanh toán', icon: Wallet },
        { to: `${base}/deposits`, label: 'Tiền cọc', icon: PiggyBank },
        { to: `${base}/maintenance`, label: 'Bảo trì', icon: Wrench },
        { to: `${base}/reports`, label: 'Báo cáo', icon: BarChart3 },
      ],
    },
    {
      title: 'Cấu hình & quản trị',
      items: [
        ...(role && hasPermission(role, 'members.manage')
          ? [{ to: `${base}/members`, label: 'Thành viên & phân quyền', icon: ShieldCheck }]
          : []),
        ...(role && hasPermission(role, 'workspace.settings')
          ? [{ to: `${base}/settings`, label: 'Cài đặt', icon: Settings }]
          : []),
      ],
    },
  ].filter((g) => g.items.length > 0);

  const roomUsage = membership ? `${membership.roomCount}/${membership.plan.roomLimit} phòng` : '';

  return (
    <AppShell
      brandSubtitle="Quản trị hệ thống"
      groups={groups}
      searchPlaceholder="Tìm phòng, hợp đồng, người thuê…"
      userSubtitle={membership ? roleLabel(membership.role) : undefined}
      sidebarFooter={
        membership && (
          <div className="plan-card">
            <ShieldCheck size={20} color="var(--color-primary)" aria-hidden="true" />
            <div>
              <strong>{membership.plan.name}</strong>
              <span className="muted">{roomUsage}</span>
            </div>
          </div>
        )
      }
    >
      {isLoading ? (
        <LoadingBlock lines={5} />
      ) : error ? (
        <ErrorState error={error} />
      ) : !membership ? (
        <ForbiddenPage message="Bạn không phải thành viên của workspace này, hoặc workspace không tồn tại." />
      ) : (
        <Outlet context={membership} />
      )}
    </AppShell>
  );
}

