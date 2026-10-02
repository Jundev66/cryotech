import { useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  formatCurrency,
  formatNumber,
  formatDate,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
} from '@cryotech/shared-types';
import type { Processing } from '@cryotech/shared-types';
import { processingApi } from '@/api/processing.api';
import { PayablePaymentDialog } from '@/components/forms/payable-payment-dialog';
import { batchesApi } from '@/api/batches.api';
import { productsApi } from '@/api/products.api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, DollarSign } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { useListSearch } from '@/hooks/use-list-search';

const PAGE_SIZE = 10;

export default function ProcessingPage() {
  const [payingProcessing, setPayingProcessing] = useState<Processing | null>(null);
  const [page, setPage] = useState(1);

  const { value: searchValue, setValue: setSearchValue, search } = useListSearch();
  const { data: processings, isLoading } = useQuery({
    queryKey: ['processing', { search }],
    queryFn: () => processingApi.findAll({ search }),
    placeholderData: keepPreviousData,
  });
  const { data: allBatches } = useQuery({ queryKey: ['batches'], queryFn: () => batchesApi.findAll() });
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: () => productsApi.findAll() });

  function getBatchLabel(id: string) {
    const b = allBatches?.find((b) => b.id === id);
    return b ? `${b.breed} - ${formatDate(b.startDate)}` : '-';
  }

  function getProductName(id: string | null) {
    if (!id) return '-';
    return products?.find((p) => p.id === id)?.name ?? '-';
  }

  const allProcessings = processings || [];
  const totalPages = Math.ceil(allProcessings.length / PAGE_SIZE) || 1;
  const paginatedProcessings = allProcessings.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PageHeader title="Beneficio / Procesamiento" subtitle="Registro de faenado y rendimiento en canal">
        <Button asChild data-testid="new-processing">
          <Link to="/dashboard/processing/new">
            <Plus className="mr-2 h-4 w-4" /> Nuevo Procesamiento
          </Link>
        </Button>
      </PageHeader>

      <SearchInput
        value={searchValue}
        onChange={(val) => {
          setSearchValue(val);
          setPage(1);
        }}
        placeholder="Buscar por lote, matadero o código..."
        label="Buscar beneficio"
        className="sm:max-w-sm"
        data-testid="processing-search"
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : allProcessings.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground" data-testid="processing-empty">
              Sin registros de procesamiento
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Lote</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">Peso Vivo (kg)</TableHead>
                    <TableHead className="text-right">Peso Canal (kg)</TableHead>
                    <TableHead className="text-right">Rendimiento</TableHead>
                    <TableHead className="text-right">Costo Total</TableHead>
                    <TableHead>Estado Pago</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedProcessings.map((p) => {
                    const yieldPct = p.liveWeightKg && p.processedWeightKg
                      ? ((Number(p.processedWeightKg) / Number(p.liveWeightKg)) * 100).toFixed(1)
                      : null;
                    const balance = Number(p.totalCostBs ?? 0) - Number(p.paidAmount ?? 0);
                    return (
                      <TableRow key={p.id} data-testid="processing-row">
                        <TableCell>{formatDate(p.processingDate)}</TableCell>
                        <TableCell className="font-medium">{p.batch?.breed ? `${p.batch.breed}` : getBatchLabel(p.batchId)}</TableCell>
                        <TableCell className="text-right">{formatNumber(p.quantity)}</TableCell>
                        <TableCell className="text-right">{p.liveWeightKg ? formatNumber(p.liveWeightKg, 2) : '-'}</TableCell>
                        <TableCell className="text-right">{p.processedWeightKg ? formatNumber(p.processedWeightKg, 2) : '-'}</TableCell>
                        <TableCell className="text-right font-medium">{yieldPct ? `${yieldPct}%` : '-'}</TableCell>
                        <TableCell className="text-right">{p.totalCostBs ? formatCurrency(p.totalCostBs) : formatCurrency(p.totalCost)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={PAYMENT_STATUS_COLORS[p.paymentStatus] ?? ''}>
                            {PAYMENT_STATUS_LABELS[p.paymentStatus] ?? p.paymentStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right" data-testid="processing-balance">
                          {formatCurrency(balance)}
                        </TableCell>
                        <TableCell>{p.product?.name ?? getProductName(p.productId)}</TableCell>
                        <TableCell className="text-right">
                          {balance > 0 ? (
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              data-testid="pay-processing"
                              onClick={() => setPayingProcessing(p)}
                              title="Registrar pago"
                            >
                              <DollarSign className="h-3 w-3" />
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">Pagado</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <PaginationControls
                page={page}
                totalPages={totalPages}
                totalItems={allProcessings.length}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
                itemName="procesamientos"
              />
            </>
          )}
        </CardContent>
      </Card>

      <PayablePaymentDialog
        kind="processing"
        payableId={payingProcessing?.id ?? null}
        label={`${payingProcessing?.code ?? ''} · ${payingProcessing?.batch?.breed ?? ''}`.trim()}
        onClose={() => setPayingProcessing(null)}
      />
    </div>
  );
}
