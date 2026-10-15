import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet, ScrollRestoration } from 'react-router-dom';
import { PublicLayout } from '@/layouts/PublicLayout';
import { UserLayout } from '@/layouts/UserLayout';
import { WorkspaceLayout } from '@/layouts/WorkspaceLayout';
import { TenantLayout } from '@/layouts/TenantLayout';
import { AdminLayout } from '@/layouts/AdminLayout';
import { GlobalBanners } from '@/layouts/parts/GlobalBanners';
import { LoadingBlock } from '@/components/ui';
import { ForbiddenPage, NotFoundPage, OfflinePage, RouteErrorBoundary, ServerErrorPage } from '@/pages/system/ErrorPages';
import { GuestOnly, RequireArea, RequireAuth } from './guards';

/** Lazy-load một named export (các trang được nhóm theo domain trong cùng file). */
function lazyPage<M extends Record<string, unknown>>(loader: () => Promise<M>, name: keyof M) {
  const Component = lazy(() => loader().then((m) => ({ default: m[name] as ComponentType })));
  return <Component />;
}

const publicPages = () => import('@/pages/public/HomePage');
const roomsPages = () => import('@/pages/public/RoomsPage');
const detailPages = () => import('@/pages/public/RoomDetailPage');
const bookingPages = () => import('@/pages/public/ViewingBookingPage');
const infoPages = () => import('@/pages/public/InfoPages');
const authPages = () => import('@/pages/auth/AuthPages');
const userPages = () => import('@/pages/user/UserPages');
const dashboardPages = () => import('@/pages/workspace/DashboardPage');
const propertyPages = () => import('@/pages/workspace/PropertyPages');
const leasingPages = () => import('@/pages/workspace/LeasingPages');
const utilityPages = () => import('@/pages/workspace/UtilityPages');
const invoicePages = () => import('@/pages/workspace/InvoicePages');
const settlementPages = () => import('@/pages/workspace/SettlementPages');
const maintenancePages = () => import('@/pages/workspace/MaintenancePages');
const viewingPages = () => import('@/pages/workspace/ViewingPages');
const tenantPages = () => import('@/pages/tenant/TenantPages');
const tenantContractPages = () => import('@/pages/tenant/TenantContractPages');
const tenantInvoicePages = () => import('@/pages/tenant/TenantInvoicePages');
const tenantMaintenancePages = () => import('@/pages/tenant/TenantMaintenancePages');
const adminPages = () => import('@/pages/admin/AdminPages');
const adminUserPages = () => import('@/pages/admin/AdminUserPages');

function PageSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingBlock lines={6} label="Đang tải trang…" />}>{children}</Suspense>;
}

function RootLayout() {
  return (
    <>
      <a href="#main" className="skip-link">
        Bỏ qua tới nội dung chính
      </a>
      <GlobalBanners />
      <ScrollRestoration />
      <PageSuspense>
        <Outlet />
      </PageSuspense>
    </>
  );
}

export const routes = [
  {
    element: <RootLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          {
            // Khu Tìm phòng: công khai, mọi người (kể cả chủ trọ, người thuê, admin) đều xem được
            element: <RequireArea area="market" />,
            children: [
              { index: true, element: lazyPage(publicPages, 'HomePage') },
              { path: 'rooms', element: lazyPage(roomsPages, 'RoomsPage') },
              // Bản đồ ghim phòng đã bỏ (backend không có tọa độ); giữ URL cũ chạy được bằng cách về danh sách.
              { path: 'rooms/map', element: <Navigate to="/rooms" replace /> },
              { path: 'rooms/:roomId/viewing', element: lazyPage(bookingPages, 'ViewingBookingPage') },
            ],
          },
          {
            // Chủ trọ / admin vẫn mở được tin đăng để xem trước & kiểm duyệt
            element: <RequireArea area="market" />,
            children: [{ path: 'rooms/:roomId', element: lazyPage(detailPages, 'RoomDetailPage') }],
          },
          { path: 'about', element: lazyPage(infoPages, 'AboutPage') },
          { path: 'help', element: lazyPage(infoPages, 'HelpPage') },
          { path: 'login', element: <GuestOnly>{lazyPage(authPages, 'LoginPage')}</GuestOnly> },
          { path: 'register', element: <GuestOnly>{lazyPage(authPages, 'RegisterPage')}</GuestOnly> },
          { path: 'forgot-password', element: lazyPage(authPages, 'ForgotPasswordPage') },
          { path: 'reset-password', element: lazyPage(authPages, 'ResetPasswordPage') },
          { path: '403', element: <ForbiddenPage /> },
          { path: '500', element: <ServerErrorPage /> },
          { path: 'offline', element: <OfflinePage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <UserLayout />,
            children: [
              { path: 'account', element: lazyPage(userPages, 'AccountPage') },
              { path: 'notifications', element: lazyPage(userPages, 'NotificationsPage') },
              {
                element: <RequireArea area="market" />,
                children: [
                  { path: 'my-viewings', element: lazyPage(userPages, 'MyViewingsPage') },
                  // Người tìm phòng đã thuê → liên kết hồ sơ; chủ trọ duyệt xong sẽ chuyển sang vai trò người thuê
                  { path: 'link-tenant', element: lazyPage(tenantPages, 'LinkAccountPage') },
                ],
              },
              {
                // Mở cho mọi user đã đăng nhập: chủ trọ chọn workspace; user chưa có workspace thấy/gửi đơn đăng ký chủ trọ.
                element: <RequireArea area="market" />,
                children: [{ path: 'workspaces/select', element: lazyPage(userPages, 'WorkspaceSelectPage') }],
              },
            ],
          },
          {
            path: 'w/:workspaceId',
            element: (
              <RequireArea area="landlord">
                <WorkspaceLayout />
              </RequireArea>
            ),
            children: [
              { index: true, element: <Navigate to="dashboard" replace /> },
              { path: 'dashboard', element: lazyPage(dashboardPages, 'DashboardPage') },
              // V1 không có quản lý nhân viên/phân quyền/cài đặt workspace
              { path: 'members', element: <Navigate to="../dashboard" replace /> },
              { path: 'settings', element: <Navigate to="../dashboard" replace /> },
              { path: 'buildings', element: lazyPage(propertyPages, 'BuildingsPage') },
              { path: 'buildings/new', element: lazyPage(propertyPages, 'BuildingFormPage') },
              { path: 'buildings/:buildingId', element: lazyPage(propertyPages, 'BuildingDetailPage') },
              { path: 'buildings/:buildingId/edit', element: lazyPage(propertyPages, 'BuildingFormPage') },
              { path: 'rooms', element: lazyPage(propertyPages, 'WsRoomsPage') },
              { path: 'rooms/new', element: lazyPage(propertyPages, 'WsRoomFormPage') },
              { path: 'rooms/:roomId', element: lazyPage(propertyPages, 'WsRoomDetailPage') },
              { path: 'rooms/:roomId/edit', element: lazyPage(propertyPages, 'WsRoomFormPage') },
              { path: 'viewings', element: lazyPage(viewingPages, 'ViewingRequestsPage') },
              { path: 'tenants', element: lazyPage(leasingPages, 'TenantsPage') },
              { path: 'tenants/new', element: lazyPage(leasingPages, 'TenantFormPage') },
              { path: 'tenants/:tenantId', element: lazyPage(leasingPages, 'TenantDetailPage') },
              { path: 'tenants/:tenantId/edit', element: lazyPage(leasingPages, 'TenantFormPage') },
              { path: 'contracts', element: lazyPage(leasingPages, 'ContractsPage') },
              { path: 'contracts/new', element: lazyPage(leasingPages, 'ContractFormPage') },
              { path: 'contracts/:contractId', element: lazyPage(leasingPages, 'ContractDetailPage') },
              { path: 'contracts/:contractId/edit', element: lazyPage(leasingPages, 'ContractFormPage') },
              { path: 'vehicles', element: lazyPage(leasingPages, 'VehiclesPage') },
              { path: 'rates', element: lazyPage(utilityPages, 'RatesPage') },
              { path: 'meters', element: lazyPage(utilityPages, 'MetersPage') },
              { path: 'invoices', element: lazyPage(invoicePages, 'InvoicesPage') },
              { path: 'invoices/:buildingId/:invoiceId', element: lazyPage(invoicePages, 'InvoiceDetailPage') },
              // Backend không có chạy hóa đơn hàng loạt: quy trình là tạo bản nháp → hoàn thiện → phát hành cho từng hợp đồng.
              { path: 'billing/run', element: <Navigate to="../invoices" replace /> },
              { path: 'payments', element: lazyPage(settlementPages, 'PaymentsPage') },
              { path: 'deposits', element: lazyPage(settlementPages, 'DepositsPage') },
              { path: 'maintenance', element: lazyPage(maintenancePages, 'MaintenancePage') },
              { path: 'maintenance/:buildingId/:requestId', element: lazyPage(maintenancePages, 'MaintenanceDetailPage') },
              // Báo cáo hoãn khỏi V1 (quyết định Product: backend chưa có Reports API) → về Tổng quan, giữ đúng workspace.
              { path: 'reports', element: <Navigate to="../dashboard" replace /> },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
          {
            path: 'tenant',
            element: (
              <RequireArea area="tenant">
                <TenantLayout />
              </RequireArea>
            ),
            children: [
              { index: true, element: lazyPage(tenantPages, 'TenantHomePage') },
              { path: 'link-account', element: lazyPage(tenantPages, 'LinkAccountPage') },
              { path: 'contracts', element: lazyPage(tenantContractPages, 'TenantContractsPage') },
              { path: 'contracts/:contractId', element: lazyPage(tenantContractPages, 'TenantContractDetailPage') },
              { path: 'invoices', element: lazyPage(tenantInvoicePages, 'TenantInvoicesPage') },
              { path: 'invoices/:invoiceId', element: lazyPage(tenantInvoicePages, 'TenantInvoiceDetailPage') },
              { path: 'maintenance', element: lazyPage(tenantMaintenancePages, 'TenantMaintenancePage') },
              { path: 'maintenance/:requestId', element: lazyPage(tenantMaintenancePages, 'TenantMaintenanceDetailPage') },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
          {
            path: 'admin',
            element: (
              <RequireArea area="admin">
                <AdminLayout />
              </RequireArea>
            ),
            children: [
              { index: true, element: lazyPage(adminPages, 'AdminDashboardPage') },
              { path: 'applications', element: lazyPage(adminPages, 'AdminApplicationsPage') },
              { path: 'users', element: lazyPage(adminUserPages, 'AdminUsersPage') },
              { path: 'users/:userId', element: lazyPage(adminUserPages, 'AdminUserDetailPage') },
              { path: 'listings', element: lazyPage(adminUserPages, 'AdminListingsPage') },
              { path: 'audit-logs', element: lazyPage(adminPages, 'AuditLogsPage') },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
