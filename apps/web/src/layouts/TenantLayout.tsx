import { FileSignature, Home, Receipt, Send, Wrench } from 'lucide-react';
import { AppShell } from './AppShell';

export function TenantLayout() {
  return (
    <AppShell
      brandSubtitle="Cổng người thuê"
      userSubtitle="Người thuê"
      groups={[
        {
          title: 'Phòng của tôi',
          items: [
            { to: '/tenant', label: 'Tổng quan', icon: Home, end: true },
            { to: '/tenant/contracts', label: 'Hợp đồng', icon: FileSignature },
            { to: '/tenant/invoices', label: 'Hóa đơn', icon: Receipt },
            { to: '/tenant/payments/new', label: 'Gửi thanh toán', icon: Send },
            { to: '/tenant/maintenance', label: 'Bảo trì', icon: Wrench },
          ],
        },
      ]}
    />
  );
}
