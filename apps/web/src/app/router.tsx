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
import { GuestOnly, RequireAdmin, RequireAuth, RequireLinkedTenant } from './guards';

/** Lazy-load một named export (các trang được nhóm theo domain trong cùng file). */
function lazyPage<M extends Record<string, unknown>>(loader: () => Promise<M>, name: keyof M) {
  const Component = lazy(() => loader().then((m) => ({ default: m[name] as ComponentType })));
  return <Component />;
}

const publicPages = () => import('@/pages/public/HomePage');
const roomsPages = () => import('@/pages/public/RoomsPage');
const detailPages = () => import('@/pages/public/RoomDetailPage');
const mapPages = () => import('@/pages/public/RoomsMapPage');
const bookingPages = () => import('@/pages/public/ViewingBookingPage');
const infoPages = () => import('@/pages/public/InfoPages');
const authPages = () => import('@/pages/auth/AuthPages');
const userPages = () => import('@/pages/user/UserPages');
const dashboardPages = () => import('@/pages/workspace/DashboardPage');
const wsAdminPages = () => import('@/pages/workspace/WorkspaceAdminPages');
const propertyPages = () => import('@/pages/workspace/PropertyPages');
const leasingPages = () => import('@/pages/workspace/LeasingPages');
const billingPages = () => import('@/pages/workspace/BillingPages');
const opsPages = () => import('@/pages/workspace/OperationsPages');
const tenantPages = () => import('@/pages/tenant/TenantPages');
const adminPages = () => import('@/pages/admin/AdminPages');

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
          { index: true, element: lazyPage(publicPages, 'HomePage') },
          { path: 'rooms', element: lazyPage(roomsPages, 'RoomsPage') },
          { path: 'rooms/map', element: lazyPage(mapPages, 'RoomsMapPage') },
          { path: 'rooms/:roomId', element: lazyPage(detailPages, 'RoomDetailPage') },
          { path: 'rooms/:roomId/viewing', element: lazyPage(bookingPages, 'ViewingBookingPage') },
          { path: 'about', element: lazyPage(infoPages, 'AboutPage') },
          { path: 'help', element: lazyPage(infoPages, 'HelpPage') },
          { path: 'login', element: <GuestOnly>{lazyPage(authPages, 'LoginPage')}</GuestOnly> },
          { path: 'register', element: <GuestOnly>{lazyPage(authPages, 'RegisterPage')}</GuestOnly> },
          { path: 'forgot-password', element: lazyPage(authPages, 'ForgotPasswordPage') },
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
              { path: 'my-viewings', element: lazyPage(userPages, 'MyViewingsPage') },
              { path: 'notifications', element: lazyPage(userPages, 'NotificationsPage') },
              { path: 'workspaces/select', element: lazyPage(userPages, 'WorkspaceSelectPage') },
            ],
          },
          {
            path: 'w/:workspaceId',
            element: <WorkspaceLayout />,
            children: [
              { index: true, element: <Navigate to="dashboard" replace /> },
              { path: 'dashboard', element: lazyPage(dashboardPages, 'DashboardPage') },
              { path: 'settings', element: lazyPage(wsAdminPages, 'WorkspaceSettingsPage') },
              { path: 'members', element: lazyPage(wsAdminPages, 'MembersPage') },
              { path: 'buildings', element: lazyPage(propertyPages, 'BuildingsPage') },
              { path: 'buildings/new', element: lazyPage(propertyPages, 'BuildingFormPage') },
              { path: 'buildings/:buildingId', element: lazyPage(propertyPages, 'BuildingDetailPage') },
              { path: 'buildings/:buildingId/edit', element: lazyPage(propertyPages, 'BuildingFormPage') },
              { path: 'rooms', element: lazyPage(propertyPages, 'WsRoomsPage') },
              { path: 'rooms/new', element: lazyPage(propertyPages, 'WsRoomFormPage') },
              { path: 'rooms/:roomId', element: lazyPage(propertyPages, 'WsRoomDetailPage') },
              { path: 'rooms/:roomId/edit', element: lazyPage(propertyPages, 'WsRoomFormPage') },
              { path: 'viewings', element: lazyPage(propertyPages, 'WsViewingsPage') },
              { path: 'tenants', element: lazyPage(leasingPages, 'TenantsPage') },
              { path: 'tenants/new', element: lazyPage(leasingPages, 'TenantFormPage') },
              { path: 'tenants/:tenantId', element: lazyPage(leasingPages, 'TenantDetailPage') },
              { path: 'tenants/:tenantId/edit', element: lazyPage(leasingPages, 'TenantFormPage') },
              { path: 'contracts', element: lazyPage(leasingPages, 'ContractsPage') },
              { path: 'contracts/new', element: lazyPage(leasingPages, 'ContractFormPage') },
              { path: 'contracts/:contractId', element: lazyPage(leasingPages, 'ContractDetailPage') },
              { path: 'contracts/:contractId/edit', element: lazyPage(leasingPages, 'ContractFormPage') },
              { path: 'vehicles', element: lazyPage(leasingPages, 'VehiclesPage') },
              { path: 'rates', element: lazyPage(billingPages, 'RatesPage') },
              { path: 'meters', element: lazyPage(billingPages, 'MetersPage') },
              { path: 'invoices', element: lazyPage(billingPages, 'InvoicesPage') },
              { path: 'invoices/:invoiceId', element: lazyPage(billingPages, 'InvoiceDetailPage') },
              { path: 'billing/run', element: lazyPage(billingPages, 'BillingRunPage') },
              { path: 'payments', element: lazyPage(billingPages, 'PaymentsPage') },
              { path: 'deposits', element: lazyPage(billingPages, 'DepositsPage') },
              { path: 'maintenance', element: lazyPage(opsPages, 'MaintenancePage') },
              { path: 'maintenance/:id', element: lazyPage(opsPages, 'MaintenanceDetailPage') },
              { path: 'reports', element: lazyPage(opsPages, 'ReportsPage') },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
          {
            path: 'tenant',
            element: <TenantLayout />,
            children: [
              { path: 'link-account', element: lazyPage(tenantPages, 'LinkAccountPage') },
              {
                element: <RequireLinkedTenant />,
                children: [
                  { index: true, element: lazyPage(tenantPages, 'TenantHomePage') },
                  { path: 'contracts', element: lazyPage(tenantPages, 'TenantContractsPage') },
                  { path: 'invoices', element: lazyPage(tenantPages, 'TenantInvoicesPage') },
                  { path: 'invoices/:invoiceId', element: lazyPage(tenantPages, 'TenantInvoiceDetailPage') },
                  { path: 'payments/new', element: lazyPage(tenantPages, 'TenantPaymentPage') },
                  { path: 'maintenance', element: lazyPage(tenantPages, 'TenantMaintenancePage') },
                ],
              },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
          {
            path: 'admin',
            element: (
              <RequireAdmin>
                <AdminLayout />
              </RequireAdmin>
            ),
            children: [
              { index: true, element: lazyPage(adminPages, 'AdminDashboardPage') },
              { path: 'users', element: lazyPage(adminPages, 'AdminUsersPage') },
              { path: 'workspaces', element: lazyPage(adminPages, 'AdminWorkspacesPage') },
              { path: 'listings', element: lazyPage(adminPages, 'AdminListingsPage') },
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
