import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { VIEWING_REQUEST_STATUSES, type ViewingRequestResponse, type ViewingRequestStatus } from '@rental/shared';
import {
  Button,
  DataTable,
  EmptyState,
  FormField,
  Modal,
  PageHeader,
  Pagination,
  Section,
  StatusBadge,
  Tabs,
  useToast,
  type Column,
} from '@/components/ui';
import { VIEWING_STATUS } from '@/features/viewings/labels';
import { useDecideViewing, useWorkspaceViewingRequests } from '@/features/viewings/owner-hooks';
import { PAGE_SIZE, canDecideViewing, decisionSchema, isViewingStatus, ownerViewingErrorMessage, toDecisionBody, type DecisionForm } from '@/features/viewings/owner-model';
import { useWorkspaceContext } from '@/hooks/useWorkspaceContext';
import { useSearchState } from '@/hooks/useSearchState';
import { formatDateTime } from '@/lib/format';
import { toApiError } from '@/services/http/ApiError';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

type Tab = ViewingRequestStatus | 'ALL';

/** VIEW-01 — yêu cầu xem phòng gửi tới workspace: OWNER xác nhận hoặc từ chối yêu cầu đang chờ (ghi chú tùy chọn). */
export function ViewingRequestsPage() {
  const { ws, membership } = useWorkspaceContext();
  const writable = membership.status !== 'ARCHIVED';
  const [s, set] = useSearchState(['status', 'page'] as const);
  const tab: Tab = s.status === 'ALL' ? 'ALL' : isViewingStatus(s.status) ? s.status : 'PENDING';
  const page = Math.max(1, Number(s.page) || 1);
  const list = useWorkspaceViewingRequests(ws, { status: tab === 'ALL' ? undefined : tab, page, limit: PAGE_SIZE });
  const [deciding, setDeciding] = useState<{ request: ViewingRequestResponse; confirm: boolean } | null>(null);

  const columns: Column<ViewingRequestResponse>[] = [
    {
      key: 'time',
      header: 'Giờ hẹn',
      render: (v) => (
        <span className="row">
          <CalendarClock size={14} aria-hidden="true" /> {formatDateTime(v.scheduledAt)}
        </span>
      ),
    },
    {
      key: 'who',
      header: 'Người xem',
      render: (v) => (
        <>
          <p className="cell-title">{v.requester.displayName ?? v.requester.email}</p>
          <p className="cell-sub">{v.requester.email}</p>
        </>
      ),
    },
    { key: 'room', header: 'Phòng', render: (v) => `${v.room.code} (${v.room.buildingName})` },
    { key: 'msg', header: 'Lời nhắn', render: (v) => v.message ?? '—' },
    { key: 'st', header: 'Trạng thái', render: (v) => <StatusBadge status={v.status} map={VIEWING_STATUS} /> },
    {
      key: 'note',
      header: 'Phản hồi',
      render: (v) =>
        v.decidedAt || v.decisionNote ? (
          <>
            <p>{v.decisionNote ?? '—'}</p>
            {v.decidedAt && <p className="cell-sub">{formatDateTime(v.decidedAt)}</p>}
          </>
        ) : v.cancelledAt ? (
          <span className="cell-sub">Người xem hủy lúc {formatDateTime(v.cancelledAt)}</span>
        ) : (
          '—'
        ),
    },
    {
      key: 'act',
      header: 'Thao tác',
      render: (v) =>
        writable &&
        canDecideViewing(v) && (
          <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Button size="sm" variant="dark" onClick={() => setDeciding({ request: v, confirm: true })}>
              Xác nhận
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setDeciding({ request: v, confirm: false })}>
              Từ chối
            </Button>
          </div>
        ),
    },
  ];

  return (
    <>
      <PageHeader title="Yêu cầu xem phòng" description="Xác nhận hoặc từ chối yêu cầu xem phòng gửi từ trang Tìm phòng. Người xem sẽ thấy kết quả và ghi chú của bạn." />
      <Tabs
        label="Trạng thái yêu cầu xem phòng"
        value={tab}
        onChange={(key) => set({ status: key === 'PENDING' ? '' : key, page: '' })}
        tabs={[
          ...VIEWING_REQUEST_STATUSES.map((st) => ({ key: st as Tab, label: VIEWING_STATUS[st].label })),
          { key: 'ALL' as Tab, label: 'Tất cả' },
        ]}
      />
      <Section flush>
        <DataTable
          columns={columns}
          rows={list.data?.items}
          rowKey={(v) => v.id}
          isLoading={list.isLoading}
          error={list.error}
          onRetry={() => list.refetch()}
          empty={<EmptyState icon={<CalendarClock size={26} />} title="Không có yêu cầu ở trạng thái này" />}
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onChange={(p) => set({ page: String(p) }, { resetPage: false })} />
      </Section>
      {deciding && <DecisionModal ws={ws} request={deciding.request} confirm={deciding.confirm} onClose={() => setDeciding(null)} />}
    </>
  );
}

function DecisionModal({ ws, request, confirm, onClose }: { ws: string; request: ViewingRequestResponse; confirm: boolean; onClose: () => void }) {
  const actions = useDecideViewing(ws);
  const toast = useToast();
  const form = useForm<DecisionForm>({ resolver: zodResolver(decisionSchema), defaultValues: { note: '' } });
  const mutation = confirm ? actions.confirm : actions.reject;
  const who = request.requester.displayName ?? request.requester.email;
  return (
    <Modal
      open
      title={confirm ? `Xác nhận lịch xem của ${who}?` : `Từ chối lịch xem của ${who}?`}
      description={confirm ? 'Chỉ xác nhận được khi giờ hẹn còn ở tương lai và tin còn đủ điều kiện.' : 'Người xem sẽ thấy yêu cầu bị từ chối cùng ghi chú của bạn (nếu có).'}
      onClose={onClose}
    >
      <form
        className="stack"
        noValidate
        onSubmit={form.handleSubmit(async (v) => {
          try {
            await mutation.mutateAsync({ id: request.id, body: toDecisionBody(v) });
            toast.success(confirm ? 'Đã xác nhận lịch xem.' : 'Đã từ chối yêu cầu.');
            onClose();
          } catch (err) {
            toast.error(ownerViewingErrorMessage(err));
            if (toApiError(err).status !== 400) onClose();
          }
        })}
      >
        <FormField label="Ghi chú cho người xem" error={form.formState.errors.note?.message} hint="Không bắt buộc, tối đa 1000 ký tự.">
          <textarea className="textarea" maxLength={1000} {...form.register('note')} />
        </FormField>
        <div className="form-actions">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" variant="dark" loading={mutation.isPending}>
            {confirm ? 'Xác nhận lịch xem' : 'Từ chối yêu cầu'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
