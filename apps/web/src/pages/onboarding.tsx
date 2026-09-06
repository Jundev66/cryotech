import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { companySchema, warehouseSchema, type CompanyInput, type WarehouseInput } from '@cryotech/shared-types';
import { companiesApi } from '@/api/companies.api';
import { warehousesApi } from '@/api/warehouses.api';
import { useAuth } from '@/providers/auth-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Loader2, Building2, Warehouse } from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { toast } from 'sonner';
import { apiMessage } from '@/lib/api-error';

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  /**
   * Pick up where it was left.
   *
   * Step 1 creates the company and step 2 the warehouse. If the second one
   * fails or the tab is closed, the company already exists, and starting over
   * at step 1 would create an empty second company every time.
   */
  const { data: warehouses, isLoading: checking } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => warehousesApi.findAll(),
    enabled: Boolean(localStorage.getItem('cryotech_company_id')),
    retry: false,
  });

  useEffect(() => {
    if (warehouses && warehouses.length === 0) setStep(2);
  }, [warehouses]);

  const companyForm = useForm<CompanyInput>({
    resolver: zodResolver(companySchema),
    defaultValues: { name: '', phone: '', address: '' },
  });

  const warehouseForm = useForm<WarehouseInput>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: { name: '', capacity: undefined, location: '' },
  });

  async function onCompanySubmit(values: CompanyInput) {
    setLoading(true);
    try {
      const company = await companiesApi.create(values);
      localStorage.setItem('cryotech_company_id', company.id);
      setStep(2);
      toast.success('Empresa creada');
    } catch (error) {
      // The server's message, not an invented one: a short name or a taken
      // email is what the user has to read in order to fix it.
      toast.error(apiMessage(error, 'Error al crear la empresa'));
    } finally {
      setLoading(false);
    }
  }

  async function onWarehouseSubmit(values: WarehouseInput) {
    setLoading(true);
    try {
      await warehousesApi.create({ ...values, isMain: true });
      // The dashboard guard reads this same query to decide whether onboarding
      // finished; without invalidating it, it would arrive with an empty list
      // in cache and bounce straight back here.
      await queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      toast.success('Galpon creado. Todo listo!');
      navigate('/dashboard');
    } catch (error) {
      toast.error(apiMessage(error, 'Error al crear el galpon'));
    } finally {
      setLoading(false);
    }
  }

  if (!user || checking) return null;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[oklch(0.20_0.06_175)] via-background to-[oklch(0.25_0.06_75)] p-4">
      <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")', backgroundRepeat: 'repeat', backgroundSize: '256px 256px' }} />
      <div className="relative z-10 w-full max-w-md space-y-5 animate-page-enter">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
            <Logo className="h-7 w-7 text-primary" animate />
          </div>
          <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight">Bienvenido, {user.fullName || 'Usuario'}</h1>
          <p className="mt-1 text-muted-foreground">Configura tu empresa en 2 pasos</p>
        </div>
        <Progress value={step === 1 ? 50 : 100} className="h-2" />

        {step === 1 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                <CardTitle>Paso 1: Tu empresa</CardTitle>
              </div>
              <CardDescription>Informacion basica de tu empresa avicola</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...companyForm}>
                <form onSubmit={companyForm.handleSubmit(onCompanySubmit)} className="space-y-4">
                  <FormField
                    control={companyForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre de la empresa</FormLabel>
                        <FormControl><Input placeholder="Avicola Mi Granja" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={companyForm.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Telefono (opcional)</FormLabel>
                        <FormControl><Input placeholder="300 123 4567" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={companyForm.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Direccion (opcional)</FormLabel>
                        <FormControl><Input placeholder="Vereda El Campo, Municipio" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Continuar
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Warehouse className="h-5 w-5 text-primary" />
                <CardTitle>Paso 2: Primer galpon</CardTitle>
              </div>
              <CardDescription>Crea tu primer galpon para recibir lotes</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...warehouseForm}>
                <form onSubmit={warehouseForm.handleSubmit(onWarehouseSubmit)} className="space-y-4">
                  <FormField
                    control={warehouseForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre del galpon</FormLabel>
                        <FormControl><Input placeholder="Galpon 1" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={warehouseForm.control}
                    name="capacity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Capacidad (aves)</FormLabel>
                        <FormControl><Input type="number" placeholder="5000" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={warehouseForm.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ubicacion (opcional)</FormLabel>
                        <FormControl><Input placeholder="Zona norte" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Finalizar configuracion
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
