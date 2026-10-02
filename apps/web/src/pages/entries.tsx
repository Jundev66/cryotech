import { useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatCurrency, formatNumber, formatDate } from '@cryotech/shared-types';
import type { ProductEntry } from '@cryotech/shared-types';
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
import { Plus, Trash2, CheckCircle, DollarSign } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { useListSearch } from '@/hooks/use-list-search';
import { apiMessage } from '@/lib/api-error';
import { toast } from 'sonner';

const PAGE_SIZE = 10;

export default function EntriesPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('all');
  const [payingEntry, setPayingEntry] = useState<ProductEntry | null>(null);
  const [page, setPage] = useState(1);
  const { value: searchValue, setValue: setSearchValue, search } = useListSearch();

  const { data: entries, isLoading } = useQuery({
    queryKey: ['entries', { status: statusFilter, search }],
    queryFn: () =>
      entriesApi.findAll({ ...(statusFilter !== 'all' && { status: statusFilter }), search }),
    placeholderData: keepPreviousData,
  });
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: () => productsApi.findAll() });
  const { data: batches } = useQuery({ queryKey: ['batches'], queryFn: () => batchesApi.findAll() });

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

  function getProductName(id: string) {
    return products?.find((p) => p.id === id)?.name ?? '-';
  }

  function getBatchLabel(id: string | null) {
    if (!id) return '-';
    const b = batches?.find((b) => b.id === id);
    return b ? `${b.breed} (${formatDate(b.startDate)})` : '-';
  }

  const allEntries = entries || [];
  const totalPages = Math.ceil(allEntries.length / PAGE_SIZE) || 1;
  const paginatedEntries = allEntries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleFilterChange = (val: string) => {
    setStatusFilter(val);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Entradas de Productos" subtitle="Registro y control de compras de insumos">
        <Button asChild data-testid="new-entry">
          <Link to="/dashboard/entries/new">
            <Plus className="mr-2 h-4 w-4" /> Nueva Entrada
          </Link>
        </Button>
      </PageHeader>

      <SearchInput
        value={searchValue}
        onChange={(val) => {
          setSearchValue(val);
          setPage(1);
        }}
        placeholder="Buscar por código o producto..."
        label="Buscar entradas"
        className="sm:max-w-sm"
        data-testid="entries-search"
      />

      <Tabs value={statusFilter} onValueChange={handleFilterChange}>
        <TabsList>
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="pending">Pendientes</TabsTrigger>
          <TabsTrigger value="received">Recibidos</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelados</TabsTrigger>
        </TabsList>
        <TabsContent value={statusFilter}>
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="space-y-2 p-4">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : allEntries.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">No hay entradas registradas</p>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Producto</TableHead>
                        <TableHead>Lote</TableHead>
                        <TableHead className="text-right">Cantidad</TableHead>
                        <TableHead className="text-right">Costo Total</TableHead>
                        <TableHead className="text-right">Envío</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Pago</TableHead>
                        <TableHead className="text-right">Saldo</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedEntries.map((e) => (
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

                  <PaginationControls
                    page={page}
                    totalPages={totalPages}
                    totalItems={allEntries.length}
                    pageSize={PAGE_SIZE}
                    onPageChange={setPage}
                    itemName="entradas"
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <PayablePaymentDialog
        kind="entry"
        payableId={payingEntry?.id ?? null}
        label={`${payingEntry?.code ?? ''} · ${payingEntry?.product?.name ?? ''}`.trim()}
        onClose={() => setPayingEntry(null)}
      />
    </div>
  );
}

function entryBalance(entry: ProductEntry): number {
  const total = Number(entry.totalCost ?? 0) + Number(entry.deliveryCost ?? 0);
  return Math.round((total - Number(entry.paidAmount ?? 0)) * 100) / 100;
}
