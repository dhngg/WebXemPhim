import { useState } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, Trash2 } from 'lucide-react';
import { z } from 'zod';
import { Button, ConfirmDialog, EmptyState, FormField, useToast } from '@/components/ui';
import { useRoomImageMutations } from '@/features/property-management/hooks';
import { propertyErrorMessage } from '@/features/property-management/labels';
import type { ManagedRoom, RoomImageItem } from '@/features/property-management/types';
import { RoomImage } from '@/features/rooms/components/RoomImage';

/** URL ảnh: http(s), tối đa 2048 ký tự (đúng DTO backend). Chưa có API upload nên chỉ nhận đường dẫn. */
export const imageUrlSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, 'Nhập đường dẫn ảnh')
    .max(2048, 'Đường dẫn tối đa 2048 ký tự')
    .refine((v) => {
      try {
        const u = new URL(v);
        return u.protocol === 'http:' || u.protocol === 'https:';
      } catch {
        return false;
      }
    }, 'Đường dẫn phải bắt đầu bằng http:// hoặc https://'),
  altText: z.string().trim().max(200, 'Mô tả ảnh tối đa 200 ký tự'),
});

/** Đổi chỗ phần tử `index` với phần tử kế tiếp theo `delta`, trả danh sách id theo thứ tự mới. */
export function moveImage(images: RoomImageItem[], index: number, delta: -1 | 1): string[] {
  const ids = images.map((i) => i.id);
  const target = index + delta;
  if (target < 0 || target >= ids.length) return ids;
  [ids[index], ids[target]] = [ids[target]!, ids[index]!];
  return ids;
}

/**
 * Quản lý ảnh phòng theo URL (siêu dữ liệu): thêm, đổi thứ tự (ảnh đầu là ảnh đại diện), xóa.
 * Không có nút tải file lên vì backend chưa có kho lưu trữ/upload.
 */
export function RoomImagesManager({ ws, room, canWrite }: { ws: string; room: ManagedRoom; canWrite: boolean }) {
  const images = room.images ?? [];
  const m = useRoomImageMutations(ws, room.buildingId, room.id);
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [alt, setAlt] = useState('');
  const [errors, setErrors] = useState<{ url?: string; altText?: string }>({});
  const [removeTarget, setRemoveTarget] = useState<RoomImageItem | null>(null);
  const busy = m.add.isPending || m.reorder.isPending || m.remove.isPending;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = imageUrlSchema.safeParse({ url, altText: alt });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      return setErrors({ url: flat.url?.[0], altText: flat.altText?.[0] });
    }
    setErrors({});
    try {
      await m.add.mutateAsync({ url: parsed.data.url, ...(parsed.data.altText ? { altText: parsed.data.altText } : {}) });
      setUrl('');
      setAlt('');
      toast.success('Đã thêm ảnh.');
    } catch (err) {
      setErrors({ url: propertyErrorMessage(err) });
    }
  };

  return (
    <div className="stack">
      {images.length === 0 ? (
        <EmptyState icon={<ImagePlus size={26} aria-hidden="true" />} title="Phòng chưa có ảnh" description={canWrite ? 'Thêm đường dẫn ảnh bên dưới.' : undefined} />
      ) : (
        <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }} aria-label="Ảnh phòng">
          {images.map((img, i) => (
            <li key={img.id} className="row" style={{ gap: 'var(--space-3)', alignItems: 'center' }}>
              <div style={{ width: 96, height: 72, flex: '0 0 auto', overflow: 'hidden', borderRadius: 'var(--radius-md)' }}>
                <RoomImage src={img.url} alt={img.altText || `Ảnh ${i + 1} của phòng ${room.code}`} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="cell-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {i === 0 ? 'Ảnh đại diện' : `Ảnh ${i + 1}`}
                </p>
                <p className="cell-sub" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {img.altText || img.url}
                </p>
              </div>
              {canWrite && (
                <div className="row">
                  <Button size="sm" variant="ghost" aria-label={`Đưa ảnh ${i + 1} lên`} disabled={busy || i === 0} onClick={() => m.reorder.mutate(moveImage(images, i, -1), { onError: (e) => toast.error(propertyErrorMessage(e)) })}>
                    <ArrowUp size={14} />
                  </Button>
                  <Button size="sm" variant="ghost" aria-label={`Đưa ảnh ${i + 1} xuống`} disabled={busy || i === images.length - 1} onClick={() => m.reorder.mutate(moveImage(images, i, 1), { onError: (e) => toast.error(propertyErrorMessage(e)) })}>
                    <ArrowDown size={14} />
                  </Button>
                  <Button size="sm" variant="ghost" aria-label={`Xóa ảnh ${i + 1}`} disabled={busy} onClick={() => setRemoveTarget(img)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <form className="stack" onSubmit={add} noValidate>
          <div className="form-grid form-grid--2">
            <FormField label="Đường dẫn ảnh (URL)" error={errors.url} hint="Ảnh đã được lưu ở nơi khác; hệ thống chỉ lưu đường dẫn.">
              <input className="input" type="url" inputMode="url" maxLength={2048} placeholder="https://…/phong-101.jpg" value={url} onChange={(e) => setUrl(e.target.value)} />
            </FormField>
            <FormField label="Mô tả ảnh (tùy chọn)" error={errors.altText}>
              <input className="input" maxLength={200} value={alt} onChange={(e) => setAlt(e.target.value)} />
            </FormField>
          </div>
          {url.trim() && imageUrlSchema.shape.url.safeParse(url).success && (
            <div style={{ width: 160, height: 120, overflow: 'hidden', borderRadius: 'var(--radius-md)' }} aria-label="Xem trước ảnh">
              <RoomImage src={url.trim()} alt="Xem trước" />
            </div>
          )}
          <div className="form-actions">
            <Button type="submit" variant="secondary" loading={m.add.isPending}>
              <ImagePlus size={16} aria-hidden="true" /> Thêm ảnh
            </Button>
          </div>
        </form>
      )}
      <ConfirmDialog
        open={Boolean(removeTarget)}
        title="Xóa ảnh này?"
        description="Chỉ xóa đường dẫn ảnh khỏi phòng, không ảnh hưởng tới phòng hay dữ liệu khác."
        confirmLabel="Xóa ảnh"
        danger
        loading={m.remove.isPending}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() =>
          removeTarget &&
          m.remove.mutate(removeTarget.id, {
            onSuccess: () => {
              toast.success('Đã xóa ảnh.');
              setRemoveTarget(null);
            },
            onError: (e) => {
              toast.error(propertyErrorMessage(e));
              setRemoveTarget(null);
            },
          })
        }
      />
    </div>
  );
}
