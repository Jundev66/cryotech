import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
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
import { apiMessage } from '@/lib/api-error';
import { toast } from 'sonner';

export default function LoginPage() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: LoginInput) {
    setError('');
    setLoading(true);
    try {
      const data = await authApi.login(values);
      localStorage.setItem('cryotech_access_token', data.accessToken);
      localStorage.setItem('cryotech_refresh_token', data.refreshToken);
      setUser(data.user);
      toast.success('Bienvenido');
      navigate('/dashboard');
    } catch (err: unknown) {
      const message = apiMessage(err, 'Error al iniciar sesion');
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function onDemoSubmit() {
    setError('');
    setDemoLoading(true);
    try {
      const data = await authApi.createDemoSession();
      localStorage.setItem('cryotech_access_token', data.accessToken);
      localStorage.setItem('cryotech_refresh_token', data.refreshToken);
      if (data.company?.id) {
        localStorage.setItem('cryotech_company_id', data.company.id);
      }
      setUser(data.user);
      toast.success(`Entrando a ${data.company?.name || 'demostración'}`);
      navigate('/dashboard');
    } catch (err: unknown) {
      const message = apiMessage(err, 'Error al iniciar la demostración');
      setError(message);
    } finally {
      setDemoLoading(false);
    }
  }

  return (
    <Card className="border-border/50 shadow-xl">
      <CardContent className="p-8">
        {/* Logo — only visible on mobile (desktop has left panel) */}
        <div className="mb-6 text-center lg:hidden">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Logo className="h-6 w-6 text-primary" />
          </div>
        </div>
        <div className="mb-6">
          <h2 className="font-display text-3xl font-extrabold tracking-tight">Iniciar sesion</h2>
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
                  <FormLabel>Correo electronico</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="tu@correo.com" className="h-11" {...field} />
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
                  <FormLabel>Contrasena</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="******" className="h-11" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="h-11 w-full" disabled={loading || demoLoading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Iniciar sesion
            </Button>
          </form>
        </Form>

        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border/60" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">O prueba el sistema</span>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          className="h-11 w-full border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary font-medium transition-colors"
          onClick={onDemoSubmit}
          disabled={loading || demoLoading}
        >
          {demoLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4 text-primary" />
          )}
          Probar Demostración (Datos de Ejemplo)
        </Button>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          No tienes cuenta?{' '}
          <Link to="/register" className="font-medium text-primary hover:text-primary/80 transition-colors">
            Registrate
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
