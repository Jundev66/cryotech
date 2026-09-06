import { useState } from 'react';
import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  saleSchema,
  salePaymentSchema,
  type SaleInput,
  type SalePaymentInput,
  type Sale,
  SALE_TYPE_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  formatDate,
  formatNumber,
  formatUsd,
} from '@cryotech/shared-types';
import { salesApi } from '@/api/sales.api';
import { batchesApi } from '@/api/batches.api';
import { treasuryApi } from '@/api/treasury.api';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Progress } from '@/components/ui/progress';
import { Plus, Loader2, DollarSign, ShoppingCart, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { useListSearch } from '@/hooks/use-list-search';
import { ClientCombobox } from '@/components/forms/client-combobox';
import { BulkSaleDialog } from '@/components/forms/bulk-sale-dialog';
import { apiMessage } from '@/lib/api-error';
import { toast } from 'sonner';

export default function SalesPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { value: searchValue, setValue: setSearchValue, search } = useListSearch();

  const { data: sales, isLoading } = useQuery({
    queryKey: [
      'sales',
      { paymentStatus: paymentFilter !== 'all' ? paymentFilter : undefined, search },
    ],
    queryFn: () => {
      const params: { paymentStatus?: string; search?: string } = { search };
      if (paymentFilter !== 'all') {
        params.paymentStatus = paymentFilter;
      }
      return salesApi.findAll(params);
    },
    placeholderData: keepPreviousData,
  });
  const { data: batches } = useQuery({ queryKey: ['batches'], queryFn: () => batchesApi.findAll() });
  const { data: accounts } = useQuery({
    queryKey: ['treasury', 'accounts'],
    queryFn: () => treasuryApi.listAccounts(),
  });

  const { data: salePayments, isLoading: paymentsLoading } = useQuery({
    queryKey: ['sale-payments', selectedSale?.id],
    queryFn: () => salesApi.getPayments(selectedSale!.id),
    enabled: !!selectedSale?.id,
  });

  const sellBatches = batches?.filter((b) => b.status === 'for_sale' || b.status === 'breeding') ?? [];

  const createMutation = useMutation({
    mutationFn: (data: SaleInput) => salesApi.create({
      ...data,
      saleDate: new Date().toISOString().split('T')[0],
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      toast.success('Venta registrada');
      setOpen(false);
      form.reset();
    },
    onError: (error) => toast.error(apiMessage(error, 'Error al registrar venta')),
  });

  const deleteMutation = useMutation({
    mutationFn: salesApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      toast.success('Venta eliminada');
    },
    onError: (error) => toast.error(apiMessage(error, 'Error al eliminar venta')),
  });

  const paymentMutation = useMutation({
    mutationFn: (data: SalePaymentInput) => salesApi.registerPayment(selectedSale!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['sale-payments', selectedSale?.id] });
      toast.success('Cobro registrado');
      paymentForm.reset();
      // Refresh the selected sale data
      salesApi.findOne(selectedSale!.id).then((updated) => setSelectedSale(updated));
    },
    onError: (error) => toast.error(apiMessage(error, 'Error al registrar cobro')),
  });

  const form = useForm<SaleInput>({
    resolver: zodResolver(saleSchema),
    defaultValues: {
      batchId: '',
      clientId: undefined,
      saleType: 'live',
      quantity: 0,
      weightKg: undefined,
      pricePerKg: undefined,
      pricePerUnit: undefined,
      totalAmount: 0,
      dueDate: '',
      notes: '',
    },
  });

  const paymentForm = useForm<SalePaymentInput>({
    resolver: zodResolver(salePaymentSchema),
    defaultValues: {
      amount: 0,
      paymentDate: new Date().toISOString().split('T')[0],
      notes: '',
    },
  });

  // `Number` even though the type already says `number`: this sum is the one
  // that showed 1.245,512 where there was 177,50 — the amounts arrived as text
  // and `+` concatenated them.
  const totalRevenue = sales?.reduce((sum, s) => sum + Number(s.totalAmount), 0) ?? 0;
  const totalSold = sales?.reduce((sum, s) => sum + Number(s.quantity), 0) ?? 0;

  const handleRowClick = async (sale: Sale) => {
    try {
      const fullSale = await salesApi.findOne(sale.id);
      setSelectedSale(fullSale);
    } catch {
      setSelectedSale(sale);
    }
    setSheetOpen(true);
  };

  const paymentPercentage = selectedSale
    ? selectedSale.totalAmount > 0
      ? Math.min(100, Math.round((selectedSale.paidAmount / selectedSale.totalAmount) * 100))
      : 0
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Ventas" subtitle="Registro de ventas de aves">
        <BulkSaleDialog batches={sellBatches} />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="new-sale"><Plus className="mr-2 h-4 w-4" /> Nueva Venta</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle>Registrar Venta</DialogTitle></DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
                <FormField control={form.control} name="batchId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lote</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger className="w-full" data-testid="sale-batch"><SelectValue placeholder="Seleccionar lote" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {sellBatches.map((b) => (<SelectItem key={b.id} value={b.id}>{b.breed} ({formatNumber(b.currentQuantity)} aves)</SelectItem>))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="clientId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cliente (opcional)</FormLabel>
                    <FormControl>
                      <ClientCombobox value={field.value} onChange={field.onChange} data-testid="sale-client" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="saleType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de venta</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger className="w-full" data-testid="sale-type"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {Object.entries(SALE_TYPE_LABELS).map(([k, v]) => (<SelectItem key={k} value={k}>{v}</SelectItem>))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="quantity" render={({ field }) => (
                    <FormItem><FormLabel>Cantidad</FormLabel><FormControl><Input type="number" data-testid="sale-quantity" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="weightKg" render={({ field }) => (
                    <FormItem><FormLabel>Peso total (kg)</FormLabel><FormControl><Input type="number" step="0.1" data-testid="sale-weight" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="pricePerKg" render={({ field }) => (
                    <FormItem><FormLabel>Precio / kg</FormLabel><FormControl><Input type="number" step="0.01" data-testid="sale-price-kg" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="pricePerUnit" render={({ field }) => (
                    <FormItem><FormLabel>Precio / ave</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="totalAmount" render={({ field }) => (
                  <FormItem><FormLabel>Total</FormLabel><FormControl><Input type="number" step="0.01" data-testid="sale-total" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="dueDate" render={({ field }) => (
                  <FormItem><FormLabel>Fecha de vencimiento (opcional)</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem><FormLabel>Notas</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <Button type="submit" className="w-full" data-testid="submit-sale" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Registrar venta
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <SearchInput
        value={searchValue}
        onChange={setSearchValue}
        placeholder="Buscar por codigo, cliente o lote..."
        label="Buscar ventas"
        className="sm:max-w-sm"
        data-testid="sales-search"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Ingresos Totales</CardDescription>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          {/* Dollars: a sale is priced in $/kg and `total_amount` holds dollars.
              `total_amount_bs` is the bolivar field. */}
          <CardContent><div className="text-2xl font-bold" data-testid="sales-total-revenue">{formatUsd(totalRevenue)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Aves Vendidas</CardDescription>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatNumber(totalSold)}</div></CardContent>
        </Card>
      </div>

      <Tabs value={paymentFilter} onValueChange={setPaymentFilter}>
        <TabsList>
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="pending">Pendientes</TabsTrigger>
          <TabsTrigger value="partial">Parciales</TabsTrigger>
          <TabsTrigger value="paid">Pagados</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : !sales || sales.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground" data-testid="sales-empty">Sin ventas registradas</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Codigo</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Estado Pago</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Saldo Pendiente</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.sort((a, b) => b.saleDate.localeCompare(a.saleDate)).map((sale) => (
                  <TableRow key={sale.id} data-testid="sale-row" data-code={sale.code ?? ''} className="cursor-pointer" onClick={() => handleRowClick(sale)}>
                    <TableCell className="text-muted-foreground text-xs font-mono">{sale.code ?? '-'}</TableCell>
                    <TableCell>{formatDate(sale.saleDate)}</TableCell>
                    <TableCell>{sale.batch?.breed || '-'}</TableCell>
                    <TableCell>{sale.client?.name || '-'}</TableCell>
                    <TableCell>{SALE_TYPE_LABELS[sale.saleType] || sale.saleType}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={PAYMENT_STATUS_COLORS[sale.paymentStatus] || ''}>
                        {PAYMENT_STATUS_LABELS[sale.paymentStatus] || sale.paymentStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatNumber(sale.quantity)}</TableCell>
                    <TableCell className="text-right font-medium">{formatUsd(sale.totalAmount)}</TableCell>
                    <TableCell className="text-right font-medium" data-testid="sale-balance">
                      {formatUsd(sale.totalAmount - sale.paidAmount)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        disabled={sale.paymentStatus !== 'pending'}
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteMutation.mutate(sale.id);
                        }}
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

      {/* Sale detail sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Detalle de Venta</SheetTitle>
          </SheetHeader>

          {selectedSale && (
            <div className="space-y-6 px-4 pb-4">
              {/* Sale info */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground">Informacion de Venta</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Lote:</span>
                    <p className="font-medium">{selectedSale.batch?.breed || '-'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Cliente:</span>
                    <p className="font-medium">{selectedSale.client?.name || '-'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Cantidad:</span>
                    <p className="font-medium">{formatNumber(selectedSale.quantity)} aves</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Fecha:</span>
                    <p className="font-medium">{formatDate(selectedSale.saleDate)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total:</span>
                    <p className="font-medium">{formatUsd(selectedSale.totalAmount)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Estado:</span>
                    <p>
                      <Badge variant="outline" className={PAYMENT_STATUS_COLORS[selectedSale.paymentStatus] || ''}>
                        {PAYMENT_STATUS_LABELS[selectedSale.paymentStatus] || selectedSale.paymentStatus}
                      </Badge>
                    </p>
                  </div>
                  {selectedSale.dueDate && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Vencimiento:</span>
                      <p className="font-medium">{formatDate(selectedSale.dueDate)}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment progress */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Progreso de Pago</h4>
                <Progress value={paymentPercentage} />
                <div className="flex justify-between text-sm">
                  <span>{formatUsd(selectedSale.paidAmount)} pagado</span>
                  <span>{paymentPercentage}%</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Saldo pendiente: <span className="font-medium text-foreground" data-testid="sale-detail-balance">{formatUsd(selectedSale.totalAmount - selectedSale.paidAmount)}</span>
                </p>
              </div>

              {/* Payment history */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Historial de Cobros</h4>
                {paymentsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : !salePayments || salePayments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin cobros registrados</p>
                ) : (
                  <div className="space-y-2">
                    {salePayments.map((payment) => (
                      <div key={payment.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                        <div>
                          <p className="font-medium">{formatUsd(payment.amount)}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(payment.paymentDate)}</p>
                          {payment.notes && <p className="text-xs text-muted-foreground">{payment.notes}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Register payment form */}
              {selectedSale.paymentStatus !== 'paid' && (
                <div className="space-y-3 border-t pt-4">
                  <h4 className="text-sm font-medium">Registrar Cobro</h4>
                  <Form {...paymentForm}>
                    <form onSubmit={paymentForm.handleSubmit((v) => paymentMutation.mutate(v))} className="space-y-3">
                      <FormField control={paymentForm.control} name="amount" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Monto</FormLabel>
                          <FormControl><Input type="number" step="0.01" data-testid="payment-amount" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      {/* Without an account the collection updates the sale but
                          never moves the cash, so the books say you were paid
                          and the bank balance disagrees. */}
                      <FormField control={paymentForm.control} name="accountId" render={({ field }) => (
                        <FormItem>
                          <FormLabel>¿A qué cuenta entró?</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="w-full" data-testid="payment-account">
                                <SelectValue placeholder="Seleccionar cuenta" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {accounts?.map((account) => (
                                <SelectItem key={account.id} value={account.id}>
                                  {account.name} ({account.currency})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={paymentForm.control} name="paymentDate" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fecha de cobro</FormLabel>
                          <FormControl><Input type="date" data-testid="payment-date" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={paymentForm.control} name="notes" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Notas (opcional)</FormLabel>
                          <FormControl><Textarea rows={2} {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <Button type="submit" className="w-full" size="sm" data-testid="submit-payment" disabled={paymentMutation.isPending}>
                        {paymentMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Registrar Cobro
                      </Button>
                    </form>
                  </Form>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
