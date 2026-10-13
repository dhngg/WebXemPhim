import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckCircle2,
  DoorOpen,
  Gauge,
  Plus,
  Receipt,
  TrendingUp,
  Wallet,
  Wrench,
  CircleDollarSign,
} from 'lucide-react';
import { Badge, ButtonLink, EmptyState, ErrorState, LoadingBlock, ProgressBar, Section, StatCard, StatusBadge, DataTable, type Column } from '@/components/ui';
import { BarChart } from '@/components/charts/BarChart';
import { DonutChart } from '@/components/charts/DonutChart';
import { useWorkspaceDashboard } from '@/features/dashboard/api';
import type { DueInvoice } from '@/features/dashboard/types';
import { MAINTENANCE_PRIORITY } from '@/features/maintenance/api';
import { useWorkspaceContext } from '@/hooks/useWorkspaceContext';
import { formatDate, formatDateTime, formatPercent, formatVnd, formatVndShort } from '@/lib/format';

const DUE_STATUS = {
  OVERDUE: { label: 'Quá hạn', tone: 'danger' as const },
  AWAITING_TRANSFER: { label: 'Chờ chuyển khoản', tone: 'warning' as const },
};

/** WSP-01 — theo ảnh UI demo 1. Số liệu tính từ mock DB (kỳ hiện tại). */
export function DashboardPage() {
  const { ws, base, can } = useWorkspaceContext();
  const { data, isLoading, error, refetch } = useWorkspaceDashboard(ws);

  if (isLoading) return <LoadingBlock lines={8} />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;

  const k = data.kpis;
  const occupancy = k.totalRooms ? k.occupiedRooms / k.totalRooms : 0;
  const collectRatio = k.expectedRevenue ? k.confirmedRevenue / k.expectedRevenue : 0;
  const serviceTotal = data.services.reduce((s, x) => s + x.amount, 0);
  const SERVICE_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)'];

  const dueColumns: Column<DueInvoice>[] = [
    {
      key: 'room',
      header: 'Phòng',
      render: (r) => (
        <>
          <p className="cell-title">{r.roomCode}</p>
          <p className="cell-sub">
            {r.buildingName} • {r.contractCode}
          </p>
        </>
      ),
    },
    {
      key: 'tenant',
      header: 'Người thuê',
      render: (r) => (
        <>
          <p className="cell-title">{r.tenantName}</p>
          <p className="cell-sub">{r.tenantPhone}</p>
        </>
      ),
    },
    {
      key: 'amount',
      header: 'Số tiền',
      align: 'right',
      render: (r) => <strong className={r.status === 'OVERDUE' ? 'danger-text' : undefined}>{formatVnd(r.amountDue)}</strong>,
    },
    { key: 'due', header: 'Hạn nộp', render: (r) => formatDate(r.dueDate) },
    {
      key: 'status',
      header: 'Trạng thái',
      render: (r) => (
        <Badge tone={DUE_STATUS[r.status].tone}>
          {DUE_STATUS[r.status].label}
          {r.overdueDays ? ` ${r.overdueDays} ngày` : ''}
        </Badge>
      ),
    },
    {
      key: 'act',
      header: 'Thao tác',
      render: (r) => (
        <div className="row">
          <ButtonLink to={`${base}/invoices/${r.id}`} size="sm" variant="secondary">
            Chi tiết
          </ButtonLink>
          {can('payments.confirm') && (
            <ButtonLink to={`${base}/payments?invoice=${r.id}`} size="sm" variant="dark">
              Thu tiền
            </ButtonLink>
          )}
        </div>
      ),
    },
  ];

  const buildings = [...new Set(data.occupancy.map((o) => o.buildingName))];

  return (
    <>
      <div className="ws-hero">
        <div>
          <div className="ws-hero__meta">
            <Badge tone="primary">WORKSPACE VẬN HÀNH</Badge>
            <span className="row">
              <span className="sync-dot" aria-hidden="true" /> Đồng bộ thời gian thực: Kỳ đối soát {k.period}
            </span>
          </div>
          <h1>{data.workspaceName}</h1>
          <p className="muted text-sm" style={{ marginTop: 'var(--space-2)' }}>
            <Badge tone="neutral" icon={<Building2 size={12} />}>
              {k.buildingCount} Tòa • {k.totalRooms} Phòng
            </Badge>{' '}
            {data.description}
          </p>
        </div>
        <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <ButtonLink to={`${base}/meters`} variant="secondary">
            <Gauge size={16} aria-hidden="true" /> Ghi điện nước
          </ButtonLink>
          {can('billing.run') && (
            <ButtonLink to={`${base}/billing/run`} variant="secondary">
              <Receipt size={16} aria-hidden="true" /> Lập HĐ tháng
            </ButtonLink>
          )}
          {can('rooms.write') && (
            <ButtonLink to={`${base}/rooms/new`} variant="dark">
              <Plus size={16} aria-hidden="true" /> Thêm phòng mới
            </ButtonLink>
          )}
        </div>
      </div>

      <div className="kpi-grid">
        <StatCard label="Tổng quy mô" value={k.totalRooms} unit="phòng" icon={<Building2 size={16} />} footer={`Quy mô: ${k.buildingCount} tòa nhà`} />
        <StatCard
          label="Đang thuê"
          value={k.occupiedRooms}
          unit={formatPercent(occupancy)}
          tone="success"
          icon={<CheckCircle2 size={16} />}
          footer={
            <span className="row" style={{ color: 'var(--color-success)' }}>
              <TrendingUp size={12} aria-hidden="true" /> {k.occupancyChangePct >= 0 ? '+' : ''}
              {k.occupancyChangePct.toFixed(1).replace('.', ',')}% so với tháng trước
            </span>
          }
        />
        <StatCard
          label="Phòng trống"
          value={k.vacantRooms}
          unit="phòng"
          tone="primary"
          icon={<DoorOpen size={16} />}
          footer={<Link to={`${base}/rooms?operationalStatus=VACANT`}>Sẵn sàng đón khách →</Link>}
        />
        <StatCard label="Dự kiến thu" value={formatVnd(k.expectedRevenue)} icon={<CircleDollarSign size={16} />} footer="Tính gộp điện nước & dịch vụ" />
        <StatCard
          label="Đã thu thực tế"
          value={formatVnd(k.confirmedRevenue)}
          tone="primary"
          icon={<Wallet size={16} />}
          footer={
            <div className="stack" style={{ gap: 4 }}>
              <ProgressBar value={collectRatio} label="Tỉ lệ đã thu" />
              <span>{formatPercent(collectRatio)} • chỉ tính khoản đã xác nhận</span>
            </div>
          }
        />
        <StatCard
          label="Công nợ tồn đọng"
          value={formatVnd(k.outstandingDebt)}
          tone="danger"
          icon={<AlertTriangle size={16} />}
          footer={<span className="danger-text">{k.unpaidRoomCount} phòng chưa nộp đủ</span>}
        />
      </div>

      <div className="dash-grid">
        <Section title="Hiệu quả thu tiền 6 tháng gần nhất" subtitle="Tổng phải thu so với số tiền đã được xác nhận thu theo từng kỳ">
          <BarChart
            title="Hiệu quả thu tiền 6 tháng gần nhất"
            data={data.revenue.map((r) => ({
              label: r.isCurrent ? `${r.label} (hiện tại)` : r.label,
              values: { expected: r.expected, confirmed: r.confirmed },
              highlight: r.isCurrent,
            }))}
            series={[
              { key: 'expected', label: 'Dự kiến thu', color: 'var(--chart-reference)' },
              { key: 'confirmed', label: 'Đã thu (xác nhận)', color: 'var(--chart-1)' },
            ]}
            format={formatVnd}
            formatAxis={formatVndShort}
          />
        </Section>
        <Section title="Cơ cấu dịch vụ" subtitle="Tỷ lệ phụ thu tiện ích trong hóa đơn kỳ hiện tại" actions={<Badge>{k.period}</Badge>}>
          {serviceTotal === 0 ? (
            <EmptyState title="Chưa có hóa đơn kỳ này" />
          ) : (
            <DonutChart
              title="Cơ cấu dịch vụ"
              centerValue={formatVndShort(serviceTotal)}
              centerLabel="Tiện ích"
              format={formatVnd}
              slices={data.services.map((s, i) => ({ key: s.key, label: s.label, note: s.unitNote, value: s.amount, color: SERVICE_COLORS[i]! }))}
            />
          )}
        </Section>
      </div>

      <div className="dash-grid">
        <Section
          title="Hóa đơn cần thu & quá hạn"
          subtitle={`${data.dueInvoiceTotalCount} hóa đơn còn công nợ`}
          actions={<Link to={`${base}/invoices?status=OVERDUE`} className="text-sm">Xem tất cả hóa đơn →</Link>}
          flush
        >
          <DataTable
            columns={dueColumns}
            rows={data.dueInvoices}
            rowKey={(r) => r.id}
            empty={<EmptyState title="Không còn công nợ" description="Tất cả hóa đơn đã được thanh toán đủ." />}
          />
          <p className="text-xs muted" style={{ padding: 'var(--space-3) var(--space-5)' }}>
            Hiển thị {data.dueInvoices.length} trên {data.dueInvoiceTotalCount} hóa đơn chưa hoàn tất. Gửi nhắc nợ hàng loạt (Zalo OA) — chưa tích hợp.
          </p>
        </Section>
        <div className="stack">
          <Section
            title={
              <span className="row">
                <CalendarClock size={18} aria-hidden="true" /> Lịch xem phòng
              </span>
            }
            actions={<Badge tone="primary">{data.viewings.length} lịch hẹn</Badge>}
          >
            {data.viewings.length === 0 ? (
              <EmptyState title="Không có lịch hẹn sắp tới" />
            ) : (
              <div className="stack" style={{ gap: 'var(--space-2)' }}>
                {data.viewings.map((v) => (
                  <div key={v.id} className="mini-card">
                    <div className="mini-card__head">
                      <div>
                        <p className="cell-title">{v.visitorName}</p>
                        <p className="cell-sub">
                          {v.visitorPhone} • Xem {v.roomCode} ({v.buildingName})
                        </p>
                      </div>
                      <Badge tone="info">{v.timeLabel}</Badge>
                    </div>
                    <div className="mini-card__actions">
                      <ButtonLink to={`${base}/viewings`} size="sm" variant={v.status === 'PENDING' ? 'dark' : 'secondary'}>
                        {v.status === 'PENDING' ? 'Xác nhận lịch' : 'Đã xác nhận'}
                      </ButtonLink>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
          <Section
            title={
              <span className="row">
                <Wrench size={18} aria-hidden="true" /> Yêu cầu sửa chữa
              </span>
            }
            actions={<Badge tone="danger">{data.maintenance.length} cần xử lý</Badge>}
          >
            {data.maintenance.length === 0 ? (
              <EmptyState title="Không có yêu cầu tồn đọng" />
            ) : (
              <div className="stack" style={{ gap: 'var(--space-2)' }}>
                {data.maintenance.map((m) => (
                  <Link key={m.id} to={`${base}/maintenance/${m.id}`} className="mini-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div className="mini-card__head">
                      <p className="cell-title">{m.title}</p>
                      <StatusBadge status={m.priority} map={MAINTENANCE_PRIORITY} />
                    </div>
                    <p className="cell-sub">
                      {m.roomCode} • Người thuê: {m.tenantName}
                    </p>
                    <p className="cell-sub">{m.note}</p>
                  </Link>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>

      <Section
        title={`Hiện trạng sử dụng ${buildings.length} tòa nhà`}
        subtitle="Nhấp vào từng phòng để mở nhanh hồ sơ phòng, hợp đồng, chỉ số."
        actions={
          <div className="occ-legend">
            <span>
              <span className="chart__swatch" style={{ background: 'var(--color-success-soft)', border: '1px solid var(--color-success)' }} /> Đã có người ở (
              {k.occupiedRooms})
            </span>
            <span>
              <span className="chart__swatch" style={{ background: 'var(--color-primary-soft)', border: '1px dashed var(--color-primary)' }} /> Còn trống (
              {k.vacantRooms})
            </span>
          </div>
        }
      >
        <div className="stack">
          {buildings.map((b) => (
            <div key={b}>
              <p className="text-xs muted" style={{ fontWeight: 700, marginBottom: 'var(--space-2)' }}>
                {b}
              </p>
              <div className="occupancy-grid">
                {data.occupancy
                  .filter((o) => o.buildingName === b)
                  .map((o) => (
                    <Link
                      key={o.roomId}
                      to={`${base}/rooms/${o.roomId}`}
                      className={`occ-cell ${o.occupied ? 'occ-cell--occupied' : 'occ-cell--vacant'}`}
                      aria-label={`${o.code} ${o.occupied ? 'đã thuê' : 'trống'}`}
                    >
                      <strong>{o.code}</strong>
                      {o.occupied ? 'Đã thuê' : 'Trống'}
                    </Link>
                  ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs muted" style={{ marginTop: 'var(--space-3)' }}>
          Cập nhật: {formatDateTime(data.syncedAt)}
        </p>
      </Section>
    </>
  );
}
