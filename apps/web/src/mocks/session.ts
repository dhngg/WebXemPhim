/**
 * Giả lập "cookie phiên" cho mock adapter: chỉ lưu ID người dùng demo trong sessionStorage.
 * KHÔNG phải token, KHÔNG dùng khi chạy API thật (khi đó backend set cookie HttpOnly).
 */
const KEY = 'rp.mock.sessionUserId';

export const mockSession = {
  get(): string | null {
    try {
      return sessionStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set(userId: string) {
    try {
      sessionStorage.setItem(KEY, userId);
    } catch {
      /* bỏ qua khi storage bị chặn */
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* bỏ qua */
    }
  },
};
