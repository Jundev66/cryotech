import { useState } from 'react';
import { useParams, Link } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { BATCH_STATUS_LABELS, BATCH_STATUS_COLORS, VALID_STATUS_TRANSITIONS } from '@cryotech/shared-types';
import { formatDate, formatCurrency, formatNumber, getBatchAgeInDays, getBatchWeek, calculateMortalityRate } from '@cryotech/shared-types';
import { batchesApi } from '@/api/batches.api';
import { productsApi } from '@/api/products.api';
import { dailyLogsApi } from '@/api/daily-logs.api';
import { processingApi } from '@/api/processing.api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Calendar, Bird, Skull, TrendingUp, Loader2, Scissors, Plus, Trash2, Pencil, Package, DollarSign, Truck } from 'lucide-react';
import { apiMessage } from '@/lib/api-error';
import { toast } from 'sonner';

export default function BatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [processingOpen, setProcessingOpen] = useState(false);
  const [entryLineOpen, setEntryLineOpen] = useState(false);
  const [showEntryDeliveryCost, setShowEntryDeliveryCost] = useState(false);
  const [editingQty, setEditingQty] = useState(false);
  const [editingPrice, setEditingPrice] = useState(false);
  const [qtyValue, setQtyValue] = useState(0);
  const [priceValue, setPriceValue] = useState(0);

  const { data: batch, isLoading } = useQuery({
    queryKey: ['batches', id],
    queryFn: () => batchesApi.findOne(id!),
    enabled: !!id,
  });

  const { data: allProducts } = useQuery({
    queryKey: ['products'],
    queryFn: () => productsApi.findAll(),
  });

  const { data: allLogs } = useQuery({
    queryKey: ['daily-logs', id],
    queryFn: () => dailyLogsApi.findAll({ batchId: id }),
    enabled: !!id,
  });

  const logs = allLogs ?? [];
  const invalidateBatch = () => {
    queryClient.invalidateQueries({ queryKey: ['batches', id] });
    queryClient.invalidateQueries({ queryKey: ['batches'] });
  };

  const statusMutation = useMutation({
    mutationFn: (status: string) => batchesApi.updateStatus(id!, status),
    onSuccess: () => { invalidateBatch(); toast.success('Estado actualizado'); },
    onError: (error) => toast.error(apiMessage(error, 'Error al actualizar estado')),
  });

  const updateBatchMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => batchesApi.update(id!, data),
    onSuccess: () => { invalidateBatch(); toast.success('Lote actualizado'); },
    onError: (error) => toast.error(apiMessage(error, 'Error al actualizar')),
  });

  const addEntryLineMutation = useMutation({
    mutationFn: (data: { productId: string; quantity: number; costPerUnit?: number; deliveryCost?: number }) =>
      batchesApi.addEntryLine(id!, data),
    onSuccess: () => { invalidateBatch(); setEntryLineOpen(false); setShowEntryDeliveryCost(false); toast.success('Insumo agregado'); },
    onError: (error) => toast.error(apiMessage(error, 'Error al agregar insumo')),
  });

  const removeEntryLineMutation = useMutation({
    mutationFn: (lineId: string) => batchesApi.removeEntryLine(id!, lineId),
    onSuccess: () => { invalidateBatch(); toast.success('Insumo eliminado'); },
    onError: (error) => toast.error(apiMessage(error, 'Error al eliminar insumo')),
  });

  const updateEntryLineMutation = useMutation({
    mutationFn: ({ lineId, data }: { lineId: string; data: { quantity?: number; costPerUnit?: number; deliveryCost?: number } }) =>
      batchesApi.updateEntryLine(id!, lineId, data),
    onSuccess: () => { invalidateBatch(); },
    onError: (error) => toast.error(apiMessage(error, 'Error al actualizar insumo')),
  });

  const processingForm = useForm({
    defaultValues: { quantity: 0, totalCost: 0, notes: '' },
  });

  const processingMutation = useMutation({
    mutationFn: (data: { quantity: number; totalCost: number; notes?: string }) =>
      processingApi.create({ batchId: id!, quantity: data.quantity, totalCost: data.totalCost, notes: data.notes || undefined }),
    onSuccess: () => {
      invalidateBatch();
      toast.success('Beneficio registrado');
      setProcessingOpen(false);
      processingForm.reset();
    },
    onError: (error) => toast.error(apiMessage(error, 'Error al registrar beneficio')),
  });

  const entryLineForm = useForm({
    defaultValues: { productId: '', quantity: 0, costPerUnit: 0, deliveryCost: 0 },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  if (!batch) {
    return <p className="text-center text-muted-foreground">Lote no encontrado</p>;
  }

  const isPlanned = batch.status === 'planned';
  const ageDays = isPlanned ? 0 : getBatchAgeInDays(batch.startDate);
  const batchWeek = isPlanned ? 0 : getBatchWeek(batch.startDate);
  // From the daily logs: `initial - current` also counts the birds that were sold.
  const totalMortality = (allLogs ?? []).reduce((sum, log) => sum + (log.mortality ?? 0), 0);
  const mortalityRate = calculateMortalityRate(totalMortality, batch.initialQuantity);
  const nextStatuses = VALID_STATUS_TRANSITIONS[batch.status] || [];
  const engordeStartWeek = 4;

  // Investment calculation
  const birdsCost = (batch.purchasePricePerUnit ?? 0) * batch.initialQuantity;
  const entryLines = batch.entryLines ?? [];
  const insumosCost = entryLines.reduce((sum, l) => {
    const productCost = l.costPerUnit != null ? Number(l.costPerUnit) * Number(l.quantity) : 0;
    const delivery = l.deliveryCost != null ? Number(l.deliveryCost) : 0;
    return sum + productCost + delivery;
  }, 0);
  const totalInvestment = birdsCost + insumosCost;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/dashboard/batches"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl font-extrabold tracking-tight">{batch.breed}</h1>
            <Badge variant="outline" className={BATCH_STATUS_COLORS[batch.status]}>
              {BATCH_STATUS_LABELS[batch.status]}
            </Badge>
            {!isPlanned && (
              <Badge variant="secondary" className="text-sm font-semibold">
                Semana {batchWeek} - Dia {ageDays}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">{batch.warehouse?.name || 'Sin galpon'}</p>
        </div>
        <div className="flex gap-2">
          {batch.status === 'for_sale' && (
            <Dialog open={processingOpen} onOpenChange={setProcessingOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Scissors className="mr-2 h-4 w-4" />
                  Beneficiar
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Registrar Beneficio</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={processingForm.handleSubmit((v) => processingMutation.mutate(v))}
                  className="space-y-4"
                >
                  <div>
                    <Label htmlFor="proc-quantity">Cantidad (max {batch.currentQuantity})</Label>
                    <Input id="proc-quantity" type="number" min={1} max={batch.currentQuantity}
                      {...processingForm.register('quantity', { valueAsNumber: true })} />
                  </div>
                  <div>
                    <Label htmlFor="proc-totalCost">Costo total</Label>
                    <Input id="proc-totalCost" type="number" min={0} step="0.01"
                      {...processingForm.register('totalCost', { valueAsNumber: true })} />
                  </div>
                  <div>
                    <Label htmlFor="proc-notes">Notas (opcional)</Label>
                    <Textarea id="proc-notes" {...processingForm.register('notes')} />
                  </div>
                  <Button type="submit" className="w-full" disabled={processingMutation.isPending}>
                    {processingMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Registrar beneficio
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
          {nextStatuses.map((s) => (
            <Button
              key={s}
              variant="outline"
              onClick={() => statusMutation.mutate(s)}
              disabled={statusMutation.isPending}
            >
              {statusMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cambiar a {BATCH_STATUS_LABELS[s]}
            </Button>
          ))}
        </div>
      </div>

      {isPlanned ? (
        <>
          {/* ── Planning Mode ── */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardDescription>Inicio Estimado</CardDescription>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="font-mono text-2xl font-bold">{formatDate(batch.startDate)}</div>
                <p className="text-xs text-muted-foreground">Pendiente de iniciar crianza</p>
              </CardContent>
            </Card>

            {/* Editable bird quantity */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardDescription>Aves Planificadas</CardDescription>
                <Bird className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {editingQty ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number" min={1} className="h-9 w-28"
                      value={qtyValue}
                      onChange={(e) => setQtyValue(parseInt(e.target.value) || 0)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          updateBatchMutation.mutate({ initialQuantity: qtyValue });
                          setEditingQty(false);
                        }
                        if (e.key === 'Escape') setEditingQty(false);
                      }}
                      autoFocus
                    />
                    <Button size="sm" variant="ghost" onClick={() => {
                      updateBatchMutation.mutate({ initialQuantity: qtyValue });
                      setEditingQty(false);
                    }}>OK</Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-2xl font-bold">{formatNumber(batch.initialQuantity)}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                      setQtyValue(batch.initialQuantity);
                      setEditingQty(true);
                    }}><Pencil className="h-3 w-3" /></Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Editable price per bird */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardDescription>Costo por Ave</CardDescription>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {editingPrice ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Bs</span>
                    <Input
                      type="number" min={0} step="0.01" className="h-9 w-28"
                      value={priceValue}
                      onChange={(e) => setPriceValue(parseFloat(e.target.value) || 0)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          updateBatchMutation.mutate({ purchasePricePerUnit: priceValue });
                          setEditingPrice(false);
                        }
                        if (e.key === 'Escape') setEditingPrice(false);
                      }}
                      autoFocus
                    />
                    <Button size="sm" variant="ghost" onClick={() => {
                      updateBatchMutation.mutate({ purchasePricePerUnit: priceValue });
                      setEditingPrice(false);
                    }}>OK</Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-2xl font-bold">
                      {batch.purchasePricePerUnit ? formatCurrency(batch.purchasePricePerUnit) : '-'}
                    </span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                      setPriceValue(batch.purchasePricePerUnit ?? 0);
                      setEditingPrice(true);
                    }}><Pencil className="h-3 w-3" /></Button>
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Subtotal aves: {birdsCost > 0 ? formatCurrency(birdsCost) : '-'}
                </p>
              </CardContent>
            </Card>

            {/* Total Investment */}
            <Card className="border-primary/30 bg-primary/5 ring-1 ring-primary/20">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardDescription>Inversion Total</CardDescription>
                <TrendingUp className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="font-mono text-2xl font-bold text-primary">
                  {totalInvestment > 0 ? formatCurrency(totalInvestment) : '-'}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Aves: {birdsCost > 0 ? formatCurrency(birdsCost) : 'Bs 0,00'} + Insumos: {insumosCost > 0 ? formatCurrency(insumosCost) : 'Bs 0,00'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* ── Entry Lines (Insumos) ��� Editable ── */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary" />
                  <CardTitle>Insumos Planificados</CardTitle>
                </div>
                <Dialog open={entryLineOpen} onOpenChange={setEntryLineOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Plus className="mr-1 h-3 w-3" /> Agregar insumo
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Agregar Insumo</DialogTitle>
                    </DialogHeader>
                    <form
                      onSubmit={entryLineForm.handleSubmit((v) =>
                        addEntryLineMutation.mutate({
                          productId: v.productId,
                          quantity: v.quantity,
                          costPerUnit: v.costPerUnit || undefined,
                          deliveryCost: showEntryDeliveryCost && v.deliveryCost ? v.deliveryCost : undefined,
                        })
                      )}
                      className="space-y-4"
                    >
                      <div>
                        <Label>Producto</Label>
                        <Select onValueChange={(v) => entryLineForm.setValue('productId', v)} value={entryLineForm.watch('productId')}>
                          <SelectTrigger className="w-full"><SelectValue placeholder="Seleccionar producto" /></SelectTrigger>
                          <SelectContent>
                            {allProducts?.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name} ({p.measurementUnit?.abbreviation ?? ''})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Cantidad</Label>
                          <Input type="number" step="0.1" min={0.1}
                            {...entryLineForm.register('quantity', { valueAsNumber: true })} />
                        </div>
                        <div>
                          <Label>Costo/Unidad (Bs)</Label>
                          <Input type="number" step="0.01" min={0}
                            {...entryLineForm.register('costPerUnit', { valueAsNumber: true })} />
                        </div>
                      </div>
                      <div className="flex items-center justify-between rounded-md border p-3">
                        <div className="flex items-center gap-2">
                          <Truck className="h-4 w-4 text-muted-foreground" />
                          <Label className="text-sm font-medium">Incluir costo de envio</Label>
                        </div>
                        <Switch
                          checked={showEntryDeliveryCost}
                          onCheckedChange={(checked) => {
                            setShowEntryDeliveryCost(checked);
                            if (!checked) entryLineForm.setValue('deliveryCost', 0);
                          }}
                        />
                      </div>
                      {showEntryDeliveryCost && (
                        <div>
                          <Label>Costo de Envio (Bs)</Label>
                          <Input type="number" step="0.01" min={0} placeholder="0.00"
                            {...entryLineForm.register('deliveryCost', { valueAsNumber: true })} />
                        </div>
                      )}
                      <Button type="submit" className="w-full" disabled={addEntryLineMutation.isPending}>
                        {addEntryLineMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Agregar
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
              <CardDescription>Productos e insumos necesarios para este lote</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {entryLines.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">Sin insumos planificados. Agrega productos para calcular la inversion.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead className="text-right">Costo/Unidad</TableHead>
                      <TableHead className="text-right">Envio</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entryLines.map((line) => {
                      const productCost = line.costPerUnit != null
                        ? Number(line.costPerUnit) * Number(line.quantity) : 0;
                      const delivery = line.deliveryCost != null ? Number(line.deliveryCost) : 0;
                      const subtotal = productCost + delivery;
                      return (
                        <TableRow key={line.id}>
                          <TableCell className="font-medium">{line.product?.name || '-'}</TableCell>
                          <TableCell className="text-right">
                            <InlineEdit
                              value={Number(line.quantity)}
                              onSave={(v) => updateEntryLineMutation.mutate({ lineId: line.id, data: { quantity: v } })}
                              format={(v) => formatNumber(v, 1)}
                              type="number"
                              step="0.1"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <InlineEdit
                              value={line.costPerUnit != null ? Number(line.costPerUnit) : 0}
                              onSave={(v) => updateEntryLineMutation.mutate({ lineId: line.id, data: { costPerUnit: v } })}
                              format={(v) => formatCurrency(v)}
                              type="number"
                              step="0.01"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <InlineEdit
                              value={delivery}
                              onSave={(v) => updateEntryLineMutation.mutate({ lineId: line.id, data: { deliveryCost: v } })}
                              format={(v) => v > 0 ? formatCurrency(v) : '-'}
                              type="number"
                              step="0.01"
                            />
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {subtotal > 0 ? formatCurrency(subtotal) : '-'}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                              onClick={() => removeEntryLineMutation.mutate(line.id)}
                              disabled={removeEntryLineMutation.isPending}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="bg-muted/50 font-medium">
                      <TableCell colSpan={4} className="text-right">Total Insumos</TableCell>
                      <TableCell className="text-right">{formatCurrency(insumosCost)}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Planning message */}
          <Card>
            <CardContent className="py-6 text-center">
              <p className="text-muted-foreground">Los registros diarios, ventas y transacciones estaran disponibles al iniciar la crianza.</p>
              <p className="mt-1 text-xs text-muted-foreground">Cambia el estado a "En Crianza" cuando estes listo para comenzar.</p>
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          {/* ── Active Mode (breeding/for_sale/finished) ── */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardDescription>Edad</CardDescription>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="font-mono text-2xl font-bold">{ageDays} dias</div>
                <p className="text-xs text-muted-foreground">Inicio: {formatDate(batch.startDate)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardDescription>Aves Vivas</CardDescription>
                <Bird className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="font-mono text-2xl font-bold">{formatNumber(batch.currentQuantity)}</div>
                <p className="text-xs text-muted-foreground">de {formatNumber(batch.initialQuantity)} iniciales</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardDescription>Mortalidad</CardDescription>
                <Skull className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="font-mono text-2xl font-bold">{formatNumber(mortalityRate, 1)}%</div>
                <p className="text-xs text-muted-foreground">{formatNumber(totalMortality)} muertes</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardDescription>Inversion</CardDescription>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="font-mono text-2xl font-bold">
                  {batch.purchasePricePerUnit
                    ? formatCurrency(batch.purchasePricePerUnit * batch.initialQuantity)
                    : '-'}
                </div>
                <p className="text-xs text-muted-foreground">
                  {batch.purchasePricePerUnit ? `${formatCurrency(batch.purchasePricePerUnit)} / ave` : 'Sin registrar'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* 6-Week Timeline */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium">Progreso del ciclo</span>
                <Badge variant="outline" className="text-xs">Semana {batchWeek} de 6</Badge>
              </div>
              <div className="flex gap-1.5 w-full">
                {[1, 2, 3, 4, 5, 6].map(week => (
                  <div
                    key={week}
                    className={`h-3 flex-1 rounded-md transition-all ${
                      week <= batchWeek
                        ? (week < engordeStartWeek ? 'bg-primary shadow-sm shadow-primary/20' : 'bg-amber-500 shadow-sm shadow-amber-500/20')
                        : 'bg-muted'
                    }`}
                  />
                ))}
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>Inicio</span>
                <span>Engorde</span>
              </div>
            </CardContent>
          </Card>

          {/* Entry Lines (read-only) */}
          {entryLines.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Insumos Iniciales</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead className="text-right">Costo/Unidad</TableHead>
                      <TableHead className="text-right">Envio</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entryLines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>{line.product?.name || '-'}</TableCell>
                        <TableCell className="text-right">{formatNumber(Number(line.quantity))}</TableCell>
                        <TableCell className="text-right">
                          {line.costPerUnit != null ? formatCurrency(Number(line.costPerUnit)) : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {line.deliveryCost != null && Number(line.deliveryCost) > 0 ? formatCurrency(Number(line.deliveryCost)) : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={line.processed ? 'default' : 'secondary'}>
                            {line.processed ? 'Procesado' : 'Pendiente'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Daily Logs */}
          <Card>
            <CardHeader>
              <CardTitle>Registros Diarios</CardTitle>
              <CardDescription>Historial de registros para este lote</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {logs.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">Sin registros diarios</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead className="text-right">Mortalidad</TableHead>
                      <TableHead className="text-right">Peso Prom. (g)</TableHead>
                      <TableHead className="text-right">Temp. (C)</TableHead>
                      <TableHead>Notas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.sort((a, b) => b.logDate.localeCompare(a.logDate)).map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>{formatDate(log.logDate)}</TableCell>
                        <TableCell className="text-right">{log.mortality}</TableCell>
                        <TableCell className="text-right">{log.averageWeightG ?? '-'}</TableCell>
                        <TableCell className="text-right">{log.temperatureC ?? '-'}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{log.notes || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {batch.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{batch.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Inline editable value — click to edit, Enter/blur to save */
function InlineEdit({
  value,
  onSave,
  format,
  type = 'number',
  step,
}: {
  value: number;
  onSave: (v: number) => void;
  format: (v: number) => string;
  type?: string;
  step?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState(value);

  const save = () => {
    if (current !== value) onSave(current);
    setEditing(false);
  };

  if (editing) {
    return (
      <Input
        type={type}
        step={step}
        className="h-7 w-24 text-right text-sm"
        value={current}
        onChange={(e) => setCurrent(parseFloat(e.target.value) || 0)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') setEditing(false);
        }}
        autoFocus
      />
    );
  }

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded px-1 hover:bg-muted transition-colors cursor-pointer"
      onClick={() => { setCurrent(value); setEditing(true); }}
    >
      {format(value)}
      <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
    </button>
  );
}
