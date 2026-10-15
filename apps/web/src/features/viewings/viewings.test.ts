import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ViewingRequestResponse } from '@rental/shared';

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock('@/services/http/httpClient', () => ({ httpClient: http }));
vi.mock('@/mocks/handlers/viewings.mock', () => ({ viewingsMock: {} }));

import { ApiError } from '@/services/http/ApiError';
import { mapViewingRequest, viewingsHttp } from './api';
import { viewingErrorMessage } from './labels';
import { VIEWING_SLOTS, toVietnamIso, viewingSchema } from './schema';
import { canCancelViewing } from './types';

const LISTING = '11111111-1111-4111-8111-111111111111';
const ROOM = '22222222-2222-4222-8222-222222222222';
const WHEN = '2026-10-20T07:00:00.000Z';

const dto = (o: Partial<ViewingRequestResponse> = {}): ViewingRequestResponse => ({
  id: 'req-1',
  listingId: LISTING,
  scheduledAt: WHEN,
  message: null,
  status: 'PENDING',
  decisionNote: null,
  decidedAt: null,
  cancelledAt: null,
  createdAt: '2026-10-15T01:00:00.000Z',
  updatedAt: '2026-10-15T01:00:00.000Z',
  requester: { id: 'u1', email: 'a@b.vn', displayName: null },
  room: { id: ROOM, code: 'A-101', buildingName: 'Tòa An Bình' },
  ...o,
});

beforeEach(() => Object.values(http).forEach((f) => f.mockReset()));

describe('viewing request mapper', () => {
  it('keeps listingId and roomId separate and builds the title from backend data only', () => {
    const v = mapViewingRequest(dto({ message: 'đi 2 người', decisionNote: 'Hẹn bạn', status: 'CONFIRMED' }));
    expect(v).toMatchObject({
      id: 'req-1',
      listingId: LISTING,
      roomId: ROOM,
      roomTitle: 'Tòa An Bình – Phòng A-101',
      status: 'CONFIRMED',
      note: 'đi 2 người',
      decisionNote: 'Hẹn bạn',
    });
    expect(v.roomAddress).toBeUndefined();
    expect(v.roomImage).toBeUndefined();
  });

  it('maps null note fields to undefined and supports REJECTED', () => {
    const v = mapViewingRequest(dto({ status: 'REJECTED' }));
    expect(v.note).toBeUndefined();
    expect(v.decisionNote).toBeUndefined();
    expect(v.status).toBe('REJECTED');
  });
});

describe('viewing HTTP adapter', () => {
  it('POST /listings/:listingId/viewing-requests with only scheduledAt and message', async () => {
    http.post.mockResolvedValue(dto());
    await viewingsHttp.create({ listingId: LISTING, scheduledAt: WHEN, note: 'Xin chào' });
    expect(http.post).toHaveBeenCalledWith(`/listings/${LISTING}/viewing-requests`, { scheduledAt: WHEN, message: 'Xin chào' });
    await viewingsHttp.create({ listingId: LISTING, scheduledAt: WHEN });
    expect(http.post).toHaveBeenLastCalledWith(`/listings/${LISTING}/viewing-requests`, { scheduledAt: WHEN });
  });

  it('never sends the room id or contact fields', async () => {
    http.post.mockResolvedValue(dto());
    await viewingsHttp.create({ listingId: LISTING, scheduledAt: WHEN, note: 'x' });
    const [url, body] = http.post.mock.calls[0]!;
    expect(url).not.toContain(ROOM);
    expect(Object.keys(body).sort()).toEqual(['message', 'scheduledAt']);
  });

  it('lists my requests across pages, newest schedule first', async () => {
    http.get
      .mockResolvedValueOnce({ items: [dto({ id: 'a', scheduledAt: '2026-10-18T00:00:00.000Z' })], page: 1, limit: 50, total: 2 })
      .mockResolvedValueOnce({ items: [dto({ id: 'b', scheduledAt: '2026-10-25T00:00:00.000Z' })], page: 2, limit: 50, total: 2 });
    const list = await viewingsHttp.listMine();
    expect(http.get).toHaveBeenNthCalledWith(1, '/viewing-requests/me', { query: { page: 1, limit: 50 } });
    expect(http.get).toHaveBeenNthCalledWith(2, '/viewing-requests/me', { query: { page: 2, limit: 50 } });
    expect(list.map((v) => v.id)).toEqual(['b', 'a']);
  });

  it('an empty list needs a single request', async () => {
    http.get.mockResolvedValue({ items: [], page: 1, limit: 50, total: 0 });
    expect(await viewingsHttp.listMine()).toEqual([]);
    expect(http.get).toHaveBeenCalledTimes(1);
  });

  it('cancels with PATCH /viewing-requests/:id/cancel', async () => {
    http.patch.mockResolvedValue(dto({ status: 'CANCELLED' }));
    const v = await viewingsHttp.cancel('req-1');
    expect(http.patch).toHaveBeenCalledWith('/viewing-requests/req-1/cancel');
    expect(v.status).toBe('CANCELLED');
  });
});

describe('form schema', () => {
  const now = new Date('2026-10-14T03:00:00Z');

  it('has no contact fields; needs date and slot; at least 1h ahead', () => {
    const s = viewingSchema(now);
    expect(s.safeParse({ date: '2026-10-16', time: '14:00' }).success).toBe(true);
    expect(s.safeParse({ date: '2026-10-16' }).success).toBe(false);
    expect(s.safeParse({ date: '2026-10-13', time: '08:30' }).success).toBe(false);
    expect(s.safeParse({ date: '2026-10-16', time: '14:00', note: 'x'.repeat(301) }).success).toBe(false);
  });

  it('converts Vietnam local time to UTC ISO with timezone', () => {
    expect(toVietnamIso('2026-10-16', '14:00')).toBe('2026-10-16T07:00:00.000Z');
    expect(VIEWING_SLOTS).toContain('14:00');
  });
});

describe('cancel rule and error messages', () => {
  it('cancel only PENDING/CONFIRMED', () => {
    expect((['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED'] as const).map(canCancelViewing)).toEqual([true, true, false, false]);
  });

  it('maps backend codes to Vietnamese and 401 to re-login', () => {
    const err = (statusCode: number, code?: string) => new ApiError({ statusCode, code, message: 'raw' });
    expect(viewingErrorMessage(err(409, 'VIEWING_REQUEST_NOT_ELIGIBLE'))).toMatch(/không nhận đặt lịch/);
    expect(viewingErrorMessage(err(409, 'VIEWING_REQUEST_CONFLICT'))).toMatch(/khung giờ/);
    expect(viewingErrorMessage(err(409, 'VIEWING_REQUEST_INVALID_TRANSITION'))).toMatch(/không thể hủy/);
    expect(viewingErrorMessage(err(401))).toMatch(/đăng nhập lại/);
    expect(viewingErrorMessage(err(500, 'SOMETHING'))).toBe('raw');
  });
});
