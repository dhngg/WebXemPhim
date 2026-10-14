/**
 * Access token JWT ngắn hạn — CHỈ giữ trong bộ nhớ (biến module).
 * Không ghi vào localStorage/sessionStorage/cookie đọc được bằng JS.
 * Tải lại trang sẽ mất token → httpClient gọi refresh (cookie HttpOnly) để lấy token mới.
 */
let accessToken: string | null = null;

export const accessTokenStore = {
  get: () => accessToken,
  set: (token: string) => {
    accessToken = token;
  },
  clear: () => {
    accessToken = null;
  },
};
