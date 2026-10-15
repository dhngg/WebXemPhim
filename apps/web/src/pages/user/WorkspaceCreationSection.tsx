import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { Button, FormField, Section, useToast } from '@/components/ui';
import { useCapabilities } from '@/features/capabilities/hooks';
import {
  createWorkspaceSchema,
  creationErrorMessage,
  workspaceCreation,
  type CreateWorkspaceForm,
} from '@/features/workspaces/creation';
import { useCreateWorkspace } from '@/features/workspaces/hooks';
import { toApiError } from '@/services/http/ApiError';
import { LandlordApplicationCard } from './LandlordApplicationCard';

/** Form tạo workspace (`POST /workspaces`). Chỉ hiển thị khi luật của backend cho phép. */
function CreateWorkspaceForm() {
  const navigate = useNavigate();
  const toast = useToast();
  const create = useCreateWorkspace();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<CreateWorkspaceForm>({ resolver: zodResolver(createWorkspaceSchema), defaultValues: { name: '' } });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { membership, ready } = await create.mutateAsync(values.name);
      toast.success('Đã tạo workspace.');
      // Quyền đã được lấy lại: vào thẳng workspace mới. Nếu chưa thấy trong quyền, ở lại danh sách để làm mới.
      navigate(ready ? `/w/${membership.workspaceId}/dashboard` : '/workspaces/select', { replace: true });
    } catch (e) {
      const err = toApiError(e);
      if (err.fieldErrors?.name) setError('name', { message: err.fieldErrors.name });
      else setFormError(creationErrorMessage(err));
    }
  });

  return (
    <Section title="Tạo workspace">
      <form className="stack" onSubmit={onSubmit} noValidate>
        {formError && (
          <div className="alert alert--danger" role="alert">
            {formError}
          </div>
        )}
        <FormField label="Tên workspace" required error={errors.name?.message} hint="Ví dụ: tên nhà trọ hoặc thương hiệu của bạn (tối đa 100 ký tự).">
          <input className="input" maxLength={100} autoComplete="organization" {...register('name')} />
        </FormField>
        <div className="form-actions">
          <Button type="submit" variant="dark" loading={create.isPending}>
            <Plus size={16} aria-hidden="true" /> Tạo workspace
          </Button>
        </div>
      </form>
    </Section>
  );
}

/**
 * Phần "tạo workspace" của trang chọn workspace, theo quyền thật:
 *  - chưa nộp/chưa được duyệt → trạng thái + form đăng ký chủ trọ (không cho tạo);
 *  - đơn APPROVED chưa có workspace, hoặc từng là chủ trọ và còn trong giới hạn → form tạo;
 *  - đã đạt giới hạn → giải thích, không hiện form.
 */
export function WorkspaceCreationSection() {
  // Cùng query quyền với danh sách workspace ở trang chọn (route này đã yêu cầu đăng nhập).
  const { data: capabilities } = useCapabilities(true);
  const state = workspaceCreation(capabilities);

  switch (state.kind) {
    case 'ALLOWED':
      return (
        <div className="stack">
          {state.viaApplication && <LandlordApplicationCard />}
          <CreateWorkspaceForm />
        </div>
      );
    case 'LIMIT_ACTIVE':
      return (
        <p className="text-sm muted" role="note">
          Mỗi chủ trọ chỉ có một workspace đang hoạt động. Muốn tạo workspace mới, hãy lưu trữ workspace hiện tại ở thẻ workspace phía trên (dữ liệu được giữ nguyên, có thể khôi phục sau).
        </p>
      );
    case 'LIMIT_TOTAL':
      return (
        <p className="text-sm muted" role="note">
          Bạn đã sở hữu số workspace tối đa (2), không thể tạo thêm.
        </p>
      );
    default:
      // NEEDS_APPLICATION / APPLICATION_PENDING / APPLICATION_REJECTED
      return <LandlordApplicationCard />;
  }
}
