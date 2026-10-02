import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TRANSACTION_CATEGORY_LABELS, formatDate, formatCurrency } from '@cryotech/shared-types';
import type { Transaction } from '@cryotech/shared-types';
import { transactionsApi } from '@/api/transactions.api';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, TrendingDown, Wallet, Clock, Undo2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { useListSearch } from '@/hooks/use-list-search';
import { apiMessage } from '@/lib/api-error';
import { toast } from 'sonner';

const PAGE_SIZE = 15;

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value);
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
  entry: 'Entrada de Insumo',
  sale_payment: 'Cobro de Venta',
  processing: 'Beneficio',
  manual: 'Registro manual / bot',
};

function getSourceTypeLabel(sourceType: string | null | undefined): string {
  if (!sourceType) return 'Manual (Legacy)';
  return SOURCE_TYPE_LABELS[sourceType] || sourceType;
}

const SOURCE_TYPE_OPTIONS = [
  { value: 'all', label: 'Todos los orígenes' },
  { value: 'manual', label: 'Registro manual / bot' },
  { value: 'entry', label: 'Entrada de Insumo' },
  { value: 'sale_payment', label: 'Cobro de Venta' },
  { value: 'processing', label: 'Beneficio' },
  { value: 'legacy', label: 'Manual (Legacy)' },
] as const;

export default function TransactionsPage() {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState('all');
  const [sourceTypeFilter, setSourceTypeFilter] = useState('all');
  const [page, setPage] = useState(1);

  const { value: searchValue, setValue: setSearchValue, search } = useListSearch();

  const { data: transactions, isLoading } = useQuery({
    queryKey: [
      'transactions',
      { sourceType: sourceTypeFilter !== 'all' ? sourceTypeFilter : undefined, search },
    ],
    queryFn: () => {
      const params: { sourceType?: string; search?: string } = { search };
      if (sourceTypeFilter !== 'all' && sourceTypeFilter !== 'legacy') {
        params.sourceType = sourceTypeFilter;
      }
      return transactionsApi.findAll(params);
    },
    placeholderData: keepPreviousData,
  });

  const { data: cashFlow, isLoading: cashFlowLoading } = useQuery({
    queryKey: ['transactions', 'cash-flow'],
    queryFn: () => transactionsApi.getCashFlow(),
  });

  const voidMutation = useMutation({
    mutationFn: (id: string) => transactionsApi.voidManual(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['treasury'] });
      toast.success(`Registro ${result.code ?? ''} anulado`.replace('  ', ' '));
    },
    onError: (error) => toast.error(apiMessage(error, 'No se pudo anular el registro')),
  });

  function confirmVoid(transaction: Transaction) {
    const label = TRANSACTION_CATEGORY_LABELS[transaction.category] || transaction.category;
    const ok = window.confirm(
      `¿Anular ${transaction.code ?? 'este registro'} (${label}, ${formatCurrency(transaction.amount)})?\n\n` +
        'Se borra el registro y se devuelve el dinero al saldo de su cuenta. No se puede deshacer.',
    );
    if (ok) voidMutation.mutate(transaction.id);
  }

  const filtered = (transactions ?? []).filter((t) => {
    if (typeFilter !== 'all' && t.type !== typeFilter) return false;
    if (sourceTypeFilter === 'legacy' && t.sourceType != null) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE) || 1;
  const paginatedTransactions = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const capitalIn = cashFlow?.capitalIn.bs ?? 0;
  const ownerDraw = cashFlow?.ownerDraw.bs ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Transacciones" subtitle="Libro diario de ingresos y gastos operativos" />

      <SearchInput
        value={searchValue}
        onChange={(val) => {
          setSearchValue(val);
          setPage(1);
        }}
        placeholder="Buscar por código, descripción o categoría..."
        label="Buscar transacciones"
        className="sm:max-w-sm"
        data-testid="transactions-search"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Ingresos Operativos</CardDescription>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            {cashFlowLoading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <>
                <div className="text-2xl font-bold text-emerald-600">
                  {formatCurrency(cashFlow?.income.bs ?? 0)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  ≈ {formatUsd(cashFlow?.income.usd ?? 0)}
                  {capitalIn > 0 && ` · +${formatCurrency(capitalIn)} aporte`}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Gastos Operativos</CardDescription>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            {cashFlowLoading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <>
                <div className="text-2xl font-bold text-red-600">
                  {formatCurrency(cashFlow?.expenses.bs ?? 0)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  ≈ {formatUsd(cashFlow?.expenses.usd ?? 0)}
                  {ownerDraw > 0 && ` · +${formatCurrency(ownerDraw)} retiro`}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Efectivo Disponible</CardDescription>
            <Wallet className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {cashFlowLoading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <>
                <div className={`text-2xl font-bold ${(cashFlow?.balance.bs ?? 0) >= 0 ? 'text-primary' : 'text-red-600'}`}>
                  {formatCurrency(cashFlow?.balance.bs ?? 0)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  ≈ {formatUsd(cashFlow?.balance.usd ?? 0)}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Por Cobrar</CardDescription>
            <Clock className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            {cashFlowLoading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <>
                <div className="text-2xl font-bold text-amber-600">
                  {formatUsd(cashFlow?.receivables.usd ?? 0)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {cashFlow?.receivables.count ?? 0} ventas pendientes
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={typeFilter}
          onValueChange={(val) => {
            setTypeFilter(val);
            setPage(1);
          }}
        >
          <TabsList>
            <TabsTrigger value="all">Todos</TabsTrigger>
            <TabsTrigger value="income">Ingresos</TabsTrigger>
            <TabsTrigger value="expense">Gastos</TabsTrigger>
          </TabsList>
        </Tabs>

        <Select
          value={sourceTypeFilter}
          onValueChange={(val) => {
            setSourceTypeFilter(val);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Filtrar por origen" />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : sorted.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">Sin transacciones registradas</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="text-right">Monto (Bs)</TableHead>
                    <TableHead className="text-right">Equiv. ($)</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedTransactions.map((t) => {
                    const usdEquiv = t.exchangeRate ? Number(t.amount) / Number(t.exchangeRate) : null;
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="text-muted-foreground text-xs font-mono">{t.code ?? '-'}</TableCell>
                        <TableCell>{formatDate(t.transactionDate)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{TRANSACTION_CATEGORY_LABELS[t.category] || t.category}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{getSourceTypeLabel(t.sourceType)}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">{t.description || '-'}</TableCell>
                        <TableCell className={`text-right font-medium ${t.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                          {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {usdEquiv !== null ? formatUsd(usdEquiv) : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          {t.sourceType === 'manual' && (
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              title="Anular"
                              data-testid="transaction-void"
                              disabled={voidMutation.isPending}
                              onClick={() => confirmVoid(t)}
                            >
                              <Undo2 className="h-3 w-3" />
                            </Button>
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
                totalItems={sorted.length}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
                itemName="transacciones"
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
