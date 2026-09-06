import { useState } from 'react';
import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { clientSchema, type ClientInput } from '@cryotech/shared-types';
import type { Client } from '@cryotech/shared-types';
import { clientsApi } from '@/api/clients.api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Plus, Loader2, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { useListSearch } from '@/hooks/use-list-search';
import { apiMessage } from '@/lib/api-error';
import { toast } from 'sonner';

export default function ClientsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);

  const { value: searchValue, setValue: setSearchValue, search } = useListSearch();

  const { data: clients, isLoading, isFetching } = useQuery({
    queryKey: ['clients', { search }],
    queryFn: () => clientsApi.findAll({ search }),
    // Otherwise the table collapses to a skeleton between keystrokes.
    placeholderData: keepPreviousData,
  });

  const createMutation = useMutation({
    mutationFn: (data: ClientInput) => editing
      ? clientsApi.update(editing.id, data)
      : clientsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success(editing ? 'Cliente actualizado' : 'Cliente creado');
      setOpen(false);
      setEditing(null);
      form.reset();
    },
    onError: (error) => toast.error(apiMessage(error, 'Error al guardar cliente')),
  });

  const deleteMutation = useMutation({
    mutationFn: clientsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Cliente eliminado');
    },
  });

  const form = useForm<ClientInput>({
    resolver: zodResolver(clientSchema),
    defaultValues: { name: '', phone: '', email: '', address: '' },
  });

  function openEdit(client: Client) {
    setEditing(client);
    form.reset({ name: client.name, phone: client.phone || '', email: client.email || '', address: client.address || '' });
    setOpen(true);
  }

  function onOpenChange(open: boolean) {
    setOpen(open);
    if (!open) { setEditing(null); form.reset(); }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Clientes" subtitle="Gestion de clientes">
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Nuevo Cliente</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? 'Editar Cliente' : 'Nuevo Cliente'}</DialogTitle></DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>Nombre</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem><FormLabel>Telefono</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="address" render={({ field }) => (
                  <FormItem><FormLabel>Direccion</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editing ? 'Actualizar' : 'Crear'}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <SearchInput
        value={searchValue}
        onChange={setSearchValue}
        placeholder="Buscar por nombre, telefono, email o codigo..."
        label="Buscar clientes"
        className="sm:max-w-sm"
        data-testid="clients-search"
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : !clients || clients.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground" data-testid="clients-empty">
              {search ? `Sin resultados para "${search}"` : 'Sin clientes registrados'}
            </p>
          ) : (
            <Table className={isFetching ? 'opacity-60 transition-opacity' : undefined}>
              <TableHeader>
                <TableRow>
                  <TableHead>Codigo</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Telefono</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Direccion</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((client) => (
                  <TableRow key={client.id} data-testid="client-row" data-code={client.code ?? ''}>
                    <TableCell className="text-muted-foreground text-xs font-mono">{client.code ?? '-'}</TableCell>
                    <TableCell className="font-medium">{client.name}</TableCell>
                    <TableCell>{client.phone || '-'}</TableCell>
                    <TableCell>{client.email || '-'}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{client.address || '-'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon-xs" onClick={() => openEdit(client)}><Pencil className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon-xs" onClick={() => deleteMutation.mutate(client.id)}><Trash2 className="h-3 w-3" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
