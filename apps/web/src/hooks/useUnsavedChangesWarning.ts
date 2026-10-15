import { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * Cảnh báo khi rời trang có form chưa lưu: chặn điều hướng trong app (useBlocker)
 * và đóng/tải lại tab (beforeunload).
 *
 * Form gọi `markSaved()` ngay trước `navigate()` khi lưu thành công. Cờ này được đọc đúng lúc điều hướng
 * (qua ref) nên không phụ thuộc thứ tự render của React hay thời điểm react-hook-form cập nhật
 * `isSubmitSuccessful`. Khi người dùng sửa tiếp (`when` chuyển lại thành true) cờ được đặt lại.
 */
export function useUnsavedChangesWarning(when: boolean, message = 'Bạn có thay đổi chưa lưu. Rời trang?') {
  const whenRef = useRef(when);
  const savedRef = useRef(false);
  whenRef.current = when;

  const blocker = useBlocker(() => whenRef.current && !savedRef.current);

  useEffect(() => {
    if (when) savedRef.current = false;
  }, [when]);

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

  return {
    /** Gọi ngay trước khi điều hướng sau lúc lưu thành công để không hiện cảnh báo "Rời trang?". */
    markSaved: () => {
      savedRef.current = true;
    },
  };
}
