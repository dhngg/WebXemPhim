import { homeFor, type Capabilities } from '@/features/capabilities/model';
import { lastWorkspace } from '@/features/workspaces/hooks';

/** Trang đích sau đăng nhập (khi không có ?redirect=): theo quyền thật; chưa biết quyền thì về trang chủ. */
export function landingFor(capabilities: Capabilities | null | undefined): string {
  return homeFor(capabilities, lastWorkspace.get());
}

/** Chỉ chấp nhận đường dẫn nội bộ để tránh open redirect. */
export function safeRedirect(value: string | null): string | null {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : null;
}
