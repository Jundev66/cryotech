import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, type RegisterInput } from '@cryotech/shared-types';
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

export default function RegisterPage() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: '', email: '', password: '', confirmPassword: '' },
  });

  async function onSubmit(values: RegisterInput) {
    setError('');
    setLoading(true);
    try {
      const data = await authApi.register(values);
      localStorage.setItem('cryotech_access_token', data.accessToken);
      localStorage.setItem('cryotech_refresh_token', data.refreshToken);
      setUser(data.user);
      toast.success('Cuenta creada exitosamente');
      navigate('/onboarding');
    } catch (err: unknown) {
      const message = apiMessage(err, 'Error al registrarse');
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-border/50 shadow-xl">
      <CardContent className="p-8">
        <div className="mb-6 text-center lg:hidden">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Logo className="h-6 w-6 text-primary" />
          </div>
        </div>
        <div className="mb-6">
          <h2 className="font-display text-3xl font-extrabold tracking-tight">Crear cuenta</h2>
          <p className="mt-1 text-muted-foreground">Registrate para gestionar tu granja</p>
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
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre completo</FormLabel>
                  <FormControl>
                    <Input placeholder="Juan Perez" className="h-11" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
                    <Input type="password" placeholder="Minimo 6 caracteres" className="h-11" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirmar contrasena</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="Repite tu contrasena" className="h-11" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="h-11 w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Crear cuenta
            </Button>
          </form>
        </Form>
        <p className="mt-5 text-center text-sm text-muted-foreground">
          Ya tienes cuenta?{' '}
          <Link to="/login" className="font-medium text-primary hover:text-primary/80 transition-colors">
            Inicia sesion
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
