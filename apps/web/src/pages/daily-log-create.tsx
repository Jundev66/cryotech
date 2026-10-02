import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { dailyLogSchema, type DailyLogInput } from '@cryotech/shared-types';
import { dailyLogsApi } from '@/api/daily-logs.api';
import { batchesApi } from '@/api/batches.api';
import { productsApi } from '@/api/products.api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Loader2, ClipboardList, Activity, Wheat, Pill, Thermometer } from 'lucide-react';
import { apiMessage } from '@/lib/api-error';
import { toast } from 'sonner';

export default function DailyLogCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: batches } = useQuery({
    queryKey: ['batches'],
    queryFn: () => batchesApi.findAll(),
  });

  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: () => productsApi.findAll(),
  });

  const activeBatches = batches?.filter((b) => b.status === 'breeding' || b.status === 'for_sale') ?? [];

  const medicineProducts = products?.filter((p) => {
    const slug = p.category?.slug ?? '';
    return slug === 'vaccine' || slug === 'medicine' || slug === 'medicina' || slug === 'vacuna' || slug === 'supplement';
  }) ?? [];

  const feedProducts = products?.filter((p) => {
    const slug = p.category?.slug ?? '';
    return slug === 'feed' || slug === 'alimento';
  }) ?? [];

  const form = useForm<DailyLogInput>({
    resolver: zodResolver(dailyLogSchema),
    defaultValues: {
      batchId: '',
      logDate: new Date().toISOString().split('T')[0],
      mortality: 0,
      averageWeightG: undefined,
      waterConsumedL: undefined,
      feedConsumedKg: undefined,
      feedProductId: undefined,
      temperatureC: undefined,
      humidityPct: undefined,
      healthScore: 95,
      medicineAdministered: false,
      medicineProductId: undefined,
      medicineQuantity: undefined,
      medicineNotes: '',
      notes: '',
    },
  });

  const [hasMedicine, setHasMedicine] = useState(false);

  const createMutation = useMutation({
    mutationFn: (data: DailyLogInput) => dailyLogsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-logs'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      toast.success('Registro diario guardado exitosamente');
      navigate('/dashboard/daily-logs');
    },
    onError: (err: unknown) => {
      const message = apiMessage(err, 'Error al crear registro');
      toast.error(message);
    },
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" asChild className="h-9 w-9">
          <Link to="/dashboard/daily-logs">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Nuevo Registro Diario</h1>
          <p className="text-sm text-muted-foreground">Monitoreo de biometría, consumo de alimento, mortalidad y ambiente</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-6">
          {/* Lote y Fecha */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-primary" />
                Lote y Fecha del Control
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="batchId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lote de Aves *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Seleccionar lote activo..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {activeBatches.map((b) => (
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
                name="logDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de Registro *</FormLabel>
                    <FormControl>
                      <Input type="date" className="h-10" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Biometría y Consumos */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Métricas de Crecimiento y Consumo
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="mortality"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mortalidad del Día (aves) *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        className="h-10"
                        value={field.value ?? 0}
                        onChange={(e) => field.onChange(e.target.value === '' ? 0 : Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="averageWeightG"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Peso Promedio (gramos)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Ej: 1450"
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
                name="waterConsumedL"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Agua Consumida (Litros)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Ej: 450"
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
                name="feedConsumedKg"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5">
                      <Wheat className="h-3.5 w-3.5 text-primary" />
                      Alimento Consumido (kg)
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Ej: 280"
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
                name="feedProductId"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Tipo de Alimento (Descuenta Inventario)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ''}>
                      <FormControl>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Seleccionar alimento..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">-- Sin descontar producto --</SelectItem>
                        {feedProducts.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} (Stock: {p.currentStock} {p.measurementUnit?.abbreviation || 'kg'})
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

          {/* Ambiente y Clima */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Thermometer className="h-5 w-5 text-primary" />
                Variables Ambientales y Estado del Galpón
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="temperatureC"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Temperatura (°C)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.1"
                        placeholder="28.5"
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
                name="humidityPct"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Humedad Relativa (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.1"
                        placeholder="65"
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
                name="healthScore"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Puntuación de Salud (1-100)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        max="100"
                        placeholder="95"
                        className="h-10"
                        value={field.value ?? 95}
                        onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Medicación / Tratamientos */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Pill className="h-5 w-5 text-primary" />
                  Medicinas o Suplementos Administrados
                </CardTitle>
                <CardDescription>Opcional: registra vacunas, antibióticos o vitaminas aplicadas hoy</CardDescription>
              </div>
              <Button
                type="button"
                variant={hasMedicine ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  const next = !hasMedicine;
                  setHasMedicine(next);
                  form.setValue('medicineAdministered', next);
                }}
              >
                {hasMedicine ? 'Tratamiento Activo' : '+ Agregar Medicina'}
              </Button>
            </CardHeader>
            {hasMedicine && (
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="medicineProductId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Producto Veterinario</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ''}>
                        <FormControl>
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="Seleccionar vacuna o suplemento..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">-- Ninguno --</SelectItem>
                          {medicineProducts.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name} (Stock: {p.currentStock} {p.measurementUnit?.abbreviation || 'unid'})
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
                  name="medicineQuantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dosis / Cantidad Usada</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="Ej: 2.5"
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
                  name="medicineNotes"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Detalles de la Aplicación</FormLabel>
                      <FormControl>
                        <Input placeholder="Vía agua de bebida, aspersión, vacuna ocular..." className="h-10" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            )}
          </Card>

          {/* Notas Generales */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Observaciones del Día</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea placeholder="Comportamiento del lote, estado de la cama de cascarilla, ventilación..." rows={3} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="outline" type="button" onClick={() => navigate('/dashboard/daily-logs')}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createMutation.isPending} className="min-w-36">
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar Registro
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
