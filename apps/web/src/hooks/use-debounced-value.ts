import { useEffect, useState } from 'react';

/**
 * Trails a value by `delay` ms.
 *
 * What the user types has to show up instantly; what the server is asked for
 * does not. Without this, every keystroke is a request.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
