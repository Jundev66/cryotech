import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { clientSchema, formatUsd, type ClientInput } from '@cryotech/shared-types';
import type { Client } from '@cryotech/shared-types';
import { clientsApi } from '@/api/clients.api';
import { reportsApi } from '@/api/reports.api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Plus, Loader2, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { useListSearch } from '@/hooks/use-list-search';
import { apiMessage } from '@/lib/api-error';
import { toast } from 'sonner';

const PAGE_SIZE = 10;

export default function ClientsPage() {
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [page, setPage] = useState(1);

  const { value: searchValue, setValue: setSearchValue, search } = useListSearch();

  const { data: clients, isLoading, isFetching } = useQuery({
    queryKey: ['clients', { search }],
    queryFn: () => clientsApi.findAll({ search }),
    placeholderData: keepPreviousData,
  });

  const { data: receivables } = useQuery({
    queryKey: ['reports', 'receivables-by-client'],
    queryFn: () => reportsApi.getReceivablesByClient(),
  });

  const owedByClient = useMemo(
    () =>
      new Map(
        (receivables?.clients ?? [])
          .filter((row) => row.clientId)
          .map((row) => [row.clientId as string, row]),
      ),
    [receivables],
  );

  const updateMutation = useMutation({
    mutationFn: (data: ClientInput) => clientsApi.update(editing!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Cliente actualizado');
      setEditOpen(false);
      setEditing(null);
      form.reset();
    },
    onError: (error) => toast.error(apiMessage(error, 'Error al actualizar cliente')),
  });

  const deleteMutation = useMutation({
    mutationFn: clientsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Cliente eliminado');
    },
    onError: (error) => toast.error(apiMessage(error, 'No se pudo eliminar el cliente')),
  });

  function confirmDelete(client: Client) {
    const debt = owedByClient.get(client.id);
    const message = debt
      ? `${client.name} debe ${formatUsd(debt.owedUsd)}. No se puede eliminar hasta cobrar o anular esas ventas.`
      : `¿Eliminar a ${client.name}? No se puede deshacer.`;
    if (debt) {
      toast.error(message);
      return;
    }
    if (window.confirm(message)) deleteMutation.mutate(client.id);
  }

  const form = useForm<ClientInput>({
    resolver: zodResolver(clientSchema),
    defaultValues: { name: '', phone: '', email: '', address: '', notes: '' },
  });

  function openEdit(client: Client) {
    setEditing(client);
    form.reset({
      name: client.name,
      phone: client.phone || '',
      email: client.email || '',
      address: client.address || '',
      notes: client.notes || '',
    });
    setEditOpen(true);
  }

  const allClients = clients || [];
  const totalPages = Math.ceil(allClients.length / PAGE_SIZE) || 1;
  const paginatedClients = allClients.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PageHeader title="Clientes" subtitle="Directorio y cuentas por cobrar de clientes">
        <Button asChild data-testid="new-client">
          <Link to="/dashboard/clients/new">
            <Plus className="mr-2 h-4 w-4" /> Nuevo Cliente
          </Link>
        </Button>
      </PageHeader>

      <SearchInput
        value={searchValue}
        onChange={(val) => {
          setSearchValue(val);
          setPage(1);
        }}
        placeholder="Buscar por nombre, teléfono, email o código..."
        label="Buscar clientes"
        className="sm:max-w-sm"
        data-testid="clients-search"
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : allClients.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground" data-testid="clients-empty">
              {search ? `Sin resultados para "${search}"` : 'Sin clientes registrados'}
            </p>
          ) : (
            <>
              <Table className={isFetching ? 'opacity-60 transition-opacity' : undefined}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Dirección</TableHead>
                    <TableHead className="text-right">Debe</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedClients.map((client) => {
                    const debt = owedByClient.get(client.id);
                    return (
                      <TableRow key={client.id} data-testid="client-row" data-code={client.code ?? ''}>
                        <TableCell className="text-muted-foreground text-xs font-mono">{client.code ?? '-'}</TableCell>
                        <TableCell className="font-medium">{client.name}</TableCell>
                        <TableCell>{client.phone || '-'}</TableCell>
                        <TableCell>{client.email || '-'}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{client.address || '-'}</TableCell>
                        <TableCell className="text-right" data-testid="client-owed">
                          {debt ? (
                            <span className={debt.overdueCount > 0 ? 'font-medium text-red-600' : 'font-medium'}>
                              {formatUsd(debt.owedUsd)}
                              {debt.overdueCount > 0 ? ` · ${debt.overdueCount} vencida${debt.overdueCount === 1 ? '' : 's'}` : ''}
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon-xs" onClick={() => openEdit(client)} title="Editar"><Pencil className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="icon-xs" onClick={() => confirmDelete(client)} title="Eliminar"><Trash2 className="h-3 w-3" /></Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <PaginationControls
                page={page}
                totalPages={totalPages}
                totalItems={allClients.length}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
                itemName="clientes"
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Dialog para edición rápida */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Cliente</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => updateMutation.mutate(v))} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Nombre *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem><FormLabel>Teléfono</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="address" render={({ field }) => (
                <FormItem><FormLabel>Dirección</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
              )} />
              <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar Cambios
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
