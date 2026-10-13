import type { CurrentUser } from './types';

/** Trang đích sau đăng nhập theo vai trò (khi không có ?redirect=). */
export function landingFor(user: CurrentUser): string {
  if (user.globalRole === 'ADMIN') return '/admin';
  if (user.tenantLinked) return '/tenant';
  return '/';
}

/** Chỉ chấp nhận đường dẫn nội bộ để tránh open redirect. */
export function safeRedirect(value: string | null): string | null {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : null;
}
