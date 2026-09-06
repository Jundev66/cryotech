import { useState } from 'react';
import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  processingSchema,
  formatCurrency,
  formatUsd,
  formatNumber,
  formatDate,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
} from '@cryotech/shared-types';
import type { Processing, ProcessingInput } from '@cryotech/shared-types';
import { processingApi } from '@/api/processing.api';
import { PayablePaymentDialog } from '@/components/forms/payable-payment-dialog';
import { batchesApi } from '@/api/batches.api';
import { productsApi } from '@/api/products.api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Loader2, DollarSign } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { useListSearch } from '@/hooks/use-list-search';
import { apiMessage } from '@/lib/api-error';
import { toast } from 'sonner';

export default function ProcessingPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [payingProcessing, setPayingProcessing] = useState<Processing | null>(null);

  const { value: searchValue, setValue: setSearchValue, search } = useListSearch();
  const { data: processings, isLoading } = useQuery({
    queryKey: ['processing', { search }],
    queryFn: () => processingApi.findAll({ search }),
    placeholderData: keepPreviousData,
  });
  const { data: allBatches } = useQuery({ queryKey: ['batches'], queryFn: () => batchesApi.findAll() });
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: () => productsApi.findAll() });

  const forSaleBatches = allBatches?.filter((b) => b.status === 'for_sale') ?? [];

  const createMutation = useMutation({
    mutationFn: (data: ProcessingInput) => processingApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processing'] });
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Procesamiento registrado');
      setOpen(false);
      form.reset();
    },
    onError: (error) => toast.error(apiMessage(error, 'Error al registrar procesamiento')),
  });

  const form = useForm<ProcessingInput>({
    resolver: zodResolver(processingSchema),
    defaultValues: {
      batchId: '',
      quantity: 0,
      liveWeightKg: undefined,
      processedWeightKg: undefined,
      costPerBird: undefined,
      costPerKg: undefined,
      totalCost: 0,
      productId: undefined,
      notes: '',
    },
  });

  function onOpenChange(open: boolean) {
    setOpen(open);
    if (!open) form.reset();
  }

  function getBatchLabel(id: string) {
    const b = allBatches?.find((b) => b.id === id);
    return b ? `${b.breed} - ${formatDate(b.startDate)}` : '-';
  }

  function getProductName(id: string | null) {
    if (!id) return '-';
    return products?.find((p) => p.id === id)?.name ?? '-';
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Beneficio / Procesamiento" subtitle="Registro de beneficio de aves">
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogTrigger asChild>
            <Button data-testid="new-processing"><Plus className="mr-2 h-4 w-4" /> Nuevo Procesamiento</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nuevo Procesamiento</DialogTitle></DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
                <FormField control={form.control} name="batchId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lote (En Venta)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger className="w-full" data-testid="processing-batch"><SelectValue placeholder="Seleccionar lote" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {forSaleBatches.map((b) => (<SelectItem key={b.id} value={b.id}>{b.breed} - {formatDate(b.startDate)} ({b.currentQuantity} aves)</SelectItem>))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="quantity" render={({ field }) => (
                  <FormItem><FormLabel>Cantidad de Aves</FormLabel><FormControl><Input type="number" data-testid="processing-quantity" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="liveWeightKg" render={({ field }) => (
                    <FormItem><FormLabel>Peso Vivo (kg)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="processedWeightKg" render={({ field }) => (
                    <FormItem><FormLabel>Peso Procesado (kg)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="costPerBird" render={({ field }) => (
                    <FormItem><FormLabel>Costo por Ave</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="costPerKg" render={({ field }) => (
                    <FormItem><FormLabel>Costo por Kg</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="totalCost" render={({ field }) => (
                  <FormItem><FormLabel>Costo Total ($)</FormLabel><FormControl><Input type="number" step="0.01" data-testid="processing-total-cost" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="productId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Producto Destino (opcional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ''}>
                      <FormControl><SelectTrigger className="w-full"><SelectValue placeholder="Sin producto destino" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {products?.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem><FormLabel>Notas (opcional)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <Button type="submit" className="w-full" data-testid="submit-processing" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Registrar Procesamiento
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <SearchInput
        value={searchValue}
        onChange={setSearchValue}
        placeholder="Buscar por codigo, proveedor o lote..."
        label="Buscar beneficios"
        className="sm:max-w-sm"
        data-testid="processing-search"
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : !processings || processings.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">Sin procesamientos registrados</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Codigo</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Peso Vivo</TableHead>
                  <TableHead className="text-right">Peso Procesado</TableHead>
                  <TableHead className="text-right">Costo Total</TableHead>
                  <TableHead>Pago</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {processings.map((p) => (
                  <TableRow key={p.id} data-testid="processing-row" data-code={p.code ?? ''}>
                    <TableCell className="text-muted-foreground text-xs font-mono">{p.code ?? '-'}</TableCell>
                    <TableCell>{formatDate(p.processingDate)}</TableCell>
                    <TableCell className="font-medium">{p.batch?.breed ? `${p.batch.breed} (${formatDate(p.batch.startDate)})` : getBatchLabel(p.batchId)}</TableCell>
                    <TableCell className="text-right">{formatNumber(p.quantity)}</TableCell>
                    <TableCell className="text-right">{p.liveWeightKg ? `${formatNumber(p.liveWeightKg, 2)} kg` : '-'}</TableCell>
                    <TableCell className="text-right">{p.processedWeightKg ? `${formatNumber(p.processedWeightKg, 2)} kg` : '-'}</TableCell>
                    {/* totalCost is in dollars — printing it with formatCurrency
                        labelled a $3,23 job as "Bs 3,23" when it cost Bs 2.450. */}
                    <TableCell className="text-right" data-testid="processing-cost">
                      {p.totalCostBs !== null ? formatCurrency(p.totalCostBs) : formatUsd(p.totalCost)}
                    </TableCell>
                    <TableCell>
                      {p.isSelfProcessed ? (
                        <span className="text-muted-foreground text-xs">Propio</span>
                      ) : (
                        <Badge variant="outline" className={PAYMENT_STATUS_COLORS[p.paymentStatus] ?? ''}>
                          {PAYMENT_STATUS_LABELS[p.paymentStatus] ?? p.paymentStatus}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right" data-testid="processing-balance">
                      {formatCurrency(processingBalance(p))}
                    </TableCell>
                    <TableCell>{p.product?.name ?? getProductName(p.productId)}</TableCell>
                    <TableCell className="text-right">
                      {processingBalance(p) > 0 && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          data-testid="pay-processing"
                          onClick={() => setPayingProcessing(p)}
                          title="Registrar pago"
                        >
                          <DollarSign className="h-3 w-3" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* The birds already left the batch and the expense is already on the
          books. This only moves the cash. */}
      <PayablePaymentDialog
        kind="processing"
        payableId={payingProcessing?.id ?? null}
        label={`${payingProcessing?.code ?? ''} · ${payingProcessing?.quantity ?? ''} aves`.trim()}
        onClose={() => setPayingProcessing(null)}
      />
    </div>
  );
}

/**
 * What is still owed on a processing job, in bolivares.
 *
 * `Number` on both sides: Decimal columns arrive as strings, and arithmetic on
 * those silently concatenates instead of adding.
 */
function processingBalance(processing: Processing): number {
  const total = Number(processing.totalCostBs ?? 0);
  return Math.round((total - Number(processing.paidAmount ?? 0)) * 100) / 100;
}
