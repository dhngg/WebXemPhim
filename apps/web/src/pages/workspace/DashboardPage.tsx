import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Building2, CircleDollarSign, FileText, FileSignature, Wrench } from 'lucide-react';
import { ErrorState, LoadingBlock, PageHeader, Section, Select, StatCard } from '@/components/ui';
import { useWorkspaceDashboard } from '@/features/dashboard/api';
import { useBuildings } from '@/features/property-management/hooks';
import { formatMoney } from '@/features/property-management/mappers';
import { useWorkspaceContext } from '@/hooks/useWorkspaceContext';
import { useSearchState } from '@/hooks/useSearchState';
import { currentPeriod, periodLabel } from '@/lib/dates';
import { toApiError } from '@/services/http/ApiError';

const money = (v: string) => formatMoney(v);

/**
 * WSP-01 — Tổng quan của chủ trọ. Mọi con số là số tổng hợp do backend tính (theo workspace, tùy chọn một tòa nhà và một kỳ);
 * trang này chỉ hiển thị. Tiền là chuỗi VND nguyên và không bao gồm tiền cọc.
 */
export function DashboardPage() {
  const { ws, base } = useWorkspaceContext();
  const buildings = useBuildings(ws);
  const [s, set] = useSearchState(['buildingId', 'period'] as const);
  const active = useMemo(() => (buildings.data ?? []).filter((b) => b.status === 'ACTIVE'), [buildings.data]);
  const buildingId = active.find((b) => b.id === s.buildingId)?.id;
  const period = s.period || currentPeriod();
  const { data, isLoading, error, refetch } = useWorkspaceDashboard(ws, { buildingId, period: s.period || undefined });

  const scope = buildingId ? `?buildingId=${buildingId}` : '';
  const invoiceLink = `${base}/invoices?${buildingId ? `buildingId=${buildingId}&` : ''}period=${period}`;

  return (
    <>
      <PageHeader
        title="Tổng quan"
        description={`Số liệu tổng hợp kỳ ${periodLabel(period)}${buildingId ? ` — ${active.find((b) => b.id === buildingId)?.name ?? ''}` : ' — toàn bộ tòa nhà'}. Tiền cọc không nằm trong các con số này.`}
        actions={
          <div className="row">
            <Select aria-label="Tòa nhà" value={buildingId ?? ''} onChange={(e) => set({ buildingId: e.target.value })}>
              <option value="">Tất cả tòa nhà</option>
              {active.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
            <input className="input" type="month" aria-label="Kỳ" value={period} onChange={(e) => set({ period: e.target.value })} style={{ minWidth: 150 }} />
          </div>
        }
      />
      {isLoading ? (
        <LoadingBlock lines={8} />
      ) : error || !data ? (
        <ErrorState error={error ? toApiError(error) : undefined} onRetry={() => refetch()} />
      ) : (
        <div className="stack">
          <Section title="Phòng" actions={<Link to={`${base}/rooms${scope}`}>Xem phòng →</Link>}>
            <div className="grid grid--4">
              <StatCard label="Tổng số phòng" value={data.rooms.total} icon={<Building2 size={18} aria-hidden="true" />} />
              <StatCard label="Đang thuê" value={data.rooms.occupied} tone="success" />
              <StatCard label="Trống" value={data.rooms.vacant} tone="primary" />
              <StatCard label="Không khả dụng" value={data.rooms.unavailable} />
            </div>
          </Section>

          <Section title="Hợp đồng" actions={<Link to={`${base}/contracts`}>Xem hợp đồng →</Link>}>
            <div className="grid grid--4">
              <StatCard label="Đang có hiệu lực" value={data.contracts.inEffect} tone="success" icon={<FileSignature size={18} aria-hidden="true" />} />
              <StatCard label="Chưa đến ngày bắt đầu" value={data.contracts.upcoming} tone="primary" />
              <StatCard label="Quá hạn, chưa kết thúc" value={data.contracts.overdue} tone={data.contracts.overdue ? 'danger' : 'neutral'} footer="Chủ trọ kết thúc thủ công" />
              <StatCard label="Hết hạn trong 30 ngày" value={data.contracts.expiringWithin30Days} />
            </div>
            <p className="text-sm muted" style={{ marginTop: 'var(--space-3)' }}>
              Chưa kết thúc: {data.contracts.active} • Đã kết thúc: {data.contracts.ended}
            </p>
          </Section>

          <Section title={`Hóa đơn kỳ ${periodLabel(period)}`} actions={<Link to={invoiceLink}>Xem hóa đơn →</Link>}>
            <div className="grid grid--4">
              <StatCard label="Bản nháp" value={data.invoices.draft} icon={<FileText size={18} aria-hidden="true" />} />
              <StatCard label="Đã phát hành (tất cả kỳ)" value={data.invoices.issued} />
              <StatCard label="Phát hành trong kỳ" value={data.invoices.issuedInPeriod} tone="primary" />
              <StatCard label="Tổng tiền phát hành trong kỳ" value={money(data.invoices.billedInPeriod)} footer="Đã gồm điều chỉnh" />
            </div>
            <div className="grid grid--3" style={{ marginTop: 'var(--space-3)' }}>
              <StatCard label="Chưa thanh toán" value={data.invoices.unpaid} tone={data.invoices.unpaid ? 'danger' : 'neutral'} />
              <StatCard label="Thanh toán một phần" value={data.invoices.partiallyPaid} />
              <StatCard label="Đã thanh toán" value={data.invoices.paid} tone="success" />
            </div>
          </Section>

          <Section title="Thu tiền & công nợ" actions={<Link to={`${base}/payments${scope}`}>Sổ thanh toán →</Link>}>
            <div className="grid grid--4">
              <StatCard label={`Đã thu trong kỳ ${periodLabel(period)}`} value={money(data.revenue.collected)} tone="success" icon={<CircleDollarSign size={18} aria-hidden="true" />} footer="Thu trừ đảo, không gồm tiền cọc" />
              <StatCard label="Còn phải thu" value={money(data.receivables.outstanding)} tone={data.receivables.outstanding === '0' ? 'neutral' : 'primary'} />
              <StatCard label="Hóa đơn quá hạn" value={data.receivables.overdueInvoices} tone={data.receivables.overdueInvoices ? 'danger' : 'neutral'} />
              <StatCard label="Công nợ quá hạn" value={money(data.receivables.overdueOutstanding)} tone={data.receivables.overdueOutstanding === '0' ? 'neutral' : 'danger'} />
            </div>
          </Section>

          <Section title="Bảo trì" actions={<Link to={`${base}/maintenance${scope}`}>Xem yêu cầu →</Link>}>
            <div className="grid grid--4">
              <StatCard label="Mới tiếp nhận" value={data.maintenance.open} tone={data.maintenance.open ? 'danger' : 'neutral'} icon={<Wrench size={18} aria-hidden="true" />} />
              <StatCard label="Đang xử lý" value={data.maintenance.inProgress} tone="primary" />
              <StatCard label="Đã xử lý" value={data.maintenance.resolved} tone="success" />
              <StatCard label="Đã đóng / đã hủy" value={`${data.maintenance.closed} / ${data.maintenance.cancelled}`} />
            </div>
          </Section>
        </div>
      )}
    </>
  );
}
