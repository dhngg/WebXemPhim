import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * Cảnh báo khi rời trang có form chưa lưu: chặn điều hướng trong app (useBlocker)
 * và đóng/tải lại tab (beforeunload).
 */
export function useUnsavedChangesWarning(when: boolean, message = 'Bạn có thay đổi chưa lưu. Rời trang?') {
  const blocker = useBlocker(when);

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm(message)) blocker.proceed();
    else blocker.reset();
  }, [blocker, message]);

  useEffect(() => {
    if (!when) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [when]);
}
