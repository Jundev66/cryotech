import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@cryotech/shared-types';
import { authApi } from '@/api/auth.api';
import { useAuth } from '@/providers/auth-provider';
import { Card, CardContent } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Sparkles } from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { DemoLeadModal, type LeadInfo } from '@/components/landing/DemoLeadModal';
import { apiMessage } from '@/lib/api-error';
import { toast } from 'sonner';

export default function LoginPage() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoLeadOpen, setDemoLeadOpen] = useState(false);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: LoginInput) {
    setError('');
    setLoading(true);
    try {
      localStorage.removeItem('cryotech_company_id');
      const data = await authApi.login(values);
      localStorage.setItem('cryotech_access_token', data.accessToken);
      localStorage.setItem('cryotech_refresh_token', data.refreshToken);
      setUser(data.user);
      toast.success('Bienvenido');
      navigate('/dashboard');
    } catch (err: unknown) {
      const message = apiMessage(err, 'Error al iniciar sesión');
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function onStartDemoWithLead(lead?: LeadInfo) {
    setError('');
    setDemoLoading(true);
    try {
      localStorage.removeItem('cryotech_access_token');
      localStorage.removeItem('cryotech_refresh_token');
      localStorage.removeItem('cryotech_company_id');

      const data = await authApi.createDemoSession();
      localStorage.setItem('cryotech_access_token', data.accessToken);
      localStorage.setItem('cryotech_refresh_token', data.refreshToken);
      if (data.company?.id) {
        localStorage.setItem('cryotech_company_id', data.company.id);
      }
      
      const userObj = {
        ...data.user,
        fullName: lead?.fullName && lead.fullName !== 'Productor Invitado' ? lead.fullName : data.user.fullName,
      };

      setUser(userObj);
      setDemoLeadOpen(false);
      toast.success(`¡Bienvenido! Entrando a tu granja de demostración...`);
      navigate('/dashboard');
    } catch (err: unknown) {
      const message = apiMessage(err, 'Error al iniciar la demostración');
      setError(message);
    } finally {
      setDemoLoading(false);
    }
  }

  return (
    <>
      <Card className="border-border/50 shadow-xl">
        <CardContent className="p-8">
          <div className="mb-6 text-center lg:hidden">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Logo className="h-6 w-6 text-primary" />
            </div>
          </div>
          <div className="mb-6">
            <h2 className="font-display text-3xl font-extrabold tracking-tight">Iniciar sesión</h2>
            <p className="mt-1 text-muted-foreground">Ingresa a tu cuenta de CryoTech</p>
          </div>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Correo electrónico</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="tu@correo.com" data-testid="login-email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contraseña</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Tu contraseña" data-testid="login-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" data-testid="login-submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Iniciar sesión
              </Button>
            </form>
          </Form>

          {/* Separador Modo Demo */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border/60" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground font-medium">o prueba sin cuenta</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary text-foreground font-semibold py-5 transition-all shadow-sm"
            onClick={() => setDemoLeadOpen(true)}
            disabled={demoLoading}
          >
            {demoLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4 text-primary" />
            )}
            {demoLoading ? 'Generando entorno demo...' : 'Entrar en Modo Demostración'}
          </Button>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Acceso exclusivo para personal autorizado o evaluación en modo demostración.
          </p>
        </CardContent>
      </Card>

      <DemoLeadModal
        isOpen={demoLeadOpen}
        onClose={() => setDemoLeadOpen(false)}
        onSubmit={onStartDemoWithLead}
        isLoading={demoLoading}
      />
    </>
  );
}
