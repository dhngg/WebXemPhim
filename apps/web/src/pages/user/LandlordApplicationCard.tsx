import { useState } from 'react';
import { Building2 } from 'lucide-react';
import { Badge, Button, FormField, Section, useToast } from '@/components/ui';
import { useCapabilities } from '@/features/capabilities/hooks';
import { useSubmitLandlordApplication } from '@/features/landlord-application/api';
import { formatDate } from '@/lib/format';
import { toApiError } from '@/services/http/ApiError';

/**
 * User chưa là thành viên workspace nào: hiển thị trạng thái đơn đăng ký chủ trọ thật từ backend
 * (`capabilities.landlordApplication`) và cho gửi đơn mới (`POST /landlord-applications/me`).
 * Quản trị viên duyệt/từ chối ở khu Quản trị. Được duyệt chỉ mở quyền TẠO workspace đầu tiên; quyền chủ trọ (OWNER) chỉ có sau khi tạo workspace.
 */
export function LandlordApplicationCard() {
  const { data: capabilities } = useCapabilities(true);
  const application = capabilities?.landlordApplication ?? null;
  const submit = useSubmitLandlordApplication();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Đang chờ duyệt hoặc đã được duyệt thì không nộp thêm đơn (đơn đã duyệt dùng để tạo workspace).
  const canApply = application?.status !== 'PENDING' && application?.status !== 'APPROVED';
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!reason.trim()) return setError('Vui lòng cho biết lý do/quy mô nhà trọ bạn muốn quản lý.');
    try {
      await submit.mutateAsync(reason);
      setReason('');
      toast.success('Đã gửi đơn đăng ký làm chủ trọ.');
    } catch (err) {
      setError(toApiError(err).message);
    }
  };

  return (
    <Section title="Đăng ký làm chủ trọ">
      <div className="stack">
        <p className="text-sm muted">
          <Building2 size={16} aria-hidden="true" /> Bạn chưa là chủ trọ của workspace nào. Gửi đơn đăng ký; khi quản trị viên duyệt, bạn được phép tạo
          workspace đầu tiên của mình và trở thành chủ trọ (OWNER) của workspace đó.
        </p>

        {application && (
          <div className="alert" role="status">
            <div className="stack" style={{ gap: 4 }}>
              <div className="row" style={{ gap: 8 }}>
                <strong>Đơn gần nhất</strong>
                {application.status === 'PENDING' && <Badge tone="warning">Đang chờ duyệt</Badge>}
                {application.status === 'APPROVED' && <Badge tone="success">Đã được duyệt</Badge>}
                {application.status === 'REJECTED' && <Badge tone="danger">Bị từ chối</Badge>}
                <span className="text-sm muted">gửi ngày {formatDate(application.createdAt)}</span>
              </div>
              <p className="text-sm">“{application.reason}”</p>
              {application.status === 'PENDING' && (
                <p className="text-sm muted">Quản trị viên sẽ xem xét. Khi được duyệt, bạn tạo workspace đầu tiên ngay trên trang này; hệ thống không tự tạo workspace.</p>
              )}
              {application.status === 'APPROVED' && (
                <p className="text-sm">
                  Đơn đã được duyệt{application.decidedAt ? ` ngày ${formatDate(application.decidedAt)}` : ''}. Bạn đã có quyền tạo workspace đầu
                  tiên; hãy tạo ở mục bên dưới để trở thành chủ trọ (OWNER).
                </p>
              )}
              {application.status === 'REJECTED' && application.decisionNote && (
                <p className="text-sm">Lý do: {application.decisionNote}</p>
              )}
            </div>
          </div>
        )}

        {canApply ? (
          <form className="stack" onSubmit={onSubmit} noValidate>
            <FormField label="Lý do / quy mô nhà trọ" required error={error ?? undefined} hint="Tối đa 1000 ký tự.">
              <textarea className="input" rows={4} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
            </FormField>
            <div className="form-actions">
              <Button type="submit" variant="dark" loading={submit.isPending}>
                Gửi đơn đăng ký
              </Button>
            </div>
          </form>
        ) : (
          application?.status === 'PENDING' && (
            <p className="text-sm muted">Bạn không thể gửi đơn mới khi còn một đơn đang chờ duyệt.</p>
          )
        )}
      </div>
    </Section>
  );
}
