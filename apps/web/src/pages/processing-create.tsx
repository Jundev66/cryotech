import { Link, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { processingSchema, type ProcessingInput } from '@cryotech/shared-types';
import { processingApi } from '@/api/processing.api';
import { batchesApi } from '@/api/batches.api';
import { productsApi } from '@/api/products.api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Loader2, Scissors, Scale, DollarSign } from 'lucide-react';
import { apiMessage } from '@/lib/api-error';
import { formatDate } from '@cryotech/shared-types';
import { toast } from 'sonner';

export default function ProcessingCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: allBatches } = useQuery({ queryKey: ['batches'], queryFn: () => batchesApi.findAll() });
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: () => productsApi.findAll() });

  const forSaleBatches = allBatches?.filter((b) => b.status === 'for_sale' || b.status === 'breeding') ?? [];

  const form = useForm<ProcessingInput>({
    resolver: zodResolver(processingSchema),
    defaultValues: {
      batchId: '',
      quantity: 100,
      liveWeightKg: 250,
      processedWeightKg: 187.5,
      costPerBird: 0.15,
      costPerKg: undefined,
      totalCost: 15,
      productId: undefined,
      notes: '',
    },
  });

  const quantity = form.watch('quantity') || 0;
  const liveWeight = form.watch('liveWeightKg') || 0;
  const processedWeight = form.watch('processedWeightKg') || 0;
  const costPerBird = form.watch('costPerBird') || 0;

  const yieldPercent = liveWeight > 0 && processedWeight > 0
    ? Math.round((Number(processedWeight) / Number(liveWeight)) * 1000) / 10
    : 0;

  const calculatedCost = Math.round(Number(quantity) * Number(costPerBird) * 100) / 100;

  const createMutation = useMutation({
    mutationFn: (data: ProcessingInput) =>
      processingApi.create({
        ...data,
        totalCost: calculatedCost || data.totalCost,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processing'] });
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Beneficio / Procesamiento registrado exitosamente');
      navigate('/dashboard/processing');
    },
    onError: (error) => toast.error(apiMessage(error, 'Error al registrar procesamiento')),
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" asChild className="h-9 w-9">
          <Link to="/dashboard/processing">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Nuevo Beneficio de Aves</h1>
          <p className="text-sm text-muted-foreground">Sacrificio, faenado y rendimiento en canal refrigerada</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Scissors className="h-5 w-5 text-primary" />
                Lote y Destino en Inventario
              </CardTitle>
              <CardDescription>Selecciona las aves que van a matadero y el producto procesado resultante</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="batchId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lote de Origen *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Seleccionar lote..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {forSaleBatches.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.code || b.breed} ({b.currentQuantity} aves vivas) - {b.warehouse?.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="productId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Producto en Almacén (Opcional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ''}>
                      <FormControl>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="-- Sin ingresar a producto --" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">-- Sin producto en catálogo --</SelectItem>
                        {products?.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} ({p.measurementUnit?.abbreviation || 'unid'})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Scale className="h-5 w-5 text-primary" />
                Pesaje y Rendimiento en Canal
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Aves Beneficiadas *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          className="h-10"
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(e.target.value === '' ? '' : Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="liveWeightKg"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Peso Vivo Total (kg)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="Ej: 250.0"
                          className="h-10"
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="processedWeightKg"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Peso en Canal (kg)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="Ej: 187.5"
                          className="h-10"
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Banner Rendimiento */}
              <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div>
                  <span className="text-sm font-medium">Rendimiento en Canal Calculado:</span>
                  <div className="text-xs text-muted-foreground">
                    (Peso Canal {processedWeight}kg ÷ Peso Vivo {liveWeight}kg) × 100
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold text-primary font-display">
                  {yieldPercent > 0 ? `${yieldPercent}%` : '0%'}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-primary" />
                Costos de Maquila / Matadero
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="costPerBird"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Costo por Ave ($ USD)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Ej: 0.15"
                        className="h-10"
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas / Matadero</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Empresa de maquila, lote de canal..." rows={2} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="outline" type="button" onClick={() => navigate('/dashboard/processing')}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createMutation.isPending} className="min-w-36">
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar Beneficio
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
