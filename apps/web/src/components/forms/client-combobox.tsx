import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Client } from '@cryotech/shared-types';
import { clientsApi } from '@/api/clients.api';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { useDebouncedValue } from '@/hooks/use-debounced-value';

/** Enough to choose from without turning the popover into a scroll marathon. */
const LIMIT = 20;

interface ClientComboboxProps {
  value?: string;
  onChange: (clientId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  'data-testid'?: string;
}

/**
 * Picks a client by typing.
 *
 * The list is server-filtered, which creates a wrinkle worth naming: once you
 * type, the client you already picked usually drops out of the results, and a
 * combobox that derives its label from the current options would blank its own
 * trigger. So the last selection is kept and merged back in.
 */
export function ClientCombobox({
  value,
  onChange,
  disabled,
  placeholder = 'Seleccionar cliente',
  'data-testid': testId,
}: ClientComboboxProps) {
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim(), 300);
  const [selected, setSelected] = useState<Client | null>(null);

  const { data: clients, isFetching } = useQuery({
    queryKey: ['clients', { search: debounced || undefined, limit: LIMIT }],
    queryFn: () => clientsApi.findAll({ search: debounced || undefined, limit: LIMIT }),
    // Without this the list empties on every keystroke and the popover flickers.
    placeholderData: keepPreviousData,
  });

  // Remember whichever row matches the current value while it is still on
  // screen; after that the trigger relies on this copy.
  useEffect(() => {
    if (!value) {
      setSelected(null);
      return;
    }
    const match = clients?.find((client) => client.id === value);
    if (match) setSelected(match);
  }, [value, clients]);

  const options: ComboboxOption[] = (clients ?? []).map((client) => ({
    value: client.id,
    label: client.name,
    description: client.phone ?? undefined,
  }));

  if (selected && !options.some((option) => option.value === selected.id)) {
    options.unshift({ value: selected.id, label: selected.name });
  }

  return (
    <Combobox
      value={value}
      onChange={onChange}
      options={options}
      search={search}
      onSearchChange={setSearch}
      loading={isFetching}
      placeholder={placeholder}
      searchPlaceholder="Buscar por nombre o teléfono…"
      emptyMessage="Sin clientes que coincidan"
      disabled={disabled}
      data-testid={testId}
    />
  );
}
