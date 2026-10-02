import { Link, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { feedApi } from '@/api/feed.api';
import { productsApi } from '@/api/products.api';
import { batchesApi } from '@/api/batches.api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Loader2, Utensils, Wheat } from 'lucide-react';
import { apiMessage } from '@/lib/api-error';
import { todayLocalIso } from '@/lib/dates';
import { toast } from 'sonner';

const consumptionSchema = z.object({
  batchId: z.string().min(1, 'Seleccione un lote'),
  productId: z.string().min(1, 'Seleccione un producto'),
  consumptionDate: z.string().min(1, 'Ingrese la fecha'),
  quantityKg: z.coerce.number().positive('Debe ser mayor a 0'),
  notes: z.string().optional(),
});

type ConsumptionFormValues = z.infer<typeof consumptionSchema>;

export default function ConsumptionCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: allProducts } = useQuery({ queryKey: ['products'], queryFn: () => productsApi.findAll() });
  const { data: allBatches } = useQuery({ queryKey: ['batches'], queryFn: () => batchesApi.findAll() });

  const feedProducts = allProducts?.filter((p) => p.category?.slug === 'feed' || p.productType === 'consumable') ?? [];
  const activeBatches = allBatches?.filter((b) => b.status === 'breeding' || b.status === 'for_sale') ?? [];

  const form = useForm<ConsumptionFormValues>({
    resolver: zodResolver(consumptionSchema),
    defaultValues: {
      batchId: '',
      productId: '',
      consumptionDate: todayLocalIso(),
      quantityKg: 50,
      notes: '',
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: ConsumptionFormValues) => feedApi.createConsumption(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed-consumptions'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Consumo de alimento registrado exitosamente');
      navigate('/dashboard/consumptions');
    },
    onError: (error: unknown) =>
      toast.error(apiMessage(error, 'Error al registrar consumo')),
  });

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-12">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" asChild className="h-9 w-9">
          <Link to="/dashboard/consumptions">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Registrar Consumo de Alimento</h1>
          <p className="text-sm text-muted-foreground">Despacho de sacos o kg de alimento al galpón</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Utensils className="h-5 w-5 text-primary" />
                Destino y Producto
              </CardTitle>
              <CardDescription>Indica el lote receptor y el alimento suministrado</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="batchId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lote Destino *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Seleccionar lote..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {activeBatches.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.code || b.breed} ({b.currentQuantity} aves) - {b.warehouse?.name}
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
                    <FormLabel>Alimento / Insumo *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Seleccionar producto..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="quantityKg"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <Wheat className="h-3.5 w-3.5 text-primary" />
                        Cantidad Consumida (kg) *
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
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
                  name="consumptionDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha de Consumo *</FormLabel>
                      <FormControl>
                        <Input type="date" className="h-10" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observaciones</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Turno de la mañana, comederos automáticos..." rows={2} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="outline" type="button" onClick={() => navigate('/dashboard/consumptions')}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createMutation.isPending} className="min-w-36">
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar Consumo
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
