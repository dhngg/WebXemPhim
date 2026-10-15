import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge, Button, EmptyState, ErrorState, LoadingBlock, useToast } from '@/components/ui';
import { useAmenities, useCreateAmenity, useRoomAmenityToggle } from '@/features/property-management/hooks';
import { propertyErrorMessage } from '@/features/property-management/labels';
import type { ManagedRoom } from '@/features/property-management/types';

/**
 * Tiện ích của phòng. Danh mục tiện ích thuộc workspace (`GET/POST /amenities`); gán/bỏ tiện ích cho phòng
 * là thao tác riêng (`POST/DELETE …/amenities/:id`). Người không có quyền ghi chỉ xem.
 */
export function RoomAmenitiesEditor({ ws, room, canWrite }: { ws: string; room: ManagedRoom; canWrite: boolean }) {
  const catalog = useAmenities(ws);
  const toggle = useRoomAmenityToggle(ws);
  const create = useCreateAmenity(ws);
  const toast = useToast();
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const assigned = new Set(room.amenities.map((a) => a.id));

  if (!canWrite) {
    return room.amenities.length ? (
      <div className="room-card__amenities">
        {room.amenities.map((a) => (
          <Badge key={a.id}>{a.name}</Badge>
        ))}
      </div>
    ) : (
      <p className="text-sm muted">Phòng chưa gán tiện ích nào.</p>
    );
  }
  if (catalog.isLoading) return <LoadingBlock lines={2} />;
  if (catalog.error) return <ErrorState error={catalog.error} onRetry={() => catalog.refetch()} />;

  const change = (amenityId: string, enabled: boolean) =>
    toggle.mutate(
      { buildingId: room.buildingId, roomId: room.id, amenityId, enabled },
      { onError: (e) => toast.error(propertyErrorMessage(e)) },
    );

  const addAmenity = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = name.trim();
    setNameError(null);
    if (!value) return setNameError('Nhập tên tiện ích');
    if (value.length > 100) return setNameError('Tên tối đa 100 ký tự');
    try {
      const created = await create.mutateAsync({ name: value });
      setName('');
      change(created.id, true); // tiện ích vừa tạo được gán luôn cho phòng đang xem
    } catch (err) {
      setNameError(propertyErrorMessage(err));
    }
  };

  return (
    <div className="stack">
      {catalog.data?.length ? (
        <div className="amenity-grid" role="group" aria-label="Tiện ích của phòng">
          {catalog.data.map((a) => (
            <label key={a.id} className="checkbox" style={{ padding: 'var(--space-2) var(--space-3)', background: 'var(--color-surface-muted)', borderRadius: 'var(--radius-md)' }}>
              <input type="checkbox" checked={assigned.has(a.id)} disabled={toggle.isPending} onChange={(e) => change(a.id, e.target.checked)} />
              {a.name}
            </label>
          ))}
        </div>
      ) : (
        <EmptyState title="Workspace chưa có tiện ích nào" description="Thêm tiện ích đầu tiên bên dưới, rồi gán cho phòng." />
      )}
      <form className="row" onSubmit={addAmenity} noValidate style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 220px' }}>
          <input className="input" aria-label="Tên tiện ích mới" placeholder="Tiện ích mới, ví dụ: Máy lọc nước" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
          {nameError && (
            <span className="field__error" role="alert">
              {nameError}
            </span>
          )}
        </div>
        <Button type="submit" variant="secondary" loading={create.isPending}>
          <Plus size={16} aria-hidden="true" /> Thêm tiện ích
        </Button>
      </form>
    </div>
  );
}
