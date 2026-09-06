import { useState } from 'react';
import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { productEntrySchema, formatCurrency, formatNumber, formatDate } from '@cryotech/shared-types';
import type { ProductEntry, ProductEntryInput } from '@cryotech/shared-types';
import { ENTRY_STATUS_LABELS, ENTRY_STATUS_COLORS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS } from '@cryotech/shared-types';
import { entriesApi } from '@/api/entries.api';
import { PayablePaymentDialog } from '@/components/forms/payable-payment-dialog';
import { productsApi } from '@/api/products.api';
import { batchesApi } from '@/api/batches.api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Plus, Loader2, Trash2, CheckCircle, Truck, DollarSign } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { useListSearch } from '@/hooks/use-list-search';
import { apiMessage } from '@/lib/api-error';
import { toast } from 'sonner';

export default function EntriesPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showDeliveryCost, setShowDeliveryCost] = useState(false);
  const [payingEntry, setPayingEntry] = useState<ProductEntry | null>(null);
  const { value: searchValue, setValue: setSearchValue, search } = useListSearch();

  const { data: entries, isLoading } = useQuery({
    queryKey: ['entries', { status: statusFilter, search }],
    queryFn: () =>
      entriesApi.findAll({ ...(statusFilter !== 'all' && { status: statusFilter }), search }),
    placeholderData: keepPreviousData,
  });
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: () => productsApi.findAll() });
  const { data: batches } = useQuery({ queryKey: ['batches'], queryFn: () => batchesApi.findAll() });

  const createMutation = useMutation({
    mutationFn: (data: ProductEntryInput) => entriesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Entrada registrada');
      setOpen(false);
      form.reset();
    },
    onError: (error) => toast.error(apiMessage(error, 'Error al registrar entrada')),
  });

  const receiveMutation = useMutation({
    mutationFn: (id: string) => entriesApi.receive(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Entrada recibida');
    },
    onError: (error) => toast.error(apiMessage(error, 'Error al recibir entrada')),
  });

  const deleteMutation = useMutation({
    mutationFn: entriesApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Entrada eliminada');
    },
    onError: (error) => toast.error(apiMessage(error, 'Error al eliminar entrada')),
  });

  const form = useForm<ProductEntryInput>({
    resolver: zodResolver(productEntrySchema),
    defaultValues: {
      productId: '',
      batchId: undefined,
      quantity: 0,
      totalCost: undefined,
      deliveryCost: undefined,
      entryDate: new Date().toISOString().split('T')[0],
      notes: '',
    },
  });

  function onOpenChange(open: boolean) {
    setOpen(open);
    if (!open) { form.reset(); setShowDeliveryCost(false); }
  }

  function getProductName(id: string) {
    return products?.find((p) => p.id === id)?.name ?? '-';
  }

  function getBatchLabel(id: string | null) {
    if (!id) return '-';
    const b = batches?.find((b) => b.id === id);
    return b ? `${b.breed} (${formatDate(b.startDate)})` : '-';
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Entradas de Productos" subtitle="Registro de entradas de insumos al inventario">
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogTrigger asChild>
            <Button data-testid="new-entry"><Plus className="mr-2 h-4 w-4" /> Nueva Entrada</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nueva Entrada de Producto</DialogTitle></DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
                <FormField control={form.control} name="productId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Producto</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger className="w-full" data-testid="entry-product"><SelectValue placeholder="Seleccionar producto" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {products?.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name} ({p.measurementUnit?.abbreviation ?? ''})</SelectItem>))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="quantity" render={({ field }) => (
                    <FormItem><FormLabel>Cantidad</FormLabel><FormControl><Input type="number" step="0.01" data-testid="entry-quantity" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="totalCost" render={({ field }) => (
                    <FormItem><FormLabel>Costo Total</FormLabel><FormControl><Input type="number" step="0.01" data-testid="entry-cost" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor="delivery-toggle" className="text-sm font-medium">Incluir costo de envio</Label>
                  </div>
                  <Switch
                    id="delivery-toggle"
                    checked={showDeliveryCost}
                    onCheckedChange={(checked) => {
                      setShowDeliveryCost(checked);
                      if (!checked) form.setValue('deliveryCost', undefined);
                    }}
                  />
                </div>
                {showDeliveryCost && (
                  <FormField control={form.control} name="deliveryCost" render={({ field }) => (
                    <FormItem><FormLabel>Costo de Envio (Bs)</FormLabel><FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                )}
                <FormField control={form.control} name="entryDate" render={({ field }) => (
                  <FormItem><FormLabel>Fecha de Entrada</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="batchId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lote (opcional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ''}>
                      <FormControl><SelectTrigger className="w-full"><SelectValue placeholder="Sin lote asociado" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {batches?.filter((b) => b.status !== 'planned').map((b) => (<SelectItem key={b.id} value={b.id}>{b.breed} - {formatDate(b.startDate)}</SelectItem>))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem><FormLabel>Notas (opcional)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <Button type="submit" className="w-full" data-testid="submit-entry" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Registrar Entrada
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <SearchInput
        value={searchValue}
        onChange={setSearchValue}
        placeholder="Buscar por codigo, proveedor o producto..."
        label="Buscar compras"
        className="sm:max-w-sm"
        data-testid="entries-search"
      />

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList>
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="pending">Pendientes</TabsTrigger>
          <TabsTrigger value="received">Recibidos</TabsTrigger>
        </TabsList>
        <TabsContent value={statusFilter}>
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="space-y-2 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : !entries || entries.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">Sin entradas registradas</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Codigo</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Producto</TableHead>
                      <TableHead>Lote</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead className="text-right">Costo Total</TableHead>
                      <TableHead className="text-right">Envio</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Pago</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((e) => (
                      <TableRow key={e.id} data-testid="entry-row" data-code={e.code ?? ''}>
                        <TableCell className="text-muted-foreground text-xs font-mono">{e.code ?? '-'}</TableCell>
                        <TableCell>{formatDate(e.entryDate)}</TableCell>
                        <TableCell className="font-medium">{e.product?.name ?? getProductName(e.productId)}</TableCell>
                        <TableCell>{e.batch?.breed ? `${e.batch.breed} (${formatDate(e.batch.startDate)})` : getBatchLabel(e.batchId)}</TableCell>
                        <TableCell className="text-right">{formatNumber(e.quantity, 2)}</TableCell>
                        <TableCell className="text-right">{e.totalCost ? formatCurrency(e.totalCost) : '-'}</TableCell>
                        <TableCell className="text-right">{e.deliveryCost ? formatCurrency(e.deliveryCost) : '-'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={ENTRY_STATUS_COLORS[e.status]}>
                            {ENTRY_STATUS_LABELS[e.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={PAYMENT_STATUS_COLORS[e.paymentStatus] ?? ''}>
                            {PAYMENT_STATUS_LABELS[e.paymentStatus] ?? e.paymentStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right" data-testid="entry-balance">
                          {formatCurrency(entryBalance(e))}
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          {entryBalance(e) > 0 && (
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              data-testid="pay-entry"
                              onClick={() => setPayingEntry(e)}
                              title="Registrar pago"
                            >
                              <DollarSign className="h-3 w-3" />
                            </Button>
                          )}
                          {e.status === 'pending' && (
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => receiveMutation.mutate(e.id)}
                              disabled={receiveMutation.isPending}
                              data-testid="receive-entry"
                              title="Recibir"
                            >
                              <CheckCircle className="h-3 w-3" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => deleteMutation.mutate(e.id)}
                            disabled={e.status === 'received'}
                            title={e.status === 'received' ? 'No se puede eliminar una entrada recibida' : 'Eliminar'}
                          >
                            <Trash2 className="h-3 w-3" />
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

      {/* Paying moves cash only: receiving is what recognised the expense, so
          booking another one here would count the same purchase twice. */}
      <PayablePaymentDialog
        kind="entry"
        payableId={payingEntry?.id ?? null}
        label={`${payingEntry?.code ?? ''} · ${payingEntry?.product?.name ?? ''}`.trim()}
        onClose={() => setPayingEntry(null)}
      />
    </div>
  );
}

/**
 * What is still owed on a purchase: the goods plus the delivery, less what was paid.
 *
 * Every figure goes through `Number` first. The API sends Decimal columns as
 * strings, so `totalCost + deliveryCost` concatenates them instead of adding —
 * Bs 4.000 and Bs 500 came out as Bs 4.000.500.
 */
function entryBalance(entry: ProductEntry): number {
  const total = Number(entry.totalCost ?? 0) + Number(entry.deliveryCost ?? 0);
  return Math.round((total - Number(entry.paidAmount ?? 0)) * 100) / 100;
}
