import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { AdminReasonRequest } from '@rental/shared';
import { Button, FormField, Modal, useToast } from '@/components/ui';
import { adminErrorMessage, reasonSchema, toReasonBody, type ReasonForm } from '@/features/admin/model';
import { toApiError } from '@/services/http/ApiError';

/**
 * Hộp thoại xác nhận mọi thao tác quản trị: backend bắt buộc `{ reason }` (1–500 ký tự) và ghi vào nhật ký.
 * Thành công hoặc bị từ chối do trạng thái đã đổi (409) thì đóng; chỉ lỗi dữ liệu (400) giữ hộp thoại để sửa.
 */
export function ReasonDialog({
  title,
  description,
  confirmLabel,
  success,
  danger,
  onSubmit,
  onClose,
}: {
  title: string;
  description?: string;
  confirmLabel: string;
  success: string;
  danger?: boolean;
  onSubmit: (body: AdminReasonRequest) => Promise<unknown>;
  onClose: () => void;
}) {
  const toast = useToast();
  const form = useForm<ReasonForm>({ resolver: zodResolver(reasonSchema), defaultValues: { reason: '' } });
  const busy = form.formState.isSubmitting;
  return (
    <Modal open title={title} description={description} onClose={onClose}>
      <form
        className="stack"
        noValidate
        onSubmit={form.handleSubmit(async (v) => {
          try {
            await onSubmit(toReasonBody(v));
            toast.success(success);
            onClose();
          } catch (err) {
            toast.error(adminErrorMessage(err));
            if (toApiError(err).status !== 400) onClose();
          }
        })}
      >
        <FormField label="Lý do" required error={form.formState.errors.reason?.message} hint="Tối đa 500 ký tự. Lý do được lưu trong nhật ký hoạt động.">
          <textarea className="textarea" maxLength={500} {...form.register('reason')} />
        </FormField>
        <div className="form-actions">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Hủy
          </Button>
          <Button type="submit" variant={danger ? 'danger' : 'dark'} loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
