import { useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { formatNumber, formatDate, CONSUMPTION_STATUS_LABELS, CONSUMPTION_STATUS_COLORS } from '@cryotech/shared-types';
import type { FeedConsumption, ConsumptionStatus } from '@cryotech/shared-types';
import { feedApi } from '@/api/feed.api';
import { productsApi } from '@/api/products.api';
import { batchesApi } from '@/api/batches.api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Plus, Pencil, Check, X, Zap } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { useListSearch } from '@/hooks/use-list-search';
import { apiMessage } from '@/lib/api-error';
import { toast } from 'sonner';

const editFormSchema = z.object({
  quantityKg: z.coerce.number().positive('Debe ser mayor a 0'),
});

type EditFormValues = z.infer<typeof editFormSchema>;

type StatusFilter = 'all' | ConsumptionStatus;

const PAGE_SIZE = 10;

export default function ConsumptionsPage() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const { value: searchValue, setValue: setSearchValue, search } = useListSearch();

  const { data: consumptions, isLoading } = useQuery({
    queryKey: ['feed-consumptions', { status: statusFilter, search }],
    queryFn: () =>
      feedApi.getConsumptions({ ...(statusFilter !== 'all' && { status: statusFilter }), search }),
    placeholderData: keepPreviousData,
  });
  const { data: allProducts } = useQuery({ queryKey: ['products'], queryFn: () => productsApi.findAll() });
  const { data: allBatches } = useQuery({ queryKey: ['batches'], queryFn: () => batchesApi.findAll() });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { quantityKg: number } }) => feedApi.updateConsumption(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed-consumptions'] });
      toast.success('Consumo actualizado');
      setEditingId(null);
    },
    onError: (error) => toast.error(apiMessage(error, 'Error al actualizar consumo')),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => feedApi.approveConsumption(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed-consumptions'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Consumo aprobado');
    },
    onError: (error: unknown) =>
      toast.error(apiMessage(error, 'Error al aprobar consumo')),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => feedApi.rejectConsumption(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed-consumptions'] });
      toast.success('Consumo rechazado');
    },
    onError: (error) => toast.error(apiMessage(error, 'Error al rechazar consumo')),
  });

  const autoGenerateMutation = useMutation({
    mutationFn: () => feedApi.autoGenerate(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed-consumptions'] });
      toast.success('Consumos auto-generados correctamente');
    },
    onError: (error) => toast.error(apiMessage(error, 'Error al auto-generar consumos')),
  });

  const editForm = useForm<EditFormValues>({
    resolver: zodResolver(editFormSchema),
    defaultValues: { quantityKg: 0 },
  });

  function getProductName(id: string | null | undefined) {
    if (!id) return '-';
    return allProducts?.find((p) => p.id === id)?.name ?? '-';
  }

  function getBatchLabel(id: string | null | undefined) {
    if (!id) return '-';
    const b = allBatches?.find((b) => b.id === id);
    return b ? `${b.breed} (${formatDate(b.startDate)})` : '-';
  }

  function openEdit(c: FeedConsumption) {
    setEditingId(c.id);
    editForm.reset({ quantityKg: Number(c.quantityKg) });
  }

  function cancelEdit() {
    setEditingId(null);
  }

  const allConsumptions = consumptions || [];
  const totalPages = Math.ceil(allConsumptions.length / PAGE_SIZE) || 1;
  const paginatedConsumptions = allConsumptions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PageHeader title="Consumo de Alimento" subtitle="Registro de alimento suministrado por lote">
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => autoGenerateMutation.mutate()}
            disabled={autoGenerateMutation.isPending}
          >
            <Zap className="mr-2 h-4 w-4" />
            {autoGenerateMutation.isPending ? 'Generando...' : 'Auto-Generar'}
          </Button>

          <Button asChild data-testid="new-consumption">
            <Link to="/dashboard/consumptions/new">
              <Plus className="mr-2 h-4 w-4" /> Registrar Consumo
            </Link>
          </Button>
        </div>
      </PageHeader>

      <SearchInput
        value={searchValue}
        onChange={(val) => {
          setSearchValue(val);
          setPage(1);
        }}
        placeholder="Buscar por producto, lote o notas..."
        label="Buscar consumos"
        className="sm:max-w-sm"
        data-testid="consumptions-search"
      />

      <Tabs
        value={statusFilter}
        onValueChange={(v) => {
          setStatusFilter(v as StatusFilter);
          setPage(1);
        }}
      >
        <TabsList>
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="pending">Pendientes</TabsTrigger>
          <TabsTrigger value="confirmed">Confirmados</TabsTrigger>
          <TabsTrigger value="adjusted">Ajustados</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : allConsumptions.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">Sin consumos registrados</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Lote</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Cantidad (kg)</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedConsumptions.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{formatDate(c.consumptionDate)}</TableCell>
                      <TableCell className="font-medium">{c.batch?.breed ? `${c.batch.breed} (${formatDate(c.batch.startDate)})` : getBatchLabel(c.batchId)}</TableCell>
                      <TableCell>{c.product?.name ?? getProductName(c.productId)}</TableCell>
                      <TableCell className="text-right">
                        {editingId === c.id ? (
                          <form
                            className="flex items-center justify-end gap-2"
                            onSubmit={editForm.handleSubmit((v) => updateMutation.mutate({ id: c.id, data: { quantityKg: v.quantityKg } }))}
                          >
                            <Input
                              type="number"
                              step="0.01"
                              className="w-24 h-8 text-right"
                              {...editForm.register('quantityKg', { valueAsNumber: true })}
                            />
                            <Button type="submit" variant="ghost" size="icon-xs" disabled={updateMutation.isPending}>
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button type="button" variant="ghost" size="icon-xs" onClick={cancelEdit}>
                              <X className="h-3 w-3" />
                            </Button>
                          </form>
                        ) : (
                          <>
                            {formatNumber(c.quantityKg, 2)}
                            {c.adjustedQuantityKg != null && (
                              <span className="ml-1 text-xs text-muted-foreground">(ajustado: {formatNumber(c.adjustedQuantityKg, 2)})</span>
                            )}
                          </>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className={CONSUMPTION_STATUS_COLORS[c.status]}>
                            {CONSUMPTION_STATUS_LABELS[c.status] ?? c.status}
                          </Badge>
                          {c.isAutoGenerated && (
                            <Badge variant="secondary" className="text-xs">Auto</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {c.status === 'pending' && (
                            <>
                              <Button variant="ghost" size="icon-xs" title="Editar cantidad" onClick={() => openEdit(c)}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                title="Aprobar"
                                onClick={() => approveMutation.mutate(c.id)}
                                disabled={approveMutation.isPending}
                              >
                                <Check className="h-3 w-3 text-emerald-600" />
                              </Button>
                              {c.isAutoGenerated && (
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  title="Rechazar"
                                  onClick={() => rejectMutation.mutate(c.id)}
                                  disabled={rejectMutation.isPending}
                                >
                                  <X className="h-3 w-3 text-destructive" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <PaginationControls
                page={page}
                totalPages={totalPages}
                totalItems={allConsumptions.length}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
                itemName="consumos"
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
