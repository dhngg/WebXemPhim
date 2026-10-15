import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { Badge, Button, DataTable, DatePicker, EmptyState, FormField, Modal, useToast, type Column } from '@/components/ui';
import { useAddRoomService, useRates, useRoomServices, useStopRoomService } from '@/features/utilities/hooks';
import { BILLING_UNIT, SERVICE_TYPE, utilitiesErrorMessage } from '@/features/utilities/labels';
import { formatUnitPrice } from '@/features/utilities/mappers';
import { roomServiceSchema, stopSchema, type RoomServiceForm, type StopForm } from '@/features/utilities/schemas';
import type { RoomServiceItem } from '@/features/utilities/types';
import type { ManagedRoom } from '@/features/property-management/types';
import { todayVN } from '@/lib/dates';
import { formatDate } from '@/lib/format';
import { toApiError } from '@/services/http/ApiError';

/**
 * Dịch vụ áp dụng cho phòng (Room Services): chỉ dịch vụ được gán rõ ràng cho phòng mới được tính vào hóa đơn.
 * Mã dịch vụ lấy từ bảng giá của tòa nhà; ngày ngừng là ngày kết thúc LOẠI TRỪ.
 */
export function RoomServicesPanel({ ws, room, canWrite }: { ws: string; room: ManagedRoom; canWrite: boolean }) {
  const services = useRoomServices(ws, room.buildingId, room.id);
  const rates = useRates(ws, room.buildingId);
  const add = useAddRoomService(ws, room.buildingId, room.id);
  const stop = useStopRoomService(ws, room.buildingId, room.id);
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [stopping, setStopping] = useState<RoomServiceItem | null>(null);
  const today = todayVN();

  const rateOf = useMemo(() => {
    const m = new Map<string, NonNullable<typeof rates.data>[number]>();
    for (const r of rates.data ?? []) {
      const cur = m.get(r.code);
      if (!cur || r.effectiveFrom > cur.effectiveFrom) m.set(r.code, r);
    }
    return m;
  }, [rates]);
  const codes = [...rateOf.keys()].sort();

  const addForm = useForm<RoomServiceForm>({ resolver: zodResolver(roomServiceSchema), defaultValues: { rateCode: '', effectiveFrom: today } });
  const stopForm = useForm<StopForm>({
    resolver: zodResolver(stopSchema(stopping?.effectiveFrom ?? '0000-00-00')),
    values: { effectiveTo: today > (stopping?.effectiveFrom ?? '') ? today : (stopping?.effectiveFrom ?? today) },
  });

  const phase = (s: RoomServiceItem) => {
    if (s.effectiveFrom > today) return <Badge tone="info">Sắp áp dụng</Badge>;
    if (s.effectiveTo && s.effectiveTo <= today) return <Badge tone="neutral">Đã ngừng</Badge>;
    return <Badge tone="success">{s.effectiveTo ? `Áp dụng đến ${formatDate(s.effectiveTo)}` : 'Đang áp dụng'}</Badge>;
  };

  const columns: Column<RoomServiceItem>[] = [
    {
      key: 'svc',
      header: 'Dịch vụ',
      render: (s) => {
        const r = rateOf.get(s.rateCode);
        return (
          <>
            <p className="cell-title">{r?.name ?? s.rateCode}</p>
            <p className="cell-sub">
              {s.rateCode}
              {r ? ` • ${SERVICE_TYPE[r.serviceType]} • ${formatUnitPrice(r.unitPrice)}/${BILLING_UNIT[r.billingUnit]}` : ''}
            </p>
          </>
        );
      },
    },
    { key: 'from', header: 'Từ ngày', render: (s) => formatDate(s.effectiveFrom) },
    { key: 'to', header: 'Đến (loại trừ)', render: (s) => (s.effectiveTo ? formatDate(s.effectiveTo) : '—') },
    { key: 'st', header: 'Trạng thái', render: phase },
    {
      key: 'act',
      header: '',
      align: 'right',
      render: (s) =>
        canWrite && !s.effectiveTo ? (
          <Button size="sm" variant="ghost" onClick={() => setStopping(s)}>
            Ngừng áp dụng
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
        <p className="text-sm muted">Chỉ các dịch vụ được thêm ở đây mới được tính vào hóa đơn của phòng.</p>
        {canWrite && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              addForm.reset({ rateCode: codes[0] ?? '', effectiveFrom: today });
              setAdding(true);
            }}
          >
            <Plus size={14} aria-hidden="true" /> Thêm dịch vụ
          </Button>
        )}
      </div>
      <DataTable
        columns={columns}
        rows={services.data}
        rowKey={(s) => s.id}
        isLoading={services.isLoading}
        error={services.error}
        onRetry={() => services.refetch()}
        empty={<EmptyState title="Phòng chưa áp dụng dịch vụ nào" description="Thêm dịch vụ từ bảng giá của tòa nhà (Wi-Fi, rác…)." />}
      />

      <Modal open={adding} title="Thêm dịch vụ cho phòng" onClose={() => setAdding(false)}>
        <form
          className="stack"
          noValidate
          onSubmit={addForm.handleSubmit(async (v) => {
            try {
              await add.mutateAsync({ rateCode: v.rateCode, effectiveFrom: v.effectiveFrom });
              toast.success('Đã thêm dịch vụ cho phòng.');
              setAdding(false);
            } catch (e) {
              const err = toApiError(e);
              if (err.isConflict) addForm.setError('rateCode', { message: utilitiesErrorMessage(e) });
              else toast.error(utilitiesErrorMessage(e));
            }
          })}
        >
          {codes.length === 0 && !rates.isLoading ? (
            <p className="alert alert--warning" role="status">
              Tòa nhà chưa có bảng giá. Hãy tạo đơn giá ở mục Bảng giá dịch vụ trước.
            </p>
          ) : (
            <>
              <FormField label="Dịch vụ (mã trong bảng giá)" required error={addForm.formState.errors.rateCode?.message}>
                <select className="select" {...addForm.register('rateCode')}>
                  <option value="">— Chọn dịch vụ —</option>
                  {codes.map((c) => (
                    <option key={c} value={c}>
                      {c} — {rateOf.get(c)?.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Áp dụng từ ngày" required error={addForm.formState.errors.effectiveFrom?.message}>
                <DatePicker {...addForm.register('effectiveFrom')} />
              </FormField>
            </>
          )}
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Hủy
            </Button>
            <Button type="submit" variant="dark" loading={add.isPending} disabled={codes.length === 0}>
              Thêm dịch vụ
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(stopping)} title={`Ngừng áp dụng ${stopping?.rateCode ?? ''}`} onClose={() => setStopping(null)}>
        <form
          className="stack"
          noValidate
          onSubmit={stopForm.handleSubmit(async (v) => {
            if (!stopping) return;
            try {
              await stop.mutateAsync({ id: stopping.id, effectiveTo: v.effectiveTo });
              toast.success('Đã ngừng áp dụng dịch vụ.');
              setStopping(null);
            } catch (e) {
              toast.error(utilitiesErrorMessage(e));
            }
          })}
        >
          <FormField
            label="Ngừng từ ngày (không còn tính từ ngày này)"
            required
            error={stopForm.formState.errors.effectiveTo?.message}
            hint={stopping ? `Phải sau ngày bắt đầu ${formatDate(stopping.effectiveFrom)}. Lịch sử được giữ nguyên.` : undefined}
          >
            <DatePicker {...stopForm.register('effectiveTo')} />
          </FormField>
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setStopping(null)}>
              Hủy
            </Button>
            <Button type="submit" variant="danger" loading={stop.isPending}>
              Ngừng áp dụng
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
