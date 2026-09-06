import { useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { batchWithEntriesSchema, BREEDS, BATCH_STATUSES, type BatchWithEntriesInput } from '@cryotech/shared-types';
import { BATCH_STATUS_LABELS, BATCH_STATUS_COLORS } from '@cryotech/shared-types';
import { formatDate } from '@cryotech/shared-types';
import { batchesApi } from '@/api/batches.api';
import { warehousesApi } from '@/api/warehouses.api';
import { productsApi } from '@/api/products.api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Eye, Loader2, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { useListSearch } from '@/hooks/use-list-search';
import { apiMessage } from '@/lib/api-error';
import { toast } from 'sonner';

export default function BatchesPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  const { value: searchValue, setValue: setSearchValue, search } = useListSearch();
  const { data: batches, isLoading } = useQuery({
    queryKey: ['batches', { search }],
    queryFn: () => batchesApi.findAll({ search }),
    placeholderData: keepPreviousData,
  });

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => warehousesApi.findAll(),
  });

  const createMutation = useMutation({
    mutationFn: (data: BatchWithEntriesInput) =>
      batchesApi.create({ ...data, currentQuantity: data.initialQuantity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      toast.success('Lote creado exitosamente');
      setOpen(false);
      form.reset();
    },
    onError: (error) => toast.error(apiMessage(error, 'Error al crear el lote')),
  });

  const form = useForm<BatchWithEntriesInput>({
    resolver: zodResolver(batchWithEntriesSchema),
    defaultValues: {
      warehouseId: '',
      breed: '',
      startDate: new Date().toISOString().split('T')[0],
      initialQuantity: 0,
      purchasePricePerUnit: undefined,
      notes: '',
      entryLines: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'entryLines',
  });

  const { data: allProducts } = useQuery({
    queryKey: ['products'],
    queryFn: () => productsApi.findAll(),
  });

  const filtered = batches?.filter(
    (b) => statusFilter === 'all' || b.status === statusFilter,
  ) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Lotes" subtitle="Gestion de lotes de aves">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="new-batch"><Plus className="mr-2 h-4 w-4" /> Nuevo Lote</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Crear Nuevo Lote</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
                <FormField control={form.control} name="warehouseId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Galpon</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger className="w-full" data-testid="batch-warehouse"><SelectValue placeholder="Seleccionar galpon" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {warehouses?.map((w) => (
                          <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="breed" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Raza</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger className="w-full" data-testid="batch-breed"><SelectValue placeholder="Seleccionar raza" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {BREEDS.map((b) => (<SelectItem key={b} value={b}>{b}</SelectItem>))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="startDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de inicio</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="initialQuantity" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cantidad inicial</FormLabel>
                    <FormControl><Input type="number" placeholder="5000" data-testid="batch-quantity" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="purchasePricePerUnit" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Precio por ave (opcional)</FormLabel>
                    <FormControl><Input type="number" step="0.01" placeholder="0.00" data-testid="batch-price" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas (opcional)</FormLabel>
                    <FormControl><Textarea placeholder="Observaciones..." {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                {/* Insumos Iniciales */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <FormLabel className="text-base">Insumos Iniciales (opcional)</FormLabel>
                    <Button type="button" variant="outline" size="sm" onClick={() => append({ productId: '', quantity: 0, costPerUnit: undefined, notes: '' })}>
                      <Plus className="mr-1 h-3 w-3" /> Agregar insumo
                    </Button>
                  </div>
                  {fields.map((field, index) => (
                    <div key={field.id} className="flex items-start gap-2 rounded-md border p-3">
                      <FormField control={form.control} name={`entryLines.${index}.productId`} render={({ field: f }) => (
                        <FormItem className="flex-1">
                          <Select onValueChange={f.onChange} value={f.value}>
                            <FormControl><SelectTrigger className="w-full" data-testid="line-product"><SelectValue placeholder="Producto" /></SelectTrigger></FormControl>
                            <SelectContent>
                              {allProducts?.map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.name} ({p.measurementUnit?.abbreviation ?? ''})</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name={`entryLines.${index}.quantity`} render={({ field: f }) => (
                        <FormItem className="w-24">
                          <FormControl><Input type="number" step="0.1" placeholder="Cant." data-testid="line-quantity" {...f} /></FormControl>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name={`entryLines.${index}.costPerUnit`} render={({ field: f }) => (
                        <FormItem className="w-24">
                          <FormControl><Input type="number" step="0.01" placeholder="Costo/u" data-testid="line-cost" {...f} /></FormControl>
                        </FormItem>
                      )} />
                      <Button type="button" variant="ghost" size="icon-xs" onClick={() => remove(index)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button type="submit" className="w-full" data-testid="submit-batch" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Crear lote
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <SearchInput
        value={searchValue}
        onChange={setSearchValue}
        placeholder="Buscar por codigo, raza o galpon..."
        label="Buscar lotes"
        className="sm:max-w-sm"
        data-testid="batches-search"
      />

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList>
          <TabsTrigger value="all">Todos</TabsTrigger>
          {BATCH_STATUSES.map((s) => (
            <TabsTrigger key={s} value={s}>{BATCH_STATUS_LABELS[s]}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={statusFilter}>
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="space-y-2 p-4">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : filtered.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">No hay lotes registrados</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Codigo</TableHead>
                      <TableHead>Raza</TableHead>
                      <TableHead>Galpon</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Fecha inicio</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((batch) => (
                      <TableRow key={batch.id} data-testid="batch-row" data-code={batch.code ?? ''}>
                        <TableCell className="text-muted-foreground text-xs font-mono">{batch.code ?? '-'}</TableCell>
                        <TableCell className="font-medium">{batch.breed}</TableCell>
                        <TableCell>{batch.warehouse?.name || '-'}</TableCell>
                        <TableCell className="text-right" data-testid="batch-row-quantity">{batch.currentQuantity.toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={BATCH_STATUS_COLORS[batch.status]}>
                            {BATCH_STATUS_LABELS[batch.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(batch.startDate)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" asChild>
                            <Link to={`/dashboard/batches/${batch.id}`}>
                              <Eye className="mr-1 h-4 w-4" /> Ver
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
