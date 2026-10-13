import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Đồng bộ bộ lọc với query string (chia sẻ link / back-forward giữ nguyên bộ lọc).
 * Giá trị rỗng sẽ bị xóa khỏi URL. Tham số `mock` (giả lập lỗi) luôn được giữ.
 */
export function useSearchState<K extends string>(keys: readonly K[]) {
  const [params, setParams] = useSearchParams();

  const values = useMemo(() => {
    const out = {} as Record<K, string>;
    keys.forEach((k) => (out[k] = params.get(k) ?? ''));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, keys.join('|')]);

  const set = useCallback(
    (patch: Partial<Record<K, string | number | undefined>>, opts: { resetPage?: boolean } = { resetPage: true }) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          Object.entries(patch).forEach(([k, v]) => {
            if (v === undefined || v === '' || v === null) next.delete(k);
            else next.set(k, String(v));
          });
          if (opts.resetPage && !('page' in patch)) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return [values, set] as const;
}
