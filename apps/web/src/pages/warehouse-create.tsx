import { Link, useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { warehouseSchema, type WarehouseInput } from '@cryotech/shared-types';
import { warehousesApi } from '@/api/warehouses.api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, Warehouse as WarehouseIcon, MapPin, Users } from 'lucide-react';
import { apiMessage } from '@/lib/api-error';
import { toast } from 'sonner';

export default function WarehouseCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const form = useForm<WarehouseInput>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: {
      name: '',
      capacity: undefined,
      location: '',
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: WarehouseInput) => warehousesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      toast.success('Galpón registrado exitosamente');
      navigate('/dashboard/warehouses');
    },
    onError: (error) => toast.error(apiMessage(error, 'Error al crear galpón')),
  });

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-12">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" asChild className="h-9 w-9">
          <Link to="/dashboard/warehouses">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Registrar Nuevo Galpón</h1>
          <p className="text-sm text-muted-foreground">Estructura física para alojamiento y crianza de aves</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <WarehouseIcon className="h-5 w-5 text-primary" />
                Características del Galpón
              </CardTitle>
              <CardDescription>Capacidad de aves y ubicación dentro de la granja</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del Galpón *</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej: Galpón 1 (Túnel Climatizado)" className="h-10" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="capacity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        Capacidad Máxima (aves)
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Ej: 5000"
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
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        Ubicación en Granja
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="Ej: Sector Norte - Fila A" className="h-10" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="outline" type="button" onClick={() => navigate('/dashboard/warehouses')}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createMutation.isPending} className="min-w-36">
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar Galpón
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
