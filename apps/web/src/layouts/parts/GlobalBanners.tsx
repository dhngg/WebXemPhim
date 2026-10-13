import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { SESSION_EXPIRED_EVENT } from '@/app/queryClient';
import { ConfirmDialog } from '@/components/ui';
import { authKeys } from '@/features/auth/hooks';
import { env } from '@/lib/env';

/** Banner mất mạng + hộp thoại hết phiên + nhãn đang chạy mock. Gắn một lần ở root. */
export function GlobalBanners() {
  const online = useOnlineStatus();
  const [expired, setExpired] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();

  useEffect(() => {
    const onExpired = () => setExpired(true);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  return (
    <>
      {env.useMockApi && (
        <div className="mock-banner" role="note">
          Chế độ demo: dữ liệu giả lập (mock), chưa kết nối backend. Thanh toán / thông báo / bản đồ chưa hoạt động thật.
        </div>
      )}
      {!online && (
        <div className="offline-banner" role="alert">
          Bạn đang offline. Một số dữ liệu có thể chưa được cập nhật.
        </div>
      )}
      <ConfirmDialog
        open={expired}
        title="Phiên đăng nhập đã hết hạn"
        description="Vui lòng đăng nhập lại để tiếp tục thao tác."
        confirmLabel="Đăng nhập lại"
        cancelLabel="Để sau"
        onCancel={() => setExpired(false)}
        onConfirm={() => {
          setExpired(false);
          qc.setQueryData(authKeys.me, null);
          navigate(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`);
        }}
      />
    </>
  );
}
