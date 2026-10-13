import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Wrench } from 'lucide-react';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  FilterBar,
  FormField,
  KeyValueList,
  LoadingBlock,
  PageHeader,
  SearchInput,
  Section,
  Select,
  StatCard,
  StatusBadge,
  useToast,
  type Column,
} from '@/components/ui';
import { BarChart } from '@/components/charts/BarChart';
import {
  MAINTENANCE_PRIORITY,
  MAINTENANCE_STATUS,
  useCommentMaintenance,
  useMaintenance,
  useMaintenanceList,
  useUpdateMaintenance,
} from '@/features/maintenance/api';
import type { MaintenancePriority, MaintenanceRequest, MaintenanceStatus } from '@/features/maintenance/types';
import { useWorkspaceReport } from '@/features/reports/api';
import { useWorkspaceContext } from '@/hooks/useWorkspaceContext';
import { useSearchState } from '@/hooks/useSearchState';
import { addMonths, currentPeriod, periodLabel } from '@/lib/dates';
import { formatDateTime, formatPercent, formatVnd, formatVndShort } from '@/lib/format';
import { toApiError } from '@/services/http/ApiError';

// ===================================================================== Maintenance
/** MNT-01 */
export function MaintenancePage() {
  const { ws, base } = useWorkspaceContext();
  const [s, set] = useSearchState(['q', 'status', 'priority'] as const);
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useMaintenanceList(ws, {
    q: s.q || undefined,
    status: (s.status || undefined) as MaintenanceStatus | undefined,
    priority: (s.priority || undefined) as MaintenancePriority | undefined,
  });

  const columns: Column<MaintenanceRequest>[] = [
    {
      key: 't',
      header: 'Yêu cầu',
      render: (m) => (
        <>
          <Link to={`${base}/maintenance/${m.id}`} className="cell-title">
            {m.title}
          </Link>
          <p className="cell-sub">
            {m.roomCode} • {m.buildingName} {m.tenantName ? `• ${m.tenantName}` : ''}
          </p>
        </>
      ),
    },
    { key: 'p', header: 'Mức độ', render: (m) => <StatusBadge status={m.priority} map={MAINTENANCE_PRIORITY} /> },
    { key: 'a', header: 'Phân công', render: (m) => m.assignee ?? <span className="muted">Chưa phân công</span> },
    { key: 'c', header: 'Tạo lúc', render: (m) => formatDateTime(m.createdAt) },
    { key: 's', header: 'Trạng thái', render: (m) => <StatusBadge status={m.status} map={MAINTENANCE_STATUS} /> },
  ];

  return (
    <>
      <PageHeader title="Yêu cầu bảo trì" description="Tiếp nhận từ người thuê hoặc nhân viên. Trạng thái: Mới tiếp nhận → Đang xử lý → Đã xử lý." />
      <Section flush>
        <FilterBar>
          <SearchInput value={s.q} onChange={(q) => set({ q })} placeholder="Tiêu đề, phòng, người thuê…" />
          <Select aria-label="Trạng thái" value={s.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">Mọi trạng thái</option>
            {(Object.keys(MAINTENANCE_STATUS) as MaintenanceStatus[]).map((k) => (
              <option key={k} value={k}>
                {MAINTENANCE_STATUS[k].label}
              </option>
            ))}
          </Select>
          <Select aria-label="Mức độ" value={s.priority} onChange={(e) => set({ priority: e.target.value })}>
            <option value="">Mọi mức độ</option>
            {(Object.keys(MAINTENANCE_PRIORITY) as MaintenancePriority[]).map((k) => (
              <option key={k} value={k}>
                {MAINTENANCE_PRIORITY[k].label}
              </option>
            ))}
          </Select>
        </FilterBar>
        <DataTable
          columns={columns}
          rows={data}
          rowKey={(m) => m.id}
          isLoading={isLoading}
          error={error}
          onRetry={() => refetch()}
          onRowClick={(m) => navigate(`${base}/maintenance/${m.id}`)}
          empty={<EmptyState icon={<Wrench size={26} />} title="Không có yêu cầu bảo trì" />}
        />
      </Section>
    </>
  );
}

/** MNT-02 */
export function MaintenanceDetailPage() {
  const { ws, base } = useWorkspaceContext();
  const { id } = useParams();
  const { data: m, isLoading, error, refetch } = useMaintenance(ws, id);
  const update = useUpdateMaintenance(ws);
  const comment = useCommentMaintenance(ws);
  const toast = useToast();
  const [text, setText] = useState('');
  const [assignee, setAssignee] = useState<string | null>(null);

  if (isLoading) return <LoadingBlock lines={6} />;
  if (error || !m) return <ErrorState error={error} onRetry={() => refetch()} />;

  const changeStatus = (status: MaintenanceStatus) =>
    update.mutate({ id: m.id, status }, { onSuccess: () => toast.success('Đã cập nhật trạng thái.'), onError: (e) => toast.error(toApiError(e).message) });

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Bảo trì', to: `${base}/maintenance` }, { label: m.title }]}
        title={m.title}
        description={`${m.roomCode} • ${m.buildingName}${m.tenantName ? ` • ${m.tenantName}` : ''}`}
        eyebrow={
          <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
            <StatusBadge status={m.status} map={MAINTENANCE_STATUS} />
            <StatusBadge status={m.priority} map={MAINTENANCE_PRIORITY} />
          </div>
        }
        actions={
          <>
            {m.status === 'OPEN' && (
              <Button variant="dark" onClick={() => changeStatus('IN_PROGRESS')} loading={update.isPending}>
                Bắt đầu xử lý
              </Button>
            )}
            {m.status === 'IN_PROGRESS' && (
              <Button variant="dark" onClick={() => changeStatus('RESOLVED')} loading={update.isPending}>
                Đánh dấu đã xử lý
              </Button>
            )}
            {m.status === 'RESOLVED' && (
              <Button variant="secondary" onClick={() => changeStatus('IN_PROGRESS')} loading={update.isPending}>
                Mở lại
              </Button>
            )}
          </>
        }
      />
      <div className="grid grid--main-side">
        <Section title="Trao đổi">
          <div className="stack" style={{ gap: 'var(--space-3)' }}>
            {m.comments.map((c) => (
              <div key={c.id} className={c.role === 'STAFF' ? 'comment comment--staff' : 'comment'}>
                <p className="comment__meta">
                  <strong>{c.author}</strong> ({c.role === 'STAFF' ? 'Quản lý' : 'Người thuê'}) • {formatDateTime(c.at)}
                </p>
                <p>{c.text}</p>
              </div>
            ))}
          </div>
          <form
            className="stack"
            style={{ marginTop: 'var(--space-4)' }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim()) return;
              comment.mutate({ id: m.id, text }, { onSuccess: () => setText(''), onError: (er) => toast.error(toApiError(er).message) });
            }}
          >
            <FormField label="Phản hồi">
              <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder="Nhập nội dung trao đổi với người thuê…" />
            </FormField>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <Button type="submit" variant="dark" disabled={!text.trim()} loading={comment.isPending}>
                Gửi
              </Button>
            </div>
          </form>
        </Section>
        <div className="stack">
          <Section title="Thông tin">
            <KeyValueList
              items={[
                { label: 'Phòng', value: m.roomCode },
                { label: 'Tạo lúc', value: formatDateTime(m.createdAt) },
                { label: 'Cập nhật', value: formatDateTime(m.updatedAt) },
              ]}
            />
            <p className="text-sm" style={{ marginTop: 'var(--space-3)' }}>
              {m.description}
            </p>
            {m.images.length > 0 && (
              <div className="uploader" style={{ marginTop: 'var(--space-3)' }}>
                {m.images.map((src) => (
                  <div key={src} className="uploader__item">
                    <img src={src} alt="Ảnh sự cố" />
                  </div>
                ))}
              </div>
            )}
          </Section>
          <Section title="Phân công">
            <div className="stack">
              <FormField label="Người / đơn vị xử lý">
                <input className="input" value={assignee ?? m.assignee ?? ''} onChange={(e) => setAssignee(e.target.value)} placeholder="VD: Thợ điện Minh" />
              </FormField>
              <Button
                variant="secondary"
                disabled={assignee === null || assignee === (m.assignee ?? '')}
                loading={update.isPending}
                onClick={() =>
                  update.mutate(
                    { id: m.id, assignee: assignee ?? '' },
                    {
                      onSuccess: () => {
                        toast.success('Đã cập nhật phân công.');
                        setAssignee(null);
                      },
                    },
                  )
                }
              >
                Lưu phân công
              </Button>
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}

// ===================================================================== Reports
/** RPT-01 */
export function ReportsPage() {
  const { ws } = useWorkspaceContext();
  const [s, set] = useSearchState(['from', 'to'] as const);
  const to = s.to || currentPeriod();
  const from = s.from || addMonths(to, -5);
  const { data, isLoading, error, refetch } = useWorkspaceReport(ws, from, to);
  const options = Array.from({ length: 18 }, (_, i) => addMonths(currentPeriod(), -i));

  const sum = (k: 'expected' | 'confirmed' | 'outstanding') => (data?.rows ?? []).reduce((x, r) => x + r[k], 0);
  const avgOcc = data?.rows.length ? data.rows.reduce((x, r) => x + r.occupancyRate, 0) / data.rows.length : 0;

  return (
    <>
      <PageHeader
        title="Báo cáo"
        description="Doanh thu chỉ tính khoản đã xác nhận. Tiền cọc báo cáo riêng, không cộng vào doanh thu."
        actions={
          <div className="row">
            <Select aria-label="Từ kỳ" value={from} onChange={(e) => set({ from: e.target.value })}>
              {options.map((p) => (
                <option key={p} value={p}>
                  Từ {periodLabel(p)}
                </option>
              ))}
            </Select>
            <Select aria-label="Đến kỳ" value={to} onChange={(e) => set({ to: e.target.value })}>
              {options.map((p) => (
                <option key={p} value={p}>
                  Đến {periodLabel(p)}
                </option>
              ))}
            </Select>
          </div>
        }
      />
      {isLoading ? (
        <LoadingBlock lines={8} />
      ) : error || !data ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <>
          <div className="grid grid--4" style={{ marginBottom: 'var(--space-4)' }}>
            <StatCard label="Doanh thu đã xác nhận" value={formatVnd(sum('confirmed'))} tone="primary" />
            <StatCard label="Tổng phải thu" value={formatVnd(sum('expected'))} />
            <StatCard label="Công nợ còn lại" value={formatVnd(sum('outstanding'))} tone="danger" />
            <StatCard label="Lấp đầy trung bình" value={formatPercent(avgOcc)} tone="success" footer={`${data.totalRooms} phòng`} />
          </div>
          <div className="dash-grid">
            <Section title="Doanh thu theo kỳ">
              <BarChart
                title="Doanh thu theo kỳ"
                data={data.rows.map((r) => ({ label: periodLabel(r.period), values: { expected: r.expected, confirmed: r.confirmed } }))}
                series={[
                  { key: 'expected', label: 'Phải thu', color: 'var(--chart-reference)' },
                  { key: 'confirmed', label: 'Đã xác nhận', color: 'var(--chart-1)' },
                ]}
                format={formatVnd}
                formatAxis={formatVndShort}
              />
            </Section>
            <Section title="Tiền cọc (theo dõi riêng)">
              <p style={{ fontSize: 'var(--text-2xl)', fontWeight: 800 }}>{formatVnd(data.depositHeld)}</p>
              <p className="text-xs muted">Đang giữ tại thời điểm hiện tại</p>
              <KeyValueList
                items={[
                  { label: 'Thu cọc trong kỳ chọn', value: formatVnd(data.rows.reduce((x, r) => x + r.depositsIn, 0)) },
                  { label: 'Hoàn/khấu trừ trong kỳ chọn', value: formatVnd(data.rows.reduce((x, r) => x + r.depositsOut, 0)) },
                ]}
              />
            </Section>
          </div>
          <Section title="Chi tiết theo kỳ" flush>
            <DataTable
              rows={data.rows}
              rowKey={(r) => r.period}
              empty={<EmptyState title="Không có dữ liệu trong khoảng thời gian" />}
              columns={[
                { key: 'p', header: 'Kỳ', render: (r) => <strong>{periodLabel(r.period)}</strong> },
                { key: 'e', header: 'Phải thu', align: 'right', render: (r) => formatVnd(r.expected) },
                { key: 'c', header: 'Đã xác nhận', align: 'right', render: (r) => formatVnd(r.confirmed) },
                { key: 'o', header: 'Công nợ', align: 'right', render: (r) => (r.outstanding ? <span className="danger-text">{formatVnd(r.outstanding)}</span> : '—') },
                { key: 'occ', header: 'Lấp đầy', align: 'right', render: (r) => formatPercent(r.occupancyRate) },
                { key: 'd', header: 'Cọc vào / ra', align: 'right', render: (r) => <span className="cell-sub">+{formatVndShort(r.depositsIn)} / −{formatVndShort(r.depositsOut)}</span> },
              ]}
            />
          </Section>
          <p className="text-xs muted" style={{ marginTop: 'var(--space-3)' }}>
            <Badge tone="mock">Mock</Badge> Xuất Excel/PDF chưa hỗ trợ — chờ backend cung cấp endpoint báo cáo.
          </p>
        </>
      )}
    </>
  );
}
