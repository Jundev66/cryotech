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
import { Loader2 } from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { apiMessage } from '@/lib/api-error';
import { toast } from 'sonner';

export default function LoginPage() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
            <Button type="submit" className="h-11 w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Iniciar sesion
            </Button>
          </form>
        </Form>
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
