import { useCurrentUser } from './hooks';
import { lastWorkspace, useMyWorkspaces } from '@/features/workspaces/hooks';
import { useTenantContracts, useTenantInvoices } from '@/features/tenant-portal/api';
import type { WorkspaceMembership } from '@/features/workspaces/types';
import type { Contract } from '@/features/leasing/types';
import type { Invoice, InvoiceStatus } from '@/features/billing/types';
import type { CurrentUser } from './types';

/**
 * Vai trò giao diện — mỗi vai trò chỉ thấy khu vực của mình:
 * - SEEKER: người tìm phòng (marketplace, lịch xem phòng).
 * - TENANT: đã liên kết hồ sơ thuê VÀ đang thuê (xem `isRenting`) → chỉ Cổng người thuê.
 * - LANDLORD: là thành viên ít nhất một workspace → chỉ khu Chủ trọ.
 * - ADMIN: quản trị hệ thống.
 * Suy ra từ dữ liệu backend đã trả (globalRole, workspace membership, tenantLinked, hợp đồng, hóa đơn).
 * Đây chỉ là phân tách UI — backend vẫn kiểm tra quyền thật.
 */
export type AppRole = 'GUEST' | 'SEEKER' | 'TENANT' | 'LANDLORD' | 'ADMIN';

export interface Tenancy {
  contracts: Contract[];
  invoices: Invoice[];
}

const UNSETTLED: InvoiceStatus[] = ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'];

/**
 * Còn là người thuê khi còn hợp đồng hiệu lực, hoặc hợp đồng đã chấm dứt/kết thúc nhưng
 * còn hóa đơn chưa thanh toán xong (để vẫn xem & trả được hóa đơn cuối).
 * Hết cả hai → trở lại người tìm phòng.
 */
export function isRenting({ contracts, invoices }: Tenancy): boolean {
  return contracts.some((c) => c.status === 'ACTIVE') || invoices.some((i) => UNSETTLED.includes(i.status));
}

export function roleOf(
  user: CurrentUser | null | undefined,
  memberships: WorkspaceMembership[] | undefined,
  /** undefined = chưa có dữ liệu thuê (đang tải / lỗi) → giữ vai trò người thuê cho an toàn. */
  tenancy?: Tenancy,
): AppRole {
  if (!user) return 'GUEST';
  if (user.globalRole === 'ADMIN') return 'ADMIN';
  if (memberships?.length) return 'LANDLORD';
  if (user.tenantLinked && (!tenancy || isRenting(tenancy))) return 'TENANT';
  return 'SEEKER';
}

/** Trang chủ của từng vai trò. */
export function homeFor(role: AppRole, memberships: WorkspaceMembership[] | undefined): string {
  switch (role) {
    case 'ADMIN':
      return '/admin';
    case 'TENANT':
      return '/tenant';
    case 'LANDLORD': {
      const last = lastWorkspace.get();
      const ws = memberships?.find((m) => m.workspaceId === last) ?? memberships?.[0];
      return ws ? `/w/${ws.workspaceId}/dashboard` : '/workspaces/select';
    }
    default:
      return '/';
  }
}

export function useAppRole() {
  const me = useCurrentUser();
  const user = me.data ?? null;
  const needsWorkspaces = Boolean(user) && user?.globalRole !== 'ADMIN';
  const workspaces = useMyWorkspaces(needsWorkspaces);
  // Chỉ kiểm tra hợp đồng / hóa đơn với tài khoản đã liên kết hồ sơ thuê và không phải chủ trọ
  const checkTenancy = needsWorkspaces && Boolean(user?.tenantLinked) && workspaces.isSuccess && !workspaces.data.length;
  const contracts = useTenantContracts(checkTenancy);
  const invoices = useTenantInvoices(checkTenancy);
  const tenancy = contracts.data && invoices.data ? { contracts: contracts.data, invoices: invoices.data } : undefined;

  const role = roleOf(user, workspaces.data, tenancy);
  return {
    user,
    role,
    home: homeFor(role, workspaces.data),
    isLoading:
      me.isLoading ||
      (needsWorkspaces && workspaces.isLoading) ||
      (checkTenancy && (contracts.isLoading || invoices.isLoading)),
  };
}
