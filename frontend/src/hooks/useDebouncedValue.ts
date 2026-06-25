import { useEffect, useState } from 'react';

/**
 * Returns `value` delayed by `ms` after it last changed. Used to keep
 * map-driven queries (panel, contextual) from refetching on every frame while
 * the user pans the map — they only refire once the viewport settles. Combined
 * with React Query's `placeholderData: keepPreviousData`, this stops the list
 * from flashing during a pan.
 */
export function useDebouncedValue<T>(value: T, ms = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
