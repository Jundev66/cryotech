import { useEffect, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SearchInput } from '@/components/ui/search-input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
}

interface ComboboxProps {
  value?: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  /** The search box is controlled by the parent, which owns the query. */
  search: string;
  onSearchChange: (search: string) => void;
  loading?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  'data-testid'?: string;
}

/**
 * A searchable single-select.
 *
 * Built on the Popover primitive rather than `cmdk` for two reasons: Popover is
 * already a dependency and `cmdk` is not, and — the deciding one — the option
 * markup has to stay ours. The list is a `role="listbox"` of `role="option"`
 * nodes so that every Playwright helper written against the `<Select>` this
 * replaces keeps working untouched.
 */
export function Combobox({
  value,
  onChange,
  options,
  search,
  onSearchChange,
  loading,
  placeholder = 'Seleccionar…',
  searchPlaceholder = 'Buscar…',
  emptyMessage = 'Sin coincidencias',
  disabled,
  className,
  'data-testid': testId,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find((option) => option.value === value);

  // A new result set invalidates whatever row was highlighted.
  useEffect(() => setHighlighted(0), [search, options.length]);

  function select(option: ComboboxOption) {
    onChange(option.value);
    setOpen(false);
    // The next open starts clean; the trigger already shows the choice.
    onSearchChange('');
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (options.length === 0) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const next = (highlighted + delta + options.length) % options.length;
      setHighlighted(next);
      listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' });
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      select(options[highlighted]);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          data-testid={testId}
          className={cn('w-full justify-between font-normal', className)}
        >
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) p-0"
        onKeyDown={onKeyDown}
      >
        <div className="border-b p-2">
          <SearchInput
            value={search}
            onChange={onSearchChange}
            placeholder={searchPlaceholder}
            autoFocus
            data-testid="combobox-search"
          />
        </div>

        <div ref={listRef} role="listbox" className="max-h-64 overflow-y-auto p-1">
          {loading && options.length === 0 ? (
            <div className="text-muted-foreground flex items-center gap-2 px-2 py-6 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
            </div>
          ) : options.length === 0 ? (
            <p className="text-muted-foreground px-2 py-6 text-center text-sm">{emptyMessage}</p>
          ) : (
            options.map((option, index) => (
              <div
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                onClick={() => select(option)}
                onMouseEnter={() => setHighlighted(index)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm',
                  index === highlighted && 'bg-accent text-accent-foreground',
                )}
              >
                <Check
                  className={cn(
                    'h-4 w-4 shrink-0',
                    option.value === value ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <span className="truncate">{option.label}</span>
                {option.description && (
                  <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                    {option.description}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
