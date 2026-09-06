import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /**
   * The accessible name. Deliberately separate from `placeholder` and short:
   * the placeholder is a hint that lists the fields searched, and reusing that
   * sentence as the label makes the box answer to every word in it — a label of
   * "Buscar por nombre, teléfono…" collides with the "Nombre" field of any form
   * on the same screen.
   */
  label?: string;
  className?: string;
  autoFocus?: boolean;
  'data-testid'?: string;
}

/**
 * A search box and nothing else — no debounce, no query, no URL.
 *
 * Those belong to the page (see `useListSearch`), so the combobox can reuse
 * this without inheriting a list page's idea of where the term is kept.
 */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Buscar…',
  label = 'Buscar',
  className,
  autoFocus,
  'data-testid': testId,
}: SearchInputProps) {
  return (
    <div className={cn('relative', className)}>
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
      <Input
        type="search"
        role="searchbox"
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        data-testid={testId}
        // `pr-9` keeps the typed text from sliding under the clear button, and
        // the native search cancel widget is hidden so there are not two.
        className="pr-9 pl-9 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value.length > 0 && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Limpiar búsqueda"
          className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-1 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
