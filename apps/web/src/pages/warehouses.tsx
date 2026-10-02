import { useState } from 'react';
import { Link } from 'react-router';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Plus, Loader2, Pencil, Trash2, Warehouse, MapPin } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { useListSearch } from '@/hooks/use-list-search';
import { apiMessage } from '@/lib/api-error';
import { toast } from 'sonner';

const PAGE_SIZE = 9;

export default function WarehousesPage() {
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseWithStats | null>(null);
  const [page, setPage] = useState(1);

  const { value: searchValue, setValue: setSearchValue, search } = useListSearch();
  const { data: warehouses, isLoading } = useQuery({
    queryKey: ['warehouses', { search }],
    queryFn: () => warehousesApi.findAll({ search }),
    placeholderData: keepPreviousData,
  });

  const updateMutation = useMutation({
    mutationFn: (data: WarehouseInput) => warehousesApi.update(editing!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      toast.success('Galpón actualizado');
      setEditOpen(false);
      setEditing(null);
      form.reset();
    },
    onError: (error) => toast.error(apiMessage(error, 'Error al guardar galpón')),
  });

  const deleteMutation = useMutation({
    mutationFn: warehousesApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      toast.success('Galpón eliminado');
    },
  });

  const form = useForm<WarehouseInput>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: { name: '', capacity: undefined, location: '' },
  });

  function openEdit(w: WarehouseWithStats) {
    setEditing(w);
    form.reset({ name: w.name, capacity: w.capacity ?? undefined, location: w.location || '' });
    setEditOpen(true);
  }

  const allWarehouses = warehouses || [];
  const totalPages = Math.ceil(allWarehouses.length / PAGE_SIZE) || 1;
  const paginatedWarehouses = allWarehouses.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PageHeader title="Galpones" subtitle="Gestión de galpones y capacidad instalada">
        <Button asChild data-testid="new-warehouse">
          <Link to="/dashboard/warehouses/new">
            <Plus className="mr-2 h-4 w-4" /> Nuevo Galpón
          </Link>
        </Button>
      </PageHeader>

      <SearchInput
        value={searchValue}
        onChange={(val) => {
          setSearchValue(val);
          setPage(1);
        }}
        placeholder="Buscar por código, nombre o ubicación..."
        label="Buscar galpones"
        className="sm:max-w-sm"
        data-testid="warehouses-search"
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : allWarehouses.length === 0 ? (
        <Card><CardContent><p className="py-8 text-center text-muted-foreground">Sin galpones registrados</p></CardContent></Card>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {paginatedWarehouses.map((w) => (
              <Card key={w.id} className="hover:border-primary/40 transition-colors">
                <CardHeader className="flex flex-row items-start justify-between pb-3">
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
                    <Button variant="ghost" size="icon-xs" onClick={() => openEdit(w)} title="Editar"><Pencil className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon-xs" onClick={() => deleteMutation.mutate(w.id)} title="Eliminar"><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 pt-0 text-sm">
                  {w.capacity && (
                    <div className="flex justify-between text-muted-foreground text-xs">
                      <span>Capacidad máxima:</span>
                      <span className="font-semibold text-foreground">{formatNumber(w.capacity)} aves</span>
                    </div>
                  )}
                  {w.activeBatchCount !== undefined && (
                    <div className="flex justify-between text-muted-foreground text-xs">
                      <span>Lotes activos:</span>
                      <span className="font-medium text-foreground">{w.activeBatchCount}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <PaginationControls
            page={page}
            totalPages={totalPages}
            totalItems={allWarehouses.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            itemName="galpones"
          />
        </div>
      )}

      {/* Dialog para edición rápida */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Galpón</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => updateMutation.mutate(v))} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Nombre *</FormLabel><FormControl><Input placeholder="Galpón 1" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="capacity" render={({ field }) => (
                <FormItem><FormLabel>Capacidad (aves)</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="location" render={({ field }) => (
                <FormItem><FormLabel>Ubicación</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
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
