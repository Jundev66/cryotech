import { Link, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { batchWithEntriesSchema, BREEDS, type BatchWithEntriesInput } from '@cryotech/shared-types';
import { batchesApi } from '@/api/batches.api';
import { warehousesApi } from '@/api/warehouses.api';
import { productsApi } from '@/api/products.api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Loader2, Plus, Trash2, Layers, Warehouse, Sparkles } from 'lucide-react';
import { apiMessage } from '@/lib/api-error';
import { toast } from 'sonner';

export default function BatchCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => warehousesApi.findAll(),
  });

  const { data: allProducts } = useQuery({
    queryKey: ['products'],
    queryFn: () => productsApi.findAll(),
  });

  const form = useForm<BatchWithEntriesInput>({
    resolver: zodResolver(batchWithEntriesSchema),
    defaultValues: {
      warehouseId: '',
      breed: 'Cobb 500',
      startDate: new Date().toISOString().split('T')[0],
      initialQuantity: 5000,
      purchasePricePerUnit: 0.65,
      notes: '',
      entryLines: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'entryLines',
  });

  const createMutation = useMutation({
    mutationFn: (data: BatchWithEntriesInput) =>
      batchesApi.create({ ...data, currentQuantity: data.initialQuantity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      toast.success('Lote creado exitosamente');
      navigate('/dashboard/batches');
    },
    onError: (error) => toast.error(apiMessage(error, 'Error al crear el lote')),
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" asChild className="h-9 w-9">
          <Link to="/dashboard/batches">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Iniciar Nuevo Lote</h1>
          <p className="text-sm text-muted-foreground">Planificación e inicio de ciclo de cría de aves</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-6">
          {/* Galpón y Raza */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Warehouse className="h-5 w-5 text-primary" />
                Ubicación y Genética
              </CardTitle>
              <CardDescription>Galpón receptor y línea genética de las aves</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="warehouseId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Galpón de Alojamiento *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-10" data-testid="batch-warehouse">
                          <SelectValue placeholder="Seleccionar galpón..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {warehouses?.map((w) => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.name} {w.capacity ? `(Capacidad: ${w.capacity} aves)` : ''}
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
                name="breed"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Línea / Raza *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-10" data-testid="batch-breed">
                          <SelectValue placeholder="Seleccionar raza..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {BREEDS.map((b) => (
                          <SelectItem key={b} value={b}>
                            {b}
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

          {/* Datos del Ciclo */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Layers className="h-5 w-5 text-primary" />
                Parámetros Iniciales del Lote
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="initialQuantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cantidad de Pollitos *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        placeholder="5000"
                        className="h-10"
                        data-testid="batch-quantity"
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
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de Encasetamiento *</FormLabel>
                    <FormControl>
                      <Input type="date" className="h-10" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="purchasePricePerUnit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Costo por Pollito ($ USD)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.65"
                        className="h-10"
                        data-testid="batch-price"
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
                  <FormItem className="sm:col-span-3">
                    <FormLabel>Observaciones / Proveedor Incubadora</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Incubadora de origen, lote de huevo fértil..." rows={2} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Insumos Iniciales */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Insumos Iniciales al Encasetar (Opcional)
                </CardTitle>
                <CardDescription>Carga alimento inicial o vacunas administradas el primer día</CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ productId: '', quantity: 1, costPerUnit: undefined, notes: '' })}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Agregar Insumo
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {fields.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">
                  No se han agregado insumos iniciales para este lote.
                </p>
              ) : (
                fields.map((field, index) => (
                  <div key={field.id} className="flex items-center gap-3 rounded-lg border p-3 bg-muted/20">
                    <FormField
                      control={form.control}
                      name={`entryLines.${index}.productId`}
                      render={({ field: f }) => (
                        <FormItem className="flex-1">
                          <Select onValueChange={f.onChange} value={f.value}>
                            <FormControl>
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Seleccionar producto..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {allProducts?.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name} ({p.measurementUnit?.abbreviation ?? ''})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`entryLines.${index}.quantity`}
                      render={({ field: f }) => (
                        <FormItem className="w-28">
                          <FormControl>
                            <Input
                              type="number"
                              step="0.1"
                              placeholder="Cantidad"
                              className="h-9"
                              value={f.value ?? ''}
                              onChange={(e) => f.onChange(e.target.value === '' ? 0 : Number(e.target.value))}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`entryLines.${index}.costPerUnit`}
                      render={({ field: f }) => (
                        <FormItem className="w-28">
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="Costo/u ($)"
                              className="h-9"
                              value={f.value ?? ''}
                              onChange={(e) => f.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={() => remove(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="outline" type="button" onClick={() => navigate('/dashboard/batches')}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createMutation.isPending} className="min-w-36" data-testid="submit-batch">
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Crear Lote
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
