import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useDebouncedValue } from './use-debounced-value';

/**
 * The search term of a list page: instant on screen, delayed in the URL and in
 * the query.
 *
 * The term lives in `?q=` so a reload keeps the filter and a link carries it.
 * Written with `replace` on purpose — typing eight letters must not leave eight
 * entries in the browser history for the back button to walk through.
 */
export function useListSearch(key = 'q', delay = 300) {
  const [params, setParams] = useSearchParams();
  const [value, setValue] = useState(() => params.get(key) ?? '');
  const debounced = useDebouncedValue(value.trim(), delay);

  useEffect(() => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (debounced) next.set(key, debounced);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  }, [debounced, key, setParams]);

  // `undefined` rather than '' so an empty search drops out of the query key
  // and out of the request params entirely.
  return { value, setValue, search: debounced || undefined };
}
