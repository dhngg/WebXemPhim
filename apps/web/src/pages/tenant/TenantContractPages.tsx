import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CONTRACT_STATUSES, type ContractResponse, type ContractStatus, type DepositEntryResponse } from '@rental/shared';
import {
  ButtonLink,
  DataTable,
  EmptyState,
  FilterBar,
  KeyValueList,
  LoadingBlock,
  PageHeader,
  Pagination,
  Section,
  Select,
  StatusBadge,
  type Column,
} from '@/components/ui';
import { DEPOSIT_KIND } from '@/features/deposits/labels';
import { PAYMENT_METHOD } from '@/features/payments/labels';
import { CONTRACT_PHASE, CONTRACT_STATUS_V1 } from '@/features/tenancy/labels';
import { useTenantContract, useTenantContracts, useTenantDeposit } from '@/features/tenant-portal/hooks';
import { canRequestMaintenance, PAGE_SIZE } from '@/features/tenant-portal/model';
import { useSearchState } from '@/hooks/useSearchState';
import { formatDate, formatDateTime } from '@/lib/format';
import { DetailError, money } from './parts';

const period = (c: Pick<ContractResponse, 'startDate' | 'endDate'>) => `${formatDate(c.startDate)} – ${formatDate(c.endDate)}`;

/** TPT-02 — hợp đồng của tôi: lọc theo trạng thái lưu trữ ACTIVE/ENDED, phân trang thật. */
export function TenantContractsPage() {
  const navigate = useNavigate();
  const [s, set] = useSearchState(['status', 'page'] as const);
  const page = Math.max(1, Number(s.page) || 1);
  const status = (CONTRACT_STATUSES as readonly string[]).includes(s.status) ? (s.status as ContractStatus) : undefined;
  const list = useTenantContracts({ status, page, limit: PAGE_SIZE });

  const columns: Column<ContractResponse>[] = [
    {
      key: 'room',
      header: 'Phòng',
      render: (c) => (
        <Link to={`/tenant/contracts/${c.id}`} className="cell-title">
          Phòng {c.room.code}
        </Link>
      ),
    },
    { key: 'tenant', header: 'Người thuê', render: (c) => c.tenant.fullName },
    { key: 'period', header: 'Thời hạn thuê', render: (c) => period(c) },
    { key: 'rent', header: 'Tiền thuê/tháng', align: 'right', render: (c) => money(c.monthlyRent) },
    { key: 'phase', header: 'Hiệu lực', render: (c) => <StatusBadge status={c.phase} map={CONTRACT_PHASE} /> },
  ];

  return (
    <>
      <PageHeader title="Hợp đồng của tôi" description="Hợp đồng thuộc các hồ sơ đã liên kết, kể cả hợp đồng chưa đến ngày bắt đầu và đã kết thúc." />
      <Section flush>
        <FilterBar>
          <Select aria-label="Trạng thái hợp đồng" value={s.status} onChange={(e) => set({ status: e.target.value, page: '' })}>
            <option value="">Mọi trạng thái</option>
            {CONTRACT_STATUSES.map((st) => (
              <option key={st} value={st}>
                {CONTRACT_STATUS_V1[st].label}
              </option>
            ))}
          </Select>
        </FilterBar>
        <DataTable
          columns={columns}
          rows={list.data?.items}
          rowKey={(c) => c.id}
          isLoading={list.isLoading}
          error={list.error}
          onRetry={() => list.refetch()}
          onRowClick={(c) => navigate(`/tenant/contracts/${c.id}`)}
          empty={<EmptyState title="Chưa có hợp đồng" description="Hợp đồng sẽ hiện ở đây khi chủ trọ lập cho hồ sơ bạn đã liên kết." />}
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onChange={(p) => set({ page: String(p) })} />
      </Section>
    </>
  );
}

const PHASE_NOTE: Partial<Record<ContractResponse['phase'], { tone: 'info' | 'warning'; text: string }>> = {
  UPCOMING: { tone: 'info', text: 'Hợp đồng chưa đến ngày bắt đầu. Bạn xem được thông tin và sổ tiền cọc, nhưng chưa gửi được yêu cầu bảo trì.' },
  OVERDUE: { tone: 'warning', text: 'Đã quá ngày kết thúc dự kiến nhưng chủ trọ chưa kết thúc hợp đồng. Hợp đồng không tự đóng.' },
  CANCELLED: { tone: 'info', text: 'Hợp đồng đã bị hủy trước ngày bắt đầu nên chưa từng có hiệu lực.' },
};

/** TPT-02b — chi tiết hợp đồng (chỉ các trường backend trả) + sổ tiền cọc phân trang riêng. */
export function TenantContractDetailPage() {
  const { contractId } = useParams();
  const contract = useTenantContract(contractId);
  const c = contract.data;

  if (contract.isLoading) return <LoadingBlock lines={6} />;
  if (contract.error || !c) return <DetailError error={contract.error} onRetry={() => contract.refetch()} backTo="/tenant/contracts" backLabel="Về danh sách hợp đồng" />;
  const note = PHASE_NOTE[c.phase];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Hợp đồng', to: '/tenant/contracts' }, { label: `Phòng ${c.room.code}` }]}
        title={`Hợp đồng phòng ${c.room.code}`}
        eyebrow={
          <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
            <StatusBadge status={c.phase} map={CONTRACT_PHASE} />
            <StatusBadge status={c.status} map={CONTRACT_STATUS_V1} />
          </div>
        }
        actions={
          canRequestMaintenance(c) && (
            <ButtonLink to="/tenant/maintenance" variant="secondary">
              Yêu cầu bảo trì
            </ButtonLink>
          )
        }
      />
      {note && (
        <p className={`alert alert--${note.tone}`} role="status" style={{ marginBottom: 'var(--space-4)' }}>
          {note.text}
        </p>
      )}
      <div className="grid grid--main-side">
        <DepositSection contractId={c.id} />
        <Section title="Thông tin hợp đồng">
          <KeyValueList
            items={[
              { label: 'Phòng', value: c.room.code },
              { label: 'Người thuê', value: c.tenant.fullName },
              { label: 'Thời hạn thuê', value: period(c) },
              { label: 'Tiền thuê/tháng', value: money(c.monthlyRent) },
              { label: 'Trạng thái', value: CONTRACT_STATUS_V1[c.status].label },
              { label: 'Hiệu lực', value: CONTRACT_PHASE[c.phase].label },
              ...(c.endedAt ? [{ label: 'Kết thúc lúc', value: formatDateTime(c.endedAt) }] : []),
              { label: 'Ghi chú', value: c.notes ?? '—' },
              { label: 'Tạo lúc', value: formatDateTime(c.createdAt) },
            ]}
          />
        </Section>
      </div>
    </>
  );
}

/** Sổ tiền cọc của hợp đồng: chỉ xem. Tổng do backend tính cho cả sổ (không cộng từ trang đang xem). */
function DepositSection({ contractId }: { contractId: string }) {
  const [page, setPage] = useState(1);
  const ledger = useTenantDeposit(contractId, { page, limit: PAGE_SIZE });
  const d = ledger.data;

  const columns: Column<DepositEntryResponse>[] = [
    { key: 'at', header: 'Thời điểm', render: (e) => formatDateTime(e.occurredAt) },
    { key: 'kind', header: 'Loại', render: (e) => <StatusBadge status={e.kind} map={DEPOSIT_KIND} /> },
    { key: 'amount', header: 'Số tiền', align: 'right', render: (e) => <strong>{money(e.amount)}</strong> },
    { key: 'method', header: 'Hình thức', render: (e) => (e.method ? PAYMENT_METHOD[e.method] : '—') },
    {
      key: 'detail',
      header: 'Chi tiết',
      render: (e) => (
        <>
          {e.reason && <p>{e.reason}</p>}
          {e.reference && <p className="cell-sub">Tham chiếu: {e.reference}</p>}
          {e.note && <p className="cell-sub">{e.note}</p>}
          {e.kind === 'REVERSAL' && <p className="cell-sub">Hủy một giao dịch ghi nhầm</p>}
          {e.reversedByEntryId && <p className="cell-sub">Giao dịch này đã bị đảo</p>}
          {!e.reason && !e.reference && !e.note && e.kind !== 'REVERSAL' && !e.reversedByEntryId && '—'}
        </>
      ),
    },
  ];

  return (
    <Section title="Tiền cọc" subtitle="Sổ do chủ trọ ghi nhận; bạn chỉ xem." flush>
      {d && (
        <div style={{ padding: 'var(--space-4)' }}>
          <KeyValueList
            items={[
              { label: 'Đã thu', value: money(d.collectedTotal) },
              { label: 'Đã khấu trừ', value: money(d.deductedTotal) },
              { label: 'Đã hoàn', value: money(d.refundedTotal) },
              { label: 'Số dư cọc', value: <strong>{money(d.balance)}</strong> },
            ]}
          />
        </div>
      )}
      <DataTable
        columns={columns}
        rows={d?.items}
        rowKey={(e) => e.id}
        isLoading={ledger.isLoading}
        error={ledger.error}
        onRetry={() => ledger.refetch()}
        empty={<EmptyState title="Chưa có giao dịch tiền cọc" description="Khi chủ trọ ghi nhận thu, khấu trừ hoặc hoàn cọc, giao dịch sẽ hiện ở đây." />}
      />
      <Pagination page={page} pageSize={PAGE_SIZE} total={d?.total ?? 0} onChange={setPage} />
    </Section>
  );
}
