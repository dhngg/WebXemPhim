import { useRef } from 'react';

/** Khóa chống gửi trùng khớp /^[A-Za-z0-9_.:-]{8,100}$/ của backend. */
export function makeIdempotencyKey(prefix: string): string {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${id}`;
}

/**
 * Một khóa cho mỗi "ý định" ghi sổ: thử lại cùng nội dung (kể cả sau lỗi mạng) dùng lại khóa để backend trả bản ghi cũ;
 * nội dung đổi = thao tác mới = khóa mới. Hook sinh khóa khi hộp thoại mở và giữ nguyên đến khi nội dung (`signature`) đổi.
 */
export function useIdempotencyKey(prefix: string) {
  const state = useRef<{ key: string; signature: string | null }>({ key: makeIdempotencyKey(prefix), signature: null });
  return (signature: string): string => {
    if (state.current.signature !== null && state.current.signature !== signature) {
      state.current = { key: makeIdempotencyKey(prefix), signature };
    } else {
      state.current.signature = signature;
    }
    return state.current.key;
  };
}
