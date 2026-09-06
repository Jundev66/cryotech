import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { dailyLogSchema, type DailyLogInput } from '@cryotech/shared-types';
import { formatDate, formatNumber } from '@cryotech/shared-types';
import { dailyLogsApi } from '@/api/daily-logs.api';
import { batchesApi } from '@/api/batches.api';
import { productsApi } from '@/api/products.api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Loader2, Trash2, Pill, ChevronUp, Wheat } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { apiMessage } from '@/lib/api-error';
import { toast } from 'sonner';

export default function DailyLogsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: logs, isLoading } = useQuery({
    queryKey: ['daily-logs'],
    queryFn: () => dailyLogsApi.findAll(),
  });

  const { data: batches } = useQuery({
    queryKey: ['batches'],
    queryFn: () => batchesApi.findAll(),
  });

  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: () => productsApi.findAll(),
  });

  // Anything alive, which is what the API accepts too — it only refuses
  // `planned`. Offering `breeding` alone hid every batch that was ready for
  // sale, so the days between "listo" and the last bird sold could not be
  // recorded at all: no mortality, no feed, and an FCR missing its tail.
  const activeBatches = batches?.filter((b) => b.status === 'breeding' || b.status === 'for_sale') ?? [];

  // Filter products by category for medicine (vaccine, medicine) and feed
  const medicineProducts = products?.filter((p) => {
    const slug = p.category?.slug ?? '';
    return slug === 'vaccine' || slug === 'medicine' || slug === 'medicina' || slug === 'vacuna';
  }) ?? [];

  const feedProducts = products?.filter((p) => {
    const slug = p.category?.slug ?? '';
    return slug === 'feed' || slug === 'alimento';
  }) ?? [];

  const createMutation = useMutation({
    mutationFn: (data: DailyLogInput) => dailyLogsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-logs'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      toast.success('Registro creado');
      setShowForm(false);
      form.reset();
    },
    onError: (err: unknown) => {
      const message = apiMessage(err, 'Error al crear registro');
      toast.error(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: dailyLogsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-logs'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      toast.success('Registro eliminado');
    },
  });

  const form = useForm<DailyLogInput>({
    resolver: zodResolver(dailyLogSchema),
    defaultValues: {
      batchId: '',
      logDate: new Date().toISOString().split('T')[0],
      mortality: 0,
      medicineAdministered: false,
      medicineNotes: '',
      medicineProductId: undefined,
      medicineQuantity: undefined,
      feedConsumedKg: undefined,
      feedProductId: undefined,
      healthScore: undefined,
    },
  });

  const healthScoreColor = (score: number | null | undefined) => {
    if (score == null) return '';
    if (score <= 2) return 'text-red-600';
    if (score === 3) return 'text-yellow-600';
    return 'text-emerald-600';
  };

  function handleToggleForm() {
    setShowForm((prev) => {
      if (prev) form.reset();
      return !prev;
    });
  }

  const watchMedicine = form.watch('medicineAdministered');
  const watchFeedProduct = form.watch('feedProductId');

  return (
    <div className="space-y-6">
      <PageHeader title="Registros Diarios" subtitle="Registro de mortalidad, peso, alimento y condiciones ambientales">
        <Button data-testid="toggle-daily-log-form" onClick={handleToggleForm} variant={showForm ? 'outline' : 'default'}>
          {showForm ? (
            <><ChevronUp className="mr-2 h-4 w-4" /> Ocultar Formulario</>
          ) : (
            <><Plus className="mr-2 h-4 w-4" /> Nuevo Registro</>
          )}
        </Button>
      </PageHeader>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Nuevo Registro Diario</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField control={form.control} name="batchId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lote</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger className="w-full" data-testid="log-batch"><SelectValue placeholder="Seleccionar lote" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {activeBatches.map((b) => (
                            <SelectItem key={b.id} value={b.id}>{b.breed} - {b.warehouse?.name || 'Sin galpon'}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="logDate" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField control={form.control} name="mortality" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mortalidad</FormLabel>
                      <FormControl><Input type="number" data-testid="log-mortality" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="averageWeightG" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Peso promedio (g)</FormLabel>
                      <FormControl><Input type="number" step="0.1" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <FormField control={form.control} name="waterConsumedL" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Agua (L)</FormLabel>
                      <FormControl><Input type="number" step="0.1" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="temperatureC" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Temperatura (C)</FormLabel>
                      <FormControl><Input type="number" step="0.1" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="humidityPct" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Humedad (%)</FormLabel>
                      <FormControl><Input type="number" step="0.1" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                {/* Feed Consumption Section */}
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Wheat className="h-4 w-4 text-amber-600" />
                    <span className="text-sm font-medium">Consumo de Alimento</span>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField control={form.control} name="feedProductId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Producto de Alimento</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value ?? ''}>
                          <FormControl><SelectTrigger className="w-full"><SelectValue placeholder="Seleccionar alimento" /></SelectTrigger></FormControl>
                          <SelectContent>
                            {feedProducts.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name} (Stock: {formatNumber(Number(p.currentStock), 2)} {p.measurementUnit?.abbreviation ?? ''})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    {watchFeedProduct && (
                      <FormField control={form.control} name="feedConsumedKg" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cantidad (kg)</FormLabel>
                          <FormControl><Input type="number" step="0.001" placeholder="0.000" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    )}
                  </div>
                </div>

                {/* Medicine Section */}
                <div className="rounded-lg border p-4 space-y-3">
                  <FormField control={form.control} name="medicineAdministered" render={({ field }) => (
                    <FormItem className="flex items-center gap-3">
                      <FormControl>
                        <input type="checkbox" checked={field.value || false} onChange={field.onChange} className="h-4 w-4" />
                      </FormControl>
                      <div className="flex items-center gap-2">
                        <Pill className="h-4 w-4 text-emerald-600" />
                        <FormLabel className="!mt-0">Medicina administrada</FormLabel>
                      </div>
                    </FormItem>
                  )} />
                  {watchMedicine && (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <FormField control={form.control} name="medicineProductId" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Producto de Medicina</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ?? ''}>
                            <FormControl><SelectTrigger className="w-full"><SelectValue placeholder="Seleccionar medicina" /></SelectTrigger></FormControl>
                            <SelectContent>
                              {medicineProducts.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name} (Stock: {formatNumber(Number(p.currentStock), 2)} {p.measurementUnit?.abbreviation ?? ''})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="medicineQuantity" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cantidad (ml)</FormLabel>
                          <FormControl><Input type="number" step="0.1" placeholder="0.0" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="medicineNotes" render={({ field }) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel>Notas de medicina</FormLabel>
                          <FormControl><Input placeholder="Detalle medicina, dosis..." {...field} /></FormControl>
                        </FormItem>
                      )} />
                    </div>
                  )}
                </div>

                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas (opcional)</FormLabel>
                    <FormControl><Textarea {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="healthScore" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Puntuacion de salud (1-5)</FormLabel>
                    <Select onValueChange={(v) => field.onChange(Number(v))} value={field.value?.toString() || ''}>
                      <FormControl><SelectTrigger className="w-full"><SelectValue placeholder="Seleccionar" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {[1, 2, 3, 4, 5].map(n => (
                          <SelectItem key={n} value={n.toString()}>{n} - {['Muy malo', 'Malo', 'Normal', 'Bueno', 'Excelente'][n-1]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />

                <div className="flex gap-2">
                  <Button type="submit" className="flex-1" data-testid="submit-daily-log" disabled={createMutation.isPending}>
                    {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Guardar registro
                  </Button>
                  <Button type="button" variant="outline" onClick={handleToggleForm}>
                    Cancelar
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !logs || logs.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">Sin registros diarios</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Lote / Raza</TableHead>
                  <TableHead className="text-right">Mortalidad</TableHead>
                  <TableHead className="text-right">Peso Prom. (g)</TableHead>
                  <TableHead className="text-right">Agua (L)</TableHead>
                  <TableHead className="text-right">Alimento (kg)</TableHead>
                  <TableHead className="text-center">Medicina</TableHead>
                  <TableHead className="text-center">Salud</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.sort((a, b) => b.logDate.localeCompare(a.logDate)).map((log) => (
                  <TableRow key={log.id} data-testid="daily-log-row">
                    <TableCell>{formatDate(log.logDate)}</TableCell>
                    <TableCell>{log.batch?.breed || '-'}</TableCell>
                    <TableCell className="text-right">{log.mortality}</TableCell>
                    <TableCell className="text-right">{log.averageWeightG ?? '-'}</TableCell>
                    <TableCell className="text-right">{log.waterConsumedL ?? '-'}</TableCell>
                    <TableCell className="text-right">
                      {log.feedConsumedKg ? (
                        <span title={log.feedProduct?.name}>{formatNumber(Number(log.feedConsumedKg), 3)}</span>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-center">
                      {log.medicineAdministered ? (
                        <span title={log.medicineProduct?.name ? `${log.medicineProduct.name} - ${log.medicineQuantity ?? ''}${log.medicineProduct.measurementUnit?.abbreviation ?? 'ml'}` : log.medicineNotes ?? ''}>
                          <Pill className="h-4 w-4 inline text-emerald-600" />
                        </span>
                      ) : (
                        <span className="text-muted-foreground">No</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {log.healthScore != null ? (
                        <span className={`font-semibold ${healthScoreColor(log.healthScore)}`}>
                          {log.healthScore}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => deleteMutation.mutate(log.id)}
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
    </div>
  );
}
