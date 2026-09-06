import { useState } from 'react';
import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { warehouseSchema, type WarehouseInput } from '@cryotech/shared-types';
import { formatNumber } from '@cryotech/shared-types';
import { warehousesApi, type WarehouseWithStats } from '@/api/warehouses.api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Plus, Loader2, Pencil, Trash2, Warehouse, MapPin } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { useListSearch } from '@/hooks/use-list-search';
import { apiMessage } from '@/lib/api-error';
import { toast } from 'sonner';

export default function WarehousesPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseWithStats | null>(null);

  const { value: searchValue, setValue: setSearchValue, search } = useListSearch();
  const { data: warehouses, isLoading } = useQuery({
    queryKey: ['warehouses', { search }],
    queryFn: () => warehousesApi.findAll({ search }),
    placeholderData: keepPreviousData,
  });

  const createMutation = useMutation({
    mutationFn: (data: WarehouseInput) => editing
      ? warehousesApi.update(editing.id, data)
      : warehousesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      toast.success(editing ? 'Galpon actualizado' : 'Galpon creado');
      setOpen(false);
      setEditing(null);
      form.reset();
    },
    onError: (error) => toast.error(apiMessage(error, 'Error al guardar galpon')),
  });

  const deleteMutation = useMutation({
    mutationFn: warehousesApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      toast.success('Galpon eliminado');
    },
  });

  const form = useForm<WarehouseInput>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: { name: '', capacity: undefined, location: '' },
  });

  function openEdit(w: WarehouseWithStats) {
    setEditing(w);
    form.reset({ name: w.name, capacity: w.capacity ?? undefined, location: w.location || '' });
    setOpen(true);
  }

  function onOpenChange(open: boolean) {
    setOpen(open);
    if (!open) { setEditing(null); form.reset(); }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Galpones" subtitle="Gestion de galpones">
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Nuevo Galpon</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? 'Editar Galpon' : 'Nuevo Galpon'}</DialogTitle></DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>Nombre</FormLabel><FormControl><Input placeholder="Galpon 1" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="capacity" render={({ field }) => (
                  <FormItem><FormLabel>Capacidad (aves)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="location" render={({ field }) => (
                  <FormItem><FormLabel>Ubicacion</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
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
        placeholder="Buscar por codigo, nombre o ubicacion..."
        label="Buscar galpones"
        className="sm:max-w-sm"
        data-testid="warehouses-search"
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : !warehouses || warehouses.length === 0 ? (
        <Card><CardContent><p className="py-8 text-center text-muted-foreground">Sin galpones registrados</p></CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {warehouses.map((w) => (
            <Card key={w.id}>
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Warehouse className="h-4 w-4 text-primary" />
                    <CardTitle className="text-base">{w.name}</CardTitle>
                    {w.isMain && <Badge variant="secondary">Principal</Badge>}
                  </div>
                  {w.code && (
                    <span className="text-xs font-mono text-muted-foreground">{w.code}</span>
                  )}
                  {w.location && (
                    <CardDescription className="mt-1 flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {w.location}
                    </CardDescription>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon-xs" onClick={() => openEdit(w)}><Pencil className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="icon-xs" onClick={() => deleteMutation.mutate(w.id)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Capacidad</span>
                  <span>{w.capacity ? formatNumber(w.capacity) : '-'} aves</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Lotes activos</span>
                  <span>{w.activeBatchCount ?? 0}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
