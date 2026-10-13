import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Clock } from 'lucide-react';
import { Badge, Button, ButtonLink, ErrorState, FormField, LoadingBlock, PageHeader, Section, StatusBadge, useToast } from '@/components/ui';
import { useRoom } from '@/features/rooms/hooks';
import { useCurrentUser } from '@/features/auth/hooks';
import { useCreateViewing } from '@/features/viewings/hooks';
import { VIEWING_SLOTS, toVietnamIso, viewingSchema, type ViewingForm } from '@/features/viewings/schema';
import { VIEWING_STATUS } from '@/features/viewings/labels';
import type { Viewing } from '@/features/viewings/types';
import { RoomImage } from '@/features/rooms/components/RoomImage';
import { addDays, todayVN } from '@/lib/dates';
import { formatDateTime, formatVnd } from '@/lib/format';
import { toApiError } from '@/services/http/ApiError';

export function ViewingBookingPage() {
  const { roomId } = useParams();
  const room = useRoom(roomId);
  const { data: user } = useCurrentUser();
  const create = useCreateViewing();
  const toast = useToast();
  const [created, setCreated] = useState<Viewing | null>(null);
  const schema = useMemo(() => viewingSchema(), []);
  const today = todayVN();

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<ViewingForm>({
    resolver: zodResolver(schema),
    defaultValues: { date: addDays(today, 1), contactName: user?.fullName ?? '', contactPhone: user?.phone ?? '', note: '' },
  });

  if (room.isLoading) return <div className="container"><LoadingBlock lines={6} /></div>;
  if (room.error || !room.data) return <div className="container"><ErrorState error={room.error} onRetry={() => room.refetch()} /></div>;
  const r = room.data;

  const onSubmit = handleSubmit(async (v) => {
    try {
      const viewing = await create.mutateAsync({
        roomId: r.id,
        scheduledAt: toVietnamIso(v.date, v.time),
        contactName: v.contactName,
        contactPhone: v.contactPhone,
        note: v.note || undefined,
      });
      setCreated(viewing);
    } catch (e) {
      const err = toApiError(e);
      Object.entries(err.fieldErrors ?? {}).forEach(([field, message]) => setError(field as keyof ViewingForm, { message }));
      toast.error(err.message);
    }
  });

  if (created) {
    return (
      <div className="container" style={{ maxWidth: 640, paddingTop: 'var(--space-10)' }}>
        <div className="card card__body state" role="status">
          <div className="state__icon" style={{ background: 'var(--color-success-soft)', color: 'var(--color-success)' }}>
            <CheckCircle2 size={28} aria-hidden="true" />
          </div>
          <h1 className="state__title">Đã gửi yêu cầu xem phòng</h1>
          <p className="state__desc">
            Lịch xem <strong>{formatDateTime(created.scheduledAt)}</strong> tại <strong>{created.roomTitle}</strong> đang chờ chủ trọ xác nhận.
          </p>
          <StatusBadge status={created.status} map={VIEWING_STATUS} />
          <p className="text-xs muted">Thông báo xác nhận qua SMS/Zalo chưa hoạt động trong bản demo — theo dõi trạng thái tại “Lịch xem phòng”.</p>
          <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
            {user ? (
              <ButtonLink to="/my-viewings" variant="dark">
                Xem lịch của tôi
              </ButtonLink>
            ) : (
              <ButtonLink to={`/register`} variant="dark">
                Tạo tài khoản để theo dõi lịch
              </ButtonLink>
            )}
            <ButtonLink to="/rooms" variant="secondary">
              Tiếp tục tìm phòng
            </ButtonLink>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingTop: 'var(--space-6)', maxWidth: 960 }}>
      <PageHeader
        breadcrumb={[{ label: 'Tìm phòng', to: '/rooms' }, { label: r.buildingName, to: `/rooms/${r.id}` }, { label: 'Đặt lịch xem' }]}
        title="Đặt lịch xem phòng"
        description="Chọn thời gian phù hợp, chủ trọ sẽ xác nhận lại với bạn."
      />
      <div className="grid grid--main-side">
        <Section title="Thời gian & liên hệ">
          <form onSubmit={onSubmit} className="stack" noValidate>
            <FormField label="Ngày xem" required error={errors.date?.message}>
              <input type="date" className="input" min={today} max={addDays(today, 30)} {...register('date')} />
            </FormField>
            <Controller
              control={control}
              name="time"
              render={({ field }) => (
                <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend className="field__label">
                    Khung giờ đề xuất <span className="field__required">*</span>
                  </legend>
                  <div className="slot-grid" role="group">
                    {VIEWING_SLOTS.map((slot) => (
                      <button type="button" key={slot} className="slot" aria-pressed={field.value === slot} onClick={() => field.onChange(slot)}>
                        <Clock size={13} aria-hidden="true" /> {slot}
                      </button>
                    ))}
                  </div>
                  {errors.time && (
                    <span className="field__error" role="alert">
                      {errors.time.message}
                    </span>
                  )}
                </fieldset>
              )}
            />
            <div className="form-grid form-grid--2">
              <FormField label="Họ tên" required error={errors.contactName?.message}>
                <input className="input" autoComplete="name" {...register('contactName')} />
              </FormField>
              <FormField label="Số điện thoại" required error={errors.contactPhone?.message}>
                <input className="input" type="tel" autoComplete="tel" inputMode="tel" {...register('contactPhone')} />
              </FormField>
            </div>
            <FormField label="Ghi chú cho chủ trọ" error={errors.note?.message} hint="Ví dụ: đi 2 người, muốn xem thêm phòng khác cùng tòa…">
              <textarea className="textarea" {...register('note')} />
            </FormField>
            {!user && (
              <p className="alert alert--info">
                Bạn đang đặt lịch với tư cách khách. <Link to={`/login?redirect=/rooms/${r.id}/viewing`}>Đăng nhập</Link> để theo dõi lịch trong tài khoản.
              </p>
            )}
            <div className="form-actions">
              <ButtonLink to={`/rooms/${r.id}`} variant="secondary">
                Quay lại
              </ButtonLink>
              <Button type="submit" variant="dark" loading={create.isPending}>
                Gửi yêu cầu xem phòng
              </Button>
            </div>
          </form>
        </Section>
        <aside className="card" style={{ overflow: 'hidden', alignSelf: 'start' }}>
          <div style={{ aspectRatio: '4/3' }}>
            <RoomImage src={r.images[0]} alt={r.title} />
          </div>
          <div className="card__body stack" style={{ gap: 'var(--space-2)' }}>
            <p className="cell-title">{r.title}</p>
            <p className="cell-sub">{r.address}</p>
            <p className="price">{formatVnd(r.price)}/tháng</p>
            {r.verified && <Badge tone="primary">Đã xác thực</Badge>}
          </div>
        </aside>
      </div>
    </div>
  );
}
