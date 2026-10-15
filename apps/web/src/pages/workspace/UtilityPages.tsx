import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { History, Pencil, Plus } from 'lucide-react';
import {
  Badge,
  Button,
  DataTable,
  DatePicker,
  EmptyState,
  ErrorState,
  FilterBar,
  FormField,
  LoadingBlock,
  Modal,
  PageHeader,
  SearchInput,
  Section,
  Select,
  StatusBadge,
  useToast,
  type Column,
} from '@/components/ui';
import { useBuildings, useRooms } from '@/features/property-management/hooks';
import {
  useAdjustMeter,
  useChangeRate,
  useCreateRate,
  useRates,
  useRecordMeter,
  useRoomMeters,
  useStopRate,
} from '@/features/utilities/hooks';
import { BILLING_UNIT, METER_TYPE, RATE_STATUS, SERVICE_TYPE, utilitiesErrorMessage } from '@/features/utilities/labels';
import { formatDecimal, formatUnitPrice, planMeterCell } from '@/features/utilities/mappers';
import {
  adjustSchema,
  meterSchema,
  rateChangeSchema,
  rateSchema,
  stopSchema,
  type AdjustForm,
  type MeterForm,
  type RateChangeForm,
  type RateForm,
  type StopForm,
} from '@/features/utilities/schemas';
import type { MeterReadingItem, MeterType, RateFilters, RatePlanItem, RateServiceType } from '@/features/utilities/types';
import type { ManagedRoom } from '@/features/property-management/types';
import { RATE_BILLING_UNITS, RATE_SERVICE_TYPES } from '@rental/shared';
import { useWorkspaceContext } from '@/hooks/useWorkspaceContext';
import { useSearchState } from '@/hooks/useSearchState';
import { addMonths, currentPeriod, periodLabel, todayVN } from '@/lib/dates';
import { formatDate, formatDateTime } from '@/lib/format';
import { toApiError } from '@/services/http/ApiError';

/** Chỉ OWNER ghi dữ liệu, và workspace chưa lưu trữ. */
function useCanWrite() {
  const { can, membership } = useWorkspaceContext();
  return can('rooms.write') && membership.status !== 'ARCHIVED';
}

/** Tòa nhà đang chọn: tham số `buildingId` trên URL, mặc định tòa nhà đang hoạt động đầu tiên. */
function useSelectedBuilding() {
  const { ws } = useWorkspaceContext();
  const buildings = useBuildings(ws);
  const [s, set] = useSearchState(['buildingId', 'period', 'q', 'status', 'serviceType'] as const);
  const active = useMemo(() => (buildings.data ?? []).filter((b) => b.status === 'ACTIVE'), [buildings.data]);
  const buildingId = active.find((b) => b.id === s.buildingId)?.id ?? active[0]?.id;
  return { buildings, active, buildingId, s, set };
}

export function BuildingSelect({ value, options, onChange }: { value?: string; options: Array<{ id: string; name: string }>; onChange: (id: string) => void }) {
  return (
    <Select aria-label="Tòa nhà" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      {options.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </Select>
  );
}

export function NoBuilding({ loading, error, onRetry }: { loading: boolean; error: unknown; onRetry: () => void }) {
  if (loading) return <LoadingBlock lines={4} />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  return <EmptyState title="Chưa có tòa nhà đang hoạt động" description="Tạo tòa nhà trước, rồi thiết lập bảng giá và ghi chỉ số cho từng tòa." />;
}

// ===================================================================== Rates
/** RATE-01 — bảng giá dịch vụ theo tòa nhà: tạo mã dịch vụ, đổi giá (phiên bản mới), ngừng áp dụng. */
export function RatesPage() {
  const { ws } = useWorkspaceContext();
  const writable = useCanWrite();
  const { buildings, active, buildingId, s, set } = useSelectedBuilding();
  const filters: RateFilters = { status: (s.status || undefined) as RateFilters['status'], serviceType: (s.serviceType || undefined) as RateServiceType | undefined };
  const rates = useRates(ws, buildingId, filters);
  const [creating, setCreating] = useState(false);
  const [changing, setChanging] = useState<RatePlanItem | null>(null);
  const [stopping, setStopping] = useState<RatePlanItem | null>(null);
  const today = todayVN();

  const columns: Column<RatePlanItem>[] = [
    {
      key: 'svc',
      header: 'Dịch vụ',
      render: (r) => (
        <>
          <p className="cell-title">{r.name}</p>
          <p className="cell-sub">
            {r.code} • {SERVICE_TYPE[r.serviceType]}
          </p>
        </>
      ),
    },
    { key: 'price', header: 'Đơn giá', align: 'right', render: (r) => `${formatUnitPrice(r.unitPrice)} / ${BILLING_UNIT[r.billingUnit]}` },
    { key: 'from', header: 'Áp dụng từ', render: (r) => formatDate(r.effectiveFrom) },
    { key: 'to', header: 'Đến (loại trừ)', render: (r) => (r.effectiveTo ? formatDate(r.effectiveTo) : '—') },
    {
      key: 'st',
      header: 'Trạng thái',
      render: (r) => (
        <span className="row">
          <StatusBadge status={r.status} map={RATE_STATUS} />
          {r.status === 'ACTIVE' && r.effectiveFrom > today && <Badge tone="info">Sắp áp dụng</Badge>}
        </span>
      ),
    },
    {
      key: 'act',
      header: '',
      align: 'right',
      render: (r) =>
        writable && r.status === 'ACTIVE' ? (
          <span className="row" style={{ justifyContent: 'flex-end' }}>
            <Button size="sm" variant="ghost" onClick={() => setChanging(r)}>
              <Pencil size={14} aria-hidden="true" /> Đổi giá
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setStopping(r)}>
              Ngừng áp dụng
            </Button>
          </span>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Bảng giá dịch vụ"
        description="Đơn giá theo từng tòa nhà. Đổi giá tạo phiên bản mới từ ngày áp dụng; phiên bản cũ được giữ làm lịch sử. Hóa đơn chỉ tính dịch vụ đã gán cho phòng."
        actions={
          writable &&
          buildingId && (
            <Button variant="dark" onClick={() => setCreating(true)}>
              <Plus size={16} aria-hidden="true" /> Thêm dịch vụ
            </Button>
          )
        }
      />
      {!buildingId ? (
        <NoBuilding loading={buildings.isLoading} error={buildings.error} onRetry={() => buildings.refetch()} />
      ) : (
        <Section flush>
          <FilterBar>
            <BuildingSelect value={buildingId} options={active} onChange={(id) => set({ buildingId: id })} />
            <Select aria-label="Loại dịch vụ" value={s.serviceType} onChange={(e) => set({ serviceType: e.target.value })}>
              <option value="">Mọi loại dịch vụ</option>
              {RATE_SERVICE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {SERVICE_TYPE[t]}
                </option>
              ))}
            </Select>
            <Select aria-label="Trạng thái" value={s.status} onChange={(e) => set({ status: e.target.value })}>
              <option value="">Mọi trạng thái</option>
              <option value="ACTIVE">{RATE_STATUS.ACTIVE.label}</option>
              <option value="INACTIVE">{RATE_STATUS.INACTIVE.label}</option>
            </Select>
          </FilterBar>
          <DataTable
            columns={columns}
            rows={rates.data}
            rowKey={(r) => r.id}
            isLoading={rates.isLoading}
            error={rates.error}
            onRetry={() => rates.refetch()}
            empty={<EmptyState title="Chưa có bảng giá" description="Thêm điện, nước, Wi-Fi… cho tòa nhà này để lập hóa đơn." />}
          />
        </Section>
      )}
      {buildingId && creating && <CreateRateModal ws={ws} buildingId={buildingId} onClose={() => setCreating(false)} />}
      {buildingId && changing && <ChangeRateModal ws={ws} buildingId={buildingId} rate={changing} onClose={() => setChanging(null)} />}
      {buildingId && stopping && <StopRateModal ws={ws} buildingId={buildingId} rate={stopping} onClose={() => setStopping(null)} />}
    </>
  );
}

function TypeUnitFields({
  register,
  errors,
}: {
  register: (name: 'serviceType' | 'billingUnit') => UseFormRegisterReturn;
  errors: { serviceType?: { message?: string }; billingUnit?: { message?: string } };
}) {
  return (
    <div className="form-grid form-grid--2">
      <FormField label="Loại dịch vụ" required error={errors.serviceType?.message}>
        <select className="select" {...register('serviceType')}>
          {RATE_SERVICE_TYPES.map((t) => (
            <option key={t} value={t}>
              {SERVICE_TYPE[t]}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Đơn vị tính" required error={errors.billingUnit?.message}>
        <select className="select" {...register('billingUnit')}>
          {RATE_BILLING_UNITS.map((u) => (
            <option key={u} value={u}>
              {BILLING_UNIT[u]}
            </option>
          ))}
        </select>
      </FormField>
    </div>
  );
}

function CreateRateModal({ ws, buildingId, onClose }: { ws: string; buildingId: string; onClose: () => void }) {
  const create = useCreateRate(ws, buildingId);
  const toast = useToast();
  const form = useForm<RateForm>({
    resolver: zodResolver(rateSchema),
    defaultValues: { code: '', name: '', serviceType: 'ELECTRICITY', billingUnit: 'KWH', unitPrice: '', effectiveFrom: todayVN() },
  });
  const e = form.formState.errors;
  return (
    <Modal open title="Thêm dịch vụ vào bảng giá" description="Mã dịch vụ duy nhất trong tòa nhà; dịch vụ phòng và hóa đơn tham chiếu theo mã này." onClose={onClose}>
      <form
        className="stack"
        noValidate
        onSubmit={form.handleSubmit(async (v) => {
          try {
            await create.mutateAsync(v as Parameters<typeof create.mutateAsync>[0]);
            toast.success('Đã thêm đơn giá.');
            onClose();
          } catch (err) {
            const a = toApiError(err);
            if (a.isConflict) form.setError('code', { message: utilitiesErrorMessage(err) });
            else toast.error(utilitiesErrorMessage(err));
          }
        })}
      >
        <div className="form-grid form-grid--2">
          <FormField label="Mã dịch vụ" required error={e.code?.message} hint="Tự chuẩn hóa: chữ hoa, số, gạch dưới (vd. WIFI, TRASH).">
            <input className="input" maxLength={50} {...form.register('code')} />
          </FormField>
          <FormField label="Tên hiển thị" required error={e.name?.message}>
            <input className="input" maxLength={100} {...form.register('name')} />
          </FormField>
        </div>
        <TypeUnitFields register={(n) => form.register(n)} errors={e} />
        <div className="form-grid form-grid--2">
          <FormField label="Đơn giá (VND)" required error={e.unitPrice?.message} hint="Tối đa 4 chữ số lẻ, ví dụ 3500 hoặc 3500.5.">
            <input className="input" inputMode="decimal" {...form.register('unitPrice')} />
          </FormField>
          <FormField label="Áp dụng từ ngày" required error={e.effectiveFrom?.message}>
            <DatePicker {...form.register('effectiveFrom')} />
          </FormField>
        </div>
        <div className="form-actions">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" variant="dark" loading={create.isPending}>
            Thêm dịch vụ
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ChangeRateModal({ ws, buildingId, rate, onClose }: { ws: string; buildingId: string; rate: RatePlanItem; onClose: () => void }) {
  const change = useChangeRate(ws, buildingId);
  const toast = useToast();
  const form = useForm<RateChangeForm>({
    resolver: zodResolver(rateChangeSchema(rate.effectiveFrom)),
    defaultValues: {
      name: rate.name,
      serviceType: rate.serviceType,
      billingUnit: rate.billingUnit,
      unitPrice: rate.unitPrice.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''),
      effectiveFrom: '',
    },
  });
  const e = form.formState.errors;
  return (
    <Modal open title={`Đổi giá ${rate.code}`} description={`Phiên bản hiện tại áp dụng từ ${formatDate(rate.effectiveFrom)} sẽ ngừng vào ngày áp dụng mới; không sửa đè lịch sử.`} onClose={onClose}>
      <form
        className="stack"
        noValidate
        onSubmit={form.handleSubmit(async (v) => {
          try {
            await change.mutateAsync({ rate, input: v as Parameters<typeof change.mutateAsync>[0]['input'] });
            toast.success('Đã tạo phiên bản đơn giá mới.');
            onClose();
          } catch (err) {
            const a = toApiError(err);
            if (a.isConflict) form.setError('effectiveFrom', { message: utilitiesErrorMessage(err) });
            else toast.error(utilitiesErrorMessage(err));
          }
        })}
      >
        <FormField label="Tên hiển thị" required error={e.name?.message}>
          <input className="input" maxLength={100} {...form.register('name')} />
        </FormField>
        <TypeUnitFields register={(n) => form.register(n)} errors={e} />
        <div className="form-grid form-grid--2">
          <FormField label="Đơn giá mới (VND)" required error={e.unitPrice?.message}>
            <input className="input" inputMode="decimal" {...form.register('unitPrice')} />
          </FormField>
          <FormField label="Áp dụng từ ngày" required error={e.effectiveFrom?.message} hint="Phải sau ngày áp dụng hiện tại.">
            <DatePicker min={rate.effectiveFrom} {...form.register('effectiveFrom')} />
          </FormField>
        </div>
        <div className="form-actions">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" variant="dark" loading={change.isPending}>
            Tạo phiên bản mới
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function StopRateModal({ ws, buildingId, rate, onClose }: { ws: string; buildingId: string; rate: RatePlanItem; onClose: () => void }) {
  const stop = useStopRate(ws, buildingId);
  const toast = useToast();
  const today = todayVN();
  const form = useForm<StopForm>({
    resolver: zodResolver(stopSchema(rate.effectiveFrom)),
    defaultValues: { effectiveTo: today > rate.effectiveFrom ? today : '' },
  });
  return (
    <Modal open title={`Ngừng áp dụng ${rate.code}`} onClose={onClose}>
      <form
        className="stack"
        noValidate
        onSubmit={form.handleSubmit(async (v) => {
          try {
            await stop.mutateAsync({ id: rate.id, effectiveTo: v.effectiveTo });
            toast.success('Đã ngừng áp dụng đơn giá.');
            onClose();
          } catch (err) {
            toast.error(utilitiesErrorMessage(err));
          }
        })}
      >
        <FormField label="Ngừng từ ngày (không còn tính từ ngày này)" required error={form.formState.errors.effectiveTo?.message} hint={`Phải sau ngày bắt đầu ${formatDate(rate.effectiveFrom)}. Phiên bản được giữ làm lịch sử.`}>
          <DatePicker min={rate.effectiveFrom} {...form.register('effectiveTo')} />
        </FormField>
        <div className="form-actions">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" variant="danger" loading={stop.isPending}>
            Ngừng áp dụng
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ===================================================================== Meters
function PeriodSelect({ value, onChange }: { value: string; onChange: (p: string) => void }) {
  const now = currentPeriod();
  const options = Array.from({ length: 13 }, (_, i) => addMonths(now, 1 - i));
  return (
    <Select aria-label="Kỳ ghi chỉ số" value={value} onChange={(e) => onChange(e.target.value)} style={{ minWidth: 140 }}>
      {options.map((p) => (
        <option key={p} value={p}>
          Kỳ {periodLabel(p)}
        </option>
      ))}
    </Select>
  );
}

/** METER-01 — chỉ số điện nước theo tòa nhà và kỳ: ghi mới, điều chỉnh có lý do (chỉ kỳ mới nhất), xem lịch sử điều chỉnh. */
export function MetersPage() {
  const { ws, base } = useWorkspaceContext();
  const writable = useCanWrite();
  const { buildings, active, buildingId, s, set } = useSelectedBuilding();
  const period = s.period || currentPeriod();
  const rooms = useRooms(ws, { buildingId });
  const list = useMemo(
    () => (rooms.data ?? []).filter((r) => r.status !== 'ARCHIVED' && (!s.q || r.code.toLowerCase().includes(s.q.toLowerCase()))).sort((a, b) => a.code.localeCompare(b.code, 'vi', { numeric: true })),
    [rooms.data, s.q],
  );

  return (
    <>
      <PageHeader
        title="Chỉ số điện nước"
        description="Số cũ lấy từ chỉ số mới của kỳ trước; riêng lần ghi đầu của phòng phải nhập số cũ. Chỉ điều chỉnh được kỳ mới nhất và phải ghi lý do."
      />
      {!buildingId ? (
        <NoBuilding loading={buildings.isLoading} error={buildings.error} onRetry={() => buildings.refetch()} />
      ) : (
        <Section flush>
          <FilterBar>
            <BuildingSelect value={buildingId} options={active} onChange={(id) => set({ buildingId: id })} />
            <PeriodSelect value={period} onChange={(p) => set({ period: p })} />
            <SearchInput value={s.q} onChange={(q) => set({ q })} placeholder="Lọc theo mã phòng…" />
          </FilterBar>
          {rooms.isLoading ? (
            <LoadingBlock lines={5} />
          ) : rooms.error ? (
            <ErrorState error={rooms.error} onRetry={() => rooms.refetch()} />
          ) : list.length === 0 ? (
            <EmptyState title="Không có phòng" description="Tòa nhà chưa có phòng đang hoạt động." action={<Link to={`${base}/rooms`}>Quản lý phòng →</Link>} />
          ) : (
            <div className="table-wrap">
              <table className="table table--stack">
                <thead>
                  <tr>
                    <th>Phòng</th>
                    <th>Điện (kWh)</th>
                    <th>Nước (m³)</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((room) => (
                    <MeterRoomRow key={`${room.id}`} ws={ws} room={room} period={period} writable={writable} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}
    </>
  );
}

function MeterRoomRow({ ws, room, period, writable }: { ws: string; room: ManagedRoom; period: string; writable: boolean }) {
  const readings = useRoomMeters(ws, room.buildingId, room.id);
  return (
    <tr>
      <td data-label="Phòng">
        <Link to={`/w/${ws}/rooms/${room.id}`} className="cell-title">
          {room.code}
        </Link>
      </td>
      {(['ELECTRICITY', 'WATER'] as MeterType[]).map((type) => (
        <td key={type} data-label={METER_TYPE[type].label}>
          {readings.isLoading ? (
            <span className="muted text-sm">Đang tải…</span>
          ) : readings.error ? (
            <span className="field__error" role="alert">
              {utilitiesErrorMessage(readings.error)}
            </span>
          ) : (
            <MeterCell ws={ws} room={room} type={type} period={period} all={readings.data ?? []} writable={writable} />
          )}
        </td>
      ))}
    </tr>
  );
}

function MeterCell({ ws, room, type, period, all, writable }: { ws: string; room: ManagedRoom; type: MeterType; period: string; all: MeterReadingItem[]; writable: boolean }) {
  const plan = planMeterCell(all, type, period);
  const [recording, setRecording] = useState(false);
  const [adjusting, setAdjusting] = useState<MeterReadingItem | null>(null);
  const [history, setHistory] = useState<MeterReadingItem | null>(null);
  const label = METER_TYPE[type].label;

  return (
    <div className="stack" style={{ gap: 'var(--space-1)' }} data-testid={`meter-${room.code}-${type}`}>
      {plan.kind === 'recorded' ? (
        <>
          <p className="text-sm">
            {formatDecimal(plan.reading.previousReading)} → <strong>{formatDecimal(plan.reading.currentReading)}</strong>
          </p>
          <p className="cell-sub">
            Tiêu thụ {formatDecimal(plan.reading.consumption)} {METER_TYPE[type].unit}
            {plan.reading.revision > 0 && ` • đã điều chỉnh ${plan.reading.revision} lần`}
          </p>
          <span className="row">
            {writable && plan.canAdjust && (
              <Button size="sm" variant="ghost" aria-label={`Điều chỉnh ${label.toLowerCase()} ${room.code}`} onClick={() => setAdjusting(plan.reading)}>
                <Pencil size={14} aria-hidden="true" /> Điều chỉnh
              </Button>
            )}
            {plan.reading.adjustments.length > 0 && (
              <Button size="sm" variant="ghost" aria-label={`Lịch sử điều chỉnh ${label.toLowerCase()} ${room.code}`} onClick={() => setHistory(plan.reading)}>
                <History size={14} aria-hidden="true" /> Lịch sử
              </Button>
            )}
          </span>
        </>
      ) : plan.canRecord ? (
        <>
          <Badge tone="warning">Chưa ghi</Badge>
          {writable && (
            <Button size="sm" variant="secondary" aria-label={`Ghi chỉ số ${label.toLowerCase()} ${room.code}`} onClick={() => setRecording(true)}>
              Ghi chỉ số
            </Button>
          )}
        </>
      ) : (
        <span className="cell-sub">{plan.reason}</span>
      )}
      {recording && plan.kind === 'empty' && plan.canRecord && (
        <RecordMeterModal ws={ws} room={room} type={type} period={period} needsPrevious={plan.needsPrevious} previous={plan.previous} onClose={() => setRecording(false)} />
      )}
      {adjusting && plan.kind === 'recorded' && (
        <AdjustMeterModal ws={ws} room={room} reading={adjusting} isFirst={plan.isFirst} onClose={() => setAdjusting(null)} />
      )}
      {history && <HistoryModal reading={history} onClose={() => setHistory(null)} />}
    </div>
  );
}

function RecordMeterModal({
  ws,
  room,
  type,
  period,
  needsPrevious,
  previous,
  onClose,
}: {
  ws: string;
  room: ManagedRoom;
  type: MeterType;
  period: string;
  needsPrevious: boolean;
  previous?: string;
  onClose: () => void;
}) {
  const record = useRecordMeter(ws, room.buildingId, room.id);
  const toast = useToast();
  const form = useForm<MeterForm>({ resolver: zodResolver(meterSchema(needsPrevious, previous)), defaultValues: { previousReading: '', currentReading: '' } });
  const e = form.formState.errors;
  return (
    <Modal open title={`Ghi chỉ số ${METER_TYPE[type].label.toLowerCase()} — phòng ${room.code}`} description={`Kỳ ${periodLabel(period)}`} onClose={onClose}>
      <form
        className="stack"
        noValidate
        onSubmit={form.handleSubmit(async (v) => {
          try {
            await record.mutateAsync({ meterType: type, period, previousReading: needsPrevious ? v.previousReading : undefined, currentReading: v.currentReading });
            toast.success(`Đã ghi chỉ số ${METER_TYPE[type].label.toLowerCase()} phòng ${room.code}.`);
            onClose();
          } catch (err) {
            const a = toApiError(err);
            if (a.isConflict) form.setError('currentReading', { message: utilitiesErrorMessage(err) });
            else toast.error(utilitiesErrorMessage(err));
          }
        })}
      >
        {needsPrevious ? (
          <FormField label={`Số cũ (${METER_TYPE[type].unit})`} required error={e.previousReading?.message} hint="Lần ghi đầu tiên của phòng: nhập số hiện có trên đồng hồ trước kỳ này.">
            <input className="input" inputMode="decimal" {...form.register('previousReading')} />
          </FormField>
        ) : (
          <FormField label={`Số cũ (${METER_TYPE[type].unit})`} hint="Tự lấy từ chỉ số mới của kỳ trước, không sửa ở đây.">
            <input className="input" value={previous ? formatDecimal(previous) : ''} readOnly disabled />
          </FormField>
        )}
        <FormField label={`Số mới (${METER_TYPE[type].unit})`} required error={e.currentReading?.message} hint="Không nhỏ hơn số cũ; tối đa 3 chữ số lẻ.">
          <input className="input" inputMode="decimal" {...form.register('currentReading')} />
        </FormField>
        <div className="form-actions">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" variant="dark" loading={record.isPending}>
            Lưu chỉ số
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AdjustMeterModal({ ws, room, reading, isFirst, onClose }: { ws: string; room: ManagedRoom; reading: MeterReadingItem; isFirst: boolean; onClose: () => void }) {
  const adjust = useAdjustMeter(ws, room.buildingId, room.id);
  const toast = useToast();
  const form = useForm<AdjustForm>({
    resolver: zodResolver(adjustSchema(isFirst, reading.previousReading, reading.currentReading)),
    defaultValues: { currentReading: reading.currentReading, previousReading: reading.previousReading, reason: '' },
  });
  const e = form.formState.errors;
  return (
    <Modal open title={`Điều chỉnh ${METER_TYPE[reading.meterType].label.toLowerCase()} — phòng ${room.code}`} description={`Kỳ ${periodLabel(reading.period)} • bản điều chỉnh được lưu kèm lý do, không xóa số liệu cũ.`} onClose={onClose}>
      <form
        className="stack"
        noValidate
        onSubmit={form.handleSubmit(async (v) => {
          try {
            await adjust.mutateAsync({ id: reading.id, input: { currentReading: v.currentReading, previousReading: isFirst ? v.previousReading : undefined, reason: v.reason } });
            toast.success('Đã điều chỉnh chỉ số.');
            onClose();
          } catch (err) {
            const a = toApiError(err);
            if (a.isConflict) form.setError('currentReading', { message: utilitiesErrorMessage(err) });
            else toast.error(utilitiesErrorMessage(err));
          }
        })}
      >
        {isFirst ? (
          <FormField label={`Số cũ (${METER_TYPE[reading.meterType].unit})`} required error={e.previousReading?.message} hint="Chỉ sửa được số cũ khi chưa có kỳ nào trước đó.">
            <input className="input" inputMode="decimal" {...form.register('previousReading')} />
          </FormField>
        ) : (
          <FormField label={`Số cũ (${METER_TYPE[reading.meterType].unit})`} hint="Nối chuỗi với kỳ trước nên không sửa được.">
            <input className="input" value={formatDecimal(reading.previousReading)} readOnly disabled />
          </FormField>
        )}
        <FormField label={`Số mới (${METER_TYPE[reading.meterType].unit})`} required error={e.currentReading?.message}>
          <input className="input" inputMode="decimal" {...form.register('currentReading')} />
        </FormField>
        <FormField label="Lý do điều chỉnh" required error={e.reason?.message}>
          <textarea className="textarea" maxLength={500} {...form.register('reason')} />
        </FormField>
        <div className="form-actions">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" variant="dark" loading={adjust.isPending}>
            Lưu điều chỉnh
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function HistoryModal({ reading, onClose }: { reading: MeterReadingItem; onClose: () => void }) {
  return (
    <Modal open title={`Lịch sử điều chỉnh — kỳ ${periodLabel(reading.period)}`} onClose={onClose}>
      <ul className="list-plain stack">
        {reading.adjustments.map((a) => (
          <li key={a.id}>
            <strong>Lần {a.revision}</strong> • {formatDateTime(a.createdAt)}
            <p className="text-sm">
              {formatDecimal(a.oldPreviousReading)} → {formatDecimal(a.oldCurrentReading)} thành {formatDecimal(a.newPreviousReading)} → {formatDecimal(a.newCurrentReading)}
            </p>
            <p className="cell-sub">Lý do: {a.reason}</p>
          </li>
        ))}
      </ul>
      <div className="form-actions">
        <Button variant="secondary" onClick={onClose}>
          Đóng
        </Button>
      </div>
    </Modal>
  );
}
