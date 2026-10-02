import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { productEntrySchema, type ProductEntryInput } from '@cryotech/shared-types';
import { entriesApi } from '@/api/entries.api';
import { productsApi } from '@/api/products.api';
import { batchesApi } from '@/api/batches.api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Loader2, Truck, PackagePlus, DollarSign } from 'lucide-react';
import { apiMessage } from '@/lib/api-error';
import { toast } from 'sonner';

export default function EntryCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: products } = useQuery({ queryKey: ['products'], queryFn: () => productsApi.findAll() });
  const { data: batches } = useQuery({ queryKey: ['batches'], queryFn: () => batchesApi.findAll() });

  const activeBatches = batches?.filter((b) => b.status === 'breeding' || b.status === 'for_sale') ?? [];

  const form = useForm<ProductEntryInput>({
    resolver: zodResolver(productEntrySchema),
    defaultValues: {
      productId: '',
      batchId: undefined,
      quantity: 10,
      totalCost: 250,
      deliveryCost: 20,
      entryDate: new Date().toISOString().split('T')[0],
      notes: '',
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: ProductEntryInput) => entriesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Entrada de producto registrada exitosamente');
      navigate('/dashboard/entries');
    },
    onError: (error) => toast.error(apiMessage(error, 'Error al registrar entrada')),
  });

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-12">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" asChild className="h-9 w-9">
          <Link to="/dashboard/entries">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Registrar Entrada de Insumo</h1>
          <p className="text-sm text-muted-foreground">Recepción de compras de alimento, medicinas, vacunas o suministros</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <PackagePlus className="h-5 w-5 text-primary" />
                Producto y Destino
              </CardTitle>
              <CardDescription>Insumo comprado y lote asociado (opcional)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="productId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Producto del Catálogo *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Seleccionar producto a ingresar..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {products?.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} ({p.measurementUnit?.abbreviation || 'unidad'}) - Stock: {p.currentStock}
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
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cantidad Comprada *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          min="0.01"
                          placeholder="Ej: 50"
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
                  name="batchId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Asignar Directo a Lote (Opcional)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ''}>
                        <FormControl>
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="-- Almacén General --" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">-- Almacén General (Sin lote) --</SelectItem>
                          {activeBatches.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.code || b.breed} ({b.warehouse?.name || 'Galpón'})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-primary" />
                Costos y Fecha de Recepción
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="totalCost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Costo Total del Insumo ($ USD) *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="250.00"
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
                  name="deliveryCost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                        Flete / Envío ($ USD)
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
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
                  name="entryDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha de Entrada *</FormLabel>
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
                    <FormLabel>Observaciones / Proveedor</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Proveedor, número de nota de entrega o factura..." rows={2} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="outline" type="button" onClick={() => navigate('/dashboard/entries')}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createMutation.isPending} className="min-w-36">
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar Entrada
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
