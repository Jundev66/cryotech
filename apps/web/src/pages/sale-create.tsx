import { Link, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { saleSchema, type SaleInput, SALE_TYPE_LABELS, formatNumber } from '@cryotech/shared-types';
import { salesApi } from '@/api/sales.api';
import { batchesApi } from '@/api/batches.api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClientCombobox } from '@/components/forms/client-combobox';
import { ArrowLeft, Loader2, DollarSign, ShoppingCart, Calendar } from 'lucide-react';
import { apiMessage } from '@/lib/api-error';
import { todayLocalIso } from '@/lib/dates';
import { toast } from 'sonner';

export default function SaleCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: batches } = useQuery({ queryKey: ['batches'], queryFn: () => batchesApi.findAll() });

  const sellBatches = batches?.filter((b) => b.status === 'for_sale' || b.status === 'breeding') ?? [];

  const form = useForm<SaleInput>({
    resolver: zodResolver(saleSchema),
    defaultValues: {
      batchId: '',
      clientId: undefined,
      saleType: 'live',
      quantity: 50,
      weightKg: 125,
      pricePerKg: 4.0,
      pricePerUnit: undefined,
      totalAmount: 500,
      dueDate: undefined,
      notes: '',
    },
  });

  const quantity = form.watch('quantity') || 0;
  const weightKg = form.watch('weightKg') || 0;
  const pricePerKg = form.watch('pricePerKg') || 0;
  const pricePerUnit = form.watch('pricePerUnit') || 0;
  const saleType = form.watch('saleType');

  // Cálculo dinámico de total
  const calculatedTotal = pricePerKg && weightKg
    ? Math.round(Number(weightKg) * Number(pricePerKg) * 100) / 100
    : pricePerUnit && quantity
      ? Math.round(Number(quantity) * Number(pricePerUnit) * 100) / 100
      : form.watch('totalAmount') || 0;

  const createMutation = useMutation({
    mutationFn: (data: SaleInput) =>
      salesApi.create({
        ...data,
        totalAmount: calculatedTotal || data.totalAmount,
        saleDate: todayLocalIso(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      toast.success('Venta registrada exitosamente');
      navigate('/dashboard/sales');
    },
    onError: (error) => toast.error(apiMessage(error, 'Error al registrar la venta')),
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" asChild className="h-9 w-9">
          <Link to="/dashboard/sales">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Registrar Nueva Venta</h1>
          <p className="text-sm text-muted-foreground">Despacho de aves vivas o beneficiadas a clientes</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-primary" />
                Lote de Origen y Cliente
              </CardTitle>
              <CardDescription>Selecciona el lote con stock y el destinatario comercial</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="batchId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lote de Origen *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-10" data-testid="sale-batch">
                            <SelectValue placeholder="Seleccionar lote disponible..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {sellBatches.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.code || b.breed} ({formatNumber(b.currentQuantity)} aves disponibles)
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
                  name="clientId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cliente</FormLabel>
                      <FormControl>
                        <ClientCombobox value={field.value} onChange={field.onChange} data-testid="sale-client" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="saleType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Modalidad de Venta *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-10" data-testid="sale-type">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(SALE_TYPE_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>
                            {v}
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
                <DollarSign className="h-5 w-5 text-primary" />
                Cantidades y Fijación de Precio
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cantidad de Aves *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          placeholder="50"
                          className="h-10"
                          data-testid="sale-quantity"
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
                  name="weightKg"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Peso Total (kg) *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="125.00"
                          className="h-10"
                          data-testid="sale-weight"
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="pricePerKg"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Precio por Kg ($ USD)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="4.00"
                          className="h-10"
                          data-testid="sale-price-kg"
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
                  name="pricePerUnit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>O Precio por Ave ($ USD)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="Opcional"
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

              {/* Total Banner */}
              <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div>
                  <span className="text-sm font-medium">Monto Total a Cobrar:</span>
                  <div className="text-xs text-muted-foreground">
                    {weightKg && pricePerKg ? `${weightKg} kg × $${pricePerKg}/kg` : 'Calculado automáticamente'}
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold text-primary font-display" data-testid="sale-total">
                  ${calculatedTotal.toFixed(2)} USD
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Crédito y Observaciones
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de Vencimiento (Si es a crédito)</FormLabel>
                    <FormControl>
                      <Input type="date" className="h-10" {...field} value={field.value ?? ''} />
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
                    <FormLabel>Notas / Comprobante</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Número de factura o entrega..." rows={2} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="outline" type="button" onClick={() => navigate('/dashboard/sales')}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createMutation.isPending} className="min-w-36" data-testid="submit-sale">
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar Venta
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
